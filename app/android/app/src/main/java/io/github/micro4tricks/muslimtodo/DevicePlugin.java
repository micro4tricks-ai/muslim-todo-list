package io.github.micro4tricks.muslimtodo;

import android.app.AlarmManager;
import android.content.ActivityNotFoundException;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.FileProvider;
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
import java.util.Arrays;

/**
 * What keeps the adhan on time on phones that stop apps in the background, and the in-app update.
 * status() reports the battery exemption, notifications, exact alarms and the maker;
 * openBattery(), openAutostart(), openNotifications() take the person to the right screen;
 * update() downloads the latest APK from the website, checks it is signed with this app's own key,
 * and hands it to Android's installer ("progress" events while downloading).
 */
@CapacitorPlugin(name = "Device")
public class DevicePlugin extends Plugin {

    // The only address the update ever comes from.
    private static final String APK_URL = "https://micro4tricks-ai.github.io/muslim-todo-list/muslim-todo-list.apk";
    // The Google Play build: Play does the updates, and some permissions are left out (see src/play).
    private static final boolean PLAY = "play".equals(BuildConfig.STORE);

    // Each maker's own screen for starting apps on their own / running in the background.
    private static final String[][] AUTOSTART = {
        {"com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity"},
        {"com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity"},
        {"com.coloros.safecenter", "com.coloros.safecenter.startupapp.StartupAppListActivity"},
        {"com.oplus.safecenter", "com.oplus.safecenter.permission.startup.StartupAppListActivity"},
        {"com.oppo.safe", "com.oppo.safe.permission.startup.StartupAppListActivity"},
        {"com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.BgStartUpManagerActivity"},
        {"com.iqoo.secure", "com.iqoo.secure.ui.phoneoptimize.AddWhiteListActivity"},
        {"com.huawei.systemmanager", "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity"},
        {"com.huawei.systemmanager", "com.huawei.systemmanager.optimize.process.ProtectActivity"},
        {"com.hihonor.systemmanager", "com.hihonor.systemmanager.startupmgr.ui.StartupNormalAppListActivity"},
        {"com.samsung.android.lool", "com.samsung.android.sm.battery.ui.BatteryActivity"},
        {"com.asus.mobilemanager", "com.asus.mobilemanager.autostart.AutoStartActivity"},
        {"com.letv.android.letvsafe", "com.letv.android.letvsafe.AutobootManageActivity"}
    };

    @PluginMethod
    public void status(PluginCall call) {
        Context ctx = getContext();
        JSObject r = new JSObject();
        PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
        r.put("batteryExempt", pm == null || pm.isIgnoringBatteryOptimizations(ctx.getPackageName()));
        r.put("notifications", NotificationManagerCompat.from(ctx).areNotificationsEnabled());
        boolean exact = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
            exact = am == null || am.canScheduleExactAlarms();
        }
        r.put("exactAlarms", exact);
        r.put("maker", Build.MANUFACTURER == null ? "" : Build.MANUFACTURER.toLowerCase());
        r.put("sdk", Build.VERSION.SDK_INT);
        r.put("store", BuildConfig.STORE);
        try { r.put("version", ctx.getPackageManager().getPackageInfo(ctx.getPackageName(), 0).versionName); } catch (Exception ignored) { }
        call.resolve(r);
    }

    private boolean open(Intent i) {
        try {
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            return true;
        } catch (ActivityNotFoundException | SecurityException e) {
            return false;
        }
    }

    private Intent appDetails() {
        return new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getContext().getPackageName()));
    }

    @PluginMethod
    public void openBattery(PluginCall call) {
        Context ctx = getContext();
        // The Play build may not ask directly (no REQUEST_IGNORE_BATTERY_OPTIMIZATIONS): it opens the list instead.
        boolean ok = (!PLAY && open(new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + ctx.getPackageName()))))
            || open(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
            || open(appDetails());
        JSObject r = new JSObject(); r.put("opened", ok); call.resolve(r);
    }

    @PluginMethod
    public void openAutostart(PluginCall call) {
        // Android hides other apps from this one, so each maker's screen is simply tried in turn.
        boolean ok = false;
        for (String[] c : AUTOSTART) {
            if (open(new Intent().setComponent(new ComponentName(c[0], c[1])))) { ok = true; break; }
        }
        if (!ok) ok = open(appDetails());
        JSObject r = new JSObject(); r.put("opened", ok); call.resolve(r);
    }

    @PluginMethod
    public void openNotifications(PluginCall call) {
        Intent i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
        boolean ok = open(i) || open(appDetails());
        JSObject r = new JSObject(); r.put("opened", ok); call.resolve(r);
    }

    @PluginMethod
    public void openExactAlarms(PluginCall call) {
        boolean ok = false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            ok = open(new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + getContext().getPackageName())));
        }
        if (!ok) ok = open(appDetails());
        JSObject r = new JSObject(); r.put("opened", ok); call.resolve(r);
    }

    // ---- the in-app update ----

    @PluginMethod
    public void update(PluginCall call) {
        if (PLAY) { call.reject("Updates come from Google Play", "STORE"); return; }
        Context ctx = getContext();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !ctx.getPackageManager().canRequestPackageInstalls()) {
            // Android asks once to let this app install its own updates.
            open(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + ctx.getPackageName())));
            call.reject("Allow installing updates, then try again", "PERMISSION");
            return;
        }
        new Thread(() -> {
            File dir = new File(ctx.getCacheDir(), "updates");
            File apk = new File(dir, "muslim-todo-list.apk");
            try {
                if (!dir.exists() && !dir.mkdirs()) throw new Exception("No room for the download");
                HttpURLConnection c = (HttpURLConnection) new URL(APK_URL).openConnection();
                c.setConnectTimeout(20000);
                c.setReadTimeout(30000);
                c.setRequestProperty("Cache-Control", "no-cache");
                if (c.getResponseCode() != 200) throw new Exception("HTTP " + c.getResponseCode());
                long total = c.getContentLengthLong(), done = 0;
                int lastPct = -1;
                try (InputStream in = c.getInputStream(); OutputStream out = new FileOutputStream(apk)) {
                    byte[] buf = new byte[64 * 1024];
                    int n;
                    while ((n = in.read(buf)) > 0) {
                        out.write(buf, 0, n);
                        done += n;
                        int pct = total > 0 ? (int) (done * 100 / total) : -1;
                        if (pct != lastPct) {
                            lastPct = pct;
                            JSObject p = new JSObject(); p.put("percent", pct); p.put("done", done); p.put("total", total);
                            notifyListeners("progress", p);
                        }
                    }
                } finally { c.disconnect(); }
                checkSameKey(ctx, apk);
                Uri uri = FileProvider.getUriForFile(ctx, ctx.getPackageName() + ".fileprovider", apk);
                Intent install = new Intent(Intent.ACTION_VIEW)
                    .setDataAndType(uri, "application/vnd.android.package-archive")
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                ctx.startActivity(install);
                call.resolve();
            } catch (Exception e) {
                if (apk.exists()) apk.delete();
                call.reject(e.getMessage() == null ? "Download failed" : e.getMessage(), "FAILED");
            }
        }).start();
    }

    /**
     * The download must be this app, signed with the same key; anything else is thrown away.
     * (Android's installer refuses a different key too; this says so before it is opened.)
     */
    @SuppressWarnings("deprecation")
    private static void checkSameKey(Context ctx, File apk) throws Exception {
        PackageManager pm = ctx.getPackageManager();
        PackageInfo got = pm.getPackageArchiveInfo(apk.getPath(), 0);
        if (got == null || !ctx.getPackageName().equals(got.packageName)) throw new Exception("Not this app");
        int[] tries = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
            ? new int[] { PackageManager.GET_SIGNING_CERTIFICATES, PackageManager.GET_SIGNATURES }
            : new int[] { PackageManager.GET_SIGNATURES };
        for (int flags : tries) {
            PackageInfo a = pm.getPackageArchiveInfo(apk.getPath(), flags);
            PackageInfo b = pm.getPackageInfo(ctx.getPackageName(), flags);
            Signature[] sa = a == null ? null : sigs(a, flags), sb = sigs(b, flags);
            if (sa != null && sa.length > 0 && sb != null && sb.length > 0) {
                if (!Arrays.equals(sa, sb)) throw new Exception("Signed with a different key");
                return;
            }
        }
    }

    @SuppressWarnings("deprecation")
    private static Signature[] sigs(PackageInfo p, int flags) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && flags == PackageManager.GET_SIGNING_CERTIFICATES) {
            return p.signingInfo == null ? null : p.signingInfo.getApkContentsSigners();
        }
        return p.signatures;
    }
}
