// The item's details, shared by the scan review and the item page.

import {
  CATEGORIES,
  CONDITION_HINT,
  CONDITION_LABEL,
  CONDITIONS,
  DEPARTMENTS,
  clearEstimates,
  findCategory,
  suggestPrice,
  measurementsFromEstimate,
  setMeasurement,
  type Condition,
  type Department,
  type Item,
  type MeasurementKey,
  type Measurements,
  type PriceSuggestion,
  type ScanResult,
} from '@pilego/core';
import { Sparkles } from 'lucide-react';
import { useId, useMemo } from 'react';
import { cx, money } from '~/lib/format';
import type { ItemDraft } from '~/lib/queries';
import { PricePicker } from './PricePicker';
import { ChipInput, ChoiceChips, Field, Input, Select, TextArea, TextField } from './ui';

export type FormValue = Required<
  Pick<
    ItemDraft,
    | 'title'
    | 'brand'
    | 'department'
    | 'category'
    | 'subcategory'
    | 'size'
    | 'size_system'
    | 'colors'
    | 'materials'
    | 'condition'
    | 'flaws'
    | 'measurements'
    | 'style_tags'
    | 'era'
    | 'description'
    | 'price'
    | 'original_price'
    | 'cost'
    | 'location'
    | 'notes'
  >
>;

export function emptyForm(): FormValue {
  return {
    title: '',
    brand: null,
    department: null,
    category: null,
    subcategory: null,
    size: null,
    size_system: null,
    colors: [],
    materials: [],
    condition: null,
    flaws: null,
    measurements: null,
    style_tags: [],
    era: null,
    description: '',
    price: null,
    original_price: null,
    cost: null,
    location: null,
    notes: null,
  };
}

export function formFromItem(item: Item): FormValue {
  const f = emptyForm();
  for (const key of Object.keys(f) as Array<keyof FormValue>) {
    (f as Record<string, unknown>)[key] = item[key as keyof Item] ?? f[key];
  }
  return f;
}

export function formFromScan(scan: ScanResult, base: FormValue = emptyForm()): FormValue {
  return {
    ...base,
    title: scan.title,
    brand: scan.brand,
    department: scan.department,
    category: scan.category,
    subcategory: scan.subcategory,
    size: scan.size,
    size_system: scan.size_system,
    colors: scan.colors,
    materials: scan.materials,
    condition: scan.condition,
    flaws: scan.flaws,
    era: scan.era,
    style_tags: scan.style_tags,
    description: scan.description,
    measurements: base.measurements ?? measurementsFromEstimate(scan.estimated_measurements),
    price: base.price ?? aiSuggestion(scan, scan.condition)?.suggested ?? null,
  };
}

/** The scan's price, discounted the way the pricing tool treats a photo-only guess. */
function aiSuggestion(scan: ScanResult, condition: Condition | null): PriceSuggestion | null {
  if (!scan.price?.suggested) return null;
  return suggestPrice({ currency: scan.price.currency, condition, ai: scan.price, now: new Date(0) });
}

/** Only the fields that changed, for an update. */
export function diffForm(before: FormValue, after: FormValue): ItemDraft {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(after) as Array<keyof FormValue>) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) out[key] = after[key];
  }
  return out as ItemDraft;
}

const COLOR_SUGGESTIONS = ['Black', 'White', 'Grey', 'Navy', 'Blue', 'Brown', 'Beige', 'Green', 'Red', 'Pink', 'Cream', 'Multi'];
const MATERIAL_SUGGESTIONS = ['Cotton', 'Denim', 'Wool', 'Polyester', 'Leather', 'Linen', 'Silk', 'Cashmere', 'Nylon'];

const MEASURE_FIELDS: Record<string, Array<[MeasurementKey, string]>> = {
  top: [
    ['pit_to_pit', 'Pit to pit'],
    ['length', 'Length'],
    ['shoulder', 'Shoulder'],
    ['sleeve', 'Sleeve'],
  ],
  bottom: [
    ['waist', 'Waist'],
    ['hips', 'Hips'],
    ['inseam', 'Inseam'],
    ['rise', 'Rise'],
    ['length', 'Length'],
  ],
  dress: [
    ['pit_to_pit', 'Pit to pit'],
    ['waist', 'Waist'],
    ['hips', 'Hips'],
    ['length', 'Length'],
  ],
};

function measureSet(category: string | null): Array<[MeasurementKey, string]> | null {
  if (!category) return MEASURE_FIELDS.top!;
  if (category === 'bottoms') return MEASURE_FIELDS.bottom!;
  if (category === 'dresses') return MEASURE_FIELDS.dress!;
  if (['shoes', 'bags', 'accessories'].includes(category)) return null;
  return MEASURE_FIELDS.top!;
}

const numOrNull = (v: string): number | null => {
  if (v.trim() === '') return null;
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : null;
};

export function ItemForm({
  value,
  onChange,
  currency,
  unit,
  scan,
}: {
  value: FormValue;
  onChange: (v: FormValue) => void;
  currency: string;
  unit: 'cm' | 'in';
  scan?: ScanResult | null;
}) {
  const set = <K extends keyof FormValue>(key: K, v: FormValue[K]) => onChange({ ...value, [key]: v });
  const category = findCategory(value.category);
  const measures = measureSet(value.category);
  const m: Measurements = value.measurements ?? { unit };
  const estimated = (m.estimated ?? []).filter(k => measures?.some(([key]) => key === k) && m[k] != null);
  const basis = scan?.estimated_measurements?.basis;
  const ids = { cat: useId(), sub: useId(), desc: useId(), price: useId() };
  const aiPrice = useMemo(() => (scan ? aiSuggestion(scan, value.condition) : null), [scan, value.condition]);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4">
        <TextField
          label="Title"
          value={value.title}
          maxLength={120}
          onChange={e => set('title', e.target.value)}
          hint={`${value.title.length} characters. eBay shows 80, Vinted and Poshmark fewer. pileGo trims per marketplace.`}
          placeholder="Levi's 501 straight leg jeans"
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField label="Brand" value={value.brand ?? ''} onChange={e => set('brand', e.target.value || null)} placeholder="Unbranded" />
          <TextField label="Size" value={value.size ?? ''} onChange={e => set('size', e.target.value || null)} placeholder="M, 10, W32 L30" />
          <TextField label="Era" value={value.era ?? ''} onChange={e => set('era', e.target.value || null)} placeholder="90s, Y2K" />
        </div>
      </div>

      <ChoiceChips<Department>
        label="Department"
        value={value.department}
        onChange={v => set('department', v)}
        options={DEPARTMENTS.map(d => ({ value: d.id, label: d.label }))}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Category" htmlFor={ids.cat}>
          <Select
            id={ids.cat}
            value={value.category ?? ''}
            onChange={e => onChange({ ...value, category: e.target.value || null, subcategory: null })}
          >
            <option value="">Choose</option>
            {CATEGORIES.map(c => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Type" htmlFor={ids.sub}>
          <Select
            id={ids.sub}
            value={value.subcategory ?? ''}
            disabled={!category}
            onChange={e => set('subcategory', e.target.value || null)}
          >
            <option value="">{category ? 'Choose' : 'Pick a category first'}</option>
            {category?.subcategories.map(s => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <ChoiceChips<Condition>
        label="Condition"
        value={value.condition}
        onChange={v => set('condition', v)}
        options={CONDITIONS.map(c => ({ value: c, label: CONDITION_LABEL[c], title: CONDITION_HINT[c] }))}
        hint={value.condition ? CONDITION_HINT[value.condition] : 'Each marketplace gets its own wording for this.'}
      />

      <TextField
        label="Flaws"
        value={value.flaws ?? ''}
        onChange={e => set('flaws', e.target.value || null)}
        placeholder="Small mark on left cuff"
        hint="Said plainly, flaws build trust and stop returns."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <ChipInput label="Colours" values={value.colors} onChange={v => set('colors', v)} suggestions={COLOR_SUGGESTIONS} placeholder="Add a colour" />
        <ChipInput
          label="Materials"
          values={value.materials}
          onChange={v => set('materials', v)}
          suggestions={MATERIAL_SUGGESTIONS}
          placeholder="100% cotton"
        />
      </div>
      <ChipInput
        label="Style tags"
        values={value.style_tags}
        onChange={v => set('style_tags', v)}
        placeholder="workwear, oversized, grunge"
        hint="Used for search keywords and Depop hashtags."
        max={10}
      />

      {measures && (
        <fieldset>
          <legend className="mb-1.5 text-sm font-semibold text-ink-2">
            Measurements, laid flat ({unit})
          </legend>
          {estimated.length ? (
            <div className="mb-3 kraft rounded-xl px-3 py-2 text-xs" data-testid="estimate-note">
              <p className="flex items-start gap-1.5">
                <Sparkles className="mt-px size-3.5 shrink-0" aria-hidden />
                <span>
                  <strong>AI estimates</strong>, worked out from {basis ? basis.charAt(0).toLowerCase() + basis.slice(1) : 'the size tag'}.
                  Measure flat to confirm: listings say “approx.” next to each one until you change it.
                </span>
              </p>
              <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 pl-5 font-semibold">
                <button type="button" className="underline underline-offset-2" onClick={() => set('measurements', { ...m, estimated: [] })}>
                  I measured, they’re right
                </button>
                <button type="button" className="underline underline-offset-2" onClick={() => set('measurements', clearEstimates(m))}>
                  Clear the estimates
                </button>
              </div>
            </div>
          ) : scan?.measurements_to_take?.length ? (
            <p className="mb-2 flex items-center gap-1.5 text-xs text-muted">
              <Sparkles className="size-3.5" aria-hidden />
              Worth measuring: {scan.measurements_to_take.join(', ')}
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {measures.map(([key, label]) => {
              const guess = estimated.includes(key);
              return (
                <label key={key} className="flex flex-col gap-1 text-xs text-muted">
                  <span className="flex items-center gap-1">
                    {label}
                    {guess && (
                      <span className="rounded bg-accent/15 px-1 text-[0.6rem] font-semibold tracking-wide text-accent uppercase" title="Estimated by the AI">
                        AI est.
                      </span>
                    )}
                  </span>
                  <Input
                    inputMode="decimal"
                    className={cx(guess && 'field-estimate')}
                    aria-description={guess ? 'AI estimate, measure to confirm' : undefined}
                    value={m[key] ?? ''}
                    onChange={e => set('measurements', setMeasurement({ ...m, unit }, key, numOrNull(e.target.value)))}
                  />
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      <Field label="Description" htmlFor={ids.desc} hint="Write it once. Each marketplace gets its own version with the details and hashtags it wants.">
        <TextArea id={ids.desc} rows={6} value={value.description} onChange={e => set('description', e.target.value)} />
      </Field>

      {aiPrice && (
        <section className="flex flex-col gap-2" aria-labelledby={ids.price}>
          <div>
            <h3 id={ids.price} className="text-sm font-semibold text-ink-2">
              Price
            </h3>
            <p className="text-xs text-muted">
              From the photos only, so a rough guide. Check prices after saving to see what similar pieces sold for.
            </p>
          </div>
          <PricePicker suggestion={aiPrice} currency={currency} value={value.price} onChange={p => set('price', p)} compact />
        </section>
      )}

      <div className={cx('grid gap-4', aiPrice ? 'sm:grid-cols-2' : 'sm:grid-cols-3')}>
        {!aiPrice && (
          <Field label={`Price (${currency})`} htmlFor={ids.price}>
            <Input
              id={ids.price}
              inputMode="decimal"
              value={value.price ?? ''}
              onChange={e => set('price', numOrNull(e.target.value))}
              placeholder="0"
            />
          </Field>
        )}
        <TextField
          label="Original retail"
          inputMode="decimal"
          value={value.original_price ?? ''}
          onChange={e => set('original_price', numOrNull(e.target.value))}
          hint="Poshmark asks for it."
        />
        <TextField
          label="You paid"
          inputMode="decimal"
          value={value.cost ?? ''}
          onChange={e => set('cost', numOrNull(e.target.value))}
          hint="Private. Used for profit."
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Where it is"
          value={value.location ?? ''}
          onChange={e => set('location', e.target.value || null)}
          placeholder="Bin 3, top shelf"
          hint="Private. Helps you find it when it sells."
        />
        <TextField label="Notes" value={value.notes ?? ''} onChange={e => set('notes', e.target.value || null)} hint="Private." />
      </div>
    </div>
  );
}
