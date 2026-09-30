package io.github.micro4tricks.muslimtodo;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.util.Log;
import androidx.core.app.NotificationCompat;

/**
 * Plays the adhan through the alarm stream, so it is heard even when notification sounds are
 * quiet, with a notification that stops it. When the phone is on silent or vibrate it only shows
 * the notification, unless the user chose to hear the adhan anyway.
 */
public class AdhanService extends Service {

    private static final String CHANNEL = "adhan-player";
    private static final String TAG = "NoonAdhan";
    private static final int NOTE_ID = 4242;
    private MediaPlayer player;
    private PowerManager.WakeLock wake;
    private AudioFocusRequest focus;

    /** Told when the adhan starts and stops, so the page can pause its radio (set by AdhanPlugin). */
    interface Listener { void onPlaying(boolean playing); }
    static volatile Listener listener;

    private static void tell(boolean playing) {
        Listener l = listener;
        if (l != null) {
            try { l.onPlaying(playing); } catch (Exception ignored) { }
        }
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) { stopSelf(); return START_NOT_STICKY; }
        String title = intent.getStringExtra("title");
        String body = intent.getStringExtra("body");
        String stop = intent.getStringExtra("stop");
        String sound = intent.getStringExtra("sound");
        boolean silentOk = intent.getBooleanExtra("silentOk", false);

        Notification note = notification(title, body, stop);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTE_ID, note, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        } else {
            startForeground(NOTE_ID, note);
        }

        AudioManager audio = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        boolean silent = audio != null && audio.getRingerMode() != AudioManager.RINGER_MODE_NORMAL;
        int res = sound == null ? 0 : getResources().getIdentifier(sound, "raw", getPackageName());
        Log.i(TAG, "start sound=" + sound + " res=" + res + " silent=" + silent + " silentOk=" + silentOk);
        if (res == 0 || (silent && !silentOk)) {
            // Keep the notice, drop the sound.
            stopForeground(STOP_FOREGROUND_DETACH);
            stopSelf();
            return START_NOT_STICKY;
        }
        play(res);
        return START_NOT_STICKY;
    }

    private void play(int res) {
        release();
        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                wake = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "muslimtodo:adhan");
                wake.acquire(6 * 60 * 1000L);
            }
            AudioAttributes attrs = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                .build();
            // Other apps' music pauses for the adhan and comes back after it.
            AudioManager am = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
            if (am != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                focus = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT).setAudioAttributes(attrs).build();
                am.requestAudioFocus(focus);
            }
            player = new MediaPlayer();
            player.setAudioAttributes(attrs);
            player.setDataSource(this, Uri.parse("android.resource://" + getPackageName() + "/" + res));
            player.setOnCompletionListener(mp -> finish());
            player.setOnErrorListener((mp, what, extra) -> { Log.w(TAG, "player error " + what + "/" + extra); finish(); return true; });
            player.prepare();
            player.start();
            tell(true);
            Log.i(TAG, "playing, " + player.getDuration() + " ms");
        } catch (Exception e) {
            Log.w(TAG, "could not play", e);
            finish();
        }
    }

    private void finish() {
        release();
        stopForeground(STOP_FOREGROUND_DETACH);
        stopSelf();
    }

    private void release() {
        if (player != null) {
            try { player.stop(); } catch (Exception ignored) { }
            player.release();
            player = null;
            tell(false);
        }
        AudioManager am = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        if (am != null && focus != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) am.abandonAudioFocusRequest(focus);
        focus = null;
        if (wake != null && wake.isHeld()) wake.release();
        wake = null;
    }

    @Override
    public void onDestroy() {
        release();
        super.onDestroy();
    }

    private Notification notification(String title, String body, String stop) {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm != null && nm.getNotificationChannel(CHANNEL) == null) {
            // The sound comes from the player, so the channel itself is quiet.
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Adhan", NotificationManager.IMPORTANCE_HIGH);
            ch.setSound(null, null);
            ch.enableVibration(true);
            ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            nm.createNotificationChannel(ch);
        }
        Intent stopIntent = new Intent(this, AdhanReceiver.class).setAction(AdhanReceiver.ACTION_STOP);
        PendingIntent stopPi = PendingIntent.getBroadcast(this, 4998, stopIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        return new NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_notify)
            .setContentTitle(title == null ? "" : title)
            .setContentText(body == null ? "" : body)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setContentIntent(AdhanAlarms.openApp(this))
            .setDeleteIntent(stopPi)
            .addAction(0, stop == null ? "Stop" : stop, stopPi)
            .setAutoCancel(true)
            .build();
    }
}
