// Muslim Activity for Windows and macOS: the website in its own window (always the latest version,
// readable offline through its service worker), a tray icon, start with the computer, and system
// notifications. Closing the window keeps the app in the tray, so the adhan and reminders still come.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::atomic::{AtomicBool, Ordering};
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_notification::NotificationExt;

const SITE: &str = "https://micro4tricks-ai.github.io/muslim-todo-list/";
const INIT: &str = include_str!("init.js");
// Started with the computer: straight to the tray, no window.
const HIDDEN: &str = "--hidden";
static TOLD: AtomicBool = AtomicBool::new(false);

fn show(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

fn main() {
    tauri::Builder::default()
        // A second launch brings the open window forward instead of starting another copy.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show(app)))
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec![HIDDEN])))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let hidden = std::env::args().any(|a| a == HIDDEN);
            let builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::External(SITE.parse().unwrap()))
                .title("مهام المسلم")
                .inner_size(1200.0, 820.0)
                .min_inner_size(380.0, 560.0)
                .visible(!hidden)
                .initialization_script(INIT);
            // The adhan plays at its time without a click, and a hidden window keeps its timers.
            #[cfg(windows)]
            let builder = builder.additional_browser_args(
                "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --autoplay-policy=no-user-gesture-required --disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows",
            );
            builder.build()?;

            let open = MenuItem::with_id(app, "open", "فتح مهام المسلم", true, None::<&str>)?;
            let auto = CheckMenuItem::with_id(app, "auto", "التشغيل مع بدء الجهاز", true, app.autolaunch().is_enabled().unwrap_or(false), None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "خروج", true, None::<&str>)?;
            let sep = PredefinedMenuItem::separator(app)?;
            let menu = Menu::with_items(app, &[&open, &auto, &sep, &quit])?;
            let auto_item = auto.clone();
            TrayIconBuilder::with_id("tray")
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("مهام المسلم")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(move |app, ev| match ev.id().as_ref() {
                    "open" => show(app),
                    "auto" => {
                        let m = app.autolaunch();
                        let on = m.is_enabled().unwrap_or(false);
                        let _ = if on { m.disable() } else { m.enable() };
                        let _ = auto_item.set_checked(m.is_enabled().unwrap_or(!on));
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, ev| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = ev {
                        show(tray.app_handle());
                    }
                })
                .build(app)?;
            Ok(())
        })
        // Closing the window hides it; «خروج» in the tray menu quits.
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
                if !TOLD.swap(true, Ordering::Relaxed) {
                    let _ = window
                        .app_handle()
                        .notification()
                        .builder()
                        .title("مهام المسلم")
                        .body("ما زال التطبيق يعمل بجانب الساعة ليصلك الأذان والتذكيرات. للخروج: «خروج» من قائمة أيقونته.")
                        .show();
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("could not start Muslim Activity")
        .run(|_app, _event| {
            // macOS: a click on the Dock icon brings the window back.
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = _event {
                show(_app);
            }
        });
}
