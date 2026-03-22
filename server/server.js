"use strict";
const express  = require("express");
const cors     = require("cors");
const bcrypt   = require("bcryptjs");
const jwt      = require("jsonwebtoken");
const multer   = require("multer");
const path     = require("path");
const fs       = require("fs");
const { v4: uuidv4 } = require("uuid");

const { generateWaveform } = require("./services/waveformGenerator");
const makeStreamRouter     = require("./routes/stream");
const makeWaveformRouter   = require("./routes/waveform");
const makeTracksRouter     = require("./routes/tracks");

const app        = express();
const PORT       = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || "mycloud-dev-secret-change-in-prod";

const DATA_DIR      = path.join(__dirname, "data");
const UPLOADS_DIR   = path.join(__dirname, "uploads");
const TRACKS_DIR    = path.join(UPLOADS_DIR, "tracks");
const COVERS_DIR    = path.join(UPLOADS_DIR, "covers");
const AVATARS_DIR   = path.join(UPLOADS_DIR, "avatars");
const BACKGROUNDS_DIR = path.join(UPLOADS_DIR, "backgrounds");
const WAVEFORMS_DIR = path.join(__dirname, "waveforms");
const USERS_FILE    = path.join(DATA_DIR, "users.json");
const TRACKS_FILE   = path.join(DATA_DIR, "tracks.json");
const NOTIFS_FILE   = path.join(DATA_DIR, "notifications.json");
const ALBUMS_FILE   = path.join(DATA_DIR, "albums.json");
const PLAYLISTS_FILE = path.join(DATA_DIR, "playlists.json");
const POSTS_FILE     = path.join(DATA_DIR, "posts.json");
const DROPS_FILE     = path.join(DATA_DIR, "drops.json");
const POSTS_DIR      = path.join(UPLOADS_DIR, "posts");

[DATA_DIR, TRACKS_DIR, COVERS_DIR, AVATARS_DIR, BACKGROUNDS_DIR, WAVEFORMS_DIR, POSTS_DIR]
  .forEach((d) => fs.mkdirSync(d, { recursive: true }));

const readJSON  = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return []; } };
const writeJSON = (f, d) => fs.writeFileSync(f, JSON.stringify(d, null, 2));

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === "cover") return cb(null, COVERS_DIR);
    if (file.fieldname === "avatar") return cb(null, AVATARS_DIR);
    if (file.fieldname === "background") return cb(null, BACKGROUNDS_DIR);
    if (file.fieldname === "postImage") return cb(null, POSTS_DIR);
    cb(null, TRACKS_DIR);
  },
  filename: (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`),
});
const upload = multer({
  storage, limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === "audio") return cb(null, /^audio\//.test(file.mimetype));
    if (["cover", "avatar", "background", "postImage"].includes(file.fieldname)) return cb(null, /^image\//.test(file.mimetype));
    cb(null, false);
  },
});

const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "No token" });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: "Invalid token" }); }
};
const adminAuth = (req, res, next) =>
  auth(req, res, () => {
    if (req.user.role !== "admin") return res.status(403).json({ error: "Admin only" });
    next();
  });
const optionalAuth = (req, res, next) => {
  try { req.user = jwt.verify(req.headers.authorization?.split(" ")[1], JWT_SECRET); } catch {}
  next();
};

// Auto-publish scheduled tracks whose releaseAt has passed
function autoPublishScheduled() {
  const tracks = readJSON(TRACKS_FILE);
  const now = new Date();
  let changed = false;
  tracks.forEach(t => {
    if (t.status === 'scheduled' && t.releaseAt && new Date(t.releaseAt) <= now) {
      t.status = 'published';
      changed = true;
      // Notify artist
      if (t.artistId) {
        pushNotification(t.artistId, `Трек "${t.title}" опубликован согласно дате дропа! 🎵`, { type: 'published_track', trackId: t.id });
      }
    }
  });
  if (changed) writeJSON(TRACKS_FILE, tracks);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function fmtCount(n) {
  if (n >= 1e6) return (n/1e6).toFixed(1)+"M";
  if (n >= 1e3) return (n/1e3).toFixed(1)+"k";
  return String(n);
}
function parseFeaturing(rawValue, users = readJSON(USERS_FILE)) {
  return String(rawValue || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 6)
    .map((item) => {
      if (item.startsWith("@")) {
        const username = item.slice(1).trim();
        const user = users.find((u) => u.username.toLowerCase() === username.toLowerCase());
        if (user) {
          return { type: "user", userId: user.id, username: user.username, display: user.username };
        }
        return { type: "text", display: username || item.replace(/^@+/, "") };
      }
      return { type: "text", display: item.replace(/^@+/, "") };
    });
}
function getFeaturingText(featuring = []) {
  return featuring
    .map((entry) => entry?.display || entry?.username || entry?.value)
    .filter(Boolean);
}
function mapTrack(t, userId) {
  return {
    id: t.id, title: t.title, artist: t.artist, artistId: t.artistId||null, albumId: t.albumId||null,
    genre: t.genre||null, description: t.description||null,
    featuring: t.featuring || [],
    artistLine: [t.artist, ...getFeaturingText(t.featuring || [])].filter(Boolean).join(" feat. ") || t.artist,
    status: t.status||"published",
    audioUrl:    `/api/stream/${t.id}`,
    coverUrl:    t.coverFile    ? `/uploads/covers/${t.coverFile}`    : null,
    waveformUrl: t.waveformFile ? `/api/waveform/${t.id}`             : null,
    likesCount:  (t.likedBy    ||[]).length,
    repostCount: (t.repostedBy ||[]).length,
    playsCount:  t.playsCount||0,
    playsFormatted: fmtCount(t.playsCount||0),
    likedByMe:    userId?(t.likedBy   ||[]).includes(userId):false,
    repostedByMe: userId?(t.repostedBy||[]).includes(userId):false,
    createdAt: t.createdAt,
  };
}
function canManageMusic(user) {
  return !!user && (user.role === "admin" || ["artist", "artist_pro"].includes(user.accountType));
}
function canViewAlbum(album, user) {
  return !!album && (album.status === "published" || user?.role === "admin" || user?.id === album.artistId);
}
function getAlbumVisibleTracks(albumId, user) {
  return readJSON(TRACKS_FILE)
    .filter((t) => t.albumId === albumId && (t.status === "published" || user?.role === "admin" || user?.id === t.artistId))
    .map((t) => mapTrack(t, user?.id));
}

function pushNotification(userId, message, extra={}) {
  const n = readJSON(NOTIFS_FILE);
  n.push({ id:uuidv4(), userId, message, read:false, createdAt:new Date().toISOString(), ...extra });
  writeJSON(NOTIFS_FILE, n);
}
function notifyAdmins(message, extra={}) {
  readJSON(USERS_FILE).filter(u=>u.role==="admin").forEach(a=>pushNotification(a.id,message,extra));
}

// CORS — в dev разрешаем localhost, в prod берём из переменной окружения
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map(s => s.trim())
  : ["http://localhost:5173", "http://localhost:3001"];

app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (mobile apps, curl, same-origin)
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error("Not allowed by CORS"));
  },
  credentials: true,
}));
app.use(express.json());
app.use("/uploads", express.static(UPLOADS_DIR));
const distDir = path.join(__dirname, "client/dist");

// ── Route modules ─────────────────────────────────────────────────────────────
app.use("/api/stream",   makeStreamRouter(TRACKS_DIR, readJSON, TRACKS_FILE));
app.use("/api/waveform", makeWaveformRouter(WAVEFORMS_DIR,TRACKS_DIR,readJSON,writeJSON,TRACKS_FILE,generateWaveform));
app.use("/api/tracks",   makeTracksRouter({ auth,optionalAuth,readJSON,writeJSON,
  tracksFile:TRACKS_FILE,usersFile:USERS_FILE,tracksDir:TRACKS_DIR,waveformsDir:WAVEFORMS_DIR,
  upload,generateWaveform,mapTrack,shuffle,pushNotification,notifyAdmins,parseFeaturing }));

// Legacy alias
app.post("/api/listen", auth, (req,res,next)=>{ req.url="/listen"; next(); }, makeTracksRouter({ auth,optionalAuth,readJSON,writeJSON,
  tracksFile:TRACKS_FILE,usersFile:USERS_FILE,tracksDir:TRACKS_DIR,waveformsDir:WAVEFORMS_DIR,
  upload,generateWaveform,mapTrack,shuffle,pushNotification,notifyAdmins,parseFeaturing }));

// ── AUTH ──────────────────────────────────────────────────────────────────────
app.post("/api/auth/register", async (req,res)=>{
  const { username,password,accountType="listener" } = req.body;
  if (!username||!password) return res.status(400).json({error:"Username and password required"});
  if (username.length<3)    return res.status(400).json({error:"Username too short (min 3)"});
  if (password.length<4)    return res.status(400).json({error:"Password too short (min 4)"});
  if (!["listener","artist","artist_pro"].includes(accountType)) return res.status(400).json({error:"Invalid account type"});
  const users=readJSON(USERS_FILE);
  if (users.find(u=>u.username.toLowerCase()===username.toLowerCase()))
    return res.status(409).json({error:"Username already taken"});
  const hash=await bcrypt.hash(password,10);
  const isFirst=users.length===0;
  const user={ id:uuidv4(),username,passwordHash:hash,
    role:isFirst?"admin":"user", accountType:isFirst?"listener":accountType,
    bio:"",avatarFile:null,backgroundFile:null,followers:[],following:[],genreHistory:{},
    createdAt:new Date().toISOString() };
  users.push(user); writeJSON(USERS_FILE,users);
  const token=jwt.sign({id:user.id,username:user.username,role:user.role,accountType:user.accountType},JWT_SECRET,{expiresIn:"7d"});
  res.json({token,user:{id:user.id,username:user.username,role:user.role,accountType:user.accountType}});
});

app.post("/api/auth/login", async (req,res)=>{
  const { username,password }=req.body;
  const users=readJSON(USERS_FILE);
  const user=users.find(u=>u.username.toLowerCase()===username?.toLowerCase());
  if (!user) return res.status(401).json({error:"Invalid credentials"});
  if (!await bcrypt.compare(password,user.passwordHash)) return res.status(401).json({error:"Invalid credentials"});
  const token=jwt.sign({id:user.id,username:user.username,role:user.role,accountType:user.accountType},JWT_SECRET,{expiresIn:"7d"});
  res.json({token,user:{id:user.id,username:user.username,role:user.role,accountType:user.accountType}});
});

app.get("/api/auth/me", auth, (req,res)=>{
  const user=readJSON(USERS_FILE).find(u=>u.id===req.user.id);
  if (!user) return res.status(404).json({error:"User not found"});
  res.json({ id:user.id,username:user.username,role:user.role,accountType:user.accountType,bio:user.bio||"",
    avatarUrl:user.avatarFile?`/uploads/avatars/${user.avatarFile}`:null,
    backgroundUrl:user.backgroundFile?`/uploads/backgrounds/${user.backgroundFile}`:null,
    followersCount:(user.followers||[]).length, followingCount:(user.following||[]).length });
});

app.put("/api/auth/profile", auth, upload.fields([{ name: "avatar", maxCount: 1 }, { name: "background", maxCount: 1 }]), async (req,res)=>{
  const users=readJSON(USERS_FILE);
  const idx=users.findIndex(u=>u.id===req.user.id);
  if (idx===-1) return res.status(404).json({error:"User not found"});
  if (req.body.bio!==undefined) users[idx].bio=req.body.bio;
  if (req.body.username && req.body.username!==users[idx].username) {
    const n=req.body.username.trim();
    if (n.length<3) return res.status(400).json({error:"Username too short (min 3)"});
    if (!/^[a-zA-Z0-9_.-]+$/.test(n)) return res.status(400).json({error:"Username: letters, numbers, _ . - only"});
    if (users.find(u=>u.id!==req.user.id&&u.username.toLowerCase()===n.toLowerCase()))
      return res.status(409).json({error:"Username already taken"});
    users[idx].username=n;
  }
  const avatarFile = req.files?.avatar?.[0];
  const backgroundFile = req.files?.background?.[0];
  if (avatarFile) {
    if (users[idx].avatarFile){ const old=path.join(AVATARS_DIR,users[idx].avatarFile); if(fs.existsSync(old))fs.unlinkSync(old); }
    users[idx].avatarFile=avatarFile.filename;
  }
  if (backgroundFile) {
    if (users[idx].backgroundFile){ const old=path.join(BACKGROUNDS_DIR,users[idx].backgroundFile); if(fs.existsSync(old))fs.unlinkSync(old); }
    users[idx].backgroundFile=backgroundFile.filename;
  }
  writeJSON(USERS_FILE,users);
  const u=users[idx];
  const token=jwt.sign({id:u.id,username:u.username,role:u.role,accountType:u.accountType},JWT_SECRET,{expiresIn:"7d"});
  res.json({success:true,token,user:{id:u.id,username:u.username,role:u.role,accountType:u.accountType},
    avatarUrl:u.avatarFile?`/uploads/avatars/${u.avatarFile}`:null,
    backgroundUrl:u.backgroundFile?`/uploads/backgrounds/${u.backgroundFile}`:null});
});

// ── USER PROFILES ─────────────────────────────────────────────────────────────
app.get("/api/users/:username", optionalAuth, (req,res)=>{
  const users=readJSON(USERS_FILE); const tracks=readJSON(TRACKS_FILE);
  const user=users.find(u=>u.username.toLowerCase()===req.params.username.toLowerCase());
  if (!user) return res.status(404).json({error:"User not found"});
  const userId=req.user?.id; const isMe=userId===user.id; const isAdmin=req.user?.role==="admin";
  const myTracks=tracks.filter(t=>t.artistId===user.id&&(t.status==="published"||isMe||isAdmin)).map(t=>mapTrack(t,userId));
  // Also include tracks where this user is a featured artist (via @username in featuring)
  const featuredTracks=tracks.filter(t=>
    t.status==="published" &&
    t.artistId!==user.id &&
    (t.featuring||[]).some(f=>f.type==="user"&&f.userId===user.id)
  ).map(t=>mapTrack(t,userId));
  // Merge own + featured, deduplicate by id, own tracks first
  const allTracks=[...myTracks,...featuredTracks.filter(f=>!myTracks.find(m=>m.id===f.id))];
  const reposted=tracks.filter(t=>(t.repostedBy||[]).includes(user.id)&&t.status==="published").map(t=>mapTrack(t,userId));
  const liked=isMe?tracks.filter(t=>(t.likedBy||[]).includes(user.id)&&t.status==="published").map(t=>mapTrack(t,userId)):[];
  // Albums by this artist
  const albums = readJSON(ALBUMS_FILE)
    .filter(a=>a.artistId===user.id&&(a.status==="published"||isMe||isAdmin))
    .map(a=>({...a, coverUrl: a.coverFile?`/uploads/covers/${a.coverFile}`:null,
      tracks: getAlbumVisibleTracks(a.id, req.user),
      likesCount:(a.likedBy||[]).length,
      likedByMe:userId?(a.likedBy||[]).includes(userId):false}));
  res.json({ id:user.id,username:user.username,accountType:user.accountType,role:user.role,bio:user.bio||"",
    avatarUrl:user.avatarFile?`/uploads/avatars/${user.avatarFile}`:null,
    backgroundUrl:user.backgroundFile?`/uploads/backgrounds/${user.backgroundFile}`:null,
    followersCount:(user.followers||[]).length, followingCount:(user.following||[]).length,
    isFollowedByMe:userId?(user.followers||[]).includes(userId):false,
    tracks:allTracks,reposted,liked,albums,totalPlays:myTracks.reduce((s,t)=>s+t.playsCount,0) });
});

app.post("/api/users/:username/follow", auth, (req,res)=>{
  const users=readJSON(USERS_FILE);
  const target=users.find(u=>u.username.toLowerCase()===req.params.username.toLowerCase());
  const follower=users.find(u=>u.id===req.user.id);
  if (!target||!follower) return res.status(404).json({error:"User not found"});
  if (target.id===follower.id) return res.status(400).json({error:"Cannot follow yourself"});
  target.followers=target.followers||[]; follower.following=follower.following||[];
  const idx=target.followers.indexOf(req.user.id);
  if (idx===-1){ target.followers.push(req.user.id); follower.following.push(target.id); }
  else { target.followers.splice(idx,1); follower.following.splice(follower.following.indexOf(target.id),1); }
  writeJSON(USERS_FILE,users);
  res.json({followersCount:target.followers.length,isFollowedByMe:idx===-1});
});

// ── NOTIFICATIONS ──────────────────────────────────────────────────────────────
app.get("/api/notifications", auth, (req,res)=>{
  res.json(readJSON(NOTIFS_FILE).filter(n=>n.userId===req.user.id).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).slice(0,50));
});
app.post("/api/notifications/read-all", auth, (req,res)=>{
  const n=readJSON(NOTIFS_FILE); n.forEach(x=>{if(x.userId===req.user.id)x.read=true;}); writeJSON(NOTIFS_FILE,n); res.json({ok:true});
});
app.delete("/api/notifications/:id", auth, (req,res)=>{
  writeJSON(NOTIFS_FILE,readJSON(NOTIFS_FILE).filter(n=>!(n.id===req.params.id&&n.userId===req.user.id))); res.json({ok:true});
});

// ── ADMIN ─────────────────────────────────────────────────────────────────────
app.get("/api/admin/tracks/all",     adminAuth, (req,res)=>res.json(readJSON(TRACKS_FILE).map(t=>mapTrack(t,req.user.id))));

// Drop-pending tracks with drop info attached
app.get("/api/admin/tracks/drop-pending", adminAuth, (req, res) => {
  const tracks = readJSON(TRACKS_FILE).filter(t => t.status === "drop_pending");
  const drops = readJSON(DROPS_FILE);
  const users = readJSON(USERS_FILE);
  const result = tracks.map(t => {
    const drop = t.dropId ? drops.find(d => d.id === t.dropId) : null;
    const artist = users.find(u => u.id === t.artistId) || {};
    return {
      ...mapTrack(t, req.user.id),
      dropId: t.dropId,
      releaseAt: t.releaseAt,
      dropTitle: drop?.title || null,
      artistUsername: artist.username || null,
    };
  });
  res.json(result);
});
app.get("/api/admin/tracks/pending", adminAuth, (req,res)=>res.json(readJSON(TRACKS_FILE).filter(t=>t.status==="pending").map(t=>mapTrack(t,req.user.id))));

app.post("/api/admin/tracks/:id/approve", adminAuth, (req,res)=>{
  const tracks=readJSON(TRACKS_FILE); const track=tracks.find(t=>t.id===req.params.id);
  if (!track) return res.status(404).json({error:"Track not found"});

  if (track.status === "drop_pending" && track.releaseAt) {
    // Schedule for release date instead of publishing immediately
    const releaseMs = new Date(track.releaseAt).getTime();
    if (releaseMs > Date.now()) {
      track.status = "scheduled";
      writeJSON(TRACKS_FILE, tracks);
      if (track.artistId) {
        const dateStr = new Date(track.releaseAt).toLocaleDateString("ru-RU", { day:"numeric", month:"long", hour:"2-digit", minute:"2-digit" });
        pushNotification(track.artistId, `Трек "${track.title}" одобрен и выйдет ${dateStr} 🎵`, { type:"approved", trackId:track.id });
      }
      return res.json({ success:true, status:"scheduled" });
    }
    // If release date already passed, publish immediately
  }

  track.status="published"; writeJSON(TRACKS_FILE,tracks);
  if (track.artistId) pushNotification(track.artistId,`Your track "${track.title}" was approved ✓`,{type:"approved",trackId:track.id});
  res.json({success:true, status:"published"});
});

// ── RECOMMENDATIONS ───────────────────────────────────────────────────────────
app.get("/api/recommendations", optionalAuth, (req, res) => {
  const userId = req.user?.id;
  const tracks = readJSON(TRACKS_FILE).filter((t) => t.status === "published");
  const allGenres = [...new Set(tracks.map((t) => t.genre || "Unknown"))];

  if (!userId) {
    const groups = allGenres.map((g) => ({
      genre:  g,
      tracks: shuffle(tracks.filter((t) => (t.genre || "Unknown") === g)).map((t) => mapTrack(t, null)),
    })).filter((g) => g.tracks.length > 0);
    return res.json({ groups, topGenres: [] });
  }

  const users   = readJSON(USERS_FILE);
  const user    = users.find((u) => u.id === userId);
  const history = user?.genreHistory || {};

  const sorted = [...allGenres].sort((a, b) => {
    const d = (history[b] || 0) - (history[a] || 0);
    return d !== 0 ? d : a.localeCompare(b);
  });

  const topGenres = Object.entries(history)
    .sort((a, b) => b[1] - a[1]).slice(0, 3).map(([g]) => g);

  const groups = sorted.map((g) => ({
    genre:  g,
    tracks: shuffle(tracks.filter((t) => (t.genre || "Unknown") === g)).map((t) => mapTrack(t, userId)),
  })).filter((g) => g.tracks.length > 0);

  res.json({ groups, topGenres });
});
app.post("/api/admin/tracks/:id/reject", adminAuth, (req,res)=>{
  const tracks=readJSON(TRACKS_FILE); const track=tracks.find(t=>t.id===req.params.id);
  if (!track) return res.status(404).json({error:"Track not found"});
  track.status="rejected"; track.rejectReason=req.body.reason||null; writeJSON(TRACKS_FILE,tracks);
  if (track.artistId){
    const msg=track.rejectReason?`Your track "${track.title}" was rejected. Reason: ${track.rejectReason}`:`Your track "${track.title}" was rejected by moderation.`;
    pushNotification(track.artistId,msg,{type:"rejected",trackId:track.id});
  }
  res.json({success:true});
});

app.post("/api/admin/tracks", adminAuth,
  upload.fields([{name:"audio",maxCount:1},{name:"cover",maxCount:1}]),
  async (req,res)=>{
    const users = readJSON(USERS_FILE);
    const { title,artist,genre,description,featuring }=req.body;
    if (!title||!artist) return res.status(400).json({error:"Title and artist required"});
    if (!req.files?.audio) return res.status(400).json({error:"Audio file required"});
    const trackId=uuidv4(); const audioFilename=req.files.audio[0].filename;
    const audioPath=path.join(TRACKS_DIR,audioFilename);
    const wfFilename=`${trackId}.json`; const wfPath=path.join(WAVEFORMS_DIR,wfFilename);
    generateWaveform(audioPath,wfPath).then(ok=>{
      if(ok){const ts=readJSON(TRACKS_FILE);const t=ts.find(x=>x.id===trackId);if(t){t.waveformFile=wfFilename;writeJSON(TRACKS_FILE,ts);}}
    });
    const track={ id:trackId,title:title.trim(),artist:artist.trim(),artistId:req.user.id,
      genre:genre?.trim()||null,description:description?.trim()||null,
      featuring: parseFeaturing(featuring, users),
      audioFile:audioFilename,coverFile:req.files.cover?.[0]?.filename||null,
      waveformFile:null,status:"published",likedBy:[],repostedBy:[],playsCount:0,createdAt:new Date().toISOString() };
    const tracks=readJSON(TRACKS_FILE); tracks.push(track); writeJSON(TRACKS_FILE,tracks);
    res.json({success:true,track});
  }
);

app.put("/api/admin/tracks/:id", adminAuth, upload.single("cover"), (req,res)=>{
  const tracks=readJSON(TRACKS_FILE); const idx=tracks.findIndex(t=>t.id===req.params.id);
  if (idx===-1) return res.status(404).json({error:"Track not found"});
  const { title,artist,genre,description,featuring }=req.body;
  if (title)  tracks[idx].title=title.trim();
  if (artist) tracks[idx].artist=artist.trim();
  if (genre!==undefined)       tracks[idx].genre=genre.trim()||null;
  if (description!==undefined) tracks[idx].description=description.trim()||null;
  if (featuring!==undefined)   tracks[idx].featuring=parseFeaturing(featuring);
  if (req.file){
    if(tracks[idx].coverFile){const old=path.join(COVERS_DIR,tracks[idx].coverFile);if(fs.existsSync(old))fs.unlinkSync(old);}
    tracks[idx].coverFile=req.file.filename;
  }
  writeJSON(TRACKS_FILE,tracks); res.json({success:true});
});

app.delete("/api/admin/tracks/:id", adminAuth, (req,res)=>{
  let tracks=readJSON(TRACKS_FILE); const track=tracks.find(t=>t.id===req.params.id);
  if (!track) return res.status(404).json({error:"Track not found"});
  [track.audioFile&&path.join(TRACKS_DIR,track.audioFile),
   track.coverFile&&path.join(COVERS_DIR,track.coverFile),
   track.waveformFile&&path.join(WAVEFORMS_DIR,track.waveformFile)]
    .filter(Boolean).forEach(f=>{if(fs.existsSync(f))fs.unlinkSync(f);});
  writeJSON(TRACKS_FILE,tracks.filter(t=>t.id!==req.params.id)); res.json({success:true});
});

app.get("/api/admin/users", adminAuth, (req,res)=>{
  res.json(readJSON(USERS_FILE).map(({id,username,role,accountType,createdAt,followers,following})=>({
    id,username,role,accountType,createdAt,followersCount:(followers||[]).length,followingCount:(following||[]).length })));
});
app.delete("/api/admin/users/:id", adminAuth, (req,res)=>{
  if (req.params.id===req.user.id) return res.status(400).json({error:"Cannot delete yourself"});
  writeJSON(USERS_FILE,readJSON(USERS_FILE).filter(u=>u.id!==req.params.id)); res.json({success:true});
});
app.patch("/api/admin/users/:id/role", adminAuth, (req,res)=>{
  const { role }=req.body;
  if (!["admin","user"].includes(role)) return res.status(400).json({error:"Invalid role"});  // accountType handled separately
  const users=readJSON(USERS_FILE); const user=users.find(u=>u.id===req.params.id);
  if (!user) return res.status(404).json({error:"User not found"});
  user.role=role; writeJSON(USERS_FILE,users); res.json({success:true});
});




// ══════════════════════════════════════════════════════════════════════════════
// ARTIST PRO — admin only
// ══════════════════════════════════════════════════════════════════════════════
app.patch("/api/admin/users/:id/accountType", adminAuth, (req,res)=>{
  const { accountType }=req.body;
  if (!["listener","artist","artist_pro"].includes(accountType))
    return res.status(400).json({error:"Invalid accountType"});
  const users=readJSON(USERS_FILE);
  const user=users.find(u=>u.id===req.params.id);
  if (!user) return res.status(404).json({error:"User not found"});
  user.accountType=accountType;
  writeJSON(USERS_FILE,users);
  // Notify user
  if (accountType==="artist_pro")
    pushNotification(user.id,"🌟 You've been granted Artist Pro status!",{type:"artist_pro"});
  res.json({success:true});
});

// ══════════════════════════════════════════════════════════════════════════════
// ALBUMS
// ══════════════════════════════════════════════════════════════════════════════

// GET all published albums
app.get("/api/albums", optionalAuth, (req,res)=>{
  const visibleUser=req.user;
  const userId=visibleUser?.id;
  const albums=readJSON(ALBUMS_FILE)
    .filter((a)=>canViewAlbum(a, visibleUser))
    .sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  const result=albums.map(a=>({
    ...a,
    coverUrl: a.coverFile?`/uploads/covers/${a.coverFile}`:null,
    tracks: getAlbumVisibleTracks(a.id, visibleUser),
    likesCount: (a.likedBy||[]).length,
    likedByMe: userId?(a.likedBy||[]).includes(userId):false,
    isOwner: userId===a.artistId,
  }));
  res.json(result);
});

// GET single album
app.get("/api/albums/:id", optionalAuth, (req,res)=>{
  const visibleUser=req.user;
  const userId=visibleUser?.id;
  const albums=readJSON(ALBUMS_FILE);
  const album=albums.find(a=>a.id===req.params.id);
  if (!album || !canViewAlbum(album, visibleUser)) return res.status(404).json({error:"Album not found"});
  const tracks=getAlbumVisibleTracks(album.id, visibleUser);
  res.json({...album,
    coverUrl: album.coverFile?`/uploads/covers/${album.coverFile}`:null,
    tracks,
    likesCount:(album.likedBy||[]).length,
    likedByMe:userId?(album.likedBy||[]).includes(userId):false,
    isOwner:userId===album.artistId,
  });
});

// POST create album (artist or artist_pro or admin)
app.post("/api/albums", auth, upload.single("cover"), (req,res)=>{
  const users=readJSON(USERS_FILE);
  const me=users.find(u=>u.id===req.user.id);
  if (!canManageMusic(me))
    return res.status(403).json({error:"Only artists can create albums"});
  const {title,description,genre}=req.body;
  if (!title) return res.status(400).json({error:"Title required"});
  const album={
    id:uuidv4(),title:title.trim(),
    description:description?.trim()||null,
    genre:genre?.trim()||null,
    artistId:me.id, artist:me.username,
    coverFile:req.file?.filename||null,
    status: me.role==="admin"?"published":"pending",
    likedBy:[],
    createdAt:new Date().toISOString(),
  };
  const albums=readJSON(ALBUMS_FILE);
  albums.push(album);
  writeJSON(ALBUMS_FILE,albums);
  if (album.status==="pending")
    notifyAdmins(`New album submitted: "${album.title}" by ${album.artist}`,{type:"pending_album",albumId:album.id});
  res.json({success:true,album:{...album,coverUrl:album.coverFile?`/uploads/covers/${album.coverFile}`:null}});
});

// PUT update album (owner or admin)
app.put("/api/albums/:id", auth, upload.single("cover"), (req,res)=>{
  const albums=readJSON(ALBUMS_FILE);
  const idx=albums.findIndex(a=>a.id===req.params.id);
  if (idx===-1) return res.status(404).json({error:"Album not found"});
  if (albums[idx].artistId!==req.user.id&&req.user.role!=="admin")
    return res.status(403).json({error:"Not your album"});
  const {title,description,genre}=req.body;
  if (title)       albums[idx].title=title.trim();
  if (description!==undefined) albums[idx].description=description.trim()||null;
  if (genre!==undefined) albums[idx].genre=genre.trim()||null;
  if (req.file){
    if(albums[idx].coverFile){const old=path.join(COVERS_DIR,albums[idx].coverFile);if(fs.existsSync(old))fs.unlinkSync(old);}
    albums[idx].coverFile=req.file.filename;
  }
  writeJSON(ALBUMS_FILE,albums);
  res.json({success:true});
});

// DELETE album (owner or admin)
app.delete("/api/albums/:id", auth, (req,res)=>{
  let albums=readJSON(ALBUMS_FILE);
  const album=albums.find(a=>a.id===req.params.id);
  if (!album) return res.status(404).json({error:"Album not found"});
  if (album.artistId!==req.user.id&&req.user.role!=="admin")
    return res.status(403).json({error:"Not your album"});
  if (album.coverFile){const f=path.join(COVERS_DIR,album.coverFile);if(fs.existsSync(f))fs.unlinkSync(f);}
  // Detach tracks from album
  const tracks=readJSON(TRACKS_FILE);
  tracks.forEach(t=>{if(t.albumId===album.id)t.albumId=null;});
  writeJSON(TRACKS_FILE,tracks);
  writeJSON(ALBUMS_FILE,albums.filter(a=>a.id!==req.params.id));
  res.json({success:true});
});

// POST like/unlike album
app.post("/api/albums/:id/like", auth, (req,res)=>{
  const albums=readJSON(ALBUMS_FILE);
  const album=albums.find(a=>a.id===req.params.id);
  if (!album) return res.status(404).json({error:"Album not found"});
  album.likedBy=album.likedBy||[];
  const idx=album.likedBy.indexOf(req.user.id);
  idx===-1?album.likedBy.push(req.user.id):album.likedBy.splice(idx,1);
  writeJSON(ALBUMS_FILE,albums);
  res.json({likesCount:album.likedBy.length,likedByMe:idx===-1});
});

app.get("/api/albums/:id/available-tracks", auth, (req,res)=>{
  const albums=readJSON(ALBUMS_FILE);
  const album=albums.find(a=>a.id===req.params.id);
  if (!album) return res.status(404).json({error:"Album not found"});
  if (album.artistId!==req.user.id&&req.user.role!=="admin")
    return res.status(403).json({error:"Not your album"});

  const tracks=readJSON(TRACKS_FILE)
    .filter((t)=>t.artistId===album.artistId)
    .filter((t)=>t.status!=="rejected")
    .filter((t)=>!t.albumId || t.albumId===album.id)
    .sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))
    .map((t)=>mapTrack(t, req.user.id));

  res.json(tracks);
});

// POST add track to album (owner or admin)
app.post("/api/albums/:id/tracks", auth, (req,res)=>{
  const {trackId}=req.body;
  if (!trackId) return res.status(400).json({error:"trackId required"});
  const albums=readJSON(ALBUMS_FILE);
  const album=albums.find(a=>a.id===req.params.id);
  if (!album) return res.status(404).json({error:"Album not found"});
  if (album.artistId!==req.user.id&&req.user.role!=="admin")
    return res.status(403).json({error:"Not your album"});
  const tracks=readJSON(TRACKS_FILE);
  const track=tracks.find(t=>t.id===trackId);
  if (!track) return res.status(404).json({error:"Track not found"});
  if (track.artistId!==album.artistId&&req.user.role!=="admin")
    return res.status(403).json({error:"You can only add your own tracks"});
  if (track.status==="rejected")
    return res.status(400).json({error:"Rejected tracks cannot be added to albums"});
  if (track.albumId&&track.albumId!==album.id)
    return res.status(400).json({error:"Track is already attached to another album"});
  track.albumId=album.id;
  writeJSON(TRACKS_FILE,tracks);
  res.json({success:true, track: mapTrack(track, req.user.id)});
});

// DELETE remove track from album
app.delete("/api/albums/:id/tracks/:trackId", auth, (req,res)=>{
  const albums=readJSON(ALBUMS_FILE);
  const album=albums.find(a=>a.id===req.params.id);
  if (!album) return res.status(404).json({error:"Album not found"});
  if (album.artistId!==req.user.id&&req.user.role!=="admin")
    return res.status(403).json({error:"Not your album"});
  const tracks=readJSON(TRACKS_FILE);
  const track=tracks.find(t=>t.id===req.params.trackId);
  if (!track || track.albumId!==album.id) return res.status(404).json({error:"Track not found in album"});
  if (track.artistId!==album.artistId&&req.user.role!=="admin")
    return res.status(403).json({error:"You can only remove your own tracks"});
  track.albumId=null;
  writeJSON(TRACKS_FILE,tracks);
  res.json({success:true});
});

// Admin: get all albums
app.get("/api/admin/albums", adminAuth, (req,res)=>{
  const tracks=readJSON(TRACKS_FILE);
  res.json(readJSON(ALBUMS_FILE).map(a=>({...a,
    coverUrl:a.coverFile?`/uploads/covers/${a.coverFile}`:null,
    trackCount:tracks.filter(t=>t.albumId===a.id).length,
    likesCount:(a.likedBy||[]).length,
  })));
});

// Admin: approve/reject album
app.post("/api/admin/albums/:id/approve", adminAuth, (req,res)=>{
  const albums=readJSON(ALBUMS_FILE);
  const album=albums.find(a=>a.id===req.params.id);
  if (!album) return res.status(404).json({error:"Album not found"});
  album.status="published"; writeJSON(ALBUMS_FILE,albums);
  if (album.artistId) pushNotification(album.artistId,`Your album "${album.title}" was approved ✓`,{type:"approved_album",albumId:album.id});
  res.json({success:true});
});
app.post("/api/admin/albums/:id/reject", adminAuth, (req,res)=>{
  const albums=readJSON(ALBUMS_FILE);
  const album=albums.find(a=>a.id===req.params.id);
  if (!album) return res.status(404).json({error:"Album not found"});
  album.status="rejected"; album.rejectReason=req.body.reason||null; writeJSON(ALBUMS_FILE,albums);
  if (album.artistId){
    const msg=album.rejectReason?`Your album "${album.title}" was rejected. Reason: ${album.rejectReason}`:`Your album "${album.title}" was rejected.`;
    pushNotification(album.artistId,msg,{type:"rejected_album",albumId:album.id});
  }
  res.json({success:true});
});

// PLAYLISTS
app.get("/api/playlists", auth, (req,res)=>{
  const playlists=readJSON(PLAYLISTS_FILE)
    .filter((p)=>p.ownerId===req.user.id)
    .sort((a,b)=>new Date(b.updatedAt||b.createdAt)-new Date(a.updatedAt||a.createdAt));
  const tracks=readJSON(TRACKS_FILE);
  res.json(playlists.map((playlist)=>({
    ...playlist,
    coverUrl: playlist.coverFile ? `/uploads/covers/${playlist.coverFile}` : null,
    tracks:(playlist.trackIds||[])
      .map((trackId)=>tracks.find((t)=>t.id===trackId))
      .filter(Boolean)
      .filter((track)=>track.status==="published"||track.artistId===req.user.id||req.user.role==="admin")
      .map((track)=>mapTrack(track, req.user.id)),
  })));
});

app.post("/api/playlists", auth, upload.single("cover"), (req,res)=>{
  const name=String(req.body.name||"").trim();
  const description=String(req.body.description||"").trim();
  if (!name) return res.status(400).json({error:"Playlist name required"});
  const playlists=readJSON(PLAYLISTS_FILE);
  const playlist={ id:uuidv4(), ownerId:req.user.id, name, description:description||null,
    coverFile: req.file?.filename || null,
    trackIds:[], createdAt:new Date().toISOString(), updatedAt:new Date().toISOString() };
  playlists.push(playlist);
  writeJSON(PLAYLISTS_FILE, playlists);
  res.json({ success:true, playlist:{...playlist,
    coverUrl: playlist.coverFile ? `/uploads/covers/${playlist.coverFile}` : null,
    tracks:[] } });
});

// PUT /api/playlists/:id — update name, description, cover
app.put("/api/playlists/:id", auth, upload.single("cover"), (req,res)=>{
  const playlists=readJSON(PLAYLISTS_FILE);
  const playlist=playlists.find((p)=>p.id===req.params.id);
  if (!playlist) return res.status(404).json({error:"Playlist not found"});
  if (playlist.ownerId!==req.user.id && req.user.role!=="admin") return res.status(403).json({error:"Forbidden"});
  if (req.body.name) playlist.name = String(req.body.name).trim();
  if (req.body.description !== undefined) playlist.description = String(req.body.description).trim()||null;
  if (req.file) {
    if (playlist.coverFile) { try { fs.unlinkSync(path.join(COVERS_DIR, playlist.coverFile)); } catch {} }
    playlist.coverFile = req.file.filename;
  }
  playlist.updatedAt = new Date().toISOString();
  writeJSON(PLAYLISTS_FILE, playlists);
  const tracks=readJSON(TRACKS_FILE);
  res.json({ success:true, playlist:{...playlist,
    coverUrl: playlist.coverFile ? `/uploads/covers/${playlist.coverFile}` : null,
    tracks:(playlist.trackIds||[]).map(id=>tracks.find(t=>t.id===id)).filter(Boolean).map(t=>mapTrack(t,req.user.id))
  }});
});

app.delete("/api/playlists/:id", auth, (req,res)=>{
  const playlists=readJSON(PLAYLISTS_FILE);
  const playlist=playlists.find((p)=>p.id===req.params.id);
  if (!playlist) return res.status(404).json({error:"Playlist not found"});
  if (playlist.ownerId!==req.user.id && req.user.role!=="admin") return res.status(403).json({error:"Forbidden"});
  writeJSON(PLAYLISTS_FILE, playlists.filter((p)=>p.id!==playlist.id));
  res.json({success:true});
});

app.post("/api/playlists/:id/tracks", auth, (req,res)=>{
  const { trackId } = req.body;
  if (!trackId) return res.status(400).json({error:"trackId required"});
  const playlists=readJSON(PLAYLISTS_FILE);
  const playlist=playlists.find((p)=>p.id===req.params.id);
  if (!playlist) return res.status(404).json({error:"Playlist not found"});
  if (playlist.ownerId!==req.user.id && req.user.role!=="admin") return res.status(403).json({error:"Forbidden"});
  const tracks=readJSON(TRACKS_FILE);
  const track=tracks.find((t)=>t.id===trackId);
  if (!track) return res.status(404).json({error:"Track not found"});
  const canUseTrack = track.status === "published" || track.artistId===req.user.id || req.user.role==="admin";
  if (!canUseTrack) return res.status(403).json({error:"Track is not available for playlists yet"});
  playlist.trackIds = playlist.trackIds || [];
  if (!playlist.trackIds.includes(trackId)) playlist.trackIds.push(trackId);
  playlist.updatedAt = new Date().toISOString();
  writeJSON(PLAYLISTS_FILE, playlists);
  res.json({ success:true, playlist:{...playlist, tracks: playlist.trackIds.map((id)=>tracks.find((t)=>t.id===id)).filter(Boolean).map((t)=>mapTrack(t, req.user.id))} });
});

app.delete("/api/playlists/:id/tracks/:trackId", auth, (req,res)=>{
  const playlists=readJSON(PLAYLISTS_FILE);
  const playlist=playlists.find((p)=>p.id===req.params.id);
  if (!playlist) return res.status(404).json({error:"Playlist not found"});
  if (playlist.ownerId!==req.user.id && req.user.role!=="admin") return res.status(403).json({error:"Forbidden"});
  playlist.trackIds = (playlist.trackIds || []).filter((id)=>id!==req.params.trackId);
  playlist.updatedAt = new Date().toISOString();
  writeJSON(PLAYLISTS_FILE, playlists);
  res.json({success:true});
});

// Include albums in search
// ── Health check (used by Docker) ─────────────────────────────────────────────
app.get("/api/health", (req, res) => res.json({ ok: true, uptime: process.uptime() }));

// ══════════════════════════════════════════════════════════════════════════════
// SEARCH — GET /api/search?q=...
// Returns { tracks: [], artists: [] } matching the query
// ══════════════════════════════════════════════════════════════════════════════
app.get("/api/search", optionalAuth, (req, res) => {
  const q = (req.query.q || "").toLowerCase().trim();
  if (!q) return res.json({ tracks: [], artists: [], albums: [] });

  const userId = req.user?.id;

  // ── Tracks ────────────────────────────────────────────────────────────────
  const allTracks = readJSON(TRACKS_FILE).filter(t => t.status === "published");
  const tracks = allTracks
    .filter(t =>
      t.title.toLowerCase().includes(q)  ||
      t.artist.toLowerCase().includes(q) ||
      getFeaturingText(t.featuring || []).some((name) => name.toLowerCase().includes(q)) ||
      (t.genre || "").toLowerCase().includes(q) ||
      (t.description || "").toLowerCase().includes(q)
    )
    .map(t => mapTrack(t, userId));

  // ── Artists ───────────────────────────────────────────────────────────────
  const allUsers = readJSON(USERS_FILE);
  const artists = allUsers
    .filter(u =>
      ["artist", "artist_pro"].includes(u.accountType) &&
      (u.username.toLowerCase().includes(q) ||
       (u.bio || "").toLowerCase().includes(q))
    )
    .map(u => ({
      id:            u.id,
      username:      u.username,
      accountType:   u.accountType,
      bio:           u.bio || "",
      avatarUrl:     u.avatarFile ? `/uploads/avatars/${u.avatarFile}` : null,
      followersCount: (u.followers || []).length,
      isFollowedByMe: userId ? (u.followers || []).includes(userId) : false,
      trackCount:    allTracks.filter(t => t.artistId === u.id).length,
    }));

  // Albums search
  const allAlbums = readJSON(ALBUMS_FILE).filter(a=>a.status==="published");
  const albums = allAlbums
    .filter(a=>a.title.toLowerCase().includes(q)||a.artist.toLowerCase().includes(q)||(a.genre||"").toLowerCase().includes(q))
    .map(a=>({...a, coverUrl:a.coverFile?`/uploads/covers/${a.coverFile}`:null, likesCount:(a.likedBy||[]).length}));

  res.json({ tracks, artists, albums });
});

// ── Static files + SPA fallback — MUST be AFTER all /api routes ─────────────

// ══════════════════════════════════════════════════════════════════════════════
// COMMENTS — /api/tracks/:id/comments
// comments are stored inline on the track object: track.comments = [{id, userId, username, avatarUrl, text, time, createdAt}]
// ══════════════════════════════════════════════════════════════════════════════
app.get("/api/tracks/:id/comments", optionalAuth, (req, res) => {
  const tracks = readJSON(TRACKS_FILE);
  const track = tracks.find((t) => t.id === req.params.id);
  if (!track) return res.status(404).json({ error: "Track not found" });
  const users = readJSON(USERS_FILE);
  const comments = (track.comments || []).map((c) => {
    const u = users.find((u) => u.id === c.userId);
    return {
      ...c,
      username: u?.username || c.username || "Unknown",
      avatarUrl: u?.avatarFile ? `/uploads/avatars/${u.avatarFile}` : null,
    };
  });
  res.json(comments);
});

app.post("/api/tracks/:id/comments", auth, (req, res) => {
  const { text, time } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: "text required" });
  const parsedTime = parseFloat(time);
  if (isNaN(parsedTime) || parsedTime < 0) return res.status(400).json({ error: "valid time required" });

  const tracks = readJSON(TRACKS_FILE);
  const track = tracks.find((t) => t.id === req.params.id);
  if (!track) return res.status(404).json({ error: "Track not found" });

  const users = readJSON(USERS_FILE);
  const me = users.find((u) => u.id === req.user.id);

  const comment = {
    id: uuidv4(),
    userId: req.user.id,
    username: me?.username || "Unknown",
    text: text.trim().slice(0, 300),
    time: parsedTime,
    createdAt: new Date().toISOString(),
  };
  track.comments = track.comments || [];
  track.comments.push(comment);
  writeJSON(TRACKS_FILE, tracks);

  res.json({
    ...comment,
    avatarUrl: me?.avatarFile ? `/uploads/avatars/${me.avatarFile}` : null,
  });
});

app.delete("/api/tracks/:id/comments/:commentId", auth, (req, res) => {
  const tracks = readJSON(TRACKS_FILE);
  const track = tracks.find((t) => t.id === req.params.id);
  if (!track) return res.status(404).json({ error: "Track not found" });

  const comment = (track.comments || []).find((c) => c.id === req.params.commentId);
  if (!comment) return res.status(404).json({ error: "Comment not found" });

  const users = readJSON(USERS_FILE);
  const me = users.find((u) => u.id === req.user.id);
  if (comment.userId !== req.user.id && me?.role !== "admin") {
    return res.status(403).json({ error: "Forbidden" });
  }

  track.comments = track.comments.filter((c) => c.id !== req.params.commentId);
  writeJSON(TRACKS_FILE, tracks);
  res.json({ ok: true });
});

// ══════════════════════════════════════════════════════════════════════════════
// DAILY PLAYLIST — GET /api/daily-playlist
// Deterministic 20-track playlist seeded by today date. Same for all users all day.
// ══════════════════════════════════════════════════════════════════════════════
app.get("/api/daily-playlist", optionalAuth, (req, res) => {
  const userId = req.user?.id;
  const tracks = readJSON(TRACKS_FILE).filter(t => t.status === "published");
  if (!tracks.length) return res.json({ tracks: [], date: null });

  const today = new Date().toISOString().slice(0, 10);
  let seed = today.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  function seededRandom() {
    seed = (seed + 0x6D2B79F5) >>> 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) >>> 0;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
  const shuffled = [...tracks];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(seededRandom() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const daily = shuffled.slice(0, Math.min(20, shuffled.length)).map(t => mapTrack(t, userId));
  res.json({ tracks: daily, date: today });
});


// ══════════════════════════════════════════════════════════════════════════════
// POSTS — /api/posts  (artist social feed)
// Structure: { id, authorId, text, images:[], pinnedTrackId, likedBy:[], comments:[], createdAt }
// ══════════════════════════════════════════════════════════════════════════════

function mapPost(p, userId, tracks, users) {
  const author = users.find(u => u.id === p.authorId) || {};
  const pinnedTrack = p.pinnedTrackId ? tracks.find(t => t.id === p.pinnedTrackId) : null;
  return {
    id: p.id,
    authorId: p.authorId,
    authorUsername: author.username || 'Unknown',
    authorAvatarUrl: author.avatarFile ? `/uploads/avatars/${author.avatarFile}` : null,
    authorAccountType: author.accountType || 'listener',
    text: p.text || '',
    images: (p.images || []).map(f => `/uploads/posts/${f}`),
    pinnedTrack: pinnedTrack ? {
      id: pinnedTrack.id,
      title: pinnedTrack.title,
      artist: pinnedTrack.artist,
      coverUrl: pinnedTrack.coverFile ? `/uploads/covers/${pinnedTrack.coverFile}` : null,
      audioUrl: `/api/stream/${pinnedTrack.id}`,
    } : null,
    likesCount: (p.likedBy || []).length,
    likedByMe: userId ? (p.likedBy || []).includes(userId) : false,
    commentsCount: (p.comments || []).length,
    comments: (p.comments || []).map(c => {
      const cu = users.find(u => u.id === c.userId) || {};
      return { ...c, username: cu.username || c.username || 'Unknown', avatarUrl: cu.avatarFile ? `/uploads/avatars/${cu.avatarFile}` : null };
    }),
    createdAt: p.createdAt,
  };
}

// GET /api/posts?username=... — posts for a specific artist profile
app.get('/api/posts', optionalAuth, (req, res) => {
  const { username } = req.query;
  const userId = req.user?.id;
  const posts = readJSON(POSTS_FILE);
  const users = readJSON(USERS_FILE);
  const tracks = readJSON(TRACKS_FILE);

  let filtered = posts;
  if (username) {
    const author = users.find(u => u.username.toLowerCase() === username.toLowerCase());
    if (!author) return res.json([]);
    filtered = posts.filter(p => p.authorId === author.id);
  }

  const result = filtered
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map(p => mapPost(p, userId, tracks, users));
  res.json(result);
});

// POST /api/posts — create post (artist only)
app.post('/api/posts', auth, upload.array('postImage', 4), (req, res) => {
  const users = readJSON(USERS_FILE);
  const me = users.find(u => u.id === req.user.id);
  if (!me || (!['artist', 'artist_pro'].includes(me.accountType) && me.role !== 'admin')) {
    return res.status(403).json({ error: 'Only artists can post' });
  }

  const { text, pinnedTrackId } = req.body;
  if (!text?.trim() && !req.files?.length) {
    return res.status(400).json({ error: 'Post must have text or images' });
  }
  if (text && text.length > 1000) {
    return res.status(400).json({ error: 'Text too long (max 1000)' });
  }

  // Validate pinnedTrackId belongs to this user
  let validPinnedTrackId = null;
  if (pinnedTrackId) {
    const tracks = readJSON(TRACKS_FILE);
    const track = tracks.find(t => t.id === pinnedTrackId && t.artistId === me.id && t.status === 'published');
    if (track) validPinnedTrackId = track.id;
  }

  const post = {
    id: uuidv4(),
    authorId: me.id,
    text: (text || '').trim().slice(0, 1000),
    images: (req.files || []).map(f => f.filename),
    pinnedTrackId: validPinnedTrackId,
    likedBy: [],
    comments: [],
    createdAt: new Date().toISOString(),
  };

  const posts = readJSON(POSTS_FILE);
  posts.unshift(post);
  writeJSON(POSTS_FILE, posts);

  const tracks = readJSON(TRACKS_FILE);
  res.json(mapPost(post, me.id, tracks, users));
});

// DELETE /api/posts/:id
app.delete('/api/posts/:id', auth, (req, res) => {
  const posts = readJSON(POSTS_FILE);
  const post = posts.find(p => p.id === req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });

  const users = readJSON(USERS_FILE);
  const me = users.find(u => u.id === req.user.id);
  if (post.authorId !== req.user.id && me?.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  // Delete image files
  (post.images || []).forEach(filename => {
    try { require('fs').unlinkSync(require('path').join(POSTS_DIR, filename)); } catch {}
  });

  writeJSON(POSTS_FILE, posts.filter(p => p.id !== req.params.id));
  res.json({ ok: true });
});

// POST /api/posts/:id/like
app.post('/api/posts/:id/like', auth, (req, res) => {
  const posts = readJSON(POSTS_FILE);
  const post = posts.find(p => p.id === req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });

  post.likedBy = post.likedBy || [];
  const idx = post.likedBy.indexOf(req.user.id);
  idx === -1 ? post.likedBy.push(req.user.id) : post.likedBy.splice(idx, 1);
  writeJSON(POSTS_FILE, posts);
  res.json({ likesCount: post.likedBy.length, likedByMe: idx === -1 });
});

// GET /api/posts/:id/comments
app.get('/api/posts/:id/comments', optionalAuth, (req, res) => {
  const posts = readJSON(POSTS_FILE);
  const post = posts.find(p => p.id === req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });

  const users = readJSON(USERS_FILE);
  const comments = (post.comments || []).map(c => {
    const u = users.find(u => u.id === c.userId) || {};
    return { ...c, username: u.username || c.username || 'Unknown', avatarUrl: u.avatarFile ? `/uploads/avatars/${u.avatarFile}` : null };
  });
  res.json(comments);
});

// POST /api/posts/:id/comments
app.post('/api/posts/:id/comments', auth, (req, res) => {
  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: 'text required' });

  const posts = readJSON(POSTS_FILE);
  const post = posts.find(p => p.id === req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });

  const users = readJSON(USERS_FILE);
  const me = users.find(u => u.id === req.user.id);

  const comment = {
    id: uuidv4(),
    userId: req.user.id,
    username: me?.username || 'Unknown',
    text: text.trim().slice(0, 500),
    createdAt: new Date().toISOString(),
  };
  post.comments = post.comments || [];
  post.comments.push(comment);
  writeJSON(POSTS_FILE, posts);

  res.json({ ...comment, avatarUrl: me?.avatarFile ? `/uploads/avatars/${me.avatarFile}` : null });
});

// DELETE /api/posts/:id/comments/:commentId
app.delete('/api/posts/:id/comments/:commentId', auth, (req, res) => {
  const posts = readJSON(POSTS_FILE);
  const post = posts.find(p => p.id === req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });

  const comment = (post.comments || []).find(c => c.id === req.params.commentId);
  if (!comment) return res.status(404).json({ error: 'Comment not found' });

  const users = readJSON(USERS_FILE);
  const me = users.find(u => u.id === req.user.id);
  if (comment.userId !== req.user.id && me?.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  post.comments = post.comments.filter(c => c.id !== req.params.commentId);
  writeJSON(POSTS_FILE, posts);
  res.json({ ok: true });
});


// ══════════════════════════════════════════════════════════════════════════════
// ACTIVITY FEED 2.0 — GET /api/feed
// Mixed stream: posts + new tracks + reposts from followed artists
// ══════════════════════════════════════════════════════════════════════════════
app.get('/api/feed', auth, (req, res) => {
  const userId = req.user.id;
  const limit = Math.min(parseInt(req.query.limit) || 20, 50);
  const before = req.query.before ? new Date(req.query.before) : null;

  const users = readJSON(USERS_FILE);
  const me = users.find(u => u.id === userId);
  const followedIds = new Set(me?.following || []);
  if (!followedIds.size) return res.json({ items: [], hasMore: false });

  const tracks = readJSON(TRACKS_FILE).filter(t => t.status === 'published');
  const posts = readJSON(POSTS_FILE);

  const items = [];

  // Posts from followed artists
  posts.forEach(p => {
    if (!followedIds.has(p.authorId)) return;
    const author = users.find(u => u.id === p.authorId) || {};
    const pinnedTrack = p.pinnedTrackId ? tracks.find(t => t.id === p.pinnedTrackId) : null;
    items.push({
      type: 'post',
      id: p.id,
      createdAt: p.createdAt,
      author: {
        id: author.id,
        username: author.username,
        avatarUrl: author.avatarFile ? `/uploads/avatars/${author.avatarFile}` : null,
        accountType: author.accountType,
      },
      post: {
        id: p.id,
        text: p.text || '',
        images: (p.images || []).map(f => `/uploads/posts/${f}`),
        likesCount: (p.likedBy || []).length,
        likedByMe: (p.likedBy || []).includes(userId),
        commentsCount: (p.comments || []).length,
        pinnedTrack: pinnedTrack ? {
          id: pinnedTrack.id, title: pinnedTrack.title, artist: pinnedTrack.artist,
          coverUrl: pinnedTrack.coverFile ? `/uploads/covers/${pinnedTrack.coverFile}` : null,
          audioUrl: `/api/stream/${pinnedTrack.id}`,
        } : null,
      },
    });
  });

  // New tracks from followed artists (last 30 days)
  const cutoff = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  tracks.forEach(t => {
    if (!t.artistId || !followedIds.has(t.artistId)) return;
    if (new Date(t.createdAt) < cutoff) return;
    items.push({
      type: 'track',
      id: `track_${t.id}`,
      createdAt: t.createdAt,
      author: (() => {
        const a = users.find(u => u.id === t.artistId) || {};
        return { id: a.id, username: a.username, avatarUrl: a.avatarFile ? `/uploads/avatars/${a.avatarFile}` : null, accountType: a.accountType };
      })(),
      track: mapTrack(t, userId),
    });
  });

  // Reposts from followed users
  tracks.forEach(t => {
    (t.repostedBy || []).forEach(reposterid => {
      if (!followedIds.has(reposterid)) return;
      // Find when they reposted — we don't store timestamp, use track createdAt as approx
      const reposter = users.find(u => u.id === reposterid) || {};
      items.push({
        type: 'repost',
        id: `repost_${reposterid}_${t.id}`,
        createdAt: t.createdAt, // approximate
        author: {
          id: reposter.id, username: reposter.username,
          avatarUrl: reposter.avatarFile ? `/uploads/avatars/${reposter.avatarFile}` : null,
          accountType: reposter.accountType,
        },
        track: mapTrack(t, userId),
      });
    });
  });

  // Sort by date desc, filter by before cursor, paginate
  items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const filtered = before ? items.filter(i => new Date(i.createdAt) < before) : items;
  const page = filtered.slice(0, limit);

  res.json({ items: page, hasMore: filtered.length > limit });
});

// ══════════════════════════════════════════════════════════════════════════════
// DROPS — /api/drops
// Drop = upcoming release announcement with countdown
// { id, artistId, title, description, coverFile, releaseAt, linkedTrackId, createdAt }
// ══════════════════════════════════════════════════════════════════════════════

function mapDrop(d, userId, users, tracks) {
  const artist = users.find(u => u.id === d.artistId) || {};
  const linked = d.linkedTrackId ? tracks.find(t => t.id === d.linkedTrackId) : null;
  const now = Date.now();
  const releaseMs = new Date(d.releaseAt).getTime();
  const msLeft = releaseMs - now;
  return {
    id: d.id,
    artistId: d.artistId,
    artistUsername: artist.username || 'Unknown',
    artistAvatarUrl: artist.avatarFile ? `/uploads/avatars/${artist.avatarFile}` : null,
    title: d.title,
    description: d.description || '',
    coverUrl: d.coverFile ? `/uploads/covers/${d.coverFile}` : null,
    releaseAt: d.releaseAt,
    isReleased: msLeft <= 0,
    msLeft: Math.max(0, msLeft),
    linkedTrack: linked ? mapTrack(linked, userId) : null,
    createdAt: d.createdAt,
  };
}

// GET /api/drops — all active drops (upcoming + recently released)
app.get('/api/drops', optionalAuth, (req, res) => {
  const userId = req.user?.id;
  const drops = readJSON(DROPS_FILE);
  const users = readJSON(USERS_FILE);
  const tracks = readJSON(TRACKS_FILE);
  // Show drops from last 7 days + all upcoming
  const cutoff = new Date(Date.now() - 1 * 24 * 3600 * 1000);
  const active = drops
    .filter(d => new Date(d.releaseAt) >= cutoff)
    .sort((a, b) => new Date(a.releaseAt) - new Date(b.releaseAt))
    .map(d => mapDrop(d, userId, users, tracks));
  res.json(active);
});

// GET /api/drops/artist/:username — drops for a specific artist
app.get('/api/drops/artist/:username', optionalAuth, (req, res) => {
  const userId = req.user?.id;
  const users = readJSON(USERS_FILE);
  const artist = users.find(u => u.username.toLowerCase() === req.params.username.toLowerCase());
  if (!artist) return res.json([]);
  const drops = readJSON(DROPS_FILE).filter(d => d.artistId === artist.id);
  const tracks = readJSON(TRACKS_FILE);
  res.json(drops.sort((a, b) => new Date(a.releaseAt) - new Date(b.releaseAt)).map(d => mapDrop(d, userId, users, tracks)));
});

// POST /api/drops — create drop (artist only)
app.post('/api/drops', auth, upload.single('cover'), (req, res) => {
  const users = readJSON(USERS_FILE);
  const me = users.find(u => u.id === req.user.id);
  if (!me || (!['artist', 'artist_pro'].includes(me.accountType) && me.role !== 'admin')) {
    return res.status(403).json({ error: 'Only artists can create drops' });
  }
  const { title, description, releaseAt, linkedTrackId } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: 'Title required' });
  if (!releaseAt || isNaN(new Date(releaseAt))) return res.status(400).json({ error: 'Valid release date required' });

  const drop = {
    id: uuidv4(),
    artistId: me.id,
    title: title.trim().slice(0, 100),
    description: (description || '').trim().slice(0, 500),
    coverFile: req.file?.filename || null,
    releaseAt: new Date(releaseAt).toISOString(),
    linkedTrackId: linkedTrackId || null,
    createdAt: new Date().toISOString(),
  };

  const drops = readJSON(DROPS_FILE);
  drops.unshift(drop);
  writeJSON(DROPS_FILE, drops);

  // Notify followers
  (me.followers || []).forEach(fid => {
    const releaseDate = new Date(releaseAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
    pushNotification(fid, `${me.username} анонсировал релиз «${drop.title}» — ${releaseDate}`, {
      type: 'drop', dropId: drop.id,
    });
  });

  const tracks = readJSON(TRACKS_FILE);
  res.json(mapDrop(drop, me.id, users, tracks));
});

// PUT /api/drops/:id — update drop (link track after release)
app.put('/api/drops/:id', auth, (req, res) => {
  const drops = readJSON(DROPS_FILE);
  const drop = drops.find(d => d.id === req.params.id);
  if (!drop) return res.status(404).json({ error: 'Drop not found' });
  if (drop.artistId !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

  const { linkedTrackId } = req.body;
  if (linkedTrackId !== undefined) drop.linkedTrackId = linkedTrackId || null;
  writeJSON(DROPS_FILE, drops);

  const users = readJSON(USERS_FILE);
  const tracks = readJSON(TRACKS_FILE);
  res.json(mapDrop(drop, req.user.id, users, tracks));
});

// DELETE /api/drops/:id
app.delete('/api/drops/:id', auth, (req, res) => {
  const drops = readJSON(DROPS_FILE);
  const drop = drops.find(d => d.id === req.params.id);
  if (!drop) return res.status(404).json({ error: 'Drop not found' });
  const users = readJSON(USERS_FILE);
  const me = users.find(u => u.id === req.user.id);
  if (drop.artistId !== req.user.id && me?.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  writeJSON(DROPS_FILE, drops.filter(d => d.id !== req.params.id));
  res.json({ ok: true });
});

if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get("*", (req, res) => res.sendFile(path.join(distDir, "index.html")));
}

app.listen(PORT, ()=>{
  console.log("\n🎵  MyCloud running on http://localhost:"+PORT);
  console.log("   /api/stream/:id  — HTTP Range streaming");
  console.log("   /api/waveform/:id — pre-generated waveform JSON");
  console.log("   /api/tracks       — track catalogue\n");
});
