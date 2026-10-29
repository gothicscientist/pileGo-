// Home: the seller's unsold clothes as cutouts scattered on a detergent-blue
// floor. Pieces can be picked up and dropped anywhere; the pile remembers.

import type { Item } from '@pilego/core';
import { ImagePlus, ScanLine, Shuffle } from 'lucide-react';
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type MotionValue,
} from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { HangTag, PhotoImg } from '~/components/bits';
import { CutoutPiece, LooseTag } from '~/components/Scrapbook';
import { Garment, GARMENT_KINDS } from '~/components/Garments';
import { Spinner } from '~/components/ui';
import { cx, daysSince, money, plural, seeded } from '~/lib/format';
import { handOffFiles, imageFiles } from '~/lib/handoff';
import { nextUp } from '~/lib/nextup';
import { useItems, useJobs, useProfile } from '~/lib/queries';

const STORE = 'pilego-pile-v1';
const MAX_PIECES = 36;

type Spot = { x: number; y: number };

function loadSpots(): Record<string, Spot> {
  try {
    return JSON.parse(localStorage.getItem(STORE) ?? '{}') as Record<string, Spot>;
  } catch {
    return {};
  }
}

function saveSpots(spots: Record<string, Spot>) {
  try {
    localStorage.setItem(STORE, JSON.stringify(spots));
  } catch {
    // Storage can be off; the pile just forgets on reload.
  }
}

function pieceWidth(regionWidth: number, cutout: boolean): number {
  const base = Math.max(104, Math.min(196, regionWidth / 5.2));
  return Math.round(cutout ? base * 1.12 : base);
}

function layout(n: number, w: number): { cols: number; rows: number; height: number } {
  const piece = pieceWidth(w, true);
  const cols = Math.max(2, Math.min(n, Math.floor(w / (piece * 0.98))));
  const rows = Math.max(1, Math.ceil(n / cols));
  // Room for each row of pieces plus their tags, so a big pile scrolls instead of stacking up.
  return { cols, rows, height: Math.round(rows * piece * 1.12 + piece * 0.35) };
}

/** Jittered grid so a fresh pile looks thrown, not stacked. */
function scatter(items: Item[], w: number, h: number, salt: number): Record<string, Spot> {
  const { cols, rows } = layout(items.length, w);
  const piece = pieceWidth(w, true);
  const usableX = Math.max(0.2, 1 - piece / w);
  const usableY = Math.max(0.2, 1 - (piece * 1.15) / h);
  const out: Record<string, Spot> = {};
  items.forEach((item, i) => {
    const col = i % cols;
    // Every other row shifts half a step, like clothes thrown in waves.
    const row = Math.floor(i / cols);
    const jx = seeded(item.id, 11 + salt) - 0.5;
    const jy = seeded(item.id, 23 + salt) - 0.5;
    const shift = row % 2 ? 0.35 : 0;
    out[item.id] = {
      x: Math.min(1, Math.max(0, (col + shift + jx * 0.45) / Math.max(1, cols - 1 + (cols > 1 ? 0.35 : 0)))) * usableX,
      y: Math.min(1, Math.max(0, (row + jy * 0.4) / Math.max(1, rows - 1 + 0.2))) * usableY,
    };
  });
  return out;
}

export function Pile() {
  const { data: items, isLoading } = useItems();
  const { data: jobs } = useJobs();
  const { data: profile } = useProfile();
  const navigate = useNavigate();
  const [dropping, setDropping] = useState(false);

  const recentSold = (i: Item) => i.status === 'sold' && (daysSince(i.sold_at) ?? 99) <= 7;
  const pieces = useMemo(
    () =>
      (items ?? [])
        .filter(i => i.status === 'draft' || i.status === 'ready' || i.status === 'listed' || recentSold(i))
        .slice(0, MAX_PIECES),
    [items],
  );

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDropping(false);
    const files = imageFiles(e.dataTransfer.files);
    if (files.length) {
      handOffFiles(files);
      navigate('/scan');
    }
  };

  const stats = useMemo(() => {
    const all = items ?? [];
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const soldThisMonth = all.filter(i => i.sold_at && Date.parse(i.sold_at) >= monthStart.getTime());
    return {
      inPile: all.filter(i => i.status === 'draft' || i.status === 'ready' || i.status === 'listed').length,
      out: all.filter(i => i.status === 'listed').length,
      drafts: all.filter(i => i.status === 'draft').length,
      soldMonth: soldThisMonth.length,
      takenMonth: soldThisMonth.reduce((s, i) => s + (i.sold_price ?? 0), 0),
      listedValue: all.filter(i => i.status === 'listed').reduce((s, i) => s + (i.price ?? 0), 0),
    };
  }, [items]);

  const todo = useMemo(() => nextUp(items ?? [], jobs ?? [], profile?.stale_after_days ?? 30), [items, jobs, profile]);
  const currency = profile?.currency ?? 'USD';

  return (
    <div
      className="floor grain relative min-h-[calc(100dvh-3.5rem)] md:min-h-dvh"
      onDragOver={e => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setDropping(true);
        }
      }}
      onDragLeave={e => {
        if (e.currentTarget === e.target) setDropping(false);
      }}
      onDrop={onDrop}
    >
      <div className="mx-auto grid min-h-[inherit] max-w-[1500px] gap-6 px-4 py-5 sm:px-6 lg:grid-cols-[1fr_19rem] lg:gap-8 lg:py-8">
        <section aria-labelledby="pile-title" className="flex min-h-[70dvh] flex-col">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line pb-4">
            <div>
              <p className="label-caps">01 / Everything you are selling</p>
              <h1 id="pile-title" className="font-display mt-2 text-[clamp(2.8rem,7vw,5.5rem)] leading-[0.9]">
                The pile
              </h1>
              <p className="mt-2 max-w-xl text-ink-2">
                {isLoading
                  ? 'Gathering your clothes'
                  : stats.inPile
                    ? `${plural(stats.inPile, 'piece')} waiting to sell. Drag them around, tap one to open it.`
                    : 'Nothing here yet.'}
              </p>
            </div>
          </div>

          {isLoading ? (
            <div className="flex flex-1 items-center justify-center">
              <Spinner />
            </div>
          ) : pieces.length ? (
            <PileFloor pieces={pieces} currency={currency} />
          ) : (
            <EmptyFloor />
          )}
        </section>

        <aside aria-label="Summary" className="lg:pt-6">
          <Receipt stats={stats} currency={currency} todo={todo} />
        </aside>
      </div>

      <AnimatePresence>
        {dropping && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute inset-3 z-20 flex items-center justify-center rounded-[28px] border-2 border-dashed border-accent bg-paper/80 backdrop-blur-sm"
          >
            <p className="font-display text-4xl text-accent">Drop to scan</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PileFloor({ pieces, currency }: { pieces: Item[]; currency: string }) {
  const region = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [spots, setSpots] = useState<Record<string, Spot>>(loadSpots);
  const [salt, setSalt] = useState(0);
  const [front, setFront] = useState<string[]>([]);
  const reduce = useReducedMotion();

  useEffect(() => {
    const el = region.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setSize({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fallback = useMemo(() => (size ? scatter(pieces, size.w, size.h, salt) : {}), [pieces, size, salt]);
  const minHeight = size ? layout(pieces.length, size.w).height : undefined;

  // Parallax: the floor tilts a little toward the pointer. Deeper pieces move more.
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const sx = useSpring(px, { stiffness: 60, damping: 18 });
  const sy = useSpring(py, { stiffness: 60, damping: 18 });

  const move = (e: React.PointerEvent) => {
    if (reduce || e.pointerType !== 'mouse' || !region.current) return;
    const r = region.current.getBoundingClientRect();
    px.set(((e.clientX - r.left) / r.width - 0.5) * 2);
    py.set(((e.clientY - r.top) / r.height - 0.5) * 2);
  };

  const place = useCallback((id: string, spot: Spot) => {
    setSpots(s => {
      const next = { ...s, [id]: spot };
      saveSpots(next);
      return next;
    });
  }, []);

  const raise = useCallback((id: string) => setFront(f => [...f.filter(x => x !== id), id]), []);

  const tidy = () => {
    setSpots({});
    saveSpots({});
    setFront([]);
    setSalt(s => s + 1);
  };

  return (
    <div className="relative mt-3 flex flex-1 flex-col">
      <div className="mb-2 flex justify-end">
        <button type="button" onClick={tidy} className="btn btn-line btn-sm group">
          <Shuffle className="size-4 transition-transform duration-500 group-hover:rotate-180" aria-hidden />
          Throw again
        </button>
      </div>
      <div
        ref={region}
        onPointerMove={move}
        onPointerLeave={() => {
          px.set(0);
          py.set(0);
        }}
        className="relative min-h-[60dvh] flex-1"
        style={{ minHeight }}
      >
        {size &&
          pieces.map((item, i) => (
            <Piece
              key={item.id}
              item={item}
              index={i}
              currency={currency}
              spot={spots[item.id] ?? fallback[item.id] ?? { x: 0.1, y: 0.1 }}
              region={region}
              size={size}
              z={front.indexOf(item.id) + 2}
              onPlace={place}
              onRaise={raise}
              parallax={[sx, sy]}
            />
          ))}
      </div>
    </div>
  );
}

function Piece({
  item,
  index,
  currency,
  spot,
  region,
  size,
  z,
  onPlace,
  onRaise,
  parallax,
}: {
  item: Item;
  index: number;
  currency: string;
  spot: Spot;
  region: React.RefObject<HTMLDivElement | null>;
  size: { w: number; h: number };
  z: number;
  onPlace: (id: string, spot: Spot) => void;
  onRaise: (id: string) => void;
  parallax: [MotionValue<number>, MotionValue<number>];
}) {
  const navigate = useNavigate();
  const cover = item.photos?.[0];
  const cutout = Boolean(cover?.cutout_path);
  // Cutouts are trimmed to the garment, so a pair of jeans is tall and a cap is wide.
  // Sizing by area keeps a cap from shrinking to nothing and jeans from towering.
  const [ratio, setRatio] = useState<number | null>(null);
  const base = pieceWidth(size.w, cutout);
  const width = cutout && ratio ? Math.round(base * Math.min(1.35, Math.max(0.62, Math.sqrt(ratio / 0.78)))) : base;
  const tilt = (seeded(item.id, 3) - 0.5) * (cutout ? 22 : 14);
  const depth = 0.35 + seeded(item.id, 5) * 0.65;
  const dragged = useRef(false);
  const [nudged, setNudged] = useState(0);
  const reduce = useReducedMotion();

  const x = useMotionValue(spot.x * size.w);
  const y = useMotionValue(spot.y * size.h);
  useEffect(() => {
    x.set(spot.x * size.w);
    y.set(spot.y * size.h);
  }, [spot.x, spot.y, size.w, size.h, x, y]);

  const ox = useTransform(parallax[0], v => v * depth * -12);
  const oy = useTransform(parallax[1], v => v * depth * -9);
  const sold = item.status === 'sold';
  const live = (item.listings ?? []).filter(l => l.status === 'listed').length;
  const label = `${item.title || 'Untitled item'}, ${money(item.price, item.currency || currency)}, ${item.status}`;
  const tagSide = seeded(item.id, 7) > 0.5;

  return (
    <motion.div className="pointer-events-none absolute inset-0" style={{ x: ox, y: oy, zIndex: z }}>
      <motion.a
        href={`/item/${item.id}`}
        aria-label={label}
        drag
        dragConstraints={region}
        dragElastic={0.12}
        dragTransition={{ power: 0.25, timeConstant: 220 }}
        onDragStart={() => {
          dragged.current = true;
          onRaise(item.id);
        }}
        onDragTransitionEnd={() => {
          setNudged(n => n + 1);
          onPlace(item.id, {
            x: Math.min(0.98, Math.max(0, x.get() / size.w)),
            y: Math.min(0.98, Math.max(0, y.get() / size.h)),
          });
        }}
        onClick={e => {
          e.preventDefault();
          if (dragged.current) {
            dragged.current = false;
            return;
          }
          navigate(`/item/${item.id}`);
        }}
        onPointerDown={() => {
          dragged.current = false;
        }}
        initial={reduce ? false : { opacity: 0, scale: 0.7, rotate: tilt - 24, y: -30 }}
        animate={{ opacity: 1, scale: 1, rotate: tilt, y: 0 }}
        whileHover={{ scale: 1.04, rotate: tilt * 0.5 }}
        whileTap={{ scale: 1.07 }}
        whileDrag={{ scale: 1.1, rotate: tilt + 5, cursor: 'grabbing' }}
        transition={{ type: 'spring', stiffness: 240, damping: 17, delay: reduce ? 0 : Math.min(index, 18) * 0.04 }}
        className="swing-on-hover pointer-events-auto absolute top-0 left-0 block cursor-grab touch-none select-none"
        style={{ x, y, width }}
        draggable={false}
      >
        {cutout ? (
          <PhotoImg
            photo={cover}
            cutout
            className={cx('h-auto w-full cutout-sticker', sold && 'opacity-80 saturate-50')}
            alt=""
            onLoad={e => setRatio(e.currentTarget.naturalWidth / Math.max(1, e.currentTarget.naturalHeight))}
          />
        ) : (
          <div className="polaroid relative">
            <PhotoImg
              photo={cover}
              className="aspect-[4/5] w-full rounded-[1px] object-cover"
              alt=""
              fallback={
                <Garment
                  kind={GARMENT_KINDS[Math.floor(seeded(item.id, 9) * GARMENT_KINDS.length)]!}
                  fill="var(--line)"
                  className="w-2/3"
                />
              }
            />
            <span className="absolute right-2 bottom-2 left-2.5 truncate text-left text-[0.7rem] font-medium tracking-tight text-[#53575a]">
              {item.title || item.brand || 'Untitled'}
            </span>
            <span className="tape absolute -top-2.5 left-1/2 h-5 w-14 -translate-x-1/2 rotate-[-4deg]" aria-hidden />
          </div>
        )}
        <span
          key={nudged}
          className={cx('absolute top-[6%] origin-top', tagSide ? '-right-3' : '-left-3', nudged > 0 && 'swing-now')}
          style={{ rotate: `${-tilt * 0.6 + (tagSide ? 6 : -6)}deg` }}
        >
          <span className="swing block origin-top">
            <HangTag
              price={item.price == null ? 'price?' : money(item.price, item.currency || currency)}
              note={sold ? 'sold' : live ? `${live} live` : item.status === 'draft' ? 'draft' : 'ready'}
              empty={item.price == null}
              className="relative"
            />
          </span>
        </span>
        {sold && (
          <span className="stamp-in absolute inset-x-0 top-1/3 mx-auto w-fit rounded-md border-[3px] border-rose bg-paper/70 px-2 py-0.5 text-xl font-semibold tracking-[0.12em] text-rose backdrop-blur-[1px]">
            SOLD
          </span>
        )}
      </motion.a>
    </motion.div>
  );
}

function EmptyFloor() {
  const board = useRef<HTMLDivElement>(null);
  return (
    <div className="relative mt-6 grid flex-1 items-center gap-8 lg:grid-cols-[1fr_1.1fr]">
      <div className="flex flex-col items-start gap-4">
        <p className="label-caps">02 / Start small</p>
        <h2 className="font-display text-[clamp(1.9rem,3.2vw,2.6rem)] leading-[1.04]">Start with one thing from the pile</h2>
        <p className="max-w-md text-ink-2">
          A plain hoodie counts. Lay it flat in good light and take three photos: the front, the back and the label. Or drop photos
          anywhere on this page.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link to="/scan" className="btn btn-tag text-base">
            <ScanLine className="size-5" aria-hidden />
            Scan an item
          </Link>
          <Link to="/settings#import" className="btn btn-line">
            <ImagePlus className="size-5" aria-hidden />
            Import existing listings
          </Link>
        </div>
      </div>
      <div ref={board} className="relative aspect-[5/4] w-full rounded-[28px] border border-dashed border-line" aria-hidden>
        <CutoutPiece id="whiteHoodie" at={{ x: '8%', y: '8%', w: '38%', r: -6, z: 2, phone: true }} board={board} />
        <CutoutPiece id="lightJeans" at={{ x: '44%', y: '14%', w: '24%', r: 7, z: 1, phone: true }} board={board} index={1} />
        <CutoutPiece id="denimJacket" at={{ x: '62%', y: '4%', w: '34%', r: 9, z: 3, phone: true }} board={board} index={2} />
        <CutoutPiece id="cap" at={{ x: '30%', y: '66%', w: '22%', r: -12, z: 4, phone: true }} board={board} index={3} />
        <LooseTag price="$18" note="Your find" className="right-[8%] bottom-[8%] z-10 max-sm:scale-75" />
      </div>
    </div>
  );
}

function Receipt({
  stats,
  currency,
  todo,
}: {
  stats: { inPile: number; out: number; drafts: number; soldMonth: number; takenMonth: number; listedValue: number };
  currency: string;
  todo: ReturnType<typeof nextUp>;
}) {
  const month = new Date().toLocaleDateString(undefined, { month: 'long' });
  const lines: Array<[string, string]> = [
    ['In the pile', String(stats.inPile)],
    ['Listed somewhere', String(stats.out)],
    ['Drafts', String(stats.drafts)],
    ['Asking total', money(stats.listedValue, currency)],
    [`Sold in ${month}`, String(stats.soldMonth)],
  ];
  return (
    <motion.div
      initial={{ y: -16, opacity: 0, rotate: 0 }}
      animate={{ y: 0, opacity: 1, rotate: 1.2 }}
      whileHover={{ rotate: 0, y: -3 }}
      transition={{ type: 'spring', stiffness: 160, damping: 16, delay: 0.2 }}
      className="relative mx-auto w-full max-w-sm"
    >
      <span className="tape absolute -top-3 left-1/2 z-10 h-6 w-24 -translate-x-1/2 rotate-2" aria-hidden />
      <div className="receipt-edge grain rounded-t-[18px] bg-card px-5 pt-6 pb-9 text-ink lift-lg">
        <div className="flex items-baseline justify-between">
          <p className="label-caps">Today</p>
          <p className="text-xs text-muted">{new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>
        <dl className="mt-4 flex flex-col gap-2 border-y border-dashed border-line py-3.5 text-sm">
          {lines.map(([k, v]) => (
            <div key={k} className="flex items-baseline gap-2">
              <dt className="text-ink-2">{k}</dt>
              <span className="flex-1 border-b border-dotted border-line" aria-hidden />
              <dd className="font-semibold tabular">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="flex items-baseline justify-between py-3.5">
          <span className="text-base font-semibold tracking-tight">Taken this month</span>
          <span className="font-display text-3xl text-accent tabular">{money(stats.takenMonth, currency)}</span>
        </div>
        <div className="border-t border-dashed border-line pt-3.5">
          <p className="label-caps">Next up</p>
          {todo.length ? (
            <ul className="mt-2 flex flex-col">
              {todo.map((t, i) => (
                <motion.li key={t.key} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.45 + i * 0.06 }}>
                  <Link
                    to={t.to}
                    className={cx(
                      'group flex items-start gap-2.5 rounded-xl px-1.5 py-1.5 text-sm transition hover:bg-paper-2',
                      t.tone === 'urgent' ? 'font-semibold text-danger' : 'text-ink',
                    )}
                  >
                    <span
                      aria-hidden
                      className={cx('mt-[0.4rem] size-1.5 shrink-0 rounded-full transition-transform group-hover:scale-150', t.tone === 'urgent' ? 'bg-danger' : 'bg-accent')}
                    />
                    {t.text}
                  </Link>
                </motion.li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-ink-2">All caught up. Scan something new.</p>
          )}
        </div>
      </div>
    </motion.div>
  );
}
