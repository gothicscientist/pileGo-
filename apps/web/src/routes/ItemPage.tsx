import {
  feeFor,
  feeRule,
  generateListing,
  MARKETPLACES,
  priceOn,
  roundPrice,
  takeHome,
  type Item,
  type Listing,
} from '@pilego/core';
import {
  Archive,
  ArrowLeft,
  ExternalLink,
  ImagePlus,
  PackageCheck,
  RefreshCw,
  RotateCcw,
  Scissors,
  Search,
  Star,
  Trash2,
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { JobRow } from '~/components/JobRow';
import { HangTag, ItemStatusTag, ListingStatusText, MarketIcon, PhotoImg, PriceTag, Sticker, TierLabel } from '~/components/bits';
import { CrossListSheet } from '~/components/CrossListSheet';
import { EbayAspects, missingEbayAspects } from '~/components/EbayAspects';
import { diffForm, formFromItem, ItemForm, type FormValue } from '~/components/ItemForm';
import { ListingKit } from '~/components/ListingKit';
import { PricePicker } from '~/components/PricePicker';
import { Sheet, useToast } from '~/components/overlay';
import { SaleSheet } from '~/components/SaleSheet';
import { Button, Empty, ErrorNote, Paper, Spinner } from '~/components/ui';
import { useUserId } from '~/lib/auth';
import { ago, cx, daysSince, money, shortDate } from '~/lib/format';
import { imageFiles } from '~/lib/handoff';
import {
  fetchPhotoBlob,
  stageCutout,
  useAddPhotos,
  useDeleteItem,
  useEvents,
  useItem,
  useJobs,
  useListingJob,
  usePhotoActions,
  usePriceComps,
  useProfile,
  useRemoveListing,
  useUpdateItem,
  useUpdateListing,
  type PriceCompsResult,
} from '~/lib/queries';
import { errorMessage } from '~/lib/supabase';

type Tab = 'details' | 'listings' | 'price' | 'history';
const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'details', label: 'Details' },
  { id: 'listings', label: 'Listings' },
  { id: 'price', label: 'Price' },
  { id: 'history', label: 'History' },
];

export function ItemPage() {
  const { id } = useParams();
  const { data: item, isLoading } = useItem(id);
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find(t => t.id === params.get('tab'))?.id ?? 'details') as Tab;
  const crossOpen = params.get('crosslist') === '1';
  const [saleOpen, setSaleOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const update = useUpdateItem();
  const del = useDeleteItem();
  const navigate = useNavigate();
  const toast = useToast();
  const reduce = useReducedMotion();

  const setParam = (key: string, value: string | null) =>
    setParams(
      p => {
        const n = new URLSearchParams(p);
        if (value == null) n.delete(key);
        else n.set(key, value);
        return n;
      },
      { replace: true },
    );

  if (isLoading && !item) {
    return (
      <div className="flex min-h-[50dvh] items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (!item) {
    return (
      <div className="mx-auto max-w-xl px-5 py-16">
        <Empty title="That item is gone" action={<Link to="/closet" className="btn btn-ink">Back to your closet</Link>}>
          It may have been deleted on another device.
        </Empty>
      </div>
    );
  }

  const sold = item.status === 'sold' || item.status === 'shipped';
  const liveCount = (item.listings ?? []).filter(l => l.status === 'listed').length;

  return (
    <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 lg:py-8">
      <Link to="/closet" className="group mb-5 inline-flex items-center gap-1.5 rounded-full py-1 pr-3 text-sm font-medium text-ink-2 transition hover:text-ink">
        <ArrowLeft className="size-4 transition-transform duration-300 ease-[var(--ease-spring)] group-hover:-translate-x-1" aria-hidden />
        Closet
      </Link>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,24rem)_1fr] lg:gap-10">
        <Photos item={item} />

        <div className="min-w-0">
          <header className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <ItemStatusTag status={item.status} />
              <span className="label-caps text-muted tabular">{item.sku}</span>
              {item.location && <span className="label-caps text-muted">at {item.location}</span>}
            </div>
            <h1 className="font-display text-[clamp(2.3rem,5vw,3.6rem)] leading-[0.95]">{item.title || 'Untitled item'}</h1>
            <p className="flex flex-wrap items-center gap-3">
              <PriceTag empty={!sold && item.price == null} className="py-1 pr-3.5 pl-6 text-xl">
                {sold ? `Sold for ${money(item.sold_price, item.currency)}` : item.price == null ? 'No price yet' : money(item.price, item.currency)}
              </PriceTag>
              {liveCount > 0 && !sold && <span className="text-sm font-medium text-ink-2">live on {liveCount}</span>}
            </p>
            <div className="flex flex-wrap gap-2">
              {!sold && (
                <>
                  <Button variant="tag" className="text-base" onClick={() => setParam('crosslist', '1')}>
                    Cross-list
                  </Button>
                  <Button variant="ink" onClick={() => setSaleOpen(true)}>
                    Mark sold
                  </Button>
                </>
              )}
              {item.status === 'sold' && (
                <Button
                  variant="ink"
                  icon={<PackageCheck className="size-4" aria-hidden />}
                  busy={update.isPending}
                  onClick={() => update.mutate({ id: item.id, patch: { status: 'shipped' } }, { onSuccess: () => toast('Marked as shipped') })}
                >
                  Mark shipped
                </Button>
              )}
              {item.status !== 'archived' && !sold && liveCount === 0 && (
                <Button
                  variant="ghost"
                  icon={<Archive className="size-4" aria-hidden />}
                  onClick={() => update.mutate({ id: item.id, patch: { status: 'archived' } }, { onSuccess: () => toast('Archived') })}
                >
                  Archive
                </Button>
              )}
              {item.status === 'archived' && (
                <Button variant="ghost" onClick={() => update.mutate({ id: item.id, patch: { status: 'draft' } })}>
                  Back to drafts
                </Button>
              )}
              <Button variant="ghost" icon={<Trash2 className="size-4" aria-hidden />} onClick={() => setConfirmDelete(true)}>
                Delete
              </Button>
            </div>
          </header>

          <div role="tablist" aria-label="Item sections" className="scrollbar-none mt-7 flex gap-1 overflow-x-auto border-b border-line">
            {TABS.map(t => (
              <button
                key={t.id}
                role="tab"
                type="button"
                aria-selected={tab === t.id}
                onClick={() => setParam('tab', t.id === 'details' ? null : t.id)}
                className={cx(
                  'relative shrink-0 px-3.5 pt-2 pb-3 text-sm font-medium transition-colors active:scale-95',
                  tab === t.id ? 'text-ink' : 'text-muted hover:text-ink',
                )}
              >
                {t.label}
                {tab === t.id && (
                  <motion.span
                    layoutId="item-tab"
                    className="absolute inset-x-2 -bottom-px h-[3px] rounded-full bg-accent"
                    transition={{ type: 'spring', stiffness: 460, damping: 36 }}
                    aria-hidden
                  />
                )}
              </button>
            ))}
          </div>

          <motion.div
            key={tab}
            className="pt-5"
            role="tabpanel"
            initial={reduce ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 26 }}
          >
            {tab === 'details' && <Details key={item.id} item={item} />}
            {tab === 'listings' && <Listings item={item} onCrossList={() => setParam('crosslist', '1')} />}
            {tab === 'price' && <PriceTab item={item} />}
            {tab === 'history' && <History item={item} />}
          </motion.div>
        </div>
      </div>

      <CrossListSheet item={item} open={crossOpen} onClose={() => setParam('crosslist', null)} />
      <SaleSheet item={item} open={saleOpen} onClose={() => setSaleOpen(false)} />
      <Sheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this item?"
        footer={
          <div className="flex gap-2">
            <Button
              variant="danger"
              busy={del.isPending}
              onClick={async () => {
                try {
                  await del.mutateAsync(item);
                  toast('Deleted');
                  navigate('/closet', { replace: true });
                } catch (err) {
                  toast(errorMessage(err), { tone: 'error' });
                }
              }}
            >
              Delete for good
            </Button>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Keep it
            </Button>
          </div>
        }
      >
        <p className="text-ink-2">
          This deletes the photos and everything pileGo! keeps about it. {liveCount > 0 && 'Listings that are live stay live on the marketplaces; end them first.'}
        </p>
      </Sheet>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Photos({ item }: { item: Item }) {
  const uid = useUserId();
  const photos = item.photos ?? [];
  const [index, setIndex] = useState(0);
  const [showCut, setShowCut] = useState(true);
  const [cutting, setCutting] = useState<number | null>(null);
  const add = useAddPhotos();
  const { remove, makeCover, setCutout } = usePhotoActions();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const current = photos[Math.min(index, photos.length - 1)];
  const reduce = useReducedMotion();
  const [nudge, setNudge] = useState(0);
  const onCutout = Boolean(current?.cutout_path && showCut);

  async function cut() {
    if (!current) return;
    setCutting(0);
    try {
      const blob = await fetchPhotoBlob(current.path);
      const { cutout_path } = await stageCutout(uid, item.id, current.id, blob, p => setCutting(p));
      await setCutout.mutateAsync({ itemId: item.id, photoId: current.id, cutout_path });
      setShowCut(true);
    } catch (err) {
      toast(`Cutout failed: ${errorMessage(err)}`, { tone: 'error' });
    } finally {
      setCutting(null);
    }
  }

  return (
    <div className="flex flex-col gap-3 lg:sticky lg:top-6 lg:self-start">
      <div
        className={cx('swing-on-hover relative aspect-[4/5] overflow-hidden rounded-[22px] lift', onCutout ? 'grain bg-paper-2' : 'bg-paper-2')}
        onPointerDown={() => setNudge(n => n + 1)}
      >
        {current ? (
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={`${current.id}-${onCutout}`}
              className="absolute inset-0"
              initial={reduce ? false : onCutout ? { opacity: 0, y: -24, rotate: -4, scale: 0.94 } : { opacity: 0, scale: 1.03 }}
              animate={{ opacity: 1, y: 0, rotate: onCutout ? -1.5 : 0, scale: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.15 } }}
              transition={{ type: 'spring', stiffness: 200, damping: 20 }}
            >
              <PhotoImg
                photo={current}
                cutout={showCut}
                className={cx('absolute inset-0 size-full', onCutout ? 'object-contain p-8 cutout-shadow' : 'object-cover')}
                alt={item.title}
              />
            </motion.div>
          </AnimatePresence>
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-2 text-muted">
            <ImagePlus className="size-8" aria-hidden />
            No photos yet
          </div>
        )}
        {onCutout && (
          <span key={nudge} className={cx('swing absolute top-5 right-7 z-[2] origin-top', nudge > 0 && 'swing-now')}>
            <HangTag
              price={item.price == null ? '?' : money(item.price, item.currency)}
              note={item.size ? `Size ${item.size}` : 'Your find'}
              empty={item.price == null}
              className="relative"
            />
          </span>
        )}
        {cutting != null && (
          <div className="absolute inset-x-3 bottom-3 z-[3] rounded-xl bg-ink/85 px-3 py-2 text-xs text-paper backdrop-blur">
            Cutting out
            <div className="mt-1 h-1 overflow-hidden rounded bg-white/20">
              <div className="h-full bg-accent" style={{ width: `${Math.round(cutting * 100)}%` }} />
            </div>
          </div>
        )}
      </div>

      {current && (
        <div className="flex flex-wrap gap-1.5">
          {current.cutout_path ? (
            <Button size="sm" variant="line" onClick={() => setShowCut(s => !s)}>
              {showCut ? 'Show photo' : 'Show cutout'}
            </Button>
          ) : (
            <Button size="sm" variant="line" icon={<Scissors className="size-4" aria-hidden />} disabled={cutting != null} onClick={cut}>
              Cut out
            </Button>
          )}
          {index > 0 && (
            <Button
              size="sm"
              variant="line"
              icon={<Star className="size-4" aria-hidden />}
              onClick={() => makeCover.mutate({ item, photoId: current.id }, { onSuccess: () => setIndex(0) })}
            >
              Make cover
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            icon={<Trash2 className="size-4" aria-hidden />}
            onClick={() => remove.mutate(current, { onSuccess: () => setIndex(0) })}
          >
            Remove
          </Button>
        </div>
      )}

      <ul className="grid grid-cols-5 gap-2">
        {photos.map((p, i) => (
          <li key={p.id}>
            <button
              type="button"
              aria-label={`Photo ${i + 1}`}
              aria-current={i === index}
              onClick={() => setIndex(i)}
              className={cx(
                'block aspect-square w-full overflow-hidden rounded-xl transition duration-300 ease-[var(--ease-spring)] hover:-translate-y-0.5 active:scale-95',
                i === index ? 'ring-2 ring-accent ring-offset-2 ring-offset-paper' : 'opacity-85 hover:opacity-100',
              )}
            >
              <PhotoImg photo={p} className="size-full object-cover" />
            </button>
          </li>
        ))}
        <li>
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={add.isPending}
            className="flex aspect-square w-full items-center justify-center rounded-xl border-2 border-dashed border-line text-muted transition hover:border-ink-2 hover:text-ink active:scale-95"
            aria-label="Add photos"
          >
            {add.isPending ? <Spinner /> : <ImagePlus className="size-5" aria-hidden />}
          </button>
          <input
            ref={input}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={e => {
              const files = imageFiles(e.target.files);
              e.target.value = '';
              if (files.length) add.mutate({ item, uid, files }, { onError: err => toast(errorMessage(err), { tone: 'error' }) });
            }}
          />
        </li>
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Details({ item }: { item: Item }) {
  const { data: profile } = useProfile();
  const update = useUpdateItem();
  const toast = useToast();
  const base = useMemo(() => formFromItem(item), [item]);
  const [form, setForm] = useState<FormValue>(base);
  const [dirty, setDirty] = useState(false);

  // Take server changes while the seller has not started editing.
  useEffect(() => {
    if (!dirty) setForm(base);
  }, [base, dirty]);

  const patch = diffForm(base, form);
  const changed = Object.keys(patch).length > 0;

  return (
    <div>
      <ItemForm
        value={form}
        onChange={v => {
          setForm(v);
          setDirty(true);
        }}
        currency={item.currency}
        unit={profile?.measurement_unit ?? 'in'}
        scan={item.ai}
      />
      <div className={cx('z-10 mt-5 flex items-center gap-3 rounded-full bg-paper/90 py-3 backdrop-blur-md', changed && 'sticky bottom-24 md:bottom-4')}>
        <Button
          variant="ink"
          disabled={!changed}
          busy={update.isPending}
          onClick={() =>
            update.mutate(
              { id: item.id, patch },
              {
                onSuccess: () => {
                  setDirty(false);
                  toast('Saved');
                },
                onError: err => toast(errorMessage(err), { tone: 'error' }),
              },
            )
          }
        >
          Save changes
        </Button>
        {changed && (
          <Button
            variant="ghost"
            onClick={() => {
              setForm(base);
              setDirty(false);
            }}
          >
            Undo
          </Button>
        )}
        {changed && (item.listings ?? []).some(l => l.status === 'listed') && (
          <span className="text-sm text-muted">Live listings keep their text until you relist them.</span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Listings({ item, onCrossList }: { item: Item; onCrossList: () => void }) {
  const { data: jobs } = useJobs();
  const { data: profile } = useProfile();
  const listings = item.listings ?? [];
  const itemJobs = (jobs ?? []).filter(j => j.item_id === item.id && ['pending', 'running', 'needs_user', 'failed'].includes(j.status));
  const [kitFor, setKitFor] = useState<string | null>(null);

  if (!listings.length) {
    return (
      <Empty title="Not listed anywhere yet" action={item.status !== 'sold' && <Button variant="tag" onClick={onCrossList}>Cross-list</Button>}>
        Pick marketplaces, check each version, and pileGo! sends them out.
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {itemJobs.length > 0 && (
        <Paper className="p-4">
          <h3 className="mb-2 font-display text-lg">In progress</h3>
          <ul className="flex flex-col gap-2">
            {itemJobs.map(j => (
              <JobRow key={j.id} job={j} />
            ))}
          </ul>
        </Paper>
      )}
      <ul className="flex flex-col gap-3">
        {listings.map(l => (
          <li key={l.id}>
            <ListingRow
              item={item}
              listing={l}
              kitOpen={kitFor === l.id}
              onKit={() => setKitFor(k => (k === l.id ? null : l.id))}
              profile={profile}
            />
          </li>
        ))}
      </ul>
      {item.status !== 'sold' && item.status !== 'shipped' && (
        <Button variant="line" className="self-start" onClick={onCrossList}>
          List on more marketplaces
        </Button>
      )}
    </div>
  );
}

function ListingRow({
  item,
  listing,
  kitOpen,
  onKit,
  profile,
}: {
  item: Item;
  listing: Listing;
  kitOpen: boolean;
  onKit: () => void;
  profile: ReturnType<typeof useProfile>['data'];
}) {
  const info = MARKETPLACES[listing.marketplace];
  const job = useListingJob();
  const removeListing = useRemoveListing();
  const updateListing = useUpdateListing();
  const toast = useToast();
  const days = daysSince(listing.listed_at);
  const generated = useMemo(
    () =>
      generateListing(item, listing.marketplace, {
        voice: profile?.voice,
        region: profile?.region,
        strategy: profile?.price_strategy,
        fee_overrides: profile?.fee_overrides,
      }),
    [item, listing.marketplace, profile],
  );
  const kitGen = { ...generated, title: listing.title ?? generated.title, price: listing.price ?? generated.price };

  const run = (kind: 'delist' | 'relist') =>
    job.mutate(
      { listing, kind },
      {
        onSuccess: () => toast(kind === 'delist' ? `Ending it on ${info.name}` : `Relisting on ${info.name}`),
        onError: err => toast(errorMessage(err), { tone: 'error' }),
      },
    );

  const canRelist = info.capabilities.relist && info.capabilities.relist !== 'manual';
  const canDelist = info.capabilities.delist !== 'manual';

  return (
    <Paper className="p-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Sticker id={listing.marketplace} />
        <ListingStatusText status={listing.status} />
        <PriceTag empty={listing.price == null}>{money(listing.price, item.currency)}</PriceTag>
        {days != null && listing.status === 'listed' && <span className="text-sm text-muted">{days === 0 ? 'today' : `${days} days`}</span>}
        {listing.relist_count > 0 && <span className="text-sm text-muted">relisted {listing.relist_count}×</span>}
        {listing.external_url && (
          <a href={listing.external_url} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-sm font-semibold underline">
            View on {info.name}
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
        )}
      </div>
      <div className="mt-1">
        <TierLabel tier={info.capabilities.create} auto={info.auto_post} />
      </div>
      {listing.error && <ErrorNote error={listing.error} className="mt-3" />}
      <EbayAspects listing={listing} />
      <div className="mt-3 flex flex-wrap gap-2">
        {listing.status === 'listed' && canRelist && (
          <Button size="sm" variant="line" icon={<RefreshCw className="size-4" aria-hidden />} busy={job.isPending} onClick={() => run('relist')}>
            Relist
          </Button>
        )}
        {listing.status === 'listed' && canDelist && (
          <Button size="sm" variant="ghost" onClick={() => run('delist')} disabled={job.isPending}>
            End listing
          </Button>
        )}
        {(listing.status === 'delisted' || listing.status === 'failed') && item.status !== 'sold' && canRelist && (
          <Button size="sm" variant="line" icon={<RotateCcw className="size-4" aria-hidden />} onClick={() => run('relist')}>
            List again
          </Button>
        )}
        {listing.status === 'needs_action' && info.capabilities.create === 'api' && item.status !== 'sold' && !missingEbayAspects(listing).length && (
          <Button size="sm" variant="line" icon={<RotateCcw className="size-4" aria-hidden />} onClick={() => run('relist')}>
            Try again
          </Button>
        )}
        {listing.status === 'needs_action' && info.capabilities.create !== 'api' && (
          <Button
            size="sm"
            variant="line"
            onClick={() =>
              updateListing.mutate(
                { id: listing.id, patch: { status: item.status === 'sold' ? 'delisted' : 'listed', error: null } },
                { onError: err => toast(errorMessage(err), { tone: 'error' }) },
              )
            }
          >
            {item.status === 'sold' ? 'I removed it' : 'It is live now'}
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={onKit} aria-expanded={kitOpen}>
          {kitOpen ? 'Hide listing kit' : 'Listing kit'}
        </Button>
        {['draft', 'delisted', 'failed'].includes(listing.status) && (
          <Button size="sm" variant="ghost" onClick={() => removeListing.mutate(listing.id)}>
            Forget this listing
          </Button>
        )}
      </div>
      {kitOpen && (
        <div className="mt-4 border-t border-dashed border-line pt-4">
          <ListingKit item={item} listing={listing} generated={kitGen} />
        </div>
      )}
    </Paper>
  );
}

// ---------------------------------------------------------------------------

function PriceTab({ item }: { item: Item }) {
  const { data: profile } = useProfile();
  const comps = usePriceComps();
  const update = useUpdateItem();
  const job = useListingJob();
  const toast = useToast();
  const [result, setResult] = useState<PriceCompsResult | null>(null);
  const suggestion = result?.suggestion ?? item.price_suggestion;
  const [draft, setDraft] = useState<number | null>(item.price);
  useEffect(() => setDraft(item.price), [item.price]);
  const region = profile?.region ?? 'US';
  const markets = profile?.marketplaces?.length ? profile.marketplaces : (['ebay', 'vinted', 'depop', 'poshmark'] as const);
  const live = (item.listings ?? []).filter(l => l.status === 'listed');
  const days = daysSince(live.map(l => l.listed_at).filter(Boolean).sort()[0]);

  async function setPrice(price: number) {
    try {
      await update.mutateAsync({ id: item.id, patch: { price } });
      const ebay = live.find(l => l.marketplace === 'ebay');
      if (ebay) {
        const p = priceOn(price, 'ebay', region, profile?.price_strategy ?? 'same', profile?.fee_overrides);
        await job.mutateAsync({ listing: ebay, kind: 'update_price', payload: { price: p } });
      }
      const others = live.filter(l => l.marketplace !== 'ebay');
      toast(
        others.length
          ? `Price set to ${money(price, item.currency)}${ebay ? ', eBay updating' : ''}. Relist elsewhere to use it.`
          : `Price set to ${money(price, item.currency)}`,
      );
    } catch (err) {
      toast(errorMessage(err), { tone: 'error' });
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <Paper className="p-5" torn>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-xl">Suggested price</h3>
            {suggestion ? (
              <p className="mt-1 text-sm text-muted">
                {suggestion.confidence} confidence, {suggestion.comps_used} comparable{suggestion.comps_used === 1 ? '' : 's'}, checked{' '}
                {ago(suggestion.computed_at)}
              </p>
            ) : (
              <p className="mt-1 text-sm text-muted">
                Check what similar pieces sold for on eBay, Poshmark and Mercari and what live listings ask, then pick a price.
              </p>
            )}
          </div>
          <Button
            variant="line"
            icon={<Search className="size-4" aria-hidden />}
            busy={comps.isPending}
            onClick={() =>
              comps.mutate(item, {
                onSuccess: setResult,
                onError: err => toast(errorMessage(err), { tone: 'error' }),
              })
            }
          >
            {comps.isPending ? 'Checking prices' : suggestion ? 'Check again' : 'Check prices'}
          </Button>
        </div>

        {suggestion && (
          <div className="mt-4">
            <PricePicker suggestion={suggestion} currency={item.currency} value={draft} onChange={setDraft} disabled={item.status === 'sold'}>
              {item.status !== 'sold' && (
                <div>
                  <Button
                    variant="ink"
                    busy={update.isPending}
                    disabled={draft == null || draft === item.price}
                    onClick={() => draft != null && setPrice(draft)}
                  >
                    {draft != null && draft === item.price ? `Priced at ${money(draft, item.currency)}` : draft != null ? `Use ${money(draft, item.currency)}` : 'Pick a price'}
                  </Button>
                </div>
              )}
            </PricePicker>
            <details className="mt-4 text-sm text-ink-2">
              <summary className="cursor-pointer font-semibold text-ink">How this was worked out</summary>
              <ul className="mt-2 flex flex-col gap-1">
                {suggestion.reasons.map(r => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </details>
          </div>
        )}
        {result?.sources?.notes.length ? (
          <ul className="mt-3 flex flex-col gap-1 rounded-xl bg-paper-2 px-3 py-2 text-sm text-ink-2">
            {result.sources.notes.map(n => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        ) : null}
        {result?.error && <p className="mt-3 text-sm text-ink-2">{result.error}</p>}
      </Paper>

      {item.price != null && item.status !== 'sold' && days != null && days >= (profile?.stale_after_days ?? 30) && (
        <Paper className="flex flex-wrap items-center gap-3 p-4">
          <p className="flex-1 text-sm">
            Listed for {days} days without selling. A small drop or a relist puts it back at the top of buyers’ feeds.
          </p>
          <Button variant="line" onClick={() => setPrice(roundPrice(item.price! * 0.9))}>
            Drop 10% to {money(roundPrice(item.price * 0.9), item.currency)}
          </Button>
        </Paper>
      )}

      {result?.comps?.length ? (
        <Paper className="p-5">
          <h3 className="mb-3 font-display text-xl">Comparables</h3>
          <ul className="divide-y divide-dashed divide-line">
            {result.comps.map((c, i) => (
              <li key={i} className="flex items-center gap-3 py-2 text-sm">
                <span className={cx('w-12 shrink-0 text-xs font-semibold', c.sold ? 'text-accent' : 'text-muted')}>{c.sold ? 'Sold' : 'Asking'}</span>
                <span className="min-w-0 flex-1 truncate">
                  {c.url ? (
                    <a href={c.url} target="_blank" rel="noreferrer" className="hover:underline">
                      {c.title}
                    </a>
                  ) : (
                    c.title
                  )}
                </span>
                {c.source !== 'own_sales' && MARKETPLACES[c.source] && (
                  <span className="hidden shrink-0 items-center gap-1.5 text-xs text-muted sm:inline-flex">
                    <MarketIcon id={c.source} className="size-3.5" />
                    {MARKETPLACES[c.source].name}
                  </span>
                )}
                <span className="font-semibold tabular">{money(c.price, c.currency)}</span>
              </li>
            ))}
          </ul>
        </Paper>
      ) : null}

      {item.price != null && (
        <Paper className="p-5">
          <h3 className="mb-3 font-display text-xl">What you keep</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="pb-2 font-semibold">Marketplace</th>
                <th className="pb-2 text-right font-semibold">Price</th>
                <th className="pb-2 text-right font-semibold">Fees</th>
                <th className="pb-2 text-right font-semibold">You keep</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dashed divide-line">
              {markets.map(m => {
                const rule = feeRule(m, region, profile?.fee_overrides);
                const p = priceOn(item.price!, m, region, profile?.price_strategy ?? 'same', profile?.fee_overrides);
                return (
                  <tr key={m}>
                    <td className="py-2">
                      <span className="flex items-center gap-2">
                        <MarketIcon id={m} />
                        {MARKETPLACES[m].name}
                      </span>
                    </td>
                    <td className="py-2 text-right tabular">{money(p, item.currency)}</td>
                    <td className="py-2 text-right text-muted tabular">{money(feeFor(p, rule), item.currency)}</td>
                    <td className="py-2 text-right font-semibold tabular">{money(takeHome(p, rule), item.currency)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-muted">Fees are estimates for {region} sellers. Adjust them in Settings if yours differ.</p>
        </Paper>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

const EVENT_TEXT: Record<string, (d: Record<string, unknown>, m: string) => string> = {
  created: () => 'Added to the closet',
  listed: (_d, m) => `Listed on ${m}`,
  relisted: (_d, m) => `Relisted on ${m}`,
  delisted: (_d, m) => `Ended on ${m}`,
  price_changed: d => `Price changed from ${d.from ?? '?'} to ${d.to ?? '?'}`,
  sold: (d, m) => `Sold${m ? ` on ${m}` : ''}${d.price ? ` for ${d.price}` : ''}`,
  shipped: () => 'Shipped',
};

function History({ item }: { item: Item }) {
  const { data: events, isLoading } = useEvents(item.id);
  if (isLoading) return <Spinner />;
  if (!events?.length) return <p className="text-ink-2">Nothing has happened to this item yet.</p>;
  return (
    <ol className="relative flex flex-col gap-4 border-l-2 border-dashed border-line pl-5">
      {events.map((ev, i) => (
        <motion.li
          key={ev.id}
          className="relative"
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 24, delay: Math.min(i, 10) * 0.04 }}
        >
          <span className={cx('absolute top-1.5 -left-[1.6rem] size-2.5 rounded-full ring-4 ring-paper', ev.type === 'sold' ? 'bg-rose' : 'bg-accent')} aria-hidden />
          <p className="font-medium">
            {(EVENT_TEXT[ev.type] ?? (() => ev.type))(ev.data ?? {}, ev.marketplace ? MARKETPLACES[ev.marketplace]?.name ?? ev.marketplace : '')}
          </p>
          <p className="text-sm text-muted">
            {shortDate(ev.at)}, {ago(ev.at)}
          </p>
        </motion.li>
      ))}
    </ol>
  );
}

