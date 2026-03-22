import { useState, useRef } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { usePlayer } from "../context/PlayerContext";
import styles from "./PostCard.module.css";

const AVATAR_PH = (n) =>
  `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='36' height='36'%3E%3Crect width='36' height='36' fill='%23222' rx='18'/%3E%3Ctext x='18' y='23' text-anchor='middle' font-size='14' font-family='sans-serif' fill='%23666'%3E${encodeURIComponent((n||"?")[0].toUpperCase())}%3C/text%3E%3C/svg%3E`;

function timeAgo(iso) {
  const d = (Date.now() - new Date(iso)) / 1000;
  if (d < 60) return "только что";
  if (d < 3600) return `${Math.floor(d/60)} мин`;
  if (d < 86400) return `${Math.floor(d/3600)} ч`;
  if (d < 604800) return `${Math.floor(d/86400)} д`;
  return new Date(iso).toLocaleDateString("ru-RU", { day:"numeric", month:"short" });
}

function ImageGrid({ images }) {
  const [lightbox, setLightbox] = useState(null);
  if (!images?.length) return null;
  const count = images.length;
  return (
    <>
      <div className={`${styles.imageGrid} ${styles[`grid${Math.min(count, 4)}`]}`}>
        {images.slice(0, 4).map((src, i) => (
          <button key={i} className={styles.imageBtn} onClick={() => setLightbox(i)}>
            <img src={src} alt="" className={styles.postImg} />
            {i === 3 && count > 4 && <div className={styles.moreOverlay}>+{count - 4}</div>}
          </button>
        ))}
      </div>
      {lightbox !== null && (
        <div className={styles.lightbox} onClick={() => setLightbox(null)}>
          <button className={styles.lbClose} onClick={() => setLightbox(null)}>✕</button>
          {lightbox > 0 && (
            <button className={styles.lbPrev} onClick={e=>{e.stopPropagation();setLightbox(l=>l-1);}}>‹</button>
          )}
          <img src={images[lightbox]} alt="" className={styles.lbImg} onClick={e=>e.stopPropagation()} />
          {lightbox < images.length - 1 && (
            <button className={styles.lbNext} onClick={e=>{e.stopPropagation();setLightbox(l=>l+1);}}>›</button>
          )}
        </div>
      )}
    </>
  );
}

function PinnedTrack({ track }) {
  const { loadTrack, currentTrack, isPlaying, togglePlay } = usePlayer();
  if (!track) return null;
  const isActive = currentTrack?.id === track.id;

  return (
    <div className={styles.pinnedTrack}>
      <div className={styles.pinnedCoverWrap}>
        {track.coverUrl
          ? <img src={track.coverUrl} alt="" className={styles.pinnedCover} />
          : <div className={styles.pinnedCoverPh} />}
        <button
          className={styles.pinnedPlayBtn}
          onClick={() => isActive ? togglePlay() : loadTrack(track)}
        >
          {isActive && isPlaying
            ? <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><rect x="5" y="3" width="4" height="18" rx="1"/><rect x="15" y="3" width="4" height="18" rx="1"/></svg>
            : <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M8 5.14v14l11-7-11-7z"/></svg>}
        </button>
      </div>
      <div className={styles.pinnedMeta}>
        <span className={styles.pinnedLabel}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="11" height="11"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
          Прикреплённый трек
        </span>
        <span className={styles.pinnedTitle}>{track.title}</span>
        <span className={styles.pinnedArtist}>{track.artist}</span>
      </div>
    </div>
  );
}

function CommentSection({ postId, commentsCount }) {
  const { user } = useAuth();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef(null);

  const load = async () => {
    if (loaded) return;
    try {
      const data = await api.getPostComments(postId);
      setComments(data);
      setLoaded(true);
    } catch { toast("Не удалось загрузить комментарии", "error"); }
  };

  const toggle = () => {
    setOpen(v => !v);
    if (!loaded) load();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!text.trim() || submitting) return;
    if (!user) { toast("Войдите чтобы комментировать", "error"); return; }
    setSubmitting(true);
    try {
      const c = await api.addPostComment(postId, text.trim());
      setComments(prev => [...prev, c]);
      setText("");
    } catch (err) { toast(err.message || "Ошибка", "error"); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async (commentId) => {
    try {
      await api.deletePostComment(postId, commentId);
      setComments(prev => prev.filter(c => c.id !== commentId));
    } catch { toast("Не удалось удалить", "error"); }
  };

  const total = loaded ? comments.length : commentsCount;

  return (
    <div className={styles.commentSection}>
      <button className={styles.commentToggle} onClick={toggle}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        {total > 0 ? `${total} комм.` : "Комментировать"}
      </button>

      {open && (
        <div className={styles.commentBox}>
          {user && (
            <form className={styles.commentForm} onSubmit={handleSubmit}>
              <img src={user.avatarUrl || AVATAR_PH(user.username)} alt=""
                className={styles.commentAvatar}
                onError={e=>{e.currentTarget.src=AVATAR_PH(user.username);}} />
              <input
                ref={inputRef}
                className={styles.commentInput}
                value={text}
                onChange={e=>setText(e.target.value)}
                placeholder="Написать комментарий..."
                maxLength={500}
                disabled={submitting}
              />
              <button className={styles.commentSubmit} type="submit"
                disabled={!text.trim() || submitting}>↵</button>
            </form>
          )}
          <div className={styles.commentList}>
            {!loaded && <p className={styles.commentEmpty}>Загрузка...</p>}
            {loaded && comments.length === 0 && <p className={styles.commentEmpty}>Нет комментариев</p>}
            {comments.map(c => (
              <div key={c.id} className={styles.commentRow}>
                <img src={c.avatarUrl || AVATAR_PH(c.username)} alt=""
                  className={styles.commentAvatar}
                  onError={e=>{e.currentTarget.src=AVATAR_PH(c.username);}} />
                <div className={styles.commentBody}>
                  <div className={styles.commentMeta}>
                    <Link to={`/profile/${encodeURIComponent(c.username)}`} className={styles.commentUser}>
                      {c.username}
                    </Link>
                    <span className={styles.commentTime}>{timeAgo(c.createdAt)}</span>
                  </div>
                  <p className={styles.commentText}>{c.text}</p>
                </div>
                {(user?.username === c.username || user?.role === "admin") && (
                  <button className={styles.commentDelete} onClick={() => handleDelete(c.id)}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12">
                      <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function PostCard({ post, onDelete }) {
  const { user } = useAuth();
  const toast = useToast();
  const [likesCount, setLikesCount] = useState(post.likesCount);
  const [likedByMe, setLikedByMe] = useState(post.likedByMe);
  const [liking, setLiking] = useState(false);

  const canDelete = user?.username === post.authorUsername || user?.role === "admin";

  const handleLike = async () => {
    if (!user) { toast("Войдите чтобы ставить лайки", "error"); return; }
    if (liking) return;
    setLiking(true);
    try {
      const r = await api.likePost(post.id);
      setLikesCount(r.likesCount);
      setLikedByMe(r.likedByMe);
    } catch { toast("Ошибка", "error"); }
    finally { setLiking(false); }
  };

  const handleDelete = async () => {
    if (!window.confirm("Удалить пост?")) return;
    try {
      await api.deletePost(post.id);
      onDelete?.(post.id);
      toast("Пост удалён", "success");
    } catch { toast("Не удалось удалить", "error"); }
  };

  return (
    <article className={styles.card}>
      {/* Header */}
      <div className={styles.header}>
        <Link to={`/profile/${encodeURIComponent(post.authorUsername)}`} className={styles.authorLink}>
          <img
            src={post.authorAvatarUrl || AVATAR_PH(post.authorUsername)}
            alt={post.authorUsername}
            className={styles.avatar}
            onError={e=>{e.currentTarget.src=AVATAR_PH(post.authorUsername);}}
          />
          <div className={styles.authorMeta}>
            <span className={styles.authorName}>{post.authorUsername}</span>
            {post.authorAccountType === "artist_pro" && (
              <span className={styles.proBadge}>PRO</span>
            )}
          </div>
        </Link>
        <div className={styles.headerRight}>
          <span className={styles.time}>{timeAgo(post.createdAt)}</span>
          {canDelete && (
            <button className={styles.deleteBtn} onClick={handleDelete} title="Удалить пост">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
                <path d="M10 11v6m4-6v6"/><path d="M9 6V4h6v2"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Text */}
      {post.text && <p className={styles.text}>{post.text}</p>}

      {/* Images */}
      <ImageGrid images={post.images} />

      {/* Pinned track */}
      <PinnedTrack track={post.pinnedTrack} />

      {/* Actions */}
      <div className={styles.actions}>
        <button
          className={`${styles.likeBtn} ${likedByMe ? styles.likeBtnOn : ""}`}
          onClick={handleLike}
          disabled={liking}
        >
          <svg viewBox="0 0 24 24" fill={likedByMe ? "currentColor" : "none"}
            stroke="currentColor" strokeWidth="2" width="15" height="15">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
          {likesCount > 0 && <span>{likesCount}</span>}
        </button>

        <CommentSection postId={post.id} commentsCount={post.commentsCount} />
      </div>
    </article>
  );
}
