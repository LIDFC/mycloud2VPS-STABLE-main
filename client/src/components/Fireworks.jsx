import { useEffect, useRef } from "react";

// Particle class
class Particle {
  constructor(x, y, color) {
    this.x = x;
    this.y = y;
    this.color = color;
    const angle = Math.random() * Math.PI * 2;
    const speed = 2 + Math.random() * 6;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed - 3;
    this.gravity = 0.15;
    this.life = 1;
    this.decay = 0.012 + Math.random() * 0.018;
    this.radius = 2 + Math.random() * 3;
    this.trail = [];
  }

  update() {
    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > 6) this.trail.shift();
    this.vx *= 0.98;
    this.vy += this.gravity;
    this.x += this.vx;
    this.y += this.vy;
    this.life -= this.decay;
  }

  draw(ctx) {
    // Trail
    for (let i = 0; i < this.trail.length; i++) {
      const alpha = (i / this.trail.length) * this.life * 0.4;
      ctx.beginPath();
      ctx.arc(this.trail[i].x, this.trail[i].y, this.radius * 0.5, 0, Math.PI * 2);
      ctx.fillStyle = this.color.replace("1)", `${alpha})`);
      ctx.fill();
    }
    // Main particle
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = this.color.replace("1)", `${this.life})`);
    ctx.fill();
  }
}

function burst(x, y, colors, count = 60) {
  return Array.from({ length: count }, () => {
    const color = colors[Math.floor(Math.random() * colors.length)];
    return new Particle(x, y, color);
  });
}

const COLORS = [
  "rgba(255,85,0,1)",
  "rgba(255,180,0,1)",
  "rgba(255,255,100,1)",
  "rgba(255,120,50,1)",
  "rgba(255,200,80,1)",
  "rgba(255,255,255,1)",
  "rgba(255,60,100,1)",
];

export default function Fireworks({ active, onDone }) {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const particlesRef = useRef([]);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    // Schedule multiple bursts across the screen
    const schedule = [
      { x: canvas.width * 0.15, y: canvas.height * 0.3, delay: 0 },
      { x: canvas.width * 0.85, y: canvas.height * 0.25, delay: 150 },
      { x: canvas.width * 0.2,  y: canvas.height * 0.55, delay: 300 },
      { x: canvas.width * 0.8,  y: canvas.height * 0.5,  delay: 450 },
      { x: canvas.width * 0.1,  y: canvas.height * 0.4,  delay: 600 },
      { x: canvas.width * 0.9,  y: canvas.height * 0.35, delay: 700 },
      { x: canvas.width * 0.12, y: canvas.height * 0.65, delay: 900 },
      { x: canvas.width * 0.88, y: canvas.height * 0.6,  delay: 1000 },
      { x: canvas.width * 0.18, y: canvas.height * 0.2,  delay: 1200 },
      { x: canvas.width * 0.82, y: canvas.height * 0.7,  delay: 1300 },
    ];

    const timers = schedule.map(({ x, y, delay }) =>
      setTimeout(() => {
        particlesRef.current.push(...burst(x, y, COLORS, 70));
      }, delay)
    );

    const startTime = Date.now();
    const DURATION = 3000; // total animation time ms

    const animate = () => {
      const elapsed = Date.now() - startTime;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particlesRef.current = particlesRef.current.filter(p => p.life > 0);
      particlesRef.current.forEach(p => { p.update(); p.draw(ctx); });

      if (elapsed < DURATION || particlesRef.current.length > 0) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        onDone?.();
      }
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      timers.forEach(clearTimeout);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      particlesRef.current = [];
    };
  }, [active, onDone]);

  if (!active) return null;

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9998,
        pointerEvents: "none",
        width: "100%",
        height: "100%",
      }}
    />
  );
}
