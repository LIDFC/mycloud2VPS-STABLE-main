import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { PlayerProvider } from "./context/PlayerContext";
import { ToastProvider } from "./context/ToastContext";
import { NotificationProvider } from "./context/NotificationContext";
import { api } from "./api";
import Navbar from "./components/Navbar";
import Player from "./components/Player";
import Home from "./pages/Home";
import SearchPage from "./pages/SearchPage";
import About from "./pages/About";
import Liked from "./pages/Liked";
import Playlists from "./pages/Playlists";
import Radio from "./pages/Radio";
import Albums from "./pages/Albums";
import AlbumPage from "./pages/AlbumPage";
import CreateAlbum from "./pages/CreateAlbum";
import Admin from "./pages/Admin";
import AuthPage from "./pages/Auth";
import ProfilePage from "./pages/ProfilePage";

function AppInner() {
  const { user, loading } = useAuth();
  const [tracks, setTracks] = useState([]);

  useEffect(() => {
    api.getTracks().then(setTracks).catch(() => {});
  }, [user]);

  if (loading) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh" }}>
      <div style={{ width:36, height:36, border:"3px solid #222", borderTopColor:"#ff5500", borderRadius:"50%", animation:"spin 0.8s linear infinite" }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  const isArtist = ["artist", "artist_pro"].includes(user?.accountType) || user?.role === "admin";

  return (
    <PlayerProvider tracks={tracks}>
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/about" element={<About />} />
        <Route path="/liked" element={<Liked />} />
        <Route path="/playlists" element={<Playlists />} />
        <Route path="/radio" element={<Radio />} />

        <Route path="/albums" element={<Albums />} />
        <Route path="/albums/create" element={isArtist ? <CreateAlbum /> : <Navigate to="/albums" />} />
        <Route path="/albums/:id" element={<AlbumPage />} />

        <Route path="/profile/:username" element={<ProfilePage />} />
        <Route path="/artist/:username" element={<ProfilePage />} />

        <Route path="/admin" element={user?.role === "admin" ? <Admin /> : <Navigate to="/" />} />

        <Route path="/login" element={!user ? <AuthPage mode="login" /> : <Navigate to="/" />} />
        <Route path="/register" element={!user ? <AuthPage mode="register" /> : <Navigate to="/" />} />

        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
      <Player />
    </PlayerProvider>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <NotificationProvider>
            <AppInner />
          </NotificationProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
