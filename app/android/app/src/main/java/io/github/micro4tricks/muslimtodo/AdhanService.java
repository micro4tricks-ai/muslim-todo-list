package io.github.micro4tricks.muslimtodo;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.KeyguardManager;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaPlayer;
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
import android.provider.Settings;
import android.util.Log;
import androidx.core.app.NotificationCompat;

/**
 * Plays the adhan through the alarm stream, so it is heard even when notification sounds are
 * quiet, with a notification that stops it. When the phone is on silent or vibrate it only shows
 * the notification, unless the user chose to hear the adhan anyway.
 * While it plays, turning the phone face down or pressing a volume or power button silences it,
 * for someone who is praying or in the bathroom and cannot reach the screen. Only the user's own
 * action does: other streams' volume changes and the screen timing out leave it playing.
 */
public class AdhanService extends Service {

    private static final String CHANNEL = "adhan-player";
    private static final String TAG = "NoonAdhan";
    static final int NOTE_ID = 4242;
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
    private static final long ON_UNKNOWN = -2;
    // When the screen last turned on (elapsedRealtime); -1 off, ON_UNKNOWN on since before the start.
    private long screenOnAt = -1;
    private final BroadcastReceiver buttons = new BroadcastReceiver() {
        @Override public void onReceive(Context c, Intent i) {
            String action = i.getAction();
            int stream = i.getIntExtra("android.media.EXTRA_VOLUME_STREAM_TYPE", -1);
            Log.i(TAG, "heard " + action + " stream " + stream);
            long now = SystemClock.elapsedRealtime();
            long lastOn = screenOnAt;
            if (Intent.ACTION_SCREEN_ON.equals(action)) screenOnAt = now;
            else if (Intent.ACTION_SCREEN_OFF.equals(action)) screenOnAt = -1;
            // Ignore what our own start causes (screen waking for the notification, the volume step).
            if (now - startedAt < 1500) return;
            if ("android.media.VOLUME_CHANGED_ACTION".equals(action)) {
                // The session routes the keys to the alarm stream; media, ring or Bluetooth
                // volume changes are someone else's.
                if (stream != AudioManager.STREAM_ALARM) return;
            } else if (Intent.ACTION_SCREEN_OFF.equals(action) && timedOut(lastOn, now)) {
                Log.i(TAG, "screen timed out, still playing");
                return;
            }
            quiet(action);
        }
    };

    /**
     * Whether a screen-off is the screen timing out rather than the power key: it comes at the
     * timeout after the screen turned on, or later, as a touch restarts the timeout. Limits: when
     * another app keeps the screen on past the timeout, a power key press then looks the same and is
     * ignored; when the screen was already on as the adhan began, its timeout may come at any time,
     * so a screen-off is ignored until the screen turns on again (which itself silences it). Turning
     * the phone over or a volume key always silences it.
     */
    private boolean timedOut(long lastOn, long now) {
        if (lastOn == ON_UNKNOWN) return true;
        if (lastOn < 0) return false;
        long timeout = 30000;
        try { timeout = Settings.System.getLong(getContentResolver(), Settings.System.SCREEN_OFF_TIMEOUT, 30000); } catch (Exception ignored) { }
        // A screen woken on the lock screen goes off sooner (the keyguard's 10 s).
        KeyguardManager km = (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
        if (km != null && km.isKeyguardLocked()) timeout = Math.min(timeout, 10000);
        return now - lastOn >= timeout - 1500;
    }
    private boolean listening;
    private MediaSession session;
    private int alarmBefore = -1;   // the alarm volume before the adhan, put back after it
    private static final String ALARM_BEFORE = "alarmBefore"; // the same, kept in AdhanAlarms.PREFS

    /** Puts back an alarm volume left changed by a service that was killed before it could. */
    static void restoreAlarm(Context ctx) {
        SharedPreferences p = ctx.getSharedPreferences(AdhanAlarms.PREFS, Context.MODE_PRIVATE);
        int v = p.getInt(ALARM_BEFORE, -1);
        if (v < 0) return;
        AudioManager am = (AudioManager) ctx.getSystemService(Context.AUDIO_SERVICE);
        try { if (am != null) am.setStreamVolume(AudioManager.STREAM_ALARM, v, 0); } catch (Exception ignored) { }
        p.edit().remove(ALARM_BEFORE).commit();
        Log.i(TAG, "alarm volume restored to " + v);
    }

    /** Told when the adhan starts and stops, so the page can pause its radio (set by AdhanPlugin). */
    interface Listener { void onPlaying(boolean playing); }
    static volatile Listener listener;
    static volatile boolean playing; // for a page that opens while the adhan already plays

    private static void tell(boolean playing) {
        AdhanService.playing = playing;
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

        Notification note = notification(this, title, body, stop);
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
            startGestures();
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
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        screenOnAt = pm != null && pm.isInteractive() ? ON_UNKNOWN : -1;
        try {
            sensors = (SensorManager) getSystemService(Context.SENSOR_SERVICE);
            Sensor acc = sensors == null ? null : sensors.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
            if (acc != null) sensors.registerListener(flipListener, acc, SensorManager.SENSOR_DELAY_NORMAL);
            try {
                // A playing session on the alarm stream makes the volume keys change the alarm
                // volume (the adhan's), whatever app is open or with the screen off; the change is
                // what we hear about. Android 12+ ignores the keys for a remote-volume session.
                session = new MediaSession(this, "adhan");
                session.setPlaybackState(new PlaybackState.Builder()
                    .setState(PlaybackState.STATE_PLAYING, 0, 1f).build());
                session.setPlaybackToLocal(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build());
                session.setActive(true);
            } catch (Exception e) { Log.w(TAG, "no volume session", e); }
            // At the loudest or quietest step a key changes nothing, so nothing is sent: move one
            // step in for the adhan. The volume is put back after, also when a key changed it.
            restoreAlarm(this);
            alarmBefore = -1;
            AudioManager am = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
            if (am != null) {
                int v = am.getStreamVolume(AudioManager.STREAM_ALARM);
                int max = am.getStreamMaxVolume(AudioManager.STREAM_ALARM);
                int min = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? am.getStreamMinVolume(AudioManager.STREAM_ALARM) : 0;
                int to = v >= max ? max - 1 : v <= min ? min + 1 : v;
                alarmBefore = v;
                if (to != v && to >= min && to <= max) {
                    // Kept on disk first, so a kill before the restore is mended at the next start or boot.
                    getSharedPreferences(AdhanAlarms.PREFS, Context.MODE_PRIVATE).edit().putInt(ALARM_BEFORE, v).commit();
                    try { am.setStreamVolume(AudioManager.STREAM_ALARM, to, 0); } catch (Exception ignored) { }
                }
                Log.i(TAG, "alarm volume " + v + " (" + min + ".." + max + ") -> " + to);
            }
            IntentFilter f = new IntentFilter();
            f.addAction("android.media.VOLUME_CHANGED_ACTION");
            f.addAction(Intent.ACTION_SCREEN_OFF);
            f.addAction(Intent.ACTION_SCREEN_ON);
            if (Build.VERSION.SDK_INT >= 33) registerReceiver(buttons, f, Context.RECEIVER_EXPORTED);
            else registerReceiver(buttons, f);
            Log.i(TAG, "silence by flip " + (acc != null) + ", volume " + (session != null) + ", power true");
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
        if (alarmBefore >= 0) {
            AudioManager am = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
            try { if (am != null) am.setStreamVolume(AudioManager.STREAM_ALARM, alarmBefore, 0); } catch (Exception ignored) { }
            alarmBefore = -1;
            getSharedPreferences(AdhanAlarms.PREFS, Context.MODE_PRIVATE).edit().remove(ALARM_BEFORE).apply();
        }
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

    /** The adhan's notice; AdhanReceiver posts it alone when the player may not start. */
    static Notification notification(Context ctx, String title, String body, String stop) {
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm != null && nm.getNotificationChannel(CHANNEL) == null) {
            // The sound comes from the player, so the channel itself is quiet.
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Adhan", NotificationManager.IMPORTANCE_HIGH);
            ch.setSound(null, null);
            ch.enableVibration(true);
            ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            nm.createNotificationChannel(ch);
        }
        Intent stopIntent = new Intent(ctx, AdhanReceiver.class).setAction(AdhanReceiver.ACTION_STOP);
        PendingIntent stopPi = PendingIntent.getBroadcast(ctx, 4998, stopIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        return new NotificationCompat.Builder(ctx, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_notify)
            .setContentTitle(title == null ? "" : title)
            .setContentText(body == null ? "" : body)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setContentIntent(AdhanAlarms.openApp(ctx))
            .setDeleteIntent(stopPi)
            .addAction(0, stop == null ? "Stop" : stop, stopPi)
            .setAutoCancel(true)
            .build();
    }
}
