import { MARKETPLACE_IDS } from '@pilego/core';
import { ArrowRight, Mail } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useRef, useState, type FormEvent } from 'react';
import { MarketIcon, Sticker } from '~/components/bits';
import { CutoutPiece, LooseTag, Polaroid, type Placement } from '~/components/Scrapbook';
import { Button, ErrorNote, TextField } from '~/components/ui';
import { ThemeToggle, Wordmark } from '~/app/Shell';
import { PHOTOS, type CutoutId } from '~/lib/art';
import { cx } from '~/lib/format';
import { errorMessage, supabase } from '~/lib/supabase';

// The board: a weekend haul thrown onto a green cutting mat. A hoodie, a
// graphic tee, a flannel, selvedge, cargo shorts and a pair of Mexico 66s pile up and spill over the edges,
// with a polaroid, a price tag and a sold sticker on top. Positions are a share
// of the board, so the same layout scales from a phone to a wide screen.
const PIECES: Array<{ id: CutoutId; at: Placement }> = [
  { id: 'selvedgeJacket', at: { x: '1%', y: '9%', w: '50%', r: -9, z: 2, phone: true } },
  { id: 'cargoShorts', at: { x: '49%', y: '50%', w: '24%', r: 9, z: 2 } },
  { id: 'flannel', at: { x: '72%', y: '41%', w: '26%', r: 12, z: 3 } },
  { id: 'rawSelvedge', at: { x: '29%', y: '37%', w: '21%', r: -17, z: 3, phone: true } },
  { id: 'lilacHoodie', at: { x: '41%', y: '3%', w: '44%', r: 7, z: 4, phone: true } },
  { id: 'skullTee', at: { x: '3%', y: '50%', w: '35%', r: -10, z: 5, phone: true } },
  { id: 'cap', at: { x: '-1%', y: '2%', w: '19%', r: -20, z: 6 } },
  { id: 'mexico66Yellow', at: { x: '37%', y: '73%', w: '40%', r: -7, z: 8, phone: true } },
];

const PRINTS: Array<{ photo: keyof typeof PHOTOS; caption: string; at: Placement }> = [
  { photo: 'knit', caption: 'Saturday haul', at: { x: '79%', y: '4%', w: '21%', r: 8, z: 6 } },
];

// A sticker with a scalloped edge, like the ones on a shop window.
const BURST = Array.from({ length: 36 }, (_, i) => {
  const a = (i / 36) * Math.PI * 2;
  const r = i % 2 ? 43 : 50;
  return `${(50 + r * Math.cos(a)).toFixed(2)},${(50 + r * Math.sin(a)).toFixed(2)}`;
}).join(' ');

function SoldBurst({ className }: { className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { scale: 0, rotate: -40 }}
      animate={{ scale: 1, rotate: -12 }}
      transition={{ type: 'spring', stiffness: 260, damping: 14, delay: 0.9 }}
      className={cx('pointer-events-none absolute size-28 select-none', className)}
      aria-hidden
    >
      <motion.svg
        viewBox="0 0 100 100"
        className="absolute inset-0 size-full drop-shadow-[0_10px_14px_rgb(0_0_0/0.28)]"
        animate={reduce ? undefined : { rotate: 360 }}
        transition={{ duration: 40, ease: 'linear', repeat: Infinity }}
      >
        <polygon points={BURST} fill="var(--tomato)" />
      </motion.svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center text-center leading-[0.95] font-black text-white italic">
        <span className="text-[0.7rem] font-semibold not-italic opacity-90">Sold in</span>
        <span className="text-[1.6rem]">2 days</span>
      </span>
    </motion.div>
  );
}

export function SignIn() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const board = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

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

  const rise = (delay: number) =>
    reduce ? {} : { initial: { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 }, transition: { type: 'spring' as const, stiffness: 160, damping: 22, delay } };

  return (
    <div className="grain relative min-h-dvh overflow-x-clip bg-paper">
      <div className="mx-auto flex min-h-dvh max-w-[1400px] flex-col px-4 py-5 sm:px-8 lg:py-7">
        <header className="flex items-center justify-between gap-4 border-b border-line pb-4">
          <Wordmark />
          <ThemeToggle />
        </header>

        <div className="grid flex-1 items-center gap-8 py-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-12 lg:py-10">
          <div className="order-2 flex max-w-xl flex-col lg:order-1">
            <motion.h1 className="font-display text-[clamp(2.7rem,5.2vw,4.7rem)] leading-[0.92]" {...rise(0.08)}>
              Clear the pile.
              <br />
              <span className="text-accent italic">Keep the cash.</span>
            </motion.h1>
            <motion.p className="mt-5 max-w-md text-lg leading-relaxed text-ink-2" {...rise(0.2)}>
              Snap the clothes piling up on your chair and pileGo! lists them everywhere you sell. When one sells, it comes down
              everywhere else, and the pile gets smaller.
            </motion.p>
            <motion.div className="mt-5 flex max-w-md flex-wrap gap-1.5" {...rise(0.26)}>
              {MARKETPLACE_IDS.map(id => (
                <Sticker key={id} id={id} size="sm" />
              ))}
            </motion.div>

            <motion.div
              initial={reduce ? false : { y: 28, opacity: 0, rotate: 1.5 }}
              animate={{ y: 0, opacity: 1, rotate: -0.6 }}
              transition={{ delay: 0.34, type: 'spring', stiffness: 180, damping: 20 }}
              className="relative mt-8 w-full max-w-md"
            >
              <span className="tape absolute -top-3 left-8 z-10 h-6 w-20 -rotate-6" aria-hidden />
              <div className="relative rounded-[22px] bg-card px-6 pt-6 pb-6 text-ink lift-lg">
                {sent ? (
                  <div className="flex flex-col gap-3" role="status">
                    <Mail className="size-8 text-accent" aria-hidden />
                    <h2 className="font-display text-2xl">Check your email</h2>
                    <p className="text-ink-2">
                      We sent a sign-in link to <strong className="text-ink">{sent}</strong>. Open it on this device and you are in.
                    </p>
                    <Button variant="ghost" className="self-start" onClick={() => setSent(null)}>
                      Use a different email
                    </Button>
                  </div>
                ) : (
                  <form onSubmit={submit} className="flex flex-col gap-4">
                    <div>
                      <h2 className="font-display text-2xl">Sign in or sign up</h2>
                      <p className="mt-1 text-sm text-ink-2">No password. We email you a link.</p>
                    </div>
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
                    <Button type="submit" variant="tag" busy={busy} className="w-full text-base">
                      Email me a sign-in link
                      <ArrowRight className="size-4" aria-hidden />
                    </Button>
                    <p className="text-xs leading-relaxed text-muted">
                      Free and open source. Read the{' '}
                      <a className="underline decoration-line underline-offset-2 hover:text-ink" href="/privacy">
                        privacy notes
                      </a>
                      , or{' '}
                      <a className="underline decoration-line underline-offset-2 hover:text-ink" href="/extension">
                        get the browser extension
                      </a>
                      .
                    </p>
                  </form>
                )}
              </div>
            </motion.div>
          </div>

          <div
            ref={board}
            className="relative order-1 mx-auto aspect-[1/1] w-full max-w-[34rem] sm:aspect-[5/4] lg:order-2 lg:aspect-auto lg:h-[min(78vh,760px)] lg:max-w-none"
            aria-label="A pile of everyday clothes. Drag them around."
          >
            <span className="kraft absolute top-[2%] left-[16%] h-[40%] w-[50%] rotate-[5deg] rounded-[6px] shadow-[0_12px_30px_-18px_rgb(0_0_0/0.5)]" aria-hidden />
            <motion.span
              className="mat absolute inset-[8%_5%_9%_6%] rounded-[34px]"
              initial={reduce ? false : { opacity: 0, scale: 0.94, rotate: 2 }}
              animate={{ opacity: 1, scale: 1, rotate: -2.5 }}
              transition={{ type: 'spring', stiffness: 120, damping: 18 }}
              aria-hidden
            />
            {PRINTS.map((p, i) => (
              <Polaroid key={p.photo} src={PHOTOS[p.photo].src} caption={p.caption} at={p.at} board={board} index={i} />
            ))}
            {PIECES.map((p, i) => (
              <CutoutPiece key={p.id} id={p.id} at={p.at} board={board} index={i} />
            ))}
            <LooseTag price="$45" note="Live on 4" className="top-[33%] left-[45%] z-10 max-sm:scale-75" />
            <SoldBurst className="right-[3%] bottom-[4%] z-10 max-sm:scale-75" />
            <motion.div
              initial={reduce ? false : { opacity: 0, y: -10, rotate: -12 }}
              animate={{ opacity: 1, y: 0, rotate: -4 }}
              transition={{ type: 'spring', stiffness: 200, damping: 16, delay: 0.75 }}
              className="pointer-events-none absolute top-[0%] left-[24%] z-10 flex items-center gap-2 rounded-full bg-card py-1.5 pr-3 pl-1.5 text-sm font-semibold text-ink shadow-[0_10px_20px_-10px_rgb(0_0_0/0.45)] max-md:hidden"
              aria-hidden
            >
              <span className="flex -space-x-1">
                {(['depop', 'vinted', 'ebay', 'grailed'] as const).map(id => (
                  <MarketIcon key={id} id={id} className="size-5 ring-2 ring-card" />
                ))}
              </span>
              Listed everywhere
            </motion.div>
            <span className="absolute bottom-[2%] left-[8%] z-10 hidden -rotate-6 rounded-full bg-butter px-3 py-1 text-sm font-bold text-[#22241e] shadow-[0_6px_14px_-8px_rgb(0_0_0/0.5)] lg:block">
              Go on, drag them
            </span>
          </div>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4 text-xs text-muted">
          <span>Real photos, real cutouts. No AI recreations.</span>
          <span>pileGo! is free and open source.</span>
        </footer>
      </div>
    </div>
  );
}

