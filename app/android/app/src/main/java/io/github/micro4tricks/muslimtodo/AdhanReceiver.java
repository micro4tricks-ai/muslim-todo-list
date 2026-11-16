package io.github.micro4tricks.muslimtodo;

import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;
import androidx.core.content.ContextCompat;

/** Starts the adhan at prayer time, stops it from the notification, and rebooks after a restart. */
public class AdhanReceiver extends BroadcastReceiver {

    static final String ACTION_PLAY = "io.github.micro4tricks.muslimtodo.ADHAN_PLAY";
    static final String ACTION_STOP = "io.github.micro4tricks.muslimtodo.ADHAN_STOP";

    @Override
    public void onReceive(Context ctx, Intent intent) {
        String action = intent.getAction();
        if (ACTION_PLAY.equals(action)) {
            Intent s = new Intent(ctx, AdhanService.class).putExtras(intent);
            try {
                ContextCompat.startForegroundService(ctx, s);
            } catch (Exception e) {
                // Android 12+ may refuse a background start (ForegroundServiceStartNotAllowedException):
                // the adhan's notice still comes, without its sound.
                Log.w("NoonAdhan", "player not started, notice only", e);
                try {
                    NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
                    if (nm != null) nm.notify(AdhanService.NOTE_ID, AdhanService.notification(ctx,
                        intent.getStringExtra("title"), intent.getStringExtra("body"), intent.getStringExtra("stop")));
                } catch (Exception ignored) { }
            }
        } else if (ACTION_STOP.equals(action)) {
            ctx.stopService(new Intent(ctx, AdhanService.class));
        } else {
            // Boot or an update: put back an alarm volume a killed player left changed.
            if (Intent.ACTION_BOOT_COMPLETED.equals(action) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)
                || "android.intent.action.QUICKBOOT_POWERON".equals(action)) {
                AdhanService.restoreAlarm(ctx);
            }
            // Boot, an update, exact alarms just allowed, or the clock or time zone changed: book them
            // all again. The times are stored as instants, so they still hold; the app recomputes
            // them for the new zone the next time it opens (js/native.js).
            AdhanAlarms.bookAll(ctx);
        }
    }
}
