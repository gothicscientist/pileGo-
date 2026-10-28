// Single-series charts drawn in plain SVG and HTML. One hue (--chart) for
// magnitude; labels in text colours; a tooltip on every mark.

import { useId, useState } from 'react';
import { cx } from '~/lib/format';

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const exp = 10 ** Math.floor(Math.log10(v));
  for (const step of [1, 2, 2.5, 5, 10]) if (step * exp >= v) return step * exp;
  return 10 * exp;
}

function compact(v: number): string {
  if (Math.abs(v) >= 1000) return `${Math.round(v / 100) / 10}K`;
  return String(Math.round(v));
}

export interface ColumnDatum {
  key: string;
  label: string;
  value: number;
  /** Tooltip lines under the value. */
  detail?: string;
}

/** Vertical columns over time, value on the tallest and the latest. */
export function ColumnChart({
  data,
  format,
  height = 200,
  label,
}: {
  data: ColumnDatum[];
  format: (v: number) => string;
  height?: number;
  label: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(0, ...data.map(d => d.value)));
  const ticks = [0, max / 2, max];
  const peak = data.reduce((best, d, i) => (d.value > (data[best]?.value ?? -1) ? i : best), 0);
  const last = data.length - 1;
  const top = 18;
  const plot = height - top - 24;

  return (
    <figure className="relative" aria-label={label}>
      <div className="flex" style={{ height }}>
        <div className="relative w-10 shrink-0 text-right text-[0.7rem] text-muted tabular" aria-hidden>
          {ticks.map(t => (
            <span key={t} className="absolute right-2 -translate-y-1/2" style={{ top: top + plot - (t / max) * plot }}>
              {compact(t)}
            </span>
          ))}
        </div>
        <div className="relative flex-1">
          {ticks.map(t => (
            <div key={t} className="absolute inset-x-0 h-px bg-line" style={{ top: top + plot - (t / max) * plot }} aria-hidden />
          ))}
          <ol className="absolute inset-x-0 flex" style={{ top, height: plot }}>
            {data.map((d, i) => {
              const h = max ? (d.value / max) * plot : 0;
              const show = d.value > 0 && (i === peak || i === last);
              return (
                <li
                  key={d.key}
                  className="relative flex flex-1 items-end justify-center"
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  tabIndex={0}
                  aria-label={`${d.label}: ${format(d.value)}${d.detail ? `, ${d.detail}` : ''}`}
                >
                  {hover === i && <span className="absolute inset-0 rounded-md bg-ink/5" aria-hidden />}
                  {show && (
                    <span className="absolute text-[0.7rem] font-semibold text-ink-2 tabular" style={{ bottom: h + 4 }}>
                      {format(d.value)}
                    </span>
                  )}
                  <span
                    className="relative w-full max-w-6 rounded-t-[4px] bg-chart transition-opacity"
                    style={{ height: Math.max(d.value > 0 ? 2 : 0, h), opacity: hover == null || hover === i ? 1 : 0.55 }}
                  />
                </li>
              );
            })}
          </ol>
          <ol className="absolute inset-x-0 bottom-0 flex text-[0.7rem] text-muted" aria-hidden>
            {data.map((d, i) => (
              <li key={d.key} className={cx('flex-1 text-center', i % 2 === 1 && data.length > 8 && 'max-sm:invisible')}>
                {d.label}
              </li>
            ))}
          </ol>
          {hover != null && data[hover] && (
            <div
              className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-lg bg-ink px-2.5 py-1.5 text-xs whitespace-nowrap text-paper lift"
              style={{
                left: `${((hover + 0.5) / data.length) * 100}%`,
                top: Math.max(0, top + plot - (data[hover]!.value / max) * plot - 46),
              }}
              role="status"
            >
              <span className="block font-semibold">{data[hover]!.label}</span>
              {format(data[hover]!.value)}
              {data[hover]!.detail && <span className="block text-paper/70">{data[hover]!.detail}</span>}
            </div>
          )}
        </div>
      </div>
    </figure>
  );
}

export interface BarDatum {
  key: string;
  label: string;
  value: number;
  detail?: string;
  swatch?: string;
}

/** Horizontal bars with the value at the tip. Sorted by the caller. */
export function BarList({ data, format, label }: { data: BarDatum[]; format: (v: number) => string; label: string }) {
  const max = Math.max(0, ...data.map(d => d.value)) || 1;
  const id = useId();
  return (
    <ul className="flex flex-col gap-2.5" aria-label={label}>
      {data.map(d => (
        <li key={d.key} className="group" title={d.detail ? `${d.label}: ${format(d.value)}, ${d.detail}` : undefined}>
          <div className="mb-1 flex items-center gap-2 text-sm">
            {d.swatch && <span className="size-2.5 shrink-0 rounded-sm" style={{ background: d.swatch }} aria-hidden />}
            <span id={`${id}-${d.key}`} className="min-w-0 flex-1 truncate text-ink">
              {d.label}
            </span>
            {d.detail && <span className="text-xs text-muted">{d.detail}</span>}
          </div>
          <div className="flex items-center gap-2" aria-labelledby={`${id}-${d.key}`}>
            <span
              className="h-3 rounded-r-[4px] bg-chart transition-opacity group-hover:opacity-80"
              style={{ width: `${Math.max(1, (d.value / max) * 82)}%` }}
            />
            <span className="text-xs font-semibold text-ink-2 tabular">{format(d.value)}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function StatTile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm text-ink-2">{label}</span>
      <span className="text-2xl font-semibold">{value}</span>
      {note && <span className="text-xs text-muted">{note}</span>}
    </div>
  );
}
