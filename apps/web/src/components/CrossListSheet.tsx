// Cross-list: pick marketplaces, check each one's version of the listing,
// and send it. eBay goes through the server, Vinted through the extension,
// form-fill marketplaces open in a tab, and listing-kit ones get a kit.

import {
  feeFor,
  feeRule,
  generateListing,
  MARKETPLACE_IDS,
  MARKETPLACES,
  takeHome,
  type GeneratedListing,
  type Item,
  type MarketplaceId,
} from '@pilego/core';
import { AlertTriangle, Check, PlugZap } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { useUserId } from '~/lib/auth';
import { useExtension } from '~/lib/extension';
import { extensionSetupUrl } from '~/lib/extension-flow';
import { cx, money } from '~/lib/format';
import { useEbayActions, useEbayStatus, useProfile, useQueuePublish, type ListingOverride } from '~/lib/queries';
import { errorMessage } from '~/lib/supabase';
import { listingStatusLabel, MarketIcon, Sticker, TierLabel } from './bits';
import { ListingKit } from './ListingKit';
import { Sheet, useToast } from './overlay';
import { Button, ErrorNote, Field, Input, TextArea } from './ui';

type Edits = Partial<Record<MarketplaceId, { title?: string; price?: string; description?: string }>>;

interface Draft {
  selected: MarketplaceId[];
  active: MarketplaceId | null;
  edits: Edits;
  showAll: boolean;
}

// Scoped to the seller, item and browser tab; survives refreshing after install.
const drafts = new Map<string, Draft>();
function readDraft(key: string): Draft | undefined {
  try {
    const raw = sessionStorage.getItem(key);
    if (raw) {
      const draft = JSON.parse(raw) as Draft;
      if (Array.isArray(draft.selected) && draft.edits && typeof draft.edits === 'object') return draft;
    }
  } catch { /* Storage may be disabled; the in-memory copy still works. */ }
  return drafts.get(key);
}

function clearDraft(key: string) {
  drafts.delete(key);
  try { sessionStorage.removeItem(key); } catch { /* Storage may be disabled. */ }
}

const LIVE = new Set(['listed', 'publishing', 'queued', 'delisting']);

export function CrossListSheet({ item, open, onClose }: { item: Item; open: boolean; onClose: () => void }) {
  const userId = useUserId();
  const location = useLocation();
  const draftKey = `pilego-crosslist:${userId}:${item.id}`;
  const { data: profile } = useProfile();
  const ext = useExtension();
  const ebay = useEbayStatus();
  const ebayActions = useEbayActions();
  const publish = useQueuePublish();
  const toast = useToast();

  const region = profile?.region ?? 'US';
  const mine = profile?.marketplaces?.length ? profile.marketplaces : (['ebay', 'vinted', 'depop', 'poshmark'] as MarketplaceId[]);
  const listingOf = (m: MarketplaceId) => item.listings?.find(l => l.marketplace === m);
  const isLive = (m: MarketplaceId) => {
    const l = listingOf(m);
    return Boolean(l && LIVE.has(l.status));
  };

  const [selected, setSelected] = useState<MarketplaceId[]>([]);
  const [active, setActive] = useState<MarketplaceId | null>(null);
  const [edits, setEdits] = useState<Edits>({});
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentKits, setSentKits] = useState<MarketplaceId[]>([]);

  useEffect(() => {
    if (!open) return;
    const draft = readDraft(draftKey);
    const start = (draft?.selected ?? mine).filter(m => MARKETPLACE_IDS.includes(m) && !isLive(m));
    setSelected(start);
    setActive(draft?.active && start.includes(draft.active) ? draft.active : (start[0] ?? null));
    setEdits(draft?.edits ?? {});
    setShowAll(draft?.showAll ?? false);
    setError(null);
    setSentKits([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item.id, userId]);

  const close = () => {
    clearDraft(draftKey);
    onClose();
  };

  const returnParams = new URLSearchParams(location.search);
  returnParams.set('crosslist', '1');
  const extensionUrl = extensionSetupUrl(`/item/${encodeURIComponent(item.id)}?${returnParams}${location.hash}`);
  const rememberDraft = () => {
    const draft: Draft = { selected, active, edits, showAll };
    drafts.set(draftKey, draft);
    try { sessionStorage.setItem(draftKey, JSON.stringify(draft)); } catch { /* Keep the in-memory copy. */ }
    // Navigating unmounts the sheet. Keep crosslist=1 so it reopens on return.
  };

  const generated = useMemo(() => {
    const out: Partial<Record<MarketplaceId, GeneratedListing>> = {};
    for (const m of MARKETPLACE_IDS) {
      out[m] = generateListing(item, m, {
        voice: profile?.voice,
        region,
        strategy: profile?.price_strategy ?? 'same',
        fee_overrides: profile?.fee_overrides,
      });
    }
    return out as Record<MarketplaceId, GeneratedListing>;
  }, [item, profile, region]);

  const priceFor = (m: MarketplaceId) => {
    const e = edits[m]?.price;
    const n = e !== undefined && e !== '' ? Number(e) : NaN;
    return Number.isFinite(n) ? n : generated[m].price;
  };

  const toggle = (m: MarketplaceId) => {
    setSelected(s => {
      const next = s.includes(m) ? s.filter(x => x !== m) : [...s, m];
      if (!next.includes(active as MarketplaceId)) setActive(next[0] ?? null);
      else if (!s.includes(m)) setActive(m);
      return next;
    });
  };

  const needsExtension = selected.filter(m => {
    const t = MARKETPLACES[m].capabilities.create;
    return t === 'extension' || t === 'assist';
  });
  const ebayBlocked = selected.includes('ebay') && ebay.data && (!ebay.data.configured || !ebay.data.connected);

  async function submit() {
    setError(null);
    const overrides: Partial<Record<MarketplaceId, ListingOverride>> = {};
    for (const m of selected) {
      const e = edits[m] ?? {};
      const g = generated[m];
      const o: ListingOverride = {};
      const price = priceFor(m);
      if (price != null) o.price = price;
      if (e.title !== undefined && e.title !== g.title) o.title = e.title;
      if (e.description !== undefined && e.description !== g.description) o.description = e.description;
      overrides[m] = o;
    }
    try {
      await publish.mutateAsync({ itemId: item.id, marketplaces: selected, overrides });
      clearDraft(draftKey);
      const kits = selected.filter(m => MARKETPLACES[m].capabilities.create === 'manual');
      const automatic = selected.length - kits.length;
      if (automatic) toast(`Sent to ${automatic} ${automatic === 1 ? 'marketplace' : 'marketplaces'}`);
      if (kits.length) {
        setSentKits(kits);
        setActive(kits[0]!);
      } else close();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const visible = showAll ? MARKETPLACE_IDS : [...mine, ...MARKETPLACE_IDS.filter(m => !mine.includes(m) && listingOf(m))];
  const g = active ? generated[active] : null;
  const e = active ? (edits[active] ?? {}) : {};
  const setEdit = (patch: { title?: string; price?: string; description?: string }) =>
    active && setEdits(x => ({ ...x, [active]: { ...x[active], ...patch } }));

  if (sentKits.length) {
    const m = active && sentKits.includes(active) ? active : sentKits[0]!;
    return (
      <Sheet open={open} onClose={close} title="Paste these by hand" wide>
        <p className="mb-4 text-ink-2">
          {sentKits.map(k => MARKETPLACES[k].name).join(' and ')} {sentKits.length === 1 ? 'has' : 'have'} no way for pileGo! to post for you yet.
          Here is everything to copy.
        </p>
        {sentKits.length > 1 && (
          <div className="mb-4 flex gap-2">
            {sentKits.map(k => (
              <button key={k} type="button" onClick={() => setActive(k)} className={cx('rounded-full p-1 transition active:scale-95', k === m && 'ring-2 ring-ink')}>
                <Sticker id={k} tilt={false} />
              </button>
            ))}
          </div>
        )}
        <ListingKit item={item} listing={listingOf(m)} generated={generated[m]} />
      </Sheet>
    );
  }

  return (
    <Sheet
      open={open}
      onClose={close}
      title="Cross-list"
      wide
      footer={
        <div className="flex flex-wrap items-center gap-3">
          <ErrorNote error={error} className="w-full" />
          <Button variant="tag" className="text-base" disabled={!selected.length} busy={publish.isPending} onClick={submit}>
            {selected.length ? `List on ${selected.length} ${selected.length === 1 ? 'marketplace' : 'marketplaces'}` : 'Pick a marketplace'}
          </Button>
          <span className="text-sm text-muted">You can change prices per marketplace before sending.</span>
        </div>
      }
    >
      <div className="grid gap-5 lg:grid-cols-[18rem_1fr]">
        {/* Marketplace picker */}
        <div className="flex flex-col gap-2">
          <ul className="flex flex-col gap-1.5">
            {visible.map(m => {
              const info = MARKETPLACES[m];
              const listing = listingOf(m);
              const live = isLive(m);
              const on = selected.includes(m);
              const price = priceFor(m);
              const rule = feeRule(m, region, profile?.fee_overrides);
              return (
                <li key={m}>
                  <button
                    type="button"
                    aria-pressed={on}
                    disabled={live}
                    onClick={() => toggle(m)}
                    className={cx(
                      'flex w-full items-center gap-3 rounded-2xl border-2 p-2.5 text-left transition duration-300 ease-[var(--ease-spring)] enabled:active:scale-[0.98]',
                      on ? 'border-ink bg-card shadow-[0_8px_18px_-14px_rgb(0_0_0/0.5)]' : 'border-transparent bg-paper-2 hover:border-line',
                      live && 'cursor-default opacity-70',
                    )}
                  >
                    <span
                      className={cx(
                        'flex size-5 shrink-0 items-center justify-center rounded-md border-2 transition duration-300 ease-[var(--ease-spring)]',
                        on ? 'scale-110 border-ink bg-ink text-paper' : 'border-line bg-card',
                      )}
                      aria-hidden
                    >
                      {on && <Check className="size-3.5" strokeWidth={3} />}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="flex items-center justify-between gap-2">
                        <Sticker id={m} size="sm" />
                        {listing && <span className="text-xs font-semibold text-ink-2">{listingStatusLabel(listing.status)}</span>}
                      </span>
                      <TierLabel tier={info.capabilities.create} auto={info.auto_post} />
                      {price != null && (
                        <span className="text-xs text-muted tabular">
                          {money(price, item.currency)}, fees about {money(feeFor(price, rule), item.currency)}, you keep{' '}
                          {money(takeHome(price, rule), item.currency)}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <button type="button" className="self-start text-sm font-semibold text-ink-2 underline" onClick={() => setShowAll(s => !s)}>
            {showAll ? 'Only my marketplaces' : 'More marketplaces'}
          </button>
        </div>

        {/* Preview and edits */}
        <div className="flex min-w-0 flex-col gap-4">
          {needsExtension.length > 0 && !ext.installed && (
            <Notice icon={<PlugZap className="size-5" aria-hidden />}>
              {needsExtension.map(m => MARKETPLACES[m].name).join(', ')} {needsExtension.length === 1 ? 'needs' : 'need'} the pileGo! browser
              extension. They will wait in the queue until you open pileGo! in a browser that has it.{' '}
              <Link to={extensionUrl} className="font-semibold underline" onClick={rememberDraft}>
                Get the extension
              </Link>
            </Notice>
          )}
          {ebayBlocked && (
            <Notice icon={<AlertTriangle className="size-5" aria-hidden />}>
              {ebay.data?.configured ? (
                <>
                  Connect your eBay account first.{' '}
                  <button type="button" className="font-semibold underline" onClick={() => ebayActions.connect.mutate()}>
                    Connect eBay
                  </button>
                </>
              ) : (
                'eBay is not set up on this copy of pileGo! yet. The listing will wait until it is.'
              )}
            </Notice>
          )}

          {selected.length > 1 && (
            <div role="tablist" aria-label="Preview for" className="scrollbar-none -mx-1 flex gap-1 overflow-x-auto px-1">
              {selected.map(m => (
                <button
                  key={m}
                  role="tab"
                  type="button"
                  aria-selected={m === active}
                  onClick={() => setActive(m)}
                  className={cx(
                    'relative shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors active:scale-95',
                    m === active ? 'text-paper' : 'text-ink-2 hover:bg-paper-2',
                  )}
                >
                  {m === active && (
                    <motion.span
                      layoutId="crosslist-preview"
                      className="absolute inset-0 rounded-full bg-ink"
                      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                      aria-hidden
                    />
                  )}
                  <span className="relative flex items-center gap-1.5">
                    <MarketIcon id={m} />
                    {MARKETPLACES[m].name}
                  </span>
                </button>
              ))}
            </div>
          )}

          {active && g ? (
            <div className="flex flex-col gap-4" role="tabpanel">
              <p className="text-sm text-ink-2">{MARKETPLACES[active].blurb}</p>
              {g.warnings.length > 0 && (
                <ul className="flex flex-col gap-1 kraft rounded-xl px-3 py-2 text-sm">
                  {g.warnings.map(w => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              )}
              {MARKETPLACES[active].title_max > 0 ? (
                <Field
                  label="Title"
                  hint={`${(e.title ?? g.title).length} of ${MARKETPLACES[active].title_max}`}
                  htmlFor="xl-title"
                >
                  <Input
                    id="xl-title"
                    maxLength={MARKETPLACES[active].title_max}
                    value={e.title ?? g.title}
                    onChange={ev => setEdit({ title: ev.target.value })}
                  />
                </Field>
              ) : (
                <p className="text-sm text-muted">{MARKETPLACES[active].name} has no title; the first line of the description is used.</p>
              )}
              <Field
                label={`Price (${item.currency})`}
                htmlFor="xl-price"
                hint={profile?.price_strategy === 'match_take_home' ? 'Adjusted so you keep the same amount after fees here.' : undefined}
              >
                <Input
                  id="xl-price"
                  inputMode="decimal"
                  className="max-w-40"
                  value={e.price ?? (g.price != null ? String(g.price) : '')}
                  onChange={ev => setEdit({ price: ev.target.value })}
                />
              </Field>
              <Field label="Description" htmlFor="xl-desc" hint={`${(e.description ?? g.description).length} characters`}>
                <TextArea
                  id="xl-desc"
                  rows={10}
                  value={e.description ?? g.description}
                  onChange={ev => setEdit({ description: ev.target.value })}
                />
              </Field>
              {g.category_path && <p className="text-sm text-muted">Category: {g.category_path}</p>}
            </div>
          ) : (
            <p className="text-ink-2">Pick at least one marketplace on the left.</p>
          )}
        </div>
      </div>
    </Sheet>
  );
}

function Notice({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border-2 border-ink/80 bg-card px-3 py-2.5 text-sm">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <p>{children}</p>
    </div>
  );
}

