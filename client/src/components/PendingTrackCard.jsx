import { useState, useRef } from "react";
import { api } from "../api";
import { useToast } from "../context/ToastContext";
import { usePlayer } from "../context/PlayerContext";
import styles from "./PendingTrackCard.module.css";

const PLACEHOLDER = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect width='80' height='80' fill='%231a1a1a'/%3E%3Ccircle cx='40' cy='40' r='20' fill='%23242424'/%3E%3C/svg%3E`;

export default function PendingTrackCard({ track, onAction }) {
  const toast = useToast();
  const { loadTrack, currentTrack, isPlaying, togglePlay } = usePlayer();
  const [loading, setLoading] = useState(null); // "approve" | "reject" | null
  const [showReject, setShowReject] = useState(false);
  const [reason, setReason] = useState("");

  const isActive = currentTrack?.id === track.id;

  const handlePreview = () => {
    if (isActive) togglePlay();
    else loadTrack(track);
  };

  const handleApprove = async () => {
    setLoading("approve");
    try {
      await api.adminApproveTrack(track.id);
      toast(`"${track.title}" approved ✓`, "success");
      onAction(track.id, "approved");
    } catch (err) { toast(err.message, "error"); }
    finally { setLoading(null); }
  };

  const handleReject = async () => {
    setLoading("reject");
    try {
      await api.adminRejectTrack(track.id, reason);
      toast(`"${track.title}" rejected`, "success");
      onAction(track.id, "rejected");
    } catch (err) { toast(err.message, "error"); }
    finally { setLoading(null); setShowReject(false); }
  };

  return (
    <div className={styles.card}>
      {/* Cover + preview */}
      <div className={styles.coverWrap} onClick={handlePreview}>
        <img src={track.coverUrl || PLACEHOLDER} alt="cover" className={styles.cover}
          onError={(e) => { e.currentTarget.src = PLACEHOLDER; }} />
        <div className={styles.coverOverlay}>
          {isActive && isPlaying
            ? <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><rect x="5" y="3" width="4" height="18" rx="2"/><rect x="15" y="3" width="4" height="18" rx="2"/></svg>
            : <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M8 5.14v14l11-7-11-7z"/></svg>
          }
        </div>
      </div>

      {/* Meta */}
      <div className={styles.meta}>
        <p className={styles.title}>{track.title}</p>
        <p className={styles.artist}>{track.artist}</p>
        {track.genre && <span className={styles.genre}>{track.genre}</span>}
        {track.description && <p className={styles.desc}>{track.description}</p>}
        <span className={styles.date}>{new Date(track.createdAt).toLocaleDateString()}</span>
      </div>

      {/* Actions */}
      <div className={styles.actions}>
        <button
          className={`btn btn-primary btn-sm ${styles.approveBtn}`}
          onClick={handleApprove}
          disabled={!!loading}
        >
          {loading === "approve" ? "…" : "✓ Approve"}
        </button>

        {!showReject ? (
          <button className="btn btn-danger btn-sm" onClick={() => setShowReject(true)} disabled={!!loading}>
            ✗ Reject
          </button>
        ) : (
          <div className={styles.rejectForm}>
            <input
              className="input"
              placeholder="Reason (optional)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <div className={styles.rejectBtns}>
              <button className="btn btn-danger btn-sm" onClick={handleReject} disabled={loading === "reject"}>
                {loading === "reject" ? "…" : "Confirm"}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => { setShowReject(false); setReason(""); }}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
