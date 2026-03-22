import { createContext, useContext, useRef, useState, useEffect, useCallback, useMemo } from "react";
import { api } from "../api";

const PlayerContext = createContext(null);

function shuffleArray(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function PlayerProvider({ children, tracks: initialTracks }) {
  const audioRef = useRef(null);
  if (!audioRef.current) {
    const audio = new Audio();
    audio.preload = "auto";
    audioRef.current = audio;
  }

  const [queue, setQueueState] = useState(initialTracks || []);
  const [isShuffle, setIsShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState(0);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(1);

  useEffect(() => {
    if (initialTracks) setQueueState(initialTracks);
  }, [initialTracks]);

  const loadTrack = useCallback((track, customQueue) => {
    const audio = audioRef.current;
    audio.src = track.audioUrl;
    audio.load();
    setCurrentTrack(track);
    setProgress(0);
    setCurrentTime(0);
    setDuration(0);
    if (customQueue) setQueueState(customQueue);
    audio.play().catch(() => {});
    api.recordListen(track.id).catch(() => {});
  }, []);

  const play = useCallback(async () => {
    const audio = audioRef.current;
    try {
      // On iOS, audio can enter "suspended" state when the page goes to background.
      // We need to resume the AudioContext or reload the source before playing.
      if (audio.error || (audio.networkState === 3 && audio.src)) {
        // networkState 3 = NETWORK_NO_SOURCE — reload and seek back
        const savedTime = audio.currentTime;
        audio.load();
        audio.currentTime = savedTime;
      }
      await audio.play();
    } catch {
      // If play() is still blocked, try once more after a microtask
      try { await audio.play(); } catch { /* give up silently */ }
    }
  }, []);
  const pause = useCallback(() => audioRef.current.pause(), []);
  const togglePlay = useCallback(() => {
    if (!currentTrack) return;
    if (audioRef.current.paused) play();
    else pause();
  }, [currentTrack, play, pause]);

  const seek = useCallback((ratio) => {
    const audio = audioRef.current;
    if (!audio.duration || Number.isNaN(audio.duration)) return;
    audio.currentTime = Math.max(0, Math.min(audio.duration, ratio * audio.duration));
  }, []);

  const seekToSeconds = useCallback((seconds) => {
    const audio = audioRef.current;
    const safeDuration = Number.isFinite(audio.duration) ? audio.duration : duration;
    if (!safeDuration) return;
    audio.currentTime = Math.max(0, Math.min(safeDuration, seconds));
  }, [duration]);

  const setVolume = useCallback((value) => {
    const next = Math.max(0, Math.min(1, value));
    audioRef.current.volume = next;
    setVolumeState(next);
  }, []);

  const getCurrentIndex = useCallback(() => {
    if (!currentTrack || !queue?.length) return -1;
    return queue.findIndex((track) => track.id === currentTrack.id);
  }, [currentTrack, queue]);

  const skipToTrack = useCallback((track, customQueue) => {
    loadTrack(track, customQueue || queue);
  }, [loadTrack, queue]);

  const skipNext = useCallback((manual = true) => {
    if (!currentTrack || !queue?.length) return;
    const currentIndex = getCurrentIndex();

    if (repeatMode === 2 && !manual) {
      seekToSeconds(0);
      play();
      return;
    }

    if (isShuffle) {
      const others = queue.filter((track) => track.id !== currentTrack.id);
      if (others.length) {
        loadTrack(others[Math.floor(Math.random() * others.length)], queue);
        return;
      }
      if (repeatMode === 1 || manual) {
        loadTrack(currentTrack, queue);
        return;
      }
      pause();
      return;
    }

    if (currentIndex === -1) return;
    const nextIndex = currentIndex + 1;
    if (nextIndex < queue.length) {
      loadTrack(queue[nextIndex], queue);
      return;
    }

    if (repeatMode === 1 || manual) {
      loadTrack(queue[0], queue);
      return;
    }

    pause();
    seekToSeconds(duration || 0);
  }, [currentTrack, queue, getCurrentIndex, isShuffle, loadTrack, pause, play, repeatMode, seekToSeconds, duration]);

  const skipPrev = useCallback(() => {
    if (!currentTrack || !queue?.length) return;
    if (audioRef.current.currentTime > 3) {
      seekToSeconds(0);
      return;
    }

    const currentIndex = getCurrentIndex();
    if (currentIndex === -1) return;

    if (isShuffle) {
      const others = queue.filter((track) => track.id !== currentTrack.id);
      if (others.length) {
        loadTrack(others[Math.floor(Math.random() * others.length)], queue);
      }
      return;
    }

    const prevIndex = currentIndex - 1;
    if (prevIndex >= 0) {
      loadTrack(queue[prevIndex], queue);
      return;
    }

    loadTrack(queue[queue.length - 1], queue);
  }, [currentTrack, queue, getCurrentIndex, isShuffle, loadTrack, seekToSeconds]);

  const toggleShuffle = useCallback(() => setIsShuffle((value) => !value), []);
  const cycleRepeatMode = useCallback(() => setRepeatMode((value) => (value + 1) % 3), []);

  // Add a track to the end of the queue
  const addToQueue = useCallback((track) => {
    setQueueState((prev) => {
      if (prev.find((t) => t.id === track.id)) return prev;
      return [...prev, track];
    });
  }, []);

  // Insert a track right after the current one
  const playNext = useCallback((track) => {
    setQueueState((prev) => {
      const filtered = prev.filter((t) => t.id !== track.id);
      const currentIndex = filtered.findIndex((t) => t.id === currentTrack?.id);
      const insertAt = currentIndex >= 0 ? currentIndex + 1 : 0;
      return [...filtered.slice(0, insertAt), track, ...filtered.slice(insertAt)];
    });
  }, [currentTrack]);

  const playShuffled = useCallback((trackList) => {
    if (!trackList?.length) return;
    const shuffled = shuffleArray(trackList);
    setQueueState(shuffled);
    loadTrack(shuffled[0], shuffled);
  }, [loadTrack]);

  const likeCurrentTrack = useCallback(async (onResult) => {
    if (!currentTrack) return;
    try {
      const result = await api.likeTrack(currentTrack.id);
      setCurrentTrack((track) => (track ? { ...track, likedByMe: result.likedByMe, likesCount: result.likesCount } : track));
      setQueueState((prev) => prev.map((track) => (track.id === currentTrack.id ? { ...track, likedByMe: result.likedByMe, likesCount: result.likesCount } : track)));
      onResult?.(result);
    } catch (error) {
      console.error(error);
    }
  }, [currentTrack]);

  useEffect(() => {
    const audio = audioRef.current;
    const onTime = () => {
      setCurrentTime(audio.currentTime);
      setProgress(audio.duration ? audio.currentTime / audio.duration : 0);
      if ("mediaSession" in navigator && Number.isFinite(audio.duration) && typeof navigator.mediaSession.setPositionState === "function") {
        try {
          navigator.mediaSession.setPositionState({
            duration: audio.duration,
            playbackRate: audio.playbackRate || 1,
            position: Math.min(audio.currentTime, audio.duration),
          });
        } catch {
          // Safari may reject some states during transient loads.
        }
      }
    };
    const onMeta = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    const onPlay = () => {
      setIsPlaying(true);
      if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "playing";
    };
    const onPause = () => {
      setIsPlaying(false);
      if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "paused";
    };
    const onEnded = () => skipNext(false);

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);

    // iOS Safari suspends audio when the page goes to background.
    // When the user returns and presses play (via Control Center or in-app),
    // we need to recover: if audio.src is still set but networkState is broken, reload it.
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible" && audio.src && audio.error) {
        const savedTime = audio.currentTime;
        audio.load();
        audio.currentTime = savedTime;
        // Don't auto-play — respect the user's paused state
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [skipNext]);

  useEffect(() => {
    if (!("mediaSession" in navigator) || !currentTrack) return undefined;

    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentTrack.title,
      artist: currentTrack.artistLine || currentTrack.artist,
      artwork: currentTrack.coverUrl
        ? [
            { src: new URL(currentTrack.coverUrl, window.location.origin).href, sizes: "512x512", type: "image/jpeg" },
            { src: new URL(currentTrack.coverUrl, window.location.origin).href, sizes: "256x256", type: "image/jpeg" },
          ]
        : [],
    });

    const safeSetHandler = (action, handler) => {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
        // Ignore unsupported actions per browser.
      }
    };

    safeSetHandler("play", () => { play(); navigator.mediaSession.playbackState = "playing"; });
    safeSetHandler("pause", () => { pause(); navigator.mediaSession.playbackState = "paused"; });
    safeSetHandler("previoustrack", () => skipPrev());
    safeSetHandler("nexttrack", () => skipNext(true));
    // NOTE: seekbackward/seekforward intentionally NOT registered —
    // when these are set, iOS Control Center shows ±10s scrub buttons instead of prev/next.
    safeSetHandler("seekto", (details) => {
      if (typeof details.seekTime !== "number") return;
      seekToSeconds(details.seekTime);
    });
    // "like" action — shown as star icon in iOS Control Center (iOS 16.4+)
    safeSetHandler("togglemicrophone", null); // clear unused actions
    safeSetHandler("togglecamera", null);
    safeSetHandler("hangup", null);

    return () => {
      ["play", "pause", "previoustrack", "nexttrack", "seekto"].forEach((action) => {
        safeSetHandler(action, null);
      });
    };
  }, [currentTrack, pause, play, seekToSeconds, skipNext, skipPrev]);

  const value = useMemo(() => ({
    currentTrack,
    isPlaying,
    progress,
    currentTime,
    duration,
    volume,
    isShuffle,
    repeatMode,
    queue,
    loadTrack,
    togglePlay,
    seek,
    seekToSeconds,
    setVolume,
    skipNext,
    skipPrev,
    skipToTrack,
    toggleShuffle,
    cycleRepeatMode,
    playShuffled,
    likeCurrentTrack,
    addToQueue,
    playNext,
  }), [
    currentTrack,
    isPlaying,
    progress,
    currentTime,
    duration,
    volume,
    isShuffle,
    repeatMode,
    queue,
    loadTrack,
    togglePlay,
    seek,
    seekToSeconds,
    setVolume,
    skipNext,
    skipPrev,
    skipToTrack,
    toggleShuffle,
    cycleRepeatMode,
    playShuffled,
    likeCurrentTrack,
    addToQueue,
    playNext,
  ]);

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function usePlayer() {
  return useContext(PlayerContext);
}
