use std::sync::atomic::{AtomicUsize, Ordering};
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    webview::{NewWindowFeatures, NewWindowResponse, PageLoadEvent},
    AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};

#[cfg(target_os = "macos")]
extern "C" {
    fn endfield_install_pointer_lock(webview: *mut std::ffi::c_void);
    fn endfield_keep_running_when_covered(webview: *mut std::ffi::c_void);
    fn endfield_configure_webrtc(webview: *mut std::ffi::c_void);
    fn endfield_lock_viewport(webview: *mut std::ffi::c_void);
    fn endfield_install_engine(webview: *mut std::ffi::c_void, source: *const std::ffi::c_char);
    fn endfield_engine_command(webview: *mut std::ffi::c_void, command: *const std::ffi::c_char);
    #[cfg(debug_assertions)]
    fn endfield_dev_eval(
        webview: *mut std::ffi::c_void,
        script: *const std::ffi::c_char,
        output_path: *const std::ffi::c_char,
    );
}

// Debug builds only: scripts dropped into <app data>/dev-inbox/NAME.js run in the game
// page as an async function body; the result lands in <app data>/dev-outbox/NAME.{json,png}.
#[cfg(all(target_os = "macos", debug_assertions))]
fn spawn_dev_inbox(app: AppHandle) -> tauri::Result<()> {
    let base = app.path().app_data_dir()?;
    let (inbox, outbox) = (base.join("dev-inbox"), base.join("dev-outbox"));
    std::fs::create_dir_all(&inbox)?;
    std::fs::create_dir_all(&outbox)?;
    eprintln!("dev inbox={}", inbox.display());
    std::thread::spawn(move || loop {
        let mut scripts: Vec<_> = std::fs::read_dir(&inbox)
            .map(|entries| entries.flatten().map(|entry| entry.path()).collect())
            .unwrap_or_default();
        scripts.retain(|path| path.extension().is_some_and(|ext| ext == "js"));
        scripts.sort();
        for path in scripts {
            let script = std::fs::read_to_string(&path);
            let _ = std::fs::remove_file(&path);
            let (Ok(script), Some(stem)) = (script, path.file_stem()) else { continue };
            let output = outbox.join(stem);
            let (Ok(script), Ok(output)) = (
                std::ffi::CString::new(script),
                std::ffi::CString::new(output.to_string_lossy().as_bytes()),
            ) else { continue };
            if let Some(window) = app.get_webview_window("game") {
                let _ = window.with_webview(move |webview| unsafe {
                    endfield_dev_eval(webview.inner(), script.as_ptr(), output.as_ptr());
                });
            }
        }
        std::thread::sleep(std::time::Duration::from_millis(150));
    });
    Ok(())
}

const CLOUD_URL: &str = "https://endfield.hypergryph.com/cloud";
static POPUP_ID: AtomicUsize = AtomicUsize::new(1);

// 每日全部, in Max's order (GOAL.md): 总控事项 brings in the day's clues before they
// are exchanged, the 信用 earners and gifts run before 信用点购物 spends it, 据点交易
// earns the 调度券 that 弹性物资囤货 spends, and 日常任务 comes last to claim the
// activity the others earned.
const DAILY_TASKS: &[&str] = &[
    "dijiang_collect",
    "clue_exchange",
    "visit_friends",
    "operator_gifts",
    "credit_shop",
    "outpost_trading",
    "stockpile",
    "prod_manual",
    "mail_claim",
    "daily_tasks",
];

// Tasks offered in the 自动化 menu: (engine task id, menu title).
const ENGINE_MENU_TASKS: &[(&str, &str)] = &[
    ("selftest", "运行：引擎自检（设置往返）"),
    ("dijiang_collect", "运行：基建 · 总控事项（产物、线索）"),
    ("clue_exchange", "运行：会客室 · 线索赠予与交流"),
    ("visit_friends", "运行：拜访好友 · 生产助力与情报交流"),
    ("operator_gifts", "运行：赠送干员礼物"),
    ("credit_shop", "运行：信用点购物"),
    ("daily_tasks", "运行：日常任务 · 领取"),
    ("mail_claim", "运行：邮件 · 全部收取"),
    ("prod_manual", "运行：简制手册 · 领取"),
    ("outpost_trading", "运行：据点交易"),
    ("stockpile", "运行：弹性物资囤货"),
];

// The automation engine (native/engine/), bundled with its templates by build.rs.
#[cfg(target_os = "macos")]
const ENGINE_SOURCE: &str = include_str!(concat!(env!("OUT_DIR"), "/engine.js"));

// Run a command in the engine's content world (the engine is injected first if needed).
#[cfg(target_os = "macos")]
fn engine_command(window: &WebviewWindow, command: &str) -> tauri::Result<()> {
    let command = std::ffi::CString::new(command).expect("engine command has no NUL");
    window.with_webview(move |webview| unsafe {
        endfield_engine_command(webview.inner(), command.as_ptr());
    })
}

// Only record the origin: authentication query strings and fragments stay out of logs.
fn log_navigation(event: &str, label: &str, url: &tauri::Url) {
    eprintln!("{event} window={label} origin={}", url.origin().ascii_serialization());
}

fn create_window(
    app: &AppHandle,
    label: &str,
    url: tauri::Url,
    features: Option<NewWindowFeatures>,
) -> tauri::Result<WebviewWindow> {
    let popup_app = app.clone();
    let mut builder = WebviewWindowBuilder::new(app, label, WebviewUrl::External(url))
        .title("云终末地 · Tauri 原型")
        .inner_size(1280.0, 720.0)
        .disable_drag_drop_handler()
        .on_page_load(|window, payload| {
            let event = match payload.event() {
                PageLoadEvent::Started => "page_started",
                PageLoadEvent::Finished => "page_finished",
            };
            log_navigation(event, window.label(), payload.url());
            #[cfg(target_os = "macos")]
            if window.label() == "game" && matches!(payload.event(), PageLoadEvent::Finished) {
                if let Err(error) = engine_command(&window, "void 0") {
                    eprintln!("engine_inject_failed: {error}");
                }
            }
        })
        .on_new_window(move |url, features| {
            let id = POPUP_ID.fetch_add(1, Ordering::Relaxed);
            let label = format!("popup-{id}");
            log_navigation("popup_requested", &label, &url);
            // Preserve WKWebView's supplied configuration and opener for login popups.
            match create_window(
                &popup_app,
                &label,
                "about:blank".parse().expect("valid blank URL"),
                Some(features),
            ) {
                Ok(window) => NewWindowResponse::Create { window },
                Err(error) => {
                    eprintln!("popup_failed: {error}");
                    NewWindowResponse::Deny
                }
            }
        });
    if label == "game" {
        builder = builder.initialization_script(include_str!("../native/visibility.js"))
            .initialization_script(include_str!("../native/diagnostics.js"))
            .initialization_script(include_str!("../native/cloud_input.js"));
    }
    if let Some(features) = features {
        builder = builder.window_features(features);
    } else {
        builder = builder.center();
    }
    let window = builder.build()?;
    #[cfg(target_os = "macos")]
    if label == "game" {
        window.with_webview(|webview| unsafe {
            // Tauri invokes this closure on WKWebView's owning thread.
            endfield_install_pointer_lock(webview.inner());
            endfield_keep_running_when_covered(webview.inner());
            endfield_configure_webrtc(webview.inner());
            endfield_lock_viewport(webview.inner());
            let source = std::ffi::CString::new(ENGINE_SOURCE).expect("engine source has no NUL");
            endfield_install_engine(webview.inner(), source.as_ptr());
        })?;
    }
    Ok(window)
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            eprintln!("prototype_started version=0.1.0 engine=WKWebView");
            let menu = Menu::default(app.handle())?;
            let reload = MenuItem::with_id(app, "reload", "重新加载", true, Some("CmdOrCtrl+R"))?;
            let home = MenuItem::with_id(app, "home", "返回云游戏首页", true, None::<&str>)?;
            let fullscreen = MenuItem::with_id(
                app,
                "fullscreen",
                "切换全屏",
                true,
                Some("Ctrl+Cmd+F"),
            )?;
            let sensitivity_1 = MenuItem::with_id(app, "sensitivity-1", "鼠标灵敏度 1×", true, None::<&str>)?;
            let sensitivity_2 = MenuItem::with_id(app, "sensitivity-2", "鼠标灵敏度 2×", true, None::<&str>)?;
            let sensitivity_4 = MenuItem::with_id(app, "sensitivity-4", "鼠标灵敏度 4×", true, None::<&str>)?;
            let sensitivity_8 = MenuItem::with_id(app, "sensitivity-8", "鼠标灵敏度 8×（默认）", true, None::<&str>)?;
            let sensitivity_16 = MenuItem::with_id(app, "sensitivity-16", "鼠标灵敏度 16×", true, None::<&str>)?;
            menu.append(&Submenu::with_items(
                app, "游戏", true,
                &[&reload, &home, &fullscreen, &sensitivity_1, &sensitivity_2, &sensitivity_4, &sensitivity_8, &sensitivity_16],
            )?)?;
            let automation = Submenu::new(app, "自动化", true)?;
            automation.append(&MenuItem::with_id(app, "engine-run-daily", "运行：每日全部", true, None::<&str>)?)?;
            automation.append(&PredefinedMenuItem::separator(app)?)?;
            for (task, title) in ENGINE_MENU_TASKS {
                automation.append(&MenuItem::with_id(app, format!("engine-run:{task}"), *title, true, None::<&str>)?)?;
            }
            automation.append(&MenuItem::with_id(app, "engine-stop", "停止", true, Some("CmdOrCtrl+Shift+."))?)?;
            menu.append(&automation)?;
            app.set_menu(menu)?;
            create_window(app.handle(), "game", CLOUD_URL.parse()?, None)?;
            #[cfg(all(target_os = "macos", debug_assertions))]
            spawn_dev_inbox(app.handle().clone())?;
            Ok(())
        })
        .on_menu_event(|app, event| {
            let windows = app.webview_windows();
            let current = windows
                .values()
                .find(|window| window.is_focused().unwrap_or(false))
                .or_else(|| windows.get("game"));
            let Some(window) = current else { return };
            let result = match event.id().as_ref() {
                "sensitivity-1" | "sensitivity-2" | "sensitivity-4" | "sensitivity-8" | "sensitivity-16" => {
                    let value = event.id().as_ref().trim_start_matches("sensitivity-");
                    if let Some(game) = windows.get("game") {
                        game.eval(format!("window.__endfieldSetMouseSensitivity?.({value})"))
                    } else {
                        Ok(())
                    }
                }
                #[cfg(target_os = "macos")]
                id if id == "engine-stop" || id == "engine-run-daily" || id.starts_with("engine-run:") => {
                    // Task ids come from DAILY_TASKS and ENGINE_MENU_TASKS, never from the page.
                    let command = if id == "engine-run-daily" {
                        // Starts the cloud session when none is playing, and exits only that one.
                        format!("window.__engine.run({DAILY_TASKS:?}, {{ session: 'auto' }})")
                    } else {
                        match id.strip_prefix("engine-run:") {
                            Some(task) => format!("window.__engine.run([{task:?}])"),
                            None => "window.__engine.stop('stopped_by_menu')".to_string(),
                        }
                    };
                    match windows.get("game") {
                        Some(game) => engine_command(game, &command),
                        None => Ok(()),
                    }
                }
                "reload" => window.reload(),
                "home" => window.navigate(CLOUD_URL.parse().expect("valid cloud URL")),
                "fullscreen" => window
                    .is_fullscreen()
                    .and_then(|fullscreen| window.set_fullscreen(!fullscreen)),
                _ => return,
            };
            if let Err(error) = result {
                eprintln!("menu_action_failed: {error}");
            }
        })
        .run(tauri::generate_context!())
        .expect("failed to run cloud prototype");
}
