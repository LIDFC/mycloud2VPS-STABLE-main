import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import ArtistHeader from "../components/ArtistHeader";
import TrackCard from "../components/TrackCard";
import AlbumCard from "../components/AlbumCard";
import PostCard from "../components/PostCard";
import CreatePost from "../components/CreatePost";
import CreateDrop from "../components/CreateDrop";
import DropCard from "../components/DropCard";
import styles from "./ProfilePage.module.css";
import homeStyles from "./Home.module.css";

const GENRE_PRESETS = [
  "Pop","Rap","Rock","Hip-Hop","R&B","Electronic","Jazz","Classical",
  "Country","Reggae","Metal","Folk","Indie","Ambient","Lo-Fi","Funk",
];

// ── Artist upload form ────────────────────────────────────────────────────────
function ArtistUploadForm({ onSuccess }) {
  const toast = useToast();
  const { user } = useAuth();
  const audioRef = useRef();
  const coverRef = useRef();

  const [title, setTitle]       = useState("");
  const [artist, setArtist]     = useState(user?.username || "");
  const [genre, setGenre]       = useState("");
  const [desc, setDesc]         = useState("");
  const [featuring, setFeaturing] = useState("");
  const [audioFile, setAudioFile] = useState(null);
  const [coverFile, setCoverFile] = useState(null);
  const [coverPreview, setCoverPreview] = useState(null);
  const [loading, setLoading]   = useState(false);
  const [open, setOpen]         = useState(false);

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
    fd.append("artist", artist || user.username);
    fd.append("genre", genre);
    fd.append("description", desc);
    fd.append("featuring", featuring);
    fd.append("audio", audioFile);
    if (coverFile) fd.append("cover", coverFile);

    setLoading(true);
    try {
      await api.uploadTrack(fd);
      toast("Track submitted for moderation!", "success");
      setTitle(""); setArtist(user?.username || ""); setGenre(""); setDesc(""); setFeaturing("");
      setAudioFile(null); setCoverFile(null); setCoverPreview(null);
      if (audioRef.current) audioRef.current.value = "";
      if (coverRef.current) coverRef.current.value = "";
      setOpen(false);
      onSuccess?.();
    } catch (err) { toast(err.message, "error"); }
    finally { setLoading(false); }
  };

  return (
    <div className={styles.uploadSection}>
      <button className="btn btn-primary" onClick={() => setOpen((v) => !v)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
        Upload Track
      </button>

      {open && (
        <form onSubmit={handleSubmit} className={styles.uploadForm}>
          <div className={styles.uploadHint}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            Track will go to moderation before publishing
          </div>
          <div className={styles.uploadGrid}>
            <div className={styles.coverPicker} onClick={() => coverRef.current.click()}>
              {coverPreview
                ? <img src={coverPreview} alt="" className={styles.coverPreview} />
                : <div className={styles.coverPlaceholder}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="28" height="28"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>
                    <span>Cover</span>
                  </div>
              }
              <input ref={coverRef} type="file" accept="image/*" onChange={(e) => {
                const f = e.target.files[0];
                if (f) { setCoverFile(f); setCoverPreview(URL.createObjectURL(f)); }
              }} hidden />
            </div>
            <div className={styles.uploadFields}>
              <div className="field">
                <label className="label">Title *</label>
                <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Track name" required />
              </div>
              <div className="field">
                <label className="label">Artist name</label>
                <input className="input" value={artist} onChange={(e) => setArtist(e.target.value)} placeholder="Your artist name" />
              </div>
              <div className="field">
                <label className="label">Genre</label>
                <select className="input" value={genre} onChange={(e) => setGenre(e.target.value)} style={{colorScheme:"dark"}}>
                  <option value="">— No genre —</option>
                  {GENRE_PRESETS.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
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
                <div className={styles.fileInputBtn} onClick={() => audioRef.current.click()}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                  <span>{audioFile ? audioFile.name : "Choose mp3…"}</span>
                </div>
                <input ref={audioRef} type="file" accept="audio/*" onChange={handleAudio} hidden />
              </div>
            </div>
          </div>
          <div className={styles.uploadActions}>
            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? "Uploading…" : "Submit for Review"}
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}

// ── Edit profile form ─────────────────────────────────────────────────────────
function EditProfileForm({ profile, onSaved, onCancel }) {
  const { refreshUser } = useAuth();
  const toast     = useToast();
  const navigate  = useNavigate();
  const avatarRef = useRef();
  const backgroundRef = useRef();

  const [username,    setUsername]    = useState(profile.username || "");
  const [bio,         setBio]         = useState(profile.bio || "");
  const [avatarFile,  setAvatarFile]  = useState(null);
  const [backgroundFile, setBackgroundFile] = useState(null);
  const [preview,     setPreview]     = useState(null);
  const [backgroundPreview, setBackgroundPreview] = useState(null);
  const [loading,     setLoading]     = useState(false);
  const [usernameErr, setUsernameErr] = useState("");

  const usernameChanged = username.trim() !== profile.username;

  const validateUsername = (val) => {
    if (val.length < 3)              return "Min 3 characters";
    if (!/^[a-zA-Z0-9_.-]+$/.test(val)) return "Only letters, numbers, _ . -";
    return "";
  };

  const handleUsernameChange = (val) => {
    setUsername(val);
    setUsernameErr(validateUsername(val));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const err = validateUsername(username);
    if (err) { setUsernameErr(err); return; }

    const fd = new FormData();
    fd.append("bio", bio);
    if (usernameChanged) fd.append("username", username.trim());
    if (avatarFile) fd.append("avatar", avatarFile);
    if (backgroundFile) fd.append("background", backgroundFile);

    setLoading(true);
    try {
      const res = await api.updateProfile(fd);
      if (res.token) localStorage.setItem("token", res.token);
      await refreshUser();
      toast("Profile updated!", "success");
      if (usernameChanged) navigate(`/profile/${username.trim()}`, { replace: true });
      onSaved?.();
    } catch (err) { toast(err.message, "error"); }
    finally { setLoading(false); }
  };

  return (
    <form onSubmit={handleSave} className={styles.editForm}>
      <h3 className={styles.editTitle}>Edit Profile</h3>
      <div className={styles.backgroundEditor}>
        <button type="button" className={styles.backgroundPreviewBtn} onClick={() => backgroundRef.current.click()}>
          {(backgroundPreview || profile.backgroundUrl)
            ? <img src={backgroundPreview || profile.backgroundUrl} alt="" className={styles.backgroundPreviewImg} />
            : <div className={styles.backgroundPlaceholder}>Upload profile background</div>}
        </button>
        <input ref={backgroundRef} type="file" accept="image/*" hidden onChange={(e) => {
          const f = e.target.files[0];
          if (f) { setBackgroundFile(f); setBackgroundPreview(URL.createObjectURL(f)); }
        }} />
      </div>
      <div className={styles.editAvatar}>
        <div className={styles.editAvatarWrap}>
          {(preview || profile.avatarUrl)
            ? <img src={preview || profile.avatarUrl} alt="" className={styles.editAvatarImg} onError={(e) => { e.currentTarget.style.display = "none"; }} />
            : <div className={styles.editAvatarPlaceholder}>{profile.username[0].toUpperCase()}</div>}
          <button type="button" className={styles.editAvatarBtn} onClick={() => avatarRef.current.click()} title="Change avatar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
        </div>
        <input ref={avatarRef} type="file" accept="image/*" hidden onChange={(e) => {
          const f = e.target.files[0];
          if (f) { setAvatarFile(f); setPreview(URL.createObjectURL(f)); }
        }} />
      </div>
      <div className="field">
        <label className="label">
          Username
          {usernameChanged && <span className={styles.changedBadge}>will change URL</span>}
        </label>
        <input
          className={`input ${usernameErr ? styles.inputError : ""}`}
          value={username}
          onChange={(e) => handleUsernameChange(e.target.value)}
          placeholder="your_username"
          minLength={3}
          required
        />
        {usernameErr && <p className={styles.fieldError}>{usernameErr}</p>}
        {usernameChanged && !usernameErr && (
          <p className={styles.fieldHint}>Your profile URL will change to /profile/{username.trim()}</p>
        )}
      </div>
      <div className="field">
        <label className="label">Bio</label>
        <textarea
          className="input"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="Tell people about yourself…"
          rows={3}
          style={{ resize: "vertical" }}
        />
      </div>
      <div className={styles.editActions}>
        <button className="btn btn-primary" type="submit" disabled={loading || !!usernameErr}>
          {loading ? "Saving…" : "Save changes"}
        </button>
        <button className="btn btn-ghost" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

// ── Main ProfilePage ──────────────────────────────────────────────────────────
export default function ProfilePage() {
  const { username } = useParams();
  const { user, loading: authLoading } = useAuth();
  const toast    = useToast();
  const navigate = useNavigate();

  const [profile, setProfile]   = useState(null);
  const [loading, setLoading]   = useState(true);
  const [tab, setTab]           = useState("posts");
  const [editing, setEditing]   = useState(false);
  const [posts, setPosts]       = useState([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [drops, setDrops]       = useState([]);
  const [dropsLoading, setDropsLoading] = useState(false);

  const isOwn    = user?.username?.toLowerCase() === username?.toLowerCase();
  const isArtist = ["artist","artist_pro"].includes(profile?.accountType);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.getProfile(username);
      setProfile(data);
    } catch { navigate("/"); }
    finally { setLoading(false); }
  };

  const loadPosts = async () => {
    setPostsLoading(true);
    try {
      const data = await api.getPosts(username);
      setPosts(data);
    } catch {}
    finally { setPostsLoading(false); }
  };

  const loadDrops = async () => {
    setDropsLoading(true);
    try {
      const data = await api.getArtistDrops(username);
      setDrops(data);
    } catch {}
    finally { setDropsLoading(false); }
  };

  useEffect(() => { load(); }, [username, user?.username]);

  useEffect(() => {
    if (profile && tab === "posts") loadPosts();
    if (profile && tab === "drops") loadDrops();
  }, [tab, profile?.id]);

  if (loading || authLoading) return (
    <main className={homeStyles.page}>
      <div className={homeStyles.empty}><div className={homeStyles.spinner} /></div>
    </main>
  );

  if (!profile) return null;

  const TABS = [
    { id: "posts",   label: `Посты`,                                          show: true },
    { id: "drops",   label: `Дропы (${drops.length})`,                        show: isArtist },
    { id: "tracks",  label: `Треки (${profile.tracks?.length || 0})`,         show: isArtist },
    { id: "albums",  label: `Альбомы (${profile.albums?.length || 0})`,       show: isArtist },
    { id: "reposted",label: `Репосты (${profile.reposted?.length || 0})`,     show: true },
    { id: "liked",   label: `Лайки (${profile.liked?.length || 0})`,          show: isOwn },
  ].filter((t) => t.show);

  const currentList = {
    tracks:   profile.tracks   || [],
    reposted: profile.reposted || [],
    liked:    profile.liked    || [],
  }[tab] || [];
  const currentAlbums = tab === "albums" ? (profile.albums || []) : [];

  return (
    <main className={homeStyles.page}>
      <ArtistHeader profile={profile} onUpdate={load} />

      {isOwn && (
        <div className={styles.ownerBar}>
          {!editing && (
            <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>
              Edit Profile
            </button>
          )}
          {isArtist && <ArtistUploadForm onSuccess={load} />}
          {isArtist && (
            <CreateDrop
              myTracks={(profile.tracks || []).filter(t => t.status === "published")}
              onCreated={(drop) => { setDrops(prev => [drop, ...prev]); setTab("drops"); }}
            />
          )}
        </div>
      )}

      {editing && (
        <EditProfileForm
          profile={profile}
          onSaved={() => { setEditing(false); load(); }}
          onCancel={() => setEditing(false)}
        />
      )}

      {/* Tabs */}
      {TABS.length > 1 && (
        <div className={styles.tabs}>
          {TABS.map((t) => (
            <button key={t.id}
              className={`${styles.tab} ${tab === t.id ? styles.tabActive : ""}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Posts tab ─────────────────────────────────────────────── */}
      {tab === "posts" && (
        <div className={styles.postsColumn}>
          {isOwn && isArtist && (
            <CreatePost
              myTracks={profile.tracks || []}
              onCreated={(post) => setPosts(prev => [post, ...prev])}
            />
          )}
          {postsLoading && (
            <div className={homeStyles.empty}><div className={homeStyles.spinner} /></div>
          )}
          {!postsLoading && posts.length === 0 && (
            <div className={homeStyles.empty} style={{ minHeight: 120 }}>
              <p className={homeStyles.emptyText}>
                {isOwn ? "Опубликуй свой первый пост!" : "Постов пока нет"}
              </p>
            </div>
          )}
          {posts.map(post => (
            <PostCard
              key={post.id}
              post={post}
              onDelete={(id) => setPosts(prev => prev.filter(p => p.id !== id))}
            />
          ))}
        </div>
      )}

      {/* ── Drops tab ─────────────────────────────────────────────── */}
      {tab === "drops" && (
        <div className={styles.postsColumn}>
          {dropsLoading && (
            <div className={homeStyles.empty}><div className={homeStyles.spinner} /></div>
          )}
          {!dropsLoading && drops.length === 0 && (
            <div className={homeStyles.empty} style={{ minHeight: 120 }}>
              <p className={homeStyles.emptyText}>
                {isOwn
                  ? "Создай анонс своего следующего релиза через кнопку «Анонс релиза» выше"
                  : "Анонсов пока нет"}
              </p>
            </div>
          )}
          {drops.map(drop => (
            <DropCard
              key={drop.id}
              drop={drop}
              showArtist={false}
              myTracks={(profile.tracks || []).filter(t => t.status === "published")}
              onUpdate={(updated) => setDrops(prev => prev.map(d => d.id === updated.id ? updated : d))}
              onDelete={(id) => setDrops(prev => prev.filter(d => d.id !== id))}
            />
          ))}
        </div>
      )}

      {/* ── Albums tab ───────────────────────────────────────────── */}
      {tab === "albums" && (
        currentAlbums.length === 0 ? (
          <div className={homeStyles.empty}>
            <p className={homeStyles.emptyText}>No albums yet.</p>
          </div>
        ) : (
          <div className={homeStyles.grid}>
            {currentAlbums.map((album) => (
              <AlbumCard key={album.id} album={album} />
            ))}
          </div>
        )
      )}

      {/* ── Tracks / Liked / Reposted tabs ──────────────────────── */}
      {tab !== "albums" && tab !== "posts" && (
        currentList.length === 0 ? (
          <div className={homeStyles.empty}>
            <p className={homeStyles.emptyText}>No tracks here yet.</p>
          </div>
        ) : (
          <div className={homeStyles.grid}>
            {currentList.map((track) => (
              <TrackCard key={track.id} track={track} queue={currentList} />
            ))}
          </div>
        )
      )}
    </main>
  );
}
