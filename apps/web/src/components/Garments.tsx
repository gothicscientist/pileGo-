// Paper-cutout garments for empty states and the sign-in floor. Flat shapes
// with a dashed stitch line, like something cut from a magazine.

import type { CSSProperties } from 'react';

export type GarmentKind = 'tee' | 'jeans' | 'jacket' | 'dress' | 'sneaker' | 'tote';

const PATHS: Record<GarmentKind, { body: string; stitch: string; view: string }> = {
  tee: {
    view: '0 0 140 130',
    body: 'M48 6 C56 16 84 16 92 6 L132 26 L118 56 L104 50 L104 124 L36 124 L36 50 L22 56 L8 26 Z',
    stitch: 'M42 116 L98 116 M14 30 L26 36 M126 30 L114 36 M54 14 C62 22 78 22 86 14',
  },
  jeans: {
    view: '0 0 110 150',
    body: 'M14 4 L96 4 L104 146 L64 146 L56 50 L54 50 L46 146 L6 146 Z',
    stitch: 'M16 16 L94 16 M30 16 C30 34 20 38 12 38 M80 16 C80 34 90 38 98 38 M55 16 L55 44',
  },
  jacket: {
    view: '0 0 150 150',
    body: 'M52 6 L98 6 L140 28 L146 140 L120 140 L116 70 L114 144 L36 144 L34 70 L30 140 L4 140 L10 28 Z',
    stitch: 'M52 6 L75 60 L98 6 M75 60 L75 140 M48 96 L64 96 M86 96 L102 96 M14 128 L30 128 M120 128 L136 128',
  },
  dress: {
    view: '0 0 120 150',
    body: 'M38 4 L48 4 C50 18 70 18 72 4 L82 4 L84 40 C84 48 80 52 80 56 L112 146 L8 146 L40 56 C40 52 36 48 36 40 Z',
    stitch: 'M40 56 L80 56 M16 136 L104 136',
  },
  sneaker: {
    view: '0 0 160 90',
    body: 'M8 52 C8 30 22 14 40 12 L60 14 C70 30 92 40 118 44 C140 48 152 56 152 68 L152 80 L8 80 Z',
    stitch: 'M8 68 L152 68 M48 22 L56 40 M60 20 L70 40 M72 28 L80 44',
  },
  tote: {
    view: '0 0 120 140',
    body: 'M10 46 L110 46 L104 136 L16 136 Z M36 46 C36 4 84 4 84 46 L76 46 C76 16 44 16 44 46 Z',
    stitch: 'M18 56 L102 56 M22 126 L98 126',
  },
};

export function Garment({
  kind,
  fill,
  className,
  style,
}: {
  kind: GarmentKind;
  fill: string;
  className?: string;
  style?: CSSProperties;
}) {
  const g = PATHS[kind];
  return (
    <svg viewBox={g.view} className={className} style={style} aria-hidden>
      <path d={g.body} fill={fill} fillRule="evenodd" />
      <path d={g.stitch} fill="none" stroke="rgb(255 255 255 / 0.55)" strokeWidth="2" strokeDasharray="4 4" strokeLinecap="round" />
    </svg>
  );
}

export const GARMENT_KINDS = Object.keys(PATHS) as GarmentKind[];
