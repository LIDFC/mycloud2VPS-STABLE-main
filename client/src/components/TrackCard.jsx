import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { usePlayer } from "../context/PlayerContext";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { api } from "../api";
import RepostButton from "./RepostButton";
import TrackMenu from "./TrackMenu";
import { getFeaturingList } from "../utils/trackArtists";
import styles from "./TrackCard.module.css";

const PLACEHOLDER = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Crect width='300' height='300' fill='%231a1a1a'/%3E%3Ccircle cx='150' cy='150' r='55' fill='%23242424'/%3E%3Ccircle cx='150' cy='150' r='18' fill='%232e2e2e'/%3E%3C/svg%3E`;

export default function TrackCard({ track, onLikeChange, queue }) {
  const { loadTrack, currentTrack, isPlaying, togglePlay } = usePlayer();
  const { user } = useAuth();
  const toast = useToast();

  const [likesCount, setLikesCount] = useState(track.likesCount);
  const [likedByMe, setLikedByMe] = useState(track.likedByMe);
  const [repostCount, setRepostCount] = useState(track.repostCount || 0);
  const [repostedByMe, setRepostedByMe] = useState(track.repostedByMe || false);
  const [liking, setLiking] = useState(false);

  const isActive = currentTrack?.id === track.id;
  const featuring = useMemo(() => getFeaturingList(track), [track]);

  const handlePlay = () => {
    if (isActive) togglePlay();
    else loadTrack(track, queue || undefined);
  };

  const handleLike = async (event) => {
    event.stopPropagation();
    if (!user) {
      toast("Sign in to like tracks", "error");
      return;
    }
    if (liking) return;
    setLiking(true);
    try {
      const result = await api.likeTrack(track.id);
      setLikesCount(result.likesCount);
      setLikedByMe(result.likedByMe);
      onLikeChange?.(track.id, result);
    } catch {
      toast("Failed to update like", "error");
    } finally {
      setLiking(false);
    }
  };

  return (
    <article className={`${styles.card} ${isActive ? styles.active : ""}`}>
      <div className={styles.coverWrapper} onClick={handlePlay}>
        <img
          src={track.coverUrl || PLACEHOLDER}
          alt={`${track.title} cover`}
          className={styles.cover}
          onError={(event) => { event.currentTarget.src = PLACEHOLDER; }}
          loading="lazy"
        />
        <div className={styles.overlay}>
          <button className={styles.playBtn} aria-label={isActive && isPlaying ? "Pause" : "Play"}>
            {isActive && isPlaying
              ? <svg viewBox="0 0 24 24" fill="currentColor" width="26" height="26"><rect x="5" y="3" width="4" height="18" rx="2"/><rect x="15" y="3" width="4" height="18" rx="2"/></svg>
              : <svg viewBox="0 0 24 24" fill="currentColor" width="26" height="26"><path d="M8 5.14v14l11-7-11-7z"/></svg>}
          </button>
        </div>
        {isActive && isPlaying && (
          <div className={styles.nowPlaying} aria-hidden="true">
            <span /><span /><span /><span />
          </div>
        )}
      </div>

      <div className={styles.info}>
        <div className={styles.titleRow}>
          <p className={styles.title} title={track.title}>{track.title}</p>
          <div className={styles.titleActions}>
            <button
              className={`${styles.likeBtn} ${likedByMe ? styles.liked : ""}`}
              onClick={handleLike}
              aria-label={likedByMe ? "Unlike" : "Like"}
            >
              <svg viewBox="0 0 24 24" fill={likedByMe ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" width="14" height="14">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
              </svg>
              {likesCount > 0 && <span>{likesCount}</span>}
            </button>
            <TrackMenu
              track={{ ...track, likedByMe }}
              onLikeChange={(id, result) => {
                setLikedByMe(result.likedByMe);
                setLikesCount(result.likesCount);
                onLikeChange?.(id, result);
              }}
            />
          </div>
        </div>

        <div className={styles.artistRow}>
          <Link
            to={`/profile/${encodeURIComponent(track.artist)}`}
            className={styles.artistLink}
            onClick={(event) => event.stopPropagation()}
            title={`View ${track.artist}'s profile`}
          >
            {track.artist}
          </Link>

          {featuring.length > 0 && (
            <div className={styles.featWrap} onClick={(event) => event.stopPropagation()}>
              <span className={styles.featLabel}>feat.</span>
              {featuring.map((entry, index) => (
                entry.type === "user" ? (
                  <Link key={`${entry.username}-${index}`} to={`/profile/${encodeURIComponent(entry.username)}`} className={styles.featChip}>
                    {entry.display}
                  </Link>
                ) : (
                  <span key={`${entry.display}-${index}`} className={styles.featChip}>
                    {entry.display}
                  </span>
                )
              ))}
            </div>
          )}
        </div>

        {track.genre && <span className={styles.genre}>{track.genre}</span>}

        <div className={styles.stats}>
          {(track.playsCount > 0 || track.playsFormatted) && (
            <span className={styles.plays}>
              <svg viewBox="0 0 24 24" fill="currentColor" width="9" height="9"><path d="M8 5.14v14l11-7-11-7z"/></svg>
              {track.playsFormatted || track.playsCount}
            </span>
          )}
          <RepostButton
            track={{ ...track, repostCount, repostedByMe }}
            onUpdate={(update) => { setRepostCount(update.repostCount); setRepostedByMe(update.repostedByMe); }}
          />
        </div>
      </div>
    </article>
  );
}
