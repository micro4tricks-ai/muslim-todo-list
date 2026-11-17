// The Shamela library on this computer (built by tools/build_shamela_packs.py): one pack per shelf,
// downloaded from the «shamela-library» release when the user asks for it and unpacked into the app's
// data folder, then read by the website's book reader through shamela://, never from the internet.
use sha2::{Digest, Sha256};
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};
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

// Bounds of one pack's unpacked files (the largest shelf is well under a gigabyte; a book file is a few MB).
const MAX_TOTAL: u64 = 2 << 30;
const MAX_ENTRY: u64 = 256 << 20;

/// Downloads one shelf's pack and unpacks it; «shamela-progress» events tell [shelf, bytes so far, all bytes].
#[tauri::command]
pub async fn shamela_install<R: Runtime>(app: AppHandle<R>, cat: u32) -> Result<(), String> {
    let dir = lib_dir(&app)?;
    // One file per install, so two installs of the same shelf never write into each other.
    let nanos = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    let part = dir.join(format!("shamela-{cat}-{}-{nanos}.zip.part", std::process::id()));
    let r = install(&app, &dir, &part, cat).await;
    let _ = std::fs::remove_file(&part);
    r?;
    std::fs::write(dir.join(format!("installed-{cat}")), b"1").map_err(err)?;
    Ok(())
}

async fn install<R: Runtime>(app: &AppHandle<R>, dir: &Path, part: &Path, cat: u32) -> Result<(), String> {
    // The pack's sha256 from the catalog kept by shamela_catalog (tools/build_shamela_packs.py writes it).
    let want = std::fs::read(dir.join("catalog.json"))
        .ok()
        .and_then(|b| serde_json::from_slice::<Vec<serde_json::Value>>(&b).ok())
        .and_then(|c| c.into_iter().find(|s| s.get("id").and_then(|i| i.as_u64()) == Some(cat as u64)))
        .and_then(|s| s.get("sha256").and_then(|h| h.as_str()).map(|h| h.to_ascii_lowercase()));
    let mut res = reqwest::get(format!("{RELEASE}shamela-{cat}.zip")).await.map_err(err)?.error_for_status().map_err(err)?;
    let total = res.content_length().unwrap_or(0);
    let mut hash = Sha256::new();
    {
        let mut f = std::io::BufWriter::new(std::fs::File::create(part).map_err(err)?);
        let (mut got, mut told) = (0u64, 0u64);
        while let Some(chunk) = res.chunk().await.map_err(err)? {
            got += chunk.len() as u64;
            if got > MAX_TOTAL {
                return Err("pack too large".into());
            }
            f.write_all(&chunk).map_err(err)?;
            hash.update(&chunk);
            if got - told >= 1 << 20 || got == total {
                told = got;
                let _ = app.emit("shamela-progress", (cat, got, total));
            }
        }
        f.flush().map_err(err)?;
    }
    let got: String = hash.finalize().iter().map(|b| format!("{b:02x}")).collect();
    match want {
        Some(w) if w != got => return Err("pack checksum mismatch".into()),
        Some(_) => {}
        // shortcut: a catalog from before the hashes is trusted as before; refuse it once every catalog has sha256.
        None => {}
    }
    let (d, p) = (dir.to_path_buf(), part.to_path_buf());
    tauri::async_runtime::spawn_blocking(move || extract(&p, &d, cat)).await.map_err(err)?
}

// Unpacks only cat-<cat>.json and books/<name>/<name>, within the size bounds above.
fn extract(zip: &Path, dir: &Path, cat: u32) -> Result<(), String> {
    let mut z = zip::ZipArchive::new(std::fs::File::open(zip).map_err(err)?).map_err(err)?;
    let list = format!("cat-{cat}.json");
    let mut sum = 0u64;
    for i in 0..z.len() {
        let mut e = z.by_index(i).map_err(err)?;
        let name = e.name().map_err(err)?.to_string();
        if e.is_dir() {
            continue;
        }
        let ok = name == list || (name.starts_with("books/") && name.split('/').count() == 3 && safe_rel_path(&name));
        if !ok {
            return Err(format!("unexpected file in pack: {name}"));
        }
        if e.size() > MAX_ENTRY {
            return Err(format!("file too large in pack: {name}"));
        }
        let out = dir.join(&name);
        std::fs::create_dir_all(out.parent().unwrap()).map_err(err)?;
        let mut f = std::fs::File::create(&out).map_err(err)?;
        // The header's size may lie: count what is really written.
        let n = std::io::copy(&mut (&mut e).take(MAX_ENTRY + 1), &mut f).map_err(err)?;
        sum += n;
        if n > MAX_ENTRY || sum > MAX_TOTAL {
            return Err("pack unpacks too large".into());
        }
    }
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
            if let Some(slug) = b.get("slug").and_then(|s| s.as_str()).filter(|s| safe_name(s)) {
                let _ = std::fs::remove_dir_all(dir.join("books").join(slug));
            }
        }
    }
    let _ = std::fs::remove_file(list);
    Ok(())
}

// One plain name: a letter or digit, then letters, digits, «.», «-», «_» (never «.», «..», a root or a separator).
fn safe_name(p: &str) -> bool {
    let mut c = p.chars();
    c.next().is_some_and(|f| f.is_ascii_alphanumeric())
        && c.all(|c| c.is_ascii_alphanumeric() || "._-".contains(c))
        && Path::new(p).components().all(|c| matches!(c, Component::Normal(_)))
}

// A path inside the library: plain names joined by «/».
fn safe_rel_path(p: &str) -> bool {
    p.split('/').all(safe_name)
}

/// shamela://localhost/<path> (https://shamela.localhost/<path> on Windows): a file of the library on this computer.
pub fn serve<R: Runtime>(ctx: UriSchemeContext<'_, R>, req: Request<Vec<u8>>, responder: UriSchemeResponder) {
    let app = ctx.app_handle().clone();
    std::thread::spawn(move || {
        let path = req.uri().path().trim_start_matches('/').to_string();
        let found = if path == "ping" {
            Some(b"ok".to_vec())
        } else {
            lib_dir(&app).ok().filter(|_| safe_rel_path(&path)).and_then(|d| std::fs::read(d.join(&path)).ok())
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names() {
        for ok in ["s123", "a.b", "x-y_z", "0.json.gz"] {
            assert!(safe_name(ok), "{ok}");
        }
        for bad in ["", ".", "..", "/etc", "a/b", r"a\b", "C:", r"C:\x", ".hidden", "-x", "a b", r"\\srv\x"] {
            assert!(!safe_name(bad), "{bad}");
        }
    }

    #[test]
    fn paths() {
        for ok in ["cat-1.json", "books/s1/0.json.gz", "ping"] {
            assert!(safe_rel_path(ok), "{ok}");
        }
        for bad in ["", "/books/s1", "books//s1", "books/../x", "books/./x", "books/s1/", "C:/x", r"books\s1", "../catalog.json"] {
            assert!(!safe_rel_path(bad), "{bad}");
        }
    }

    fn pack(dir: &Path, files: &[&str]) -> PathBuf {
        let p = dir.join("t.zip");
        let mut w = zip::ZipWriter::new(std::fs::File::create(&p).unwrap());
        let o = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
        for f in files {
            w.start_file(*f, o).unwrap();
            w.write_all(b"x").unwrap();
        }
        w.finish().unwrap();
        p
    }

    #[test]
    fn unpacks_only_the_shelf() {
        let dir = std::env::temp_dir().join(format!("shamela-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let ok = pack(&dir, &["cat-7.json", "books/s1/0.json.gz"]);
        assert!(extract(&ok, &dir, 7).is_ok());
        assert!(dir.join("books/s1/0.json.gz").exists());
        for bad in ["../evil", "books/../../evil", "cat-8.json", "books/s1/x/y", "/abs"] {
            let z = pack(&dir, &[bad]);
            assert!(extract(&z, &dir, 7).is_err(), "{bad}");
        }
        let _ = std::fs::remove_dir_all(&dir);
    }
}
