package io.github.micro4tricks.muslimtodo;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.widget.RemoteViews;
import org.json.JSONObject;

/**
 * Home-screen widget: the qibla's direction from the place set in the app, as a dial with north at
 * the top and the arrow at the bearing (clockwise from north). A widget cannot follow the phone's
 * compass, so a tap opens the live compass in the app. The app hands the data over
 * (WidgetBridge.qibla): { title, bearing, text, place, hint } as JSON.
 */
public class QiblaWidget extends AppWidgetProvider {

    static final String KEY = "qibla";

    @Override
    public void onUpdate(Context ctx, AppWidgetManager manager, int[] ids) {
        for (int id : ids) manager.updateAppWidget(id, build(ctx));
    }

    static void refreshAll(Context ctx) {
        AppWidgetManager manager = AppWidgetManager.getInstance(ctx);
        int[] ids = manager.getAppWidgetIds(new ComponentName(ctx, QiblaWidget.class));
        if (ids.length == 0) return;
        RemoteViews views = build(ctx);
        for (int id : ids) manager.updateAppWidget(id, views);
    }

    private static RemoteViews build(Context ctx) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_qibla);
        v.setOnClickPendingIntent(R.id.q_root, VerseWidget.openView(ctx, "qibla", 12));
        String raw = ctx.getSharedPreferences(PrayerWidget.PREFS, Context.MODE_PRIVATE).getString(KEY, "");
        try {
            JSONObject d = new JSONObject(raw);
            double bearing = d.getDouble("bearing");
            if (Double.isNaN(bearing) || Double.isInfinite(bearing)) throw new IllegalArgumentException("bearing");
            v.setTextViewText(R.id.q_title, d.optString("title"));
            v.setTextViewText(R.id.q_text, d.optString("text"));
            v.setTextViewText(R.id.q_place, d.optString("place"));
            v.setTextViewText(R.id.q_hint, d.optString("hint"));
            v.setImageViewBitmap(R.id.q_dial, dial(ctx, (float) bearing, d.optString("north", "N")));
        } catch (Exception ignored) {
            // Nothing from the app yet: the layout's own text asks to open it once.
            v.setImageViewBitmap(R.id.q_dial, dial(ctx, Float.NaN, "N"));
        }
        return v;
    }

    /** The dial: a ring, north marked at the top, and the arrow to the qibla with the Kaaba at its tip. */
    static Bitmap dial(Context ctx, float bearing, String north) {
        float density = ctx.getResources().getDisplayMetrics().density;
        int size = Math.max(96, Math.round(88 * density));
        Bitmap bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(bmp);
        float cx = size / 2f, cy = size / 2f, r = size * 0.44f;
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setStyle(Paint.Style.STROKE);
        p.setStrokeWidth(size * 0.025f);
        p.setColor(0x66F5F1E6);
        c.drawCircle(cx, cy, r, p);
        // Ticks every 30°, the four points longer.
        for (int a = 0; a < 360; a += 30) {
            double t = Math.toRadians(a);
            float in = a % 90 == 0 ? r * 0.80f : r * 0.88f;
            c.drawLine(cx + (float) Math.sin(t) * in, cy - (float) Math.cos(t) * in,
                cx + (float) Math.sin(t) * r, cy - (float) Math.cos(t) * r, p);
        }
        // North.
        Paint np = new Paint(Paint.ANTI_ALIAS_FLAG);
        np.setColor(0xFFE0694C);
        np.setTextAlign(Paint.Align.CENTER);
        np.setTextSize(size * 0.15f);
        np.setFakeBoldText(true);
        c.drawText(north, cx, cy - r * 0.48f, np);
        if (Float.isNaN(bearing)) return bmp;
        // The arrow.
        double t = Math.toRadians(bearing);
        float sx = (float) Math.sin(t), sy = (float) -Math.cos(t);
        Paint ap = new Paint(Paint.ANTI_ALIAS_FLAG);
        ap.setColor(0xFFF2D58A);
        ap.setStrokeWidth(size * 0.045f);
        ap.setStrokeCap(Paint.Cap.ROUND);
        float tipR = r * 0.62f;
        c.drawLine(cx - sx * r * 0.25f, cy - sy * r * 0.25f, cx + sx * tipR, cy + sy * tipR, ap);
        c.drawCircle(cx, cy, size * 0.035f, ap);
        // The Kaaba at the tip: a dark square with a gold band.
        float k = size * 0.085f, kx = cx + sx * (tipR + k * 0.9f), ky = cy + sy * (tipR + k * 0.9f);
        c.save();
        c.rotate(bearing, kx, ky);
        Paint kp = new Paint(Paint.ANTI_ALIAS_FLAG);
        kp.setColor(0xFF15171A);
        c.drawRoundRect(new RectF(kx - k, ky - k, kx + k, ky + k), k * 0.2f, k * 0.2f, kp);
        kp.setColor(0xFFF2D58A);
        c.drawRect(kx - k, ky - k * 0.45f, kx + k, ky - k * 0.2f, kp);
        c.restore();
        return bmp;
    }
}
