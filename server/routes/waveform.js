/**
 * routes/waveform.js
 *
 * GET /api/waveform/:trackId
 *
 * Returns pre-generated waveform JSON for a track.
 * If the waveform hasn't been generated yet, returns { samples: [] }
 * and triggers background generation.
 */
"use strict";

const express = require("express");
const path    = require("path");
const fs      = require("fs");

const router = express.Router();

/**
 * @param {string}   waveformsDir  Absolute path to waveforms directory
 * @param {string}   tracksDir     Absolute path to tracks directory
 * @param {Function} readJSON      JSON read helper
 * @param {Function} writeJSON     JSON write helper
 * @param {string}   tracksFile    Absolute path to tracks.json
 * @param {Function} generateWaveform  Waveform generator function
 */
function makeWaveformRouter(waveformsDir, tracksDir, readJSON, writeJSON, tracksFile, generateWaveform) {

  router.get("/:trackId", (req, res) => {
    const tracks = readJSON(tracksFile);
    const track  = tracks.find((t) => t.id === req.params.trackId);

    if (!track) {
      return res.status(404).json({ error: "Track not found" });
    }

    // Waveform already generated
    if (track.waveformFile) {
      const wfPath = path.join(waveformsDir, track.waveformFile);
      if (fs.existsSync(wfPath)) {
        res.setHeader("Content-Type",  "application/json");
        res.setHeader("Cache-Control", "public, max-age=2592000"); // 30d — waveform never changes
        return res.sendFile(wfPath);
      }
    }

    // Not generated yet — trigger background generation and return empty
    const audioPath    = path.join(tracksDir, track.audioFile);
    const wfFilename   = `${track.id}.json`;
    const wfPath       = path.join(waveformsDir, wfFilename);

    if (fs.existsSync(audioPath) && !track._waveformPending) {
      // Mark as pending to avoid duplicate jobs
      const allTracks = readJSON(tracksFile);
      const t = allTracks.find((x) => x.id === track.id);
      if (t) { t._waveformPending = true; writeJSON(tracksFile, allTracks); }

      generateWaveform(audioPath, wfPath).then((ok) => {
        if (ok) {
          const updatedTracks = readJSON(tracksFile);
          const ut = updatedTracks.find((x) => x.id === track.id);
          if (ut) {
            ut.waveformFile    = wfFilename;
            ut._waveformPending = false;
            writeJSON(tracksFile, updatedTracks);
          }
          console.log(`[waveform] Background generation complete for ${track.id}`);
        }
      });
    }

    // Return empty while generating — frontend will show fallback bar
    res.json({ samples: [], duration: 0 });
  });

  return router;
}

module.exports = makeWaveformRouter;
