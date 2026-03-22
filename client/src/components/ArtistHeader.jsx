import { useState } from "react";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import styles from "./ArtistHeader.module.css";

const AVATAR_PLACEHOLDER = (name) =>
  `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Crect width='120' height='120' fill='%23222'/%3E%3Ctext x='60' y='68' text-anchor='middle' font-size='44' font-family='sans-serif' fill='%23555'%3E${encodeURIComponent((name || "?")[0].toUpperCase())}%3C/text%3E%3C/svg%3E`;

function ArtistProBadge() {
  return (
    <span className={styles.artistProBadge}>
      <svg viewBox="0 0 24 24" fill="currentColor" width="11" height="11"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
      ARTIST PRO
    </span>
  );
}

export default function ArtistHeader({ profile }) {
  const { user } = useAuth();
  const toast = useToast();
  const [following, setFollowing] = useState(profile.isFollowedByMe);
  const [followersCount, setFollowersCount] = useState(profile.followersCount);
  const [loadingFollow, setLoadingFollow] = useState(false);

  const isOwn = user?.username?.toLowerCase() === profile.username.toLowerCase();
  const isArtist = ["artist", "artist_pro"].includes(profile.accountType);
  const isArtistPro = profile.accountType === "artist_pro";

  const handleFollow = async () => {
    if (!user) {
      toast("Sign in to follow artists", "error");
      return;
    }
    setLoadingFollow(true);
    try {
      const result = await api.followUser(profile.username);
      setFollowing(result.isFollowedByMe);
      setFollowersCount(result.followersCount);
    } catch (error) {
      toast(error.message, "error");
    } finally {
      setLoadingFollow(false);
    }
  };

  const fmtCount = (value) => {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
    return String(value);
  };

  return (
    <div className={styles.header}>
      <div className={styles.backdrop}>
        {profile.backgroundUrl && <img src={profile.backgroundUrl} alt="" className={styles.backdropImage} />}
        <div className={styles.backdropShade} />
      </div>

      <div className={styles.inner}>
        <div className={styles.avatarWrap}>
          <img
            src={profile.avatarUrl || AVATAR_PLACEHOLDER(profile.username)}
            alt={profile.username}
            className={`${styles.avatar} ${isArtistPro ? styles.avatarPro : ""}`}
            onError={(event) => { event.currentTarget.src = AVATAR_PLACEHOLDER(profile.username); }}
          />
          {!isArtistPro && isArtist && <span className={styles.artistBadge}>ARTIST</span>}
        </div>

        <div className={styles.info}>
          <div className={styles.nameRow}>
            <h1 className={styles.name}>{profile.username}</h1>
            {isArtistPro && <ArtistProBadge />}
            {profile.role === "admin" && !isArtistPro && <span className={styles.adminBadge}>Admin</span>}
          </div>
          {profile.bio && <p className={styles.bio}>{profile.bio}</p>}
          <div className={styles.statsRow}>
            <div className={styles.stat}><span className={styles.statNum}>{fmtCount(followersCount)}</span><span className={styles.statLabel}>Followers</span></div>
            <div className={styles.stat}><span className={styles.statNum}>{fmtCount(profile.followingCount || 0)}</span><span className={styles.statLabel}>Following</span></div>
            {isArtist && <div className={styles.stat}><span className={styles.statNum}>{fmtCount(profile.totalPlays || 0)}</span><span className={styles.statLabel}>Plays</span></div>}
            {isArtist && <div className={styles.stat}><span className={styles.statNum}>{profile.tracks?.length || 0}</span><span className={styles.statLabel}>Tracks</span></div>}
            {isArtist && profile.albums?.length > 0 && <div className={styles.stat}><span className={styles.statNum}>{profile.albums.length}</span><span className={styles.statLabel}>Albums</span></div>}
            {isOwn && profile.backgroundUrl && <div className={styles.stat}><span className={styles.statNum}>HD</span><span className={styles.statLabel}>Profile cover</span></div>}
          </div>
        </div>

        <div className={styles.actions}>
          {!isOwn && user && (
            <button className={`btn ${following ? "btn-ghost" : "btn-primary"}`} onClick={handleFollow} disabled={loadingFollow}>
              {following ? "Following" : "Follow"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
