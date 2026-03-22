import { useState, useEffect } from "react";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import { usePlayer } from "../context/PlayerContext";
import TrackCard from "../components/TrackCard";
import styles from "./Home.module.css";
import likedStyles from "./Liked.module.css";

export default function Liked() {
  const { user } = useAuth();
  const { playShuffled, loadTrack } = usePlayer();
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getTracks()
      .then((all) => setTracks(all.filter((t) => t.likedByMe)))
      .finally(() => setLoading(false));
  }, []);

  const handleLikeChange = (trackId, res) => {
    setTracks((prev) =>
      res.likedByMe
        ? prev.map((t) => (t.id === trackId ? { ...t, ...res } : t))
        : prev.filter((t) => t.id !== trackId)
    );
  };

  const handlePlayAll = () => {
    if (tracks.length) loadTrack(tracks[0], tracks);
  };

  const handleShuffle = () => {
    if (tracks.length) playShuffled(tracks);
  };

  if (!user) return (
    <main className={styles.page}>
      <div className={styles.empty}>
        <p className={styles.emptyText}>Sign in to see your liked tracks.</p>
      </div>
    </main>
  );

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={likedStyles.heroRow}>
          <div>
            <h1 className={styles.heroTitle}>Liked Tracks</h1>
            <p className={styles.heroSub}>{tracks.length} {tracks.length === 1 ? "track" : "tracks"}</p>
          </div>
          {tracks.length > 0 && (
            <div className={likedStyles.heroActions}>
              <button className="btn btn-ghost" onClick={handlePlayAll}>
                <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M8 5.14v14l11-7-11-7z"/></svg>
                Play all
              </button>
              <button className="btn btn-primary" onClick={handleShuffle}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="16" height="16">
                  <polyline points="16 3 21 3 21 8"/>
                  <line x1="4" y1="20" x2="21" y2="3"/>
                  <polyline points="21 16 21 21 16 21"/>
                  <line x1="15" y1="15" x2="21" y2="21"/>
                </svg>
                Shuffle
              </button>
            </div>
          )}
        </div>
      </section>

      {loading ? (
        <div className={styles.empty}><div className={styles.spinner} /></div>
      ) : tracks.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyText}>You haven't liked any tracks yet.</p>
        </div>
      ) : (
        <div className={styles.grid}>
          {tracks.map((track) => (
            <TrackCard key={track.id} track={track} onLikeChange={handleLikeChange} queue={tracks} />
          ))}
        </div>
      )}
    </main>
  );
}
