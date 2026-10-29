// Getting the browser extension: download, load it, and check it is linked.
// Public, so it can be linked from anywhere and opened before signing in.
// The zips are built with the web app and served from /downloads.

import { CheckCircle2, Copy, Download, PlugZap, TriangleAlert } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Wordmark } from '~/app/Shell';
import { Paper } from '~/components/ui';
import { useAuth } from '~/lib/auth';
import { useExtension } from '~/lib/extension';
import { extensionReturnTo } from '~/lib/extension-flow';
import { cx } from '~/lib/format';

declare const __EXTENSION_VERSION__: string;

export const EXTENSION_VERSION = typeof __EXTENSION_VERSION__ === 'string' ? __EXTENSION_VERSION__ : null;
export const CHROME_ZIP = '/downloads/pilego-extension-chrome.zip';
export const FIREFOX_ZIP = '/downloads/pilego-extension-firefox.zip';

type Browser = 'chrome' | 'edge' | 'brave' | 'firefox' | 'other';

function detectBrowser(): Browser {
  if (typeof navigator === 'undefined') return 'chrome';
  const ua = navigator.userAgent;
  if (/Firefox\//.test(ua)) return 'firefox';
  if (/Edg\//.test(ua)) return 'edge';
  if ((navigator as Navigator & { brave?: unknown }).brave) return 'brave';
  if (/Chrome\//.test(ua)) return 'chrome';
  return 'other';
}

const isPhone = () => typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

/** "0.10.0" is newer than "0.9.0". */
export function older(installed: string | null, latest: string | null): boolean {
  if (!installed || !latest) return false;
  const a = installed.split('.').map(Number);
  const b = latest.split('.').map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) < (b[i] ?? 0);
  }
  return false;
}

export function ExtensionPage() {
  const ext = useExtension();
  const { session } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const returnTo = extensionReturnTo(params.get('returnTo'));
  const returnLabel = returnTo?.startsWith('/item/') ? 'Back to listing' : 'Back to where you left off';
  const [browser] = useState(detectBrowser);
  useEffect(() => {
    if (returnTo && session && ext.installed && ext.linked && !ext.needs_approval && ext.user_id === session.user.id) {
      navigate(returnTo, { replace: true });
    }
  }, [returnTo, session, ext.installed, ext.linked, ext.needs_approval, ext.user_id, navigate]);
  // The extension answers within a moment; until then, say so rather than "not found".
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    const t = window.setTimeout(() => setChecking(false), 2500);
    return () => window.clearTimeout(t);
  }, []);

  const pages = browser === 'edge' ? 'edge://extensions' : browser === 'brave' ? 'brave://extensions' : 'chrome://extensions';
  const firefox = browser === 'firefox';

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:py-10">
      <div className="flex items-center justify-between gap-3">
        <Link to="/">
          <Wordmark />
        </Link>
        <Link to={returnTo ?? (session ? '/settings#extension' : '/')} className="text-sm font-semibold text-ink-2 underline">
          {returnTo ? returnLabel : session ? 'Back to Settings' : 'Back to pileGo'}
        </Link>
      </div>

      <header className="mt-8">
        <h1 className="font-display text-5xl leading-[0.9] font-extrabold sm:text-6xl">Get the browser extension</h1>
        <p className="mt-3 max-w-2xl text-ink-2">
          Vinted, Depop, Poshmark, Mercari, Grailed and Facebook have no public API for sellers. The pileGo extension does that work
          in tabs where you are already logged in: Vinted in one click, a filled-in sell form on the others. It also reads eBay’s
          sold listings so price suggestions use what things actually sold for. It takes about two minutes to install.
        </p>
      </header>

      <StatusCard ext={ext} checking={checking} signedIn={Boolean(session)} />

      {returnTo && (
        <p role="status" className="mt-3 text-sm text-ink-2">
          {returnTo.startsWith('/item/')
            ? 'Your listing is saved here. Once the extension is installed and linked, we’ll take you straight back to continue.'
            : 'Once the extension is installed and linked, we’ll take you back to where you left off.'}
        </p>
      )}

      {isPhone() && (
        <p className="mt-4 flex items-start gap-2 rounded-lg bg-sticker/70 p-3 text-sm text-[#16172b]">
          <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
          Phones and tablets cannot run browser extensions. Open pilego.app on a computer in Chrome, Edge, Brave or Firefox.
        </p>
      )}

      <section className="mt-8 grid gap-3 sm:grid-cols-2" aria-label="Downloads">
        <a
          href={CHROME_ZIP}
          download
          className={cx('btn justify-center py-4 text-base', firefox ? 'btn-line' : 'btn-tag')}
        >
          <Download className="size-5" aria-hidden />
          Download for Chrome, Edge or Brave
        </a>
        <a href={FIREFOX_ZIP} download className={cx('btn justify-center py-4 text-base', firefox ? 'btn-tag' : 'btn-line')}>
          <Download className="size-5" aria-hidden />
          Download for Firefox
        </a>
        {EXTENSION_VERSION && <p className="text-xs text-muted sm:col-span-2">Version {EXTENSION_VERSION}. Free and open source.</p>}
      </section>

      {firefox ? <FirefoxSteps /> : <ChromeSteps pages={pages} browser={browser} />}

      <Paper className="mt-8 p-5 sm:p-6">
        <h2 className="font-display text-2xl font-bold">If something is off</h2>
        <dl className="mt-3 flex flex-col gap-4 text-sm">
          <Trouble q="Chrome says “Manifest file is missing or unreadable”">
            You picked the zip, or the folder around the right one. Choose the folder that has <code>manifest.json</code> directly
            inside it.
          </Trouble>
          <Trouble q="This page still says “Not detected”">
            Refresh this tab after installing. On {pages}, check that the pileGo switch is on. The extension only talks to
            pilego.app, so make sure that is the address in your address bar.
          </Trouble>
          <Trouble q="Chrome warns about “developer mode extensions”">
            That is expected. Chrome shows it for every extension that is not from the Chrome Web Store. Close the warning; do not
            press Remove or turn off Developer mode.
          </Trouble>
          <Trouble q="It says “Installed” but never “linked”">
            Sign in to pileGo in this same browser and keep this page open for a few seconds. If it still does not link, open the
            extension from the toolbar to see the error.
          </Trouble>
          <Trouble q="The toolbar icon shows “!”">
            You opened a copy of pileGo at another address. Click the icon and choose Allow if it is yours.
          </Trouble>
          <Trouble q="Updating to a new version">
            {firefox
              ? 'Download the new zip and load it on about:debugging the same way.'
              : `Download the new zip, unzip it over the old folder, then press the reload arrow on the pileGo card on ${pages}. Your link to pileGo is kept.`}
          </Trouble>
          <Trouble q="Safari">Safari is not supported. Use Chrome, Edge, Brave or Firefox on a computer.</Trouble>
        </dl>
      </Paper>
    </div>
  );
}

function StatusCard({ ext, checking, signedIn }: { ext: ReturnType<typeof useExtension>; checking: boolean; signedIn: boolean }) {
  const outdated = older(ext.version, EXTENSION_VERSION);
  let tone: 'good' | 'wait' | 'none' = 'none';
  let title: string;
  let detail: ReactNode = null;
  if (ext.installed && ext.needs_approval) {
    tone = 'wait';
    title = 'Installed. It needs your OK';
    detail = 'Click the pileGo icon in your browser’s toolbar and choose Allow.';
  } else if (ext.installed && ext.linked) {
    tone = 'good';
    title = 'Installed and linked';
    detail = 'You are all set. Cross-list to Vinted, Depop and the rest from any item.';
  } else if (ext.installed) {
    tone = 'wait';
    title = signedIn ? 'Installed, linking to your account…' : 'Installed. Sign in to link it';
    detail = signedIn ? (ext.last_error ?? 'This takes a few seconds.') : (
      <>
        <Link to="/" className="font-semibold underline">
          Sign in
        </Link>{' '}
        in this browser and the extension links to your account by itself.
      </>
    );
  } else if (checking) {
    tone = 'wait';
    title = 'Looking for the extension…';
  } else {
    title = 'Not detected in this browser';
    detail = 'Follow the steps below, then refresh this page.';
  }

  const Icon = tone === 'good' ? CheckCircle2 : PlugZap;
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="extension-status"
      className={cx(
        'mt-6 flex items-start gap-3 rounded-xl border-2 p-4',
        tone === 'good' ? 'border-[#1fa36b] bg-[#1fa36b]/10' : tone === 'wait' ? 'border-sticker bg-sticker/30' : 'border-dashed border-line',
      )}
    >
      <Icon className={cx('mt-0.5 size-6 shrink-0', tone === 'good' && 'text-[#1fa36b]')} aria-hidden />
      <div className="min-w-0">
        <p className="font-display text-xl font-bold">
          {title}
          {tone === 'good' ? ' ✓' : ''}
        </p>
        {detail && <p className="mt-0.5 text-sm text-ink-2">{detail}</p>}
        {ext.installed && ext.version && (
          <p className="mt-1 text-xs text-muted">
            Version {ext.version}
            {outdated ? `. Version ${EXTENSION_VERSION} is out: download it below and reload the extension.` : ''}
          </p>
        )}
      </div>
    </div>
  );
}

function ChromeSteps({ pages, browser }: { pages: string; browser: Browser }) {
  const name = browser === 'edge' ? 'Edge' : browser === 'brave' ? 'Brave' : 'Chrome';
  return (
    <Paper className="mt-8 p-5 sm:p-6">
      <h2 className="font-display text-2xl font-bold">Install in {name}</h2>
      <ol className="mt-4 flex flex-col gap-4">
        <Step n={1}>
          <strong>Download</strong> the Chrome, Edge or Brave zip above.
        </Step>
        <Step n={2}>
          <strong>Unzip it.</strong> On a Mac, double-click the zip. On Windows, right-click it and choose <em>Extract All</em>. You
          get a folder called <code>pilego-extension-chrome</code>. Move it somewhere it can stay, like Documents: {name} loads the
          extension from that folder, so do not delete it.
        </Step>
        <Step n={3}>
          <strong>Open {pages}</strong> in a new tab. Paste it into the address bar; browsers do not allow a direct link.
          <CopyText text={pages} />
        </Step>
        <Step n={4}>
          <strong>Turn on Developer mode</strong> with the switch {browser === 'edge' ? 'in the left-hand menu' : 'in the top right corner'}.
        </Step>
        <Step n={5}>
          <strong>Click Load unpacked</strong> and choose the <code>pilego-extension-chrome</code> folder from step 2.
        </Step>
        <Step n={6}>
          <strong>Pin it.</strong> Click the puzzle-piece icon next to the address bar and the pin beside pileGo, so you can see
          when it has work waiting.
        </Step>
        <Step n={7}>
          <strong>Come back to this tab and refresh it.</strong> When you are signed in, the extension links to your account by
          itself and the box at the top turns green.
        </Step>
      </ol>
    </Paper>
  );
}

function FirefoxSteps() {
  return (
    <Paper className="mt-8 p-5 sm:p-6">
      <h2 className="font-display text-2xl font-bold">Install in Firefox</h2>
      <ol className="mt-4 flex flex-col gap-4">
        <Step n={1}>
          <strong>Download</strong> the Firefox zip above. You do not need to unzip it.
        </Step>
        <Step n={2}>
          <strong>Open about:debugging#/runtime/this-firefox</strong> in a new tab.
          <CopyText text="about:debugging#/runtime/this-firefox" />
        </Step>
        <Step n={3}>
          <strong>Click Load Temporary Add-on…</strong> and choose the zip you downloaded.
        </Step>
        <Step n={4}>
          <strong>Come back to this tab and refresh it.</strong> When you are signed in, the extension links to your account by
          itself.
        </Step>
      </ol>
      <p className="mt-4 rounded-lg bg-paper-2 p-3 text-sm text-ink-2">
        Firefox removes add-ons loaded this way when it restarts, so you repeat step 3 after each restart. For something that
        stays, use Chrome, Edge or Brave.
      </p>
    </Paper>
  );
}

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ink font-display font-bold text-paper" aria-hidden>
        {n}
      </span>
      <div className="min-w-0 pt-1 text-ink-2 [&_strong]:text-ink">{children}</div>
    </li>
  );
}

function CopyText({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="mt-2 flex flex-wrap items-center gap-2">
      <code className="rounded bg-paper-2 px-2 py-1 text-sm text-ink">{text}</code>
      <button
        type="button"
        className="btn btn-line btn-sm"
        onClick={() => {
          void navigator.clipboard
            ?.writeText(text)
            .then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 2000);
            })
            .catch(() => undefined);
        }}
      >
        <Copy className="size-4" aria-hidden />
        {copied ? 'Copied' : 'Copy'}
      </button>
    </span>
  );
}

function Trouble({ q, children }: { q: string; children: ReactNode }) {
  return (
    <div>
      <dt className="font-semibold text-ink">{q}</dt>
      <dd className="mt-0.5 text-ink-2">{children}</dd>
    </div>
  );
}
