import { useState, useEffect, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import PendingTrackCard from "../components/PendingTrackCard";
import styles from "./Admin.module.css";

const GENRE_PRESETS = [
  "Pop","Rap","Rock","Hip-Hop","R&B","Electronic","Jazz","Classical",
  "Country","Reggae","Metal","Folk","Indie","Ambient","Lo-Fi","Funk",
];

// ── Genre selector ─────────────────────────────────────────────────────────────
function GenreSelect({ value, onChange }) {
  const [custom, setCustom] = useState(!GENRE_PRESETS.includes(value) && !!value);
  return (
    <div className={styles.genreRow}>
      <select
        className={`input ${styles.genreSelect}`}
        value={custom ? "__custom__" : (value || "")}
        onChange={(e) => {
          if (e.target.value === "__custom__") { setCustom(true); onChange(""); }
          else { setCustom(false); onChange(e.target.value); }
        }}
      >
        <option value="">— No genre —</option>
        {GENRE_PRESETS.map((g) => <option key={g} value={g}>{g}</option>)}
        <option value="__custom__">✏ Custom…</option>
      </select>
      {custom && (
        <input className="input" placeholder="Type genre…" value={value}
          onChange={(e) => onChange(e.target.value)} autoFocus />
      )}
    </div>
  );
}

// ── Upload form ────────────────────────────────────────────────────────────────
function UploadTrackForm({ onSuccess }) {
  const toast    = useToast();
  const audioRef = useRef();
  const coverRef = useRef();
  const [title, setTitle]   = useState("");
  const [artist, setArtist] = useState("");
  const [genre, setGenre]   = useState("");
  const [desc, setDesc]     = useState("");
  const [featuring, setFeaturing] = useState("");
  const [audioFile, setAudioFile] = useState(null);
  const [coverFile, setCoverFile] = useState(null);
  const [coverPreview, setCoverPreview] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleAudio = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setAudioFile(f);
    if (!title) {
      const name = f.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");
      setTitle(name.charAt(0).toUpperCase() + name.slice(1));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!audioFile) { toast("Select an mp3 file", "error"); return; }
    const fd = new FormData();
    fd.append("title", title);
    fd.append("artist", artist || "Unknown Artist");
    fd.append("genre", genre);
    fd.append("description", desc);
    fd.append("featuring", featuring);
    fd.append("audio", audioFile);
    if (coverFile) fd.append("cover", coverFile);
    setLoading(true);
    try {
      await api.adminUploadTrack(fd);
      toast("Track uploaded!", "success");
      setTitle(""); setArtist(""); setGenre(""); setDesc(""); setFeaturing("");
      setAudioFile(null); setCoverFile(null); setCoverPreview(null);
      if (audioRef.current) audioRef.current.value = "";
      if (coverRef.current) coverRef.current.value = "";
      onSuccess();
    } catch (err) { toast(err.message, "error"); }
    finally { setLoading(false); }
  };

  return (
    <form onSubmit={handleSubmit} className={styles.uploadForm}>
      <h2 className={styles.sectionTitle}>Upload New Track</h2>
      <div className={styles.uploadLayout}>
        <div className={styles.coverPicker} onClick={() => coverRef.current.click()}>
          {coverPreview
            ? <img src={coverPreview} alt="" className={styles.coverPreview} />
            : <div className={styles.coverPlaceholder}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="32" height="32">
                  <rect x="3" y="3" width="18" height="18" rx="2"/>
                  <circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>
                </svg>
                <span>Cover image</span>
              </div>
          }
          <input ref={coverRef} type="file" accept="image/*" onChange={(e) => {
            const f = e.target.files[0];
            if (f) { setCoverFile(f); setCoverPreview(URL.createObjectURL(f)); }
          }} hidden />
        </div>
        <div className={styles.uploadFields}>
          <div className="field">
            <label className="label">Track title *</label>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Song name" required />
          </div>
          <div className="field">
            <label className="label">Artist</label>
            <input className="input" value={artist} onChange={(e) => setArtist(e.target.value)} placeholder="Artist name" />
          </div>
          <div className="field">
            <label className="label">Genre</label>
            <GenreSelect value={genre} onChange={setGenre} />
          </div>
          <div className="field">
            <label className="label">Description</label>
            <input className="input" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="About this track…" />
          </div>
          <div className="field">
            <label className="label">Featuring</label>
            <input className="input" value={featuring} onChange={(e) => setFeaturing(e.target.value)} placeholder="@artist_one, Guest name" />
          </div>
          <div className="field">
            <label className="label">Audio file (mp3) *</label>
            <div className={styles.fileInputWrapper} onClick={() => audioRef.current.click()}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
              </svg>
              <span>{audioFile ? audioFile.name : "Choose mp3…"}</span>
            </div>
            <input ref={audioRef} type="file" accept="audio/*" onChange={handleAudio} hidden />
          </div>
        </div>
      </div>
      <button className="btn btn-primary" type="submit" disabled={loading} style={{ marginTop: 8 }}>
        {loading ? "Uploading…" : "Upload Track"}
      </button>
    </form>
  );
}

// ── Track row (edit / delete) ──────────────────────────────────────────────────
function TrackRow({ track, onDeleted, onUpdated }) {
  const toast    = useToast();
  const fileRef  = useRef();
  const [editing, setEditing] = useState(false);
  const [title,  setTitle]  = useState(track.title);
  const [artist, setArtist] = useState(track.artist);
  const [genre,  setGenre]  = useState(track.genre || "");
  const [coverFile, setCoverFile]     = useState(null);
  const [coverPreview, setCoverPreview] = useState(null);
  const [saving,   setSaving]   = useState(false);
  const [deleting, setDeleting] = useState(false);

  const PLACEHOLDER = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Crect width='40' height='40' fill='%231a1a1a'/%3E%3C/svg%3E`;

  const handleSave = async () => {
    const fd = new FormData();
    fd.append("title", title);
    fd.append("artist", artist);
    fd.append("genre", genre);
    if (coverFile) fd.append("cover", coverFile);
    setSaving(true);
    try {
      await api.updateTrack(track.id, fd);
      toast("Track updated", "success");
      setEditing(false); onUpdated();
    } catch (err) { toast(err.message, "error"); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete "${track.title}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await api.deleteTrack(track.id);
      toast("Track deleted", "success");
      onDeleted(track.id);
    } catch (err) { toast(err.message, "error"); setDeleting(false); }
  };

  const cancelEdit = () => {
    setEditing(false);
    setTitle(track.title); setArtist(track.artist); setGenre(track.genre || "");
    setCoverFile(null); setCoverPreview(null);
  };

  const statusColor = { published: "#38a169", pending: "#e8a838", rejected: "#e53e3e" };

  return (
    <div className={`${styles.trackRow} ${editing ? styles.trackRowEditing : ""}`}>
      <img
        src={coverPreview || track.coverUrl || PLACEHOLDER}
        alt="cover" className={styles.rowCover}
        onError={(e) => { e.currentTarget.src = PLACEHOLDER; }}
        style={{ cursor: editing ? "pointer" : "default" }}
        onClick={() => editing && fileRef.current.click()}
        title={editing ? "Click to change cover" : ""}
      />
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => {
        const f = e.target.files[0];
        if (f) { setCoverFile(f); setCoverPreview(URL.createObjectURL(f)); }
      }} />

      {editing ? (
        <div className={styles.rowEditFields}>
          <input className="input" value={title}  onChange={(e) => setTitle(e.target.value)}  placeholder="Title" />
          <input className="input" value={artist} onChange={(e) => setArtist(e.target.value)} placeholder="Artist" />
          <GenreSelect value={genre} onChange={setGenre} />
        </div>
      ) : (
        <div className={styles.rowMeta}>
          <span className={styles.rowTitle}>{track.title}</span>
          <span className={styles.rowArtist}>{track.artist}</span>
          {track.genre && <span className={styles.rowGenre}>{track.genre}</span>}
          <span className={styles.rowStatus} style={{ color: statusColor[track.status] || "#888" }}>
            {track.status || "published"}
          </span>
        </div>
      )}

      <div className={styles.rowStats}>
        <span className={styles.likes}>♥ {track.likesCount}</span>
        <span className={styles.plays}>▶ {track.playsFormatted || track.playsCount || 0}</span>
      </div>

      <div className={styles.rowActions}>
        {editing ? (
          <>
            <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>{saving ? "…" : "Save"}</button>
            <button className="btn btn-ghost btn-sm" onClick={cancelEdit}>Cancel</button>
          </>
        ) : (
          <>
            <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>Edit</button>
            <button className="btn btn-danger btn-sm" onClick={handleDelete} disabled={deleting}>{deleting ? "…" : "Delete"}</button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Pending tab ────────────────────────────────────────────────────────────────
function PendingTab() {
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.adminGetPending().then(setPending).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleAction = (id) => {
    setPending((prev) => prev.filter((t) => t.id !== id));
  };

  if (loading) return <div className={styles.loading}><div className={styles.spinner} /></div>;

  return (
    <div>
      <div className={styles.pendingHeader}>
        <h2 className={styles.sectionTitle}>Pending Review</h2>
        {pending.length > 0 && (
          <span className={styles.pendingBadge}>{pending.length} waiting</span>
        )}
      </div>
      {pending.length === 0 ? (
        <div className={styles.emptyPending}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="40" height="40">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          <p>No tracks pending review</p>
        </div>
      ) : (
        <div className={styles.pendingList}>
          {pending.map((t) => (
            <PendingTrackCard key={t.id} track={t} onAction={handleAction} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Users tab ──────────────────────────────────────────────────────────────────
function UsersTab() {
  const { user: me } = useAuth();
  const toast = useToast();
  const [users,   setUsers]   = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { api.getUsers().then(setUsers).finally(() => setLoading(false)); }, []);

  const handleDelete = async (id) => {
    if (!confirm("Delete this user?")) return;
    try { await api.deleteUser(id); setUsers((u) => u.filter((x) => x.id !== id)); toast("User deleted", "success"); }
    catch (err) { toast(err.message, "error"); }
  };

  const handleRoleToggle = async (user) => {
    const newRole = user.role === "admin" ? "user" : "admin";
    if (!confirm(`Change ${user.username}'s role to ${newRole}?`)) return;
    try {
      await api.setUserRole(user.id, newRole);
      setUsers((u) => u.map((x) => x.id === user.id ? { ...x, role: newRole } : x));
      toast("Role updated", "success");
    } catch (err) { toast(err.message, "error"); }
  };

  const handleAccountTypeToggle = async (user) => {
    const newType = user.accountType === "artist_pro" ? "artist" : "artist_pro";
    const label   = newType === "artist_pro" ? "Grant Artist Pro status" : "Remove Artist Pro status";
    if (!confirm(`${label} for ${user.username}?`)) return;
    try {
      await api.setAccountType(user.id, newType);
      setUsers((u) => u.map((x) => x.id === user.id ? { ...x, accountType: newType } : x));
      toast(newType === "artist_pro" ? `${user.username} is now Artist Pro ⭐` : "Artist Pro removed", "success");
    } catch (err) { toast(err.message, "error"); }
  };

  if (loading) return <div className={styles.loading}><div className={styles.spinner} /></div>;

  return (
    <div className={styles.usersTab}>
      <h2 className={styles.sectionTitle}>Users ({users.length})</h2>
      <div className={styles.usersTable}>
        <div className={styles.tableHeader}>
          <span>Username</span><span>Type</span><span>Role</span><span>Joined</span><span>Actions</span>
        </div>
        {users.map((u) => (
          <div key={u.id} className={styles.userRow}>
            <span className={styles.userName}>
              <Link to={`/profile/${u.username}`} className={styles.userLink}>{u.username}</Link>
              {u.id === me.id && <span className={styles.youBadge}>you</span>}
            </span>
            <span className={styles.accountTypeBadge} data-type={u.accountType}>
              {u.accountType === "artist_pro" ? "⭐ Artist Pro"
               : u.accountType === "artist"   ? "🎤 Artist"
               : "🎧 Listener"}
            </span>
            <span className={`${styles.roleBadge} ${u.role === "admin" ? styles.roleAdmin : styles.roleUser}`}>
              {u.role}
            </span>
            <span className={styles.userDate}>{new Date(u.createdAt).toLocaleDateString()}</span>
            <div className={styles.userActions}>
              {u.id !== me.id && (
                <>
                  <button className="btn btn-ghost btn-sm" onClick={() => handleRoleToggle(u)}>
                    {u.role === "admin" ? "Demote" : "Promote"}
                  </button>
                  {["artist","artist_pro"].includes(u.accountType) && (
                    <button
                      className={`btn btn-sm ${u.accountType === "artist_pro" ? "btn-ghost" : styles.btnPro}`}
                      onClick={() => handleAccountTypeToggle(u)}
                      title={u.accountType === "artist_pro" ? "Remove Artist Pro" : "Grant Artist Pro"}
                    >
                      {u.accountType === "artist_pro" ? "Remove Pro" : "⭐ Grant Pro"}
                    </button>
                  )}
                  <button className="btn btn-danger btn-sm" onClick={() => handleDelete(u.id)}>Delete</button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


function AlbumsTab({ albums, loading, onRefresh }) {
  const toast = useToast();
  const [rejectingId, setRejectingId] = useState(null);
  const [actingId, setActingId] = useState(null);

  const handleApprove = async (albumId) => {
    setActingId(albumId);
    try {
      await api.adminApproveAlbum(albumId);
      toast("Album approved", "success");
      onRefresh();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setActingId(null);
    }
  };

  const handleReject = async (albumId) => {
    const reason = prompt("Reject reason (optional):", "");
    if (reason === null) return;
    setRejectingId(albumId);
    try {
      await api.adminRejectAlbum(albumId, reason);
      toast("Album rejected", "success");
      onRefresh();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setRejectingId(null);
    }
  };

  if (loading) return <div className={styles.loading}><div className={styles.spinner} /></div>;
  if (albums.length === 0) return <p className={styles.emptyMsg}>No albums yet.</p>;

  return (
    <div className={styles.albumList}>
      {albums.map((album) => (
        <div key={album.id} className={styles.albumRow}>
          <div className={styles.albumMeta}>
            <strong>{album.title}</strong>
            <span>{album.artist}</span>
          </div>
          <div className={styles.albumStats}>
            <span>{album.trackCount || 0} tracks</span>
            <span>♥ {album.likesCount || 0}</span>
            <span className={styles.albumStatus} data-status={album.status || "published"}>{album.status || "published"}</span>
          </div>
          <div className={styles.albumActions}>
            {album.status === "pending" && (
              <>
                <button className="btn btn-primary btn-sm" onClick={() => handleApprove(album.id)} disabled={actingId === album.id || rejectingId === album.id}>
                  {actingId === album.id ? "Approving…" : "Approve"}
                </button>
                <button className="btn btn-danger btn-sm" onClick={() => handleReject(album.id)} disabled={actingId === album.id || rejectingId === album.id}>
                  {rejectingId === album.id ? "Rejecting…" : "Reject"}
                </button>
              </>
            )}
            <Link to={`/albums/${album.id}`} className="btn btn-ghost btn-sm">Open</Link>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Stats tab ──────────────────────────────────────────────────────────────────
function StatsTab({ tracks }) {
  const genreCounts = tracks.reduce((acc, t) => {
    const g = t.genre || "Unknown";
    acc[g] = (acc[g] || 0) + 1;
    return acc;
  }, {});
  const genreList = Object.entries(genreCounts).sort((a, b) => b[1] - a[1]);
  const maxCount  = genreList[0]?.[1] || 1;

  const topLiked  = [...tracks].sort((a, b) => b.likesCount  - a.likesCount ).slice(0, 5);
  const topPlayed = [...tracks].sort((a, b) => b.playsCount  - a.playsCount ).slice(0, 5);

  const totalPlays = tracks.reduce((s, t) => s + (t.playsCount || 0), 0);

  return (
    <div className={styles.statsTab}>
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <span className={styles.statNum}>{tracks.length}</span>
          <span className={styles.statLabel}>Total tracks</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statNum}>{tracks.reduce((s, t) => s + t.likesCount, 0)}</span>
          <span className={styles.statLabel}>Total likes</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statNum}>{totalPlays.toLocaleString()}</span>
          <span className={styles.statLabel}>Total plays</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statNum}>{genreList.length}</span>
          <span className={styles.statLabel}>Genres</span>
        </div>
      </div>

      <div className={styles.statsColumns}>
        {/* Genre chart */}
        <div className={styles.statsSection}>
          <h3 className={styles.statsSubtitle}>Tracks by genre</h3>
          {genreList.length === 0
            ? <p className={styles.emptyMsg}>No genre data yet.</p>
            : genreList.map(([genre, count]) => (
              <div key={genre} className={styles.genreBar}>
                <div className={styles.genreBarLabel}>
                  <span>{genre}</span>
                  <span className={styles.genreBarCount}>{count}</span>
                </div>
                <div className={styles.genreBarTrack}>
                  <div className={styles.genreBarFill} style={{ width: `${(count / maxCount) * 100}%` }} />
                </div>
              </div>
            ))
          }
        </div>

        {/* Top played */}
        <div className={styles.statsSection}>
          <h3 className={styles.statsSubtitle}>Most played</h3>
          {topPlayed.length === 0
            ? <p className={styles.emptyMsg}>No plays yet.</p>
            : topPlayed.map((t, i) => (
              <div key={t.id} className={styles.topTrackRow}>
                <span className={styles.topTrackRank}>#{i + 1}</span>
                <div className={styles.topTrackMeta}>
                  <span className={styles.topTrackTitle}>{t.title}</span>
                  <span className={styles.topTrackArtist}>{t.artist}</span>
                </div>
                <span className={styles.topTrackLikes}>▶ {t.playsFormatted || t.playsCount || 0}</span>
              </div>
            ))
          }
        </div>

        {/* Top liked */}
        <div className={styles.statsSection}>
          <h3 className={styles.statsSubtitle}>Most liked</h3>
          {topLiked.length === 0
            ? <p className={styles.emptyMsg}>No likes yet.</p>
            : topLiked.map((t, i) => (
              <div key={t.id} className={styles.topTrackRow}>
                <span className={styles.topTrackRank}>#{i + 1}</span>
                <div className={styles.topTrackMeta}>
                  <span className={styles.topTrackTitle}>{t.title}</span>
                  <span className={styles.topTrackArtist}>{t.artist}</span>
                </div>
                <span className={styles.topTrackLikes}>♥ {t.likesCount}</span>
              </div>
            ))
          }
        </div>
      </div>
    </div>
  );
}

// ── Main Admin Page ────────────────────────────────────────────────────────────
export default function Admin() {
  const { user }   = useAuth();
  const navigate   = useNavigate();
  const [tab, setTab]           = useState("pending");
  const [tracks, setTracks]     = useState([]);
  const [albums, setAlbums]     = useState([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingAlbumCount, setPendingAlbumCount] = useState(0);
  const [loadingTracks, setLoadingTracks] = useState(true);
  const [loadingAlbums, setLoadingAlbums] = useState(true);

  useEffect(() => {
    if (!user || user.role !== "admin") { navigate("/"); return; }
    fetchTracks();
    fetchAlbums();
    api.adminGetPending().then((p) => setPendingCount(p.length)).catch(() => {});
  }, [user]);

  const fetchTracks = () => {
    setLoadingTracks(true);
    api.adminGetAllTracks().then(setTracks).finally(() => setLoadingTracks(false));
  };

  const fetchAlbums = () => {
    setLoadingAlbums(true);
    api.adminGetAlbums()
      .then((items) => {
        setAlbums(items);
        setPendingAlbumCount(items.filter((album) => album.status === "pending").length);
      })
      .finally(() => setLoadingAlbums(false));
  };

  const handleTrackDeleted = (id) => setTracks((t) => t.filter((x) => x.id !== id));

  if (!user || user.role !== "admin") return null;

  const TABS = [
    { id: "pending", label: pendingCount > 0 ? `⏳ Pending (${pendingCount})` : "Pending" },
    { id: "tracks",  label: `Tracks (${tracks.length})` },
    { id: "albums",  label: pendingAlbumCount > 0 ? `Albums (${albums.length}) • ${pendingAlbumCount} pending` : `Albums (${albums.length})` },
    { id: "users",   label: "Users" },
    { id: "stats",   label: "Stats" },
  ];

  return (
    <main className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.pageTitle}>Admin Panel</h1>
          <p className={styles.pageSub}>Manage tracks and albums, moderate submissions, view statistics</p>
        </div>
      </div>

      <div className={styles.tabs}>
        {TABS.map((t) => (
          <button key={t.id}
            className={`${styles.tab} ${tab === t.id ? styles.tabActive : ""} ${t.id === "pending" && pendingCount > 0 ? styles.tabPending : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "pending" && (
        <div className={styles.content}><PendingTab /></div>
      )}

      {tab === "tracks" && (
        <div className={styles.content}>
          <UploadTrackForm onSuccess={fetchTracks} />
          <div className={styles.divider} />
          <h2 className={styles.sectionTitle}>All Tracks</h2>
          {loadingTracks ? (
            <div className={styles.loading}><div className={styles.spinner} /></div>
          ) : tracks.length === 0 ? (
            <p className={styles.emptyMsg}>No tracks yet.</p>
          ) : (
            <div className={styles.trackList}>
              {tracks.map((t) => (
                <TrackRow key={t.id} track={t} onDeleted={handleTrackDeleted} onUpdated={fetchTracks} />
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "albums" && (
        <div className={styles.content}><AlbumsTab albums={albums} loading={loadingAlbums} onRefresh={fetchAlbums} /></div>
      )}

      {tab === "users" && (
        <div className={styles.content}><UsersTab /></div>
      )}

      {tab === "stats" && (
        <div className={styles.content}>
          {loadingTracks
            ? <div className={styles.loading}><div className={styles.spinner} /></div>
            : <StatsTab tracks={tracks} />
          }
        </div>
      )}
    </main>
  );
}
