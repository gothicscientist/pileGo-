import {
  DEFAULT_VOICE,
  feeRule,
  MARKETPLACE_IDS,
  MARKETPLACES,
  type MarketplaceId,
  type Profile,
  type SellerVoice,
} from '@pilego/core';
import { Download, LogOut, PlugZap, RefreshCw } from 'lucide-react';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { useLocation, useSearchParams } from 'react-router';
import { Sticker, TierLabel } from '~/components/bits';
import { useToast } from '~/components/overlay';
import { Button, ChipInput, ChoiceChips, ErrorNote, Field, Paper, Select, Spinner, TextField } from '~/components/ui';
import { useAuth } from '~/lib/auth';
import { askExtensionToImport, askExtensionToSync, useExtension } from '~/lib/extension';
import { ago, cx } from '~/lib/format';
import { useEbayActions, useEbayPolicies, useEbayStatus, useProfile, useUpdateProfile, type FullProfile } from '~/lib/queries';
import { errorMessage, supabase } from '~/lib/supabase';
import { applyTheme, savedTheme, type Theme } from '~/lib/theme';

const CURRENCIES = ['USD', 'GBP', 'EUR', 'CAD', 'AUD'];
const REGIONS: Array<{ id: Profile['region']; label: string }> = [
  { id: 'US', label: 'United States' },
  { id: 'UK', label: 'United Kingdom' },
  { id: 'EU', label: 'Europe' },
  { id: 'CA', label: 'Canada' },
  { id: 'AU', label: 'Australia' },
];
const TONES: Array<{ value: SellerVoice['tone']; label: string; title: string }> = [
  { value: 'friendly', label: 'Friendly', title: 'Warm, plain sentences. Invites questions.' },
  { value: 'minimal', label: 'Minimal', title: 'Just the facts.' },
  { value: 'hype', label: 'Hype', title: 'Short, punchy, streetwear energy.' },
  { value: 'vintage-nerd', label: 'Vintage nerd', title: 'Era, construction and label details up front.' },
];

export function SettingsPage() {
  const { data: profile, isLoading } = useProfile();
  const { hash } = useLocation();

  useEffect(() => {
    if (!hash || isLoading) return;
    document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' });
  }, [hash, isLoading]);

  if (isLoading || !profile) {
    return (
      <div className="flex min-h-[50dvh] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:py-8">
      <h1 className="font-display text-5xl leading-[0.9] font-extrabold sm:text-6xl">Settings</h1>
      <div className="mt-8 flex flex-col gap-8">
        <Marketplaces profile={profile} />
        <Ebay />
        <Extension />
        <Selling profile={profile} />
        <Voice profile={profile} />
        <Basics profile={profile} />
        <Account />
      </div>
    </div>
  );
}

function Section({ id, title, children, intro }: { id: string; title: string; children: ReactNode; intro?: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="font-display text-2xl font-bold">
        {title}
      </h2>
      {intro && <p className="mt-1 mb-3 max-w-prose text-sm text-ink-2">{intro}</p>}
      <Paper className={cx('p-5', !intro && 'mt-3')}>{children}</Paper>
    </section>
  );
}

function useSave() {
  const update = useUpdateProfile();
  const toast = useToast();
  return (patch: Partial<FullProfile>) =>
    update.mutate(patch, { onError: err => toast(errorMessage(err), { tone: 'error' }) });
}

// ---------------------------------------------------------------------------

function Marketplaces({ profile }: { profile: FullProfile }) {
  const save = useSave();
  const [editing, setEditing] = useState<MarketplaceId | null>(null);
  const on = new Set(profile.marketplaces);
  return (
    <Section
      id="marketplaces"
      title="Where you sell"
      intro="These are picked by default when you cross-list. How pileGo reaches each one is shown under its name."
    >
      <ul className="flex flex-col divide-y divide-dashed divide-line">
        {MARKETPLACE_IDS.map(m => {
          const info = MARKETPLACES[m];
          const rule = feeRule(m, profile.region, profile.fee_overrides);
          const over = profile.fee_overrides?.[m];
          return (
            <li key={m} className="py-3 first:pt-0 last:pb-0">
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  aria-label={`Sell on ${info.name}`}
                  className="mt-1.5 size-4 accent-[var(--ink)]"
                  checked={on.has(m)}
                  onChange={e => {
                    const next = e.target.checked ? [...profile.marketplaces, m] : profile.marketplaces.filter(x => x !== m);
                    save({ marketplaces: MARKETPLACE_IDS.filter(x => next.includes(x)) });
                  }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <Sticker id={m} size="sm" />
                    <TierLabel tier={info.capabilities.create} />
                    <button type="button" className="ml-auto text-xs text-muted underline" onClick={() => setEditing(e => (e === m ? null : m))}>
                      Fees {rule.percent}%{rule.fixed ? ` + ${rule.fixed}` : ''}
                      {over ? ' (yours)' : ''}
                    </button>
                  </div>
                  <p className="mt-1 text-sm text-ink-2">{info.blurb}</p>
                  {editing === m && <FeeEditor profile={profile} id={m} onDone={() => setEditing(null)} />}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

function FeeEditor({ profile, id, onDone }: { profile: FullProfile; id: MarketplaceId; onDone: () => void }) {
  const save = useSave();
  const rule = feeRule(id, profile.region, profile.fee_overrides);
  const [percent, setPercent] = useState(String(rule.percent));
  const [fixed, setFixed] = useState(String(rule.fixed));
  return (
    <form
      className="mt-3 flex flex-wrap items-end gap-3 rounded-lg bg-paper-2 p-3"
      onSubmit={e => {
        e.preventDefault();
        const p = Number(percent);
        const f = Number(fixed);
        if (!Number.isFinite(p) || !Number.isFinite(f)) return;
        save({ fee_overrides: { ...profile.fee_overrides, [id]: { percent: p, fixed: f } } });
        onDone();
      }}
    >
      <TextField label="Percent" inputMode="decimal" className="w-28" value={percent} onChange={e => setPercent(e.target.value)} />
      <TextField label="Fixed per sale" inputMode="decimal" className="w-32" value={fixed} onChange={e => setFixed(e.target.value)} />
      <Button type="submit" variant="ink" size="sm">
        Save fees
      </Button>
      {profile.fee_overrides?.[id] && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            const next = { ...profile.fee_overrides };
            delete next[id];
            save({ fee_overrides: next });
            onDone();
          }}
        >
          Use the default
        </Button>
      )}
    </form>
  );
}

// ---------------------------------------------------------------------------

function Ebay() {
  const status = useEbayStatus();
  const { connect, settings, disconnect, sync, importListings } = useEbayActions();
  const connected = Boolean(status.data?.connected);
  const policies = useEbayPolicies(connected);
  const meta = (status.data?.account?.meta ?? {}) as Record<string, string | undefined>;
  const [postcode, setPostcode] = useState('');
  const [params, setParams] = useSearchParams();
  const toast = useToast();

  useEffect(() => setPostcode(meta.postal_code ?? ''), [meta.postal_code]);

  useEffect(() => {
    const result = params.get('ebay');
    if (!result) return;
    if (result === 'connected') toast('eBay connected');
    else toast('eBay was not connected', { tone: 'error' });
    void status.refetch();
    setParams(
      p => {
        const n = new URLSearchParams(p);
        n.delete('ebay');
        return n;
      },
      { replace: true },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const notify = (p: Promise<unknown>, ok: string) =>
    p.then(() => toast(ok)).catch(err => toast(errorMessage(err), { tone: 'error' }));

  return (
    <Section
      id="ebay"
      title="eBay"
      intro="eBay has an official API, so pileGo lists, ends, relists and checks for sales from the server, even when your browser is closed."
    >
      {status.isLoading ? (
        <Spinner />
      ) : status.isError ? (
        <ErrorNote error={status.error} />
      ) : !status.data?.configured ? (
        <p className="text-sm text-ink-2">
          This copy of pileGo has no eBay developer keys yet. Whoever runs it adds <code>EBAY_CLIENT_ID</code>,{' '}
          <code>EBAY_CLIENT_SECRET</code> and <code>EBAY_RUNAME</code> to the server functions’ secrets; the self-hosting guide shows how.
          Until then, eBay works with the listing kit.
        </p>
      ) : !connected ? (
        <div className="flex flex-col items-start gap-3">
          {status.data.account?.status === 'expired' && (
            <ErrorNote error="eBay signed pileGo out. Connect again to keep listings in sync." />
          )}
          <Button variant="tag" busy={connect.isPending} onClick={() => connect.mutate(undefined, { onError: e => toast(errorMessage(e), { tone: 'error' }) })}>
            Connect eBay
          </Button>
          <p className="text-xs text-muted">You sign in on eBay. pileGo never sees your password.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <p className="text-sm">
            Connected{status.data.account?.username ? ` as ${status.data.account.username}` : ''}.{' '}
            {status.data.account?.last_sync_at ? `Last checked for sales ${ago(status.data.account.last_sync_at)}.` : ''}
          </p>
          {status.data.account?.last_error && <ErrorNote error={status.data.account.last_error} />}
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={e => {
              e.preventDefault();
              void notify(settings.mutateAsync({ postal_code: postcode }), 'Saved');
            }}
          >
            <TextField
              label="Postcode items ship from"
              className="w-48"
              value={postcode}
              onChange={e => setPostcode(e.target.value)}
              hint="eBay needs an item location."
            />
            <Button type="submit" variant="ink" busy={settings.isPending}>
              Save
            </Button>
          </form>

          <div className="grid gap-3 sm:grid-cols-3">
            <PolicySelect
              label="Shipping policy"
              value={meta.fulfillment_policy_id}
              options={policies.data?.fulfillment}
              loading={policies.isLoading}
              onChange={v => void notify(settings.mutateAsync({ fulfillment_policy_id: v }), 'Saved')}
            />
            <PolicySelect
              label="Payment policy"
              value={meta.payment_policy_id}
              options={policies.data?.payment}
              loading={policies.isLoading}
              onChange={v => void notify(settings.mutateAsync({ payment_policy_id: v }), 'Saved')}
            />
            <PolicySelect
              label="Returns policy"
              value={meta.return_policy_id}
              options={policies.data?.returns}
              loading={policies.isLoading}
              onChange={v => void notify(settings.mutateAsync({ return_policy_id: v }), 'Saved')}
            />
          </div>
          {policies.isError && <ErrorNote error={policies.error} />}
          <p className="-mt-2 text-xs text-muted">Leave a policy on “First one” and pileGo uses your first eBay policy, or creates a simple one.</p>

          <div id="import" className="flex scroll-mt-24 flex-wrap gap-2">
            <Button
              variant="line"
              icon={<RefreshCw className="size-4" aria-hidden />}
              busy={sync.isPending}
              onClick={() =>
                void notify(sync.mutateAsync(), 'Checked eBay for sales')
              }
            >
              Check for sales now
            </Button>
            <Button
              variant="line"
              icon={<Download className="size-4" aria-hidden />}
              busy={importListings.isPending}
              onClick={() =>
                importListings.mutate(undefined, {
                  onSuccess: r => toast(`Imported ${r.imported} listings${r.skipped ? `, ${r.skipped} already here` : ''}`),
                  onError: err => toast(errorMessage(err), { tone: 'error' }),
                })
              }
            >
              Import my eBay listings
            </Button>
            <Button variant="ghost" busy={disconnect.isPending} onClick={() => void notify(disconnect.mutateAsync(), 'eBay disconnected')}>
              Disconnect
            </Button>
          </div>
        </div>
      )}
    </Section>
  );
}

function PolicySelect({
  label,
  value,
  options,
  loading,
  onChange,
}: {
  label: string;
  value: string | undefined;
  options: Array<{ id: string; name: string }> | undefined;
  loading: boolean;
  onChange: (v: string) => void;
}) {
  const id = useId();
  return (
    <Field label={label} htmlFor={id}>
      <Select id={id} value={value ?? ''} disabled={loading} onChange={e => onChange(e.target.value)}>
        <option value="">First one</option>
        {(options ?? []).map(o => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </Select>
    </Field>
  );
}

// ---------------------------------------------------------------------------

const EXTENSION_MARKETS = MARKETPLACE_IDS.filter(m => {
  const t = MARKETPLACES[m].capabilities.create;
  return t === 'extension' || t === 'assist';
});

function Extension() {
  const ext = useExtension();
  const toast = useToast();
  return (
    <Section
      id="extension"
      title="Browser extension"
      intro="Vinted, Depop, Poshmark, Mercari, Grailed and Facebook have no public API for sellers. The pileGo extension works in your own logged-in tabs: one click on Vinted, a filled-in form on the others."
    >
      {ext.installed && ext.needs_approval ? (
        <p className="flex items-start gap-2 rounded-lg bg-sticker p-3 text-sm font-semibold text-ink">
          <PlugZap className="mt-0.5 size-5 shrink-0" aria-hidden />
          The extension wants your OK before it links to this copy of pileGo. Click the pileGo icon in your browser’s toolbar and choose Allow.
        </p>
      ) : ext.installed ? (
        <div className="flex flex-col gap-4">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <span className={cx('size-2.5 rounded-full', ext.linked ? 'bg-[#1fa36b]' : 'bg-sticker')} aria-hidden />
            {ext.linked ? 'Connected' : 'Installed, linking…'}
            {ext.version ? `, version ${ext.version}` : ''}
            {ext.running ? `, running ${ext.running} ${ext.running === 1 ? 'job' : 'jobs'}` : ''}
          </p>
          <ul className="flex flex-wrap gap-2" aria-label="Marketplace tabs open in this browser">
            {EXTENSION_MARKETS.map(m => (
              <li key={m} className="flex items-center gap-1.5 rounded-lg bg-paper-2 px-2 py-1 text-xs">
                <Sticker id={m} size="sm" tilt={false} muted={!ext.tabs[m]} />
                {ext.tabs[m] ? 'tab open' : 'no tab'}
              </li>
            ))}
          </ul>
          {ext.last_message && <p className="text-sm text-ink-2">{ext.last_message}</p>}
          <ErrorNote error={ext.last_error} />
          <p className="text-sm text-muted">
            Vinted jobs run by themselves while a Vinted tab is open. For the other marketplaces the extension opens the sell form, fills it, and you press post.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="line"
              icon={<Download className="size-4" aria-hidden />}
              disabled={!ext.linked}
              onClick={() => {
                askExtensionToImport('vinted');
                toast('Importing your Vinted wardrobe in the extension');
              }}
            >
              Import my Vinted wardrobe
            </Button>
            <Button
              variant="line"
              icon={<RefreshCw className="size-4" aria-hidden />}
              disabled={!ext.linked}
              onClick={() => {
                askExtensionToSync();
                toast('Checking your marketplaces for sales');
              }}
            >
              Check for sales
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3 text-sm">
          <p className="flex items-center gap-2 font-semibold">
            <PlugZap className="size-5" aria-hidden />
            Not installed in this browser
          </p>
          <ol className="list-decimal space-y-1 pl-5 text-ink-2">
            <li>
              Download <strong>pilego-extension-chrome.zip</strong> (or the Firefox one) from the project’s releases page and unzip it.
            </li>
            <li>
              In Chrome, Edge or Brave open <code>chrome://extensions</code>, turn on Developer mode and choose <em>Load unpacked</em>. In
              Firefox open <code>about:debugging</code> and load the zip as a temporary add-on.
            </li>
            <li>Come back to this page. The extension links to your account by itself and stays signed in.</li>
          </ol>
          <a className="btn btn-ink self-start" href="https://github.com/gothicscientist/pileGo-/releases" target="_blank" rel="noreferrer">
            Releases page
          </a>
        </div>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------------------

function Selling({ profile }: { profile: FullProfile }) {
  const save = useSave();
  const [stale, setStale] = useState(String(profile.stale_after_days));
  return (
    <Section id="selling" title="Pricing">
      <div className="flex flex-col gap-5">
        <ChoiceChips<'same' | 'match_take_home'>
          label="Price on each marketplace"
          value={profile.price_strategy}
          onChange={v => v && save({ price_strategy: v })}
          options={[
            { value: 'same', label: 'Same price everywhere' },
            { value: 'match_take_home', label: 'Same take-home everywhere' },
          ]}
          hint={
            profile.price_strategy === 'match_take_home'
              ? 'Prices go up on high-fee marketplaces so you keep about the same after fees.'
              : 'Buyers see one price wherever they find it.'
          }
        />
        <TextField
          label="Call a listing old after this many days"
          inputMode="numeric"
          className="max-w-xs"
          value={stale}
          onChange={e => setStale(e.target.value)}
          onBlur={() => {
            const n = Math.round(Number(stale));
            if (Number.isFinite(n) && n >= 7 && n <= 365 && n !== profile.stale_after_days) save({ stale_after_days: n });
            else setStale(String(profile.stale_after_days));
          }}
          hint="Old listings get a relist reminder. Between 7 and 365."
        />
      </div>
    </Section>
  );
}

function Voice({ profile }: { profile: FullProfile }) {
  const save = useSave();
  const voice = { ...DEFAULT_VOICE, ...profile.voice };
  const [signOff, setSignOff] = useState(voice.sign_off ?? '');
  const setVoice = (patch: Partial<SellerVoice>) => save({ voice: { ...voice, ...patch } });
  return (
    <Section id="voice" title="How your listings sound" intro="Used when pileGo writes each marketplace’s description.">
      <div className="flex flex-col gap-5">
        <ChoiceChips<SellerVoice['tone']> label="Tone" value={voice.tone} onChange={v => v && setVoice({ tone: v })} options={TONES} />
        <TextField
          label="Sign-off"
          value={signOff}
          placeholder="Ships within 2 days. Bundle for 15% off."
          onChange={e => setSignOff(e.target.value)}
          onBlur={() => signOff !== (voice.sign_off ?? '') && setVoice({ sign_off: signOff.trim() || null })}
        />
        <ChipInput
          label="Always mention"
          values={voice.always_mention}
          onChange={v => setVoice({ always_mention: v })}
          placeholder="Smoke-free home"
        />
        <ChipInput label="Never use these words" values={voice.avoid_words} onChange={v => setVoice({ avoid_words: v })} placeholder="rare" />
      </div>
    </Section>
  );
}

function Basics({ profile }: { profile: FullProfile }) {
  const save = useSave();
  const [name, setName] = useState(profile.display_name ?? '');
  const [theme, setTheme] = useState<Theme>(savedTheme);
  const ids = { cur: useId(), reg: useId() };
  return (
    <Section id="basics" title="Basics">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Your name"
          value={name}
          onChange={e => setName(e.target.value)}
          onBlur={() => name !== (profile.display_name ?? '') && save({ display_name: name.trim() || null })}
        />
        <Field label="Currency" htmlFor={ids.cur} hint="New items use this currency.">
          <Select id={ids.cur} value={profile.currency} onChange={e => save({ currency: e.target.value })}>
            {CURRENCIES.map(c => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <Field label="Where you sell from" htmlFor={ids.reg} hint="Sets fee estimates and the eBay site.">
          <Select id={ids.reg} value={profile.region} onChange={e => save({ region: e.target.value as Profile['region'] })}>
            {REGIONS.map(r => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </Select>
        </Field>
        <ChoiceChips<'cm' | 'in'>
          label="Measurements in"
          value={profile.measurement_unit}
          onChange={v => v && save({ measurement_unit: v })}
          options={[
            { value: 'in', label: 'Inches' },
            { value: 'cm', label: 'Centimetres' },
          ]}
        />
        <ChoiceChips<Theme>
          label="Appearance"
          value={theme}
          onChange={v => {
            const t = v ?? 'system';
            setTheme(t);
            applyTheme(t);
          }}
          options={[
            { value: 'system', label: 'Match device' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
        />
      </div>
    </Section>
  );
}

function Account() {
  const { session } = useAuth();
  return (
    <Section id="account" title="Account">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm">
          Signed in as <strong>{session?.user.email}</strong>
        </p>
        <div className="flex gap-2">
          <a href="/privacy" className="btn btn-ghost btn-sm">
            Privacy notes
          </a>
          <Button size="sm" variant="line" icon={<LogOut className="size-4" aria-hidden />} onClick={() => void supabase.auth.signOut()}>
            Sign out
          </Button>
        </div>
      </div>
    </Section>
  );
}

