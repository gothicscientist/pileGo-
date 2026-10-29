import { computeAnalytics, findCategory, MARKETPLACES, isMarketplaceId } from '@pilego/core';
import { motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { MarketIcon } from '~/components/bits';
import { BarList, ColumnChart, StatTile } from '~/components/charts';
import { Empty, Paper, SectionTitle, Spinner } from '~/components/ui';
import { cx, money, plural } from '~/lib/format';
import { useItems, useProfile } from '~/lib/queries';

const PERIODS = [
  { id: '30', label: '30 days', days: 30 },
  { id: '90', label: '90 days', days: 90 },
  { id: '365', label: '12 months', days: 365 },
  { id: 'all', label: 'All time', days: null },
] as const;

export function Insights() {
  const { data: items, isLoading } = useItems();
  const { data: profile } = useProfile();
  const [period, setPeriod] = useState<(typeof PERIODS)[number]['id']>('90');
  const [asTable, setAsTable] = useState(false);

  const a = useMemo(() => {
    const p = PERIODS.find(x => x.id === period)!;
    const all = items ?? [];
    return computeAnalytics(
      all,
      all.flatMap(i => i.listings ?? []),
      {
        region: profile?.region ?? 'US',
        fee_overrides: profile?.fee_overrides,
        stale_after_days: profile?.stale_after_days ?? 30,
        since: p.days ? new Date(Date.now() - p.days * 86_400_000) : null,
      },
    );
  }, [items, profile, period]);

  if (isLoading) {
    return (
      <div className="flex min-h-[50dvh] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const cur = profile?.currency ?? a.currency;
  const fmt = (v: number) => money(v, cur);
  const monthLabel = (m: string) => new Date(`${m}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', timeZone: 'UTC' });

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-8">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5">
        <div>
          <h1 className="font-display text-[clamp(2.6rem,6vw,4.6rem)] leading-[0.92]">Insights</h1>
        </div>
        <div className="flex gap-1 rounded-full bg-paper-2 p-1" role="group" aria-label="Period">
          {PERIODS.map(p => (
            <button
              key={p.id}
              type="button"
              aria-pressed={period === p.id}
              onClick={() => setPeriod(p.id)}
              className={cx(
                'relative rounded-full px-3 py-1.5 text-sm font-medium transition-colors active:scale-95',
                period === p.id ? 'text-ink' : 'text-muted hover:text-ink',
              )}
            >
              {period === p.id && (
                <motion.span
                  layoutId="insights-period"
                  className="absolute inset-0 rounded-full bg-card shadow-[0_1px_2px_rgb(0_0_0/0.08)]"
                  transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  aria-hidden
                />
              )}
              <span className="relative">{p.label}</span>
            </button>
          ))}
        </div>
      </header>

      {(items?.length ?? 0) === 0 ? (
        <div className="mt-8">
          <Empty title="Nothing to count yet" action={<Link to="/scan" className="btn btn-tag">Scan an item</Link>}>
            Once things start selling, this page shows what you made, where, and what is sitting too long.
          </Empty>
        </div>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-[22rem_1fr]">
          {/* The receipt */}
          <Paper torn className="grain self-start px-5 pt-5 lg:sticky lg:top-6">
            <p className="text-sm text-ink-2">Profit after fees and what you paid</p>
            <p className="mt-1 text-5xl font-semibold">{fmt(a.profit)}</p>
            <dl className="mt-5 flex flex-col gap-1.5 border-t border-dashed border-line pt-4 text-sm">
              <Line k="Sales" v={fmt(a.revenue)} />
              <Line k="Marketplace fees" v={`−${fmt(a.fees)}`} />
              <Line k="What you paid" v={`−${fmt(a.cost_of_sold)}`} />
            </dl>
            <div className="mt-5 grid grid-cols-2 gap-4 border-t border-dashed border-line pt-4">
              <StatTile label="Sold" value={String(a.sold)} />
              <StatTile
                label="Sell-through"
                value={a.sell_through == null ? 'None yet' : `${Math.round(a.sell_through * 100)}%`}
                note="sold out of sold plus listed"
              />
              <StatTile
                label="Days to sell"
                value={a.median_days_to_sell == null ? 'None yet' : String(a.median_days_to_sell)}
                note="median, from first listed"
              />
              <StatTile label="Listed now" value={String(a.listed)} note={`asking ${fmt(a.listed_value)}`} />
            </div>
          </Paper>

          <div className="flex min-w-0 flex-col gap-6">
            <Paper className="p-5">
              <SectionTitle
                action={
                  <button type="button" className="text-sm font-semibold text-ink-2 underline" onClick={() => setAsTable(t => !t)}>
                    {asTable ? 'Show chart' : 'Show table'}
                  </button>
                }
              >
                Sales by month
              </SectionTitle>
              {asTable ? (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted">
                      <th className="pb-2 font-semibold">Month</th>
                      <th className="pb-2 text-right font-semibold">Sold</th>
                      <th className="pb-2 text-right font-semibold">Sales</th>
                      <th className="pb-2 text-right font-semibold">Profit</th>
                      <th className="pb-2 text-right font-semibold">Listed</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line tabular">
                    {a.months.map(m => (
                      <tr key={m.month}>
                        <td className="py-1.5">{monthLabel(m.month)}</td>
                        <td className="py-1.5 text-right">{m.sold}</td>
                        <td className="py-1.5 text-right">{fmt(m.revenue)}</td>
                        <td className="py-1.5 text-right">{fmt(m.profit)}</td>
                        <td className="py-1.5 text-right">{m.listed}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <ColumnChart
                  label="Sales by month, last 12 months"
                  format={fmt}
                  data={a.months.map(m => ({
                    key: m.month,
                    label: monthLabel(m.month),
                    value: m.revenue,
                    detail: `${plural(m.sold, 'sale')}, ${fmt(m.profit)} profit`,
                  }))}
                />
              )}
            </Paper>

            <div className="grid gap-6 md:grid-cols-2">
              <Paper className="p-5">
                <SectionTitle>Where it sells</SectionTitle>
                {a.by_marketplace.length ? (
                  <BarList
                    label="Sales by marketplace"
                    format={fmt}
                    data={a.by_marketplace.map(b => ({
                      key: b.key,
                      label: isMarketplaceId(b.key) ? MARKETPLACES[b.key].name : 'Elsewhere',
                      icon: isMarketplaceId(b.key) ? <MarketIcon id={b.key} /> : undefined,
                      value: b.revenue,
                      detail: `${plural(b.count, 'sale')}, ${fmt(b.revenue / b.count)} each`,
                    }))}
                  />
                ) : (
                  <p className="text-sm text-ink-2">No sales in this period.</p>
                )}
              </Paper>
              <Paper className="p-5">
                <SectionTitle>What sells</SectionTitle>
                {a.by_category.length ? (
                  <BarList
                    label="Sales by category"
                    format={fmt}
                    data={a.by_category.map(b => ({
                      key: b.key,
                      label: findCategory(b.key)?.label ?? 'Other',
                      value: b.revenue,
                      detail: plural(b.count, 'sale'),
                    }))}
                  />
                ) : (
                  <p className="text-sm text-ink-2">No sales in this period.</p>
                )}
              </Paper>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <Paper className="p-5">
                <SectionTitle>How long things sit</SectionTitle>
                <BarList
                  label="Listed items by age"
                  format={v => plural(v, 'item')}
                  data={a.aging.map(b => ({ key: b.label, label: b.label, value: b.count, detail: b.count ? fmt(b.value) : undefined }))}
                />
              </Paper>
              <Paper className="p-5">
                <SectionTitle>Best brands</SectionTitle>
                {a.by_brand.length ? (
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-dashed divide-line">
                      {a.by_brand.map(b => (
                        <tr key={b.key}>
                          <td className="py-1.5">{b.key}</td>
                          <td className="py-1.5 text-right text-muted tabular">{b.count}</td>
                          <td className="py-1.5 text-right font-semibold tabular">{fmt(b.profit)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-sm text-ink-2">No sales in this period.</p>
                )}
              </Paper>
            </div>

            {a.stale.length > 0 && (
              <Paper className="p-5">
                <SectionTitle action={<Link to="/out" className="text-sm font-semibold underline">Relist them</Link>}>
                  Sitting too long
                </SectionTitle>
                <ul className="divide-y divide-dashed divide-line">
                  {a.stale.slice(0, 10).map(s => (
                    <li key={s.item_id} className="flex items-center gap-3 py-2 text-sm">
                      <Link to={`/item/${s.item_id}?tab=price`} className="min-w-0 flex-1 truncate hover:underline">
                        {s.title}
                      </Link>
                      <span className="text-muted tabular">{s.days} days</span>
                      <span className="w-20 text-right font-semibold tabular">{money(s.price, cur)}</span>
                    </li>
                  ))}
                </ul>
              </Paper>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Line({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="text-ink-2">{k}</dt>
      <span className="flex-1 border-b border-dotted border-line" aria-hidden />
      <dd className="font-semibold tabular">{v}</dd>
    </div>
  );
}
