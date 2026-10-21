use std::sync::atomic::{AtomicUsize, Ordering};
use tauri::{
    menu::{Menu, MenuItem, Submenu},
    webview::{NewWindowFeatures, NewWindowResponse, PageLoadEvent},
    AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};

#[cfg(target_os = "macos")]
extern "C" {
    fn endfield_install_pointer_lock(webview: *mut std::ffi::c_void);
    fn endfield_keep_running_when_covered(webview: *mut std::ffi::c_void);
    fn endfield_configure_webrtc(webview: *mut std::ffi::c_void);
    fn endfield_automation_action(webview: *mut std::ffi::c_void, action: i32);
}

const CLOUD_URL: &str = "https://endfield.hypergryph.com/cloud";
static POPUP_ID: AtomicUsize = AtomicUsize::new(1);

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
        .inner_size(1280.0, 800.0)
        .min_inner_size(960.0, 600.0)
        .disable_drag_drop_handler()
        .on_page_load(|window, payload| {
            let event = match payload.event() {
                PageLoadEvent::Started => "page_started",
                PageLoadEvent::Finished => "page_finished",
            };
            log_navigation(event, window.label(), payload.url());
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
        builder = builder.initialization_script(include_str!("../native/diagnostics.js"))
            .initialization_script(include_str!("../native/cloud_input.js"))
            .initialization_script(include_str!("../native/automation.js"));
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
            let capture = MenuItem::with_id(app, "automation-capture", "读取游戏画面（3 秒后）", true, None::<&str>)?;
            let run = MenuItem::with_id(app, "automation-run", "验证设置往返", true, None::<&str>)?;
            let stop = MenuItem::with_id(app, "automation-stop", "停止验证", true, Some("CmdOrCtrl+Shift+."))?;
            menu.append(&Submenu::with_items(app, "自动化", true, &[&capture, &run, &stop])?)?;
            app.set_menu(menu)?;
            create_window(app.handle(), "game", CLOUD_URL.parse()?, None)?;
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
                "automation-capture" | "automation-run" | "automation-stop" => {
                    let action = match event.id().as_ref() { "automation-capture" => 0, "automation-run" => 1, _ => 2 };
                    #[cfg(target_os = "macos")]
                    if let Some(game) = windows.get("game") {
                        game.with_webview(move |webview| unsafe { endfield_automation_action(webview.inner(), action); })
                    } else { Ok(()) }
                    #[cfg(not(target_os = "macos"))]
                    { let _ = action; Ok(()) }
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
