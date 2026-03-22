import { useState, useRef, useEffect } from "react";
import { useNotifications } from "../context/NotificationContext";
import styles from "./NotificationBell.module.css";

function timeAgo(iso) {
  const diff = (Date.now() - new Date(iso)) / 1000;
  if (diff < 60)     return "just now";
  if (diff < 3600)   return `${Math.floor(diff/60)}m ago`;
  if (diff < 86400)  return `${Math.floor(diff/3600)}h ago`;
  return `${Math.floor(diff/86400)}d ago`;
}

const TYPE_ICON = {
  approved:      "✓",
  rejected:      "✗",
  pending_track: "↑",
};

export default function NotificationBell() {
  const { notifications, unreadCount, markAllRead, remove } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleOpen = () => {
    setOpen((v) => !v);
    if (!open && unreadCount > 0) markAllRead();
  };

  return (
    <div className={styles.wrap} ref={ref}>
      <button
        className={styles.bell}
        onClick={handleOpen}
        aria-label={`Notifications${unreadCount ? ` (${unreadCount} unread)` : ""}`}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        {unreadCount > 0 && (
          <span className={styles.badge}>{unreadCount > 9 ? "9+" : unreadCount}</span>
        )}
      </button>

      {open && (
        <div className={styles.dropdown}>
          <div className={styles.header}>
            <span className={styles.headerTitle}>Notifications</span>
            {notifications.length > 0 && (
              <button className={styles.clearBtn} onClick={markAllRead}>Mark all read</button>
            )}
          </div>

          <div className={styles.list}>
            {notifications.length === 0 ? (
              <div className={styles.empty}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="32" height="32">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                  <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                </svg>
                <p>No notifications yet</p>
              </div>
            ) : (
              notifications.map((n) => (
                <div key={n.id} className={`${styles.item} ${!n.read ? styles.unread : ""}`}>
                  <div className={`${styles.icon} ${styles[`icon_${n.type}`] || ""}`}>
                    {TYPE_ICON[n.type] || "•"}
                  </div>
                  <div className={styles.body}>
                    <p className={styles.msg}>{n.message}</p>
                    <span className={styles.time}>{timeAgo(n.createdAt)}</span>
                  </div>
                  <button className={styles.dismiss} onClick={() => remove(n.id)} aria-label="Dismiss">×</button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
