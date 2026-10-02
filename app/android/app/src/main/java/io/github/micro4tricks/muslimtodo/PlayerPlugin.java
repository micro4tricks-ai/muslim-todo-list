package io.github.micro4tricks.muslimtodo;

import android.content.Intent;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * The page's link to the native player (js/listen.js, in the app only):
 * play({ items: [{ key, title, sub, urls: [], live }], index, position }), pause(), resume(),
 * skip({ by }), stop(), sleep({ minutes }). Every change comes back as a "state" event:
 * { state: loading|playing|paused|ended|error|idle, index, key, position, duration, error } (seconds).
 * Downloads for listening without internet: download({ id, url }) (one at a time, "download" events
 * with the percent), downloads() lists them, remove({ id }), cancel() stops what is queued.
 * The files stay inside the app's own storage and go with it when it is removed.
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

    // ---- downloads ----
    private static final ExecutorService LOADER = Executors.newSingleThreadExecutor();
    private static final AtomicInteger GENERATION = new AtomicInteger();
    private static final long KEEP_FREE = 300L * 1024 * 1024; // never fill the phone

    private File audioDir() {
        File d = new File(getContext().getFilesDir(), "audio");
        if (!d.exists()) d.mkdirs();
        return d;
    }
    private static String safe(String id) { return id.replaceAll("[^A-Za-z0-9_-]", "_"); }
    private static JSObject entry(File f) {
        JSObject o = new JSObject();
        o.put("id", f.getName().substring(0, f.getName().length() - 4)); // without ".mp3"
        o.put("path", Uri.fromFile(f).toString());
        o.put("size", f.length());
        return o;
    }

    @PluginMethod
    public void download(PluginCall call) {
        String id = safe(call.getString("id", "")), url = call.getString("url", "");
        if (id.isEmpty() || !url.startsWith("https://")) { call.reject("Bad download"); return; }
        int gen = GENERATION.get();
        LOADER.execute(() -> {
            File out = new File(audioDir(), id + ".mp3"), part = new File(audioDir(), id + ".part");
            try {
                if (gen != GENERATION.get()) { call.reject("Cancelled", "CANCELLED"); return; }
                if (out.exists()) { call.resolve(entry(out)); return; }
                if (audioDir().getUsableSpace() < KEEP_FREE) { call.reject("Not enough space", "NO_SPACE"); return; }
                HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
                c.setConnectTimeout(20000);
                c.setReadTimeout(30000);
                if (c.getResponseCode() != 200) throw new Exception("HTTP " + c.getResponseCode());
                long total = c.getContentLengthLong(), done = 0;
                int last = -1;
                try (InputStream in = c.getInputStream(); OutputStream os = new FileOutputStream(part)) {
                    byte[] buf = new byte[64 * 1024];
                    int n;
                    while ((n = in.read(buf)) > 0) {
                        if (gen != GENERATION.get()) throw new InterruptedException();
                        os.write(buf, 0, n);
                        done += n;
                        int pct = total > 0 ? (int) (done * 100 / total) : -1;
                        if (pct != last) {
                            last = pct;
                            JSObject p = new JSObject(); p.put("id", id); p.put("percent", pct);
                            notifyListeners("download", p);
                        }
                    }
                } finally { c.disconnect(); }
                if (!part.renameTo(out)) throw new Exception("Could not save");
                call.resolve(entry(out));
            } catch (InterruptedException e) {
                part.delete();
                call.reject("Cancelled", "CANCELLED");
            } catch (Exception e) {
                part.delete();
                call.reject(e.getMessage() == null ? "Download failed" : e.getMessage(), "FAILED");
            }
        });
    }

    @PluginMethod
    public void downloads(PluginCall call) {
        JSArray list = new JSArray();
        long total = 0;
        File[] files = audioDir().listFiles((d, n) -> n.endsWith(".mp3"));
        if (files != null) for (File f : files) { list.put(entry(f)); total += f.length(); }
        JSObject r = new JSObject();
        r.put("items", list);
        r.put("total", total);
        r.put("free", audioDir().getUsableSpace());
        call.resolve(r);
    }

    @PluginMethod
    public void remove(PluginCall call) {
        File f = new File(audioDir(), safe(call.getString("id", "")) + ".mp3");
        JSObject r = new JSObject(); r.put("removed", f.exists() && f.delete());
        call.resolve(r);
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        GENERATION.incrementAndGet();
        call.resolve();
    }
}
