package io.github.micro4tricks.muslimtodo;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
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
            ContextCompat.startForegroundService(ctx, s);
        } else if (ACTION_STOP.equals(action)) {
            ctx.stopService(new Intent(ctx, AdhanService.class));
        } else {
            // Boot or time change: alarms are cleared, so book them again.
            AdhanAlarms.bookAll(ctx);
        }
    }
}
