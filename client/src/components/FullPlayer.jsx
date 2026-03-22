import { useRef, useEffect, useState, useCallback, useLayoutEffect } from "react";
import { Link } from "react-router-dom";
import { usePlayer } from "../context/PlayerContext";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { api } from "../api";
import { formatArtistLine } from "../utils/trackArtists";
import styles from "./FullPlayer.module.css";

const PLACEHOLDER = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400'%3E%3Crect width='400' height='400' fill='%23222'/%3E%3Ccircle cx='200' cy='200' r='80' fill='%23333'/%3E%3Ccircle cx='200' cy='200' r='28' fill='%23444'/%3E%3C/svg%3E`;
const AVATAR_PH = (n) => `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='28' height='28'%3E%3Crect width='28' height='28' fill='%23333' rx='14'/%3E%3Ctext x='14' y='19' text-anchor='middle' font-size='12' font-family='sans-serif' fill='%23888'%3E${encodeURIComponent((n||"?")[0].toUpperCase())}%3C/text%3E%3C/svg%3E`;

function fmt(s) {
  if (!s || isNaN(s)) return "0:00";
  return `${Math.floor(s/60)}:${Math.floor(s%60).toString().padStart(2,"0")}`;
}

function RepeatIcon({ mode }) {
  return (
    <span className={styles.repeatWrap}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
        <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/>
        <polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
      </svg>
      {mode === 2 && <span className={styles.repeatOne}>1</span>}
    </span>
  );
}

// Canvas waveform
function WaveformBars({ peaks, progress, width, height }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const W = width > 0 ? width : (canvas.offsetWidth || 800);
    const H = height || 80;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, W, H);

    const barW = 3, gap = 2, step = barW + gap;
    const count = Math.floor(W / step);

    if (!peaks.length) {
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.fillRect(0, H/2-2, W, 4);
      ctx.fillStyle = "#ff5500";
      ctx.fillRect(0, H/2-2, W * progress, 4);
      return;
    }

    for (let i = 0; i < count; i++) {
      // Map bar index to peaks array using interpolation — avoids empty bars
      const ratio = i / (count - 1);
      const peakPos = ratio * (peaks.length - 1);
      const lo = Math.floor(peakPos);
      const hi = Math.min(lo + 1, peaks.length - 1);
      const t = peakPos - lo;
      const amp = peaks[lo] * (1 - t) + peaks[hi] * t;

      const bh = Math.max(3, Math.abs(amp) * H * 0.92);
      const x = i * step;
      const y = (H - bh) / 2;
      ctx.fillStyle = ratio <= progress ? "#ff5500" : "rgba(255,255,255,0.18)";
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x, y, barW, bh, 1.5);
      else ctx.rect(x, y, barW, bh);
      ctx.fill();
    }
  }, [peaks, progress, width, height]);

  return <canvas ref={canvasRef} className={styles.waveCanvas} />;
}

export default function FullPlayer({ open, onClose }) {
  const {
    currentTrack, isPlaying, currentTime, duration, volume,
    isShuffle, repeatMode, togglePlay, seek, setVolume, skipNext, skipPrev,
    toggleShuffle, cycleRepeatMode, likeCurrentTrack, queue, skipToTrack,
  } = usePlayer();
  const { user } = useAuth();
  const toast = useToast();

  const seekBarRef = useRef(null);
  const volBarRef = useRef(null);
  const waveWrapRef = useRef(null);
  const commentInputRef = useRef(null);

  const [bgColor, setBgColor] = useState("#1a1a1a");
  const [repostedByMe, setRepostedByMe] = useState(false);
  const [repostCount, setRepostCount] = useState(0);
  const [draggingSeek, setDraggingSeek] = useState(false);
  const [draggingVol, setDraggingVol] = useState(false);
  const [hoverRatio, setHoverRatio] = useState(null);
  const [waveformPeaks, setWaveformPeaks] = useState([]);
  const [waveWidth, setWaveWidth] = useState(800);

  // Comments state
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);
  const [activeComment, setActiveComment] = useState(null);

  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  // Dominant color
  useEffect(() => {
    if (!currentTrack?.coverUrl) { setBgColor("#1a1a1a"); return; }
    const img = new Image(); img.crossOrigin = "anonymous"; img.src = currentTrack.coverUrl;
    img.onload = () => {
      try {
        const c = document.createElement("canvas"); c.width=4; c.height=4;
        const ctx = c.getContext("2d"); ctx.drawImage(img,0,0,4,4);
        const d = ctx.getImageData(0,0,4,4).data;
        let r=0,g=0,b=0;
        for (let i=0;i<d.length;i+=4){r+=d[i];g+=d[i+1];b+=d[i+2];}
        const n=d.length/4;
        setBgColor(`rgb(${Math.round(r/n*0.35)},${Math.round(g/n*0.35)},${Math.round(b/n*0.35)})`);
      } catch { setBgColor("#1a1a1a"); }
    };
    img.onerror = () => setBgColor("#1a1a1a");
  }, [currentTrack?.id]);

  // Waveform peaks
  useEffect(() => {
    if (!currentTrack?.waveformUrl) { setWaveformPeaks([]); return; }
    fetch(currentTrack.waveformUrl).then(r=>r.ok?r.json():null).then(d=>setWaveformPeaks(d?.samples||[])).catch(()=>setWaveformPeaks([]));
  }, [currentTrack?.id]);

  // Measure wave container width
  useLayoutEffect(() => {
    if (!waveWrapRef.current) return;
    const ro = new ResizeObserver(([e]) => setWaveWidth(e.contentRect.width));
    ro.observe(waveWrapRef.current);
    setWaveWidth(waveWrapRef.current.offsetWidth);
    return () => ro.disconnect();
  }, [open]);

  // Load comments
  useEffect(() => {
    if (!currentTrack?.id) return;
    api.getComments(currentTrack.id)
      .then(data => setComments(data.sort((a,b)=>a.time-b.time)))
      .catch(()=>{});
  }, [currentTrack?.id]);

  // Active comment highlight
  useEffect(() => {
    if (!comments.length || !duration) { setActiveComment(null); return; }
    const closest = comments
      .filter(c => Math.abs(c.time - currentTime) < 2)
      .sort((a,b) => Math.abs(a.time-currentTime) - Math.abs(b.time-currentTime))[0];
    setActiveComment(closest?.id || null);
  }, [currentTime, comments, duration]);

  useEffect(() => {
    setRepostedByMe(currentTrack?.repostedByMe || false);
    setRepostCount(currentTrack?.repostCount || 0);
  }, [currentTrack?.id]);

  // Seek
  const getRatio = useCallback((e) => {
    const rect = seekBarRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const x = e.touches?.[0]?.clientX ?? e.clientX;
    return Math.max(0, Math.min(1, (x - rect.left) / rect.width));
  }, []);

  const onSeekDown = useCallback((e) => {
    e.preventDefault();
    setDraggingSeek(true);
    const r = getRatio(e); if (r!==null){setHoverRatio(r);seek(r);}
  }, [getRatio, seek]);

  const onSeekMove = useCallback((e) => {
    const r = getRatio(e); if (r===null) return;
    setHoverRatio(r); if (draggingSeek) seek(r);
  }, [getRatio, draggingSeek, seek]);

  const onSeekUp = useCallback((e) => {
    if (draggingSeek){const r=getRatio(e);if(r!==null)seek(r);}
    setDraggingSeek(false); setHoverRatio(null);
  }, [draggingSeek, getRatio, seek]);

  // Volume
  const calcVol = useCallback((e) => {
    const rect = volBarRef.current?.getBoundingClientRect();
    if (!rect) return;
    setVolume(Math.max(0,Math.min(1,(( e.touches?.[0]?.clientX??e.clientX)-rect.left)/rect.width)));
  }, [setVolume]);

  useEffect(() => {
    if (!draggingVol) return;
    const up = ()=>setDraggingVol(false);
    window.addEventListener("pointermove", calcVol);
    window.addEventListener("pointerup", up);
    return ()=>{window.removeEventListener("pointermove",calcVol);window.removeEventListener("pointerup",up);};
  }, [draggingVol, calcVol]);

  const handleLike = () => {
    if (!user){toast("Sign in to like tracks","error");return;}
    likeCurrentTrack(r=>toast(r.likedByMe?"Added to liked ♥":"Removed from liked",r.likedByMe?"success":"info"));
  };

  const handleRepost = async () => {
    if (!user){toast("Sign in to repost","error");return;}
    try {
      const r = await api.repostTrack(currentTrack.id);
      setRepostedByMe(r.repostedByMe); setRepostCount(r.repostCount);
      toast(r.repostedByMe?"Reposted":"Repost removed","success");
    } catch {toast("Failed to repost","error");}
  };

  const handleCommentSubmit = async (e) => {
    e.preventDefault();
    if (!commentText.trim() || submittingComment) return;
    if (!user){toast("Sign in to comment","error");return;}
    setSubmittingComment(true);
    try {
      const c = await api.addComment(currentTrack.id, commentText.trim(), currentTime);
      setComments(prev=>[...prev,c].sort((a,b)=>a.time-b.time));
      setCommentText("");
    } catch(err){toast(err.message||"Failed to post","error");}
    finally{setSubmittingComment(false);}
  };

  const handleDeleteComment = async (commentId) => {
    try {
      await api.deleteComment(currentTrack.id, commentId);
      setComments(prev=>prev.filter(c=>c.id!==commentId));
    } catch {toast("Failed to delete","error");}
  };

  if (!open || !currentTrack) return null;

  const liked = currentTrack?.likedByMe;
  const progress = duration ? currentTime/duration : 0;
  const displayProgress = draggingSeek && hoverRatio!==null ? hoverRatio : progress;
  const currentIndex = queue?.findIndex(t=>t.id===currentTrack.id)??-1;
  const upNext = currentIndex>=0 ? queue.slice(currentIndex+1, currentIndex+5) : [];

  return (
    <div className={styles.overlay} onClick={(e)=>e.target===e.currentTarget&&onClose()}>
      <div className={styles.modal} style={{"--bg":bgColor}}>
        <div className={styles.bgGlow}/>

        {/* Header */}
        <div className={styles.header}>
          <button className={styles.closeBtn} onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="18" height="18"><path d="M19 9l-7 7-7-7"/></svg>
          </button>
          <span className={styles.headerLabel}>Now Playing</span>
          <div style={{width:36}}/>
        </div>

        {/* Body */}
        <div className={styles.body}>

          {/* LEFT */}
          <div className={styles.leftCol}>
            <div className={styles.coverWrap}>
              <img src={currentTrack.coverUrl||PLACEHOLDER} alt="cover" className={styles.cover}
                onError={e=>{e.currentTarget.src=PLACEHOLDER;}}/>
            </div>
            <div className={styles.coverMeta}>
              <h2 className={styles.trackTitle}>{currentTrack.title}</h2>
              <Link to={`/profile/${encodeURIComponent(currentTrack.artist)}`}
                className={styles.trackArtistLink} onClick={onClose}>
                {formatArtistLine(currentTrack)}
              </Link>
              {currentTrack.genre && <span className={styles.trackGenre}>{currentTrack.genre}</span>}
            </div>
            <div className={styles.coverActions}>
              <button className={`${styles.actionBtn} ${liked?styles.actionBtnOn:""}`} onClick={handleLike}>
                <svg viewBox="0 0 24 24" fill={liked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" width="15" height="15">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                </svg>
                <span>{currentTrack.likesCount||0}</span>
              </button>
              <button className={`${styles.actionBtn} ${isShuffle?styles.actionBtnAccent:""}`} onClick={toggleShuffle}>
                <span>Shuffle</span>
              </button>
              <button className={`${styles.actionBtn} ${repeatMode?styles.actionBtnAccent:""}`} onClick={cycleRepeatMode}>
                <RepeatIcon mode={repeatMode}/>
                <span>{repeatMode===2?"Track":repeatMode===1?"Queue":"Repeat"}</span>
              </button>
              <button className={`${styles.actionBtn} ${repostedByMe?styles.actionBtnRepost:""}`} onClick={handleRepost}>
                <span>{repostCount>0?repostCount:"Repost"}</span>
              </button>
            </div>
          </div>

          {/* RIGHT */}
          <div className={styles.rightCol}>

            {/* === WAVEFORM + COMMENTS OVERLAY === */}
            <div className={styles.waveSection}>
              <div className={styles.seekTimes}>
                <span>{fmt(draggingSeek&&hoverRatio!==null?hoverRatio*duration:currentTime)}</span>
                <span className={styles.seekDuration}>{fmt(duration)}</span>
              </div>

              {/* The waveform seek bar */}
              <div
                ref={(el)=>{ seekBarRef.current=el; waveWrapRef.current=el; }}
                className={`${styles.seekBar} ${draggingSeek?styles.seekBarActive:""}`}
                onPointerDown={onSeekDown}
                onPointerMove={onSeekMove}
                onPointerUp={onSeekUp}
                onPointerLeave={(e)=>{ if(!draggingSeek)setHoverRatio(null); else onSeekUp(e); }}
                style={{touchAction:"none",userSelect:"none"}}
              >
                <WaveformBars peaks={waveformPeaks} progress={displayProgress} width={waveWidth} height={80}/>
                {hoverRatio!==null && <div className={styles.seekHoverLine} style={{width:`${hoverRatio*100}%`}}/>}
                <div className={styles.seekThumb} style={{left:`${displayProgress*100}%`}}/>

                {/* Comment avatar dots on the waveform */}
                {duration>0 && comments.map(c=>(
                  <button
                    key={c.id}
                    className={`${styles.commentDot} ${activeComment===c.id?styles.commentDotActive:""}`}
                    style={{left:`${(c.time/duration)*100}%`}}
                    onPointerDown={e=>e.stopPropagation()}
                    onClick={e=>{e.stopPropagation();seek(c.time/duration);}}
                    title={`${c.username}: ${c.text} (${fmt(c.time)})`}
                  >
                    <img src={c.avatarUrl||AVATAR_PH(c.username)} alt={c.username} className={styles.commentDotImg}
                      onError={ev=>{ev.currentTarget.src=AVATAR_PH(c.username);}}/>
                    {activeComment===c.id && (
                      <div className={styles.commentBubble}>
                        <span className={styles.commentBubbleUser}>{c.username}</span>
                        <span className={styles.commentBubbleText}>{c.text}</span>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Comment input — directly under waveform, above controls */}
            {user ? (
              <form className={styles.commentForm} onSubmit={handleCommentSubmit}>
                <img src={user.avatarUrl||AVATAR_PH(user.username)} alt={user.username}
                  className={styles.commentFormAvatar}
                  onError={e=>{e.currentTarget.src=AVATAR_PH(user.username);}}/>
                <input
                  ref={commentInputRef}
                  className={styles.commentInput}
                  value={commentText}
                  onChange={e=>setCommentText(e.target.value)}
                  placeholder={`Комментарий на ${fmt(currentTime)}...`}
                  maxLength={300}
                  disabled={submittingComment}
                />
                <button className={styles.commentSubmit} type="submit"
                  disabled={!commentText.trim()||submittingComment}>
                  {submittingComment?"...":"↵"}
                </button>
              </form>
            ) : (
              <p className={styles.commentLoginHint}>
                <Link to="/login" className={styles.commentLoginLink} onClick={onClose}>Войдите</Link> чтобы оставить комментарий
              </p>
            )}

            {/* Controls */}
            <div className={styles.controls}>
              <button className={styles.ctrlBtn} onClick={()=>skipPrev()}>
                <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg>
              </button>
              <button className={styles.bigPlayBtn} onClick={togglePlay}>
                {isPlaying
                  ? <svg viewBox="0 0 24 24" fill="currentColor" width="26" height="26"><rect x="5" y="3" width="4" height="18" rx="2"/><rect x="15" y="3" width="4" height="18" rx="2"/></svg>
                  : <svg viewBox="0 0 24 24" fill="currentColor" width="26" height="26"><path d="M8 5.14v14l11-7-11-7z"/></svg>}
              </button>
              <button className={styles.ctrlBtn} onClick={()=>skipNext(true)}>
                <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M6 18l8.5-6L6 6v12zm2.5-6L16 6h2v12h-2z"/></svg>
              </button>
            </div>

            {/* Comment list */}
            {comments.length > 0 && (
              <div className={styles.commentList}>
                {comments.map(c=>(
                  <div key={c.id}
                    className={`${styles.commentRow} ${activeComment===c.id?styles.commentRowActive:""}`}
                    onClick={()=>seek(c.time/duration)}>
                    <img src={c.avatarUrl||AVATAR_PH(c.username)} alt={c.username} className={styles.commentRowAvatar}
                      onError={e=>{e.currentTarget.src=AVATAR_PH(c.username);}}/>
                    <div className={styles.commentRowBody}>
                      <div className={styles.commentRowMeta}>
                        <Link to={`/profile/${encodeURIComponent(c.username)}`}
                          className={styles.commentRowUser}
                          onClick={e=>{e.stopPropagation();onClose();}}>
                          {c.username}
                        </Link>
                        <button className={styles.commentTimeBtn}
                          onClick={e=>{e.stopPropagation();seek(c.time/duration);}}>
                          {fmt(c.time)}
                        </button>
                      </div>
                      <p className={styles.commentRowText}>{c.text}</p>
                    </div>
                    {(user?.username===c.username||user?.role==="admin") && (
                      <button className={styles.commentDeleteBtn}
                        onClick={e=>{e.stopPropagation();handleDeleteComment(c.id);}}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13">
                          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
                          <path d="M10 11v6m4-6v6"/><path d="M9 6V4h6v2"/>
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Queue */}
            {upNext.length>0 && (
              <div className={styles.queueSection}>
                <h3 className={styles.sectionTitle}>Up Next</h3>
                <div className={styles.queueList}>
                  {upNext.map(track=>(
                    <button key={track.id} type="button" className={styles.queueItem}
                      onClick={()=>skipToTrack(track,queue)}>
                      <img src={track.coverUrl||PLACEHOLDER} alt="" className={styles.queueCover}
                        onError={e=>{e.currentTarget.src=PLACEHOLDER;}}/>
                      <div className={styles.queueMeta}>
                        <span className={styles.queueTrackTitle}>{track.title}</span>
                        <span className={styles.queueTrackArtist}>{formatArtistLine(track)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
