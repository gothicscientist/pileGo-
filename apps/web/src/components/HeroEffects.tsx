import { useEffect, useRef } from 'react';

export interface HeroEffect {
  x: number;
  y: number;
  kind: 'trail' | 'drop' | 'toss';
  speed?: number;
}

const COLORS = ['#f2cd5c', '#eeb2c6', '#9ccbe8', '#cdb6ea', '#e0533a'];

/** A viewport-sized, pointer-transparent layer. It only renders while particles live. */
export function HeroEffects({ source, enabled }: { source: React.MutableRefObject<((event: HeroEffect) => void) | null>; enabled: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx || !enabled) return;
    type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; angle: number; color: string; ring: boolean; label?: string };
    let particles: Particle[] = [];
    let ribbon: Array<{ x: number; y: number; life: number }> = [];
    let frame = 0;
    let last = 0;
    let lastTrail = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      el.width = window.innerWidth * dpr;
      el.height = window.innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const draw = (now: number) => {
      const dt = Math.min((now - last) / 16.67 || 1, 2);
      last = now;
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      ribbon = ribbon.filter(p => p.life > 0);
      for (let i = 1; i < ribbon.length; i++) {
        const a = ribbon[i - 1]!, b = ribbon[i]!;
        ctx.globalAlpha = Math.max(0, b.life / 20) * 0.65;
        ctx.strokeStyle = COLORS[Math.floor(i / 4) % COLORS.length]!;
        ctx.lineWidth = Math.max(1, b.life / 3);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      ribbon.forEach(p => { p.life -= dt; });
      particles = particles.filter(p => p.life > 0);
      for (const p of particles) {
        p.life -= dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += (p.ring ? 0 : 0.045) * dt;
        p.angle += 0.06 * dt;
        ctx.globalAlpha = Math.max(0, p.life / p.max);
        ctx.strokeStyle = ctx.fillStyle = p.color;
        if (p.label) {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(-0.12);
          const scale = Math.min(1, (p.max - p.life) / 5 + 0.5);
          ctx.scale(scale, scale);
          ctx.fillStyle = '#f2cd5c';
          ctx.beginPath();
          ctx.roundRect(-65, -15, 130, 31, 8);
          ctx.fill();
          ctx.fillStyle = '#22241e';
          ctx.font = '750 13px "Libre Franklin Variable", sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(p.label, 0, 5);
          ctx.restore();
        } else if (p.ring) {
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, 12 + (p.max - p.life) * 8, 6 + (p.max - p.life) * 4, 0, 0, Math.PI * 2);
          ctx.stroke();
        } else {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.angle);
          // Little paper scraps, from the same palette as the collage.
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
          ctx.restore();
        }
      }
      ctx.globalAlpha = 1;
      frame = particles.length || ribbon.length ? requestAnimationFrame(draw) : 0;
    };
    source.current = ({ x, y, kind, speed = 0 }) => {
      if (document.hidden) return;
      const now = performance.now();
      if (kind === 'trail' && now - lastTrail < 28) return;
      lastTrail = now;
      if (kind === 'trail') ribbon.push({ x, y, life: 20 });
      const count = kind === 'trail' ? 2 : kind === 'toss' ? 36 : 22;
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const velocity = kind === 'trail' ? 0.8 : 2 + Math.random() * 5 + Math.min(speed / 1000, 3);
        const life = kind === 'trail' ? 22 : 45 + Math.random() * 15;
        particles.push({ x, y, vx: Math.cos(angle) * velocity, vy: Math.sin(angle) * velocity - 1,
          life, max: life, size: 4 + Math.random() * 6, angle,
          color: COLORS[i % COLORS.length]!, ring: false });
      }
      if (kind !== 'trail') particles.push({ x, y, vx: 0, vy: 0, life: 28, max: 28, size: 0, angle: 0, color: '#f2cd5c', ring: true });
      if (kind !== 'trail') particles.push({ x: Math.max(72, Math.min(x, window.innerWidth - 72)), y: Math.max(45, y - 30), vx: 0, vy: -1.3, life: 54, max: 54, size: 0, angle: 0, color: '#f2cd5c', ring: false, label: kind === 'toss' ? 'GOOD CHAOS.' : speed > 1200 ? 'WHAT A FLING!' : 'NICE TOSS.' });
      particles = particles.slice(-180);
      if (!frame) { last = now; frame = requestAnimationFrame(draw); }
    };
    const clear = () => {
      if (!document.hidden) return;
      cancelAnimationFrame(frame);
      frame = 0;
      particles = [];
      ribbon = [];
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    };
    resize();
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', clear);
    return () => {
      source.current = null;
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', clear);
    };
  }, [enabled, source]);
  return enabled ? <canvas ref={canvas} className="hero-effects" aria-hidden /> : null;
}
