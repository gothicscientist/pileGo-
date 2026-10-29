// eBay's marketplace account deletion notifications, which eBay requires
// before a production keyset can be used.
//
// GET  ?challenge_code=…  → { challengeResponse } proving this endpoint is ours
// POST { notification: { data: { username, userId } } } → forget that eBay account
//
// pileGo keeps an eBay account's tokens, username and id. When eBay says the
// account was deleted, the tokens and the connection go; the seller's own
// items and listings stay, since they belong to the pileGo account.

import { HttpError, env, serve } from '../_shared/http.ts';
import { adminClient } from '../_shared/supabase.ts';

function endpoint(): string {
  return `${env('SUPABASE_URL').replace(/\/+$/, '')}/functions/v1/ebay-account-deletion`;
}

async function sha256hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

serve(async req => {
  const url = new URL(req.url);
  if (req.method === 'GET') {
    const code = url.searchParams.get('challenge_code');
    if (!code) throw new HttpError(400, 'Missing challenge_code.');
    const challengeResponse = await sha256hex(code + env('EBAY_VERIFICATION_TOKEN') + endpoint());
    return new Response(JSON.stringify({ challengeResponse }), { headers: { 'content-type': 'application/json' } });
  }
  if (req.method !== 'POST') throw new HttpError(405, 'Use GET or POST.');

  const body = (await req.json().catch(() => null)) as { notification?: { data?: { username?: string; userId?: string } } } | null;
  const data = body?.notification?.data;
  if (!data?.username && !data?.userId) return new Response(null, { status: 204 });

  const admin = adminClient();
  let query = admin.from('marketplace_accounts').select('user_id').eq('marketplace', 'ebay');
  const filters = [
    data.username ? `username.eq.${JSON.stringify(data.username)}` : null,
    data.userId ? `meta->>ebay_user_id.eq.${JSON.stringify(data.userId)}` : null,
  ].filter(Boolean);
  query = query.or(filters.join(','));
  const { data: rows, error } = await query;
  if (error) throw new HttpError(500, error.message);

  for (const { user_id } of rows ?? []) {
    await admin.from('marketplace_secrets').delete().eq('user_id', user_id).eq('marketplace', 'ebay');
    await admin
      .from('marketplace_accounts')
      .update({ status: 'disconnected', username: null, meta: {}, last_error: 'eBay told pileGo this eBay account was deleted.' })
      .eq('user_id', user_id)
      .eq('marketplace', 'ebay');
  }
  return new Response(null, { status: 204 });
});
