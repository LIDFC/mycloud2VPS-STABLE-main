import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import styles from "./CreateAlbum.module.css";

const GENRE_PRESETS = [
  "Pop","Rock","Hip-Hop","R&B","Electronic","Jazz","Classical",
  "Country","Reggae","Metal","Folk","Indie","Ambient","Lo-Fi","Funk",
];

export default function CreateAlbum() {
  const { user }  = useAuth();
  const toast     = useToast();
  const navigate  = useNavigate();
  const coverRef  = useRef();

  const [title,       setTitle]       = useState("");
  const [description, setDescription] = useState("");
  const [genre,       setGenre]       = useState("");
  const [coverFile,   setCoverFile]   = useState(null);
  const [coverPreview,setCoverPreview]= useState(null);
  const [loading,     setLoading]     = useState(false);

  const isArtist = ["artist", "artist_pro"].includes(user?.accountType) || user?.role === "admin";

  if (!isArtist) {
    return (
      <main className={styles.page}>
        <div className={styles.notAllowed}>
          <p>Only artists can create albums.</p>
        </div>
      </main>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) { toast("Title is required", "error"); return; }

    const fd = new FormData();
    fd.append("title", title.trim());
    fd.append("description", description.trim());
    fd.append("genre", genre);
    if (coverFile) fd.append("cover", coverFile);

    setLoading(true);
    try {
      const res = await api.createAlbum(fd);
      toast(
        user.role === "admin"
          ? `Album "${title}" created!`
          : `Album "${title}" submitted for review!`,
        "success"
      );
      navigate(`/albums/${res.album.id}`);
    } catch (err) { toast(err.message, "error"); }
    finally { setLoading(false); }
  };

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Create Album</h1>
        {user.role !== "admin" && (
          <p className={styles.hint}>
            Your album will be reviewed by an admin before publishing.
          </p>
        )}

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.topRow}>
            {/* Cover picker */}
            <div className={styles.coverPicker} onClick={() => coverRef.current.click()}>
              {coverPreview
                ? <img src={coverPreview} alt="" className={styles.coverPreview} />
                : <div className={styles.coverPlaceholder}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="36" height="36">
                      <rect x="3" y="3" width="18" height="18" rx="2"/>
                      <circle cx="8.5" cy="8.5" r="1.5"/>
                      <path d="m21 15-5-5L5 21"/>
                    </svg>
                    <span>Add cover</span>
                  </div>
              }
              <input ref={coverRef} type="file" accept="image/*" hidden onChange={(e) => {
                const f = e.target.files[0];
                if (f) { setCoverFile(f); setCoverPreview(URL.createObjectURL(f)); }
              }} />
            </div>

            {/* Fields */}
            <div className={styles.fields}>
              <div className="field">
                <label className="label">Album title *</label>
                <input
                  className="input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="My Album"
                  required
                />
              </div>

              <div className="field">
                <label className="label">Genre</label>
                <select
                  className="input"
                  value={genre}
                  onChange={(e) => setGenre(e.target.value)}
                  style={{ colorScheme: "dark" }}
                >
                  <option value="">— No genre —</option>
                  {GENRE_PRESETS.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>

              <div className="field">
                <label className="label">Description</label>
                <textarea
                  className="input"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What's this album about?"
                  rows={3}
                  style={{ resize: "vertical" }}
                />
              </div>
            </div>
          </div>

          <div className={styles.actions}>
            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? "Creating…" : user.role === "admin" ? "Create Album" : "Submit for Review"}
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => navigate(-1)}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
