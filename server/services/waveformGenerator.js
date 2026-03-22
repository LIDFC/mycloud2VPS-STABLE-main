/**
 * services/waveformGenerator.js
 *
 * Generates a 200-sample amplitude waveform from an audio file using FFmpeg.
 * Falls back gracefully if FFmpeg is not installed.
 *
 * Output format: { samples: number[], duration: number }
 *   samples  — 200 normalised float values [0..1]
 *   duration — track length in seconds
 */
"use strict";

const { spawn, execFile } = require("child_process");
const fs   = require("fs");
const path = require("path");

const SAMPLE_POINTS = 800;  // waveform resolution — more points = smoother display
const SAMPLE_RATE   = 8000; // Hz — enough detail, small data

/** Get track duration in seconds via ffprobe. Returns 0 if unavailable. */
function getDuration(audioPath) {
  return new Promise((resolve) => {
    execFile("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      audioPath,
    ], (err, stdout) => {
      if (err) return resolve(0);
      resolve(parseFloat(stdout.trim()) || 0);
    });
  });
}

/**
 * generateWaveform(audioFilePath, outputJsonPath)
 *
 * Decodes audio to raw int16 PCM via FFmpeg, then downsamples
 * into SAMPLE_POINTS peak-amplitude values.
 *
 * @returns {Promise<boolean>} true on success, false if FFmpeg unavailable/failed
 */
async function generateWaveform(audioFilePath, outputJsonPath) {
  fs.mkdirSync(path.dirname(outputJsonPath), { recursive: true });

  const duration = await getDuration(audioFilePath);

  return new Promise((resolve) => {
    const ffmpeg = spawn("ffmpeg", [
      "-i",        audioFilePath,
      "-ac",       "1",                       // mono
      "-filter:a", `aresample=${SAMPLE_RATE}`,// downsample
      "-map",      "0:a",
      "-c:a",      "pcm_s16le",               // raw int16 LE
      "-f",        "s16le",
      "-",                                    // pipe to stdout
    ]);

    const chunks = [];
    ffmpeg.stdout.on("data", (chunk) => chunks.push(chunk));
    ffmpeg.stderr.on("data", () => {});       // suppress stderr

    const writeEmpty = () => {
      try { fs.writeFileSync(outputJsonPath, JSON.stringify({ samples: [], duration })); }
      catch {}
    };

    ffmpeg.on("close", (code) => {
      if (code !== 0 || chunks.length === 0) {
        writeEmpty();
        return resolve(false);
      }
      try {
        const buf    = Buffer.concat(chunks);
        const total  = Math.floor(buf.length / 2);      // int16 = 2 bytes
        const stride = Math.max(1, Math.floor(total / SAMPLE_POINTS));
        const samples = [];

        for (let i = 0; i < SAMPLE_POINTS; i++) {
          const s = i * stride;
          const e = Math.min(s + stride, total);
          let peak = 0;
          for (let j = s; j < e; j++) {
            const v = Math.abs(buf.readInt16LE(j * 2)) / 32768;
            if (v > peak) peak = v;
          }
          samples.push(Math.round(peak * 1000) / 1000);
        }

        fs.writeFileSync(outputJsonPath, JSON.stringify({ samples, duration }));
        console.log(`[waveform] ✓ ${path.basename(audioFilePath)} — ${SAMPLE_POINTS} samples, ${duration.toFixed(1)}s`);
        resolve(true);
      } catch (err) {
        console.error("[waveform] parse error:", err.message);
        writeEmpty();
        resolve(false);
      }
    });

    ffmpeg.on("error", (err) => {
      console.warn("[waveform] FFmpeg not available:", err.message);
      writeEmpty();
      resolve(false);
    });
  });
}

module.exports = { generateWaveform };
