// The first thing a new seller sees after signing in: a short quiz, one
// question per card, that sets where they sell, where they ship from, how
// prices and descriptions work and, optionally, their seller address. Answers
// go to the profile; finishing marks the account as set up, so it shows once.

import {
  cleanSellerAddress,
  DEFAULT_VOICE,
  MARKETPLACE_IDS,
  MARKETPLACES,
  type MarketplaceId,
  type Profile,
  type SellerAddress,
  type SellerVoice,
} from '@pilego/core';
import { ArrowLeft, ArrowRight, Check, ScanLine } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { MarketIcon, TierLabel } from '~/components/bits';
import { SellerAddressFields } from '~/components/SellerAddressFields';
import { SellerLoginReminder } from '~/components/SellerLoginReminder';
import { Button, ErrorNote, Spinner } from '~/components/ui';
import { ThemeToggle, Wordmark } from '~/app/Shell';
import { markOnboarded } from '~/lib/auth';
import { cx } from '~/lib/format';
import { useProfile, useUpdateProfile, type FullProfile, type PriceStrategyName } from '~/lib/queries';
import { errorMessage } from '~/lib/supabase';

const REGIONS: Array<{ id: Profile['region']; label: string; currency: string; unit: 'in' | 'cm'; flag: string }> = [
  { id: 'US', label: 'United States', currency: 'USD', unit: 'in', flag: '🇺🇸' },
  { id: 'UK', label: 'United Kingdom', currency: 'GBP', unit: 'cm', flag: '🇬🇧' },
  { id: 'EU', label: 'Europe', currency: 'EUR', unit: 'cm', flag: '🇪🇺' },
  { id: 'CA', label: 'Canada', currency: 'CAD', unit: 'in', flag: '🇨🇦' },
  { id: 'AU', label: 'Australia', currency: 'AUD', unit: 'cm', flag: '🇦🇺' },
];

const PRICES: Array<{ value: PriceStrategyName; label: string; text: string }> = [
  { value: 'same', label: 'Same price everywhere', text: 'Buyers see one asking price on every site. What you keep varies with each site’s fees.' },
  { value: 'match_take_home', label: 'Same take-home everywhere', text: 'Each site’s price is nudged for its fees, so you pocket about the same wherever it sells.' },
];

const TONES: Array<{ value: SellerVoice['tone']; label: string; sample: string }> = [
  { value: 'friendly', label: 'Friendly', sample: 'Super comfy grey hoodie, only worn a few times. Happy to answer any questions!' },
  { value: 'minimal', label: 'Minimal', sample: 'Grey hoodie. Size M. Worn a few times, no flaws.' },
  { value: 'hype', label: 'Hype', sample: 'Heavyweight grey hoodie. Boxy fit, goes with everything. Grab it before it’s gone.' },
  { value: 'vintage-nerd', label: 'Vintage nerd', sample: '90s heavyweight fleece hoodie, single-stitch hem, ribbed cuffs, made in USA.' },
];

type StepId = 'where' | 'region' | 'prices' | 'tone' | 'address' | 'logins';
const STEPS: StepId[] = ['where', 'region', 'prices', 'tone', 'address', 'logins'];

interface Answers {
  marketplaces: MarketplaceId[];
  region: Profile['region'];
  price_strategy: PriceStrategyName;
  tone: SellerVoice['tone'];
  address: SellerAddress | null | undefined;
}

export function Onboarding() {
  const { data: profile, isLoading, error } = useProfile();
  if (isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-paper">
        <Spinner />
      </div>
    );
  }
  if (!profile) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4">
        <ErrorNote error={error ?? 'Your account is still being set up. Reload the page in a moment.'} />
        <Button variant="ink" onClick={() => window.location.reload()}>
          Reload
        </Button>
      </div>
    );
  }
  return <Quiz profile={profile} />;
}

function Quiz({ profile }: { profile: FullProfile }) {
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const update = useUpdateProfile();
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [a, setA] = useState<Answers>({
    marketplaces: profile.marketplaces.length ? profile.marketplaces : MARKETPLACE_IDS.filter(m => m !== 'ebay'),
    region: profile.region,
    price_strategy: profile.price_strategy,
    tone: { ...DEFAULT_VOICE, ...profile.voice }.tone,
    address: profile.seller_address,
  });
  const set = <K extends keyof Answers>(key: K, value: Answers[K]) => setA(x => ({ ...x, [key]: value }));
  const id = STEPS[step]!;
  const first = (profile.display_name ?? '').split(/[\s._-]/)[0] || '';

  function go(to: number) {
    setError(null);
    if (id === 'address' && to > step) {
      try {
        cleanSellerAddress(a.address);
      } catch (err) {
        setError(errorMessage(err));
        return;
      }
    }
    setDir(to > step ? 1 : -1);
    setStep(to);
    window.scrollTo({ top: 0 });
  }

  async function finish(scan: boolean) {
    setBusy(true);
    setError(null);
    try {
      const region = REGIONS.find(r => r.id === a.region)!;
      await update.mutateAsync({
        marketplaces: MARKETPLACE_IDS.filter(m => a.marketplaces.includes(m)),
        region: a.region,
        currency: region.currency,
        measurement_unit: region.unit,
        price_strategy: a.price_strategy,
        voice: { ...DEFAULT_VOICE, ...profile.voice, tone: a.tone },
        seller_address: cleanSellerAddress(a.address),
      });
      await markOnboarded();
      navigate(scan ? '/scan' : '/', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  const canNext = id !== 'where' || a.marketplaces.length > 0;

  return (
    <div className="grain relative min-h-dvh bg-paper">
      <div className="mx-auto flex min-h-dvh max-w-2xl flex-col px-4 py-5 sm:px-8">
        <header className="flex items-center justify-between gap-4 pb-4">
          <Wordmark />
          <ThemeToggle />
        </header>
        <div
          className="flex gap-1.5"
          role="progressbar"
          aria-label="Setup"
          aria-valuemin={1}
          aria-valuemax={STEPS.length}
          aria-valuenow={step + 1}
          aria-valuetext={`Question ${step + 1} of ${STEPS.length}`}
        >
          {STEPS.map((s, i) => (
            <span key={s} className={cx('h-1.5 flex-1 rounded-full transition-colors duration-500', i <= step ? 'bg-accent' : 'bg-line')} />
          ))}
        </div>

        <div className="relative flex-1 py-8">
          <AnimatePresence mode="wait" custom={dir} initial={false}>
            <motion.section
              key={id}
              custom={dir}
              initial={reduce ? { opacity: 0 } : { opacity: 0, x: dir * 40, rotate: dir * 0.8 }}
              animate={{ opacity: 1, x: 0, rotate: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, x: dir * -40, rotate: dir * -0.8 }}
              transition={{ type: 'spring', stiffness: 260, damping: 28 }}
              aria-labelledby="quiz-q"
            >
              {id === 'where' && (
                <Question
                  title={first ? `Hey ${first}! Where do you sell?` : 'Where do you sell?'}
                  note="Pick every site you want your clothes on. pileGo! lists each piece on all of them and takes it down everywhere when it sells."
                >
                  <div className="grid gap-2.5 sm:grid-cols-2" role="group" aria-labelledby="quiz-q">
                    {MARKETPLACE_IDS.map(m => {
                      const on = a.marketplaces.includes(m);
                      const info = MARKETPLACES[m];
                      return (
                        <Choice
                          key={m}
                          on={on}
                          multi
                          onClick={() => set('marketplaces', on ? a.marketplaces.filter(x => x !== m) : [...a.marketplaces, m])}
                        >
                          <span className="flex items-center gap-2 font-semibold">
                            <MarketIcon id={m} className="size-5" />
                            {info.name}
                          </span>
                          <TierLabel tier={info.capabilities.create} auto={info.auto_post} className="mt-1" />
                        </Choice>
                      );
                    })}
                  </div>
                  {!canNext && <p className="mt-3 text-sm text-muted">Pick at least one to carry on.</p>}
                </Question>
              )}

              {id === 'region' && (
                <Question title="Where do you ship from?" note="Sets your currency, measurements and each site’s fees.">
                  <div className="grid gap-2.5 sm:grid-cols-2" role="radiogroup" aria-labelledby="quiz-q">
                    {REGIONS.map(r => (
                      <Choice key={r.id} on={a.region === r.id} onClick={() => set('region', r.id)}>
                        <span className="flex items-center gap-2 font-semibold">
                          <span aria-hidden className="text-xl leading-none">
                            {r.flag}
                          </span>
                          {r.label}
                        </span>
                        <span className="mt-1 text-xs text-muted">
                          {r.currency}, {r.unit === 'in' ? 'inches' : 'centimetres'}
                        </span>
                      </Choice>
                    ))}
                  </div>
                </Question>
              )}

              {id === 'prices' && (
                <Question title="How should prices work?" note="pileGo! suggests a price from what similar pieces sold for. This decides how it carries across sites.">
                  <div className="grid gap-2.5" role="radiogroup" aria-labelledby="quiz-q">
                    {PRICES.map(p => (
                      <Choice key={p.value} on={a.price_strategy === p.value} onClick={() => set('price_strategy', p.value)}>
                        <span className="font-semibold">{p.label}</span>
                        <span className="mt-1 text-sm text-ink-2">{p.text}</span>
                      </Choice>
                    ))}
                  </div>
                </Question>
              )}

              {id === 'tone' && (
                <Question title="How should your listings sound?" note="The AI writes every description in this voice. You can edit any of them.">
                  <div className="grid gap-2.5 sm:grid-cols-2" role="radiogroup" aria-labelledby="quiz-q">
                    {TONES.map(t => (
                      <Choice key={t.value} on={a.tone === t.value} onClick={() => set('tone', t.value)}>
                        <span className="font-semibold">{t.label}</span>
                        <span className="mt-1.5 text-sm text-ink-2 italic">“{t.sample}”</span>
                      </Choice>
                    ))}
                  </div>
                </Question>
              )}

              {id === 'address' && (
                <Question
                  title="Where do parcels ship from?"
                  note="Optional. Some sites won’t post a first listing without a ship-from address, and pileGo! fills it in for you. It never appears on a listing."
                >
                  <div className="rounded-[20px] bg-card p-5 lift">
                    <SellerAddressFields
                      value={a.address}
                      onChange={v => set('address', v)}
                      country={a.region === 'UK' ? 'GB' : a.region === 'EU' ? '' : a.region}
                    />
                  </div>
                </Question>
              )}

              {id === 'logins' && (
                <Question title="Last thing: log in to your sites" note="pileGo! posts from your own logged-in tabs, so sign in once in this browser.">
                  {a.marketplaces.some(m => ['extension', 'assist'].includes(MARKETPLACES[m].capabilities.create)) ? (
                    <div className="rounded-[20px] bg-card p-4 lift">
                      <SellerLoginReminder markets={a.marketplaces} />
                    </div>
                  ) : (
                    <p className="text-ink-2">eBay connects from Settings whenever you are ready.</p>
                  )}
                  <p className="mt-5 text-ink-2">
                    That’s it. Next, snap a piece: the AI reads your photos and fills in the title, brand, size, condition, measurements and price.
                  </p>
                  <ErrorNote error={error} className="mt-5" />
                  <div className="mt-6 flex flex-col gap-3 sm:flex-row-reverse sm:justify-end">
                    <Button variant="tag" className="text-base" busy={busy} icon={<ScanLine className="size-5" aria-hidden />} onClick={() => void finish(true)}>
                      Scan my first piece
                    </Button>
                    <Button variant="line" disabled={busy} onClick={() => void finish(false)}>
                      Look around first
                    </Button>
                  </div>
                </Question>
              )}
            </motion.section>
          </AnimatePresence>
        </div>

        <footer className="flex flex-col gap-3 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {id !== 'logins' && <ErrorNote error={error} />}
          <div className="flex flex-wrap items-center gap-3">
            {step > 0 && (
              <Button variant="ghost" icon={<ArrowLeft className="size-4" aria-hidden />} onClick={() => go(step - 1)} disabled={busy}>
                Back
              </Button>
            )}
            <div className="ml-auto flex flex-wrap items-center justify-end gap-3">
              {id === 'address' && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    set('address', null);
                    setDir(1);
                    setError(null);
                    setStep(step + 1);
                  }}
                >
                  Skip for now
                </Button>
              )}
              {id !== 'logins' && (
                <Button variant="tag" className="text-base" disabled={!canNext} onClick={() => go(step + 1)}>
                  Next
                  <ArrowRight className="size-4" aria-hidden />
                </Button>
              )}
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

function Question({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <>
      <h1 id="quiz-q" className="font-display text-[clamp(2.2rem,6vw,3.6rem)] leading-[0.95]">
        {title}
      </h1>
      <p className="mt-3 mb-6 max-w-prose text-ink-2">{note}</p>
      {children}
    </>
  );
}

function Choice({ on, multi, onClick, children }: { on: boolean; multi?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role={multi ? 'checkbox' : 'radio'}
      aria-checked={on}
      onClick={onClick}
      className={cx(
        'relative flex flex-col items-start rounded-2xl p-4 pr-11 text-left transition duration-300 ease-[var(--ease-spring)] active:scale-[0.98]',
        on
          ? 'bg-card shadow-[inset_0_0_0_2px_var(--accent),0_10px_22px_-16px_rgb(var(--shadow)/0.8)]'
          : 'bg-card shadow-[inset_0_0_0_1.5px_var(--line)] hover:-translate-y-0.5 hover:shadow-[inset_0_0_0_1.5px_var(--ink-2)]',
      )}
    >
      {children}
      <span
        aria-hidden
        className={cx(
          'absolute top-4 right-4 flex size-5 items-center justify-center transition',
          multi ? 'rounded-md' : 'rounded-full',
          on ? 'bg-accent text-accent-ink' : 'shadow-[inset_0_0_0_1.5px_var(--line)]',
        )}
      >
        {on && <Check className="size-3.5" strokeWidth={3} />}
      </span>
    </button>
  );
}
