package io.github.micro4tricks.muslimtodo;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.SystemClock;
import android.view.View;
import android.widget.RemoteViews;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Home-screen widget: the next prayer with a live countdown, and the day's five prayer times.
 * The times come from the app (WidgetBridge); the widget refreshes itself just after each prayer.
 */
public class PrayerWidget extends AppWidgetProvider {

    static final String PREFS = "noon_widget";
    static final String KEY = "data";
    private static final int[] NAMES = { R.id.w_n0, R.id.w_n1, R.id.w_n2, R.id.w_n3, R.id.w_n4 };
    private static final int[] TIMES = { R.id.w_t0, R.id.w_t1, R.id.w_t2, R.id.w_t3, R.id.w_t4 };
    private static final int[] CELLS = { R.id.w_c0, R.id.w_c1, R.id.w_c2, R.id.w_c3, R.id.w_c4 };

    @Override
    public void onUpdate(Context ctx, AppWidgetManager manager, int[] ids) {
        for (int id : ids) manager.updateAppWidget(id, build(ctx));
    }

    @Override
    public void onReceive(Context ctx, Intent intent) {
        super.onReceive(ctx, intent);
        if (Intent.ACTION_TIME_CHANGED.equals(intent.getAction()) || Intent.ACTION_TIMEZONE_CHANGED.equals(intent.getAction())) refreshAll(ctx);
    }

    static void refreshAll(Context ctx) {
        AppWidgetManager manager = AppWidgetManager.getInstance(ctx);
        int[] ids = manager.getAppWidgetIds(new ComponentName(ctx, PrayerWidget.class));
        if (ids.length == 0) return;
        RemoteViews views = build(ctx);
        for (int id : ids) manager.updateAppWidget(id, views);
    }

    private static RemoteViews build(Context ctx) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_prayer);
        Intent open = new Intent(ctx, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        v.setOnClickPendingIntent(R.id.w_root, PendingIntent.getActivity(ctx, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        String raw = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, "");
        try {
            JSONObject data = new JSONObject(raw);
            JSONArray days = data.getJSONArray("days");
            long now = System.currentTimeMillis();
            // The first day that still has a prayer ahead, and that prayer.
            for (int d = 0; d < days.length(); d++) {
                JSONArray day = days.getJSONArray(d);
                int next = -1;
                for (int i = 0; i < day.length(); i++) {
                    if (day.getJSONObject(i).getLong("at") > now) { next = i; break; }
                }
                if (next < 0) continue;
                v.setTextViewText(R.id.w_title, data.optString("title", ""));
                JSONObject p = day.getJSONObject(next);
                v.setTextViewText(R.id.w_next, data.optString("next", "") + " " + p.getString("name") + " · " + p.getString("time"));
                long at = p.getLong("at");
                v.setChronometer(R.id.w_count, SystemClock.elapsedRealtime() + (at - now), null, true);
                v.setChronometerCountDown(R.id.w_count, true);
                v.setViewVisibility(R.id.w_count, View.VISIBLE);
                for (int i = 0; i < 5 && i < day.length(); i++) {
                    JSONObject q = day.getJSONObject(i);
                    v.setTextViewText(NAMES[i], q.getString("name"));
                    v.setTextViewText(TIMES[i], q.getString("time"));
                    v.setInt(CELLS[i], "setBackgroundResource", i == next ? R.drawable.widget_cell_next : 0);
                }
                scheduleRefresh(ctx, at + 60_000L);
                return v;
            }
            v.setTextViewText(R.id.w_next, data.optString("empty", "Open the app to update the prayer times."));
        } catch (Exception e) {
            v.setTextViewText(R.id.w_next, "Open the app to show the prayer times.");
        }
        v.setViewVisibility(R.id.w_count, View.GONE);
        return v;
    }

    // Wake the widget a minute after the prayer, to move on to the next one.
    private static void scheduleRefresh(Context ctx, long at) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        Intent i = new Intent(ctx, PrayerWidget.class).setAction(AppWidgetManager.ACTION_APPWIDGET_UPDATE);
        int[] ids = AppWidgetManager.getInstance(ctx).getAppWidgetIds(new ComponentName(ctx, PrayerWidget.class));
        i.putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids);
        PendingIntent pi = PendingIntent.getBroadcast(ctx, 7, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        am.setAndAllowWhileIdle(AlarmManager.RTC, at, pi);
    }
}
