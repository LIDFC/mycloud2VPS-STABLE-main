import { useState, useEffect } from "react";
import { api } from "../api";
import { usePlayer } from "../context/PlayerContext";
import TrackCard from "../components/TrackCard";
import styles from "./Radio.module.css";
import homeStyles from "./Home.module.css";

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function Radio() {
  const { playShuffled, isPlaying, currentTrack, queue } = usePlayer();
  const [allTracks, setAllTracks] = useState([]);
  const [shuffled, setShuffled] = useState([]);
  const [loading, setLoading] = useState(true);

  // Check if radio is currently playing
  const isRadioPlaying = isPlaying && queue === shuffled && shuffled.length > 0;

  useEffect(() => {
    api.getTracks()
      .then((tracks) => {
        setAllTracks(tracks);
        setShuffled(shuffleArray(tracks));
      })
      .finally(() => setLoading(false));
  }, []);

  const handleStart = () => {
    const freshShuffle = shuffleArray(allTracks);
    setShuffled(freshShuffle);
    playShuffled(freshShuffle);
  };

  const handleReshuffle = () => {
    const freshShuffle = shuffleArray(allTracks);
    setShuffled(freshShuffle);
    playShuffled(freshShuffle);
  };

  const handleLikeChange = (trackId, res) => {
    setShuffled((prev) =>
      prev.map((t) => t.id === trackId ? { ...t, ...res } : t)
    );
  };

  return (
    <main className={homeStyles.page}>
      {/* Hero */}
      <section className={styles.hero}>
        <div className={styles.heroGlow} aria-hidden="true" />
        <div className={styles.heroContent}>
          <div className={styles.radioIcon}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="36" height="36">
              <path d="M3 8a9 9 0 0 1 18 0"/>
              <path d="M6.5 11.5a5.5 5.5 0 0 1 11 0"/>
              <path d="M10 15a2 2 0 0 1 4 0"/>
              <line x1="12" y1="17" x2="12" y2="21"/>
            </svg>
          </div>
          <div>
            <h1 className={styles.title}>Радио фая</h1>
            <p className={styles.subtitle}>
              Все треки площадки — в случайном порядке, без повторов
            </p>
          </div>
        </div>

        <div className={styles.heroActions}>
          <button className={`btn btn-primary ${styles.bigBtn}`} onClick={handleStart} disabled={loading || allTracks.length === 0}>
            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M8 5.14v14l11-7-11-7z"/></svg>
            {isRadioPlaying ? "Restart Radio" : "Start Radio"}
          </button>
          {shuffled.length > 0 && (
            <button className={`btn btn-ghost`} onClick={handleReshuffle}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="17" height="17">
                <polyline points="16 3 21 3 21 8"/>
                <line x1="4" y1="20" x2="21" y2="3"/>
                <polyline points="21 16 21 21 16 21"/>
                <line x1="15" y1="15" x2="21" y2="21"/>
              </svg>
              Reshuffle
            </button>
          )}
        </div>

        <div className={styles.stats}>
          <span>{allTracks.length} tracks</span>
          <span className={styles.dot}>·</span>
          <span>Maximum shuffle</span>
          {currentTrack && isRadioPlaying && (
            <>
              <span className={styles.dot}>·</span>
              <span className={styles.nowPlayingLabel}>
                <span className={styles.pulse} />
                Now: {currentTrack.title}
              </span>
            </>
          )}
        </div>
      </section>

      {/* Track list in shuffled order */}
      {loading ? (
        <div className={homeStyles.empty}><div className={homeStyles.spinner} /></div>
      ) : shuffled.length === 0 ? (
        <div className={homeStyles.empty}>
          <p className={homeStyles.emptyText}>No tracks uploaded yet.</p>
        </div>
      ) : (
        <>
          <h2 className={styles.queueTitle}>Queue ({shuffled.length} tracks)</h2>
          <div className={homeStyles.grid}>
            {shuffled.map((track) => (
              <TrackCard
                key={track.id}
                track={track}
                onLikeChange={handleLikeChange}
                queue={shuffled}
              />
            ))}
          </div>
        </>
      )}
    </main>
  );
}
