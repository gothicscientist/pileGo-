// Scan: photos in, a drafted listing out. Photos upload as soon as they are
// picked so the AI can read them; the garment is cut out for the pile while
// the AI works.

import type { ScanResult } from '@pilego/core';
import { Camera, ImagePlus, Scissors, Star, Trash2, Wand2 } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { emptyForm, formFromScan, ItemForm, type FormValue } from '~/components/ItemForm';
import { useToast } from '~/components/overlay';
import { Button, ErrorNote, Paper, TextField } from '~/components/ui';
import { useUserId } from '~/lib/auth';
import { cx } from '~/lib/format';
import { imageFiles, takeHandedOffFiles } from '~/lib/handoff';
import { newId, removePhotos } from '~/lib/photos';
import { scanPhotos, stageCutout, stagePhoto, useCreateItem, useProfile, type StagedPhoto } from '~/lib/queries';
import { errorMessage } from '~/lib/supabase';

interface Shot {
  key: string;
  file: File;
  local: string;
  staged?: StagedPhoto;
  state: 'uploading' | 'done' | 'error';
  error?: string;
}

type Phase = 'pick' | 'scanning' | 'review';

const CUT_PREF = 'pilego-cutouts';
const MAX_PHOTOS = 12;

function cutoutsOn(): boolean {
  try {
    return localStorage.getItem(CUT_PREF) !== 'off';
  } catch {
    return true;
  }
}

export function Scan() {
  const uid = useUserId();
  const { data: profile } = useProfile();
  const currency = profile?.currency ?? 'USD';
  const unit = profile?.measurement_unit ?? 'in';
  const navigate = useNavigate();
  const toast = useToast();
  const create = useCreateItem();

  const [itemId, setItemId] = useState(newId);
  const [shots, setShots] = useState<Shot[]>([]);
  const [phase, setPhase] = useState<Phase>('pick');
  const [hint, setHint] = useState('');
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [form, setForm] = useState<FormValue>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [cutouts, setCutouts] = useState(cutoutsOn);
  const [cut, setCut] = useState<{ state: 'idle' | 'working' | 'done' | 'error'; progress: number; preview?: string; path?: string }>({
    state: 'idle',
    progress: 0,
  });
  const saved = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);

  // Photos dropped on the pile arrive here.
  useEffect(() => {
    const handed = takeHandedOffFiles();
    if (handed.length) addFiles(handed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Leaving without saving cleans up the uploads.
  const shotsRef = useRef(shots);
  shotsRef.current = shots;
  const cutRef = useRef(cut);
  cutRef.current = cut;
  useEffect(
    () => () => {
      if (saved.current) return;
      const paths = shotsRef.current.flatMap(s => (s.staged ? [s.staged.path] : []));
      if (cutRef.current.path) paths.push(cutRef.current.path);
      void removePhotos(paths).catch(() => undefined);
    },
    [],
  );

  function addFiles(files: File[]) {
    const room = MAX_PHOTOS - shotsRef.current.length;
    const next = files.slice(0, Math.max(0, room)).map<Shot>(file => ({
      key: newId(),
      file,
      local: URL.createObjectURL(file),
      state: 'uploading',
    }));
    if (!next.length) return;
    setShots(s => [...s, ...next]);
    for (const shot of next) {
      stagePhoto(uid, itemId, shot.file)
        .then(staged => setShots(s => s.map(x => (x.key === shot.key ? { ...x, staged, state: 'done' } : x))))
        .catch(err =>
          setShots(s =>
            s.map(x =>
              x.key === shot.key
                ? { ...x, state: 'error', error: /decode|bitmap|source/i.test(String(err)) ? 'This browser cannot read that format. Try a JPEG.' : errorMessage(err) }
                : x,
            ),
          ),
        );
    }
  }

  function removeShot(key: string) {
    const shot = shots.find(s => s.key === key);
    if (shot?.staged) void removePhotos([shot.staged.path]).catch(() => undefined);
    setShots(s => s.filter(x => x.key !== key));
    if (shots[0]?.key === key) resetCutout();
  }

  function makeCover(key: string) {
    setShots(s => [...s.filter(x => x.key === key), ...s.filter(x => x.key !== key)]);
    resetCutout();
  }

  function resetCutout() {
    if (cut.path) void removePhotos([cut.path]).catch(() => undefined);
    setCut({ state: 'idle', progress: 0 });
  }

  const ready = shots.filter(s => s.state === 'done');
  const uploading = shots.some(s => s.state === 'uploading');

  function startCutout() {
    const cover = shots[0];
    if (!cover?.staged || cut.state === 'working') return;
    setCut({ state: 'working', progress: 0 });
    stageCutout(uid, itemId, cover.staged.id, cover.file, p => setCut(c => ({ ...c, progress: p })))
      .then(r => setCut({ state: 'done', progress: 1, preview: r.preview, path: r.cutout_path }))
      .catch(() => setCut({ state: 'error', progress: 0 }));
  }

  async function runScan() {
    setError(null);
    setPhase('scanning');
    if (cutouts && cut.state === 'idle') startCutout();
    try {
      const result = await scanPhotos(
        ready.map(s => s.staged!.path),
        currency,
        hint,
      );
      setScan(result);
      setForm(f => formFromScan(result, f));
      setPhase('review');
    } catch (err) {
      setError(errorMessage(err));
      setPhase('pick');
    }
  }

  function fillByHand() {
    if (cutouts && cut.state === 'idle') startCutout();
    setPhase('review');
  }

  async function save(thenCrossList: boolean) {
    setError(null);
    const photos = shots
      .filter(s => s.staged)
      .map((s, i) => ({ ...s.staged!, cutout_path: i === 0 && cut.path ? cut.path : null }));
    try {
      const item = await create.mutateAsync({
        id: itemId,
        draft: { ...form, currency, ai: scan, status: 'draft', title: form.title.trim() || 'Untitled item' },
        photos,
      });
      saved.current = true;
      if (thenCrossList) {
        navigate(`/item/${item.id}?crosslist=1`);
        return;
      }
      toast(`Saved ${item.title}`, { action: { label: 'Open', run: () => navigate(`/item/${item.id}`) } });
      // Fresh start for the next piece.
      saved.current = false;
      setItemId(newId());
      setShots([]);
      setScan(null);
      setForm(emptyForm());
      setHint('');
      setCut({ state: 'idle', progress: 0 });
      setPhase('pick');
      window.scrollTo({ top: 0 });
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-10">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-5xl leading-[0.9] font-extrabold sm:text-6xl">
            {phase === 'review' ? 'Check it over' : 'Scan an item'}
          </h1>
          <p className="mt-2 max-w-xl text-ink-2">
            {phase === 'review'
              ? 'The AI filled this in from your photos. Fix anything it got wrong, then save.'
              : 'Lay it flat in daylight. Front, back, the label and any flaw is plenty.'}
          </p>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,26rem)_1fr]">
        {/* Photos */}
        <div className="flex flex-col gap-4">
          <PhotoBoard
            shots={shots}
            onRemove={removeShot}
            onCover={makeCover}
            scanning={phase === 'scanning'}
            cut={cutouts ? cut : null}
          />
          {shots.length < MAX_PHOTOS && phase !== 'scanning' && (
            <div className="grid grid-cols-2 gap-3">
              <Button variant="ink" icon={<Camera className="size-5" aria-hidden />} onClick={() => cameraInput.current?.click()}>
                Take photos
              </Button>
              <Button variant="line" icon={<ImagePlus className="size-5" aria-hidden />} onClick={() => fileInput.current?.click()}>
                Choose photos
              </Button>
              <input
                ref={cameraInput}
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                hidden
                onChange={e => {
                  addFiles(imageFiles(e.target.files));
                  e.target.value = '';
                }}
              />
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={e => {
                  addFiles(imageFiles(e.target.files));
                  e.target.value = '';
                }}
              />
            </div>
          )}
          <label className="flex items-start gap-3 rounded-lg p-2 text-sm text-ink-2">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-[var(--tag)]"
              checked={cutouts}
              onChange={e => {
                setCutouts(e.target.checked);
                try {
                  localStorage.setItem(CUT_PREF, e.target.checked ? 'on' : 'off');
                } catch {
                  // Not remembered; fine.
                }
              }}
            />
            <span>
              <span className="font-semibold text-ink">Cut out the background</span> for the pile. Runs in your browser; the first
              time downloads a 40 MB model.
            </span>
          </label>
          {phase === 'review' && cutouts && cut.state === 'idle' && ready.length > 0 && (
            <Button variant="line" icon={<Scissors className="size-4" aria-hidden />} onClick={startCutout}>
              Cut out the cover photo
            </Button>
          )}
        </div>

        {/* Right column */}
        <div className="min-w-0">
          <AnimatePresence mode="wait">
            {phase === 'pick' && (
              <motion.div key="pick" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <Paper className="flex flex-col gap-4 p-5">
                  <TextField
                    label="Anything the photos don’t show? (optional)"
                    value={hint}
                    onChange={e => setHint(e.target.value)}
                    placeholder="Label says M but fits like L. Bought new in 2021."
                  />
                  <ErrorNote error={error} />
                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      variant="tag"
                      className="text-base"
                      icon={<Wand2 className="size-5" aria-hidden />}
                      disabled={!ready.length || uploading}
                      busy={uploading && ready.length > 0}
                      onClick={runScan}
                    >
                      {uploading ? 'Uploading photos' : 'Scan with AI'}
                    </Button>
                    <Button variant="ghost" onClick={fillByHand}>
                      Fill it in myself
                    </Button>
                  </div>
                  {!shots.length && <p className="text-sm text-muted">Add at least one photo to scan.</p>}
                </Paper>
              </motion.div>
            )}
            {phase === 'scanning' && <ScanningNotes key="scanning" />}
            {phase === 'review' && (
              <motion.div key="review" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <Paper className="p-5 sm:p-6">
                  {scan && scan.confidence < 0.5 && (
                    <p className="mb-5 rounded-lg bg-sticker/60 px-3 py-2 text-sm text-[#16172b]">
                      The AI was unsure about this one{scan.notes ? `: ${scan.notes}` : '.'} A photo of the label usually helps.
                    </p>
                  )}
                  <ItemForm value={form} onChange={setForm} currency={currency} unit={unit} scan={scan} />
                </Paper>
                <div className="sticky bottom-20 z-10 mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-paper/95 p-3 backdrop-blur md:bottom-4">
                  <ErrorNote error={error} className="w-full" />
                  <Button variant="tag" className="text-base" busy={create.isPending} onClick={() => save(true)}>
                    Save and cross-list
                  </Button>
                  <Button variant="ink" disabled={create.isPending} onClick={() => save(false)}>
                    Save, scan the next one
                  </Button>
                  {cut.state === 'working' && <span className="text-sm text-muted">Still cutting out the photo</span>}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function PhotoBoard({
  shots,
  onRemove,
  onCover,
  scanning,
  cut,
}: {
  shots: Shot[];
  onRemove: (key: string) => void;
  onCover: (key: string) => void;
  scanning: boolean;
  cut: { state: string; progress: number; preview?: string } | null;
}) {
  const reduce = useReducedMotion();
  const cover = shots[0];
  if (!cover) {
    return (
      <div className="floor flex aspect-[4/5] flex-col items-center justify-center gap-3 rounded-2xl p-6 text-center">
        <Camera className="size-10" aria-hidden />
        <p className="font-display text-2xl font-bold">No photos yet</p>
        <p className="text-sm text-floor-ink/80">Drop them here or use the buttons below.</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="floor relative aspect-[4/5] overflow-hidden rounded-2xl">
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
      <ul className="grid grid-cols-4 gap-2">
        {shots.map((s, i) => (
          <li key={s.key} className="group relative aspect-square overflow-hidden rounded-lg bg-paper-2">
            <img src={s.local} alt={`Photo ${i + 1}`} className={cx('size-full object-cover', s.state === 'uploading' && 'opacity-50')} />
            {s.state === 'uploading' && <span className="skeleton absolute inset-x-0 bottom-0 h-1" />}
            {s.state === 'error' && (
              <span className="absolute inset-0 flex items-center bg-danger/85 p-1 text-[0.65rem] leading-tight text-white" title={s.error}>
                {s.error}
              </span>
            )}
            {i === 0 && (
              <span className="absolute top-1 left-1 rounded bg-ink px-1 text-[0.6rem] font-bold text-paper">Cover</span>
            )}
            {!scanning && (
              <div className="absolute inset-x-0 bottom-0 flex justify-end gap-1 bg-gradient-to-t from-black/60 p-1 opacity-100 sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
                {i > 0 && (
                  <button type="button" aria-label="Make cover photo" className="rounded bg-white/90 p-1 text-ink" onClick={() => onCover(s.key)}>
                    <Star className="size-3.5" aria-hidden />
                  </button>
                )}
                <button type="button" aria-label="Remove photo" className="rounded bg-white/90 p-1 text-danger" onClick={() => onRemove(s.key)}>
                  <Trash2 className="size-3.5" aria-hidden />
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

const NOTES = ['Reading the label', 'Working out the fabric', 'Looking for flaws', 'Naming the style', 'Writing the description', 'Guessing a fair price'];

function ScanningNotes() {
  const [n, setN] = useState(1);
  useEffect(() => {
    const t = window.setInterval(() => setN(x => Math.min(NOTES.length, x + 1)), 1300);
    return () => window.clearInterval(t);
  }, []);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="py-4" role="status" aria-live="polite">
      <ul className="flex flex-col gap-2">
        {NOTES.slice(0, n).map((note, i) => (
          <motion.li
            key={note}
            initial={{ opacity: 0, x: -14, rotate: -2 }}
            animate={{ opacity: i === n - 1 ? 1 : 0.45, x: 0, rotate: (i % 2 ? 1 : -1) * 0.8 }}
            className="hand text-[clamp(1.8rem,4vw,2.6rem)] leading-tight text-floor"
          >
            {note}
            {i === n - 1 ? '…' : ''}
          </motion.li>
        ))}
      </ul>
    </motion.div>
  );
}
