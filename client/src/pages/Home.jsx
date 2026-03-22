import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import { usePlayer } from "../context/PlayerContext";
import TrackCard from "../components/TrackCard";
import FeedItem from "../components/FeedItem";
import DropCard from "../components/DropCard";
import Fireworks from "../components/Fireworks";
import styles from "./Home.module.css";
import homeStyles from "./HomeGenre.module.css";

const DAY_NAMES = ["Воскресенье","Понедельник","Вторник","Среда","Четверг","Пятница","Суббота"];

// ── Daily Playlist Banner ─────────────────────────────────────────────────────
function DailyPlaylistBanner({ tracks }) {
  const { loadTrack, currentTrack, isPlaying, togglePlay, playShuffled } = usePlayer();
  const [expanded, setExpanded] = useState(false);
  if (!tracks?.length) return null;

  const day = DAY_NAMES[new Date().getDay()];
  const cover = tracks.slice(0, 4).map(t => t.coverUrl).filter(Boolean);
  const isThisPlaying = tracks.some(t => t.id === currentTrack?.id) && isPlaying;

  return (
    <section className={styles.dailySection}>
      <div className={styles.dailyBanner}>
        <div className={styles.dailyCoverGrid}>
          {cover.slice(0, 4).map((src, i) => <img key={i} src={src} alt="" className={styles.dailyCoverImg} />)}
          {cover.length < 4 && Array.from({ length: 4 - cover.length }).map((_, i) => <div key={i} className={styles.dailyCoverPh} />)}
        </div>
        <div className={styles.dailyInfo}>
          <div className={styles.dailyLabel}>🎲 Плейлист дня</div>
          <h2 className={styles.dailyTitle}>{day}</h2>
          <p className={styles.dailyMeta}>{tracks.length} треков · обновляется каждый день</p>
          <div className={styles.dailyActions}>
            <button className={styles.dailyPlayBtn} onClick={() => {
              if (isThisPlaying) { togglePlay(); return; }
              if (tracks.some(t => t.id === currentTrack?.id)) { togglePlay(); return; }
              loadTrack(tracks[0], tracks);
            }}>
              {isThisPlaying
                ? <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><rect x="5" y="3" width="4" height="18" rx="2"/><rect x="15" y="3" width="4" height="18" rx="2"/></svg>
                : <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M8 5.14v14l11-7-11-7z"/></svg>}
              {isThisPlaying ? "Пауза" : "Слушать"}
            </button>
            <button className={styles.dailyShuffleBtn} onClick={() => playShuffled(tracks)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                <polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/>
                <polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/>
              </svg>
              Перемешать
            </button>
            <button className={styles.dailyExpandBtn} onClick={() => setExpanded(v => !v)}>
              {expanded ? "Скрыть" : "Все треки"}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"
                style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>
                <path d="M6 9l6 6 6-6"/>
              </svg>
            </button>
          </div>
        </div>
        <div className={styles.dailyGlow} />
      </div>
      {expanded && (
        <div className={styles.dailyTrackList}>
          {tracks.map((track, idx) => (
            <button key={track.id}
              className={`${styles.dailyTrackRow} ${currentTrack?.id === track.id ? styles.dailyTrackRowActive : ""}`}
              onClick={() => loadTrack(track, tracks)}>
              <span className={styles.dailyTrackNum}>
                {currentTrack?.id === track.id && isPlaying
                  ? <span className={styles.dailyEq}><span/><span/><span/></span>
                  : idx + 1}
              </span>
              <img src={track.coverUrl} alt="" className={styles.dailyTrackCover}
                onError={e => { e.currentTarget.style.display = "none"; }} />
              <div className={styles.dailyTrackMeta}>
                <span className={styles.dailyTrackTitle}>{track.title}</span>
                <span className={styles.dailyTrackArtist}>{track.artist}</span>
              </div>
              {track.genre && <span className={styles.dailyTrackGenre}>{track.genre}</span>}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

// ── Drops Section ─────────────────────────────────────────────────────────────
function DropsSection({ drops, onDelete }) {
  if (!drops.length) return null;
  return (
    <section className={styles.dropsSection}>
      <div className={styles.sectionHeader}>
        <div className={styles.sectionTitleRow}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
          <h2 className={styles.sectionTitle}>Анонсы релизов</h2>
        </div>
        <span className={styles.sectionCount}>{drops.length} дропов</span>
      </div>
      <div className={styles.dropsList}>
        {drops.map(drop => (
          <DropCard key={drop.id} drop={drop} showArtist onDelete={onDelete} />
        ))}
      </div>
    </section>
  );
}

// ── Activity Feed ─────────────────────────────────────────────────────────────
function ActivityFeed({ user }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [initialLoaded, setInitialLoaded] = useState(false);

  const load = useCallback(async (before = null) => {
    setLoading(true);
    try {
      const data = await api.getFeed(before);
      if (before) {
        setItems(prev => [...prev, ...data.items]);
      } else {
        setItems(data.items);
        setInitialLoaded(true);
      }
      setHasMore(data.hasMore);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  if (!user) return null;
  if (!initialLoaded && loading) return (
    <section className={styles.feedSection}>
      <div className={homeStyles.empty}><div className={homeStyles.spinner} /></div>
    </section>
  );
  if (!items.length) return null;

  const oldest = items[items.length - 1]?.createdAt;

  return (
    <section className={styles.feedSection}>
      <div className={styles.sectionHeader}>
        <div className={styles.sectionTitleRow}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
          </svg>
          <h2 className={styles.sectionTitle}>Лента</h2>
        </div>
        <span className={styles.sectionSub}>Подписки</span>
      </div>

      <div className={styles.feedList}>
        {items.map(item => (
          <FeedItem
            key={item.id}
            item={item}
            onPostDelete={(id) => setItems(prev => prev.filter(i => i.id !== id))}
          />
        ))}
      </div>

      {hasMore && (
        <button
          className={styles.loadMoreBtn}
          onClick={() => load(oldest)}
          disabled={loading}
        >
          {loading ? "Загружаю..." : "Показать ещё"}
        </button>
      )}
    </section>
  );
}

// ── Main Home ─────────────────────────────────────────────────────────────────
export default function Home() {
  const { user } = useAuth();
  const [groups, setGroups] = useState([]);
  const [topGenres, setTopGenres] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dailyTracks, setDailyTracks] = useState([]);
  const [drops, setDrops] = useState([]);
  const [fireworks, setFireworks] = useState(false);
  const prevDropsRef = useRef([]);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.getRecommendations(),
      api.getDailyPlaylist(),
      api.getDrops().catch(() => []),
    ]).then(([recs, daily, dropsData]) => {
      setGroups(recs.groups);
      setTopGenres(recs.topGenres);
      setDailyTracks(daily.tracks);
      setDrops(Array.isArray(dropsData) ? dropsData : []);
    }).finally(() => setLoading(false));
  }, [user]);

  // Watch for drops that just became released (countdown hit 0)
  useEffect(() => {
    if (!drops.length) return;
    const prev = prevDropsRef.current;
    const justReleased = drops.some(d => {
      const wasPending = prev.find(p => p.id === d.id && !p.isReleased);
      return wasPending && d.isReleased;
    });
    if (justReleased) setFireworks(true);
    prevDropsRef.current = drops;
  }, [drops]);

  // Also poll drops every 30s to catch release in real time
  useEffect(() => {
    const id = setInterval(() => {
      api.getDrops().catch(() => []).then(data => {
        if (!Array.isArray(data)) return;
        setDrops(prev => {
          // Check if any newly released
          const justReleased = data.some(d => {
            const old = prev.find(p => p.id === d.id);
            return old && !old.isReleased && d.isReleased;
          });
          if (justReleased) setFireworks(true);
          return data;
        });
      });
    }, 30000);
    return () => clearInterval(id);
  }, []);

  const handleLikeChange = (trackId, res) => {
    setGroups(prev => prev.map(g => ({
      ...g,
      tracks: g.tracks.map(t => t.id === trackId ? { ...t, ...res } : t),
    })));
    setDailyTracks(prev => prev.map(t => t.id === trackId ? { ...t, ...res } : t));
  };

  if (loading) return (
    <main className={styles.page}>
      <div className={styles.empty}><div className={styles.spinner} /></div>
    </main>
  );

  if (groups.length === 0) return (
    <main className={styles.page}>
      <div className={styles.empty} style={{ marginTop: 80 }}>
        <p className={styles.emptyText}>No tracks yet. Ask the admin to upload some!</p>
      </div>
    </main>
  );

  return (
    <main className={styles.page}>
      <Fireworks active={fireworks} onDone={() => setFireworks(false)} />
      <section className={styles.hero}>
        <h1 className={styles.heroTitle}>{user && topGenres.length > 0 ? "For You" : "Discover"}</h1>
        <p className={styles.heroSub}>
          {user && topGenres.length > 0 ? `Based on your taste: ${topGenres.join(", ")}` : "Browse by genre"}
        </p>
      </section>

      {/* 1. Daily playlist */}
      <DailyPlaylistBanner tracks={dailyTracks} />

      {/* 2. Drops — upcoming releases */}
      <DropsSection drops={drops} onDelete={(id) => setDrops(prev => prev.filter(d => d.id !== id))} />

      {/* 3. Activity feed from subscriptions */}
      <ActivityFeed user={user} />

      {/* 4. Genre sections */}
      {groups.map((group) => {
        const isTop = topGenres.includes(group.genre);
        return (
          <section key={group.genre} className={homeStyles.genreSection}>
            <div className={homeStyles.genreHeader}>
              <div className={homeStyles.genreTitleRow}>
                <h2 className={homeStyles.genreTitle}>{group.genre}</h2>
                {isTop && <span className={homeStyles.topBadge}>♥ Your favourite</span>}
              </div>
              <span className={homeStyles.genreCount}>{group.tracks.length} tracks</span>
            </div>
            <div className={styles.grid}>
              {group.tracks.map(track => (
                <TrackCard key={track.id} track={track} onLikeChange={handleLikeChange} queue={group.tracks} />
              ))}
            </div>
          </section>
        );
      })}
    </main>
  );
}
