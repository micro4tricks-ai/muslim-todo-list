// Muslim Activity for Windows and macOS: the website in its own window (always the latest version,
// readable offline through its service worker), a tray icon, start with the computer, and system
// notifications. Closing the window keeps the app in the tray, so the adhan and reminders still come.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod media;
mod shamela;
mod update;

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

// The optional ad blocker (Windows): uBlock Origin Lite, shipped with the app in resources/extensions,
// always loaded with the window and switched on only while «منع الإعلانات» is checked (src/media.rs).
// Off until the user turns it on.
#[cfg(windows)]
fn adblock_flag(app: &AppHandle) -> Option<std::path::PathBuf> {
    app.path().app_config_dir().ok().map(|d| d.join("adblock-on"))
}
#[cfg(windows)]
fn adblock_on(app: &AppHandle) -> bool {
    std::env::var_os("MUSLIM_ADBLOCK").is_some() || adblock_flag(app).is_some_and(|f| f.exists())
}
#[cfg(windows)]
fn set_adblock(app: &AppHandle, on: bool) {
    if let Some(f) = adblock_flag(app) {
        let _ = if on {
            std::fs::create_dir_all(f.parent().unwrap()).and_then(|_| std::fs::write(&f, b"1"))
        } else {
            std::fs::remove_file(&f)
        };
    }
}
// For the build's own checks (MUSLIM_PROBE names one, MUSLIM_PROBE_OUT the file for its answer, which
// comes back as a page address «?probe=...»): does a known ad address still load in the window, and
// can the website reach the library on this computer (its commands and shamela://)?
const PROBE_ADBLOCK: &str = "if(location.search.indexOf('probe=')<0)setTimeout(function(){var go=function(r){location.href=location.pathname+'?probe='+r};fetch('https://googleads.g.doubleclick.net/pagead/id',{mode:'no-cors',cache:'no-store'}).then(function(){go('loaded')},function(){go('blocked')})},12000);";
const PROBE_SHAMELA: &str = "if(location.search.indexOf('probe=')<0)setTimeout(function(){var go=function(r){location.href=location.pathname+'?probe='+encodeURIComponent(r)};var base=navigator.userAgent.indexOf('Windows')>=0?'https://shamela.localhost/':'shamela://localhost/';var a=window.__TAURI__.core.invoke('shamela_catalog').then(function(c){return 'cmd-ok'+(c.online?'-online':'')},function(e){return 'cmd-fail:'+e});var b=fetch(base+'ping').then(function(r){return r.text()}).then(function(t){return 'file-'+t},function(e){return 'file-fail:'+e});Promise.all([a,b]).then(function(x){go(x.join('|'))})},8000);";
// Live TV: the ad-free stream's address from Aloula, and the stream itself read from the page.
const PROBE_TV: &str = "if(location.search.indexOf('probe=')<0)setTimeout(function(){var go=function(r){location.href=location.pathname+'?probe='+encodeURIComponent(r)};window.__TAURI__.core.invoke('aloula_live',{channel:7}).then(function(u){return fetch(u).then(function(r){return r.text()})}).then(function(t){go(t.indexOf('#EXTM3U')===0?'tv-ok':'tv-bad')},function(e){go('tv-fail:'+e)})},8000);";
// Downloads the smallest shelf the way the website does, then reads one of its books from shamela://.
const PROBE_INSTALL: &str = "if(location.search.indexOf('probe=')<0)setTimeout(function(){var go=function(r){location.href=location.pathname+'?probe='+encodeURIComponent(r)};var base='https://shamela.localhost/';var T=window.__TAURI__.core;T.invoke('shamela_catalog').then(function(c){var s=c.shelves.slice().sort(function(x,y){return x.size-y.size})[0];return T.invoke('shamela_install',{cat:s.id}).then(function(){return fetch(base+'cat-'+s.id+'.json')}).then(function(r){return r.json()}).then(function(l){return fetch(base+'books/'+l[0].slug+'/0.json.gz')}).then(function(r){return r.arrayBuffer()}).then(function(b){return T.invoke('shamela_catalog').then(function(c2){go('installed-'+s.id+'|'+(c2.installed.indexOf(s.id)>=0)+'|bytes-'+b.byteLength)})})}).catch(function(e){go('fail:'+e)})},8000);";

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
        .plugin(tauri_plugin_updater::Builder::new().build())
        // The Shamela library on this computer (src/shamela.rs).
        .register_asynchronous_uri_scheme_protocol("shamela", shamela::serve)
        .invoke_handler(tauri::generate_handler![shamela::shamela_catalog, shamela::shamela_install, shamela::shamela_remove, media::aloula_live])
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
            #[cfg(windows)]
            let builder = builder.browser_extensions_enabled(true).extensions_path(app.path().resource_dir()?.join("extensions"));
            // The library's files are served as https://shamela.localhost/ on Windows (the website is https).
            let builder = builder.use_https_scheme(true);
            let builder = match (std::env::var("MUSLIM_PROBE").ok(), std::env::var_os("MUSLIM_PROBE_OUT")) {
                (Some(kind), Some(out)) => builder
                    .initialization_script(match kind.as_str() {
                        "shamela" => PROBE_SHAMELA,
                        "install" => PROBE_INSTALL,
                        "tv" => PROBE_TV,
                        _ => PROBE_ADBLOCK,
                    })
                    .on_navigation(move |url| {
                        if let Some((_, r)) = url.query_pairs().find(|(k, _)| k == "probe") {
                            let _ = std::fs::write(&out, r.as_bytes());
                        }
                        true
                    }),
                _ => builder,
            };
            let _window = builder.build()?;
            // The blocker is added as the window starts: set it as chosen once it is there, and again a little later.
            #[cfg(windows)]
            {
                let (w, on) = (_window.clone(), adblock_on(app.handle()));
                std::thread::spawn(move || {
                    for wait in [2, 4, 8] {
                        std::thread::sleep(std::time::Duration::from_secs(wait));
                        media::set_blocker(&w, on);
                    }
                });
            }

            let open = MenuItem::with_id(app, "open", "فتح مهام المسلم", true, None::<&str>)?;
            let auto = CheckMenuItem::with_id(app, "auto", "التشغيل مع بدء الجهاز", true, app.autolaunch().is_enabled().unwrap_or(false), None::<&str>)?;
            #[cfg(windows)]
            let ads = CheckMenuItem::with_id(app, "ads", "منع الإعلانات أثناء المشاهدة", true, adblock_on(app.handle()), None::<&str>)?;
            let upd = MenuItem::with_id(app, "update", "التحقق من التحديثات", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "خروج", true, None::<&str>)?;
            let sep = PredefinedMenuItem::separator(app)?;
            #[cfg(windows)]
            let menu = Menu::with_items(app, &[&open, &auto, &ads, &upd, &sep, &quit])?;
            #[cfg(not(windows))]
            let menu = Menu::with_items(app, &[&open, &auto, &upd, &sep, &quit])?;
            let auto_item = auto.clone();
            #[cfg(windows)]
            let ads_item = ads.clone();
            update::watch(app.handle().clone(), upd.clone());
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
                    // On or off at once; the page reloads so the video starts again with the new choice.
                    #[cfg(windows)]
                    "ads" => {
                        let on = !adblock_on(app);
                        set_adblock(app, on);
                        let _ = ads_item.set_checked(on);
                        if let Some(w) = app.get_webview_window("main") {
                            media::set_blocker(&w, on);
                            let _ = w.eval("setTimeout(function(){location.reload()},600)");
                        }
                    }
                    "update" => update::install(app.clone()),
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
