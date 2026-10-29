// The pileGo extension's background worker: holds the session, runs the
// extension's jobs, checks for sales, and answers the web app and the popup.

import { errorText, ext } from './shared/browser.ts';
import type { AssistReport, ExtStatus } from './shared/messages.ts';
import { readBlock } from './shared/pace.ts';
import { authed, config, dropPendingLink, holdLink, isTrusted, pendingLink, redeem, unlink, type LinkRequest } from './bg/session.ts';
import { ASSIST_MARKETS, forgetTab, noteProgress, noteVintedTab, onAssistReport, onTabClosed, onTabUrl, runQueue, state, waitingCount } from './bg/jobs.ts';
import { soldComps } from './bg/comps.ts';
import { importVinted, syncSales } from './bg/sync.ts';
import { openTabs, VINTED_TABS } from './bg/tabs.ts';

declare const __VERSION__: string;

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

async function status(origin: string | null): Promise<ExtStatus> {
  const trusted = origin ? await isTrusted(origin) : true;
  const pending = await pendingLink();
  const needsApproval = Boolean(pending && origin && pending.origin === origin);
  if (!trusted) {
    // An app pileGo has not been told to trust learns only that it is here.
    return { installed: true, version: __VERSION__, tabs: {}, running: 0, linked: false, user_id: null, needs_approval: needsApproval, last_error: null, last_message: null };
  }
  const session = await authed().catch(() => null);
  const tabs: Record<string, boolean> = {};
  for (const m of ['vinted', ...ASSIST_MARKETS] as const) tabs[m] = (await openTabs(m)).length > 0;
  const block = await readBlock('vinted');
  return {
    installed: true,
    version: __VERSION__,
    tabs,
    running: state.running.size,
    linked: Boolean(session),
    user_id: session?.cfg.user_id ?? null,
    needs_approval: needsApproval,
    last_error: state.lastError ?? (block ? 'Vinted is paused for a while after refusing a request.' : null),
    last_message: state.lastMessage,
  };
}

const appTabs = new Map<number, string>();

async function broadcast() {
  for (const [tabId, origin] of appTabs) {
    ext.tabs.sendMessage(tabId, { type: 'app:status', status: await status(origin) }).catch(() => appTabs.delete(tabId));
  }
  await badge();
}

async function badge() {
  const pending = await pendingLink();
  if (pending) {
    await ext.action.setBadgeText({ text: '!' });
    await ext.action.setBadgeBackgroundColor({ color: '#FF4F9A' });
    return;
  }
  const session = await authed().catch(() => null);
  const n = session ? await waitingCount(session.sb).catch(() => 0) : 0;
  await ext.action.setBadgeText({ text: n ? String(n) : '' });
  await ext.action.setBadgeBackgroundColor({ color: '#2B3FE8' });
  await ext.action.setTitle({ title: n ? `pileGo: ${n} listing${n === 1 ? '' : 's'} ready to fill in. Click Run now.` : 'pileGo' });
}

// ---------------------------------------------------------------------------
// Work
// ---------------------------------------------------------------------------

async function run(interactive: boolean) {
  const session = await authed().catch(() => null);
  if (!session) return;
  try {
    await runQueue(session.sb, interactive);
  } catch (err) {
    state.lastError = errorText(err);
  }
  await broadcast();
}

async function sync(interactive: boolean) {
  const session = await authed().catch(() => null);
  if (!session) return;
  try {
    const r = await syncSales(session.sb, interactive);
    state.lastMessage = r.sales ? `Found ${r.sales} new sale${r.sales === 1 ? '' : 's'}.` : `Checked ${r.checked} listings, no new sales.`;
    if (r.notes.length) state.lastError = r.notes[0]!;
    // Sales queue delists on the other marketplaces; run the ones that can go now.
    if (r.sales) await runQueue(session.sb, false);
  } catch (err) {
    state.lastError = errorText(err);
  }
  await broadcast();
}

async function importWardrobe() {
  const session = await authed().catch(() => null);
  if (!session) return;
  try {
    state.lastMessage = 'Importing your Vinted wardrobe…';
    await broadcast();
    const r = await importVinted(session.sb, session.cfg.user_id);
    state.lastMessage = `Imported ${r.imported} item${r.imported === 1 ? '' : 's'} from Vinted.`;
    state.lastError = null;
  } catch (err) {
    state.lastError = errorText(err);
  }
  await broadcast();
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

type Msg = { type: string; [key: string]: unknown };

async function onApp(msg: Msg, origin: string, tabId: number | undefined) {
  if (tabId != null) appTabs.set(tabId, origin);
  const trusted = await isTrusted(origin);
  if (msg.type === 'app:sold-comps') {
    // Reading eBay's public search needs no account, but only apps the seller
    // trusts may make the browser do it.
    if (!trusted) return { comps: null, error: 'Approve this copy of pileGo in the extension first.' };
    const { query, region } = (msg.payload ?? {}) as { query?: string; region?: string };
    return soldComps(String(query ?? ''), region);
  }
  switch (msg.type) {
    case 'app:link': {
      const req = msg.payload as LinkRequest;
      if (!trusted) {
        await holdLink(origin, req);
        await badge();
        break;
      }
      const current = await config();
      const session = await authed().catch(() => null);
      if (session && current?.user_id === req.user_id && current.supabase_url === req.supabase_url) break;
      try {
        await redeem(origin, req);
        state.lastError = null;
        void run(false);
      } catch (err) {
        state.lastError = errorText(err);
      }
      break;
    }
    case 'app:run-jobs':
      if (trusted) void run(true);
      break;
    case 'app:sync':
      if (trusted) void sync(true);
      break;
    case 'app:import':
      if (trusted) void importWardrobe();
      break;
  }
  return status(origin);
}

async function onPopup(msg: Msg) {
  switch (msg.type) {
    case 'popup:approve': {
      const pending = await pendingLink();
      if (pending) {
        try {
          await redeem(pending.origin, pending);
          state.lastError = null;
        } catch (err) {
          state.lastError = errorText(err);
          await dropPendingLink();
        }
      }
      break;
    }
    case 'popup:deny':
      await dropPendingLink();
      break;
    case 'popup:run':
      await run(true);
      break;
    case 'popup:sync':
      await sync(true);
      break;
    case 'popup:unlink':
      await unlink();
      break;
  }
  await broadcast();
  const cfg = await config();
  return { status: await status(null), pending: await pendingLink(), email: cfg?.email ?? null, app_url: cfg?.app_url ?? null };
}

const seenTokens: { csrf: string | null; anon: string | null } = { csrf: null, anon: null };

ext.runtime.onMessage.addListener((raw: unknown, sender, reply) => {
  const msg = raw as Msg;
  if (!msg || typeof msg.type !== 'string') return false;
  const origin = sender.origin ?? (sender.url ? new URL(sender.url).origin : null);

  if (msg.type.startsWith('app:') && origin && sender.tab) {
    onApp(msg, origin, sender.tab.id).then(reply, err => reply({ error: errorText(err) }));
    return true;
  }
  if (msg.type.startsWith('popup:') && sender.id === ext.runtime.id && !sender.tab) {
    onPopup(msg).then(reply, err => reply({ error: errorText(err) }));
    return true;
  }
  if (msg.type === 'vinted:hello' && sender.tab?.id != null) {
    noteVintedTab(sender.tab.id, String(msg.site), Boolean(msg.logged_in));
    // A Vinted tab just opened: anything waiting for one can go.
    void run(false);
    return false;
  }
  if (msg.type === 'vinted:tokens') {
    reply(seenTokens);
    return false;
  }
  if (msg.type === 'assist:progress') {
    // Also keeps this worker awake while a form fills.
    noteProgress(String(msg.job_id), String(msg.step));
    state.lastMessage = String(msg.step);
    return false;
  }
  if (msg.type.startsWith('assist:') && sender.tab) {
    authed()
      .then(s => s && onAssistReport(s.sb, msg as unknown as AssistReport, sender.tab?.url ?? null))
      .then(broadcast)
      .finally(() => reply({ ok: true }));
    return true;
  }
  return false;
});

// The security token Vinted's own requests carry, for when the page markup has none.
ext.webRequest.onBeforeSendHeaders.addListener(
  details => {
    for (const h of details.requestHeaders ?? []) {
      const name = h.name.toLowerCase();
      if (name === 'x-csrf-token' && h.value) seenTokens.csrf = h.value;
      if (name === 'x-anon-id' && h.value) seenTokens.anon = h.value;
    }
    return undefined;
  },
  { urls: VINTED_TABS.map(p => p.replace(/\/\*$/, '/api/*')) },
  ['requestHeaders'],
);

ext.tabs.onUpdated.addListener((tabId, info) => {
  if (!info.url) return;
  void authed().then(s => s && onTabUrl(s.sb, tabId, info.url!).then(broadcast));
});

ext.tabs.onRemoved.addListener(tabId => {
  appTabs.delete(tabId);
  forgetTab(tabId);
  void onTabClosed(tabId);
});

// ---------------------------------------------------------------------------
// Timers
// ---------------------------------------------------------------------------

function schedule() {
  ext.alarms.create('jobs', { periodInMinutes: 2 });
  ext.alarms.create('sales', { periodInMinutes: 30, delayInMinutes: 1 });
}

// Listings go up by themselves: the timer picks up anything still waiting,
// such as a cross-list the app asked for while the extension was reloading.
function startup() {
  schedule();
  void run(true);
}

ext.runtime.onInstalled.addListener(startup);
ext.runtime.onStartup.addListener(startup);
ext.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'jobs') void run(true);
  if (alarm.name === 'sales') void sync(false);
});

void badge();
