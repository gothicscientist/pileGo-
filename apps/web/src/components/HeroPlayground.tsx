import { Pause, Play, RotateCcw, Shuffle } from 'lucide-react';
import { animate, motion, useInView, useMotionValue, useSpring, type PanInfo } from 'motion/react';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type RefObject } from 'react';
import { CUTOUTS, PHOTOS, type CutoutId } from '~/lib/art';
import { MarketIcon } from '~/components/bits';
import { LooseTag, Polaroid, type Placement } from '~/components/Scrapbook';
import { HeroEffects, type HeroEffect } from './HeroEffects';

const PIECES: Array<{ id: CutoutId; at: Placement }> = [
  { id: 'selvedgeJacket', at: { x: '1%', y: '9%', w: '50%', r: -9, z: 2, phone: true } },
  { id: 'cargoShorts', at: { x: '49%', y: '50%', w: '24%', r: 9, z: 2 } },
  { id: 'flannel', at: { x: '72%', y: '41%', w: '26%', r: 12, z: 3 } },
  { id: 'rawSelvedge', at: { x: '29%', y: '37%', w: '21%', r: -17, z: 3, phone: true } },
  { id: 'lilacHoodie', at: { x: '41%', y: '3%', w: '44%', r: 7, z: 4, phone: true } },
  { id: 'skullTee', at: { x: '3%', y: '50%', w: '35%', r: -10, z: 5, phone: true } },
  { id: 'cap', at: { x: '-1%', y: '2%', w: '19%', r: -20, z: 6 } },
  { id: 'mexico66Yellow', at: { x: '37%', y: '73%', w: '40%', r: -7, z: 8, phone: true } },
];
const BURST = Array.from({ length: 36 }, (_, i) => {
  const a = i / 36 * Math.PI * 2, r = i % 2 ? 43 : 50;
  return `${50 + r * Math.cos(a)},${50 + r * Math.sin(a)}`;
}).join(' ');
type Command = { key: number; type: 'toss' | 'reset' };
type Impact = { key: number; x: number; y: number; source: string };

// React to preference changes while the playground is open, too.
const motionQuery = '(prefers-reduced-motion: reduce)';
const subscribeMotion = (changed: () => void) => {
  const query = window.matchMedia(motionQuery);
  query.addEventListener('change', changed);
  return () => query.removeEventListener('change', changed);
};
const readMotion = () => window.matchMedia(motionQuery).matches;
const usePlaygroundReducedMotion = () => useSyncExternalStore(subscribeMotion, readMotion, () => true);
const viewportPoint = (point: { x: number; y: number }) => ({ x: point.x - window.scrollX, y: point.y - window.scrollY });

function PlayPiece({ id, at, index, floor, command, impact, moving, emit, onPickup, onDrop }: {
  id: CutoutId; at: Placement; index: number; floor: RefObject<HTMLDivElement | null>;
  command: Command; impact: Impact | null; moving: boolean;
  emit: (event: HeroEffect) => void; onPickup: () => void; onDrop: (info: PanInfo, id: CutoutId) => void;
}) {
  const el = useRef<HTMLButtonElement>(null);
  const x = useMotionValue(0), y = useMotionValue(0), tilt = useMotionValue(at.r);
  const rotate = useSpring(tilt, { stiffness: 220, damping: 17 });
  const [held, setHeld] = useState(false);
  const moved = useRef(false);
  const animations = useRef<Array<{ stop: () => void }>>([]);
  const reduce = usePlaygroundReducedMotion();
  const stop = useCallback(() => { animations.current.forEach(a => a.stop()); }, []);
  const travel = useCallback((tx: number, ty: number, r: number) => {
    stop();
    if (reduce) { x.set(tx); y.set(ty); tilt.set(r); return; }
    animations.current = [animate(x, tx, { type: 'spring', stiffness: 105, damping: 13 }),
      animate(y, ty, { type: 'spring', stiffness: 105, damping: 13 })];
    tilt.set(r);
  }, [stop, x, y, tilt, reduce]);
  useEffect(() => () => stop(), [stop]);
  useEffect(() => {
    if (!command.key) return;
    if (command.type === 'reset' || reduce) { travel(0, 0, at.r); return; }
    // Keep the automatic toss near the mat; manual dragging can travel across the page.
    const width = el.current?.parentElement?.clientWidth ?? 500;
    const dx = Math.sin(index * 2.4 + command.key * 1.7) * width * 0.12;
    const dy = Math.cos(index * 1.8 + command.key) * width * 0.1;
    travel(dx, dy, at.r + Math.sin(index + command.key) * 24);
  }, [command, index, at.r, reduce, travel]);
  useEffect(() => {
    if (!impact || impact.source === id || held || reduce) return;
    const rect = el.current?.getBoundingClientRect();
    if (!rect) return;
    const dx = rect.x + rect.width / 2 - impact.x, dy = rect.y + rect.height / 2 - impact.y;
    const distance = Math.hypot(dx, dy);
    if (distance > 430 || distance < 1) return;
    const force = Math.max(0, 1 - distance / 430) * 16;
    const ox = x.get(), oy = y.get();
    stop();
    animations.current = [animate(x, [ox, ox + dx / distance * force, ox], { duration: 0.55 }),
      animate(y, [oy, oy + dy / distance * force, oy], { duration: 0.55 })];
  }, [impact, id, held, reduce, stop, x, y]);
  const c = CUTOUTS[id];
  return <motion.button
    ref={el} type="button" aria-label={`Toss ${c.name}`} title={`${c.name} — drag or press to toss`}
    data-hero-piece={id}
    drag dragConstraints={floor} dragElastic={0.06} dragMomentum={false}
    onDragStart={() => { stop(); moved.current = true; setHeld(true); onPickup(); }}
    onDrag={(_, info) => {
      if (!reduce) tilt.set(at.r + Math.max(-26, Math.min(26, info.velocity.x / 35)));
      emit({ ...viewportPoint(info.point), kind: 'trail', speed: Math.hypot(info.velocity.x, info.velocity.y) });
    }}
    onDragEnd={(_, info) => {
      setHeld(false);
      const rect = el.current?.getBoundingClientRect(), bounds = floor.current?.getBoundingClientRect();
      const momentum = reduce ? 0 : 0.14;
      const vx = Math.max(-160, Math.min(160, info.velocity.x * momentum));
      const vy = Math.max(-120, Math.min(120, info.velocity.y * momentum));
      const tx = rect && bounds ? Math.max(bounds.left + 12 - rect.left, Math.min(vx, bounds.right - 12 - rect.right)) : 0;
      const ty = rect && bounds ? Math.max(bounds.top + 12 - rect.top, Math.min(vy, bounds.bottom - 12 - rect.bottom)) : 0;
      travel(x.get() + tx, y.get() + ty, at.r + (reduce ? 0 : Math.max(-22, Math.min(22, info.velocity.x / 60))));
      onDrop(info, id);
      // Pointer-generated click follows drag end; keyboard clicks remain usable.
      window.setTimeout(() => { moved.current = false; }, 0);
    }}
    onClick={() => {
      if (moved.current) return;
      const rect = el.current?.getBoundingClientRect();
      if (!rect) return;
      travel(0, reduce ? 0 : -26, at.r + (reduce ? 0 : 12));
      onDrop({ point: { x: rect.x + rect.width / 2 + window.scrollX, y: rect.y + rect.height / 2 + window.scrollY }, velocity: { x: 0, y: 0 }, offset: { x: 0, y: 0 }, delta: { x: 0, y: 0 } }, id);
    }}
    className={`hero-piece absolute m-0 touch-none select-none border-0 bg-transparent p-0 ${at.phone ? '' : 'max-md:hidden'}`}
    style={{ left: at.x, top: at.y, width: at.w, zIndex: held ? 60 : at.z ?? 1, x, y, rotate }}
    whileHover={reduce ? undefined : { scale: 1.045 }}
    whileDrag={{ scale: reduce ? 1 : 1.12 }}
    transition={{ type: 'spring', stiffness: 260, damping: 19 }}
  >
    <span className="hero-piece-float block" style={{ animationDelay: `${-index * 0.73}s`, animationDuration: `${5 + index * 0.31}s`, animationPlayState: moving && !held ? 'running' : 'paused' }}>
      <img src={c.src} alt="" draggable={false} className="pointer-events-none h-auto w-full cutout-shadow" style={{ aspectRatio: String(c.ratio) }} decoding="async" />
    </span>
  </motion.button>;
}

export function HeroPlayground({ floor }: { floor: RefObject<HTMLDivElement | null> }) {
  const board = useRef<HTMLDivElement>(null);
  const inView = useInView(board, { amount: 0.15 });
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(!document.hidden);
  const [active, setActive] = useState(false);
  const [command, setCommand] = useState<Command>({ key: 0, type: 'reset' });
  const [impact, setImpact] = useState<Impact | null>(null);
  const [count, setCount] = useState(0);
  const [photoKey, setPhotoKey] = useState(0);
  const source = useRef<((event: HeroEffect) => void) | null>(null);
  const reduce = usePlaygroundReducedMotion();
  const moving = !paused && !reduce && inView && visible;
  useEffect(() => {
    const changed = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', changed);
    return () => document.removeEventListener('visibilitychange', changed);
  }, []);
  const emit = useCallback((event: HeroEffect) => source.current?.(event), []);
  const drop = useCallback((info: PanInfo, id: string) => {
    const point = viewportPoint(info.point);
    setActive(false);
    setCount(c => c + 1);
    setImpact({ key: performance.now(), ...point, source: id });
    emit({ ...point, kind: 'drop', speed: Math.hypot(info.velocity.x, info.velocity.y) });
  }, [emit]);
  const toss = () => {
    setCommand(c => ({ key: c.key + 1, type: 'toss' }));
    setCount(c => c + 1);
    const rect = board.current?.getBoundingClientRect();
    if (rect) emit({ x: rect.x + rect.width * 0.5, y: rect.y + rect.height * 0.45, kind: 'toss' });
  };
  return <section className="hero-playground order-1 min-w-0 lg:order-2" aria-label="Clothing playground">
    <HeroEffects source={source} enabled={!paused && !reduce && visible} />
    <div ref={board} className="hero-board relative mx-auto aspect-square w-full max-w-[34rem] sm:aspect-[5/4] lg:aspect-auto lg:h-[min(70vh,690px)] lg:max-w-none" data-active={active} data-moving={moving}>
      <span className="kraft pointer-events-none absolute top-[2%] left-[16%] h-[40%] w-[50%] rotate-[5deg] rounded-[6px]" aria-hidden />
      <motion.span className="mat pointer-events-none absolute inset-[8%_5%_9%_6%] rounded-[34px]" animate={{ rotate: active && !reduce ? 0 : -2.5, scale: active && !reduce ? 1.025 : 1 }} transition={{ type: 'spring', stiffness: 100, damping: 15 }} aria-hidden />
      <Polaroid key={photoKey} src={PHOTOS.knit.src} caption="Saturday haul" at={{ x: '79%', y: '4%', w: '21%', r: 8, z: 6 }} board={floor}
        onDragStart={() => setActive(true)} onDrag={(_, info) => emit({ ...viewportPoint(info.point), kind: 'trail' })} onDragEnd={(_, info) => drop(info, 'photo')} />
      {PIECES.map((p, index) => <PlayPiece key={p.id} {...p} index={index} floor={floor} command={command} impact={impact} moving={moving} emit={emit} onPickup={() => setActive(true)} onDrop={drop} />)}
      <div className="pointer-events-none" aria-hidden><LooseTag price="$45" note="Live on 4" className="top-[33%] left-[45%] z-10 max-sm:scale-75" /></div>
      <div className="hero-sold pointer-events-none absolute right-[3%] bottom-[4%] z-10 size-28 -rotate-12 select-none max-sm:scale-75" aria-hidden>
        <svg viewBox="0 0 100 100" className="hero-burst absolute inset-0 size-full drop-shadow-lg" style={{ animationPlayState: moving ? 'running' : 'paused' }}><polygon points={BURST} fill="var(--tomato)" /></svg>
        <span className="absolute inset-0 flex flex-col items-center justify-center text-center leading-[0.95] font-black text-white italic"><span className="text-[0.7rem] font-semibold not-italic">Sold in</span><span className="text-[1.6rem]">2 days</span></span>
      </div>
      <div className="pointer-events-none absolute top-0 left-[24%] z-10 hidden -rotate-4 items-center gap-2 rounded-full bg-card py-1.5 pr-3 pl-1.5 text-sm font-semibold text-ink shadow-lg md:flex" aria-hidden>
        <span className="flex -space-x-1">{(['depop', 'vinted', 'ebay', 'grailed'] as const).map(id => <MarketIcon key={id} id={id} className="size-5 ring-2 ring-card" />)}</span>Listed everywhere
      </div>
      <span className="hero-drag-note pointer-events-none absolute bottom-[2%] left-[3%] z-10 -rotate-6 rounded-full bg-butter px-3 py-1.5 text-xs font-bold text-[#22241e] sm:text-sm" aria-hidden>{active ? 'Give it a good fling!' : 'Your whole screen is the playground'}</span>
    </div>
    <div className="hero-play-controls relative z-30 mx-auto mt-4 flex max-w-[34rem] flex-wrap items-center justify-center gap-2 lg:mt-1">
      <button className="hero-toss-button" type="button" onClick={toss}><Shuffle className="size-4" aria-hidden />Toss the pile</button>
      <button className="hero-reset-button" type="button" onClick={() => { setCommand(c => ({ key: c.key + 1, type: 'reset' })); setCount(0); setPhotoKey(k => k + 1); }}><RotateCcw className="size-3.5" aria-hidden />Stack it back</button>
      <button className="hero-pause-button" type="button" aria-label={paused ? 'Resume playground motion' : 'Pause playground motion'} aria-pressed={paused} onClick={() => setPaused(p => !p)}>{paused ? <Play className="size-4" aria-hidden /> : <Pause className="size-4" aria-hidden />}</button>
      <p className="mt-1 w-full text-center text-xs text-ink-2" role="status">{count ? `${count === 1 ? 'Nice toss.' : 'Good chaos.'} ${count} ${count === 1 ? 'toss' : 'tosses'} · Just playing. Your real closet stays put.` : 'Drag, fling, make a little mess. Or tap a piece to toss it.'}</p>
    </div>
  </section>;
}
