// Home: the seller's unsold clothes as cutouts scattered on a detergent-blue
// floor. Pieces can be picked up and dropped anywhere; the pile remembers.

import type { Item } from '@pilego/core';
import { ImagePlus, ScanLine, Shuffle } from 'lucide-react';
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type MotionValue,
} from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { PhotoImg, PriceTag } from '~/components/bits';
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

/** Jittered grid so a fresh pile looks thrown, not stacked. */
function scatter(items: Item[], w: number, salt: number): Record<string, Spot> {
  const n = Math.max(1, items.length);
  const piece = pieceWidth(w, false);
  const cols = Math.max(2, Math.min(n, Math.floor(w / (piece * 0.92))));
  const rows = Math.max(1, Math.ceil(n / cols));
  const out: Record<string, Spot> = {};
  items.forEach((item, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const jx = seeded(item.id, 11 + salt);
    const jy = seeded(item.id, 23 + salt);
    out[item.id] = {
      x: ((col + 0.08 + jx * 0.6) / cols) * 0.94,
      y: ((row + 0.05 + jy * 0.55) / rows) * 0.86,
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
      className="floor relative min-h-[calc(100dvh-3.5rem)] md:min-h-dvh"
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
      <div className="mx-auto grid min-h-[inherit] max-w-[1500px] gap-6 px-4 py-5 sm:px-6 lg:grid-cols-[1fr_20rem] lg:py-8">
        <section aria-labelledby="pile-title" className="flex min-h-[70dvh] flex-col">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 id="pile-title" className="font-display text-[clamp(3rem,9vw,7rem)] leading-[0.8] font-extrabold">
                The pile
              </h1>
              <p className="mt-2 text-floor-ink/80">
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
              <Spinner className="text-floor-ink" />
            </div>
          ) : pieces.length ? (
            <PileFloor pieces={pieces} currency={currency} />
          ) : (
            <EmptyFloor />
          )}
        </section>

        <aside aria-label="Summary" className="lg:pt-24">
          <Receipt stats={stats} currency={currency} todo={todo} />
        </aside>
      </div>

      {dropping && (
        <div className="pointer-events-none absolute inset-3 z-20 flex items-center justify-center rounded-3xl border-4 border-dashed border-sticker bg-floor-deep/60">
          <p className="font-display text-4xl font-extrabold">Drop to scan</p>
        </div>
      )}
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

  const fallback = useMemo(() => (size ? scatter(pieces, size.w, salt) : {}), [pieces, size, salt]);

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
    <div className="relative mt-4 flex flex-1 flex-col">
      <div className="mb-2 flex justify-end">
        <button
          type="button"
          onClick={tidy}
          className="inline-flex items-center gap-1.5 rounded-full bg-floor-deep/70 px-3 py-1.5 text-sm font-medium hover:bg-floor-deep"
        >
          <Shuffle className="size-4" aria-hidden />
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
  const width = pieceWidth(size.w, cutout);
  const tilt = (seeded(item.id, 3) - 0.5) * (cutout ? 26 : 16);
  const depth = 0.35 + seeded(item.id, 5) * 0.65;
  const dragged = useRef(false);
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
  const label = `${item.title || 'Untitled item'}, ${money(item.price, item.currency || currency)}, ${item.status}`;

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
        initial={reduce ? false : { opacity: 0, scale: 0.6, rotate: tilt - 30 }}
        animate={{ opacity: 1, scale: 1, rotate: tilt }}
        whileHover={{ scale: 1.04, rotate: tilt * 0.6 }}
        whileDrag={{ scale: 1.1, rotate: tilt + 5, cursor: 'grabbing' }}
        transition={{ type: 'spring', stiffness: 260, damping: 18, delay: reduce ? 0 : Math.min(index, 18) * 0.035 }}
        className="pointer-events-auto absolute top-0 left-0 block cursor-grab touch-none select-none"
        style={{ x, y, width }}
        draggable={false}
      >
        {cutout ? (
          <PhotoImg photo={cover} cutout className="h-auto w-full cutout-shadow" alt="" />
        ) : (
          <div className="rounded-[3px] bg-[#fbfbf7] p-1.5 pb-6 lift-lg">
            <PhotoImg
              photo={cover}
              className="aspect-[4/5] w-full rounded-[2px] object-cover"
              alt=""
              fallback={
                <Garment
                  kind={GARMENT_KINDS[Math.floor(seeded(item.id, 9) * GARMENT_KINDS.length)]!}
                  fill="var(--line)"
                  className="w-2/3"
                />
              }
            />
            <span className="absolute right-2 bottom-1.5 left-2 truncate text-left text-[0.7rem] font-medium text-[#4c4d63]">
              {item.brand || item.title || 'Untitled'}
            </span>
            <span className="tape absolute -top-2.5 left-1/2 h-5 w-14 -translate-x-1/2 rotate-[-4deg]" aria-hidden />
          </div>
        )}
        <PriceTag
          className={cx('absolute -right-3 bottom-6', item.price == null && '!bg-sticker')}
          style={{ transform: `rotate(${-tilt * 0.8 + 8}deg)` }}
        >
          {item.price == null ? 'price?' : money(item.price, item.currency || currency)}
        </PriceTag>
        {item.status === 'listed' && (
          <span className="absolute -top-1 -left-1 rounded-full bg-mint px-1.5 py-0.5 text-[0.65rem] font-bold text-[#16172b] shadow">
            {(item.listings ?? []).filter(l => l.status === 'listed').length} live
          </span>
        )}
        {sold && (
          <span className="stamp-in absolute inset-x-0 top-1/3 mx-auto w-fit rounded-md border-4 border-tag px-2 font-display text-2xl font-extrabold text-tag">
            SOLD
          </span>
        )}
      </motion.a>
    </motion.div>
  );
}

function EmptyFloor() {
  return (
    <div className="relative mt-6 flex min-h-[55dvh] flex-1 flex-col items-center justify-center gap-5 rounded-3xl border-2 border-dashed border-floor-ink/35 p-6 text-center">
      <div className="flex items-end gap-2 opacity-90" aria-hidden>
        <Garment kind="jacket" fill="var(--sticker)" className="w-24 -rotate-12 cutout-shadow" />
        <Garment kind="tee" fill="var(--tag)" className="w-20 rotate-6 cutout-shadow" />
        <Garment kind="jeans" fill="var(--mint)" className="w-14 rotate-[14deg] cutout-shadow" />
      </div>
      <h2 className="font-display text-3xl font-extrabold">Start with one thing from the pile</h2>
      <p className="max-w-md text-floor-ink/80">
        Lay it flat in good light and take two or three photos, front, back and the label. Or drop photos anywhere on this floor.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <Link to="/scan" className="btn btn-tag text-base">
          <ScanLine className="size-5" aria-hidden />
          Scan an item
        </Link>
        <Link to="/settings#import" className="btn bg-floor-deep text-floor-ink hover:bg-floor-deep/80">
          <ImagePlus className="size-5" aria-hidden />
          Import existing listings
        </Link>
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
      animate={{ y: 0, opacity: 1, rotate: 1.4 }}
      transition={{ type: 'spring', stiffness: 160, damping: 16, delay: 0.2 }}
      className="receipt-edge grain mx-auto w-full max-w-sm rounded-t-lg bg-paper px-5 pt-5 pb-9 text-ink lift-lg"
    >
      <p className="text-center font-display text-lg font-bold">pileGo</p>
      <p className="text-center text-xs text-muted">
        {new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
      </p>
      <dl className="mt-4 flex flex-col gap-1.5 border-y border-dashed border-line py-3 text-sm">
        {lines.map(([k, v]) => (
          <div key={k} className="flex items-baseline gap-2">
            <dt className="text-ink-2">{k}</dt>
            <span className="flex-1 border-b border-dotted border-line" aria-hidden />
            <dd className="font-semibold tabular">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="flex items-baseline justify-between py-3">
        <span className="font-display text-lg font-bold">Taken this month</span>
        <span className="font-display text-2xl font-extrabold tabular">{money(stats.takenMonth, currency)}</span>
      </div>
      <div className="border-t border-dashed border-line pt-3">
        <p className="hand text-xl text-floor">Next up</p>
        {todo.length ? (
          <ul className="mt-1 flex flex-col">
            {todo.map(t => (
              <li key={t.key}>
                <Link
                  to={t.to}
                  className={cx(
                    'flex items-start gap-2 rounded-md py-1.5 text-sm hover:bg-paper-2',
                    t.tone === 'urgent' ? 'font-semibold text-danger' : 'text-ink',
                  )}
                >
                  <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-current" />
                  {t.text}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-sm text-ink-2">All caught up. Scan something new.</p>
        )}
      </div>
    </motion.div>
  );
}
