import data from "./garments.json";

export type GarmentInfo = { src: string; w: number; h: number };

const all = data as Record<string, GarmentInfo>;

/** A garment cutout from public/garments (see scripts/garment-index.py). */
export const garment = (name: string): GarmentInfo => {
  const g = all[name];
  if (!g) throw new Error(`Unknown garment "${name}". Run python3 scripts/garment-index.py`);
  return g;
};

export const hasGarment = (name: string) => name in all;
