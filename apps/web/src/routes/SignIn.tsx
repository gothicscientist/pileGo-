import { MARKETPLACE_IDS } from '@pilego/core';
import { Mail } from 'lucide-react';
import { motion } from 'motion/react';
import { useRef, useState, type FormEvent } from 'react';
import { Sticker } from '~/components/bits';
import { Garment, type GarmentKind } from '~/components/Garments';
import { Button, ErrorNote, TextField } from '~/components/ui';
import { Wordmark } from '~/app/Shell';
import { errorMessage, supabase } from '~/lib/supabase';

// Placed around the copy, never behind it. On phones only two stay, at the edges.
const SCATTER: Array<{ kind: GarmentKind; fill: string; x: string; y: string; w: string; r: number; phone?: boolean }> = [
  { kind: 'jacket', fill: '#FFE14D', x: '56%', y: '5%', w: 'clamp(110px,13vw,190px)', r: -14 },
  { kind: 'tee', fill: '#FF4F9A', x: '82%', y: '2%', w: 'clamp(84px,12vw,170px)', r: 9, phone: true },
  { kind: 'jeans', fill: '#9BE3C3', x: '88%', y: '70%', w: 'clamp(70px,8vw,120px)', r: 18 },
  { kind: 'dress', fill: '#FF8A3D', x: '60%', y: '76%', w: 'clamp(80px,9vw,130px)', r: -6 },
  { kind: 'sneaker', fill: '#16172B', x: '72%', y: '90%', w: 'clamp(110px,13vw,180px)', r: -8, phone: true },
  { kind: 'tote', fill: '#F6F6F1', x: '43%', y: '84%', w: 'clamp(64px,7vw,100px)', r: 12 },
];

export function SignIn() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const floor = useRef<HTMLDivElement>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    setBusy(false);
    if (error) setError(errorMessage(error));
    else setSent(email.trim());
  }

  return (
    <div ref={floor} className="floor relative min-h-dvh overflow-hidden">
      {SCATTER.map((g, i) => (
        <motion.div
          key={g.kind}
          drag
          dragConstraints={floor}
          dragElastic={0.2}
          whileDrag={{ scale: 1.08, rotate: g.r + 6, zIndex: 5 }}
          initial={{ opacity: 0, y: -40, rotate: g.r - 20 }}
          animate={{ opacity: 1, y: 0, rotate: g.r }}
          transition={{ delay: 0.08 * i, type: 'spring', stiffness: 160, damping: 14 }}
          className={`absolute cursor-grab active:cursor-grabbing cutout-shadow ${g.phone ? '' : 'max-lg:hidden'}`}
          style={{ left: g.x, top: g.y, width: g.w }}
        >
          <Garment kind={g.kind} fill={g.fill} className="h-auto w-full" />
        </motion.div>
      ))}

      <div className="pointer-events-none relative z-10 mx-auto flex min-h-dvh max-w-6xl flex-col justify-between gap-10 px-5 py-6 sm:px-8 lg:flex-row lg:items-center">
        <div className="pointer-events-auto max-w-xl">
          <Wordmark className="text-floor-ink" />
          <h1 className="font-display mt-10 text-[clamp(2.8rem,8vw,6.2rem)] leading-[0.88] font-extrabold">
            Turn the pile on your chair into listings everywhere.
          </h1>
          <p className="mt-5 max-w-md text-lg text-floor-ink/85">
            Photograph a piece once. pileGo writes the listing, prices it, and puts it up on the marketplaces you sell on. When it sells, it comes down everywhere else.
          </p>
          <div className="mt-6 flex max-w-md flex-wrap gap-2">
            {MARKETPLACE_IDS.map(id => (
              <Sticker key={id} id={id} size="sm" />
            ))}
          </div>
        </div>

        <motion.div
          initial={{ y: 30, opacity: 0, rotate: 2 }}
          animate={{ y: 0, opacity: 1, rotate: 1.2 }}
          transition={{ delay: 0.35, type: 'spring', stiffness: 200, damping: 20 }}
          className="pointer-events-auto w-full max-w-sm self-center"
        >
          <div className="receipt-edge grain rounded-t-xl bg-paper px-6 pt-6 pb-10 text-ink lift-lg">
            {sent ? (
              <div className="flex flex-col gap-3" role="status">
                <Mail className="size-8 text-floor" aria-hidden />
                <h2 className="font-display text-2xl font-bold">Check your email</h2>
                <p className="text-ink-2">
                  We sent a sign-in link to <strong className="text-ink">{sent}</strong>. Open it on this device and you are in.
                </p>
                <Button variant="ghost" className="self-start" onClick={() => setSent(null)}>
                  Use a different email
                </Button>
              </div>
            ) : (
              <form onSubmit={submit} className="flex flex-col gap-4">
                <h2 className="font-display text-2xl font-bold">Sign in or sign up</h2>
                <p className="-mt-2 text-sm text-ink-2">No password. We email you a link.</p>
                <TextField
                  label="Email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
                <ErrorNote error={error} />
                <Button type="submit" variant="tag" busy={busy} className="w-full">
                  Email me a sign-in link
                </Button>
                <p className="text-xs text-muted">
                  Free and open source. Read the <a className="underline" href="/privacy">privacy notes</a>, or{' '}
                  <a className="underline" href="/extension">get the browser extension</a>.
                </p>
              </form>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
