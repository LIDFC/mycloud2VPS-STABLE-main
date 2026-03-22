import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import styles from "./ArtistCard.module.css";

function fmtCount(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

const AVATAR_PLACEHOLDER = (name) =>
  `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Crect width='120' height='120' fill='%23222'/%3E%3Ctext x='60' y='68' text-anchor='middle' font-size='44' font-family='sans-serif' fill='%23555'%3E${encodeURIComponent((name || "?")[0].toUpperCase())}%3C/text%3E%3C/svg%3E`;

export default function ArtistCard({ artist }) {
  const { user }  = useAuth();
  const toast     = useToast();
  const [following, setFollowing]         = useState(artist.isFollowedByMe);
  const [followersCount, setFollowersCount] = useState(artist.followersCount);
  const [loading, setLoading]             = useState(false);

  const isOwn = user?.username?.toLowerCase() === artist.username.toLowerCase();

  const handleFollow = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) { toast("Sign in to follow artists", "error"); return; }
    if (loading) return;
    setLoading(true);
    try {
      const res = await api.followUser(artist.username);
      setFollowing(res.isFollowedByMe);
      setFollowersCount(res.followersCount);
      toast(res.isFollowedByMe ? `Following ${artist.username}` : `Unfollowed ${artist.username}`, "success");
    } catch (err) { toast(err.message, "error"); }
    finally { setLoading(false); }
  };

  return (
    <Link to={`/profile/${artist.username}`} className={styles.card}>
      <div className={styles.avatarWrap}>
        <img
          src={artist.avatarUrl || AVATAR_PLACEHOLDER(artist.username)}
          alt={artist.username}
          className={styles.avatar}
          onError={(e) => { e.currentTarget.src = AVATAR_PLACEHOLDER(artist.username); }}
        />
        <span className={styles.artistBadge}>ARTIST</span>
      </div>

      <div className={styles.info}>
        <p className={styles.name}>{artist.username}</p>
        {artist.bio && <p className={styles.bio}>{artist.bio}</p>}
        <div className={styles.stats}>
          <span>{fmtCount(followersCount)} followers</span>
          {artist.trackCount > 0 && <span>·</span>}
          {artist.trackCount > 0 && <span>{artist.trackCount} tracks</span>}
        </div>
      </div>

      {!isOwn && user && (
        <button
          className={`${styles.followBtn} ${following ? styles.following : ""}`}
          onClick={handleFollow}
          disabled={loading}
          aria-label={following ? "Unfollow" : "Follow"}
        >
          {following ? "Following" : "Follow"}
        </button>
      )}
    </Link>
  );
}
