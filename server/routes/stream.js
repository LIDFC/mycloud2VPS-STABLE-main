/**
 * routes/stream.js
 *
 * GET /api/stream/:trackId
 *
 * Streams an mp3 file with full HTTP Range Request support.
 * Enables seeking, resuming and efficient mobile playback.
 */
"use strict";

const express = require("express");
const path    = require("path");
const fs      = require("fs");

const router = express.Router();

/**
 * @param {string} tracksDir   Absolute path to the tracks upload directory
 * @param {Function} readJSON  JSON read helper from the parent app
 * @param {string} tracksFile  Absolute path to tracks.json
 */
function makeStreamRouter(tracksDir, readJSON, tracksFile) {

  router.get("/:trackId", (req, res) => {
    const tracks  = readJSON(tracksFile);
    const track   = tracks.find((t) => t.id === req.params.trackId);

    if (!track) {
      return res.status(404).json({ error: "Track not found" });
    }

    const filePath = path.join(tracksDir, track.audioFile);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "Audio file not found" });
    }

    const stat     = fs.statSync(filePath);
    const fileSize = stat.size;
    const range    = req.headers.range;

    // Always advertise range support
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Content-Type",  "audio/mpeg");
    res.setHeader("Cache-Control", "public, max-age=86400"); // 24h cache

    if (range) {
      // ── Partial content (seeking / resuming) ──────────────────────────────
      const [rawStart, rawEnd] = range.replace(/bytes=/, "").split("-");
      const start    = parseInt(rawStart, 10);
      const end      = rawEnd ? parseInt(rawEnd, 10) : fileSize - 1;

      // Validate range
      if (start >= fileSize || end >= fileSize || start > end) {
        res.setHeader("Content-Range", `bytes */${fileSize}`);
        return res.status(416).json({ error: "Range Not Satisfiable" });
      }

      const chunkSize = end - start + 1;

      res.writeHead(206, {
        "Content-Range":  `bytes ${start}-${end}/${fileSize}`,
        "Content-Length": chunkSize,
      });

      fs.createReadStream(filePath, { start, end }).pipe(res);
    } else {
      // ── Full file ─────────────────────────────────────────────────────────
      res.writeHead(200, { "Content-Length": fileSize });
      fs.createReadStream(filePath).pipe(res);
    }
  });

  return router;
}

module.exports = makeStreamRouter;
