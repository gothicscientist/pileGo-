// Give the browser extension a session of its own.
//
// POST (signed in) → { token_hash, email }
//
// The app and the extension must not share one refresh token: Supabase rotates
// refresh tokens and treats a reused one as theft, which would sign both out.
// Instead the app asks for a one-time magic-link token for the caller's own
// email and hands it to the extension, which redeems it with verifyOtp and
// starts an independent session. No email is sent.

import { HttpError, json, serve } from '../_shared/http.ts';
import { adminClient, requireUser } from '../_shared/supabase.ts';

serve(async req => {
  if (req.method !== 'POST') throw new HttpError(405, 'Use POST.');
  const { user } = await requireUser(req);
  if (!user.email) throw new HttpError(400, 'This account has no email address to link with.');
  const { data, error } = await adminClient().auth.admin.generateLink({ type: 'magiclink', email: user.email });
  if (error || !data?.properties?.hashed_token) {
    throw new HttpError(500, `Could not link the extension: ${error?.message ?? 'no token returned'}`);
  }
  return json(req, { token_hash: data.properties.hashed_token, email: user.email });
});
