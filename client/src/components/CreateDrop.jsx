import { useState, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";
import { useToast } from "../context/ToastContext";
import styles from "./CreateDrop.module.css";

const GENRE_PRESETS = [
  "Rap","Pop","Rock","Hip-Hop","R&B","Electronic","Jazz",
  "Country","Metal","Folk","Indie","Ambient","Lo-Fi","Funk",
];

export default function CreateDrop({ myTracks = [], onCreated }) {
  const toast = useToast();
  const { user } = useAuth();
  const coverRef = useRef(null);
  const audioRef = useRef(null);

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [releaseAt, setReleaseAt] = useState("");
  const [coverFile, setCoverFile] = useState(null);
  const [coverPreview, setCoverPreview] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitStep, setSubmitStep] = useState(""); // progress label

  // Track linking: "existing" | "upload" | "none"
  const [trackMode, setTrackMode] = useState("none");
  const [linkedTrackId, setLinkedTrackId] = useState("");

  // Upload new track fields
  const [audioFile, setAudioFile] = useState(null);
  const [trackTitle, setTrackTitle] = useState("");
  const [trackGenre, setTrackGenre] = useState("");
  const [trackFeaturing, setTrackFeaturing] = useState("");

  const tomorrow = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(12, 0, 0, 0);
    return d.toISOString().slice(0, 16);
  };

  const handleOpen = () => {
    setReleaseAt(tomorrow());
    setOpen(true);
  };

  const resetForm = () => {
    setTitle(""); setDescription(""); setReleaseAt("");
    setCoverFile(null); setCoverPreview(null);
    setTrackMode("none"); setLinkedTrackId("");
    setAudioFile(null); setTrackTitle(""); setTrackGenre(""); setTrackFeaturing("");
    setSubmitStep("");
    setOpen(false);
  };

  const handleAudioChange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setAudioFile(f);
    // Auto-fill track title from filename if drop title is set
    if (!trackTitle && title) setTrackTitle(title);
    else if (!trackTitle) {
      const name = f.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");
      setTrackTitle(name.charAt(0).toUpperCase() + name.slice(1));
    }
  };

  const handleSubmit = async () => {
    if (!title.trim()) { toast("Введи название релиза", "error"); return; }
    if (!releaseAt) { toast("Выбери дату релиза", "error"); return; }
    if (trackMode === "upload" && !audioFile) { toast("Выбери mp3 файл", "error"); return; }
    if (trackMode === "upload" && !trackTitle.trim()) { toast("Введи название трека", "error"); return; }

    setSubmitting(true);
    try {
      let finalTrackId = trackMode === "existing" ? linkedTrackId : null;

      // Step 1: upload track if needed
      if (trackMode === "upload") {
        setSubmitStep("Загружаю трек...");

        // First create the drop to get its ID, then upload track with dropId
        // Actually: create drop first, get ID, then upload track referencing dropId
        // We do it in reverse: upload track with a temp marker, then create drop
        // Simpler: upload track first with releaseAt, then create drop linking it

        const trackFd = new FormData();
        trackFd.append("title", trackTitle.trim());
        trackFd.append("artist", user?.username || "");
        trackFd.append("genre", trackGenre);
        trackFd.append("description", description.trim());
        trackFd.append("featuring", trackFeaturing);
        trackFd.append("audio", audioFile);
        trackFd.append("releaseAt", new Date(releaseAt).toISOString());
        trackFd.append("dropId", "__pending__"); // will be updated after drop creation
        if (coverFile) trackFd.append("cover", coverFile);

        const uploaded = await api.uploadTrack(trackFd);
        finalTrackId = uploaded.track?.id || null;
      }

      // Step 2: create drop
      setSubmitStep("Создаю дроп...");
      const dropFd = new FormData();
      dropFd.append("title", title.trim());
      dropFd.append("description", description.trim());
      dropFd.append("releaseAt", new Date(releaseAt).toISOString());
      if (finalTrackId) dropFd.append("linkedTrackId", finalTrackId);
      // If we uploaded a cover and didn't use it for track, attach to drop too
      if (coverFile && trackMode !== "upload") dropFd.append("cover", coverFile);
      if (coverFile && trackMode === "upload") {
        // Cover was already uploaded with track; drop will show track cover once linked
        // But still pass for drop card display
        dropFd.append("cover", coverFile);
      }

      const drop = await api.createDrop(dropFd);
      toast("Дроп создан! Фолловеры получат уведомление 🎵", "success");
      resetForm();
      onCreated?.(drop);
    } catch (err) {
      toast(err.message || "Ошибка", "error");
    } finally {
      setSubmitting(false);
      setSubmitStep("");
    }
  };

  if (!open) {
    return (
      <button className={styles.openBtn} onClick={handleOpen}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
          <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
        </svg>
        Анонс релиза (Drop)
      </button>
    );
  }

  return (
    <div className={styles.form}>
      <div className={styles.formHeader}>
        <span className={styles.formTitle}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
          Новый Drop
        </span>
        <button className={styles.closeBtn} onClick={resetForm} disabled={submitting}>✕</button>
      </div>

      <div className={styles.hint}>
        Анонс появится на главной странице с обратным отсчётом. Фолловеры получат уведомление.
      </div>

      {/* Main info */}
      <div className={styles.grid}>
        <div className={styles.coverPicker} onClick={() => coverRef.current?.click()}>
          {coverPreview
            ? <img src={coverPreview} alt="" className={styles.coverImg} />
            : <div className={styles.coverPh}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="28" height="28">
                  <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>
                </svg>
                <span>Обложка</span>
              </div>}
          <input ref={coverRef} type="file" accept="image/*" hidden disabled={submitting} onChange={e => {
            const f = e.target.files[0];
            if (f) { setCoverFile(f); setCoverPreview(URL.createObjectURL(f)); }
          }} />
        </div>

        <div className={styles.fields}>
          <div className="field">
            <label className="label">Название релиза *</label>
            <input className="input" value={title} onChange={e => setTitle(e.target.value)}
              placeholder="Название трека / альбома" maxLength={100} disabled={submitting} />
          </div>
          <div className="field">
            <label className="label">Описание</label>
            <textarea className="input" value={description} onChange={e => setDescription(e.target.value)}
              placeholder="Расскажи о релизе..." rows={2} maxLength={500}
              style={{ resize: "vertical" }} disabled={submitting} />
          </div>
          <div className="field">
            <label className="label">Дата и время релиза *</label>
            <input className="input" type="datetime-local" value={releaseAt}
              onChange={e => setReleaseAt(e.target.value)}
              min={new Date().toISOString().slice(0, 16)}
              style={{ colorScheme: "dark" }} disabled={submitting} />
          </div>
        </div>
      </div>

      {/* Track section */}
      <div className={styles.trackSection}>
        <div className={styles.trackSectionTitle}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
            <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
          </svg>
          Трек
        </div>

        {/* Mode selector */}
        <div className={styles.modeRow}>
          <button
            className={`${styles.modeBtn} ${trackMode === "none" ? styles.modeBtnActive : ""}`}
            onClick={() => setTrackMode("none")}
            disabled={submitting}
          >
            Без трека
          </button>
          {myTracks.length > 0 && (
            <button
              className={`${styles.modeBtn} ${trackMode === "existing" ? styles.modeBtnActive : ""}`}
              onClick={() => setTrackMode("existing")}
              disabled={submitting}
            >
              Уже загружен
            </button>
          )}
          <button
            className={`${styles.modeBtn} ${trackMode === "upload" ? styles.modeBtnActive : ""}`}
            onClick={() => setTrackMode("upload")}
            disabled={submitting}
          >
            Загрузить mp3
          </button>
        </div>

        {/* Existing track picker */}
        {trackMode === "existing" && (
          <select className="input" value={linkedTrackId}
            onChange={e => setLinkedTrackId(e.target.value)}
            style={{ colorScheme: "dark", marginTop: 8 }} disabled={submitting}>
            <option value="">— Выбери трек —</option>
            {myTracks.map(t => (
              <option key={t.id} value={t.id}>{t.title}</option>
            ))}
          </select>
        )}

        {/* Upload new track */}
        {trackMode === "upload" && (
          <div className={styles.uploadBlock}>
            <div className={styles.uploadHint}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              Трек уйдёт на модерацию. После одобрения он появится на твоём профиле и автоматически прикрепится к дропу.
            </div>

            {/* Audio file picker */}
            <div className={styles.audioPicker} onClick={() => audioRef.current?.click()}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              <span>{audioFile ? audioFile.name : "Выбрать mp3 файл"}</span>
              <input ref={audioRef} type="file" accept="audio/*" hidden disabled={submitting}
                onChange={handleAudioChange} />
            </div>

            <div className={styles.uploadFields}>
              <div className="field">
                <label className="label">Название трека *</label>
                <input className="input" value={trackTitle}
                  onChange={e => setTrackTitle(e.target.value)}
                  placeholder="Название трека" maxLength={100} disabled={submitting} />
              </div>
              <div className={styles.twoCol}>
                <div className="field">
                  <label className="label">Жанр</label>
                  <select className="input" value={trackGenre}
                    onChange={e => setTrackGenre(e.target.value)}
                    style={{ colorScheme: "dark" }} disabled={submitting}>
                    <option value="">— Жанр —</option>
                    {GENRE_PRESETS.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label className="label">Featuring</label>
                  <input className="input" value={trackFeaturing}
                    onChange={e => setTrackFeaturing(e.target.value)}
                    placeholder="@artist, Guest" disabled={submitting} />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className={styles.actions}>
        <button className="btn btn-primary" type="button" onClick={handleSubmit}
          disabled={submitting || !title.trim() || !releaseAt}>
          {submitting ? (submitStep || "Создаю...") : "Создать дроп"}
        </button>
        <button className="btn btn-ghost" type="button"
          onClick={resetForm} disabled={submitting}>
          Отмена
        </button>
      </div>
    </div>
  );
}
