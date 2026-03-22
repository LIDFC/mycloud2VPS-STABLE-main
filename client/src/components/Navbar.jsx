import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import NotificationBell from "./NotificationBell";
import styles from "./Navbar.module.css";

function NavIcon({ type }) {
  const common = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.9", width: "18", height: "18" };
  switch (type) {
    case "home":
      return <svg {...common}><path d="M3 11.5 12 4l9 7.5" /><path d="M5 10.5V20h14v-9.5" /></svg>;
    case "albums":
      return <svg {...common}><rect x="4" y="5" width="14" height="14" rx="2" /><path d="M8 9h6" /><path d="M8 13h3" /><path d="M18 8h2a1 1 0 0 1 1 1v9a2 2 0 0 1-2 2H9a1 1 0 0 1-1-1v-1" /></svg>;
    case "liked":
      return <svg {...common}><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>;
    case "radio":
      return <svg {...common} className={styles.radioSvg}><path d="M3 8a9 9 0 0 1 18 0"/><path d="M6.5 11.5a5.5 5.5 0 0 1 11 0"/><path d="M10 15a2 2 0 0 1 4 0"/><line x1="12" y1="17" x2="12" y2="21"/></svg>;
    case "playlists":
      return <svg {...common}><path d="M4 6h10" /><path d="M4 12h10" /><path d="M4 18h6" /><path d="M18 14v6" /><path d="M15 17h6" /></svg>;
    default:
      return null;
  }
}

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");

  const currentQuery = location.pathname === "/search"
    ? new URLSearchParams(location.search).get("q") || ""
    : "";

  useEffect(() => {
    setSearchValue(currentQuery);
  }, [currentQuery]);

  useEffect(() => {
    if (!user || searchValue === currentQuery) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      const trimmed = searchValue.trim();
      if (!trimmed) {
        if (location.pathname === "/search") {
          navigate("/", { replace: true });
        }
        return;
      }

      const nextUrl = `/search?q=${encodeURIComponent(trimmed)}`;
      navigate(nextUrl, { replace: true });
    }, 260);

    return () => {
      window.clearTimeout(timer);
    };
  }, [currentQuery, location.pathname, navigate, searchValue, user]);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname, location.search]);

  const handleLogout = () => {
    logout();
    navigate("/login");
    setMenuOpen(false);
  };



  const isArtist = ["artist", "artist_pro"].includes(user?.accountType);
  const isActive = (path) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname === path || location.pathname.startsWith(`${path}/`);
  };

  const navItems = useMemo(() => {
    const items = [{ to: "/", label: "Home", icon: "home" }];
    if (user) {
      items.push(
        { to: "/albums", label: "Albums", icon: "albums" },
        { to: "/liked", label: "Liked", icon: "liked" },
        { to: "/playlists", label: "Playlists", icon: "playlists" },
        { to: "/radio", label: "Radio", icon: "radio" },
      );
      if (user.role === "admin") items.push({ to: "/admin", label: "Admin", icon: null, admin: true });
    }
    items.push({ to: "/about", label: "О нас", icon: null });
    return items;
  }, [user]);

  const mobileItems = navItems.filter((item) => item.icon);

  return (
    <>
      <header className={styles.navbar}>
        <Link to="/" className={styles.logo}>
          <span className={styles.logoIcon}>☁</span>
          <span className={styles.logoText}>MyCloud</span>
        </Link>

        <nav className={styles.navLinks}>
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={`${styles.navLink} ${isActive(item.to) ? styles.active : ""} ${item.admin ? styles.adminLink : ""} ${item.to === "/radio" ? styles.radioLink : ""}`}
            >
              {item.icon && <NavIcon type={item.icon} />}
              {item.label}
            </Link>
          ))}
        </nav>

        {user && (
          <div className={styles.searchWrapper}>
            <span className={styles.searchIcon}>⌕</span>
            <input
              className={styles.searchInput}
              type="text"
              placeholder="Search tracks, artists, albums…"
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
            />
          </div>
        )}

        <div className={styles.right}>
          {user ? (
            <div className={styles.rightGroup}>
              <NotificationBell />
              <div className={styles.userMenu}>
                <button
                  type="button"
                  className={`${styles.avatar} ${user.accountType === "artist_pro" ? styles.avatarPro : ""}`}
                  onClick={() => setMenuOpen((value) => !value)}
                >
                  {user.avatarUrl ? (
                    <img src={user.avatarUrl} alt={user.username} className={styles.avatarImg} />
                  ) : (
                    user.username.slice(0, 2).toUpperCase()
                  )}
                </button>
                {menuOpen && (
                  <div className={styles.dropdown}>
                    <div className={styles.dropdownUser}>
                      <span className={styles.dropdownName}>
                        {user.username}
                        {user.accountType === "artist_pro" && <span className={styles.dropdownProBadge}>⭐ Pro</span>}
                      </span>
                      <span className={styles.dropdownRole}>
                        {user.role === "admin" ? "Admin" : user.accountType === "artist_pro" ? "Artist Pro" : user.accountType === "artist" ? "Artist" : "Listener"}
                      </span>
                    </div>
                    <Link to={`/profile/${user.username}`} className={styles.dropdownItem}>My Profile</Link>
                    {isArtist && <Link to="/albums/create" className={styles.dropdownItem}>Create Album</Link>}
                    <Link to="/playlists" className={styles.dropdownItem}>My Playlists</Link>
                    <Link to="/about" className={styles.dropdownItem}>О нас</Link>
                    <button type="button" className={styles.dropdownItem} onClick={handleLogout}>Sign out</button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className={styles.authLinks}>
              <Link to="/login" className="btn btn-ghost btn-sm">Log in</Link>
              <Link to="/register" className="btn btn-primary btn-sm">Sign up</Link>
            </div>
          )}
        </div>
      </header>

      {user && (
        <nav className={styles.mobileNav} aria-label="Mobile navigation">
          {mobileItems.map((item) => (
            <Link key={item.to} to={item.to} className={`${styles.mobileLink} ${isActive(item.to) ? styles.mobileActive : ""}`}>
              <NavIcon type={item.icon} />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
      )}
    </>
  );
}
