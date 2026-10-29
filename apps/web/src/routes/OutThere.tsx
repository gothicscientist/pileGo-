// Everything that is out on a marketplace, grouped by what it needs from you.

import { MARKETPLACES, type Item, type Listing } from '@pilego/core';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { ListingStatusText, PhotoImg, PriceTag, Sticker } from '~/components/bits';
import { useToast } from '~/components/overlay';
import { Button, Empty, Paper, SectionTitle, Spinner } from '~/components/ui';
import { askExtensionToSync, useExtension } from '~/lib/extension';
import { extensionSetupUrl } from '~/lib/extension-flow';
import { cx, daysSince, money, plural } from '~/lib/format';
import { useEbayActions, useEbayStatus, useItems, useJobs, useListingJob, useProfile, useUpdateItem } from '~/lib/queries';
import { errorMessage } from '~/lib/supabase';
import { JobRow } from '~/components/JobRow';

type Row = { item: Item; listing: Listing };

export function OutThere() {
  const { data: items, isLoading } = useItems();
  const { data: jobs } = useJobs();
  const { data: profile } = useProfile();
  const ebay = useEbayStatus();
  const { sync } = useEbayActions();
  const ext = useExtension();
  const relist = useListingJob();
  const update = useUpdateItem();
  const toast = useToast();
  const [relisting, setRelisting] = useState<number | null>(null);
  const stale = profile?.stale_after_days ?? 30;

  const byId = useMemo(() => new Map((items ?? []).map(i => [i.id, i])), [items]);
  const rows = useMemo<Row[]>(
    () => (items ?? []).flatMap(item => (item.listings ?? []).map(listing => ({ item, listing }))),
    [items],
  );
  const stuckJobs = (jobs ?? []).filter(j => j.status === 'needs_user' || j.status === 'failed');
  const jobListings = new Set(stuckJobs.map(j => j.listing_id));
  const attention = rows.filter(
    r => (r.listing.status === 'needs_action' || r.listing.status === 'failed') && !jobListings.has(r.listing.id),
  );
  const moving = (jobs ?? []).filter(j => j.status === 'pending' || j.status === 'running');
  const live = rows.filter(r => r.listing.status === 'listed').sort((a, b) => (a.listing.listed_at ?? '').localeCompare(b.listing.listed_at ?? ''));
  const staleRows = live.filter(r => (daysSince(r.listing.listed_at) ?? 0) >= stale);
  const relistable = staleRows.filter(r => {
    const t = MARKETPLACES[r.listing.marketplace].capabilities.relist;
    return t && t !== 'manual';
  });
  const sold = (items ?? [])
    .filter(i => i.status === 'sold')
    .sort((a, b) => (b.sold_at ?? '').localeCompare(a.sold_at ?? ''));

  async function checkSales() {
    if (ext.installed) askExtensionToSync();
    if (ebay.data?.connected) {
      try {
        const r = await sync.mutateAsync();
        toast(r.sales ? `Found ${plural(r.sales, 'new sale')} on eBay` : 'No new eBay sales');
      } catch (err) {
        toast(errorMessage(err), { tone: 'error' });
      }
    } else if (ext.installed) toast('Asked the extension to check your marketplaces');
    else toast('Connect eBay or install the extension to check for sales automatically', { tone: 'error' });
  }

  async function relistStale() {
    setRelisting(0);
    let n = 0;
    for (const r of relistable) {
      try {
        await relist.mutateAsync({ listing: r.listing, kind: 'relist' });
      } catch {
        // Keep going; failures show up as jobs.
      }
      setRelisting(++n);
    }
    setRelisting(null);
    toast(`Relisting ${plural(n, 'listing')}`);
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[50dvh] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-8">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5">
        <div>
          <h1 className="font-display text-[clamp(2.6rem,6vw,4.6rem)] leading-[0.92]">Out there</h1>
          <p className="mt-3 text-ink-2">
            {plural(live.length, 'live listing')} across {new Set(live.map(r => r.listing.marketplace)).size} marketplaces.
          </p>
        </div>
        <Button variant="line" icon={<RefreshCw className="size-4" aria-hidden />} busy={sync.isPending} onClick={checkSales}>
          Check for sales
        </Button>
      </header>

      <div className="mt-8 flex flex-col gap-10">
        {(attention.length > 0 || stuckJobs.length > 0) && (
          <section>
            <SectionTitle>Needs you</SectionTitle>
            <Paper className="border-l-4 border-danger p-4">
              <ul className="flex flex-col gap-3">
                {stuckJobs.map(j => (
                  <JobRow key={j.id} job={j} showItem={j.item_id ? byId.get(j.item_id)?.title : undefined} />
                ))}
                {attention.map(({ item, listing }) => (
                  <li key={listing.id} className="flex flex-wrap items-center gap-3 text-sm">
                    <Sticker id={listing.marketplace} size="sm" tilt={false} />
                    <Link to={`/item/${item.id}?tab=listings`} className="font-semibold hover:underline">
                      {item.title}
                    </Link>
                    <span className="w-full text-ink-2 sm:w-auto">{listing.error ?? 'Open the item to sort it out.'}</span>
                  </li>
                ))}
              </ul>
            </Paper>
          </section>
        )}

        {moving.length > 0 && (
          <section>
            <SectionTitle>On the way</SectionTitle>
            <Paper className="p-4">
              <ul className="flex flex-col gap-2">
                {moving.map(j => (
                  <JobRow key={j.id} job={j} showItem={j.item_id ? byId.get(j.item_id)?.title : undefined} />
                ))}
              </ul>
              {moving.some(j => j.runner === 'extension') && !ext.installed && (
                <p className="mt-3 text-sm text-muted">
                  Some of these run in the browser extension. Open pileGo! in a browser that has it, or{' '}
                  <Link to={extensionSetupUrl('/out')} className="underline">
                    install it
                  </Link>
                  .
                </p>
              )}
            </Paper>
          </section>
        )}

        <section>
          <SectionTitle
            action={
              relistable.length > 0 && (
                <Button size="sm" variant="ink" busy={relisting != null} onClick={relistStale}>
                  {relisting != null ? `Relisting ${relisting} of ${relistable.length}` : `Relist ${plural(relistable.length, 'old listing')}`}
                </Button>
              )
            }
          >
            Live
          </SectionTitle>
          {live.length ? (
            <ul className="flex flex-col gap-2">
              {live.map(({ item, listing }) => {
                const days = daysSince(listing.listed_at) ?? 0;
                const old = days >= stale;
                return (
                  <li key={listing.id}>
                    <Paper as="div" className="flex items-center gap-3 p-2.5 pr-4">
                      <PhotoImg photo={item.photos?.[0]} className="size-12 shrink-0 rounded-xl object-cover" />
                      <div className="min-w-0 flex-1">
                        <Link to={`/item/${item.id}?tab=listings`} className="block truncate font-semibold hover:underline">
                          {item.title}
                        </Link>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                          <Sticker id={listing.marketplace} size="sm" tilt={false} />
                          <ListingStatusText status={listing.status} className="!text-xs" />
                          <span className={cx('tabular', old && 'font-semibold text-danger')}>{days === 0 ? 'today' : `${days} days`}</span>
                        </div>
                      </div>
                      <PriceTag empty={listing.price == null}>{money(listing.price, item.currency)}</PriceTag>
                      {listing.external_url && (
                        <a
                          href={listing.external_url}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`Open on ${MARKETPLACES[listing.marketplace].name}`}
                          className="rounded-full p-2 text-ink-2 hover:bg-paper-2"
                        >
                          <ExternalLink className="size-4" aria-hidden />
                        </a>
                      )}
                    </Paper>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty title="Nothing is live yet" action={<Link to="/closet?status=ready" className="btn btn-ink">See what is ready</Link>}>
              Cross-list something from your closet and it shows up here.
            </Empty>
          )}
        </section>

        {sold.length > 0 && (
          <section>
            <SectionTitle>Sold, waiting to ship</SectionTitle>
            <ul className="grid gap-3 sm:grid-cols-2">
              {sold.map(item => (
                <li key={item.id}>
                  <Paper as="div" className="flex items-center gap-3 p-3">
                    <PhotoImg photo={item.photos?.[0]} className="size-14 shrink-0 rounded-xl object-cover" />
                    <div className="min-w-0 flex-1">
                      <Link to={`/item/${item.id}`} className="block truncate font-semibold hover:underline">
                        {item.title}
                      </Link>
                      <p className="text-sm text-muted">
                        {money(item.sold_price, item.currency)}
                        {item.sold_marketplace ? ` on ${MARKETPLACES[item.sold_marketplace].name}` : ''}
                        {item.location ? `, find it at ${item.location}` : ''}
                      </p>
                    </div>
                    <Button size="sm" variant="ink" onClick={() => update.mutate({ id: item.id, patch: { status: 'shipped' } })}>
                      Shipped
                    </Button>
                  </Paper>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

