package io.github.micro4tricks.muslimtodo;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.media.VolumeProvider;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.net.Uri;
import android.os.Build;
import android.os.IBinder;
import android.os.SystemClock;
import android.os.PowerManager;
import android.util.Log;
import androidx.core.app.NotificationCompat;

/**
 * Plays the adhan through the alarm stream, so it is heard even when notification sounds are
 * quiet, with a notification that stops it. When the phone is on silent or vibrate it only shows
 * the notification, unless the user chose to hear the adhan anyway.
 * While it plays, turning the phone face down or pressing a volume or power button silences it,
 * for someone who is praying or in the bathroom and cannot reach the screen.
 */
public class AdhanService extends Service {

    private static final String CHANNEL = "adhan-player";
    private static final String TAG = "NoonAdhan";
    private static final int NOTE_ID = 4242;
    private MediaPlayer player;
    private PowerManager.WakeLock wake;
    private AudioFocusRequest focus;
    private SensorManager sensors;
    private boolean armed;          // true once the phone has been seen not face down
    private long startedAt;
    private final SensorEventListener flipListener = new SensorEventListener() {
        @Override public void onSensorChanged(SensorEvent e) {
            boolean faceDown = e.values[2] < -7f;
            if (!faceDown) armed = true;
            else if (armed) quiet("face down");
        }
        @Override public void onAccuracyChanged(Sensor s, int accuracy) { }
    };
    private final BroadcastReceiver buttons = new BroadcastReceiver() {
        @Override public void onReceive(Context c, Intent i) {
            // Ignore what our own start causes (screen waking for the notification).
            if (SystemClock.elapsedRealtime() - startedAt < 1500) return;
            quiet(i.getAction());
        }
    };
    private boolean listening;
    private MediaSession session;

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

    private void quiet(String why) {
        Log.i(TAG, "silenced by " + why);
        finish();
    }

    private void startGestures() {
        if (listening) return;
        listening = true;
        startedAt = SystemClock.elapsedRealtime();
        armed = false;
        try {
            sensors = (SensorManager) getSystemService(Context.SENSOR_SERVICE);
            Sensor acc = sensors == null ? null : sensors.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
            if (acc != null) sensors.registerListener(flipListener, acc, SensorManager.SENSOR_DELAY_NORMAL);
            try {
                // A playing media session with its own volume gets every volume key press, even at
                // the loudest or quietest level, where the system sends no volume-changed broadcast.
                session = new MediaSession(this, "adhan");
                session.setPlaybackState(new PlaybackState.Builder()
                    .setState(PlaybackState.STATE_PLAYING, 0, 1f).build());
                session.setPlaybackToRemote(new VolumeProvider(VolumeProvider.VOLUME_CONTROL_RELATIVE, 100, 50) {
                    @Override public void onAdjustVolume(int direction) { quiet("volume key"); }
                });
                session.setActive(true);
            } catch (Exception e) { Log.w(TAG, "no volume session", e); }
            IntentFilter f = new IntentFilter();
            f.addAction("android.media.VOLUME_CHANGED_ACTION");
            f.addAction(Intent.ACTION_SCREEN_OFF);
            f.addAction(Intent.ACTION_SCREEN_ON);
            if (Build.VERSION.SDK_INT >= 33) registerReceiver(buttons, f, Context.RECEIVER_EXPORTED);
            else registerReceiver(buttons, f);
        } catch (Exception e) {
            Log.w(TAG, "gestures unavailable", e);
        }
    }

    private void stopGestures() {
        if (!listening) return;
        listening = false;
        try { if (sensors != null) sensors.unregisterListener(flipListener); } catch (Exception ignored) { }
        try { unregisterReceiver(buttons); } catch (Exception ignored) { }
        try { if (session != null) { session.setActive(false); session.release(); } } catch (Exception ignored) { }
        session = null;
    }

    private void release() {
        stopGestures();
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
