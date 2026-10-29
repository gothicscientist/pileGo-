// Small pieces of the pileGo look: marketplace stickers, tier labels, status
// tags and photos that load from private storage.

import { AUTO_POST_EXPLAINER, AUTO_POST_LABEL, MARKETPLACES, TIER_EXPLAINER, TIER_LABEL, type ItemStatus, type ListingStatus, type MarketplaceId, type Photo, type Tier } from '@pilego/core';
import { ClipboardCopy, Hand, ImageOff, MousePointerClick, Shirt, Zap } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import depopIcon from '~/assets/marketplaces/depop.png';
import ebayIcon from '~/assets/marketplaces/ebay.png';
import grailedIcon from '~/assets/marketplaces/grailed.png';
import mercariIcon from '~/assets/marketplaces/mercari.png';
import poshmarkIcon from '~/assets/marketplaces/poshmark.png';
import vintedIcon from '~/assets/marketplaces/vinted.png';
import { cx, seeded } from '~/lib/format';
import { usePhotoUrls } from '~/lib/queries';

export function marketName(id: MarketplaceId, _short = false): string {
  return MARKETPLACES[id].name;
}

const ICON: Record<MarketplaceId, string> = {
  ebay: ebayIcon,
  vinted: vintedIcon,
  depop: depopIcon,
  poshmark: poshmarkIcon,
  mercari: mercariIcon,
  grailed: grailedIcon,
};

/** The marketplace's own app icon, as a small coin. */
export function MarketIcon({ id, className, title }: { id: MarketplaceId; className?: string; title?: boolean }) {
  return (
    <img
      src={ICON[id]}
      alt={title ? MARKETPLACES[id].name : ''}
      title={title ? MARKETPLACES[id].name : undefined}
      aria-hidden={title ? undefined : true}
      draggable={false}
      className={cx('inline-block size-4 shrink-0 rounded-full bg-white object-cover shadow-[0_0_0_1px_rgb(0_0_0/0.08)]', className)}
    />
  );
}

/** A marketplace as a small paper label: its icon, its name, a slight tilt. */
export function Sticker({
  id,
  size = 'md',
  tilt = true,
  className,
  muted,
}: {
  id: MarketplaceId;
  size?: 'sm' | 'md' | 'lg';
  tilt?: boolean;
  className?: string;
  muted?: boolean;
}) {
  const rotate = tilt ? (seeded(id) - 0.5) * 5 : 0;
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full bg-card font-medium whitespace-nowrap text-ink shadow-[inset_0_0_0_1px_var(--line),0_1px_1px_rgb(0_0_0/0.05)]',
        size === 'sm' && 'px-2 py-0.5 text-[0.72rem]',
        size === 'md' && 'px-2.5 py-1 text-sm',
        size === 'lg' && 'px-3.5 py-1.5 text-base',
        muted && 'opacity-45 grayscale',
        className,
      )}
      style={{ transform: `rotate(${rotate.toFixed(1)}deg)` }}
    >
      <MarketIcon id={id} className={cx(size === 'sm' ? 'size-3.5' : size === 'md' ? 'size-4' : 'size-5', '-ml-0.5')} />
      {marketName(id, true)}
    </span>
  );
}

const TIER_ICON: Record<Tier, typeof Zap> = {
  api: Zap,
  extension: MousePointerClick,
  assist: Hand,
  manual: ClipboardCopy,
};

/** How a marketplace lists. Pass `auto` for an assisted one where the extension also posts. */
export function TierLabel({ tier, auto, className, explain }: { tier: Tier; auto?: boolean; className?: string; explain?: boolean }) {
  const Icon = auto ? Zap : TIER_ICON[tier];
  const label = auto ? AUTO_POST_LABEL : TIER_LABEL[tier];
  const explainer = auto ? AUTO_POST_EXPLAINER : TIER_EXPLAINER[tier];
  return (
    <span className={cx('inline-flex items-center gap-1 text-xs font-semibold text-ink-2', className)} title={explainer}>
      <Icon className="size-3.5" aria-hidden />
      {label}
      {explain && <span className="font-normal text-muted">: {explainer}</span>}
    </span>
  );
}

const ITEM_STATUS: Record<ItemStatus, { label: string; style: string }> = {
  draft: { label: 'Draft', style: 'bg-paper-2 text-ink-2' },
  ready: { label: 'Ready', style: 'kraft' },
  listed: { label: 'Listed', style: 'bg-olive/25 text-[var(--olive-deep)] dark:text-olive' },
  sold: { label: 'Sold', style: 'bg-pink/60 text-[#5a3344] dark:text-ink' },
  shipped: { label: 'Shipped', style: 'bg-ink text-paper' },
  archived: { label: 'Archived', style: 'bg-paper-2 text-muted' },
};

export function ItemStatusTag({ status, className }: { status: ItemStatus; className?: string }) {
  const s = ITEM_STATUS[status];
  return <span className={cx('inline-flex rounded-full px-2 py-0.5 text-xs font-semibold', s.style, className)}>{s.label}</span>;
}

const LISTING_STATUS: Record<ListingStatus, { label: string; style: string }> = {
  draft: { label: 'Not listed', style: 'text-muted' },
  queued: { label: 'Waiting', style: 'text-ink-2' },
  publishing: { label: 'Going up', style: 'text-accent' },
  listed: { label: 'Live', style: 'text-[var(--olive-deep)] dark:text-olive' },
  needs_action: { label: 'Needs you', style: 'text-danger' },
  failed: { label: 'Failed', style: 'text-danger' },
  delisting: { label: 'Coming down', style: 'text-ink-2' },
  delisted: { label: 'Ended', style: 'text-muted' },
  sold: { label: 'Sold', style: 'text-rose' },
};

export function ListingStatusText({ status, className }: { status: ListingStatus; className?: string }) {
  const s = LISTING_STATUS[status];
  const pulsing = status === 'queued' || status === 'publishing' || status === 'delisting';
  return (
    <span className={cx('inline-flex items-center gap-1.5 text-sm font-semibold', s.style, className)}>
      <span className={cx('size-2 rounded-full bg-current', pulsing && 'animate-pulse')} aria-hidden />
      {s.label}
    </span>
  );
}

export function listingStatusLabel(status: ListingStatus): string {
  return LISTING_STATUS[status].label;
}

/** Image from the private photos bucket. Falls back to a quiet placeholder. */
export function PhotoImg({
  photo,
  cutout,
  className,
  style,
  alt = '',
  fallback,
  draggable = false,
  onLoad,
}: {
  photo: Pick<Photo, 'path' | 'cutout_path'> | null | undefined;
  cutout?: boolean;
  className?: string;
  style?: CSSProperties;
  alt?: string;
  fallback?: ReactNode;
  draggable?: boolean;
  onLoad?: (e: React.SyntheticEvent<HTMLImageElement>) => void;
}) {
  const path = photo ? (cutout && photo.cutout_path ? photo.cutout_path : photo.path) : null;
  const { data, isError } = usePhotoUrls([path]);
  const url = path ? data?.[path] : undefined;
  if (!photo || isError) {
    return (
      <div className={cx('flex items-center justify-center bg-paper-2 text-muted', className)} style={style}>
        {fallback ?? (photo ? <ImageOff className="size-6" aria-hidden /> : <Shirt className="size-8" aria-hidden />)}
      </div>
    );
  }
  if (!url) return <div className={cx('skeleton', className)} style={style} />;
  return <img src={url} alt={alt} className={className} style={style} draggable={draggable} loading="lazy" decoding="async" onLoad={onLoad} />;
}

/** Price on a kraft hang tag laid sideways: the pointed end, the punched hole, the number. */
export function PriceTag({
  children,
  className,
  style,
  empty,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** No price yet: the tag is blank card with a pencilled question. */
  empty?: boolean;
}) {
  return (
    <span
      className={cx(
        'relative inline-flex items-center rounded-r-[5px] py-0.5 pr-2 pl-[1.1rem] text-sm font-semibold tracking-tight tabular',
        empty ? 'bg-card text-muted shadow-[inset_0_0_0_1px_var(--line)]' : 'kraft',
        className,
      )}
      style={{ clipPath: 'polygon(10px 0, 100% 0, 100% 100%, 10px 100%, 0 50%)', ...style }}
    >
      <span className="absolute top-1/2 left-[6px] size-[5px] -translate-y-1/2 rounded-full bg-paper shadow-[inset_0_1px_1px_rgb(0_0_0/0.35)]" aria-hidden />
      {children}
    </span>
  );
}

/**
 * The tag that hangs off a piece: kraft card on a string, the price big and a
 * small line under it. It swings when the piece is nudged (see .swing).
 */
export function HangTag({
  price,
  note,
  className,
  style,
  empty,
}: {
  price: ReactNode;
  note?: ReactNode;
  className?: string;
  style?: CSSProperties;
  empty?: boolean;
}) {
  return (
    <span className={cx('pointer-events-none absolute flex flex-col items-center', className)} style={style} aria-hidden>
      <svg viewBox="0 0 24 22" className="-mb-1 h-[18px] w-5 overflow-visible" aria-hidden>
        <path d="M4 0 C 2 9, 18 6, 12 20" fill="none" stroke="#efe9dc" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M4 0 C 2 9, 18 6, 12 20" fill="none" stroke="rgb(0 0 0 / 0.18)" strokeWidth="0.6" strokeLinecap="round" />
      </svg>
      <span
        className={cx(
          'relative flex min-w-[2.9rem] flex-col items-center rounded-[4px] px-1.5 pt-3 pb-1 text-center shadow-[0_1px_1px_rgb(0_0_0/0.12),0_8px_14px_-8px_rgb(0_0_0/0.4)]',
          empty ? 'bg-card text-muted' : 'kraft',
        )}
        style={{ clipPath: 'polygon(22% 0, 78% 0, 100% 16%, 100% 100%, 0 100%, 0 16%)' }}
      >
        <span className="absolute top-1 left-1/2 size-[7px] -translate-x-1/2 rounded-full bg-paper shadow-[inset_0_1px_1.5px_rgb(0_0_0/0.4)] ring-1 ring-[rgb(0_0_0/0.06)]" />
        <span className="text-[0.82rem] leading-none font-semibold tracking-tight tabular">{price}</span>
        {note && <span className="mt-0.5 text-[0.55rem] leading-none font-semibold opacity-75">{note}</span>}
      </span>
    </span>
  );
}

