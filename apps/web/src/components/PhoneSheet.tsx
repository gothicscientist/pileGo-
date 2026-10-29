// "Use my phone": a QR code taped to the screen. Scanning it opens the capture
// page on the phone, and every photo taken there drops into this scan.

import { Check, Copy, RefreshCw, Smartphone, TriangleAlert } from 'lucide-react';
import { motion } from 'motion/react';
import { useMemo, useState, type ReactNode } from 'react';
import { encode } from 'uqr';
import { cx } from '~/lib/format';
import { unreachableFromPhone, type PhoneSession } from '~/lib/phone';
import { Sheet } from './overlay';
import { Button, ErrorNote, Spinner } from './ui';

export function PhoneSheet({
  open,
  onClose,
  session,
  state,
  error,
  received,
  onRenew,
}: {
  open: boolean;
  onClose: () => void;
  session: PhoneSession | null;
  state: 'idle' | 'opening' | 'open' | 'expired' | 'error';
  error: string | null;
  received: number;
  onRenew: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const local = session ? unreachableFromPhone(session.url) : false;

  async function copy() {
    if (!session) return;
    try {
      await navigator.clipboard.writeText(session.url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard blocked; the link is on screen to copy by hand.
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Take the photos on your phone"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted" data-testid="phone-received" aria-live="polite">
            {received === 0 ? 'Nothing from your phone yet.' : `${received} ${received === 1 ? 'photo' : 'photos'} from your phone.`}
          </p>
          <Button variant="ink" onClick={onClose}>
            {received ? 'Done' : 'Close'}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
        <div className="relative shrink-0 pt-2">
          <span className="tape absolute -top-0.5 left-1/2 z-10 h-5 w-20 -translate-x-1/2 -rotate-3" aria-hidden />
          <motion.div
            initial={{ rotate: -4, y: 10, opacity: 0 }}
            animate={{ rotate: -1.5, y: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 18 }}
            className={cx('rounded-xl bg-white p-3 lift', state === 'expired' && 'opacity-30')}
          >
            {session && state !== 'opening' ? (
              <QrCode text={session.url} className="size-48" />
            ) : (
              <div className="flex size-48 items-center justify-center">{state === 'error' ? <TriangleAlert className="size-8 text-danger" /> : <Spinner />}</div>
            )}
          </motion.div>
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          <ol className="flex flex-col gap-2 text-ink-2">
            <Step n={1}>Point your phone’s camera at the code and tap the link.</Step>
            <Step n={2}>Take the front, the back and the label. No sign-in on the phone.</Step>
            <Step n={3}>They land here by themselves, in the right slots.</Step>
          </ol>

          {session && (
            <p className="inline-flex w-fit items-center gap-1.5 rounded-full bg-paper-2 px-2.5 py-1 text-xs font-semibold" data-testid="phone-status">
              {session.opened ? (
                <>
                  <Check className="size-3.5 text-accent" aria-hidden /> Phone connected
                </>
              ) : (
                <>
                  <Smartphone className="size-3.5 animate-pulse text-muted" aria-hidden /> Waiting for your phone
                </>
              )}
            </p>
          )}

          {local && (
            <p className="kraft rounded-xl px-3 py-2 text-sm" role="note" data-testid="phone-local">
              This tab is on <strong>{new URL(session!.url).host}</strong>, which only this computer can open. Open pileGo! from its web
              address and make the code there.
            </p>
          )}
          {state === 'expired' && (
            <div className="flex flex-col items-start gap-2">
              <p className="text-sm text-ink-2">This code expired after an hour.</p>
              <Button size="sm" variant="line" icon={<RefreshCw className="size-4" aria-hidden />} onClick={onRenew}>
                Make a new code
              </Button>
            </div>
          )}
          <ErrorNote error={error} />
          {state === 'error' && (
            <Button size="sm" variant="line" icon={<RefreshCw className="size-4" aria-hidden />} onClick={onRenew}>
              Try again
            </Button>
          )}

          {session && (
            <button
              type="button"
              onClick={copy}
              className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-ink-2 underline decoration-line underline-offset-4 hover:text-ink"
            >
              {copied ? <Check className="size-4 text-accent" aria-hidden /> : <Copy className="size-4" aria-hidden />}
              {copied ? 'Link copied' : 'Copy the link instead'}
            </button>
          )}
        </div>
      </div>
    </Sheet>
  );
}

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span className="hand -mt-1 w-4 shrink-0 text-2xl leading-none text-accent">{n}</span>
      <span>{children}</span>
    </li>
  );
}

/** A QR code as one SVG path, ink on white. */
export function QrCode({ text, className }: { text: string; className?: string }) {
  const { d, size } = useMemo(() => {
    const qr = encode(text, { ecc: 'M', border: 2 });
    let d = '';
    qr.data.forEach((row, y) =>
      row.forEach((dark, x) => {
        if (dark) d += `M${x} ${y}h1v1h-1z`;
      }),
    );
    return { d, size: qr.size };
  }, [text]);
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className={className} role="img" aria-label="QR code for the phone camera" shapeRendering="crispEdges">
      <rect width={size} height={size} fill="#fff" />
      <path d={d} fill="#2d3033" />
    </svg>
  );
}

