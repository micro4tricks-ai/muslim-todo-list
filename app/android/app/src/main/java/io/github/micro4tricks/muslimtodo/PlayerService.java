package io.github.micro4tricks.muslimtodo;

import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import androidx.annotation.NonNull;
import androidx.annotation.OptIn;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.datasource.DefaultDataSource;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.session.DefaultMediaNotificationProvider;
import androidx.media3.session.MediaSession;
import androidx.media3.session.MediaSessionService;
import java.util.ArrayList;
import java.util.List;

/**
 * The app's audio player for the Listen tab (radio, whole surahs, audio tafsir): Media3 ExoPlayer
 * in a media service, so it keeps playing with the screen off, shows the usual media notification
 * and lock-screen controls, gives way to calls and to the adhan (audio focus), and follows the
 * stations' redirects between https and http. Each item may carry several links; when one fails
 * the next is tried. The page drives it through PlayerPlugin and hears back through {@link #listener}.
 */
@OptIn(markerClass = UnstableApi.class)
public class PlayerService extends MediaSessionService {

    private static final String TAG = "NoonPlayer";

    /** One item of the queue, as the page sends it. */
    static final class Item {
        final String key, title, sub;
        final String[] urls;
        final boolean live;
        Item(String key, String title, String sub, String[] urls, boolean live) {
            this.key = key; this.title = title; this.sub = sub; this.urls = urls; this.live = live;
        }
    }

    /** Told about every change, on the main thread (set by PlayerPlugin). */
    interface Listener { void onState(String state, int index, String key, long positionMs, long durationMs, String error); }
    static volatile Listener listener;
    static volatile PlayerService instance;

    private ExoPlayer player;
    private MediaSession session;
    private final List<Item> items = new ArrayList<>();
    private final Handler main = new Handler(Looper.getMainLooper());
    private String lastError = null;
    private boolean liveStopped = false;
    private Runnable sleepTask = null;
    private final Runnable tick = new Runnable() {
        @Override public void run() {
            if (player != null && player.isPlaying()) { emit(); main.postDelayed(this, 1000); }
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        DefaultHttpDataSource.Factory http = new DefaultHttpDataSource.Factory()
            .setUserAgent("MuslimToDoList/Android")
            .setAllowCrossProtocolRedirects(true) // radiojar answers https with an http address
            .setConnectTimeoutMs(15000)
            .setReadTimeoutMs(20000);
        player = new ExoPlayer.Builder(this)
            .setMediaSourceFactory(new DefaultMediaSourceFactory(new DefaultDataSource.Factory(this, http)))
            .setAudioAttributes(new AudioAttributes.Builder()
                .setUsage(C.USAGE_MEDIA)
                .setContentType(C.AUDIO_CONTENT_TYPE_SPEECH)
                .build(), /* handleAudioFocus= */ true)
            .setHandleAudioBecomingNoisy(true) // headphones out: pause
            .setWakeMode(C.WAKE_MODE_NETWORK)
            .build();
        player.addListener(new Player.Listener() {
            @Override public void onIsPlayingChanged(boolean playing) {
                if (playing) { lastError = null; liveStopped = false; main.removeCallbacks(tick); main.post(tick); }
                emit();
            }
            @Override public void onPlaybackStateChanged(int state) {
                if (state == Player.STATE_ENDED) { cancelSleep(); }
                emit();
            }
            @Override public void onMediaItemTransition(MediaItem item, int reason) { emit(); }
            @Override public void onPlayerError(@NonNull PlaybackException e) {
                Log.w(TAG, "error " + e.getErrorCodeName() + " on item " + player.getCurrentMediaItemIndex(), e);
                if (!tryNextLink()) { lastError = e.getErrorCodeName(); emit(); }
            }
        });
        session = new MediaSession.Builder(this, player).setSessionActivity(AdhanAlarms.openApp(this)).build();
        DefaultMediaNotificationProvider notes = new DefaultMediaNotificationProvider.Builder(this).build();
        notes.setSmallIcon(R.drawable.ic_stat_notify);
        setMediaNotificationProvider(notes);
        addSession(session);
        instance = this;
    }

    @Override
    public MediaSession onGetSession(@NonNull MediaSession.ControllerInfo controller) { return session; }

    /** Swiped away from recent apps: stop unless something is playing. */
    @Override
    public void onTaskRemoved(Intent rootIntent) {
        if (player == null || !player.getPlayWhenReady() || player.getMediaItemCount() == 0) stopSelf();
    }

    @Override
    public void onDestroy() {
        instance = null;
        main.removeCallbacksAndMessages(null);
        if (session != null) { session.release(); session = null; }
        if (player != null) { player.release(); player = null; }
        Listener l = listener;
        if (l != null) l.onState("idle", -1, null, 0, 0, null);
        super.onDestroy();
    }

    // ---- commands from the page (main thread) ----

    void load(List<Item> queue, int index, long positionMs) {
        cancelSleep();
        items.clear();
        items.addAll(queue);
        List<MediaItem> media = new ArrayList<>();
        for (Item it : items) media.add(mediaItem(it, 0));
        lastError = null;
        liveStopped = false;
        player.setMediaItems(media, Math.max(0, Math.min(index, media.size() - 1)), Math.max(0, positionMs));
        player.prepare();
        player.play();
    }

    void pause() {
        Item it = current();
        if (it != null && it.live) { player.stop(); liveStopped = true; emit(); } // a live stream resumes at "now"
        else player.pause();
    }

    void resume() {
        Item it = current();
        if (it != null && (it.live || liveStopped || player.getPlaybackState() == Player.STATE_IDLE)) {
            if (it.live) player.seekToDefaultPosition();
            player.prepare();
        }
        if (player.getPlaybackState() == Player.STATE_ENDED) player.seekTo(0, 0);
        player.play();
    }

    void skip(int by) {
        int i = player.getCurrentMediaItemIndex() + by;
        if (i >= 0 && i < player.getMediaItemCount()) { player.seekTo(i, 0); player.prepare(); player.play(); }
    }

    void stopAll() {
        cancelSleep();
        player.stop();
        player.clearMediaItems();
        items.clear();
        stopSelf();
    }

    /** Pause after the given minutes, fading out over a few seconds; 0 cancels. */
    void sleep(int minutes) {
        cancelSleep();
        if (minutes <= 0) return;
        sleepTask = () -> fade(10);
        main.postDelayed(sleepTask, minutes * 60_000L);
    }

    private void fade(int steps) {
        if (player == null) return;
        if (steps <= 0) { pause(); player.setVolume(1f); sleepTask = null; return; }
        player.setVolume(steps / 10f);
        sleepTask = () -> fade(steps - 1);
        main.postDelayed(sleepTask, 400);
    }

    private void cancelSleep() {
        if (sleepTask != null) main.removeCallbacks(sleepTask);
        sleepTask = null;
        if (player != null) player.setVolume(1f);
    }

    // ---- helpers ----

    private Item current() {
        int i = player == null ? -1 : player.getCurrentMediaItemIndex();
        return i >= 0 && i < items.size() ? items.get(i) : null;
    }

    private MediaItem mediaItem(Item it, int link) {
        Bundle extras = new Bundle();
        extras.putInt("link", link);
        return new MediaItem.Builder()
            .setMediaId(it.key)
            .setUri(it.urls[link])
            .setMediaMetadata(new MediaMetadata.Builder()
                .setTitle(it.title)
                .setArtist(it.sub)
                .setIsPlayable(true)
                .setExtras(extras)
                .build())
            .build();
    }

    /** The current item failed: play its next link, if it has one. */
    private boolean tryNextLink() {
        int i = player.getCurrentMediaItemIndex();
        Item it = current();
        MediaItem now = player.getCurrentMediaItem();
        if (it == null || now == null) return false;
        Bundle ex = now.mediaMetadata.extras;
        int link = (ex == null ? 0 : ex.getInt("link")) + 1;
        if (link >= it.urls.length) return false;
        Log.i(TAG, "trying link " + (link + 1) + " of " + it.urls.length + " for " + it.key);
        player.replaceMediaItem(i, mediaItem(it, link));
        player.seekTo(i, 0);
        player.prepare();
        player.play();
        return true;
    }

    private void emit() {
        Listener l = listener;
        if (l == null || player == null) return;
        String state;
        int ps = player.getPlaybackState();
        if (lastError != null) state = "error";
        else if (player.isPlaying()) state = "playing";
        else if (ps == Player.STATE_BUFFERING && player.getPlayWhenReady()) state = "loading";
        else if (ps == Player.STATE_ENDED) state = "ended";
        else state = "paused";
        Item it = current();
        long dur = player.getDuration();
        l.onState(state, player.getCurrentMediaItemIndex(), it == null ? null : it.key,
            Math.max(0, player.getCurrentPosition()), dur == C.TIME_UNSET ? 0 : dur, lastError);
    }
}
