import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { usePlayer } from "../context/PlayerContext";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { api } from "../api";
import Fireworks from "./Fireworks";
import styles from "./DropCard.module.css";

const PLACEHOLDER = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Crect width='200' height='200' fill='%231a1a1a'/%3E%3Ctext x='100' y='110' text-anchor='middle' font-size='40' font-family='sans-serif' fill='%23333'%3E%F0%9F%8E%B5%3C/text%3E%3C/svg%3E`;
const AVATAR_PH = (n) =>
  `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Crect width='32' height='32' fill='%23222' rx='16'/%3E%3Ctext x='16' y='21' text-anchor='middle' font-size='12' font-family='sans-serif' fill='%23666'%3E${encodeURIComponent((n || "?")[0].toUpperCase())}%3C/text%3E%3C/svg%3E`;

function useCountdown(msLeft) {
  const [remaining, setRemaining] = useState(msLeft);
  const [justReleased, setJustReleased] = useState(false);

  useEffect(() => {
    if (msLeft <= 0) { setRemaining(0); return; }
    setRemaining(msLeft);
    const id = setInterval(() => {
      setRemaining(prev => {
        if (prev <= 1000) {
          clearInterval(id);
          setJustReleased(true); // 🎆 trigger fireworks
          return 0;
        }
        return prev - 1000;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [msLeft]);

  const total = Math.max(0, remaining);
  const days  = Math.floor(total / 86400000);
  const hours = Math.floor((total % 86400000) / 3600000);
  const mins  = Math.floor((total % 3600000) / 60000);
  const secs  = Math.floor((total % 60000) / 1000);
  return { days, hours, mins, secs, done: total === 0, justReleased, clearJustReleased: () => setJustReleased(false) };
}

function CountdownUnit({ value, label }) {
  return (
    <div className={styles.unit}>
      <span className={styles.unitNum}>{String(value).padStart(2, "0")}</span>
      <span className={styles.unitLabel}>{label}</span>
    </div>
  );
}

export default function DropCard({ drop, onDelete, onUpdate, showArtist = true, myTracks = [] }) {
  const { user } = useAuth();
  const toast = useToast();
  const { loadTrack, currentTrack, isPlaying, togglePlay } = usePlayer();
  const countdown = useCountdown(drop.msLeft);

  const isOwn = user?.username === drop.artistUsername || user?.role === "admin";
  const hasTrack = !!drop.linkedTrack;
  const isThisPlaying = currentTrack?.id === drop.linkedTrack?.id && isPlaying;
  const [linking, setLinking] = useState(false);
  const [linkTrackId, setLinkTrackId] = useState("");
  const handleLinkTrack = async () => {
    if (!linkTrackId) return;
    try {
      const updated = await api.updateDrop(drop.id, { linkedTrackId: linkTrackId });
      onUpdate?.(updated);
      setLinking(false);
      toast("Трек привязан к дропу!", "success");
    } catch { toast("Ошибка при привязке", "error"); }
  };

  const handlePlay = () => {
    if (!hasTrack) return;
    if (isThisPlaying) { togglePlay(); return; }
    loadTrack(drop.linkedTrack);
  };

  const handleDelete = async () => {
    if (!window.confirm("Удалить дроп?")) return;
    try {
      await api.deleteDrop(drop.id);
      toast("Дроп удалён", "success");
      onDelete?.(drop.id);
    } catch { toast("Ошибка при удалении", "error"); }
  };

  return (
    <article className={`${styles.card} ${countdown.done ? styles.cardReleased : styles.cardUpcoming}`}>
      <Fireworks active={countdown.justReleased} onDone={countdown.clearJustReleased} />
      {/* Cover */}
      <div className={styles.coverWrap}>
        <img
          src={drop.coverUrl || PLACEHOLDER}
          alt={drop.title}
          className={styles.cover}
          onError={e => { e.currentTarget.src = PLACEHOLDER; }}
        />
        {countdown.done && hasTrack && (
          <button className={styles.playOverlay} onClick={handlePlay}>
            {isThisPlaying
              ? <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28"><rect x="5" y="3" width="4" height="18" rx="2"/><rect x="15" y="3" width="4" height="18" rx="2"/></svg>
              : <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28"><path d="M8 5.14v14l11-7-11-7z"/></svg>}
          </button>
        )}
        <div className={`${styles.badge} ${countdown.done ? styles.badgeLive : styles.badgeSoon}`}>
          {countdown.done ? "Вышло" : "Скоро"}
        </div>
      </div>

      {/* Body */}
      <div className={styles.body}>
        {showArtist && (
          <Link to={`/profile/${encodeURIComponent(drop.artistUsername)}`} className={styles.artistRow}>
            <img
              src={drop.artistAvatarUrl || AVATAR_PH(drop.artistUsername)}
              alt={drop.artistUsername}
              className={styles.artistAvatar}
              onError={e => { e.currentTarget.src = AVATAR_PH(drop.artistUsername); }}
            />
            <span className={styles.artistName}>{drop.artistUsername}</span>
          </Link>
        )}

        <h3 className={styles.title}>{drop.title}</h3>
        {drop.description && <p className={styles.desc}>{drop.description}</p>}

        {/* Countdown or released info */}
        {!countdown.done ? (
          <div className={styles.countdown}>
            <CountdownUnit value={countdown.days}  label="дней" />
            <span className={styles.colon}>:</span>
            <CountdownUnit value={countdown.hours} label="часов" />
            <span className={styles.colon}>:</span>
            <CountdownUnit value={countdown.mins}  label="минут" />
            <span className={styles.colon}>:</span>
            <CountdownUnit value={countdown.secs}  label="секунд" />
          </div>
        ) : (
          <div className={styles.releasedRow}>
            {hasTrack ? (
              <button className={styles.listenBtn} onClick={handlePlay}>
                {isThisPlaying
                  ? <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><rect x="5" y="3" width="4" height="18" rx="2"/><rect x="15" y="3" width="4" height="18" rx="2"/></svg>
                  : <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M8 5.14v14l11-7-11-7z"/></svg>}
                {isThisPlaying ? "Пауза" : "Слушать"}
              </button>
            ) : (
              <span className={styles.releasedLabel}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13">
                  <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                </svg>
                {new Date(drop.releaseAt).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}
              </span>
            )}
          </div>
        )}

        {/* Release date label for upcoming */}
        {!countdown.done && (
          <p className={styles.releaseDate}>
            Релиз: {new Date(drop.releaseAt).toLocaleDateString("ru-RU", {
              day: "numeric", month: "long", year: "numeric"
            })}
          </p>
        )}

        {/* Owner actions */}
        {isOwn && (
          <div className={styles.ownerActions}>
            {countdown.done && !hasTrack && (
              linking ? (
                <div className={styles.linkForm}>
                  <select
                    className={styles.linkSelect}
                    value={linkTrackId}
                    onChange={e => setLinkTrackId(e.target.value)}
                  >
                    <option value="">— Выбери трек —</option>
                    {myTracks.map(t => (
                      <option key={t.id} value={t.id}>{t.title}</option>
                    ))}
                  </select>
                  <button className={styles.linkConfirmBtn} onClick={handleLinkTrack}
                    disabled={!linkTrackId}>Привязать</button>
                  <button className={styles.linkCancelBtn} onClick={() => setLinking(false)}>✕</button>
                </div>
              ) : (
                <button className={styles.linkBtn} onClick={() => setLinking(true)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13">
                    <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
                  </svg>
                  Привязать трек к дропу
                </button>
              )
            )}
            <button className={styles.deleteBtn} onClick={handleDelete}>Удалить дроп</button>
          </div>
        )}
      </div>
    </article>
  );
}
