import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { api } from "../api";
import { useAuth } from "./AuthContext";

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const fetch = useCallback(async () => {
    if (!user) { setNotifications([]); return; }
    setLoading(true);
    try {
      const data = await api.getNotifications();
      setNotifications(data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [user]);

  // Poll every 30s when logged in
  useEffect(() => {
    fetch();
    if (!user) return;
    const id = setInterval(fetch, 30_000);
    return () => clearInterval(id);
  }, [fetch, user]);

  const markAllRead = async () => {
    await api.markAllRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const remove = async (id) => {
    await api.deleteNotification(id);
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, loading, fetch, markAllRead, remove }}>
      {children}
    </NotificationContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useNotifications() { return useContext(NotificationContext); }
