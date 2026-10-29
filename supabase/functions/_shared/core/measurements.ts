// Generated from packages/core/src by scripts/sync-core.mjs. Do not edit.
// Flat garment measurements: which ones exist, what range is plausible, and
// how AI estimates are carried until the seller measures for real.

import type { EstimatedMeasurements, MeasurementKey, Measurements } from './types.ts';

export const MEASUREMENT_KEYS: MeasurementKey[] = ['pit_to_pit', 'length', 'shoulder', 'sleeve', 'waist', 'hips', 'inseam', 'rise'];

export const MEASUREMENT_LABEL: Record<MeasurementKey, string> = {
  pit_to_pit: 'Pit to pit',
  length: 'Length',
  shoulder: 'Shoulder',
  sleeve: 'Sleeve',
  waist: 'Waist',
  hips: 'Hips',
  inseam: 'Inseam',
  rise: 'Rise',
};

/**
 * Plausible flat measurements in centimetres, from small kids' sizes to
 * oversized adult pieces. Waist and hips are measured flat, so half the
 * circumference. Anything outside is a misread, not a garment.
 */
const RANGE_CM: Record<MeasurementKey, [number, number]> = {
  pit_to_pit: [20, 90],
  length: [25, 170],
  shoulder: [20, 70],
  sleeve: [10, 95],
  waist: [15, 80],
  hips: [20, 90],
  inseam: [10, 100],
  rise: [10, 50],
};

export function isMeasurementKey(key: unknown): key is MeasurementKey {
  return typeof key === 'string' && (MEASUREMENT_KEYS as string[]).includes(key);
}

/** The value if it is a plausible measurement in `unit`, rounded to the nearest half; otherwise null. */
export function plausibleMeasurement(key: MeasurementKey, value: unknown, unit: 'cm' | 'in'): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number.parseFloat(value) : Number.NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  const cm = unit === 'in' ? n * 2.54 : n;
  const [min, max] = RANGE_CM[key];
  if (cm < min || cm > max) return null;
  return Math.round(n * 2) / 2;
}

/** Coerce a model's estimate into plausible values; null when nothing survives. */
export function normalizeEstimate(raw: unknown, unit: 'cm' | 'in'): EstimatedMeasurements | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const out: EstimatedMeasurements = { unit, basis: null };
  let any = false;
  for (const key of MEASUREMENT_KEYS) {
    const v = plausibleMeasurement(key, r[key], unit);
    if (v != null) {
      out[key] = v;
      any = true;
    }
  }
  if (!any) return null;
  if (typeof r.basis === 'string' && r.basis.trim()) out.basis = r.basis.trim().slice(0, 200);
  return out;
}

/** Measurements pre-filled from an estimate, with every filled key marked as estimated. */
export function measurementsFromEstimate(est: EstimatedMeasurements | null | undefined): Measurements | null {
  if (!est) return null;
  const m: Measurements = { unit: est.unit, estimated: [] };
  for (const key of MEASUREMENT_KEYS) {
    const v = est[key];
    if (v != null && v > 0) {
      m[key] = v;
      m.estimated!.push(key);
    }
  }
  return m.estimated!.length ? m : null;
}

/** Set one measurement by hand: the seller measured it, so it is no longer an estimate. */
export function setMeasurement(m: Measurements, key: MeasurementKey, value: number | null): Measurements {
  const estimated = (m.estimated ?? []).filter(k => k !== key);
  const next: Measurements = { ...m, [key]: value };
  if (estimated.length) next.estimated = estimated;
  else delete next.estimated;
  return next;
}

/** Drop every value that is still only an estimate. */
export function clearEstimates(m: Measurements): Measurements {
  const next: Measurements = { ...m };
  for (const key of m.estimated ?? []) delete next[key];
  delete next.estimated;
  return next;
}

export function isEstimated(m: Measurements | null | undefined, key: MeasurementKey): boolean {
  return Boolean(m?.estimated?.includes(key));
}
