package io.github.micro4tricks.muslimtodo;

import android.os.Bundle;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;
import com.getcapacitor.WebViewListener;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // The page hands the prayer times to the home-screen widget through this plugin.
        registerPlugin(WidgetBridge.class);
        // ... and books the adhan with the phone's alarm clock through this one.
        registerPlugin(AdhanPlugin.class);
        super.onCreate(savedInstanceState);
        // When Android stops the page's renderer (usually to free memory), reopen the
        // screen instead of letting the whole app close. Tasks and settings are saved
        // on the phone, so nothing is lost.
        bridge.addWebViewListener(new WebViewListener() {
            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                recreate();
                return true;
            }
        });
        // Capacitor sends every link outside the app to the browser, frames included. The live
        // broadcast (YouTube inside the website's tv.html) is a frame, so frames load in place;
        // links on the page itself still open outside.
        bridge.setWebViewClient(new BridgeWebViewClient(bridge) {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (!request.isForMainFrame()) return false;
                return super.shouldOverrideUrlLoading(view, request);
            }
        });
    }
}
