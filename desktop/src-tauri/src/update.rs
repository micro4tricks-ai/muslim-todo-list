// Updates of the app itself (the website inside it updates on its own): checked at start and every six
// hours against the desktop-updates release; signed with the key in muslim-todo-keystore, so only our
// builds install. Nothing installs by itself: the tray item and a notification offer it.
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tauri::menu::MenuItem;
use tauri::{AppHandle, Runtime};
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_updater::UpdaterExt;

static TOLD: AtomicBool = AtomicBool::new(false);

/// Looks for a newer version; names it on the tray item and says so once.
pub fn watch<R: Runtime>(app: AppHandle<R>, item: MenuItem<R>) {
    tauri::async_runtime::spawn(async move {
        tokio_sleep(Duration::from_secs(60)).await;
        loop {
            if let Ok(Some(u)) = check(&app).await {
                let _ = item.set_text(format!("تثبيت التحديث {}", u));
                if !TOLD.swap(true, Ordering::Relaxed) {
                    let _ = app
                        .notification()
                        .builder()
                        .title("مهام المسلم")
                        .body(format!("نسخة جديدة من البرنامج ({u}) جاهزة. ثبّتها من قائمة أيقونة البرنامج بجانب الساعة: «تثبيت التحديث»."))
                        .show();
                }
            }
            tokio_sleep(Duration::from_secs(6 * 3600)).await;
        }
    });
}

async fn check<R: Runtime>(app: &AppHandle<R>) -> Result<Option<String>, String> {
    let u = app.updater().map_err(|e| e.to_string())?.check().await.map_err(|e| e.to_string())?;
    Ok(u.map(|u| u.version))
}

/// The tray item: installs the newer version if there is one (the app restarts into it), or says there is none.
pub fn install<R: Runtime>(app: AppHandle<R>) {
    tauri::async_runtime::spawn(async move {
        let say = |body: &str| {
            let _ = app.notification().builder().title("مهام المسلم").body(body).show();
        };
        let found = match app.updater() {
            Ok(up) => up.check().await,
            Err(e) => Err(e),
        };
        match found {
            Ok(Some(u)) => {
                say(&format!("جارٍ تنزيل النسخة {} وتثبيتها…", u.version));
                match u.download_and_install(|_, _| {}, || {}).await {
                    Ok(()) => app.restart(),
                    Err(_) => say("تعذّر تثبيت التحديث. حاول مرة أخرى لاحقاً."),
                }
            }
            Ok(None) => say("البرنامج محدَّث: هذه أحدث نسخة."),
            Err(_) => say("تعذّر البحث عن تحديث. تأكد من الاتصال بالإنترنت."),
        }
    });
}

async fn tokio_sleep(d: Duration) {
    let _ = tauri::async_runtime::spawn_blocking(move || std::thread::sleep(d)).await;
}
