# Running your own pileGo

This guide sets up pileGo for yourself, or for a few friends, on free tiers.
It takes about 30 minutes. You need Node 22 and pnpm 10 on your computer.

| Piece | Service | Free tier |
|---|---|---|
| Database, sign-in, photos, server functions | Supabase | 500 MB database, 1 GB photos, 500k function calls a month |
| AI scanning | Google Gemini | Daily free requests; a scan is one request |
| Web app | Cloudflare Pages (or Netlify, Vercel, any static host) | Unlimited static requests |
| Browser extension | Your own browser | Free |
| eBay (optional) | eBay developer program | Free |

## 1. Create a Supabase project

1. Sign up at [supabase.com](https://supabase.com) and create a project. Pick
   the region closest to you and save the database password somewhere safe.
2. Find the **project ref**. It is the id in the project URL:
   `https://supabase.com/dashboard/project/<ref>`.
3. Create an **access token** under Account > Access tokens. The deploy script
   uses it to set the project up over HTTPS.

## 2. Get a Gemini API key

Create a key in [Google AI Studio](https://aistudio.google.com/apikey). Without
it pileGo still works, but sellers fill in each item by hand.

## 3. Deploy the backend

From a clone of this repository:

```sh
pnpm install
export SUPABASE_ACCESS_TOKEN=…        # from step 1
export SUPABASE_PROJECT_REF=…         # from step 1
export GEMINI_API_KEY=…               # from step 2
node scripts/deploy.mjs
```

The script:

1. Applies the database migrations. It records each one in Supabase's own
   migration table, so the Supabase CLI agrees about what is applied.
2. Stores the project URL and service key in Supabase Vault. The scheduled eBay
   sync and job runner need them, and they never appear in the code.
3. Sets the function secrets you exported.
4. Points sign-in links at your app, when `PILEGO_APP_URL` is set.
5. Deploys the edge functions with the Supabase CLI, which needs no Docker.

It ends by writing `apps/web/.env.production.local` with your project URL and
anon key. Both are public values, meant for the browser.

Run it again whenever you pull a new version. Steps that are already done are
skipped. To run some steps only, pass `--only=migrations,functions`. To see what
it would do without changing anything, pass `--dry-run`.

### Sign-in emails

pileGo signs people in with a magic link. Supabase's built-in email sender
manages only a few emails an hour, which is enough to try pileGo. For more
people, add your own SMTP server under Authentication > Emails > SMTP Settings.
Resend and Brevo both have free plans.

## 4. Put the web app online

On Cloudflare Pages: Create > Pages > Connect to Git, choose your fork, and set:

| Setting | Value |
|---|---|
| Build command | `pnpm install --frozen-lockfile && pnpm --filter @pilego/web build` |
| Build output directory | `apps/web/dist` |
| Environment variable `VITE_SUPABASE_URL` | `https://<ref>.supabase.co` |
| Environment variable `VITE_SUPABASE_ANON_KEY` | the anon key the deploy script wrote |
| Environment variable `NODE_VERSION` | `22` |

Pages serves `index.html` for every path, which is what the app's routes need.

Once you know the app's address, run the deploy script once more with it:

```sh
PILEGO_APP_URL=https://your-app.pages.dev node scripts/deploy.mjs --only=secrets,auth
```

This allows sign-in links to land on your app. It also limits the server
functions to requests from your app.

## 5. The browser extension

Vinted, Depop, Poshmark, Mercari, Grailed and Facebook have no public API for
sellers, so the extension does that work from your own logged-in tabs. It also
reads eBay's public sold listings in your browser, for price suggestions.

You do not need to build it separately: the web app's build also builds the
extension and serves both zips from the app, at
`/downloads/pilego-extension-chrome.zip` and
`/downloads/pilego-extension-firefox.zip`. The app's `/extension` page has
download buttons, step-by-step instructions and a live check that the
extension is installed and linked. Settings links to it.

The extension trusts `https://pilego.app` and localhost out of the box. Set
`PILEGO_APP_ORIGINS` in your host's build environment (comma separated, for
example `https://your-app.pages.dev`) so it trusts your copy too. An app at any
other `*.pages.dev` address can only link after the seller approves it in the
extension's popup.

To build the zips on their own:

```sh
PILEGO_APP_ORIGINS=https://your-app.pages.dev pnpm --filter @pilego/extension build:zip
```

This writes `apps/extension/dist/pilego-extension-chrome.zip` and
`pilego-extension-firefox.zip`. Pushing a tag like `v0.2.0` also attaches both
zips to a GitHub release; set the repository variable `PILEGO_APP_ORIGINS`
under Settings > Secrets and variables > Actions > Variables for your origin.

To install it:

- **Chrome, Edge, Brave:** unzip it, open `chrome://extensions`, turn on
  Developer mode, choose Load unpacked, and pick the unzipped folder. Keep the
  folder: the browser loads the extension from it.
- **Firefox:** open `about:debugging#/runtime/this-firefox` and choose Load
  Temporary Add-on. Firefox removes temporary add-ons when it restarts. To keep
  it, sign the zip at addons.mozilla.org as an unlisted add-on.

Then open pileGo and sign in. The extension links itself to your account with
a one-time token and keeps its own session. If the app opened is not the one
you built it for, the toolbar icon shows **!**. Click it and choose Allow.

## 6. Connect eBay (optional)

eBay is the one marketplace with a public seller API, so it works without the
extension, even with your browser closed. [ebay-setup.md](ebay-setup.md) walks
through eBay's developer portal screen by screen, written for pilego.app;
swap in your own project ref and app address.

1. Join the [eBay developer program](https://developer.ebay.com) and create a
   **production** keyset.
2. Under User Tokens, add a redirect URL name (RuName). Set its fields:
   - **Auth accepted URL:** `https://<ref>.supabase.co/functions/v1/ebay-connect`
   - **Auth declined URL:** the same address
   - **Privacy policy URL:** `https://your-app.pages.dev/privacy`
3. Under Alerts & Notifications > Marketplace account deletion, make up a
   verification token of 32 to 80 letters and digits. Set the endpoint to
   `https://<ref>.supabase.co/functions/v1/ebay-account-deletion`. eBay
   requires this before a production keyset works.
4. Deploy the keys:

   ```sh
   EBAY_CLIENT_ID=… EBAY_CLIENT_SECRET=… EBAY_RU_NAME=… EBAY_VERIFICATION_TOKEN=… \
   node scripts/deploy.mjs --only=secrets
   ```

   Do this before you save the endpoint in eBay's portal, because eBay checks
   it straight away.
5. In pileGo, open Settings > eBay > Connect. Add the postcode your items ship
   from.

To test against eBay's sandbox, set `EBAY_ENV=sandbox` and use sandbox keys.

## Troubleshooting

**The app says it is not set up.** The web build had no `VITE_SUPABASE_URL` or
`VITE_SUPABASE_ANON_KEY`. Set both in your host's environment variables, then
rebuild.

**The sign-in link opens the wrong site.** Run the deploy script with
`PILEGO_APP_URL` and `--only=auth`.

**Scans come back empty.** Check that `GEMINI_API_KEY` is set. In Supabase, go
to Edge Functions > scan-item > Logs for the error.

**The extension says "Not linked yet".** Open pileGo in the same browser and
sign in. If the toolbar icon shows **!**, approve the app in the popup.

**Vinted jobs wait.** Vinted work needs a Vinted tab in which you are logged
in. pileGo opens one in the background when you press Run now in the popup, or
when you cross-list from the app. After a rate limit or a bot check, the
extension pauses Vinted for 15 minutes to 6 hours. The popup says how long.

**eBay sales are not showing up.** The scheduled sync needs the Vault secrets
from step 3, and runs every 10 minutes. Run `node scripts/deploy.mjs
--only=vault`, or press Check for sales now in Settings.
