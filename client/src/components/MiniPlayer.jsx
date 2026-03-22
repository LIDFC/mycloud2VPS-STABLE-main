import { useRef, useCallback, useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { usePlayer } from "../context/PlayerContext";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { getFeaturingList } from "../utils/trackArtists";
import styles from "./MiniPlayer.module.css";

const PLACEHOLDER = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='48' height='48'%3E%3Crect width='48' height='48' fill='%23222'/%3E%3Ccircle cx='24' cy='24' r='10' fill='%23333'/%3E%3C/svg%3E`;

function fmt(seconds) {
  if (!seconds || Number.isNaN(seconds)) return "0:00";
  return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, "0")}`;
}

function RepeatIcon({ mode }) {
  return (
    <span className={styles.repeatWrap}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
        <polyline points="17 1 21 5 17 9" />
        <path d="M3 11V9a4 4 0 0 1 4-4h14" />
        <polyline points="7 23 3 19 7 15" />
        <path d="M21 13v2a4 4 0 0 1-4 4H3" />
      </svg>
      {mode === 2 && <span className={styles.repeatOne}>1</span>}
    </span>
  );
}

function VolumeIcon({ value }) {
  if (value === 0) {
    return <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15"><path d="M16.5 12A4.5 4.5 0 0 0 14 7.97v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.8 8.8 0 0 0 21 12c0-4.28-2.99-7.86-7-8.76v2.05c2.89.86 5 3.54 5 6.71zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4 9.91 6.09 12 8.18V4z"/></svg>;
  }
  return <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>;
}

export default function MiniPlayer({ onExpand }) {
  const {
    currentTrack, isPlaying, currentTime, duration, volume,
    isShuffle, repeatMode, togglePlay, seek, setVolume, skipNext, skipPrev,
    toggleShuffle, cycleRepeatMode, likeCurrentTrack,
  } = usePlayer();
  const { user } = useAuth();
  const toast = useToast();

  const progressRef = useRef(null);
  const volBarRef = useRef(null);
  const [draggingVol, setDraggingVol] = useState(false);
  const [draggingProg, setDraggingProg] = useState(false);
  const [hoverRatio, setHoverRatio] = useState(null);
  const [hoverTime, setHoverTime] = useState(null);

  const calcRatio = useCallback((event, ref) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return null;
    const clientX = event.touches?.[0]?.clientX ?? event.clientX;
    if (typeof clientX !== "number") return null;
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  }, []);

  const updateProgress = useCallback((event) => {
    const ratio = calcRatio(event, progressRef);
    if (ratio === null) return;
    setHoverRatio(ratio);
    setHoverTime(duration ? ratio * duration : null);
    seek(ratio);
  }, [calcRatio, duration, seek]);

  const updateVolume = useCallback((event) => {
    const ratio = calcRatio(event, volBarRef);
    if (ratio === null) return;
    setVolume(ratio);
  }, [calcRatio, setVolume]);

  useEffect(() => {
    if (!draggingProg) return undefined;
    const move = (event) => updateProgress(event);
    const up = () => setDraggingProg(false);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [draggingProg, updateProgress]);

  useEffect(() => {
    if (!draggingVol) return undefined;
    const move = (event) => updateVolume(event);
    const up = () => setDraggingVol(false);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [draggingVol, updateVolume]);

  const handleLike = () => {
    if (!user) {
      toast("Sign in to like tracks", "error");
      return;
    }
    likeCurrentTrack((result) => toast(result.likedByMe ? "Added to liked ♥" : "Removed from liked", result.likedByMe ? "success" : "info"));
  };

  const progress = duration ? currentTime / duration : 0;
  const liked = currentTrack?.likedByMe;

  return (
    <>
      <footer className={`${styles.bar} ${currentTrack ? styles.visible : ""}`}>
        <div
          className={`${styles.seekBar} ${currentTrack ? styles.seekBarVisible : ""}`}
          ref={progressRef}
          onPointerDown={(event) => { setDraggingProg(true); updateProgress(event); }}
          onPointerMove={(event) => {
            const ratio = calcRatio(event, progressRef);
            if (ratio !== null) {
              setHoverRatio(ratio);
              setHoverTime(duration ? ratio * duration : null);
            }
          }}
          onPointerLeave={() => { setHoverRatio(null); setHoverTime(null); }}
        >
          {hoverRatio !== null && <div className={styles.seekGhost} style={{ width: `${hoverRatio * 100}%` }} />}
          <div className={styles.seekFill} style={{ width: `${progress * 100}%` }} />
          <div className={styles.seekThumb} style={{ left: `${(draggingProg && hoverRatio !== null ? hoverRatio : progress) * 100}%` }} />
          {hoverTime !== null && <div className={styles.seekTooltip} style={{ left: `${hoverRatio * 100}%` }}>{fmt(hoverTime)}</div>}
        </div>
        <div className={styles.left}>
          <button className={styles.coverBtn} onClick={onExpand} aria-label="Open full player">
            <img src={currentTrack?.coverUrl || PLACEHOLDER} alt="cover" className={styles.cover} onError={(event) => { event.currentTarget.src = PLACEHOLDER; }} />
          </button>
          <div className={styles.meta}>
            <button className={styles.titleBtn} onClick={onExpand}>{currentTrack?.title ?? "—"}</button>
            {currentTrack ? (
              <div className={styles.artistLinks}>
                <Link
                  to={`/profile/${encodeURIComponent(currentTrack.artist)}`}
                  className={styles.artistLink}
                  onClick={e => e.stopPropagation()}
                >
                  {currentTrack.artist}
                </Link>
                {getFeaturingList(currentTrack).map((feat, i) => (
                  <span key={i}>
                    <span className={styles.featSep}>{i === 0 ? " feat. " : ", "}</span>
                    {feat.type === "user" ? (
                      <Link
                        to={`/profile/${encodeURIComponent(feat.username)}`}
                        className={styles.artistLink}
                        onClick={e => e.stopPropagation()}
                      >
                        {feat.display}
                      </Link>
                    ) : (
                      <span className={styles.featText}>{feat.display}</span>
                    )}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          <button className={`${styles.iconBtn} ${liked ? styles.liked : ""}`} onClick={handleLike} aria-label="Like">
            <svg viewBox="0 0 24 24" fill={liked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" width="15" height="15"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          </button>
        </div>

        <div className={styles.centre}>
          <div className={styles.controls}>
            <button className={`${styles.iconBtn} ${isShuffle ? styles.shuffleOn : ""}`} onClick={toggleShuffle} title="Shuffle">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/></svg>
            </button>
            <button className={styles.iconBtn} onClick={() => skipPrev()}><svg viewBox="0 0 24 24" fill="currentColor" width="17" height="17"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg></button>
            <button className={styles.playBtn} onClick={togglePlay}>{isPlaying ? <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><rect x="5" y="3" width="4" height="18" rx="2"/><rect x="15" y="3" width="4" height="18" rx="2"/></svg> : <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M8 5.14v14l11-7-11-7z"/></svg>}</button>
            <button className={styles.iconBtn} onClick={() => skipNext(true)}><svg viewBox="0 0 24 24" fill="currentColor" width="17" height="17"><path d="M6 18l8.5-6L6 6v12zm2.5-6L16 6h2v12h-2z"/></svg></button>
            <button className={`${styles.iconBtn} ${repeatMode ? styles.repeatOn : ""}`} onClick={cycleRepeatMode} title="Repeat">
              <RepeatIcon mode={repeatMode} />
            </button>
            <span className={styles.timeDisplay}>{fmt(currentTime)} / {fmt(duration)}</span>
          </div>
        </div>

        <div className={styles.right}>
          <button className={styles.iconBtn} onClick={() => setVolume(volume > 0 ? 0 : 0.8)}>
            <VolumeIcon value={volume} />
          </button>
          <div className={styles.volWrap} ref={volBarRef} onPointerDown={(event) => { setDraggingVol(true); updateVolume(event); }}>
            <div className={styles.volTrack}>
              <div className={styles.volFill} style={{ width: `${volume * 100}%` }}>
                <div className={styles.volThumb} />
              </div>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}
