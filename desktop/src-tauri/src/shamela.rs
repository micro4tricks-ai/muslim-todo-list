// The Shamela library on this computer (built by tools/build_shamela_packs.py): one pack per shelf,
// downloaded from the «shamela-library» release when the user asks for it and unpacked into the app's
// data folder, then read by the website's book reader through shamela://, never from the internet.
use std::io::Write;
use std::path::{Path, PathBuf};
use tauri::http::{Request, Response};
use tauri::{AppHandle, Emitter, Manager, Runtime, UriSchemeContext, UriSchemeResponder};

const RELEASE: &str = "https://github.com/micro4tricks-ai/muslim-todo-list/releases/download/shamela-library/";

fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

fn lib_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    let d = app.path().app_data_dir().map_err(err)?.join("shamela");
    std::fs::create_dir_all(&d).map_err(err)?;
    Ok(d)
}

fn installed(dir: &Path) -> Vec<u32> {
    let mut out: Vec<u32> = std::fs::read_dir(dir)
        .map(|r| {
            r.filter_map(|e| e.ok())
                .filter_map(|e| e.file_name().to_str().and_then(|n| n.strip_prefix("installed-")).and_then(|n| n.parse().ok()))
                .collect()
        })
        .unwrap_or_default();
    out.sort();
    out
}

/// The shelves there are (from the release, or the copy kept from last time) and those on this computer.
#[tauri::command]
pub async fn shamela_catalog<R: Runtime>(app: AppHandle<R>) -> Result<serde_json::Value, String> {
    let dir = lib_dir(&app)?;
    let kept = dir.join("catalog.json");
    let fresh = async {
        let r = reqwest::get(format!("{RELEASE}catalog.json")).await.ok()?.error_for_status().ok()?;
        r.bytes().await.ok()
    }
    .await;
    if let Some(b) = &fresh {
        if serde_json::from_slice::<serde_json::Value>(b).is_ok() {
            let _ = std::fs::write(&kept, b);
        }
    }
    let shelves = std::fs::read(&kept).ok().and_then(|b| serde_json::from_slice::<serde_json::Value>(&b).ok()).unwrap_or(serde_json::Value::Null);
    Ok(serde_json::json!({ "shelves": shelves, "installed": installed(&dir), "online": fresh.is_some() }))
}

/// Downloads one shelf's pack and unpacks it; «shamela-progress» events tell [shelf, bytes so far, all bytes].
#[tauri::command]
pub async fn shamela_install<R: Runtime>(app: AppHandle<R>, cat: u32) -> Result<(), String> {
    let dir = lib_dir(&app)?;
    let part = dir.join(format!("shamela-{cat}.zip.part"));
    let mut res = reqwest::get(format!("{RELEASE}shamela-{cat}.zip")).await.map_err(err)?.error_for_status().map_err(err)?;
    let total = res.content_length().unwrap_or(0);
    {
        let mut f = std::io::BufWriter::new(std::fs::File::create(&part).map_err(err)?);
        let (mut got, mut told) = (0u64, 0u64);
        while let Some(chunk) = res.chunk().await.map_err(err)? {
            f.write_all(&chunk).map_err(err)?;
            got += chunk.len() as u64;
            if got - told >= 1 << 20 || got == total {
                told = got;
                let _ = app.emit("shamela-progress", (cat, got, total));
            }
        }
        f.flush().map_err(err)?;
    }
    let (d, p) = (dir.clone(), part.clone());
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        let mut z = zip::ZipArchive::new(std::fs::File::open(&p).map_err(err)?).map_err(err)?;
        z.extract(&d).map_err(err)
    })
    .await
    .map_err(err)??;
    let _ = std::fs::remove_file(&part);
    std::fs::write(dir.join(format!("installed-{cat}")), b"1").map_err(err)?;
    Ok(())
}

/// Removes one shelf's books from this computer.
#[tauri::command]
pub async fn shamela_remove<R: Runtime>(app: AppHandle<R>, cat: u32) -> Result<(), String> {
    let dir = lib_dir(&app)?;
    let _ = std::fs::remove_file(dir.join(format!("installed-{cat}")));
    let list = dir.join(format!("cat-{cat}.json"));
    if let Some(books) = std::fs::read(&list).ok().and_then(|b| serde_json::from_slice::<Vec<serde_json::Value>>(&b).ok()) {
        for b in books {
            if let Some(slug) = b.get("slug").and_then(|s| s.as_str()).filter(|s| safe(s)) {
                let _ = std::fs::remove_dir_all(dir.join("books").join(slug));
            }
        }
    }
    let _ = std::fs::remove_file(list);
    Ok(())
}

// Only plain names: letters, digits, «.», «-», «_» and «/» between them.
fn safe(p: &str) -> bool {
    !p.is_empty() && !p.contains("..") && p.chars().all(|c| c.is_ascii_alphanumeric() || "._-/".contains(c))
}

/// shamela://localhost/<path> (https://shamela.localhost/<path> on Windows): a file of the library on this computer.
pub fn serve<R: Runtime>(ctx: UriSchemeContext<'_, R>, req: Request<Vec<u8>>, responder: UriSchemeResponder) {
    let app = ctx.app_handle().clone();
    std::thread::spawn(move || {
        let path = req.uri().path().trim_start_matches('/').to_string();
        let found = if path == "ping" {
            Some(b"ok".to_vec())
        } else {
            lib_dir(&app).ok().filter(|_| safe(&path)).and_then(|d| std::fs::read(d.join(&path)).ok())
        };
        let res = Response::builder().header("Access-Control-Allow-Origin", "*").header("Cache-Control", "no-store");
        let res = match found {
            Some(bytes) => res
                .status(200)
                .header("Content-Type", if path.ends_with(".json") { "application/json" } else { "application/octet-stream" })
                .body(bytes),
            None => res.status(404).body(Vec::new()),
        };
        responder.respond(res.unwrap());
    });
}
