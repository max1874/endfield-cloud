//! 云终末地设置 (App menu → 设置…, Cmd+,): a local page (frontend/settings.html) over the
//! app's settings file. Every change, from the page or a menu, goes through `set`, which
//! applies it, saves it and refreshes an open page.
use std::{ffi::{c_char, c_void, CStr, CString}, path::PathBuf, sync::{mpsc, Mutex, OnceLock}};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{menu::CheckMenuItem, AppHandle, Manager, Webview, WebviewUrl, WebviewWindowBuilder};

use crate::{engine_command, update, DAILY_TASKS, ENGINE_MENU_TASKS};

extern "C" {
    fn endfield_viewport_apply(width: f64) -> bool;
    fn endfield_viewport_set_fullscreen(on: bool);
    fn endfield_viewport_state() -> *mut c_char;
    fn endfield_set_muted(webview: *mut c_void, muted: bool) -> std::ffi::c_ulong;
    fn endfield_assist_key_tail(out: *mut c_char);
    fn endfield_assist_clear_key();
    fn endfield_assist_save_key(key: *const c_char, context: *mut c_void, done: extern "C" fn(*mut c_void, *const c_char));
    fn free(pointer: *mut c_void);
}

pub const SENSITIVITIES: [u32; 5] = [1, 2, 4, 8, 16];

#[derive(Serialize, Deserialize, Clone)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    pub window_width: f64,
    /// Restored at launch; any control that changes full screen updates it.
    pub fullscreen: bool,
    pub muted: bool,
    pub sensitivity: u32,
    /// The tasks 每日全部 runs; always run in DAILY_TASKS order.
    pub daily: Vec<String>,
}

impl Default for Settings {
    fn default() -> Self {
        Self { window_width: 1280.0, fullscreen: false, muted: false, sensitivity: 8, daily: DAILY_TASKS.iter().map(|t| t.to_string()).collect() }
    }
}

static APP: OnceLock<AppHandle> = OnceLock::new();

struct Store {
    path: PathBuf,
    settings: Mutex<Settings>,
}

pub fn load(app: &AppHandle) -> tauri::Result<()> {
    let path = app.path().app_data_dir()?.join("settings.json");
    let settings = std::fs::read(&path).ok().and_then(|bytes| serde_json::from_slice(&bytes).ok()).unwrap_or_default();
    app.manage(Store { path, settings: Mutex::new(settings) });
    let _ = APP.set(app.clone());
    Ok(())
}

pub fn get(app: &AppHandle) -> Settings {
    app.state::<Store>().settings.lock().unwrap().clone()
}

/// The 每日全部 tasks in run order.
pub fn daily(app: &AppHandle) -> Vec<&'static str> {
    let chosen = get(app).daily;
    DAILY_TASKS.iter().copied().filter(|task| chosen.iter().any(|c| c == task)).collect()
}

// Run `f` on the main thread, where AppKit and WebKit live, and wait for its result.
// Only for callers off the main thread (async commands).
fn on_main<T: Send + 'static>(app: &AppHandle, f: impl FnOnce() -> T + Send + 'static) -> Result<T, String> {
    let (tx, rx) = mpsc::channel();
    app.run_on_main_thread(move || { let _ = tx.send(f()); }).map_err(|e| e.to_string())?;
    rx.recv().map_err(|e| e.to_string())
}

pub fn apply_muted(app: &AppHandle, muted: bool) {
    let _ = app.state::<CheckMenuItem<tauri::Wry>>().set_checked(muted);
    if let Some(game) = app.get_webview_window("game") {
        let _ = game.with_webview(move |webview| unsafe { endfield_set_muted(webview.inner(), muted); });
    }
}

pub fn apply_sensitivity(app: &AppHandle) {
    if let Some(game) = app.get_webview_window("game") {
        let _ = game.eval(format!("window.__endfieldSetMouseSensitivity?.({})", get(app).sensitivity));
    }
}

/// Validate, apply and save one setting; called off the main thread.
pub fn set(app: &AppHandle, key: &str, value: &Value) -> Result<(), String> {
    let mut next = get(app);
    match key {
        "windowWidth" => {
            let width = value.as_f64().ok_or("bad_width")?;
            if !on_main(app, move || unsafe { endfield_viewport_apply(width) })? { return Err("width_unavailable".into()); }
            next.window_width = width;
        }
        "fullscreen" => {
            // Saved by endfield_fullscreen_changed once the window has changed.
            let on = value.as_bool().ok_or("bad_fullscreen")?;
            on_main(app, move || apply_fullscreen(on))?;
            return Ok(());
        }
        "muted" => {
            next.muted = value.as_bool().ok_or("bad_muted")?;
            let (app2, muted) = (app.clone(), next.muted);
            on_main(app, move || apply_muted(&app2, muted))?;
        }
        "sensitivity" => {
            let value = value.as_u64().filter(|v| SENSITIVITIES.contains(&(*v as u32))).ok_or("bad_sensitivity")?;
            next.sensitivity = value as u32;
        }
        "daily" => {
            let tasks: Vec<String> = serde_json::from_value(value.clone()).map_err(|_| "bad_daily")?;
            if tasks.is_empty() || tasks.iter().any(|t| !DAILY_TASKS.contains(&t.as_str())) { return Err("bad_daily".into()); }
            next.daily = tasks;
        }
        _ => return Err("unknown_setting".into()),
    }
    commit(app, next);
    if key == "sensitivity" { apply_sensitivity(app); }
    Ok(())
}

/// Enter or leave full screen now; main thread only.
pub fn apply_fullscreen(on: bool) {
    unsafe { endfield_viewport_set_fullscreen(on) }
}

#[no_mangle]
pub extern "C" fn endfield_fullscreen_changed(fullscreen: bool) {
    let Some(app) = APP.get() else { return };
    let mut next = get(app);
    next.fullscreen = fullscreen;
    commit(app, next);
}

fn commit(app: &AppHandle, next: Settings) {
    let store = app.state::<Store>();
    *store.settings.lock().unwrap() = next.clone();
    let saved = std::fs::create_dir_all(store.path.parent().unwrap())
        .and_then(|()| std::fs::write(&store.path, serde_json::to_vec_pretty(&next).unwrap()));
    if let Err(error) = saved { eprintln!("settings save_failed {error}"); }
    refresh(app);
}

// Tell an open Settings page that something changed elsewhere (a menu, an update check).
pub fn refresh(app: &AppHandle) {
    if let Some(page) = app.get_webview_window("settings") {
        let _ = page.eval("window.refresh?.()");
    }
}

pub fn open(app: &AppHandle, pane: &str, focus: bool) {
    if let Some(page) = app.get_webview_window("settings") {
        let _ = page.eval(format!("window.showPane?.({pane:?})"));
        if focus { let _ = page.set_focus(); }
        return;
    }
    let built = WebviewWindowBuilder::new(app, "settings", WebviewUrl::App(format!("settings.html#{pane}").into()))
        .title("云终末地设置")
        .inner_size(860.0, 640.0)
        .resizable(false)
        .minimizable(false)
        .maximizable(false)
        .title_bar_style(tauri::TitleBarStyle::Overlay)
        .hidden_title(true)
        .background_color(tauri::window::Color(0xff, 0xff, 0xff, 0xff))
        .center()
        .focused(focus)
        .build();
    if let Err(error) = built { eprintln!("settings open_failed {error}"); }
}

fn page_only(webview: &Webview) -> Result<(), String> {
    if webview.label() == "settings" { Ok(()) } else { Err("rejected".into()) }
}

fn state(app: &AppHandle) -> Result<Value, String> {
    let viewport = on_main(app, || unsafe {
        let raw = endfield_viewport_state();
        let text = CStr::from_ptr(raw).to_string_lossy().into_owned();
        free(raw.cast());
        text
    })?;
    let mut tail = [0 as c_char; 8];
    unsafe { endfield_assist_key_tail(tail.as_mut_ptr()) };
    let tail = unsafe { CStr::from_ptr(tail.as_ptr()) }.to_string_lossy().into_owned();
    let titles: Vec<Value> = DAILY_TASKS.iter().map(|id| {
        let title = ENGINE_MENU_TASKS.iter().find(|(t, _)| t == id).map_or(*id, |(_, title)| title.trim_start_matches("运行："));
        json!({ "id": id, "title": title })
    }).collect();
    Ok(json!({
        "settings": get(app),
        "viewport": serde_json::from_str::<Value>(&viewport).map_err(|e| e.to_string())?,
        "sensitivities": SENSITIVITIES,
        "dailyTasks": titles,
        "assistKey": tail,
        "version": app.package_info().version.to_string(),
        "update": update::status(app),
    }))
}

#[tauri::command]
pub async fn settings_get(app: AppHandle, webview: Webview) -> Result<Value, String> {
    page_only(&webview)?;
    state(&app)
}

#[tauri::command]
pub async fn settings_set(app: AppHandle, webview: Webview, key: String, value: Value) -> Result<Value, String> {
    page_only(&webview)?;
    set(&app, &key, &value)?;
    state(&app)
}

#[tauri::command]
pub async fn settings_action(app: AppHandle, webview: Webview, action: String) -> Result<Value, String> {
    page_only(&webview)?;
    match action.as_str() {
        "assistClear" => unsafe { endfield_assist_clear_key() },
        "assistCheck" => {
            let app2 = app.clone();
            on_main(&app, move || app2.get_webview_window("game").map(|game| engine_command(&game, "window.__engine.checkAssist()")))?
                .transpose().map_err(|e| e.to_string())?;
        }
        "updateCheck" => update::check_now(&app),
        "updateInstall" => update::request_install(&app),
        "revealRecords" => {
            let records = app.path().app_data_dir().map_err(|e| e.to_string())?.join("automation");
            std::process::Command::new("open").arg(records).spawn().map_err(|e| e.to_string())?;
        }
        _ => return Err("unknown_action".into()),
    }
    state(&app)
}

extern "C" fn key_saved(context: *mut c_void, json: *const c_char) {
    let tx = unsafe { Box::from_raw(context.cast::<mpsc::Sender<String>>()) };
    let _ = tx.send(unsafe { CStr::from_ptr(json) }.to_string_lossy().into_owned());
}

#[tauri::command]
pub async fn assist_save_key(webview: Webview, key: String) -> Result<Value, String> {
    page_only(&webview)?;
    let key = CString::new(key).map_err(|_| "bad_key")?;
    let (tx, rx) = mpsc::channel::<String>();
    unsafe { endfield_assist_save_key(key.as_ptr(), Box::into_raw(Box::new(tx)).cast(), key_saved) };
    let reply = tauri::async_runtime::spawn_blocking(move || rx.recv()).await.map_err(|e| e.to_string())?.map_err(|e| e.to_string())?;
    serde_json::from_str(&reply).map_err(|e| e.to_string())
}
