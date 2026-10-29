// Scan: photos in, a drafted listing out. The seller is asked for three key
// shots (front, back, clothing label) plus any extras; each photo carries its
// role to the AI. Photos upload as soon as they are picked so the AI can read
// them; the garment is cut out for the pile while the AI works.

import type { PhotoRole, ScanResult } from '@pilego/core';
import { Camera, Check, ImagePlus, Scissors, Smartphone, Wand2 } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState, type DragEvent } from 'react';
import { useNavigate } from 'react-router';
import { emptyForm, formFromScan, ItemForm, type FormValue } from '~/components/ItemForm';
import { useToast } from '~/components/overlay';
import { PhoneSheet } from '~/components/PhoneSheet';
import { CoverPreview, ShotGuide, type Shot } from '~/components/ShotGuide';
import { Button, ErrorNote, Paper, TextField } from '~/components/ui';
import { useUserId } from '~/lib/auth';
import { cx } from '~/lib/format';
import { imageFiles, takeHandedOffFiles } from '~/lib/handoff';
import { onComputer, usePhoneCapture } from '~/lib/phone';
import { newId, removePhotos } from '~/lib/photos';
import { scanPhotos, stageCutout, stagePhoto, useCreateItem, useProfile, type StagedPhoto } from '~/lib/queries';
import { assignRoles, listWords, missingShots, orderShots, withRole } from '~/lib/shots';
import { errorMessage } from '~/lib/supabase';

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
  const [cut, setCut] = useState<{
    state: 'idle' | 'working' | 'done' | 'error';
    progress: number;
    preview?: string;
    path?: string;
    coverKey?: string;
  }>({
    state: 'idle',
    progress: 0,
  });
  const saved = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const slotInput = useRef<HTMLInputElement>(null);
  const pendingRole = useRef<PhotoRole | undefined>(undefined);
  const [computer] = useState(onComputer);
  const [phoneOpen, setPhoneOpen] = useState(false);
  // Photos taken on the phone arrive already uploaded into this item's folder.
  const phone = usePhoneCapture(itemId, p => addFiles([p.file], p.role === 'auto' ? undefined : p.role, p.staged));

  function openPhone() {
    setPhoneOpen(true);
    if (phone.state === 'idle' || phone.state === 'error') void phone.open();
  }

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

  /** `staged` is for a single photo that is already uploaded (from the phone). */
  function addFiles(files: File[], firstRole?: PhotoRole, staged?: StagedPhoto) {
    const current = shotsRef.current;
    // A photo picked for a filled slot replaces the role, not the photo: the old one becomes an extra.
    const base = firstRole && firstRole !== 'extra' ? current.map(s => (s.role === firstRole ? { ...s, role: 'extra' as const } : s)) : current;
    const room = MAX_PHOTOS - current.length;
    const picked = files.slice(0, Math.max(0, room));
    const roles = assignRoles(base.map(s => s.role), picked.length, firstRole);
    const next = picked.map<Shot>((file, i) => ({
      key: newId(),
      file,
      local: staged?.preview ?? URL.createObjectURL(file),
      role: roles[i]!,
      ...(staged ? { staged, state: 'done' as const } : { state: 'uploading' as const }),
    }));
    if (!next.length) {
      if (staged) void removePhotos([staged.path]).catch(() => undefined);
      return;
    }
    shotsRef.current = [...base, ...next];
    setShots(shotsRef.current);
    if (staged) return;
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

  function pickFor(role: PhotoRole) {
    pendingRole.current = role;
    slotInput.current?.click();
  }

  function removeShot(key: string) {
    const shot = shots.find(s => s.key === key);
    if (shot?.staged) void removePhotos([shot.staged.path]).catch(() => undefined);
    setShots(s => s.filter(x => x.key !== key));
  }

  function setRole(key: string, role: PhotoRole) {
    setShots(s => withRole(s, key, role));
  }

  function resetCutout() {
    if (cut.path) void removePhotos([cut.path]).catch(() => undefined);
    setCut({ state: 'idle', progress: 0 });
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    if (phase === 'scanning') return;
    addFiles(imageFiles(e.dataTransfer.files));
  }

  const ordered = orderShots(shots);
  const cover = ordered[0];
  const missing = missingShots(shots);

  // The cutout belongs to the cover; a new front photo or a removed one starts it over.
  useEffect(() => {
    if (cut.state !== 'idle' && cut.coverKey !== cover?.key) resetCutout();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cover?.key]);

  const ready = ordered.filter(s => s.state === 'done');
  const uploading = shots.some(s => s.state === 'uploading');

  function startCutout() {
    if (!cover?.staged || cut.state === 'working') return;
    const coverKey = cover.key;
    setCut({ state: 'working', progress: 0, coverKey });
    stageCutout(uid, itemId, cover.staged.id, cover.file, p => setCut(c => (c.coverKey === coverKey ? { ...c, progress: p } : c)))
      .then(r =>
        setCut(c => {
          if (c.coverKey === coverKey) return { state: 'done', progress: 1, preview: r.preview, path: r.cutout_path, coverKey };
          // The cover changed while this ran; drop the stale cutout.
          void removePhotos([r.cutout_path]).catch(() => undefined);
          return c;
        }),
      )
      .catch(() => setCut(c => (c.coverKey === coverKey ? { state: 'error', progress: 0, coverKey } : c)));
  }

  async function runScan() {
    setError(null);
    setPhase('scanning');
    if (cutouts && cut.state === 'idle') startCutout();
    try {
      const result = await scanPhotos(
        ready.map(s => s.staged!.path),
        currency,
        { hint, roles: ready.map(s => s.role), unit },
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
    const photos = ordered
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
      <header className="mb-7 flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5">
        <div>
          <h1 className="font-display text-[clamp(2.6rem,6vw,4.6rem)] leading-[0.92]">
            {phase === 'review' ? 'Check it over' : 'Scan an item'}
          </h1>
          <p className="mt-3 max-w-xl text-ink-2">
            {phase === 'review'
              ? 'The AI filled this in from your photos. Fix anything it got wrong, then save.'
              : 'Lay it flat in daylight and take three photos: the front, the back and the clothing label. Add close-ups of any flaws.'}
          </p>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,26rem)_1fr]">
        {/* Photos */}
        <div className="flex flex-col gap-4">
          {cover && <CoverPreview cover={cover} scanning={phase === 'scanning'} cut={cutouts ? cut : null} />}
          <ShotGuide
            shots={ordered}
            locked={phase === 'scanning'}
            full={shots.length >= MAX_PHOTOS}
            onPick={pickFor}
            onRemove={removeShot}
            onRole={setRole}
            onDrop={onDrop}
          />
          <input
            ref={slotInput}
            type="file"
            accept="image/*"
            multiple
            hidden
            data-testid="slot-input"
            onChange={e => {
              addFiles(imageFiles(e.target.files), pendingRole.current);
              pendingRole.current = undefined;
              e.target.value = '';
            }}
          />
          {shots.length < MAX_PHOTOS && phase !== 'scanning' && (
            <div className="grid grid-cols-2 gap-3">
              {computer ? (
                <Button variant="ink" icon={<Smartphone className="size-5" aria-hidden />} onClick={openPhone}>
                  Use my phone
                </Button>
              ) : (
                <Button variant="ink" icon={<Camera className="size-5" aria-hidden />} onClick={() => cameraInput.current?.click()}>
                  Take photos
                </Button>
              )}
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
              <p className="col-span-2 -mt-1 text-xs text-muted">
                {computer && 'Scan a code with your phone and the photos you take there show up here. '}
                Several at once fill the slots in order: front, back, label, then extras. Change what a photo shows from its menu.
              </p>
            </div>
          )}
          <PhoneSheet
            open={phoneOpen}
            onClose={() => setPhoneOpen(false)}
            session={phone.session}
            state={phone.state}
            error={phone.error}
            received={phone.received}
            onRenew={() => void phone.open()}
          />
          <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-card p-3.5 text-sm text-ink-2 shadow-[inset_0_0_0_1px_var(--line)] transition hover:shadow-[inset_0_0_0_1px_var(--ink-2)]">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-[var(--accent)]"
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
                  {ready.length > 0 && missing.length > 0 && (
                    <p className="kraft rounded-xl px-3.5 py-2.5 text-sm" role="note" data-testid="missing-shots">
                      <strong>No {listWords(missing.map(k => k.label.toLowerCase()))} photo yet.</strong>{' '}
                      {missing.some(k => k.role === 'label')
                        ? 'The label tells the AI the brand, size and fabric, and the size lets it estimate measurements.'
                        : `It helps the AI with ${listWords(missing.map(k => k.why))}.`}{' '}
                      You can scan anyway.
                    </p>
                  )}
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
                  {!shots.length && <p className="text-sm text-muted">Add at least one photo to scan. Front, back and label work best.</p>}
                </Paper>
              </motion.div>
            )}
            {phase === 'scanning' && <ScanningNotes key="scanning" />}
            {phase === 'review' && (
              <motion.div key="review" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <Paper className="p-5 sm:p-6">
                  {scan && scan.confidence < 0.5 && (
                    <p className="kraft mb-5 rounded-xl px-3.5 py-2.5 text-sm">
                      The AI was unsure about this one{scan.notes ? `: ${scan.notes}` : '.'} A photo of the label usually helps.
                    </p>
                  )}
                  <ItemForm value={form} onChange={setForm} currency={currency} unit={unit} scan={scan} />
                </Paper>
                <div className="sticky bottom-24 z-10 mt-4 flex flex-wrap items-center gap-3 rounded-[20px] bg-paper/90 p-3 backdrop-blur-md md:bottom-4">
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

const NOTES = [
  'Reading the label',
  'Working out the fabric',
  'Looking for flaws',
  'Estimating measurements',
  'Naming the style',
  'Writing the description',
  'Checking what it sells for',
];

function ScanningNotes() {
  const [n, setN] = useState(1);
  useEffect(() => {
    const t = window.setInterval(() => setN(x => Math.min(NOTES.length, x + 1)), 1300);
    return () => window.clearInterval(t);
  }, []);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="py-2" role="status" aria-live="polite">
      <p className="label-caps mb-4 text-muted">Reading your photos</p>
      <ul className="flex flex-col gap-1.5">
        {NOTES.slice(0, n).map((note, i) => {
          const now = i === n - 1;
          return (
            <motion.li
              key={note}
              initial={{ opacity: 0, x: -14, rotate: -2 }}
              animate={{ opacity: now ? 1 : 0.42, x: 0, rotate: (i % 2 ? 1 : -1) * 0.6 }}
              transition={{ type: 'spring', stiffness: 220, damping: 20 }}
              className={cx('font-display flex items-center gap-3 text-[clamp(1.7rem,3.8vw,2.5rem)] leading-tight', now ? 'text-accent' : 'text-ink')}
            >
              <span
                className={cx(
                  'flex size-6 shrink-0 items-center justify-center rounded-full transition',
                  now ? 'bg-accent/15' : 'bg-olive/25 text-[var(--olive-deep)] dark:text-olive',
                )}
                aria-hidden
              >
                {now ? <span className="size-2 animate-ping rounded-full bg-accent" /> : <Check className="size-3.5" strokeWidth={3} />}
              </span>
              {note}
              {now ? '…' : ''}
            </motion.li>
          );
        })}
      </ul>
    </motion.div>
  );
}

