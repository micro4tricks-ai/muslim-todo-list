// Live TV without ads: the broadcaster's own stream on Aloula (as in the Android app). Aloula's player
// service signs the stream's address for each viewer and answers apps, not other websites, so the
// address is asked here; the stream itself plays in the page (it allows any origin).
fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

#[tauri::command]
pub async fn aloula_live(channel: u32) -> Result<String, String> {
    if channel == 0 || channel > 999 {
        return Err("no such channel".into());
    }
    let res = reqwest::Client::new()
        .get(format!("https://aloula.faulio.com/api/v1.1/channels/{channel}/player/live"))
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(err)?
        .error_for_status()
        .map_err(err)?;
    let body: serde_json::Value = serde_json::from_slice(&res.bytes().await.map_err(err)?).map_err(err)?;
    match body.pointer("/streams/hls").and_then(|u| u.as_str()) {
        Some(u) if u.starts_with("https://") => Ok(u.to_string()),
        _ => Err("no stream".into()),
    }
}

// The ad blocker (Windows): uBlock Origin Lite is always loaded with the window and switched on or
// off here, while the app runs; nothing restarts.
#[cfg(windows)]
pub fn set_blocker(window: &tauri::WebviewWindow, on: bool) {
    let _ = window.with_webview(move |wv| unsafe {
        use webview2_com::Microsoft::Web::WebView2::Win32::{ICoreWebView2Profile7, ICoreWebView2_13};
        use webview2_com::{BrowserExtensionEnableCompletedHandler, ProfileGetBrowserExtensionsCompletedHandler};
        use windows::core::Interface;
        let Ok(core) = wv.controller().CoreWebView2() else { return };
        let Ok(core13) = core.cast::<ICoreWebView2_13>() else { return };
        let Ok(profile) = core13.Profile() else { return };
        let Ok(p7) = profile.cast::<ICoreWebView2Profile7>() else { return };
        let handler = ProfileGetBrowserExtensionsCompletedHandler::create(Box::new(move |_, list| {
            if let Some(list) = list {
                let mut n = 0u32;
                list.Count(&mut n)?;
                for i in 0..n {
                    let ext = list.GetValueAtIndex(i)?;
                    ext.Enable(on, &BrowserExtensionEnableCompletedHandler::create(Box::new(|_| Ok(()))))?;
                }
            }
            Ok(())
        }));
        let _ = p7.GetBrowserExtensions(&handler);
    });
}
