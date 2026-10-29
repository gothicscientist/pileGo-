// The phone end of "Use my phone". Opened from the QR code on the computer's
// scan page, with no sign-in: the code in the address is the whole key. Each
// photo is shrunk here, sent, and shows up in the scan on the computer.

import type { PhotoRole } from '@pilego/core';
import { Camera, Check, ImagePlus, Laptop, TriangleAlert } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useParams } from 'react-router';
import { Wordmark } from '~/app/Shell';
import { ShotIllustration } from '~/components/ShotGuide';
import { Button, Spinner } from '~/components/ui';
import { cx } from '~/lib/format';
import { imageFiles } from '~/lib/handoff';
import { captureStatus, sendCapture } from '~/lib/phone';
import { newId, prepareImage } from '~/lib/photos';
import { assignRoles, KEY_SHOTS } from '~/lib/shots';
import { errorMessage } from '~/lib/supabase';

interface Sent {
  key: string;
  role: PhotoRole;
  local: string;
  state: 'sending' | 'done' | 'error';
  error?: string;
}

const POLL_MS = 5000;

export function PhoneCapture() {
  const { session = '' } = useParams();
  const [item, setItem] = useState<string | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [sent, setSent] = useState<Sent[]>([]);
  const [moved, setMoved] = useState(false);
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);
  const pendingRole = useRef<PhotoRole | undefined>(undefined);
  const itemRef = useRef(item);
  itemRef.current = item;
  const sentRef = useRef(sent);
  sentRef.current = sent;

  // Check the code, then keep checking: the computer may save the item and move on to the next one.
  useEffect(() => {
    let stopped = false;
    const check = async () => {
      try {
        const s = await captureStatus(session);
        if (stopped) return;
        if (itemRef.current && itemRef.current !== s.item_id) {
          setSent([]);
          setMoved(true);
        }
        setItem(s.item_id);
      } catch (err) {
        // A dropped connection is retried; a dead code is not.
        if (!stopped && [400, 404, 410].includes((err as { status?: number }).status ?? 0)) setFatal(errorMessage(err));
      }
    };
    void check();
    const t = window.setInterval(() => {
      if (document.visibilityState === 'visible') void check();
    }, POLL_MS);
    return () => {
      stopped = true;
      window.clearInterval(t);
    };
  }, [session]);

  function pick(role?: PhotoRole) {
    pendingRole.current = role;
    camera.current?.click();
  }

  function add(files: File[], first?: PhotoRole) {
    if (!files.length) return;
    setMoved(false);
    const current = sentRef.current.filter(s => s.state !== 'error');
    // A retake takes over the slot; the earlier photo stays as an extra, the same as on the computer.
    const taken = current.map(s => (first && first !== 'extra' && s.role === first ? 'extra' : s.role));
    const roles = assignRoles(taken, files.length, first);
    const next = files.map<Sent>((file, i) => ({ key: newId(), role: roles[i]!, local: URL.createObjectURL(file), state: 'sending' }));
    const base = sentRef.current.map(s => (first && first !== 'extra' && s.role === first ? { ...s, role: 'extra' as const } : s));
    sentRef.current = [...base, ...next];
    setSent(sentRef.current);
    next.forEach((shot, i) => {
      prepareImage(files[i]!)
        .then(photo => sendCapture(session, shot.role, photo))
        .then(() => setSent(s => s.map(x => (x.key === shot.key ? { ...x, state: 'done' } : x))))
        .catch(err => {
          const message = /decode|bitmap|source/i.test(String(err)) ? 'This phone cannot read that format.' : errorMessage(err);
          setSent(s => s.map(x => (x.key === shot.key ? { ...x, state: 'error', error: message } : x)));
          if ((err as { status?: number }).status === 404 || (err as { status?: number }).status === 410) setFatal(message);
        });
    });
  }

  if (fatal) {
    return (
      <Frame>
        <div className="mt-16 flex flex-col items-start gap-3" role="alert">
          <TriangleAlert className="size-10 text-danger" aria-hidden />
          <h1 className="font-display text-4xl leading-[0.95]">This code no longer works</h1>
          <p className="text-ink-2">{fatal}</p>
        </div>
      </Frame>
    );
  }

  if (!item) {
    return (
      <Frame>
        <div className="mt-24 flex justify-center">
          <Spinner className="size-8" />
        </div>
      </Frame>
    );
  }

  const live = sent.filter(s => s.state !== 'error');
  const next = KEY_SHOTS.find(k => !live.some(s => s.role === k.role));
  const extras = sent.filter(s => s.role === 'extra');
  const delivered = sent.filter(s => s.state === 'done').length;

  return (
    <Frame>
      <header className="mt-6">
        <p className="inline-flex items-center gap-1.5 rounded-full bg-ink px-2.5 py-1 text-xs font-semibold text-paper">
          <Laptop className="size-3.5" aria-hidden /> Linked to the scan on your computer
        </p>
        <h1 className="mt-3 font-display text-6xl leading-[0.9]">Snap it</h1>
        <p className="mt-2 text-ink-2">Lay it flat in daylight. Each photo goes straight to your computer.</p>
      </header>

      <AnimatePresence>
        {moved && (
          <motion.p
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-4 rounded-xl bg-olive/30 px-3 py-2 text-sm font-semibold text-[var(--olive-deep)] dark:text-olive"
            role="status"
          >
            Saved on your computer. Ready for the next piece.
          </motion.p>
        )}
      </AnimatePresence>

      <ol className="mt-5 grid grid-cols-3 gap-2">
        {KEY_SHOTS.map((k, i) => {
          const shot = [...live].reverse().find(s => s.role === k.role);
          return (
            <li key={k.role} className="min-w-0" style={{ rotate: `${[-1.2, 0.8, -0.6][i]}deg` }}>
              <button
                type="button"
                onClick={() => pick(k.role)}
                aria-label={shot ? `Retake the ${k.label.toLowerCase()} photo` : `Take the ${k.label.toLowerCase()} photo. ${k.tip}.`}
                className={cx(
                  'relative flex aspect-[4/5] w-full flex-col items-center justify-center gap-1 overflow-hidden rounded-[18px] p-2 text-center transition duration-300 ease-[var(--ease-spring)] active:scale-95',
                  shot ? 'bg-paper-2 lift' : 'border-2 border-dashed bg-card/60',
                  !shot && next?.role === k.role ? 'border-accent' : 'border-line',
                )}
              >
                {shot ? (
                  <>
                    <img src={shot.local} alt="" className={cx('absolute inset-0 size-full object-cover', shot.state === 'sending' && 'opacity-50')} />
                    <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-0.5 rounded-full bg-paper/90 px-1.5 py-px text-[0.65rem] font-semibold text-ink backdrop-blur">
                      {shot.state === 'done' && <Check className="size-3 text-[var(--olive-deep)]" strokeWidth={3} aria-hidden />}
                      {i + 1}. {k.label}
                    </span>
                    {shot.state === 'sending' && <span className="skeleton absolute inset-x-0 bottom-0 h-1" />}
                  </>
                ) : (
                  <>
                    <ShotIllustration role={k.role} />
                    <span className="font-display text-sm leading-tight">
                      {i + 1}. {k.label}
                    </span>
                  </>
                )}
              </button>
            </li>
          );
        })}
      </ol>
      {next && <p className="mt-2 text-sm text-muted">{next.label}: {next.tip.toLowerCase()}.</p>}

      {extras.length > 0 && (
        <ul className="mt-4 grid grid-cols-4 gap-2" aria-label="Extras">
          {extras.map(s => (
            <li key={s.key} className="relative aspect-square overflow-hidden rounded-xl bg-paper-2">
              <img src={s.local} alt="Extra photo" className={cx('size-full object-cover', s.state === 'sending' && 'opacity-50')} />
              {s.state === 'done' && <Check className="absolute top-1.5 left-1.5 size-4 rounded-full bg-paper/90 p-0.5 text-[var(--olive-deep)]" strokeWidth={3} aria-hidden />}
            </li>
          ))}
        </ul>
      )}

      {sent.some(s => s.state === 'error') && (
        <p role="alert" className="mt-4 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
          {sent.filter(s => s.state === 'error').length === 1 ? 'One photo' : 'Some photos'} did not send:{' '}
          {sent.find(s => s.state === 'error')?.error} Take it again.
        </p>
      )}

      <p className="mt-4 text-sm text-ink-2" data-testid="phone-sent" aria-live="polite">
        {delivered === 0
          ? 'Nothing sent yet.'
          : `${delivered} sent. Check ${delivered === 1 ? 'it' : 'them'} on your computer, then press Scan with AI there.`}
      </p>

      <div className="sticky bottom-0 -mx-5 mt-6 grid gap-2 bg-paper/90 px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-md">
        <Button variant="tag" className="py-4 text-base" icon={<Camera className="size-5" aria-hidden />} onClick={() => pick(next?.role ?? 'extra')}>
          {next ? `Take the ${next.label.toLowerCase()} photo` : 'Take an extra photo'}
        </Button>
        <Button variant="line" icon={<ImagePlus className="size-5" aria-hidden />} onClick={() => library.current?.click()}>
          Choose from my photos
        </Button>
      </div>

      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        data-testid="phone-camera"
        onChange={e => {
          add(imageFiles(e.target.files), pendingRole.current);
          pendingRole.current = undefined;
          e.target.value = '';
        }}
      />
      <input
        ref={library}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={e => {
          add(imageFiles(e.target.files));
          e.target.value = '';
        }}
      />
    </Frame>
  );
}

function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto min-h-dvh max-w-md px-5 pt-5">
      <Wordmark />
      {children}
    </div>
  );
}
