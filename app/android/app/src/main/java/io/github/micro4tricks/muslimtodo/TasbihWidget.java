package io.github.micro4tricks.muslimtodo;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;
import java.text.NumberFormat;
import java.util.Locale;

/**
 * Home-screen widget: a tasbih that counts on each tap, right on the home screen, without opening
 * the app. ⇄ changes the dhikr (and starts its count again), ↺ resets the count.
 */
public class TasbihWidget extends AppWidgetProvider {

    private static final String PREFS = "noon_tasbih";
    private static final String TAP = "noon.TASBIH_TAP", NEXT = "noon.TASBIH_NEXT", RESET = "noon.TASBIH_RESET";
    private static final String[] PHRASES = {
        "سُبْحَانَ اللَّهِ", "الْحَمْدُ لِلَّهِ", "اللَّهُ أَكْبَرُ", "لَا إِلَهَ إِلَّا اللَّهُ",
        "أَسْتَغْفِرُ اللَّهَ", "اللَّهُمَّ صَلِّ عَلَى مُحَمَّدٍ", "سُبْحَانَ اللَّهِ وَبِحَمْدِهِ", "لَا حَوْلَ وَلَا قُوَّةَ إِلَّا بِاللَّهِ"
    };

    @Override
    public void onUpdate(Context ctx, AppWidgetManager manager, int[] ids) {
        for (int id : ids) manager.updateAppWidget(id, build(ctx));
    }

    @Override
    public void onReceive(Context ctx, Intent intent) {
        super.onReceive(ctx, intent);
        String a = intent.getAction();
        if (!TAP.equals(a) && !NEXT.equals(a) && !RESET.equals(a)) return;
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        int count = p.getInt("count", 0), phrase = p.getInt("phrase", 0);
        if (TAP.equals(a)) count++;
        else if (NEXT.equals(a)) { phrase = (phrase + 1) % PHRASES.length; count = 0; }
        else count = 0;
        p.edit().putInt("count", count).putInt("phrase", phrase).apply();
        AppWidgetManager manager = AppWidgetManager.getInstance(ctx);
        RemoteViews v = build(ctx);
        for (int id : manager.getAppWidgetIds(new ComponentName(ctx, TasbihWidget.class))) manager.updateAppWidget(id, v);
    }

    private static PendingIntent action(Context ctx, String a, int code) {
        Intent i = new Intent(ctx, TasbihWidget.class).setAction(a);
        return PendingIntent.getBroadcast(ctx, code, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static RemoteViews build(Context ctx) {
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        int count = p.getInt("count", 0), phrase = p.getInt("phrase", 0) % PHRASES.length;
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_tasbih);
        v.setTextViewText(R.id.t_phrase, PHRASES[phrase]);
        boolean arabic = "ar".equals(Locale.getDefault().getLanguage());
        v.setTextViewText(R.id.t_count, NumberFormat.getInstance(arabic ? new Locale("ar", "EG") : Locale.US).format(count));
        v.setOnClickPendingIntent(R.id.t_tap, action(ctx, TAP, 21));
        v.setOnClickPendingIntent(R.id.t_next, action(ctx, NEXT, 22));
        v.setOnClickPendingIntent(R.id.t_reset, action(ctx, RESET, 23));
        return v;
    }
}
