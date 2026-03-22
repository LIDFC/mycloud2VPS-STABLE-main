import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import styles from "./TrackComments.module.css";

const AVATAR_PLACEHOLDER = (name) =>
  `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Crect width='32' height='32' fill='%23222' rx='16'/%3E%3Ctext x='16' y='21' text-anchor='middle' font-size='13' font-family='sans-serif' fill='%23666'%3E${encodeURIComponent((name || "?")[0].toUpperCase())}%3C/text%3E%3C/svg%3E`;

function fmt(seconds) {
  if (!seconds || isNaN(seconds)) return "0:00";
  return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, "0")}`;
}

export default function TrackComments({ track, currentTime, duration, onSeek }) {
  const { user } = useAuth();
  const toast = useToast();

  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [hoverRatio, setHoverRatio] = useState(null);
  const [activeComment, setActiveComment] = useState(null);
  const barRef = useRef(null);
  const inputRef = useRef(null);

  // Load comments when track changes
  useEffect(() => {
    if (!track?.id) return;
    setLoading(true);
    api.getComments(track.id)
      .then((data) => setComments(data.sort((a, b) => a.time - b.time)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [track?.id]);

  // Highlight the comment closest to currentTime
  useEffect(() => {
    if (!comments.length || !duration) return;
    const window = 2; // seconds tolerance
    const closest = comments
      .filter((c) => Math.abs(c.time - currentTime) < window)
      .sort((a, b) => Math.abs(a.time - currentTime) - Math.abs(b.time - currentTime))[0];
    setActiveComment(closest?.id || null);
  }, [currentTime, comments, duration]);

  const handleBarClick = useCallback((e) => {
    const rect = barRef.current?.getBoundingClientRect();
    if (!rect || !duration) return;
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onSeek(ratio);
  }, [duration, onSeek]);

  const handleBarMouseMove = useCallback((e) => {
    const rect = barRef.current?.getBoundingClientRect();
    if (!rect) return;
    setHoverRatio(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!text.trim() || submitting) return;
    if (!user) { toast("Sign in to comment", "error"); return; }
    setSubmitting(true);
    try {
      const comment = await api.addComment(track.id, text.trim(), currentTime);
      setComments((prev) => [...prev, comment].sort((a, b) => a.time - b.time));
      setText("");
      toast("Comment posted!", "success");
    } catch (err) {
      toast(err.message || "Failed to post comment", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (commentId) => {
    try {
      await api.deleteComment(track.id, commentId);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    } catch {
      toast("Failed to delete comment", "error");
    }
  };

  const progress = duration ? currentTime / duration : 0;

  return (
    <div className={styles.root}>
      {/* ── Waveform-style comment bar ─────────────────────────── */}
      <div
        ref={barRef}
        className={styles.bar}
        onClick={handleBarClick}
        onMouseMove={handleBarMouseMove}
        onMouseLeave={() => setHoverRatio(null)}
      >
        {/* Progress fill */}
        <div className={styles.barFill} style={{ width: `${progress * 100}%` }} />

        {/* Hover ghost */}
        {hoverRatio !== null && (
          <div className={styles.barGhost} style={{ width: `${hoverRatio * 100}%` }} />
        )}

        {/* Comment dots */}
        {duration > 0 && comments.map((c) => (
          <button
            key={c.id}
            className={`${styles.dot} ${activeComment === c.id ? styles.dotActive : ""}`}
            style={{ left: `${(c.time / duration) * 100}%` }}
            onClick={(e) => { e.stopPropagation(); onSeek(c.time / duration); }}
            title={`${c.username}: ${c.text} (${fmt(c.time)})`}
          >
            <img
              src={c.avatarUrl || AVATAR_PLACEHOLDER(c.username)}
              alt={c.username}
              className={styles.dotAvatar}
              onError={(ev) => { ev.currentTarget.src = AVATAR_PLACEHOLDER(c.username); }}
            />
            {activeComment === c.id && (
              <div className={styles.dotBubble}>
                <span className={styles.dotBubbleUser}>{c.username}</span>
                <span className={styles.dotBubbleText}>{c.text}</span>
              </div>
            )}
          </button>
        ))}

        {/* Time tooltip on hover */}
        {hoverRatio !== null && (
          <div className={styles.barTooltip} style={{ left: `${hoverRatio * 100}%` }}>
            {fmt(hoverRatio * duration)}
          </div>
        )}
      </div>

      {/* ── Comment input ──────────────────────────────────────── */}
      {user ? (
        <form className={styles.form} onSubmit={handleSubmit}>
          <img
            src={user.avatarUrl || AVATAR_PLACEHOLDER(user.username)}
            alt={user.username}
            className={styles.inputAvatar}
            onError={(ev) => { ev.currentTarget.src = AVATAR_PLACEHOLDER(user.username); }}
          />
          <input
            ref={inputRef}
            className={styles.input}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`Комментарий на ${fmt(currentTime)}...`}
            maxLength={300}
            disabled={submitting}
          />
          <button
            className={styles.submitBtn}
            type="submit"
            disabled={!text.trim() || submitting}
          >
            {submitting ? "..." : "↵"}
          </button>
        </form>
      ) : (
        <p className={styles.loginHint}>
          <Link to="/login" className={styles.loginLink}>Войдите</Link> чтобы оставить комментарий
        </p>
      )}

      {/* ── Comment list ───────────────────────────────────────── */}
      <div className={styles.list}>
        {loading && <p className={styles.empty}>Загрузка...</p>}
        {!loading && comments.length === 0 && (
          <p className={styles.empty}>Нет комментариев. Будь первым!</p>
        )}
        {comments.map((c) => (
          <div
            key={c.id}
            className={`${styles.comment} ${activeComment === c.id ? styles.commentActive : ""}`}
            onClick={() => onSeek(c.time / duration)}
          >
            <img
              src={c.avatarUrl || AVATAR_PLACEHOLDER(c.username)}
              alt={c.username}
              className={styles.avatar}
              onError={(ev) => { ev.currentTarget.src = AVATAR_PLACEHOLDER(c.username); }}
            />
            <div className={styles.commentBody}>
              <div className={styles.commentMeta}>
                <Link
                  to={`/profile/${encodeURIComponent(c.username)}`}
                  className={styles.commentUser}
                  onClick={(e) => e.stopPropagation()}
                >
                  {c.username}
                </Link>
                <button
                  className={styles.timeBtn}
                  onClick={(e) => { e.stopPropagation(); onSeek(c.time / duration); }}
                >
                  {fmt(c.time)}
                </button>
              </div>
              <p className={styles.commentText}>{c.text}</p>
            </div>
            {(user?.username === c.username || user?.role === "admin") && (
              <button
                className={styles.deleteBtn}
                onClick={(e) => { e.stopPropagation(); handleDelete(c.id); }}
                aria-label="Delete comment"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
                  <path d="M10 11v6m4-6v6"/><path d="M9 6V4h6v2"/>
                </svg>
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
