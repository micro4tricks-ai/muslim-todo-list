package io.github.micro4tricks.muslimtodo;

import android.content.Intent;
import android.os.Handler;
import android.os.Looper;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * The page's link to the native player (js/listen.js, in the app only):
 * play({ items: [{ key, title, sub, urls: [], live }], index, position }), pause(), resume(),
 * skip({ by }), stop(), sleep({ minutes }). Every change comes back as a "state" event:
 * { state: loading|playing|paused|ended|error|idle, index, key, position, duration, error } (seconds).
 */
@CapacitorPlugin(name = "Player")
public class PlayerPlugin extends Plugin {

    private final Handler main = new Handler(Looper.getMainLooper());

    private interface Job { void run(PlayerService s) throws Exception; }

    @Override
    public void load() {
        PlayerService.listener = (state, index, key, pos, dur, error) -> {
            JSObject d = new JSObject();
            d.put("state", state);
            d.put("index", index);
            d.put("key", key);
            d.put("position", pos / 1000.0);
            d.put("duration", dur / 1000.0);
            d.put("error", error);
            notifyListeners("state", d);
        };
    }

    /** Runs the job on the main thread once the service is up, starting it when needed. */
    private void withService(PluginCall call, boolean start, Job job) {
        main.post(() -> {
            if (PlayerService.instance == null) {
                if (!start) { call.resolve(); return; }
                getContext().startService(new Intent(getContext(), PlayerService.class));
            }
            waitFor(call, job, 0);
        });
    }

    private void waitFor(PluginCall call, Job job, int tries) {
        PlayerService s = PlayerService.instance;
        if (s == null) {
            if (tries > 60) { call.reject("The player did not start"); return; }
            main.postDelayed(() -> waitFor(call, job, tries + 1), 50);
            return;
        }
        try { job.run(s); call.resolve(); } catch (Exception e) { call.reject(e.getMessage(), e); }
    }

    @PluginMethod
    public void play(PluginCall call) {
        JSArray raw = call.getArray("items", new JSArray());
        List<PlayerService.Item> items = new ArrayList<>();
        try {
            for (int i = 0; i < raw.length(); i++) {
                JSONObject o = raw.getJSONObject(i);
                JSONArray u = o.optJSONArray("urls");
                if (u == null || u.length() == 0) continue;
                String[] urls = new String[u.length()];
                for (int k = 0; k < u.length(); k++) urls[k] = u.getString(k);
                items.add(new PlayerService.Item(o.optString("key"), o.optString("title"), o.optString("sub"), urls, o.optBoolean("live")));
            }
        } catch (Exception e) { call.reject("Bad items", e); return; }
        if (items.isEmpty()) { call.reject("Nothing to play"); return; }
        int index = call.getInt("index", 0);
        long position = (long) (call.getDouble("position", 0.0) * 1000);
        withService(call, true, (s) -> s.load(items, index, position));
    }

    @PluginMethod public void pause(PluginCall call) { withService(call, false, PlayerService::pause); }
    @PluginMethod public void resume(PluginCall call) { withService(call, false, PlayerService::resume); }
    @PluginMethod public void stop(PluginCall call) { withService(call, false, PlayerService::stopAll); }
    @PluginMethod public void skip(PluginCall call) { int by = call.getInt("by", 1); withService(call, false, (s) -> s.skip(by)); }
    @PluginMethod public void sleep(PluginCall call) { int m = call.getInt("minutes", 0); withService(call, false, (s) -> s.sleep(m)); }
}
