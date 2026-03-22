import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import styles from "./Auth.module.css";

export default function AuthPage({ mode }) {
  const isLogin = mode === "login";
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const toast    = useToast();

  const [username, setUsername]     = useState("");
  const [password, setPassword]     = useState("");
  const [accountType, setAccountType] = useState("listener");
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const user = isLogin
        ? await login(username, password)
        : await register(username, password, accountType);

      if (!isLogin && user.role === "admin") {
        toast("Welcome, Admin! You're the first user.", "success");
      } else {
        toast(`Welcome, ${user.username}!`, "success");
      }
      navigate("/");
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logo}>
          <span className={styles.logoIcon}>☁</span>
          <span className={styles.logoText}>MyCloud</span>
        </div>

        <h1 className={styles.title}>{isLogin ? "Sign in" : "Create account"}</h1>

        {!isLogin && (
          <p className={styles.hint}>
            First registered user becomes <strong>admin</strong>.
          </p>
        )}

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className="field">
            <label className="label">Username</label>
            <input className="input" type="text" value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="your_username" autoComplete="username" required minLength={3} />
          </div>

          <div className="field">
            <label className="label">Password</label>
            <input className="input" type="password" value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••" autoComplete={isLogin ? "current-password" : "new-password"}
              required minLength={4} />
          </div>

          {!isLogin && (
            <div className="field">
              <label className="label">Account type</label>
              <div className={styles.typeRow}>
                {[
                  { value: "listener", icon: "🎧", label: "Listener", desc: "Enjoy and discover music" },
                  { value: "artist",   icon: "🎤", label: "Artist",   desc: "Upload and share your music" },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={`${styles.typeCard} ${accountType === opt.value ? styles.typeCardOn : ""}`}
                    onClick={() => setAccountType(opt.value)}
                  >
                    <span className={styles.typeIcon}>{opt.icon}</span>
                    <span className={styles.typeLabel}>{opt.label}</span>
                    <span className={styles.typeDesc}>{opt.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && <p className={styles.error}>{error}</p>}

          <button className={`btn btn-primary ${styles.submitBtn}`} type="submit" disabled={loading}>
            {loading ? "…" : isLogin ? "Sign in" : "Sign up"}
          </button>
        </form>

        <p className={styles.switchText}>
          {isLogin ? "Don't have an account? " : "Already have an account? "}
          <Link to={isLogin ? "/register" : "/login"} className={styles.switchLink}>
            {isLogin ? "Sign up" : "Sign in"}
          </Link>
        </p>
      </div>
    </div>
  );
}
