package io.github.micro4tricks.muslimtodo;

import android.app.AlarmManager;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Do Not Disturb during a focus session, when the person chooses it (js/focus-mode.js).
 * status() says whether Android gave the app that right; openAccess() opens the screen that gives it;
 * start({until}) switches the phone to priority only (alarms, and so the adhan, still ring) and books
 * the way back at the session's end, even with the app closed; stop() puts back what the phone had.
 * Only a change the app made itself is ever undone: if the person changed it meanwhile, it stays.
 */
@CapacitorPlugin(name = "Quiet")
public class QuietPlugin extends Plugin {

    static final String PREFS = "noon_quiet";

    @PluginMethod
    public void status(PluginCall call) {
        JSObject r = new JSObject();
        r.put("allowed", allowed(getContext()));
        r.put("on", getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).contains("before"));
        call.resolve(r);
    }

    @PluginMethod
    public void openAccess(PluginCall call) {
        try {
            Intent i = new Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject("no-screen");
        }
    }

    @PluginMethod
    public void start(PluginCall call) {
        Context ctx = getContext();
        long until = (long) call.getDouble("until", 0.0).doubleValue();
        if (!allowed(ctx)) { call.reject("not-allowed"); return; }
        if (until <= System.currentTimeMillis()) { call.reject("past"); return; }
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        // A session already made quiet keeps the filter it found first.
        if (!p.contains("before")) p.edit().putInt("before", nm.getCurrentInterruptionFilter()).apply();
        nm.setInterruptionFilter(NotificationManager.INTERRUPTION_FILTER_PRIORITY);
        // Back a little before the end, so the "session ended" notice is not silenced.
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        long at = Math.max(System.currentTimeMillis() + 1000, until - 2000);
        if (am != null) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !am.canScheduleExactAlarms()) am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending(ctx));
            else am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending(ctx));
        }
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        restore(getContext());
        call.resolve();
    }

    static boolean allowed(Context ctx) {
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        return nm != null && nm.isNotificationPolicyAccessGranted();
    }

    static PendingIntent pending(Context ctx) {
        return PendingIntent.getBroadcast(ctx, 7301, new Intent(ctx, End.class), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static void restore(Context ctx) {
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am != null) am.cancel(pending(ctx));
        if (!p.contains("before")) return;
        int before = p.getInt("before", NotificationManager.INTERRUPTION_FILTER_ALL);
        p.edit().remove("before").apply();
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null || !allowed(ctx)) return;
        // Still the app's own setting: put the phone back as it was.
        if (nm.getCurrentInterruptionFilter() == NotificationManager.INTERRUPTION_FILTER_PRIORITY) nm.setInterruptionFilter(before);
    }

    /** The session's end, with or without the app: the phone goes back as it was. */
    public static class End extends BroadcastReceiver {
        @Override
        public void onReceive(Context ctx, Intent intent) {
            restore(ctx);
        }
    }
}
