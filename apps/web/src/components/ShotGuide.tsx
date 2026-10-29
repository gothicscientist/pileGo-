// The scan's photo board: the cover preview, the three key slots (front,
// back, clothing label) each with its own picker, and the optional extras.

import type { PhotoRole } from '@pilego/core';
import { Check, Plus, Trash2 } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import type { DragEvent } from 'react';
import { cx } from '~/lib/format';
import type { StagedPhoto } from '~/lib/queries';
import { KEY_SHOTS, ROLE_NAME, type KeyRole } from '~/lib/shots';

export interface Shot {
  key: string;
  file: File;
  local: string;
  role: PhotoRole;
  staged?: StagedPhoto;
  state: 'uploading' | 'done' | 'error';
  error?: string;
}

export function CoverPreview({
  cover,
  scanning,
  cut,
}: {
  cover: Shot;
  scanning: boolean;
  cut: { state: string; progress: number; preview?: string } | null;
}) {
  const reduce = useReducedMotion();
  // On a phone the slots already show each photo; the big preview earns its space only for the scan and the cutout.
  const phoneToo = scanning || Boolean(cut && cut.state !== 'idle');
  return (
    <div className={cx('floor relative aspect-[4/5] max-h-[60vh] overflow-hidden rounded-2xl', !phoneToo && 'hidden lg:block')}>
      {cut?.preview ? (
        <motion.img
          src={cut.preview}
          alt="Cutout of the cover photo"
          className="absolute inset-0 m-auto max-h-[86%] max-w-[86%] object-contain cutout-shadow"
          initial={{ scale: 0.8, rotate: -8, opacity: 0 }}
          animate={{ scale: 1, rotate: -3, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 180, damping: 14 }}
        />
      ) : (
        <img src={cover.local} alt="Cover photo" className="absolute inset-0 size-full object-cover" />
      )}
      <span className="absolute top-2 left-2 rounded bg-ink px-1.5 py-0.5 text-[0.65rem] font-bold text-paper">
        {cover.role === 'front' ? 'Cover' : 'Cover until you add a front photo'}
      </span>
      {scanning && !reduce && (
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <div
            className="absolute inset-x-0 h-1/4 bg-gradient-to-b from-transparent via-tag/35 to-tag/70"
            style={{ animation: 'sweep 1.6s cubic-bezier(.6,.1,.4,.9) infinite alternate' }}
          />
        </div>
      )}
      {cut?.state === 'working' && (
        <div className="absolute inset-x-3 bottom-3 rounded-lg bg-ink/80 px-3 py-2 text-xs text-paper">
          Cutting out
          <div className="mt-1 h-1 overflow-hidden rounded bg-white/20">
            <div className="h-full bg-tag transition-all" style={{ width: `${Math.round(cut.progress * 100)}%` }} />
          </div>
        </div>
      )}
      {cut?.state === 'error' && (
        <p className="absolute inset-x-3 bottom-3 rounded-lg bg-ink/80 px-3 py-2 text-xs text-paper">
          The cutout did not work in this browser. The normal photo will be used.
        </p>
      )}
    </div>
  );
}

export function ShotGuide({
  shots,
  locked,
  full,
  onPick,
  onRemove,
  onRole,
  onDrop,
}: {
  /** In display order (see orderShots). */
  shots: Shot[];
  locked: boolean;
  full: boolean;
  onPick: (role: PhotoRole) => void;
  onRemove: (key: string) => void;
  onRole: (key: string, role: PhotoRole) => void;
  onDrop: (e: DragEvent) => void;
}) {
  const extras = shots.filter(s => s.role === 'extra');
  const done = KEY_SHOTS.filter(k => shots.some(s => s.role === k.role)).length;
  return (
    <section
      aria-labelledby="key-photos"
      className="flex flex-col gap-3"
      onDragOver={e => {
        if (!locked) e.preventDefault();
      }}
      onDrop={onDrop}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="key-photos" className="font-display text-lg font-bold">
          Three key photos
        </h2>
        <span className={cx('text-sm font-semibold tabular', done === 3 ? 'text-tag' : 'text-muted')} data-testid="shot-count">
          {done} of 3
        </span>
      </div>
      <ol className="grid grid-cols-3 gap-2 sm:gap-3">
        {KEY_SHOTS.map((k, i) => {
          const shot = shots.find(s => s.role === k.role);
          return (
            <li key={k.role} className="min-w-0">
              {shot ? (
                <ShotTile shot={shot} locked={locked} onRemove={onRemove} onRole={onRole} badge={`${i + 1}. ${k.label}`} />
              ) : (
                <button
                  type="button"
                  disabled={locked || full}
                  onClick={() => onPick(k.role)}
                  className="flex aspect-[4/5] w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-line bg-paper-2/60 p-2 text-center transition-colors hover:border-ink-2 disabled:opacity-50"
                  aria-label={`Add the ${k.label.toLowerCase()} photo. ${k.tip}.`}
                >
                  <ShotIllustration role={k.role} />
                  <span className="font-display text-sm leading-tight font-bold">
                    {i + 1}. {k.label}
                  </span>
                  <span className="hidden text-[0.7rem] leading-tight text-muted sm:block">{k.tip}</span>
                  <span className="mt-0.5 inline-flex items-center gap-0.5 text-[0.7rem] font-semibold text-tag">
                    <Plus className="size-3" aria-hidden /> Add
                  </span>
                </button>
              )}
            </li>
          );
        })}
      </ol>
      <p className="text-xs text-muted sm:hidden">The front laid flat, the back the same way, then the label close up: brand, size and care tags.</p>

      <h3 className="pt-1 text-sm font-semibold text-ink-2">
        Extras <span className="font-normal text-muted">(optional: flaws, details, the fit)</span>
      </h3>
      <ul className="grid grid-cols-4 gap-2">
        {extras.map(s => (
          <li key={s.key} className="min-w-0">
            <ShotTile shot={s} locked={locked} onRemove={onRemove} onRole={onRole} square />
          </li>
        ))}
        {!full && !locked && (
          <li>
            <button
              type="button"
              onClick={() => onPick('extra')}
              className="flex aspect-square w-full flex-col items-center justify-center gap-0.5 rounded-lg border-2 border-dashed border-line text-[0.7rem] font-semibold text-muted hover:border-ink-2"
              aria-label="Add an extra photo"
            >
              <Plus className="size-4" aria-hidden />
              Extra
            </button>
          </li>
        )}
      </ul>
    </section>
  );
}

function ShotTile({
  shot,
  locked,
  onRemove,
  onRole,
  badge,
  square,
}: {
  shot: Shot;
  locked: boolean;
  onRemove: (key: string) => void;
  onRole: (key: string, role: PhotoRole) => void;
  badge?: string;
  square?: boolean;
}) {
  return (
    <div className={cx('relative overflow-hidden bg-paper-2', square ? 'aspect-square rounded-lg' : 'aspect-[4/5] rounded-xl')}>
      <img
        src={shot.local}
        alt={`${ROLE_NAME[shot.role]} photo`}
        className={cx('size-full object-cover', shot.state === 'uploading' && 'opacity-50')}
      />
      {shot.state === 'uploading' && <span className="skeleton absolute inset-x-0 bottom-0 h-1" />}
      {shot.state === 'error' && (
        <span className="absolute inset-0 flex items-center bg-danger/85 p-1 text-[0.65rem] leading-tight text-white" title={shot.error}>
          {shot.error}
        </span>
      )}
      {badge && (
        <span className="absolute top-1 left-1 inline-flex items-center gap-0.5 rounded bg-ink px-1 text-[0.6rem] font-bold text-paper">
          {shot.state === 'done' && <Check className="size-3 text-tag" aria-hidden />}
          {badge}
        </span>
      )}
      {!locked && (
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-black/70 p-1">
          <select
            aria-label="What this photo shows"
            value={shot.role}
            onChange={e => onRole(shot.key, e.target.value as PhotoRole)}
            className="min-w-0 max-w-[4.75rem] rounded bg-white/90 px-0.5 py-0.5 text-[0.65rem] font-semibold text-ink"
          >
            {(['front', 'back', 'label', 'extra'] as const).map(r => (
              <option key={r} value={r}>
                {ROLE_NAME[r]}
              </option>
            ))}
          </select>
          <button type="button" aria-label="Remove photo" className="rounded bg-white/90 p-1 text-danger" onClick={() => onRemove(shot.key)}>
            <Trash2 className="size-3.5" aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}

/** Tiny line drawings of each shot, so the slots read at a glance. */
function ShotIllustration({ role }: { role: KeyRole }) {
  const props = {
    className: 'size-10 text-ink-2',
    viewBox: '0 0 48 48',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinejoin: 'round' as const,
    strokeLinecap: 'round' as const,
    'aria-hidden': true,
  };
  if (role === 'label') {
    return (
      <svg {...props}>
        <path d="M10 12h28v24H10z" />
        <path d="M16 19h16M16 25h10M16 31h13" />
        <circle cx="34" cy="16" r="1.5" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  return (
    <svg {...props}>
      <path d="M17 8l-9 6 4 7 4-2v21h16V19l4 2 4-7-9-6" />
      {role === 'front' ? (
        <path d="M17 8c1.5 4 4 5.5 7 5.5S29.5 12 31 8" />
      ) : (
        <>
          <path d="M18 8.5c2 1.5 4 2 6 2s4-.5 6-2" />
          <path d="M24 13v26" strokeDasharray="2 3" />
        </>
      )}
    </svg>
  );
}
