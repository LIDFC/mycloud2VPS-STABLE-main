export function getFeaturingList(track) {
  if (!Array.isArray(track?.featuring)) return [];
  return track.featuring
    .map((entry) => ({
      type: entry?.type || "text",
      username: entry?.username || entry?.display || entry?.value || "",
      display: entry?.display || entry?.username || entry?.value || "",
    }))
    .filter((entry) => entry.display);
}

export function formatArtistLine(track) {
  const mainArtist = track?.artist || "";
  const featuring = getFeaturingList(track).map((entry) => entry.display);
  return featuring.length ? `${mainArtist} feat. ${featuring.join(", ")}` : mainArtist;
}
