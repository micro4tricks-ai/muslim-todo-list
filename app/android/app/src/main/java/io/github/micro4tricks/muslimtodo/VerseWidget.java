package io.github.micro4tricks.muslimtodo;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;
import org.json.JSONObject;

/**
 * Home-screen widget: the verse of the day. The app hands it over each day (WidgetBridge.verse);
 * a tap opens the Mushaf.
 */
public class VerseWidget extends AppWidgetProvider {

    static final String KEY = "verse";

    @Override
    public void onUpdate(Context ctx, AppWidgetManager manager, int[] ids) {
        for (int id : ids) manager.updateAppWidget(id, build(ctx));
    }

    static void refreshAll(Context ctx) {
        AppWidgetManager manager = AppWidgetManager.getInstance(ctx);
        int[] ids = manager.getAppWidgetIds(new ComponentName(ctx, VerseWidget.class));
        if (ids.length == 0) return;
        RemoteViews views = build(ctx);
        for (int id : ids) manager.updateAppWidget(id, views);
    }

    private static RemoteViews build(Context ctx) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_verse);
        v.setOnClickPendingIntent(R.id.v_root, openView(ctx, "quran", 11));
        String raw = ctx.getSharedPreferences(PrayerWidget.PREFS, Context.MODE_PRIVATE).getString(KEY, "");
        try {
            JSONObject d = new JSONObject(raw);
            v.setTextViewText(R.id.v_title, d.optString("title"));
            v.setTextViewText(R.id.v_text, d.optString("text"));
            v.setTextViewText(R.id.v_ref, d.optString("ref"));
        } catch (Exception ignored) {
            // Nothing from the app yet: the layout's own text asks to open it once.
        }
        return v;
    }

    /** Opens the app on one of its sections (MainActivity hands it to the page). */
    static PendingIntent openView(Context ctx, String view, int code) {
        Intent open = new Intent(ctx, MainActivity.class)
            .setAction("noon.OPEN." + view)
            .putExtra(MainActivity.EXTRA_VIEW, view)
            .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(ctx, code, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
