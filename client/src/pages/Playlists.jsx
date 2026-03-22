import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { usePlayer } from "../context/PlayerContext";
import { formatArtistLine } from "../utils/trackArtists";
import homeStyles from "./Home.module.css";
import styles from "./Playlists.module.css";

const COVER_PH = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Crect width='200' height='200' fill='%231a1a1a'/%3E%3Cpath d='M80 60h40v80H80zM90 100h20v40H90z' fill='%23333'/%3E%3C/svg%3E`;
const TRACK_PH = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Crect width='40' height='40' fill='%23222'/%3E%3Ccircle cx='20' cy='20' r='8' fill='%23333'/%3E%3C/svg%3E`;

export default function Playlists() {
  const { user } = useAuth();
  const toast = useToast();
  const { loadTrack, currentTrack, isPlaying, togglePlay } = usePlayer();
  const coverRef = useRef(null);
  const editCoverRef = useRef(null);

  const [playlists, setPlaylists] = useState([]);
  const [tracks, setTracks] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [loading, setLoading] = useState(true);

  // Create form
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [coverFile, setCoverFile] = useState(null);
  const [coverPreview, setCoverPreview] = useState(null);

  // Edit mode
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editCoverFile, setEditCoverFile] = useState(null);
  const [editCoverPreview, setEditCoverPreview] = useState(null);

  // Add tracks
  const [filter, setFilter] = useState("");

  const load = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [playlistData, trackData] = await Promise.all([api.getPlaylists(), api.getTracks()]);
      setPlaylists(playlistData);
      setTracks(trackData);
      setActiveId(cur => cur || playlistData[0]?.id || null);
    } catch (e) { toast(e.message, "error"); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [user]);

  const activePlaylist = playlists.find(p => p.id === activeId) || null;
  const activeTrackIds = new Set(activePlaylist?.tracks?.map(t => t.id) || []);

  const filteredTracks = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return tracks.filter(t => {
      if (activeTrackIds.has(t.id)) return false; // hide already added
      if (!q) return true;
      return [t.title, t.artistLine || t.artist, t.genre || ""].some(v => v.toLowerCase().includes(q));
    });
  }, [tracks, filter, activeTrackIds]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      const fd = new FormData();
      fd.append("name", name.trim());
      fd.append("description", description.trim());
      if (coverFile) fd.append("cover", coverFile);
      const result = await api.createPlaylist(fd);
      setPlaylists(prev => [result.playlist, ...prev]);
      setActiveId(result.playlist.id);
      setName(""); setDescription(""); setCoverFile(null); setCoverPreview(null);
      toast("Плейлист создан", "success");
    } catch (e) { toast(e.message, "error"); }
  };

  const handleSaveEdit = async () => {
    if (!activePlaylist || !editName.trim()) return;
    try {
      const fd = new FormData();
      fd.append("name", editName.trim());
      fd.append("description", editDesc.trim());
      if (editCoverFile) fd.append("cover", editCoverFile);
      const result = await api.updatePlaylist(activePlaylist.id, fd);
      setPlaylists(prev => prev.map(p => p.id === activePlaylist.id ? result.playlist : p));
      setEditing(false); setEditCoverFile(null); setEditCoverPreview(null);
      toast("Сохранено", "success");
    } catch (e) { toast(e.message, "error"); }
  };

  const startEdit = () => {
    setEditName(activePlaylist.name);
    setEditDesc(activePlaylist.description || "");
    setEditCoverPreview(null);
    setEditing(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Удалить плейлист?")) return;
    try {
      await api.deletePlaylist(id);
      setPlaylists(prev => prev.filter(p => p.id !== id));
      setActiveId(cur => cur === id ? null : cur);
      toast("Плейлист удалён", "success");
    } catch (e) { toast(e.message, "error"); }
  };

  const handleAddTrack = async (trackId) => {
    if (!activePlaylist) return;
    try {
      const result = await api.addTrackToPlaylist(activePlaylist.id, trackId);
      setPlaylists(prev => prev.map(p => p.id === activePlaylist.id ? result.playlist : p));
    } catch (e) { toast(e.message, "error"); }
  };

  const handleRemoveTrack = async (trackId) => {
    if (!activePlaylist) return;
    try {
      await api.removeTrackFromPlaylist(activePlaylist.id, trackId);
      setPlaylists(prev => prev.map(p => p.id === activePlaylist.id
        ? { ...p, tracks: p.tracks.filter(t => t.id !== trackId) }
        : p));
    } catch (e) { toast(e.message, "error"); }
  };

  const handlePlay = () => {
    if (!activePlaylist?.tracks?.length) return;
    const isThisPlaying = activePlaylist.tracks.some(t => t.id === currentTrack?.id) && isPlaying;
    if (isThisPlaying) togglePlay();
    else loadTrack(activePlaylist.tracks[0], activePlaylist.tracks);
  };

  if (!user) return (
    <main className={homeStyles.page}>
      <div className={homeStyles.empty}><p className={homeStyles.emptyText}>Войдите чтобы создавать плейлисты.</p></div>
    </main>
  );

  if (loading) return (
    <main className={homeStyles.page}>
      <div className={homeStyles.empty}><div className={homeStyles.spinner} /></div>
    </main>
  );

  const isThisPlaying = activePlaylist?.tracks?.some(t => t.id === currentTrack?.id) && isPlaying;

  return (
    <main className={homeStyles.page}>
      <div className={styles.layout}>

        {/* ── LEFT SIDEBAR ──────────────────────────────── */}
        <aside className={styles.sidebar}>

          {/* Create form */}
          <div className={styles.createCard}>
            <h2 className={styles.createTitle}>Новый плейлист</h2>

            {/* Cover picker */}
            <div className={styles.coverPickerWrap} onClick={() => coverRef.current?.click()}>
              <img
                src={coverPreview || COVER_PH}
                alt=""
                className={styles.coverPickerImg}
                onError={e => { e.currentTarget.src = COVER_PH; }}
              />
              <div className={styles.coverPickerOverlay}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="22" height="22">
                  <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>
                </svg>
                <span>{coverPreview ? "Изменить" : "Добавить обложку"}</span>
              </div>
              <input ref={coverRef} type="file" accept="image/*" hidden onChange={e => {
                const f = e.target.files[0];
                if (f) { setCoverFile(f); setCoverPreview(URL.createObjectURL(f)); }
              }} />
            </div>

            <input className="input" value={name} onChange={e => setName(e.target.value)}
              placeholder="Название плейлиста" onKeyDown={e => e.key === "Enter" && handleCreate(e)} />
            <textarea className="input" rows={2} value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Описание (необязательно)"
              style={{ resize: "vertical" }} />
            <button className="btn btn-primary" onClick={handleCreate} disabled={!name.trim()}>
              Создать
            </button>
          </div>

          {/* Playlist list */}
          {playlists.length > 0 && (
            <div className={styles.playlistList}>
              {playlists.map(p => (
                <button key={p.id} type="button"
                  className={`${styles.playlistButton} ${p.id === activeId ? styles.playlistButtonActive : ""}`}
                  onClick={() => { setActiveId(p.id); setEditing(false); }}>
                  <img
                    src={p.coverUrl || COVER_PH}
                    alt=""
                    className={styles.playlistThumb}
                    onError={e => { e.currentTarget.src = COVER_PH; }}
                  />
                  <div className={styles.playlistInfo}>
                    <span className={styles.playlistName}>{p.name}</span>
                    <span className={styles.playlistMeta}>{p.tracks?.length || 0} треков</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </aside>

        {/* ── RIGHT CONTENT ─────────────────────────────── */}
        <section className={styles.content}>
          {activePlaylist ? (
            <>
              {/* Playlist hero */}
              {editing ? (
                <div className={styles.editCard}>
                  <div className={styles.editCoverRow}>
                    <div className={styles.editCoverWrap} onClick={() => editCoverRef.current?.click()}>
                      <img
                        src={editCoverPreview || activePlaylist.coverUrl || COVER_PH}
                        alt=""
                        className={styles.editCoverImg}
                        onError={e => { e.currentTarget.src = COVER_PH; }}
                      />
                      <div className={styles.coverPickerOverlay}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                      </div>
                      <input ref={editCoverRef} type="file" accept="image/*" hidden onChange={e => {
                        const f = e.target.files[0];
                        if (f) { setEditCoverFile(f); setEditCoverPreview(URL.createObjectURL(f)); }
                      }} />
                    </div>
                    <div className={styles.editFields}>
                      <input className="input" value={editName} onChange={e => setEditName(e.target.value)} placeholder="Название" />
                      <textarea className="input" rows={2} value={editDesc}
                        onChange={e => setEditDesc(e.target.value)}
                        placeholder="Описание" style={{ resize: "vertical" }} />
                      <div className={styles.editActions}>
                        <button className="btn btn-primary btn-sm" onClick={handleSaveEdit}>Сохранить</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>Отмена</button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className={styles.playlistHero}>
                  <img
                    src={activePlaylist.coverUrl || COVER_PH}
                    alt={activePlaylist.name}
                    className={styles.heroCover}
                    onError={e => { e.currentTarget.src = COVER_PH; }}
                  />
                  <div className={styles.heroMeta}>
                    <span className={styles.heroLabel}>Плейлист</span>
                    <h1 className={styles.heroName}>{activePlaylist.name}</h1>
                    {activePlaylist.description && <p className={styles.heroDesc}>{activePlaylist.description}</p>}
                    <p className={styles.heroCount}>{activePlaylist.tracks?.length || 0} треков</p>
                    <div className={styles.heroActions}>
                      {activePlaylist.tracks?.length > 0 && (
                        <button className={styles.bigPlayBtn} onClick={handlePlay}>
                          {isThisPlaying
                            ? <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><rect x="5" y="3" width="4" height="18" rx="2"/><rect x="15" y="3" width="4" height="18" rx="2"/></svg>
                            : <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M8 5.14v14l11-7-11-7z"/></svg>}
                          {isThisPlaying ? "Пауза" : "Слушать"}
                        </button>
                      )}
                      <button className={styles.editBtn} onClick={startEdit}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                        Изменить
                      </button>
                      <button className={styles.deleteBtn} onClick={() => handleDelete(activePlaylist.id)}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6m4-6v6"/><path d="M9 6V4h6v2"/>
                        </svg>
                        Удалить
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Track list inside playlist */}
              {activePlaylist.tracks?.length > 0 && (
                <div className={styles.trackListCard}>
                  {activePlaylist.tracks.map((track, idx) => {
                    const isActive = currentTrack?.id === track.id;
                    return (
                      <div key={track.id}
                        className={`${styles.trackRow} ${isActive ? styles.trackRowActive : ""}`}
                        onClick={() => loadTrack(track, activePlaylist.tracks)}>
                        <span className={styles.trackIdx}>
                          {isActive && isPlaying
                            ? <span className={styles.eq}><span/><span/><span/></span>
                            : idx + 1}
                        </span>
                        <img
                          src={track.coverUrl || TRACK_PH}
                          alt=""
                          className={styles.trackCover}
                          onError={e => { e.currentTarget.src = TRACK_PH; }}
                        />
                        <div className={styles.trackMeta}>
                          <span className={styles.trackTitle}>{track.title}</span>
                          <span className={styles.trackArtist}>{formatArtistLine(track)}</span>
                        </div>
                        {track.genre && <span className={styles.trackGenre}>{track.genre}</span>}
                        <button className={styles.removeBtn}
                          onClick={e => { e.stopPropagation(); handleRemoveTrack(track.id); }}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                          </svg>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Add tracks */}
              <div className={styles.addCard}>
                <div className={styles.addHeader}>
                  <h3 className={styles.addTitle}>Добавить треки</h3>
                  <div className={styles.searchWrap}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14" className={styles.searchIcon}>
                      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                    </svg>
                    <input className={styles.searchInput} value={filter}
                      onChange={e => setFilter(e.target.value)}
                      placeholder="Поиск по названию или артисту..." />
                  </div>
                </div>
                <div className={styles.browseList}>
                  {filteredTracks.length === 0 && (
                    <p className={styles.emptyNote}>
                      {filter ? "Ничего не найдено" : "Все треки уже добавлены в плейлист"}
                    </p>
                  )}
                  {filteredTracks.map(track => (
                    <div key={track.id} className={styles.browseRow}>
                      <img
                        src={track.coverUrl || TRACK_PH}
                        alt=""
                        className={styles.trackCover}
                        onError={e => { e.currentTarget.src = TRACK_PH; }}
                      />
                      <div className={styles.trackMeta}>
                        <span className={styles.trackTitle}>{track.title}</span>
                        <span className={styles.trackArtist}>{formatArtistLine(track)}</span>
                      </div>
                      {track.genre && <span className={styles.trackGenre}>{track.genre}</span>}
                      <button className={styles.addBtn} onClick={() => handleAddTrack(track.id)}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="14" height="14">
                          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className={styles.emptyState}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="48" height="48" style={{ color: "var(--text-muted)" }}>
                <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
              </svg>
              <p>Создай свой первый плейлист</p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
