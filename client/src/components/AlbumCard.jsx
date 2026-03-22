import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import styles from "./AlbumCard.module.css";

const PLACEHOLDER = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Crect width='300' height='300' fill='%231a1a1a'/%3E%3Crect x='80' y='60' width='140' height='140' rx='4' fill='%23242424'/%3E%3Crect x='95' y='75' width='110' height='110' rx='2' fill='%232e2e2e'/%3E%3Ccircle cx='150' cy='215' r='18' fill='%23242424'/%3E%3C/svg%3E`;

export default function AlbumCard({ album, onLikeChange }) {
  const { user } = useAuth();
  const toast    = useToast();
  const [liked, setLiked] = useState(album.likedByMe || false);
  const [likesCount, setLikesCount] = useState(album.likesCount || 0);
  const [liking, setLiking] = useState(false);

  useEffect(() => {
    setLiked(album.likedByMe || false);
    setLikesCount(album.likesCount || 0);
  }, [album.id, album.likedByMe, album.likesCount]);

  const handleLike = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) { toast("Sign in to like albums", "error"); return; }
    if (liking) return;
    setLiking(true);
    try {
      const res = await api.likeAlbum(album.id);
      setLiked(res.likedByMe);
      setLikesCount(res.likesCount);
      onLikeChange?.(album.id, res);
    } catch {
      toast("Failed to update like", "error");
    } finally {
      setLiking(false);
    }
  };

  return (
    <Link to={`/albums/${album.id}`} className={styles.card}>
      <div className={styles.coverWrap}>
        <img
          src={album.coverUrl || PLACEHOLDER}
          alt={album.title}
          className={styles.cover}
          onError={(e) => { e.currentTarget.src = PLACEHOLDER; }}
          loading="lazy"
        />
        <div className={styles.stackBack2} />
        <div className={styles.stackBack1} />
        {album.status && album.status !== "published" && (
          <span className={`${styles.statusBadge} ${styles[`status_${album.status}`] || ""}`}>
            {album.status}
          </span>
        )}
        <div className={styles.overlay}>
          <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28">
            <path d="M8 5.14v14l11-7-11-7z"/>
          </svg>
        </div>
      </div>

      <div className={styles.info}>
        <div className={styles.titleRow}>
          <p className={styles.title} title={album.title}>{album.title}</p>
          <button
            className={`${styles.likeBtn} ${liked ? styles.liked : ""}`}
            onClick={handleLike}
            aria-label={liked ? "Unlike" : "Like"}
          >
            <svg viewBox="0 0 24 24" fill={liked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" width="13" height="13">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
            </svg>
            {likesCount > 0 && <span>{likesCount}</span>}
          </button>
        </div>
        <Link
          to={`/profile/${encodeURIComponent(album.artist)}`}
          className={styles.artist}
          onClick={(e) => e.stopPropagation()}
        >
          {album.artist}
        </Link>
        <div className={styles.meta}>
          {album.genre && <span className={styles.genre}>{album.genre}</span>}
          <span className={styles.trackCount}>{album.tracks?.length || 0} tracks</span>
        </div>
      </div>
    </Link>
  );
}
