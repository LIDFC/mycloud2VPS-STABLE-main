import { Link } from "react-router-dom";
import { usePlayer } from "../context/PlayerContext";
import PostCard from "./PostCard";
import styles from "./FeedItem.module.css";

const AVATAR_PH = (n) =>
  `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Crect width='32' height='32' fill='%23222' rx='16'/%3E%3Ctext x='16' y='21' text-anchor='middle' font-size='12' font-family='sans-serif' fill='%23666'%3E${encodeURIComponent((n || "?")[0].toUpperCase())}%3C/text%3E%3C/svg%3E`;

const COVER_PH = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='48' height='48'%3E%3Crect width='48' height='48' fill='%23222'/%3E%3Ccircle cx='24' cy='24' r='10' fill='%23333'/%3E%3C/svg%3E`;

function timeAgo(iso) {
  const d = (Date.now() - new Date(iso)) / 1000;
  if (d < 60) return "только что";
  if (d < 3600) return `${Math.floor(d / 60)} мин`;
  if (d < 86400) return `${Math.floor(d / 3600)} ч`;
  if (d < 604800) return `${Math.floor(d / 86400)} д`;
  return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

function AuthorRow({ author, action, time }) {
  return (
    <div className={styles.authorRow}>
      <Link to={`/profile/${encodeURIComponent(author.username)}`} className={styles.authorLink}>
        <img
          src={author.avatarUrl || AVATAR_PH(author.username)}
          alt={author.username}
          className={styles.avatar}
          onError={e => { e.currentTarget.src = AVATAR_PH(author.username); }}
        />
        <span className={styles.authorName}>{author.username}</span>
        {author.accountType === "artist_pro" && <span className={styles.proBadge}>PRO</span>}
      </Link>
      <span className={styles.action}>{action}</span>
      <span className={styles.time}>{timeAgo(time)}</span>
    </div>
  );
}

// Compact horizontal track row — designed for feed context
function CompactTrack({ track }) {
  const { loadTrack, currentTrack, isPlaying, togglePlay } = usePlayer();
  const isActive = currentTrack?.id === track.id;
  const isThisPlaying = isActive && isPlaying;

  const handlePlay = () => {
    if (isActive) togglePlay();
    else loadTrack(track);
  };

  return (
    <div className={`${styles.trackRow} ${isActive ? styles.trackRowActive : ""}`}>
      <div className={styles.trackCoverWrap}>
        <img
          src={track.coverUrl || COVER_PH}
          alt={track.title}
          className={styles.trackCover}
          onError={e => { e.currentTarget.src = COVER_PH; }}
        />
        <button className={styles.trackPlayBtn} onClick={handlePlay}>
          {isThisPlaying
            ? <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><rect x="5" y="3" width="4" height="18" rx="2"/><rect x="15" y="3" width="4" height="18" rx="2"/></svg>
            : <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M8 5.14v14l11-7-11-7z"/></svg>}
        </button>
      </div>

      <div className={styles.trackMeta}>
        <span className={styles.trackTitle}>{track.title}</span>
        <span className={styles.trackArtist}>{track.artist}</span>
      </div>

      {track.genre && <span className={styles.trackGenre}>{track.genre}</span>}

      {isActive && isPlaying && (
        <div className={styles.trackEq}>
          <span/><span/><span/>
        </div>
      )}
    </div>
  );
}

export default function FeedItem({ item, onPostDelete }) {
  if (item.type === "post") {
    return (
      <div className={styles.wrap}>
        <PostCard
          post={{
            ...item.post,
            authorUsername: item.author.username,
            authorAvatarUrl: item.author.avatarUrl,
            authorAccountType: item.author.accountType,
            createdAt: item.createdAt,
          }}
          onDelete={onPostDelete}
        />
      </div>
    );
  }

  if (item.type === "track") {
    return (
      <div className={styles.wrap}>
        <AuthorRow author={item.author} action="выпустил новый трек" time={item.createdAt} />
        <CompactTrack track={item.track} />
      </div>
    );
  }

  if (item.type === "repost") {
    return (
      <div className={styles.wrap}>
        <AuthorRow author={item.author} action="сделал репост" time={item.createdAt} />
        <CompactTrack track={item.track} />
      </div>
    );
  }

  return null;
}
