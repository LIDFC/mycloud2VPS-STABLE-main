/**
 * routes/tracks.js
 */
"use strict";

const express = require("express");
const path    = require("path");

const router = express.Router();
const { v4: uuidv4 } = require("uuid");

function makeTracksRouter({
  auth, optionalAuth,
  readJSON, writeJSON,
  tracksFile, usersFile,
  tracksDir, waveformsDir,
  upload,
  generateWaveform,
  mapTrack, shuffle,
  pushNotification, notifyAdmins,
  parseFeaturing,
}) {
  router.get("/", optionalAuth, (req, res) => {
    const tracks = readJSON(tracksFile);
    const userId = req.user?.id;
    res.json(tracks.filter((t) => t.status === "published").map((t) => mapTrack(t, userId)));
  });

  router.post("/listen", auth, (req, res) => {
    const { trackId } = req.body;
    if (!trackId) return res.status(400).json({ error: "trackId required" });

    const tracks = readJSON(tracksFile);
    const track = tracks.find((t) => t.id === trackId);
    if (!track) return res.status(404).json({ error: "Track not found" });

    track.playsCount = (track.playsCount || 0) + 1;

    const users = readJSON(usersFile);
    const user = users.find((u) => u.id === req.user.id);
    if (user) {
      if (!user.genreHistory) user.genreHistory = {};
      const genre = track.genre || "Unknown";
      user.genreHistory[genre] = (user.genreHistory[genre] || 0) + 1;
      writeJSON(usersFile, users);
    }

    writeJSON(tracksFile, tracks);
    res.json({ ok: true, playsCount: track.playsCount });
  });

  router.post("/:id/like", auth, (req, res) => {
    const tracks = readJSON(tracksFile);
    const track = tracks.find((t) => t.id === req.params.id);
    if (!track) return res.status(404).json({ error: "Track not found" });

    track.likedBy = track.likedBy || [];
    const idx = track.likedBy.indexOf(req.user.id);
    idx === -1 ? track.likedBy.push(req.user.id) : track.likedBy.splice(idx, 1);
    writeJSON(tracksFile, tracks);
    res.json({ likesCount: track.likedBy.length, likedByMe: idx === -1 });
  });

  router.post("/:id/repost", auth, (req, res) => {
    const tracks = readJSON(tracksFile);
    const track = tracks.find((t) => t.id === req.params.id);
    if (!track) return res.status(404).json({ error: "Track not found" });

    track.repostedBy = track.repostedBy || [];
    const idx = track.repostedBy.indexOf(req.user.id);
    idx === -1 ? track.repostedBy.push(req.user.id) : track.repostedBy.splice(idx, 1);
    writeJSON(tracksFile, tracks);
    res.json({ repostCount: track.repostedBy.length, repostedByMe: idx === -1 });
  });

  router.get("/recommendations", optionalAuth, (req, res) => {
    const userId = req.user?.id;
    const tracks = readJSON(tracksFile).filter((t) => t.status === "published");
    const allGenres = [...new Set(tracks.map((t) => t.genre || "Unknown"))];

    if (!userId) {
      const groups = allGenres.map((g) => ({
        genre: g,
        tracks: shuffle(tracks.filter((t) => (t.genre || "Unknown") === g)).map((t) => mapTrack(t, null)),
      })).filter((g) => g.tracks.length > 0);
      return res.json({ groups, topGenres: [] });
    }

    const users = readJSON(usersFile);
    const user = users.find((u) => u.id === userId);
    const history = user?.genreHistory || {};

    const sorted = [...allGenres].sort((a, b) => {
      const diff = (history[b] || 0) - (history[a] || 0);
      return diff !== 0 ? diff : a.localeCompare(b);
    });

    const topGenres = Object.entries(history)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([genre]) => genre);

    const groups = sorted.map((g) => ({
      genre: g,
      tracks: shuffle(tracks.filter((t) => (t.genre || "Unknown") === g)).map((t) => mapTrack(t, userId)),
    })).filter((g) => g.tracks.length > 0);

    res.json({ groups, topGenres });
  });

  router.post(
    "/upload",
    auth,
    upload.fields([{ name: "audio", maxCount: 1 }, { name: "cover", maxCount: 1 }]),
    async (req, res) => {
      const users = readJSON(usersFile);
      const me = users.find((u) => u.id === req.user.id);
      if (!me || (!["artist", "artist_pro"].includes(me.accountType) && me.role !== "admin")) {
        return res.status(403).json({ error: "Only artists can upload tracks" });
      }

      const { title, artist, genre, description, featuring } = req.body;
      if (!title) return res.status(400).json({ error: "Title required" });
      if (!req.files?.audio) return res.status(400).json({ error: "Audio file required" });

      const trackId = uuidv4();
      const audioFilename = req.files.audio[0].filename;
      const audioPath = path.join(tracksDir, audioFilename);
      const wfFilename = `${trackId}.json`;
      const wfPath = path.join(waveformsDir, wfFilename);

      // Determine status: drop uploads use drop_pending, regular uploads use pending
      const dropId = req.body.dropId || null;
      const releaseAt = req.body.releaseAt || null;
      let status;
      if (me.role === "admin") {
        status = "published";
      } else if (dropId && releaseAt) {
        status = "drop_pending"; // goes to drop moderation queue
      } else {
        status = "pending"; // goes to regular moderation queue
      }

      generateWaveform(audioPath, wfPath).then((ok) => {
        if (!ok) return;
        const savedTracks = readJSON(tracksFile);
        const savedTrack = savedTracks.find((item) => item.id === trackId);
        if (!savedTrack) return;
        savedTrack.waveformFile = wfFilename;
        writeJSON(tracksFile, savedTracks);
      });

      const track = {
        id: trackId,
        title: title.trim(),
        artist: (artist || me.username).trim(),
        artistId: me.id,
        genre: genre?.trim() || null,
        description: description?.trim() || null,
        featuring: parseFeaturing(featuring, users),
        audioFile: audioFilename,
        coverFile: req.files?.cover?.[0]?.filename || null,
        waveformFile: null,
        status,
        dropId: dropId || null,
        releaseAt: releaseAt || null,
        likedBy: [],
        repostedBy: [],
        playsCount: 0,
        createdAt: new Date().toISOString(),
      };

      const tracks = readJSON(tracksFile);
      tracks.push(track);
      writeJSON(tracksFile, tracks);

      if (status === "drop_pending") {
        notifyAdmins(
          `Дроп на модерации: "${track.title}" от ${track.artist} — дата релиза ${new Date(releaseAt).toLocaleDateString("ru-RU")}`,
          { type: "drop_pending_track", trackId: track.id }
        );
      } else if (status === "pending") {
        notifyAdmins(
          `New track submitted: "${track.title}" by ${track.artist} — awaiting review`,
          { type: "pending_track", trackId: track.id }
        );
      } else if (track.artistId) {
        pushNotification(track.artistId, `Track "${track.title}" is live now.`, { type: "published_track", trackId: track.id });
      }

      res.json({ success: true, track, status });
    }
  );

  return router;
}

module.exports = makeTracksRouter;
