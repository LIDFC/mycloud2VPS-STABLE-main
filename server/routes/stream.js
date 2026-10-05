/**
 * routes/stream.js
 *
 * GET /api/stream/:trackId
 *
 * Streams an audio file with HTTP Range Request support (RFC 7233).
 * Enables seeking, resuming and efficient mobile playback (AVPlayer, Safari).
 */
"use strict";

const express = require("express");
const path    = require("path");
const fs      = require("fs");

const router = express.Router();

const MIME_TYPES = {
  ".mp3":  "audio/mpeg",
  ".m4a":  "audio/mp4",
  ".mp4":  "audio/mp4",
  ".aac":  "audio/aac",
  ".wav":  "audio/wav",
  ".flac": "audio/flac",
  ".ogg":  "audio/ogg",
  ".opus": "audio/ogg",
};

/**
 * Parses a single-range "bytes=" header.
 * Supports "start-end", "start-" and suffix "-length" forms.
 * Multi-range requests are served with their first range only.
 *
 * @returns {{start:number,end:number}|null|undefined}
 *   null if the range is unsatisfiable, undefined if the header is malformed
 *   (a malformed Range header is ignored and the full file is served)
 */
function parseRange(header, fileSize) {
  const match = /^bytes=\s*(\d*)\s*-\s*(\d*)/.exec(String(header).split(",")[0].trim());
  if (!match || (match[1] === "" && match[2] === "")) return undefined;

  let start;
  let end;
  if (match[1] === "") {
    // Suffix range: last N bytes
    const suffix = parseInt(match[2], 10);
    if (!(suffix > 0)) return null;
    start = Math.max(0, fileSize - suffix);
    end   = fileSize - 1;
  } else {
    start = parseInt(match[1], 10);
    end   = match[2] === "" ? fileSize - 1 : Math.min(parseInt(match[2], 10), fileSize - 1);
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= fileSize || start > end) return null;
  return { start, end };
}

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
    const mimeType = MIME_TYPES[path.extname(track.audioFile).toLowerCase()] || "audio/mpeg";

    // Always advertise range support
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Content-Type",  mimeType);
    res.setHeader("Cache-Control", "public, max-age=86400"); // 24h cache
    res.setHeader("Last-Modified", stat.mtime.toUTCString());

    const parsed = range ? parseRange(range, fileSize) : undefined;

    if (parsed !== undefined) {
      // ── Partial content (seeking / resuming) ──────────────────────────────
      if (!parsed) {
        res.setHeader("Content-Range", `bytes */${fileSize}`);
        return res.status(416).json({ error: "Range Not Satisfiable" });
      }

      const { start, end } = parsed;
      res.writeHead(206, {
        "Content-Range":  `bytes ${start}-${end}/${fileSize}`,
        "Content-Length": end - start + 1,
      });
      if (req.method === "HEAD") return res.end();
      fs.createReadStream(filePath, { start, end }).pipe(res);
    } else {
      // ── Full file ─────────────────────────────────────────────────────────
      res.writeHead(200, { "Content-Length": fileSize });
      if (req.method === "HEAD") return res.end();
      fs.createReadStream(filePath).pipe(res);
    }
  });

  return router;
}

module.exports = makeStreamRouter;
module.exports.parseRange = parseRange;
