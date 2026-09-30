package io.github.micro4tricks.muslimtodo;

import android.content.Context;
import android.content.Intent;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * The page's link to the native adhan player (js/native.js):
 * schedule({ items: JSON }) books the adhan times, stop() silences it, test({ sound }) plays it now.
 * The "adhan" event ({ playing }) lets the page pause its radio while the adhan plays.
 */
@CapacitorPlugin(name = "Adhan")
public class AdhanPlugin extends Plugin {

    @Override
    public void load() {
        AdhanService.listener = (playing) -> {
            JSObject d = new JSObject();
            d.put("playing", playing);
            notifyListeners("adhan", d);
        };
    }

    @PluginMethod
    public void schedule(PluginCall call) {
        Context ctx = getContext();
        AdhanAlarms.save(ctx, call.getString("items", "[]"));
        AdhanAlarms.bookAll(ctx);
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getContext().stopService(new Intent(getContext(), AdhanService.class));
        call.resolve();
    }

    @PluginMethod
    public void test(PluginCall call) {
        Context ctx = getContext();
        Intent s = new Intent(ctx, AdhanService.class)
            .putExtra("sound", call.getString("sound", "adhan_madinah"))
            .putExtra("title", call.getString("title", ""))
            .putExtra("body", call.getString("body", ""))
            .putExtra("stop", call.getString("stop", "Stop"))
            .putExtra("silentOk", true);
        ContextCompat.startForegroundService(ctx, s);
        call.resolve();
    }
}
