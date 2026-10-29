import {
  CATEGORIES,
  findSubcategory,
  MARKETPLACE_IDS,
  MARKETPLACES,
  priceOn,
  type Item,
  type ItemStatus,
  type MarketplaceId,
} from '@pilego/core';
import { Check, LayoutGrid, Rows3, Search, X } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ItemStatusTag, PhotoImg, PriceTag, Sticker, TierLabel } from '~/components/bits';
import { Sheet, useToast } from '~/components/overlay';
import { Button, Empty, ErrorNote, PageHeader, Select, Spinner } from '~/components/ui';
import { cx, daysSince, money, plural, seeded } from '~/lib/format';
import { useItems, useProfile, useQueuePublish, useUpdateItem, type ListingOverride } from '~/lib/queries';
import { errorMessage } from '~/lib/supabase';

type StatusFilter = 'active' | ItemStatus | 'all';
const STATUS_TABS: Array<{ id: StatusFilter; label: string }> = [
  { id: 'active', label: 'In the pile' },
  { id: 'draft', label: 'Drafts' },
  { id: 'ready', label: 'Ready' },
  { id: 'listed', label: 'Listed' },
  { id: 'sold', label: 'Sold' },
  { id: 'shipped', label: 'Shipped' },
  { id: 'archived', label: 'Archived' },
  { id: 'all', label: 'Everything' },
];

type Sort = 'new' | 'old' | 'price_high' | 'price_low' | 'stale';

function firstListed(item: Item): string | null {
  return (item.listings ?? []).map(l => l.listed_at).filter((x): x is string => Boolean(x)).sort()[0] ?? null;
}

function matches(item: Item, q: string): boolean {
  if (!q) return true;
  const hay = [item.title, item.brand, item.sku, item.size, item.era, item.location, ...item.colors, ...item.style_tags]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .every(w => hay.includes(w));
}

export function Closet() {
  const { data: items, isLoading } = useItems();
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') as StatusFilter) || 'active';
  const view = params.get('view') === 'table' ? 'table' : 'rack';
  const [q, setQ] = useState('');
  const [market, setMarket] = useState<'' | MarketplaceId>('');
  const [notOn, setNotOn] = useState(false);
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState<Sort>('new');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const update = useUpdateItem();
  const toast = useToast();
  const reduce = useReducedMotion();

  const set = (key: string, value: string | null) =>
    setParams(
      p => {
        const n = new URLSearchParams(p);
        if (value) n.set(key, value);
        else n.delete(key);
        return n;
      },
      { replace: true },
    );

  const filtered = useMemo(() => {
    let list = (items ?? []).filter(i => {
      if (status === 'active') return i.status === 'draft' || i.status === 'ready' || i.status === 'listed';
      if (status === 'all') return true;
      return i.status === status;
    });
    if (category) list = list.filter(i => i.category === category);
    if (market) {
      list = list.filter(i => {
        const on = (i.listings ?? []).some(l => l.marketplace === market && l.status === 'listed');
        return notOn ? !on : on;
      });
    }
    list = list.filter(i => matches(i, q.trim()));
    const by: Record<Sort, (a: Item, b: Item) => number> = {
      new: (a, b) => b.created_at.localeCompare(a.created_at),
      old: (a, b) => a.created_at.localeCompare(b.created_at),
      price_high: (a, b) => (b.price ?? -1) - (a.price ?? -1),
      price_low: (a, b) => (a.price ?? Infinity) - (b.price ?? Infinity),
      stale: (a, b) => (firstListed(a) ?? '9').localeCompare(firstListed(b) ?? '9'),
    };
    return [...list].sort(by[sort]);
  }, [items, status, category, market, notOn, q, sort]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const i of items ?? []) c[i.status] = (c[i.status] ?? 0) + 1;
    c.active = (c.draft ?? 0) + (c.ready ?? 0) + (c.listed ?? 0);
    c.all = items?.length ?? 0;
    return c;
  }, [items]);

  const toggle = (id: string) =>
    setPicked(p => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const pickedItems = filtered.filter(i => picked.has(i.id));

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
      <PageHeader label={`02 / Everything you own / ${plural(counts.all ?? 0, 'piece')}`} title="Closet">
        <div className="flex items-center gap-1 rounded-full bg-paper-2 p-1" role="group" aria-label="View">
          <ViewButton on={view === 'rack'} label="Rack" onClick={() => set('view', null)}>
            <LayoutGrid className="size-4" aria-hidden />
          </ViewButton>
          <ViewButton on={view === 'table'} label="Table" onClick={() => set('view', 'table')}>
            <Rows3 className="size-4" aria-hidden />
          </ViewButton>
        </div>
      </PageHeader>

      <div className="scrollbar-none -mx-4 mt-5 flex gap-1 overflow-x-auto px-4 py-1 sm:mx-0 sm:px-0" role="tablist" aria-label="Status">
        {STATUS_TABS.map(t => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={status === t.id}
            onClick={() => {
              set('status', t.id === 'active' ? null : t.id);
              setPicked(new Set());
            }}
            className={cx(
              'relative shrink-0 rounded-full px-3.5 py-2 text-sm font-medium transition-colors active:scale-95',
              status === t.id ? 'text-paper' : 'text-ink-2 hover:bg-paper-2 hover:text-ink',
            )}
          >
            {status === t.id && (
              <motion.span
                layoutId="closet-tab"
                className="absolute inset-0 rounded-full bg-ink"
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                aria-hidden
              />
            )}
            <span className="relative">
              {t.label}
              <span className={cx('ml-1.5 tabular', status === t.id ? 'text-paper/65' : 'text-muted')}>{counts[t.id] ?? 0}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <label className="relative min-w-56 flex-1">
          <span className="sr-only">Search</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input
            className="field pl-9"
            placeholder="Search brand, title, SKU, colour"
            value={q}
            onChange={e => setQ(e.target.value)}
          />
        </label>
        <Select aria-label="Category" className="w-auto" value={category} onChange={e => setCategory(e.target.value)}>
          <option value="">All categories</option>
          {CATEGORIES.map(c => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Marketplace"
          className="w-auto"
          value={market ? `${notOn ? 'not:' : ''}${market}` : ''}
          onChange={e => {
            const v = e.target.value;
            setNotOn(v.startsWith('not:'));
            setMarket(v.replace('not:', '') as MarketplaceId | '');
          }}
        >
          <option value="">Any marketplace</option>
          {MARKETPLACE_IDS.map(m => (
            <option key={m} value={m}>
              Live on {MARKETPLACES[m].name}
            </option>
          ))}
          {MARKETPLACE_IDS.map(m => (
            <option key={`not-${m}`} value={`not:${m}`}>
              Not on {MARKETPLACES[m].name}
            </option>
          ))}
        </Select>
        <Select aria-label="Sort" className="w-auto" value={sort} onChange={e => setSort(e.target.value as Sort)}>
          <option value="new">Newest first</option>
          <option value="old">Oldest first</option>
          <option value="price_high">Price, high to low</option>
          <option value="price_low">Price, low to high</option>
          <option value="stale">Listed longest</option>
        </Select>
      </div>

      <div className="mt-6">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : !filtered.length ? (
          (items?.length ?? 0) === 0 ? (
            <Empty title="Your closet is empty" art="whiteHoodie" action={<Link to="/scan" className="btn btn-tag">Scan an item</Link>}>
              Everything you scan or import lands here.
            </Empty>
          ) : (
            <Empty title="Nothing matches" art="beanie">
              Try another filter or clear the search.
            </Empty>
          )
        ) : view === 'rack' ? (
          <ul className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 sm:gap-x-5 lg:grid-cols-4 xl:grid-cols-5">
            {filtered.map((item, i) => (
              <motion.li
                key={item.id}
                initial={reduce ? false : { opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 220, damping: 24, delay: reduce ? 0 : Math.min(i, 14) * 0.025 }}
              >
                <RackCard item={item} picked={picked.has(item.id)} onPick={() => toggle(item.id)} />
              </motion.li>
            ))}
          </ul>
        ) : (
          <Table items={filtered} picked={picked} onPick={toggle} onPickAll={on => setPicked(on ? new Set(filtered.map(i => i.id)) : new Set())} />
        )}
      </div>

      <AnimatePresence>
      {pickedItems.length > 0 && (
        <motion.div
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 40, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          className="fixed inset-x-0 bottom-24 z-30 flex justify-center px-4 md:bottom-6"
        >
          <div className="flex flex-wrap items-center gap-2 rounded-full bg-ink p-1.5 pl-5 text-paper lift-lg">
            <span className="text-sm font-semibold">{plural(pickedItems.length, 'item')} picked</span>
            <Button variant="tag" size="sm" onClick={() => setBulkOpen(true)}>
              Cross-list
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-paper hover:bg-white/10"
              onClick={async () => {
                const archivable = pickedItems.filter(i => i.status !== 'listed');
                for (const i of archivable) await update.mutateAsync({ id: i.id, patch: { status: 'archived' } }).catch(() => undefined);
                toast(`Archived ${plural(archivable.length, 'item')}${archivable.length < pickedItems.length ? '. Listed items were skipped.' : ''}`);
                setPicked(new Set());
              }}
            >
              Archive
            </Button>
            <button type="button" aria-label="Clear selection" className="rounded-full p-2 transition hover:bg-white/10 active:scale-90" onClick={() => setPicked(new Set())}>
              <X className="size-4" aria-hidden />
            </button>
          </div>
        </motion.div>
      )}
      </AnimatePresence>

      <BulkCrossList
        items={pickedItems}
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        onDone={() => {
          setBulkOpen(false);
          setPicked(new Set());
        }}
      />
    </div>
  );
}

function ViewButton({ on, label, onClick, children }: { on: boolean; label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition active:scale-95',
        on ? 'bg-card text-ink shadow-[0_1px_2px_rgb(0_0_0/0.08)]' : 'text-muted hover:text-ink',
      )}
    >
      {children}
      {label}
    </button>
  );
}

function PickBox({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      className={cx(
        'flex size-6 items-center justify-center rounded-full border-2 transition duration-300 ease-[var(--ease-spring)] active:scale-90',
        on ? 'border-ink bg-ink text-paper' : 'border-white/90 bg-black/20 text-transparent hover:bg-black/35',
      )}
    >
      <Check className="size-4" strokeWidth={3} aria-hidden />
    </button>
  );
}

/** "Lee, size M, denim jackets": whatever the seller filled in, no blanks. */
function details(item: Item): string {
  const kind = findSubcategory(item.category, item.subcategory)?.label;
  return [item.brand, item.size && `Size ${item.size}`, kind].filter(Boolean).join(' · ');
}

function RackCard({ item, picked, onPick }: { item: Item; picked: boolean; onPick: () => void }) {
  const live = (item.listings ?? []).filter(l => l.status === 'listed');
  const needs = (item.listings ?? []).some(l => l.status === 'needs_action' || l.status === 'failed');
  const tilt = (seeded(item.id) - 0.5) * 3;
  const line = details(item);
  return (
    <div className="group swing-on-hover relative">
      <Link to={`/item/${item.id}`} className="block rounded-[18px]">
        <div
          className="relative overflow-hidden rounded-[18px] bg-paper-2 transition duration-500 ease-[var(--ease-spring)] lift group-hover:-translate-y-1 group-hover:rotate-[var(--tilt)] group-hover:shadow-[0_2px_4px_rgb(var(--shadow)/0.06),0_28px_56px_-26px_rgb(var(--shadow)/0.42)]"
          style={{ '--tilt': `${tilt.toFixed(2)}deg` } as React.CSSProperties}
        >
          <PhotoImg
            photo={item.photos?.[0]}
            className="aspect-[4/5] w-full object-cover transition-transform duration-700 ease-[var(--ease-out-soft)] group-hover:scale-[1.04]"
            alt=""
          />
          {item.status === 'sold' && (
            <span className="stamp-in absolute top-1/3 left-1/2 -translate-x-1/2 -rotate-12 rounded-md border-[3px] border-rose bg-paper/85 px-2 font-display text-2xl text-rose">
              SOLD
            </span>
          )}
          {needs && (
            <span className="absolute right-2 bottom-2 rounded-full bg-paper/90 px-2 py-0.5 text-[0.7rem] font-semibold text-danger backdrop-blur">
              Needs you
            </span>
          )}
        </div>
        <div className="mt-2.5 flex flex-col gap-1 px-1">
          <div className="flex items-start justify-between gap-2">
            <span className="line-clamp-2 text-[0.93rem] leading-snug font-medium">{item.title || 'Untitled item'}</span>
            <span className="swing shrink-0 origin-left pt-0.5">
              <PriceTag empty={item.price == null}>{item.price == null ? 'price?' : money(item.price, item.currency)}</PriceTag>
            </span>
          </div>
          <div className="flex min-h-4 items-center gap-2">
            {line && <span className="truncate text-xs text-muted">{line}</span>}
            {live.length > 0 && (
              <span className="ml-auto flex shrink-0 -space-x-1" aria-label={`Live on ${live.map(l => MARKETPLACES[l.marketplace].name).join(', ')}`}>
                {live.map(l => (
                  <span key={l.id} className="size-3 rounded-full ring-2 ring-paper" style={{ background: MARKETPLACES[l.marketplace].color }} />
                ))}
              </span>
            )}
          </div>
        </div>
      </Link>
      <div className={cx('absolute top-2.5 left-2.5 transition', picked ? 'opacity-100' : 'opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100')}>
        <PickBox on={picked} onClick={onPick} label={`Pick ${item.title}`} />
      </div>
    </div>
  );
}

function Table({
  items,
  picked,
  onPick,
  onPickAll,
}: {
  items: Item[];
  picked: Set<string>;
  onPick: (id: string) => void;
  onPickAll: (on: boolean) => void;
}) {
  const all = items.length > 0 && items.every(i => picked.has(i.id));
  return (
    <div className="overflow-x-auto rounded-[20px] bg-card lift">
      <table className="w-full min-w-[46rem] text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs text-muted">
            <th className="w-10 p-3">
              <input type="checkbox" aria-label="Pick all" className="size-4 accent-[var(--ink)]" checked={all} onChange={e => onPickAll(e.target.checked)} />
            </th>
            <th className="p-3 font-semibold">Item</th>
            <th className="p-3 font-semibold">Size</th>
            <th className="p-3 font-semibold">Status</th>
            <th className="p-3 font-semibold">Live on</th>
            <th className="p-3 text-right font-semibold">Days</th>
            <th className="p-3 text-right font-semibold">Price</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {items.map(item => {
            const live = (item.listings ?? []).filter(l => l.status === 'listed');
            const days = daysSince(firstListed(item));
            return (
              <tr key={item.id} className={cx('hover:bg-paper-2/60', picked.has(item.id) && 'bg-paper-2')}>
                <td className="p-3">
                  <input
                    type="checkbox"
                    aria-label={`Pick ${item.title}`}
                    className="size-4 accent-[var(--ink)]"
                    checked={picked.has(item.id)}
                    onChange={() => onPick(item.id)}
                  />
                </td>
                <td className="p-3">
                  <Link to={`/item/${item.id}`} className="flex items-center gap-3">
                    <PhotoImg photo={item.photos?.[0]} className="size-11 shrink-0 rounded-xl object-cover" />
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{item.title || 'Untitled item'}</span>
                      <span className="block text-xs text-muted tabular">
                        {item.sku}
                        {item.brand ? `, ${item.brand}` : ''}
                      </span>
                    </span>
                  </Link>
                </td>
                <td className="p-3">{item.size ?? ''}</td>
                <td className="p-3">
                  <ItemStatusTag status={item.status} />
                </td>
                <td className="p-3">
                  <span className="flex flex-wrap gap-1">
                    {live.map(l => (
                      <Sticker key={l.id} id={l.marketplace} size="sm" tilt={false} />
                    ))}
                  </span>
                </td>
                <td className="p-3 text-right tabular">{item.status === 'listed' && days != null ? days : ''}</td>
                <td className="p-3 text-right font-semibold tabular">{money(item.price, item.currency)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function BulkCrossList({ items, open, onClose, onDone }: { items: Item[]; open: boolean; onClose: () => void; onDone: () => void }) {
  const { data: profile } = useProfile();
  const publish = useQueuePublish();
  const toast = useToast();
  const mine = profile?.marketplaces?.length ? profile.marketplaces : (['ebay', 'vinted', 'depop', 'poshmark'] as MarketplaceId[]);
  const [selected, setSelected] = useState<MarketplaceId[]>(mine.filter(m => MARKETPLACES[m].capabilities.create !== 'manual'));
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);

  const ok = items.filter(i => i.price != null && (i.photos?.length ?? 0) > 0 && i.status !== 'sold' && i.status !== 'shipped');
  const skipped = items.length - ok.length;

  async function go() {
    setError(null);
    setProgress(0);
    let done = 0;
    try {
      for (const item of ok) {
        const markets = selected.filter(m => !(item.listings ?? []).some(l => l.marketplace === m && ['listed', 'publishing', 'queued'].includes(l.status)));
        if (markets.length) {
          const overrides: Partial<Record<MarketplaceId, ListingOverride>> = {};
          for (const m of markets) {
            overrides[m] = { price: priceOn(item.price!, m, profile?.region ?? 'US', profile?.price_strategy ?? 'same', profile?.fee_overrides) };
          }
          await publish.mutateAsync({ itemId: item.id, marketplaces: markets, overrides });
        }
        done++;
        setProgress(done);
      }
      toast(`Queued ${plural(ok.length, 'item')} on ${plural(selected.length, 'marketplace')}`);
      onDone();
    } catch (err) {
      setError(`${errorMessage(err)} (${done} of ${ok.length} were queued)`);
    } finally {
      setProgress(null);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`Cross-list ${plural(items.length, 'item')}`}
      footer={
        <div className="flex flex-col gap-2">
          <ErrorNote error={error} />
          <Button variant="tag" className="self-start" disabled={!selected.length || !ok.length} busy={progress != null} onClick={go}>
            {progress != null ? `Queuing ${progress} of ${ok.length}` : `List ${plural(ok.length, 'item')}`}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-ink-2">
          Each item gets the version each marketplace wants, written from its details. Open an item first if you want to edit one by hand.
        </p>
        {skipped > 0 && (
          <p className="kraft rounded-xl px-3 py-2 text-sm">
            {plural(skipped, 'item')} will be skipped: {skipped === 1 ? 'it needs' : 'they need'} a price and at least one photo.
          </p>
        )}
        <ul className="flex flex-col gap-1.5">
          {MARKETPLACE_IDS.filter(m => MARKETPLACES[m].capabilities.create !== 'manual').map(m => {
            const on = selected.includes(m);
            return (
              <li key={m}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => setSelected(s => (on ? s.filter(x => x !== m) : [...s, m]))}
                  className={cx(
                    'flex w-full items-center gap-3 rounded-2xl border-2 p-2.5 text-left transition duration-300 ease-[var(--ease-spring)] active:scale-[0.98]',
                    on ? 'border-ink bg-card' : 'border-transparent bg-paper-2 hover:bg-line/60',
                  )}
                >
                  <span className={cx('flex size-5 items-center justify-center rounded-md border-2 transition', on ? 'border-ink bg-ink text-paper' : 'border-line bg-card')}>
                    {on && <Check className="size-3.5" strokeWidth={3} aria-hidden />}
                  </span>
                  <Sticker id={m} size="sm" />
                  <TierLabel tier={MARKETPLACES[m].capabilities.create} auto={MARKETPLACES[m].auto_post} className="ml-auto" />
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </Sheet>
  );
}
