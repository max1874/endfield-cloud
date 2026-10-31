//! Rust-only updater. Pending bytes enter state only after plugin verification.
use std::sync::{Condvar, Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::{menu::MenuItem, AppHandle, Manager};
use tauri_plugin_updater::{Update, UpdaterExt};

static APP: OnceLock<AppHandle> = OnceLock::new();

struct Downloaded {
    update: Update,
    bytes: Vec<u8>,
}

#[derive(Default)]
struct State {
    downloaded: Option<Downloaded>,
    checking: bool,
    installing: bool,
    installed: bool,
    quitting: bool,
    exit_ready: bool,
    exiting: bool,
    install_result: Option<Result<(), String>>,
}

pub struct Updates {
    state: Mutex<State>,
    install_finished: Condvar,
    check: MenuItem<tauri::Wry>,
    install: MenuItem<tauri::Wry>,
}

impl Updates {
    fn check_label(&self, text: &str) {
        if let Err(error) = self.check.set_text(text) {
            eprintln!("update menu_failed {error}");
        }
    }
}

pub fn setup(app: &AppHandle, check: MenuItem<tauri::Wry>, install: MenuItem<tauri::Wry>) {
    app.manage(Updates {
        state: Mutex::new(State::default()),
        install_finished: Condvar::new(),
        check,
        install,
    });
    let _ = APP.set(app.clone());
    if cfg!(debug_assertions) {
        eprintln!("update disabled_in_debug");
        return;
    }
    let app = app.clone();
    // Every 10 minutes, so a release shows its 重启更新 bar without a click on 检查更新
    // (Max 2026-10-31; it took up to 6 h before). Each check fetches only latest.json,
    // and none runs once an update is downloaded.
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_secs(30)).await;
        loop {
            check_now(&app);
            tokio::time::sleep(Duration::from_secs(10 * 60)).await;
        }
    });
}

pub fn check_now(app: &AppHandle) {
    if cfg!(debug_assertions) { return; }
    let updates = app.state::<Updates>();
    {
        let mut state = updates.state.lock().unwrap();
        // Retain the verified download across checks; no duplicate download/prompt.
        if state.downloaded.is_some() || state.checking || state.installing || state.installed || state.quitting {
            return;
        }
        state.checking = true;
    }
    updates.check_label("检查更新（正在检查）");
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        check_and_download(&app).await;
        app.state::<Updates>().state.lock().unwrap().checking = false;
    });
}

async fn check_and_download(app: &AppHandle) {
    let updates = app.state::<Updates>();
    let result = async {
        app.updater_builder().timeout(Duration::from_secs(120)).build()?.check().await
    }.await;
    let update = match result {
        Ok(Some(update)) => update,
        Ok(None) => {
            eprintln!("update check none");
            // The time says how old "latest" is: checks run 30 s after launch, then every 10 min.
            let at = chrono::Local::now().format("%H:%M");
            updates.check_label(&format!("检查更新（{at} 已是最新 {}）", app.package_info().version));
            return;
        }
        Err(error) => {
            eprintln!("update check_failed {error}");
            updates.check_label("检查更新（检查失败，点击重试）");
            return;
        }
    };
    // The plugin's default comparator only returns versions newer than ours.
    eprintln!("update available version={}", update.version);
    updates.check_label(&format!("检查更新（正在下载 v{}）", update.version));
    match update.download(|_, _| {}, || {}).await {
        Ok(bytes) => {
            let version = update.version.clone();
            eprintln!("update downloaded version={version} bytes={}", bytes.len());
            {
                let mut state = updates.state.lock().unwrap();
                if state.quitting { return; }
                state.downloaded = Some(Downloaded { update, bytes });
            }
            updates.check_label(&format!("检查更新（v{version} 已就绪）"));
            if let Err(error) = updates.install.set_text(format!("重启并更新到 v{version}"))
                .and_then(|()| updates.install.set_enabled(true)) {
                eprintln!("update menu_failed {error}");
            }
            notify_ready(app);
        }
        Err(error) => {
            eprintln!("update download_failed {error}");
            updates.check_label("检查更新（下载失败，点击重试）");
        }
    }
}

// Also called after navigation so a reload cannot lose the pending prompt.
pub fn notify_ready(app: &AppHandle) {
    if cfg!(debug_assertions) { return; }
    let version = app.state::<Updates>().state.lock().unwrap().downloaded
        .as_ref().map(|download| download.update.version.clone());
    if let (Some(version), Some(window)) = (version, app.get_webview_window("game")) {
        // Version is parsed by the plugin as semver, so Rust's quoted string is JS-safe.
        if let Err(error) = crate::engine_command(&window, &format!("window.__engine?.updateReady?.({version:?})")) {
            eprintln!("update prompt_failed {error}");
        }
    }
}

pub fn request_install(app: &AppHandle) {
    if cfg!(debug_assertions) { return; }
    if let Some(window) = app.get_webview_window("game") {
        // On a cloud document, the engine alone decides idleness. Never fall back
        // to installation on an injection error while automation might be active.
        let url = match window.url() {
            Ok(url) => url,
            Err(error) => {
                eprintln!("update prompt_failed cannot_read_page_url {error}");
                return;
            }
        };
        let cloud = url.scheme() == "https" && url.host_str() == Some("endfield.hypergryph.com")
            && url.port_or_known_default() == Some(443)
            && (url.path() == "/cloud" || url.path().starts_with("/cloud/"));
        if cloud {
            if let Err(error) = crate::engine_command(&window, "window.__engine?.requestUpdate?.()") {
                eprintln!("update prompt_failed {error}");
            }
            return;
        }
    }
    install(app, true);
}

// Called only by the isolated engine's origin-checked native bridge, after its
// synchronous idle check, or by the no-cloud-page menu fallback / quit path.
#[no_mangle]
pub extern "C" fn endfield_update_install() {
    if cfg!(debug_assertions) { return; }
    if let Some(app) = APP.get() { install(app, true); }
}

fn install(app: &AppHandle, relaunch: bool) {
    let updates = app.state::<Updates>();
    let download = {
        let mut state = updates.state.lock().unwrap();
        if state.installing || state.installed { return; }
        let Some(download) = state.downloaded.take() else { return; };
        state.installing = true;
        state.install_result = None;
        download
    };
    let _ = updates.install.set_enabled(false);
    let app = app.clone();
    // macOS installation can request work on the main thread. Keep the event
    // loop alive, including on quit, while the blocking installer runs elsewhere.
    tauri::async_runtime::spawn_blocking(move || {
        eprintln!("update installing version={}", download.update.version);
        let result = download.update.install(&download.bytes);
        let updates = app.state::<Updates>();
        let (quit, exiting) = {
            let mut state = updates.state.lock().unwrap();
            state.installing = false;
            state.installed = result.is_ok();
            state.install_result = Some(result.as_ref().map(|_| ()).map_err(ToString::to_string));
            let quit = state.quitting || !relaunch;
            if let Err(error) = &result {
                eprintln!("update install_failed {error}");
                state.downloaded = Some(download);
            }
            state.exit_ready = quit;
            updates.install_finished.notify_all();
            (quit, state.exiting)
        };
        // Exit may already be waiting on the main thread: publish completion
        // before any UI dispatch, and let that callback finish termination.
        if exiting { return; }
        if quit {
            app.exit(0);
        } else if result.is_ok() {
            app.request_restart();
        } else {
            let _ = updates.install.set_enabled(true);
            // Re-arm the engine's run/update controls after a failed install.
            notify_ready(&app);
        }
    });
}

/// Return true when exit must be deferred until a pending installation finishes.
pub fn defer_exit(app: &AppHandle) -> bool {
    if cfg!(debug_assertions) { return false; }
    let updates = app.state::<Updates>();
    {
        let mut state = updates.state.lock().unwrap();
        if state.exit_ready || (!state.installing && state.downloaded.is_none()) { return false; }
        state.quitting = true;
        if state.installing { return true; }
    }
    install(app, false);
    true
}

/// NSApp termination can reach Exit without ExitRequested. The process ends as
/// soon as this callback returns, so wait for the installer here, with a bound:
/// the plugin's privileged path needs the main thread we are currently holding.
pub fn on_exit(app: &AppHandle) {
    if cfg!(debug_assertions) { return; }
    let deadline = Instant::now() + Duration::from_secs(30);
    let updates = app.state::<Updates>();
    let mut state = updates.state.lock().unwrap();
    state.exiting = true;
    state.quitting = true;
    if !state.installing && !state.installed && state.install_result.is_none() {
        if let Some(download) = state.downloaded.take() {
            state.installing = true;
            eprintln!("update installing version={} on_exit", download.update.version);
            let app = app.clone();
            // Use a dedicated thread: termination must not depend on the async
            // runtime accepting another task or keeping its blocking pool alive.
            if let Err(error) = std::thread::Builder::new()
                .name("update-on-exit".into())
                .spawn(move || {
                    let result = download.update.install(&download.bytes)
                        .map_err(|error| error.to_string());
                    let updates = app.state::<Updates>();
                    let mut state = updates.state.lock().unwrap();
                    state.installing = false;
                    state.installed = result.is_ok();
                    if result.is_err() { state.downloaded = Some(download); }
                    state.install_result = Some(result);
                    updates.install_finished.notify_all();
                }) {
                state.installing = false;
                state.install_result = Some(Err(format!("cannot_start_installer {error}")));
            }
        }
    }
    // Share completion with a prompt/ExitRequested installer already in flight.
    // The predicate also handles spurious wakeups without extending the deadline.
    while state.installing {
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            eprintln!("update install_failed on_exit timeout_after_30s");
            return;
        }
        state = updates.install_finished.wait_timeout(state, remaining).unwrap().0;
    }
    if let Some(Err(error)) = &state.install_result {
        eprintln!("update install_failed on_exit {error}");
    }
}
