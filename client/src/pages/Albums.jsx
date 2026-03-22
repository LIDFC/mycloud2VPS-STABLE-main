import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import AlbumCard from "../components/AlbumCard";
import styles from "./Home.module.css";
import albumStyles from "./Albums.module.css";

export default function Albums() {
  const { user } = useAuth();
  const [albums, setAlbums] = useState([]);
  const [loading, setLoading] = useState(true);

  const isArtist = ["artist", "artist_pro"].includes(user?.accountType) || user?.role === "admin";
  const ownHiddenAlbums = albums.filter((album) => album.artistId === user?.id && album.status !== "published");

  useEffect(() => {
    api.getAlbums().then(setAlbums).finally(() => setLoading(false));
  }, []);

  const handleLikeChange = (id, res) => {
    setAlbums((prev) =>
      prev.map((a) => a.id === id ? { ...a, likedByMe: res.likedByMe, likesCount: res.likesCount } : a)
    );
  };

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <h1 className={styles.heroTitle}>Albums</h1>
        <p className={styles.heroSub}>{albums.length} albums</p>
        {isArtist && (
          <div className={albumStyles.heroActions}>
            <Link to="/albums/create" className="btn btn-primary btn-sm">Create Album</Link>
            {ownHiddenAlbums.length > 0 && (
              <span className={albumStyles.notice}>
                You also have {ownHiddenAlbums.length} unpublished album{ownHiddenAlbums.length > 1 ? "s" : ""} visible only to you here.
              </span>
            )}
          </div>
        )}
      </section>

      {loading ? (
        <div className={styles.empty}><div className={styles.spinner} /></div>
      ) : albums.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyText}>No albums yet.</p>
          {isArtist && <Link to="/albums/create" className="btn btn-primary btn-sm">Create first album</Link>}
        </div>
      ) : (
        <div className={albumStyles.grid}>
          {albums.map((album) => (
            <AlbumCard key={album.id} album={album} onLikeChange={handleLikeChange} />
          ))}
        </div>
      )}
    </main>
  );
}
