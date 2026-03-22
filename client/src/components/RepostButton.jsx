import { useState } from "react";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import styles from "./RepostButton.module.css";

export default function RepostButton({ track, onUpdate }) {
  const { user } = useAuth();
  const toast = useToast();
  const [repostedByMe, setRepostedByMe] = useState(track.repostedByMe);
  const [repostCount, setRepostCount] = useState(track.repostCount || 0);
  const [loading, setLoading] = useState(false);

  const handleRepost = async (e) => {
    e.stopPropagation();
    if (!user) { toast("Sign in to repost", "error"); return; }
    if (loading) return;
    setLoading(true);
    try {
      const res = await api.repostTrack(track.id);
      setRepostedByMe(res.repostedByMe);
      setRepostCount(res.repostCount);
      onUpdate?.({ repostedByMe: res.repostedByMe, repostCount: res.repostCount });
      toast(res.repostedByMe ? "Reposted to your profile" : "Repost removed", "success");
    } catch {
      toast("Failed to repost", "error");
    } finally { setLoading(false); }
  };

  return (
    <button
      className={`${styles.btn} ${repostedByMe ? styles.active : ""}`}
      onClick={handleRepost}
      title={repostedByMe ? "Remove repost" : "Repost to your profile"}
      aria-label="Repost"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13">
        <polyline points="17 1 21 5 17 9"/>
        <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
        <polyline points="7 23 3 19 7 15"/>
        <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
      </svg>
      {repostCount > 0 && <span>{repostCount}</span>}
    </button>
  );
}
