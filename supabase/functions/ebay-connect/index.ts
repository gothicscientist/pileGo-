// Connect, configure and disconnect a seller's eBay account.
//
// POST { action: 'start', return_to }        → { url } to send the seller to eBay
// GET  ?code=…&state=…                       ← eBay's redirect after consent
// POST { action: 'settings', postal_code, country?, region? }
// POST { action: 'disconnect' }
// POST { action: 'status' }                  → { configured, setup, connected, account }
// GET  ?setup=1                              → which eBay settings the server has (no values)

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0';
import {
  consentUrl,
  ebay,
  ebayConfigured,
  ebaySetup,
  exchangeCode,
  saveTokens,
  signState,
  verifyState,
} from '../_shared/ebay.ts';
import { HttpError, json, readJson, serve } from '../_shared/http.ts';
import { adminClient, requireUser } from '../_shared/supabase.ts';

function redirect(url: string): Response {
  return new Response(null, { status: 302, headers: { Location: url } });
}

function withParam(url: string, key: string, value: string): string {
  const u = new URL(url);
  u.searchParams.set(key, value);
  return u.toString();
}

function safeReturn(url: string | undefined): string {
  const fallback = Deno.env.get('PILEGO_APP_URL') ?? 'http://localhost:5173';
  if (!url) return `${fallback}/settings`;
  try {
    const u = new URL(url);
    const allowed = (Deno.env.get('PILEGO_ALLOWED_ORIGINS') ?? '*').split(',').map(s => s.trim());
    if (allowed.includes('*') || allowed.includes(u.origin) || u.hostname === 'localhost') return u.toString();
  } catch {
    // fall through
  }
  return `${fallback}/settings`;
}

/** Record who connected: their eBay username and id (account-deletion notices name the id). */
async function finishConnect(admin: SupabaseClient, uid: string, accessToken: string): Promise<void> {
  let username: string | null = null;
  let ebayUserId: string | null = null;
  try {
    const me = await fetch(
      (Deno.env.get('EBAY_ENV') === 'sandbox' ? 'https://apiz.sandbox.ebay.com' : 'https://apiz.ebay.com') +
        '/commerce/identity/v1/user/',
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (me.ok) {
      const who = (await me.json()) as { username?: string; userId?: string };
      username = who.username ?? null;
      ebayUserId = who.userId ?? null;
    }
  } catch {
    // The username is a nicety.
  }

  const { data: existing } = await admin
    .from('marketplace_accounts')
    .select('meta')
    .eq('user_id', uid)
    .eq('marketplace', 'ebay')
    .maybeSingle();
  await admin.from('marketplace_accounts').upsert(
    {
      user_id: uid,
      marketplace: 'ebay',
      status: 'connected',
      username,
      // eBay's account-deletion notices name the user by id, so keep it.
      meta: { ...(existing?.meta ?? {}), ...(ebayUserId ? { ebay_user_id: ebayUserId } : {}) },
      last_error: null,
      connected_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,marketplace' },
  );
}

serve(async req => {
  const url = new URL(req.url);

  if (req.method === 'GET' && url.searchParams.has('setup')) {
    return json(req, { configured: ebayConfigured(), setup: ebaySetup() });
  }

  // eBay sends the seller back here after the consent screen, with a code,
  // or without one when they declined. Either way they land back in the app.
  if (req.method === 'GET') {
    const state = url.searchParams.get('state');
    if (!state) return redirect(withParam(safeReturn(undefined), 'ebay', 'declined'));
    let target: { uid: string; return_to: string };
    try {
      target = await verifyState(state);
    } catch {
      return redirect(withParam(safeReturn(undefined), 'ebay', 'expired'));
    }
    const { uid, return_to } = target;
    const code = url.searchParams.get('code');
    if (!code) return redirect(withParam(return_to, 'ebay', 'declined'));

    const admin = adminClient();
    try {
      const tokens = await exchangeCode(code);
      await saveTokens(admin, uid, tokens);
      await finishConnect(admin, uid, tokens.access_token);
    } catch (err) {
      console.error('eBay connect failed', err);
      return redirect(withParam(return_to, 'ebay', 'error'));
    }
    return redirect(withParam(return_to, 'ebay', 'connected'));
  }

  if (req.method !== 'POST') throw new HttpError(405, 'Use POST.');
  const { user } = await requireUser(req);
  const body = await readJson<{
    action: 'start' | 'settings' | 'disconnect' | 'status' | 'policies';
    return_to?: string;
    postal_code?: string;
    country?: string;
    region?: string;
    fulfillment_policy_id?: string;
    payment_policy_id?: string;
    return_policy_id?: string;
  }>(req);
  const admin = adminClient();

  switch (body.action) {
    case 'status': {
      const { data } = await admin
        .from('marketplace_accounts')
        .select('status, username, meta, last_sync_at, last_error')
        .eq('user_id', user.id)
        .eq('marketplace', 'ebay')
        .maybeSingle();
      return json(req, {
        configured: ebayConfigured(),
        setup: ebaySetup(),
        connected: data?.status === 'connected',
        account: data ?? null,
      });
    }
    case 'start': {
      if (!ebayConfigured()) {
        throw new HttpError(503, 'eBay is not set up on this server yet. Add EBAY_CLIENT_ID, EBAY_CLIENT_SECRET and EBAY_RU_NAME to the function secrets.');
      }
      const state = await signState({ uid: user.id, return_to: safeReturn(body.return_to) });
      return json(req, { url: consentUrl(state) });
    }
    case 'settings': {
      const { data } = await admin
        .from('marketplace_accounts')
        .select('meta')
        .eq('user_id', user.id)
        .eq('marketplace', 'ebay')
        .maybeSingle();
      if (!data) throw new HttpError(404, 'Connect eBay first.');
      const meta = { ...(data.meta as Record<string, unknown>) };
      if (body.postal_code !== undefined) {
        meta.postal_code = body.postal_code.trim().slice(0, 12);
        delete meta.location_key;
      }
      if (body.country) meta.country = body.country.slice(0, 2).toUpperCase();
      if (body.region) meta.region = body.region;
      for (const key of ['fulfillment_policy_id', 'payment_policy_id', 'return_policy_id'] as const) {
        if (body[key] !== undefined) meta[key] = body[key] || undefined;
      }
      await admin.from('marketplace_accounts').update({ meta }).eq('user_id', user.id).eq('marketplace', 'ebay');
      return json(req, { ok: true, meta });
    }
    case 'policies': {
      const { getUserToken, siteFor } = await import('../_shared/ebay.ts');
      const { data: account } = await admin
        .from('marketplace_accounts')
        .select('meta')
        .eq('user_id', user.id)
        .eq('marketplace', 'ebay')
        .maybeSingle();
      const { data: profile } = await admin.from('profiles').select('region').eq('id', user.id).maybeSingle();
      const site = siteFor(((account?.meta as Record<string, string>)?.region) ?? profile?.region);
      const token = await getUserToken(admin, user.id);
      const q = { marketplace_id: site.marketplace_id };
      const [f, p, r] = await Promise.all([
        ebay<{ fulfillmentPolicies?: Array<{ fulfillmentPolicyId: string; name: string }> }>({ path: '/sell/account/v1/fulfillment_policy', token, query: q }),
        ebay<{ paymentPolicies?: Array<{ paymentPolicyId: string; name: string }> }>({ path: '/sell/account/v1/payment_policy', token, query: q }),
        ebay<{ returnPolicies?: Array<{ returnPolicyId: string; name: string }> }>({ path: '/sell/account/v1/return_policy', token, query: q }),
      ]);
      return json(req, {
        fulfillment: (f.fulfillmentPolicies ?? []).map(x => ({ id: x.fulfillmentPolicyId, name: x.name })),
        payment: (p.paymentPolicies ?? []).map(x => ({ id: x.paymentPolicyId, name: x.name })),
        returns: (r.returnPolicies ?? []).map(x => ({ id: x.returnPolicyId, name: x.name })),
      });
    }
    case 'disconnect': {
      await admin.from('marketplace_secrets').delete().eq('user_id', user.id).eq('marketplace', 'ebay');
      await admin
        .from('marketplace_accounts')
        .update({ status: 'disconnected' })
        .eq('user_id', user.id)
        .eq('marketplace', 'ebay');
      return json(req, { ok: true });
    }
    default:
      throw new HttpError(400, 'Unknown action.');
  }
});
