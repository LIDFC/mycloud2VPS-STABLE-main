import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { usePlayer } from "../context/PlayerContext";
import TrackCard from "../components/TrackCard";
import styles from "./AlbumPage.module.css";
import homeStyles from "./Home.module.css";

const PLACEHOLDER = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Crect width='300' height='300' fill='%231a1a1a'/%3E%3C/svg%3E`;

function TrackStatus({ status }) {
  if (!status || status === "published") return null;
  return <span className={`${styles.statusBadge} ${styles[`status_${status}`] || ""}`}>{status}</span>;
}

export default function AlbumPage() {
  const { id }      = useParams();
  const { user }    = useAuth();
  const toast       = useToast();
  const navigate    = useNavigate();
  const { loadTrack, playShuffled } = usePlayer();

  const [album, setAlbum] = useState(null);
  const [loading, setLoading] = useState(true);
  const [liked, setLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(0);
  const [availableTracks, setAvailableTracks] = useState([]);
  const [loadingAvailable, setLoadingAvailable] = useState(false);
  const [savingTrackId, setSavingTrackId] = useState(null);

  const loadAlbum = useCallback(async () => {
    const data = await api.getAlbum(id);
    setAlbum(data);
    setLiked(data.likedByMe || false);
    setLikesCount(data.likesCount || 0);
    return data;
  }, [id]);

  const loadAvailableTracks = useCallback(async (currentAlbum) => {
    const isOwner = user && currentAlbum && (user.id === currentAlbum.artistId || user.role === "admin");
    if (!isOwner) {
      setAvailableTracks([]);
      return;
    }
    setLoadingAvailable(true);
    try {
      const tracks = await api.getAlbumAvailableTracks(id);
      setAvailableTracks(tracks.filter((track) => track.albumId !== id));
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setLoadingAvailable(false);
    }
  }, [id, toast, user]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    loadAlbum()
      .then((data) => mounted && loadAvailableTracks(data))
      .catch(() => navigate("/albums"))
      .finally(() => mounted && setLoading(false));

    return () => {
      mounted = false;
    };
  }, [id, loadAlbum, loadAvailableTracks, navigate]);

  const handleLike = async () => {
    if (!user) { toast("Sign in to like albums", "error"); return; }
    try {
      const res = await api.likeAlbum(id);
      setLiked(res.likedByMe);
      setLikesCount(res.likesCount);
    } catch {
      toast("Failed", "error");
    }
  };

  const handlePlay = () => {
    if (album?.tracks?.length) loadTrack(album.tracks[0], album.tracks);
  };

  const handleShuffle = () => {
    if (album?.tracks?.length) playShuffled(album.tracks);
  };

  const refreshAlbumState = async () => {
    const data = await loadAlbum();
    await loadAvailableTracks(data);
  };

  const handleAddTrack = async (trackId) => {
    setSavingTrackId(trackId);
    try {
      await api.addTrackToAlbum(id, trackId);
      await refreshAlbumState();
      toast("Track added to album", "success");
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setSavingTrackId(null);
    }
  };

  const handleRemoveTrack = async (trackId) => {
    setSavingTrackId(trackId);
    try {
      await api.removeTrackFromAlbum(id, trackId);
      await refreshAlbumState();
      toast("Track removed from album", "success");
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setSavingTrackId(null);
    }
  };

  if (loading) return (
    <main className={homeStyles.page}>
      <div className={homeStyles.empty}><div className={homeStyles.spinner} /></div>
    </main>
  );
  if (!album) return null;

  const isOwner = user && (user.id === album.artistId || user.role === "admin");

  return (
    <main className={homeStyles.page}>
      <div className={styles.header}>
        <div className={styles.coverWrap}>
          <img
            src={album.coverUrl || PLACEHOLDER}
            alt={album.title}
            className={styles.cover}
            onError={(e) => { e.currentTarget.src = PLACEHOLDER; }}
          />
        </div>

        <div className={styles.meta}>
          <div className={styles.metaTopRow}>
            <span className={styles.typeLabel}>Album</span>
            <TrackStatus status={album.status} />
          </div>
          <h1 className={styles.title}>{album.title}</h1>
          <div className={styles.artistRow}>
            <Link to={`/profile/${encodeURIComponent(album.artist)}`} className={styles.artistLink}>
              {album.artist}
            </Link>
          </div>
          {album.description && <p className={styles.desc}>{album.description}</p>}
          <div className={styles.stats}>
            {album.genre && <span className={styles.genre}>{album.genre}</span>}
            <span className={styles.stat}>{album.tracks?.length || 0} tracks</span>
            <span className={styles.dot}>·</span>
            <span className={styles.stat}>{likesCount} likes</span>
            <span className={styles.dot}>·</span>
            <span className={styles.stat}>{new Date(album.createdAt).getFullYear()}</span>
          </div>

          <div className={styles.actions}>
            <button className="btn btn-primary" onClick={handlePlay} disabled={!album.tracks?.length}>
              <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M8 5.14v14l11-7-11-7z"/></svg>
              Play
            </button>
            <button className="btn btn-ghost" onClick={handleShuffle} disabled={!album.tracks?.length}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
                <polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/>
                <polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/>
              </svg>
              Shuffle
            </button>
            <button
              className={`${styles.likeBtn} ${liked ? styles.likeBtnOn : ""}`}
              onClick={handleLike}
            >
              <svg viewBox="0 0 24 24" fill={liked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" width="18" height="18">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
              </svg>
            </button>
          </div>
        </div>
      </div>

      {isOwner && (
        <section className={styles.manageSection}>
          <div className={styles.manageHeader}>
            <div>
              <h2 className={styles.manageTitle}>Manage tracks</h2>
              <p className={styles.manageHint}>Add already uploaded tracks to this album or remove them when needed.</p>
            </div>
          </div>

          <div className={styles.manageGrid}>
            <div className={styles.manageColumn}>
              <div className={styles.manageColumnHeader}>
                <h3>Tracks in album</h3>
                <span>{album.tracks?.length || 0}</span>
              </div>
              {album.tracks?.length ? (
                <div className={styles.manageList}>
                  {album.tracks.map((track) => (
                    <div key={track.id} className={styles.manageItem}>
                      <div className={styles.manageItemMeta}>
                        <strong>{track.title}</strong>
                        <span>{track.genre || "No genre"}</span>
                      </div>
                      <div className={styles.manageItemActions}>
                        <TrackStatus status={track.status} />
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => handleRemoveTrack(track.id)}
                          disabled={savingTrackId === track.id}
                        >
                          {savingTrackId === track.id ? "Removing…" : "Remove"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className={styles.manageEmpty}>No tracks in this album yet.</p>
              )}
            </div>

            <div className={styles.manageColumn}>
              <div className={styles.manageColumnHeader}>
                <h3>Available uploaded tracks</h3>
                <span>{availableTracks.length}</span>
              </div>
              {loadingAvailable ? (
                <div className={styles.manageLoading}><div className={homeStyles.spinner} /></div>
              ) : availableTracks.length ? (
                <div className={styles.manageList}>
                  {availableTracks.map((track) => (
                    <div key={track.id} className={styles.manageItem}>
                      <div className={styles.manageItemMeta}>
                        <strong>{track.title}</strong>
                        <span>{track.genre || "No genre"}</span>
                      </div>
                      <div className={styles.manageItemActions}>
                        <TrackStatus status={track.status} />
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => handleAddTrack(track.id)}
                          disabled={savingTrackId === track.id}
                        >
                          {savingTrackId === track.id ? "Adding…" : "Add"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className={styles.manageEmpty}>No free uploaded tracks yet. Upload tracks on your profile first.</p>
              )}
            </div>
          </div>
        </section>
      )}

      {album.tracks?.length === 0 ? (
        <div className={homeStyles.empty}>
          <p className={homeStyles.emptyText}>No tracks in this album yet.</p>
        </div>
      ) : (
        <div className={homeStyles.grid}>
          {album.tracks.map((track) => (
            <TrackCard key={track.id} track={track} queue={album.tracks} />
          ))}
        </div>
      )}
    </main>
  );
}
