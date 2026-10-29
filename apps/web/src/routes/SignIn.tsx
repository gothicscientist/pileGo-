import { MARKETPLACE_IDS } from '@pilego/core';
import { ArrowRight, Mail } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useRef, useState, type FormEvent } from 'react';
import { Sticker } from '~/components/bits';
import { HeroPlayground } from '~/components/HeroPlayground';
import { Button, ErrorNote, TextField } from '~/components/ui';
import { ThemeToggle, Wordmark } from '~/app/Shell';
import { errorMessage, supabase } from '~/lib/supabase';

export function SignIn() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const floor = useRef<HTMLDivElement>(null);
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
    <div ref={floor} className="hero-floor grain relative min-h-dvh overflow-x-clip bg-paper">
      <div className="mx-auto flex min-h-dvh max-w-[1400px] flex-col px-4 py-5 sm:px-8 lg:py-7">
        <header className="relative z-30 flex items-center justify-between gap-4 border-b border-line pb-4">
          <Wordmark />
          <ThemeToggle />
        </header>

        <div className="grid flex-1 items-center gap-8 py-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-12 lg:py-10">
          <div className="hero-copy relative z-20 order-2 flex max-w-xl flex-col lg:order-1">
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

          <HeroPlayground floor={floor} />
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4 text-xs text-muted">
          <span>Real photos, real cutouts. No AI recreations.</span>
          <span>pileGo! is free and open source.</span>
        </footer>
      </div>
    </div>
  );
}
