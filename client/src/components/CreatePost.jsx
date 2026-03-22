import { useState, useRef } from "react";
import { api } from "../api";
import { useToast } from "../context/ToastContext";
import styles from "./CreatePost.module.css";

export default function CreatePost({ myTracks = [], onCreated }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [images, setImages] = useState([]); // {file, preview}[]
  const [pinnedTrackId, setPinnedTrackId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef(null);

  const addImages = (files) => {
    const remaining = 4 - images.length;
    const toAdd = Array.from(files).slice(0, remaining).map(f => ({
      file: f,
      preview: URL.createObjectURL(f),
    }));
    setImages(prev => [...prev, ...toAdd]);
  };

  const removeImage = (idx) => {
    setImages(prev => {
      URL.revokeObjectURL(prev[idx].preview);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!text.trim() && !images.length) {
      toast("Добавьте текст или фото", "error"); return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("text", text.trim());
      if (pinnedTrackId) fd.append("pinnedTrackId", pinnedTrackId);
      images.forEach(img => fd.append("postImage", img.file));

      const post = await api.createPost(fd);
      toast("Пост опубликован!", "success");
      setText(""); setImages([]); setPinnedTrackId(""); setOpen(false);
      onCreated?.(post);
    } catch (err) { toast(err.message || "Ошибка", "error"); }
    finally { setSubmitting(false); }
  };

  if (!open) {
    return (
      <button className={styles.openBtn} onClick={() => setOpen(true)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        Новый пост
      </button>
    );
  }

  return (
    <div className={styles.form}>
      <div className={styles.formHeader}>
        <span className={styles.formTitle}>Новый пост</span>
        <button className={styles.closeBtn} onClick={() => setOpen(false)}>✕</button>
      </div>

      <textarea
        className={styles.textarea}
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Что хочешь сказать своим фолловерам?.."
        maxLength={1000}
        rows={4}
        disabled={submitting}
      />
      <div className={styles.charCount}>{text.length}/1000</div>

      {/* Image previews */}
      {images.length > 0 && (
        <div className={styles.previews}>
          {images.map((img, i) => (
            <div key={i} className={styles.previewWrap}>
              <img src={img.preview} alt="" className={styles.preview} />
              <button className={styles.removeImg} onClick={() => removeImage(i)}>✕</button>
            </div>
          ))}
        </div>
      )}

      {/* Pin track select */}
      {myTracks.length > 0 && (
        <div className={styles.pinRow}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
            <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
          </svg>
          <select
            className={styles.trackSelect}
            value={pinnedTrackId}
            onChange={e => setPinnedTrackId(e.target.value)}
            disabled={submitting}
          >
            <option value="">— Прикрепить трек —</option>
            {myTracks.map(t => (
              <option key={t.id} value={t.id}>{t.title}</option>
            ))}
          </select>
        </div>
      )}

      {/* Bottom actions */}
      <div className={styles.bottomBar}>
        <button
          className={styles.imageBtn}
          type="button"
          disabled={images.length >= 4 || submitting}
          onClick={() => fileRef.current?.click()}
          title="Добавить фото (макс. 4)"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
            <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
            <path d="m21 15-5-5L5 21"/>
          </svg>
          Фото {images.length > 0 && `(${images.length}/4)`}
        </button>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={e => { addImages(e.target.files); e.target.value = ""; }}
        />

        <div className={styles.submitRow}>
          <button className={`btn btn-ghost btn-sm`} type="button"
            onClick={() => setOpen(false)} disabled={submitting}>
            Отмена
          </button>
          <button
            className={`btn btn-primary btn-sm ${styles.submitBtn}`}
            type="button"
            onClick={handleSubmit}
            disabled={submitting || (!text.trim() && !images.length)}
          >
            {submitting ? "Публикую..." : "Опубликовать"}
          </button>
        </div>
      </div>
    </div>
  );
}
