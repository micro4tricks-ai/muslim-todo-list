package io.github.micro4tricks.muslimtodo;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * The adhan times booked with the phone's alarm clock. The list (from js/native.js) is kept in
 * preferences so it can be booked again after a restart. Each item: { at, sound, title, body }.
 */
final class AdhanAlarms {

    static final String PREFS = "noon_adhan";
    private static final String KEY = "items";
    private static final String COUNT = "count";
    private static final int BASE = 5000; // request codes 5000.. (PrayerWidget uses 7)

    private AdhanAlarms() {}

    static void save(Context ctx, String json) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, json).apply();
    }

    /** Cancels what was booked before and books every item still ahead. */
    static void bookAll(Context ctx) {
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        int old = p.getInt(COUNT, 0);
        for (int i = 0; i < old; i++) {
            PendingIntent pi = intent(ctx, i, null, PendingIntent.FLAG_NO_CREATE);
            if (pi != null) { am.cancel(pi); pi.cancel(); }
        }
        int n = 0;
        try {
            JSONArray items = new JSONArray(p.getString(KEY, "[]"));
            long now = System.currentTimeMillis();
            for (int i = 0; i < items.length(); i++) {
                JSONObject it = items.getJSONObject(i);
                long at = it.getLong("at");
                if (at <= now) continue;
                PendingIntent pi = intent(ctx, n, it, PendingIntent.FLAG_UPDATE_CURRENT);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !am.canScheduleExactAlarms()) {
                    am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
                } else {
                    // Exact, even in doze; an exact alarm may start the player from the background.
                    am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
                }
                n++;
            }
        } catch (Exception e) {
            // A broken list books nothing; the app sends a new one the next time it opens.
        }
        p.edit().putInt(COUNT, n).apply();
    }

    private static PendingIntent intent(Context ctx, int k, JSONObject it, int flags) {
        Intent i = new Intent(ctx, AdhanReceiver.class).setAction(AdhanReceiver.ACTION_PLAY);
        if (it != null) {
            i.putExtra("sound", it.optString("sound", "adhan_madinah"));
            i.putExtra("title", it.optString("title", ""));
            i.putExtra("body", it.optString("body", ""));
            i.putExtra("stop", it.optString("stop", "Stop"));
            i.putExtra("silentOk", it.optBoolean("silentOk", false));
        }
        return PendingIntent.getBroadcast(ctx, BASE + k, i, flags | PendingIntent.FLAG_IMMUTABLE);
    }

    static PendingIntent openApp(Context ctx) {
        Intent open = new Intent(ctx, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(ctx, 4999, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
