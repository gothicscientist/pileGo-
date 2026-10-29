// The pricing slider: from "Sell fast" to "Maximize profit". Each position
// shows the asking price, where it sits among what similar pieces sold for,
// roughly how long it may take, and what the seller keeps on each
// marketplace after fees.

import {
  feeRule,
  MARKETPLACES,
  positionForPrice,
  pricePoint,
  type MarketplaceId,
  type PriceSuggestion,
  type SellSpeed,
} from '@pilego/core';
import { Clock } from 'lucide-react';
import { useEffect, useId, useMemo, useState } from 'react';
import { cx, money } from '~/lib/format';
import { useProfile } from '~/lib/queries';
import { Button } from './ui';

const DEFAULT_MARKETS: MarketplaceId[] = ['ebay', 'vinted', 'depop', 'poshmark'];

const SPEED_STYLE: Record<SellSpeed, string> = {
  fast: 'bg-mint text-[#16172b]',
  steady: 'bg-sticker text-[#16172b]',
  slow: 'bg-paper-2 text-ink',
  stretch: 'bg-tag/20 text-ink',
};

const CONFIDENCE_TEXT: Record<PriceSuggestion['confidence'], string> = {
  high: 'High confidence',
  medium: 'Medium confidence',
  low: 'Low confidence',
};

export function PricingTool({
  suggestion,
  currency,
  current,
  onUse,
  busy,
  compact,
  disabled,
}: {
  suggestion: PriceSuggestion;
  currency: string;
  /** The price the item has now; the slider starts there when it is in range. */
  current?: number | null;
  onUse?: (price: number) => void;
  busy?: boolean;
  /** Fewer marketplaces and no evidence line, for the scan review. */
  compact?: boolean;
  disabled?: boolean;
}) {
  const { data: profile } = useProfile();
  const region = profile?.region ?? 'US';
  const markets = (profile?.marketplaces?.length ? profile.marketplaces : DEFAULT_MARKETS).slice(0, compact ? 3 : 4);
  const fees = useMemo(
    () => markets.map(id => ({ id, rule: feeRule(id, region, profile?.fee_overrides) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [markets.join(','), region, profile?.fee_overrides],
  );

  const startAt = current != null && current > 0 ? positionForPrice(suggestion, current) : 0.5;
  const [position, setPosition] = useState(startAt);
  // A fresh suggestion puts the slider back on the suggested price.
  useEffect(() => setPosition(startAt), [suggestion.computed_at, suggestion.suggested]); // eslint-disable-line react-hooks/exhaustive-deps

  const point = pricePoint(suggestion, position, fees);
  const sold = suggestion.sold_prices ?? [];
  const ids = { slider: useId(), speed: useId() };
  const s = suggestion.sources;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <output
          htmlFor={ids.slider}
          className={cx('font-display font-extrabold tabular', compact ? 'text-4xl' : 'text-5xl')}
          aria-live="polite"
        >
          {money(point.price, currency)}
        </output>
        <span className="text-sm text-ink-2 tabular">
          Most sell for {money(suggestion.low, currency)} to {money(suggestion.high, currency)}
        </span>
      </div>

      <p id={ids.speed} className="flex flex-wrap items-center gap-2 text-sm">
        <span className={cx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold', SPEED_STYLE[point.speed])}>
          <Clock className="size-3.5" aria-hidden />
          {point.speed_label}
        </span>
        {point.rough && (
          <span className="text-xs text-muted">
            {sold.length ? `Rough guide: only ${sold.length} sold ${sold.length === 1 ? 'price' : 'prices'} to go on.` : 'Rough guide: no sold prices to go on yet.'}
          </span>
        )}
      </p>

      <div className="pt-1">
        {/* Where similar pieces sold, on the same scale as the slider. */}
        {sold.length > 0 && (
          <div className="relative mx-2 mb-1 h-3" aria-hidden>
            {sold.map((v, i) => (
              <span
                key={i}
                className="absolute top-0 h-3 w-0.5 rounded bg-ink/40"
                style={{ left: `${positionForPrice(suggestion, v) * 100}%` }}
              />
            ))}
          </div>
        )}
        <input
          id={ids.slider}
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.round(position * 100)}
          disabled={disabled}
          onChange={e => setPosition(Number(e.target.value) / 100)}
          aria-label="Price, from sell fast to maximize profit"
          aria-valuetext={`${money(point.price, currency)}. ${point.speed_label}.`}
          aria-describedby={ids.speed}
          className="h-11 w-full cursor-pointer accent-[var(--tag)] disabled:cursor-not-allowed"
        />
        <div className="grid grid-cols-3 text-xs text-muted">
          <button type="button" className="justify-self-start text-left hover:text-ink" onClick={() => setPosition(0)}>
            <span className="block font-semibold text-ink-2">Sell fast</span>
            <span className="tabular">{money(pricePoint(suggestion, 0).price, currency)}</span>
          </button>
          <button type="button" className="justify-self-center text-center hover:text-ink" onClick={() => setPosition(0.5)}>
            <span className="block font-semibold text-ink-2">Suggested</span>
            <span className="tabular">{money(suggestion.suggested, currency)}</span>
          </button>
          <button type="button" className="justify-self-end text-right hover:text-ink" onClick={() => setPosition(1)}>
            <span className="block font-semibold text-ink-2">Maximize profit</span>
            <span className="tabular">{money(pricePoint(suggestion, 1).price, currency)}</span>
          </button>
        </div>
      </div>

      {point.take_home.length > 0 && (
        <ul className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4" aria-label="What you keep after fees">
          {point.take_home.map(t => (
            <li key={t.marketplace} className="rounded-lg bg-paper-2 px-3 py-2">
              <span className="block text-xs text-muted">{MARKETPLACES[t.marketplace].name}, you keep</span>
              <span className="font-semibold tabular">{money(t.keep, currency)}</span>
            </li>
          ))}
        </ul>
      )}

      {!compact && (
        <p className="text-xs text-muted">
          {CONFIDENCE_TEXT[suggestion.confidence]}.{' '}
          {s
            ? evidenceText(s)
            : `${suggestion.comps_used} comparable ${suggestion.comps_used === 1 ? 'price' : 'prices'}.`}
        </p>
      )}

      {onUse && (
        <div>
          <Button
            variant="ink"
            size={compact ? 'sm' : 'md'}
            busy={busy}
            disabled={disabled || current === point.price}
            onClick={() => onUse(point.price)}
          >
            {current === point.price ? `Priced at ${money(point.price, currency)}` : `Use ${money(point.price, currency)}`}
          </Button>
        </div>
      )}
    </div>
  );
}

function evidenceText(s: NonNullable<PriceSuggestion['sources']>): string {
  const parts = [
    s.sold ? `${s.sold} sold on eBay` : null,
    s.asking ? `${s.asking} live ${s.asking === 1 ? 'listing' : 'listings'}` : null,
    s.own ? `${s.own} of your own ${s.own === 1 ? 'sale' : 'sales'}` : null,
    s.ai ? 'the photo scan' : null,
  ].filter(Boolean);
  return parts.length ? `Based on ${parts.join(', ')}.` : '';
}
