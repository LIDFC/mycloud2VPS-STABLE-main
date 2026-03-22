# ── Stage 1: Build React client ───────────────────────────────────────────────
FROM node:20-alpine AS client-build

WORKDIR /app/client
COPY client/package*.json ./
RUN npm install --silent
COPY client/ ./
RUN npm run build

# ── Stage 2: Production server ────────────────────────────────────────────────
FROM node:20-alpine

# FFmpeg for waveform generation
RUN apk add --no-cache ffmpeg

WORKDIR /app/server

# Server dependencies
COPY server/package*.json ./
RUN npm install --only=production --silent

# Server source
COPY server/ ./

# Built frontend from stage 1
COPY --from=client-build /app/client/dist ./client/dist

# Persistent data directories (mounted as volumes)
RUN mkdir -p data uploads/tracks uploads/covers uploads/avatars waveforms

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3001/api/health || exit 1

CMD ["node", "server.js"]
