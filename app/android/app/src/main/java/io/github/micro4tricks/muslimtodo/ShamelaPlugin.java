package io.github.micro4tricks.muslimtodo;

import android.net.Uri;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * The Shamela library on the phone (js/shamela.js), as in the desktop app: one pack per shelf, built by
 * tools/build_shamela_packs.py and published in the «shamela-library» release, downloaded when asked
 * and unpacked into the app's own storage (it goes with the app when the app is removed).
 * catalog() -> { shelves, installed: [ids], online, base: the folder's file:// address };
 * install({ cat }) with "progress" events { cat, got, total }; remove({ cat }).
 */
@CapacitorPlugin(name = "Shamela")
public class ShamelaPlugin extends Plugin {

    private static final String RELEASE = "https://github.com/micro4tricks-ai/muslim-todo-list/releases/download/shamela-library/";
    private static final ExecutorService WORK = Executors.newSingleThreadExecutor();
    private static final long KEEP_FREE = 500L * 1024 * 1024; // never fill the phone
    private static final long MAX_PACK = 1500L << 20; // the largest shelf is well under this

    private File dir() {
        File d = new File(getContext().getFilesDir(), "shamela");
        if (!d.exists()) d.mkdirs();
        return d;
    }

    private JSArray installed() {
        JSArray out = new JSArray();
        String[] names = dir().list();
        if (names != null) for (String n : names) {
            if (n.startsWith("installed-")) {
                try { out.put(Integer.parseInt(n.substring(10))); } catch (NumberFormatException ignored) {}
            }
        }
        return out;
    }

    private static HttpURLConnection open(String url) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(20000);
        c.setReadTimeout(60000);
        c.setInstanceFollowRedirects(true);
        if (c.getResponseCode() != 200) { c.disconnect(); throw new Exception("HTTP " + c.getResponseCode()); }
        return c;
    }

    @PluginMethod
    public void catalog(PluginCall call) {
        WORK.execute(() -> {
            File kept = new File(dir(), "catalog.json");
            boolean online = false;
            try {
                HttpURLConnection c = open(RELEASE + "catalog.json");
                ByteArrayOutputStream b = new ByteArrayOutputStream();
                try (InputStream in = c.getInputStream()) { copy(in, b, 4 << 20); } finally { c.disconnect(); }
                new JSONArray(b.toString("UTF-8")); // only a list that reads well is kept
                try (OutputStream os = new FileOutputStream(kept)) { os.write(b.toByteArray()); }
                online = true;
            } catch (Exception ignored) { /* offline: the copy from last time */ }
            JSObject r = new JSObject();
            try {
                if (kept.exists()) {
                    byte[] all = new byte[(int) kept.length()];
                    try (InputStream in = new FileInputStream(kept)) { int off = 0, n; while (off < all.length && (n = in.read(all, off, all.length - off)) > 0) off += n; }
                    r.put("shelves", new JSONArray(new String(all, StandardCharsets.UTF_8)));
                } else r.put("shelves", new JSONArray());
            } catch (Exception e) { r.put("shelves", new JSONArray()); }
            r.put("installed", installed());
            r.put("online", online);
            r.put("base", Uri.fromFile(dir()).toString());
            call.resolve(r);
        });
    }

    @PluginMethod
    public void install(PluginCall call) {
        int cat = call.getInt("cat", 0);
        if (cat <= 0) { call.reject("Bad shelf"); return; }
        WORK.execute(() -> {
            File part = new File(dir(), "shamela-" + cat + ".zip.part");
            try {
                if (dir().getUsableSpace() < KEEP_FREE) { call.reject("Not enough space", "NO_SPACE"); return; }
                HttpURLConnection c = open(RELEASE + "shamela-" + cat + ".zip");
                long total = c.getContentLengthLong(), got = 0, told = 0;
                if (total > 0 && dir().getUsableSpace() < KEEP_FREE + 2 * total) { c.disconnect(); call.reject("Not enough space", "NO_SPACE"); return; }
                try (InputStream in = c.getInputStream(); OutputStream os = new FileOutputStream(part)) {
                    byte[] buf = new byte[128 * 1024];
                    int n;
                    while ((n = in.read(buf)) > 0) {
                        os.write(buf, 0, n);
                        got += n;
                        if (got > MAX_PACK) throw new Exception("Too large");
                        if (got - told >= (1 << 20) || got == total) {
                            told = got;
                            JSObject p = new JSObject(); p.put("cat", cat); p.put("got", got); p.put("total", total);
                            notifyListeners("progress", p);
                        }
                    }
                } finally { c.disconnect(); }
                unzip(part, dir());
                part.delete();
                new FileOutputStream(new File(dir(), "installed-" + cat)).close();
                call.resolve();
            } catch (Exception e) {
                part.delete();
                call.reject(e.getMessage() == null ? "Download failed" : e.getMessage(), "FAILED");
            }
        });
    }

    @PluginMethod
    public void remove(PluginCall call) {
        int cat = call.getInt("cat", 0);
        WORK.execute(() -> {
            new File(dir(), "installed-" + cat).delete();
            File list = new File(dir(), "cat-" + cat + ".json");
            try {
                byte[] all = new byte[(int) list.length()];
                try (InputStream in = new FileInputStream(list)) { int off = 0, n; while (off < all.length && (n = in.read(all, off, all.length - off)) > 0) off += n; }
                JSONArray books = new JSONArray(new String(all, StandardCharsets.UTF_8));
                for (int i = 0; i < books.length(); i++) {
                    String slug = books.getJSONObject(i).optString("slug");
                    if (slug.matches("s\\d+")) deleteAll(new File(new File(dir(), "books"), slug));
                }
            } catch (Exception ignored) { /* nothing listed: nothing to remove */ }
            list.delete();
            call.resolve();
        });
    }

    /** Unpacks the pack, refusing any name that would leave the folder. */
    private static void unzip(File zip, File to) throws Exception {
        String root = to.getCanonicalPath() + File.separator;
        try (ZipInputStream z = new ZipInputStream(new FileInputStream(zip))) {
            ZipEntry e;
            byte[] buf = new byte[64 * 1024];
            while ((e = z.getNextEntry()) != null) {
                File f = new File(to, e.getName());
                if (!f.getCanonicalPath().startsWith(root)) throw new Exception("Bad entry");
                if (e.isDirectory()) { f.mkdirs(); continue; }
                File p = f.getParentFile();
                if (p != null) p.mkdirs();
                try (OutputStream os = new FileOutputStream(f)) { int n; while ((n = z.read(buf)) > 0) os.write(buf, 0, n); }
            }
        }
    }

    private static void copy(InputStream in, OutputStream out, long max) throws Exception {
        byte[] buf = new byte[64 * 1024];
        long done = 0;
        int n;
        while ((n = in.read(buf)) > 0) { out.write(buf, 0, n); done += n; if (done > max) throw new Exception("Too large"); }
    }

    private static void deleteAll(File f) {
        File[] kids = f.listFiles();
        if (kids != null) for (File k : kids) deleteAll(k);
        f.delete();
    }
}
