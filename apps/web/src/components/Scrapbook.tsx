// Scrapbook pieces: real clothing cutouts with a white paper edge, instant
// photos with tape, and the kraft tag. Each one can be picked up and dropped,
// and settles back with a little spring.

import { motion, useReducedMotion, type MotionStyle } from 'motion/react';
import type { CSSProperties, ReactNode, RefObject } from 'react';
import { CUTOUTS, type CutoutId } from '~/lib/art';
import { cx } from '~/lib/format';

export interface Placement {
  /** Left and top inside the board, as CSS lengths. */
  x: string;
  y: string;
  /** Width as a CSS length. */
  w: string;
  r: number;
  z?: number;
  /** Shown on phones too. Off by default so small screens stay clear. */
  phone?: boolean;
}

const settle = { type: 'spring', stiffness: 170, damping: 15 } as const;

/** A real garment, cut out with a sticker edge. Drag it anywhere on the board. */
export function CutoutPiece({
  id,
  at,
  board,
  index = 0,
  sticker = true,
  className,
}: {
  id: CutoutId;
  at: Placement;
  board?: RefObject<HTMLElement | null>;
  index?: number;
  sticker?: boolean;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const c = CUTOUTS[id];
  return (
    <motion.div
      drag={Boolean(board)}
      dragConstraints={board}
      dragElastic={0.18}
      dragTransition={{ power: 0.2, timeConstant: 240 }}
      initial={reduce ? false : { opacity: 0, y: -36, rotate: at.r - 16, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, rotate: at.r, scale: 1 }}
      whileHover={reduce ? undefined : { scale: 1.035, rotate: at.r * 0.7, y: -4 }}
      whileTap={{ scale: 1.06, rotate: at.r + 3 }}
      whileDrag={{ scale: 1.08, rotate: at.r + 5, zIndex: 40 }}
      transition={{ ...settle, delay: reduce ? 0 : 0.12 + index * 0.06 }}
      className={cx('absolute touch-none select-none', board && 'cursor-grab active:cursor-grabbing', !at.phone && 'max-md:hidden', className)}
      style={{ left: at.x, top: at.y, width: at.w, zIndex: at.z ?? 1 } as MotionStyle}
    >
      <img
        src={c.src}
        alt=""
        draggable={false}
        className={cx('pointer-events-none h-auto w-full', sticker ? 'cutout-sticker' : 'cutout-shadow')}
        style={{ aspectRatio: String(c.ratio) }}
        decoding="async"
      />
    </motion.div>
  );
}

/** An instant photo with a caption and a strip of tape. */
export function Polaroid({
  src,
  caption,
  at,
  board,
  index = 0,
  className,
  style,
}: {
  src: string;
  caption?: ReactNode;
  at?: Placement;
  board?: RefObject<HTMLElement | null>;
  index?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const reduce = useReducedMotion();
  const r = at?.r ?? 0;
  return (
    <motion.figure
      drag={Boolean(board)}
      dragConstraints={board}
      dragElastic={0.18}
      initial={reduce ? false : { opacity: 0, y: 24, rotate: r - 10 }}
      animate={{ opacity: 1, y: 0, rotate: r }}
      whileHover={reduce ? undefined : { rotate: r * 0.5, y: -5, scale: 1.02 }}
      whileDrag={{ scale: 1.06, rotate: r - 3, zIndex: 40 }}
      transition={{ ...settle, delay: reduce ? 0 : 0.2 + index * 0.07 }}
      className={cx(
        'polaroid m-0 touch-none select-none',
        at && 'absolute',
        at && !at.phone && 'max-md:hidden',
        board && 'cursor-grab active:cursor-grabbing',
        className,
      )}
      style={(at ? { left: at.x, top: at.y, width: at.w, zIndex: at.z ?? 1, ...style } : style) as MotionStyle}
    >
      <span className="tape absolute -top-3 left-1/2 h-5 w-16 -translate-x-1/2 -rotate-3" aria-hidden />
      <img src={src} alt="" draggable={false} className="pointer-events-none aspect-[4/5] w-full rounded-[1px] object-cover" decoding="async" />
      {caption && (
        <figcaption className="absolute right-2 bottom-2 left-2.5 truncate text-[0.72rem] font-medium tracking-tight text-[#53575a]">
          {caption}
        </figcaption>
      )}
    </motion.figure>
  );
}

/** A loose kraft tag: "$18, your find". Swings on hover. */
export function LooseTag({ price, note, className, style }: { price: ReactNode; note?: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <motion.div
      initial={{ opacity: 0, rotate: 18, y: -20 }}
      animate={{ opacity: 1, rotate: 8, y: 0 }}
      transition={{ type: 'spring', stiffness: 140, damping: 10, delay: 0.6 }}
      className={cx('swing-on-hover absolute origin-top', className)}
      style={style}
    >
      <div className="swing origin-top">
        <div
          className="kraft relative flex w-[4.6rem] flex-col items-center rounded-[6px] px-2 pt-5 pb-3 text-center shadow-[0_2px_2px_rgb(0_0_0/0.1),0_18px_24px_-14px_rgb(0_0_0/0.45)]"
          style={{ clipPath: 'polygon(24% 0, 76% 0, 100% 14%, 100% 100%, 0 100%, 0 14%)' }}
        >
          <span className="absolute top-2 left-1/2 size-2.5 -translate-x-1/2 rounded-full bg-paper shadow-[inset_0_1px_2px_rgb(0_0_0/0.4)]" />
          <span className="text-2xl leading-none font-semibold tracking-tight tabular">{price}</span>
          {note && <span className="mt-1.5 text-[0.55rem] font-semibold tracking-[0.14em] uppercase opacity-75">{note}</span>}
        </div>
      </div>
    </motion.div>
  );
}
