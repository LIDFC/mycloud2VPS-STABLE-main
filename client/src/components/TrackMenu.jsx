import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { usePlayer } from "../context/PlayerContext";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { api } from "../api";
import styles from "./TrackMenu.module.css";

export default function TrackMenu({ track, onLikeChange }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [likedByMe, setLikedByMe] = useState(track.likedByMe);
  const menuRef = useRef(null);
  const btnRef = useRef(null);
  const navigate = useNavigate();
  const { addToQueue, playNext } = usePlayer();
  const { user } = useAuth();
  const toast = useToast();

  // Calculate position synchronously right when opening
  const handleOpen = (e) => {
    e.stopPropagation();
    if (open) { setOpen(false); return; }

    // Compute position before render
    const btn = btnRef.current.getBoundingClientRect();
    const menuW = 210; // estimated min-width
    const menuH = 200;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let top = btn.bottom + 6;
    let left = btn.right - menuW;
    if (left < 8) left = 8;
    if (left + menuW > vw - 8) left = vw - menuW - 8;
    if (top + menuH > vh - 8) top = btn.top - menuH - 6;

    setPos({ top, left });
    setOpen(true);
  };

  // After menu renders, correct position with real dimensions
  useLayoutEffect(() => {
    if (!open || !menuRef.current) return;
    const btn = btnRef.current.getBoundingClientRect();
    const menu = menuRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let top = btn.bottom + 6;
    let left = btn.right - menu.width;
    if (left < 8) left = 8;
    if (left + menu.width > vw - 8) left = vw - menu.width - 8;
    if (top + menu.height > vh - 8) top = btn.top - menu.height - 6;

    setPos({ top, left });
  }, [open]);

  // Close on outside click — capture phase, check both refs
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (menuRef.current?.contains(e.target)) return;
      if (btnRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", handler, true);
    return () => document.removeEventListener("pointerdown", handler, true);
  }, [open]);

  // Close on scroll or resize
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  const close = () => setOpen(false);

  const handleLike = async (e) => {
    e.stopPropagation();
    if (!user) { toast("Sign in to like tracks", "error"); return; }
    try {
      const result = await api.likeTrack(track.id);
      setLikedByMe(result.likedByMe);
      onLikeChange?.(track.id, result);
      toast(result.likedByMe ? "Added to liked ♥" : "Removed from liked", result.likedByMe ? "success" : "info");
    } catch { toast("Failed to update like", "error"); }
    close();
  };

  const handleAddToQueue = (e) => {
    e.stopPropagation();
    addToQueue(track);
    toast(`"${track.title}" добавлен в очередь`, "success");
    close();
  };

  const handlePlayNext = (e) => {
    e.stopPropagation();
    playNext(track);
    toast(`"${track.title}" будет следующим`, "success");
    close();
  };

  const handleGoArtist = (e) => {
    e.stopPropagation();
    navigate(`/profile/${encodeURIComponent(track.artist)}`);
    close();
  };

  const handleGoAlbum = (e) => {
    e.stopPropagation();
    navigate(`/albums/${track.albumId}`);
    close();
  };

  const menu = open ? createPortal(
    <div
      ref={menuRef}
      className={styles.menu}
      style={{ top: pos.top, left: pos.left }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <button className={`${styles.item} ${likedByMe ? styles.itemActive : ""}`} onClick={handleLike}>
        <svg viewBox="0 0 24 24" fill={likedByMe ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" width="15" height="15">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
        </svg>
        {likedByMe ? "Убрать лайк" : "Лайк ❤️"}
      </button>

      <button className={styles.item} onClick={handlePlayNext}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
          <polygon points="5 3 19 12 5 21 5 3"/><line x1="19" y1="3" x2="19" y2="21"/>
        </svg>
        Играть следующим
      </button>

      <button className={styles.item} onClick={handleAddToQueue}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
          <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
          <line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/>
          <line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
        </svg>
        Добавить в очередь
      </button>

      <div className={styles.divider} />

      <button className={styles.item} onClick={handleGoArtist}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
        </svg>
        Перейти к артисту
      </button>

      {track.albumId && (
        <button className={styles.item} onClick={handleGoAlbum}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
            <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/>
          </svg>
          Перейти к альбому
        </button>
      )}
    </div>,
    document.body
  ) : null;

  return (
    <div className={styles.wrap}>
      <button
        ref={btnRef}
        className={`${styles.triggerBtn} ${open ? styles.triggerActive : ""}`}
        onClick={handleOpen}
        aria-label="Track options"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
          <circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/>
        </svg>
      </button>
      {menu}
    </div>
  );
}
