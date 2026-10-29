// The price picker: three cards from what similar pieces sold for ("Likely to
// sell", "Balanced", "Less likely"), a box to type any price, and a hint when
// the typed price is high or low. Under it, what the seller keeps on each
// marketplace after fees.

import {
  feeRule,
  MARKETPLACES,
  priceAdvice,
  priceTiers,
  type MarketplaceId,
  type PriceSuggestion,
  type PriceTone,
} from '@pilego/core';
import { Lightbulb, X } from 'lucide-react';
import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { cx, money } from '~/lib/format';
import { useProfile } from '~/lib/queries';

const DEFAULT_MARKETS: MarketplaceId[] = ['ebay', 'vinted', 'depop', 'poshmark'];

const TONE_STYLE: Record<PriceTone, string> = {
  high: 'bg-sticker/45',
  low: 'bg-sticker/45',
  fast: 'bg-mint/45',
  fair: 'bg-paper-2',
  slow: 'bg-paper-2',
};

const CONFIDENCE_TEXT: Record<PriceSuggestion['confidence'], string> = {
  high: 'High confidence',
  medium: 'Medium confidence',
  low: 'Low confidence',
};

const SOURCE_NAME: Record<string, string> = { ebay: 'eBay', poshmark: 'Poshmark', mercari: 'Mercari', depop: 'Depop' };

/** The currency's sign as the seller's browser writes it, like "$" or "£". */
function currencySign(currency: string): string {
  try {
    return (
      new Intl.NumberFormat(undefined, { style: 'currency', currency }).formatToParts(0).find(p => p.type === 'currency')?.value ??
      currency
    );
  } catch {
    return currency;
  }
}

function parsePrice(text: string): number | null {
  const n = Number(text.replace(/[^\d.,]/g, '').replace(',', '.'));
  return text.trim() && Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

export function PricePicker({
  suggestion,
  currency,
  value,
  onChange,
  compact,
  disabled,
  label = 'Price',
  children,
}: {
  suggestion: PriceSuggestion;
  currency: string;
  /** The price in the box. */
  value: number | null;
  onChange: (price: number | null) => void;
  /** Fewer marketplaces and no evidence line, for the scan review. */
  compact?: boolean;
  disabled?: boolean;
  label?: string;
  /** Shown under the hint, such as a save button. */
  children?: ReactNode;
}) {
  const { data: profile } = useProfile();
  const region = profile?.region ?? 'US';
  const markets = (profile?.marketplaces?.length ? profile.marketplaces : DEFAULT_MARKETS).slice(0, compact ? 3 : 4);
  const fees = useMemo(
    () => markets.map(id => ({ id, rule: feeRule(id, region, profile?.fee_overrides) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [markets.join(','), region, profile?.fee_overrides],
  );

  const tiers = priceTiers(suggestion);
  const cards = [
    { key: 'likely', label: 'Likely to sell', price: tiers.likely },
    { key: 'balanced', label: 'Balanced', price: tiers.balanced },
    { key: 'less_likely', label: 'Less likely', price: tiers.less_likely },
  ] as const;

  // The box keeps what the seller types ("12." included) and reports numbers.
  const [text, setText] = useState(value != null ? String(value) : '');
  useEffect(() => {
    if (parsePrice(text) !== value) setText(value != null ? String(value) : '');
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const ids = { input: useId(), hint: useId() };
  const sign = currencySign(currency);
  const advice = value != null && value > 0 ? priceAdvice(suggestion, value, fees, v => money(v, currency)) : null;
  const sold = suggestion.sold_prices ?? [];

  return (
    <div className="flex flex-col gap-3">
      <div role="radiogroup" aria-label={`${label}: pick one`} className="grid grid-cols-3 gap-2">
        {cards.map(c => {
          const on = value === c.price;
          return (
            <button
              key={c.key}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={disabled}
              onClick={() => onChange(c.price)}
              className={cx(
                'relative flex min-h-[4.25rem] flex-col items-center justify-center gap-0.5 rounded-xl px-1.5 py-2.5 text-center transition',
                'disabled:cursor-not-allowed disabled:opacity-60',
                on
                  ? 'bg-ink text-paper shadow-[0_2px_0_rgb(var(--shadow)/0.25)]'
                  : 'bg-card text-ink shadow-[inset_0_0_0_1.5px_var(--line)] hover:shadow-[inset_0_0_0_1.5px_var(--ink-2)]',
              )}
            >
              {c.key === 'balanced' && (
                <span className="absolute -top-2 rotate-[-3deg] rounded bg-tag px-1.5 py-px text-[0.65rem] font-bold text-tag-ink shadow-[0_1px_0_rgb(0_0_0/0.18)]">
                  Suggested
                </span>
              )}
              <span className={cx('text-xs sm:text-sm', on ? 'text-paper/85' : 'text-ink-2')}>{c.label}</span>
              <span className={cx('font-display font-extrabold tabular', compact ? 'text-lg' : 'text-xl sm:text-2xl')}>
                {money(c.price, currency)}
              </span>
            </button>
          );
        })}
      </div>

      {!compact && sold.length >= 3 && <SoldStrip sold={sold} tiers={tiers} value={value} currency={currency} />}

      <div className="relative">
        <label htmlFor={ids.input} className="sr-only">
          {label} in {currency}
        </label>
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm font-bold text-ink-2" aria-hidden>
          {sign}
        </span>
        <input
          id={ids.input}
          inputMode="decimal"
          autoComplete="off"
          disabled={disabled}
          value={text}
          placeholder="Or type your own price"
          aria-describedby={advice ? ids.hint : undefined}
          onChange={e => {
            setText(e.target.value);
            onChange(parsePrice(e.target.value));
          }}
          className={cx('field tabular font-semibold', sign.length > 1 ? 'pl-12' : 'pl-8', 'pr-10')}
        />
        {text && !disabled && (
          <button
            type="button"
            aria-label="Clear price"
            onClick={() => {
              setText('');
              onChange(null);
            }}
            className="absolute inset-y-0 right-1 my-auto flex size-9 items-center justify-center rounded-full text-muted hover:text-ink"
          >
            <X className="size-4" aria-hidden />
          </button>
        )}
      </div>

      {advice && (
        <p id={ids.hint} aria-live="polite" className={cx('flex items-start gap-3 rounded-xl px-3.5 py-3 text-sm', TONE_STYLE[advice.tone])}>
          <Lightbulb className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{advice.text}</span>
        </p>
      )}

      {advice && advice.take_home.length > 0 && (
        <ul className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4" aria-label="What you keep after fees">
          {advice.take_home.map(t => (
            <li key={t.marketplace} className="rounded-lg bg-paper-2 px-3 py-2">
              <span className="block text-xs text-muted">{MARKETPLACES[t.marketplace].name}, you keep</span>
              <span className="font-semibold tabular">{money(t.keep, currency)}</span>
            </li>
          ))}
        </ul>
      )}

      {children}

      {!compact && <p className="text-xs text-muted">{evidenceText(suggestion)}</p>}
    </div>
  );
}

/**
 * Each similar sale as a tick on one line, with the three cards and the
 * seller's price marked, so the cards read as places among real sales.
 */
function SoldStrip({
  sold,
  tiers,
  value,
  currency,
}: {
  sold: number[];
  tiers: ReturnType<typeof priceTiers>;
  value: number | null;
  currency: string;
}) {
  const lo = Math.min(sold[0]!, tiers.likely) * 0.92;
  const hi = Math.max(sold.at(-1)!, tiers.less_likely, value ?? 0) * 1.04;
  const at = (v: number) => `${(((v - lo) / (hi - lo || 1)) * 100).toFixed(2)}%`;
  return (
    <figure className="px-1">
      <div className="relative h-7" aria-hidden>
        <div className="absolute inset-x-0 top-1/2 h-px bg-line" />
        <div
          className="absolute top-1/2 h-2 -translate-y-1/2 rounded-full bg-mint/60"
          style={{ left: at(tiers.likely), width: `calc(${at(tiers.less_likely)} - ${at(tiers.likely)})` }}
        />
        {sold.map((v, i) => (
          <span key={i} className="absolute top-1/2 h-3 w-0.5 -translate-y-1/2 rounded bg-ink/45" style={{ left: at(v) }} />
        ))}
        {value != null && value > 0 && (
          <span
            className="absolute top-0 h-7 w-1 -translate-x-1/2 rounded-full bg-tag shadow-[0_0_0_2px_var(--card)]"
            style={{ left: at(Math.min(value, hi)) }}
          />
        )}
      </div>
      <figcaption className="flex justify-between text-[0.7rem] text-muted tabular">
        <span>{money(sold[0]!, currency)}</span>
        <span>
          {sold.length} similar sales{value ? <>, <span className="font-semibold text-tag">your price</span></> : null}
        </span>
        <span>{money(sold.at(-1)!, currency)}</span>
      </figcaption>
    </figure>
  );
}

function evidenceText(s: PriceSuggestion): string {
  const src = s.sources;
  if (!src) return `${CONFIDENCE_TEXT[s.confidence]}. ${s.comps_used} comparable ${s.comps_used === 1 ? 'price' : 'prices'}.`;
  const by = Object.entries(src.sold_by ?? {})
    .filter(([, n]) => n)
    .map(([k, n]) => `${n} on ${SOURCE_NAME[k] ?? k}`);
  const parts = [
    src.sold ? `${src.sold} sold${by.length ? ` (${by.join(', ')})` : ''}` : null,
    src.asking ? `${src.asking} live ${src.asking === 1 ? 'listing' : 'listings'}` : null,
    src.own ? `${src.own} of your own ${src.own === 1 ? 'sale' : 'sales'}` : null,
    src.ai ? 'the photo scan' : null,
  ].filter(Boolean);
  const days = s.days_to_sell ? ` Similar pieces sold in a median of ${s.days_to_sell} ${s.days_to_sell === 1 ? 'day' : 'days'}.` : '';
  return `${CONFIDENCE_TEXT[s.confidence]}.${parts.length ? ` Based on ${parts.join(', ')}.` : ''}${days}`;
}
