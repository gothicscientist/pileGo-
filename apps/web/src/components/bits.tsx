// Small pieces of the pileGo look: marketplace stickers, tier labels, status
// tags and photos that load from private storage.

import { AUTO_POST_EXPLAINER, AUTO_POST_LABEL, MARKETPLACES, TIER_EXPLAINER, TIER_LABEL, type ItemStatus, type ListingStatus, type MarketplaceId, type Photo, type Tier } from '@pilego/core';
import { ClipboardCopy, Hand, ImageOff, MousePointerClick, Shirt, Zap } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { cx, inkOn, seeded } from '~/lib/format';
import { usePhotoUrls } from '~/lib/queries';

const SHORT_NAME: Partial<Record<MarketplaceId, string>> = {
  facebook: 'Facebook',
  vestiaire: 'Vestiaire',
};

export function marketName(id: MarketplaceId, short = false): string {
  return (short && SHORT_NAME[id]) || MARKETPLACES[id].name;
}

/** A marketplace as a sticker: its colour, its name, a slight tilt. */
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
  const color = MARKETPLACES[id].color;
  const rotate = tilt ? (seeded(id) - 0.5) * 7 : 0;
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-md font-display font-bold whitespace-nowrap shadow-[0_1px_0_rgb(0_0_0/0.18)]',
        size === 'sm' && 'px-1.5 py-0.5 text-[0.7rem]',
        size === 'md' && 'px-2 py-1 text-sm',
        size === 'lg' && 'px-3 py-1.5 text-lg',
        muted && 'opacity-45 grayscale',
        className,
      )}
      style={{ background: color, color: inkOn(color), transform: `rotate(${rotate.toFixed(1)}deg)` }}
    >
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
  ready: { label: 'Ready', style: 'bg-sticker text-[#16172b]' },
  listed: { label: 'Listed', style: 'bg-mint text-[#16172b]' },
  sold: { label: 'Sold', style: 'bg-tag text-tag-ink' },
  shipped: { label: 'Shipped', style: 'bg-ink text-paper' },
  archived: { label: 'Archived', style: 'bg-paper-2 text-muted' },
};

export function ItemStatusTag({ status, className }: { status: ItemStatus; className?: string }) {
  const s = ITEM_STATUS[status];
  return <span className={cx('inline-flex rounded px-1.5 py-0.5 text-xs font-bold', s.style, className)}>{s.label}</span>;
}

const LISTING_STATUS: Record<ListingStatus, { label: string; style: string }> = {
  draft: { label: 'Not listed', style: 'text-muted' },
  queued: { label: 'Waiting', style: 'text-ink-2' },
  publishing: { label: 'Going up', style: 'text-floor' },
  listed: { label: 'Live', style: 'text-[#0d7a52] dark:text-mint' },
  needs_action: { label: 'Needs you', style: 'text-danger' },
  failed: { label: 'Failed', style: 'text-danger' },
  delisting: { label: 'Coming down', style: 'text-ink-2' },
  delisted: { label: 'Ended', style: 'text-muted' },
  sold: { label: 'Sold', style: 'text-tag' },
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
}: {
  photo: Pick<Photo, 'path' | 'cutout_path'> | null | undefined;
  cutout?: boolean;
  className?: string;
  style?: CSSProperties;
  alt?: string;
  fallback?: ReactNode;
  draggable?: boolean;
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
  return <img src={url} alt={alt} className={className} style={style} draggable={draggable} loading="lazy" decoding="async" />;
}

/** Hang-tag price: the string, the hole, the number. */
export function PriceTag({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <span
      className={cx(
        'relative inline-flex items-center rounded-r-md bg-tag py-0.5 pr-2 pl-4 font-display text-sm font-bold text-tag-ink tabular',
        className,
      )}
      style={{ clipPath: 'polygon(9px 0, 100% 0, 100% 100%, 9px 100%, 0 50%)', ...style }}
    >
      <span className="absolute top-1/2 left-[6px] size-1.5 -translate-y-1/2 rounded-full bg-paper" aria-hidden />
      {children}
    </span>
  );
}
