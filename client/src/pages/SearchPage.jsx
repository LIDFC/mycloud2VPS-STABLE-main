import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api";
import TrackCard from "../components/TrackCard";
import ArtistCard from "../components/ArtistCard";
import AlbumCard from "../components/AlbumCard";
import styles from "./Home.module.css";
import searchStyles from "./HomeSearch.module.css";
import albumStyles from "./Albums.module.css";

export default function SearchPage() {
  const [params] = useSearchParams();
  const query = (params.get("q") || "").trim();
  const [results, setResults] = useState({ tracks: [], artists: [], albums: [] });
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("all");
  const debounceRef = useRef(null);

  useEffect(() => {
    if (!query) {
      setResults({ tracks: [], artists: [], albums: [] });
      setLoading(false);
      return;
    }

    clearTimeout(debounceRef.current);
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await api.searchAll(query);
        setResults({
          tracks: data.tracks || [],
          artists: data.artists || [],
          albums: data.albums || [],
        });
      } catch {
        setResults({ tracks: [], artists: [], albums: [] });
      } finally {
        setLoading(false);
      }
    }, 280);

    return () => clearTimeout(debounceRef.current);
  }, [query]);

  useEffect(() => {
    setTab("all");
  }, [query]);

  const total = results.tracks.length + results.artists.length + results.albums.length;
  const showTracks = tab === "all" || tab === "tracks";
  const showArtists = tab === "all" || tab === "artists";
  const showAlbums = tab === "all" || tab === "albums";

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <h1 className={styles.heroTitle}>
          {query ? (loading ? "Searching…" : `Results for \"${query}\"`) : "Search"}
        </h1>
        <p className={styles.heroSub}>
          {!query
            ? "Find tracks, artists and albums from anywhere on the site"
            : loading
              ? "Looking through tracks, artists and albums…"
              : total === 0
                ? "Nothing found"
                : `${results.tracks.length} tracks · ${results.artists.length} artists · ${results.albums.length} albums`}
        </p>
      </section>

      {!!query && total > 0 && (
        <div className={searchStyles.tabs}>
          {[
            { id: "all", label: `All (${total})` },
            { id: "tracks", label: `Tracks (${results.tracks.length})` },
            { id: "artists", label: `Artists (${results.artists.length})` },
            { id: "albums", label: `Albums (${results.albums.length})` },
          ].map((item) => (
            <button
              key={item.id}
              className={`${searchStyles.tab} ${tab === item.id ? searchStyles.tabActive : ""}`}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}

      {loading && <div className={styles.empty}><div className={styles.spinner} /></div>}

      {!loading && !query && (
        <div className={styles.empty}>
          <p className={styles.emptyText}>Start typing in the top search bar.</p>
        </div>
      )}

      {!loading && query && total === 0 && (
        <div className={styles.empty}>
          <p className={styles.emptyText}>No tracks, artists or albums match your search.</p>
        </div>
      )}

      {!loading && showArtists && results.artists.length > 0 && (
        <section className={searchStyles.section}>
          <h2 className={searchStyles.sectionTitle}>Artists</h2>
          <div className={searchStyles.artistGrid}>
            {results.artists.map((artist) => <ArtistCard key={artist.id} artist={artist} />)}
          </div>
        </section>
      )}

      {!loading && showAlbums && results.albums.length > 0 && (
        <section className={searchStyles.section}>
          <h2 className={searchStyles.sectionTitle}>Albums</h2>
          <div className={albumStyles.grid}>
            {results.albums.map((album) => <AlbumCard key={album.id} album={album} />)}
          </div>
        </section>
      )}

      {!loading && showTracks && results.tracks.length > 0 && (
        <section className={searchStyles.section}>
          <h2 className={searchStyles.sectionTitle}>Tracks</h2>
          <div className={styles.grid}>
            {results.tracks.map((track) => <TrackCard key={track.id} track={track} queue={results.tracks} />)}
          </div>
        </section>
      )}
    </main>
  );
}
