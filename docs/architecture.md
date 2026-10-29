# How pileGo fits together

```
                 ┌────────────────────────── Supabase ───────────────────────────┐
                 │  Postgres + row-level security    Storage: photos bucket       │
 Web app ───────►│  RPCs: queue_publish, record_sale, claim_jobs, finish_job …    │
 (React PWA)     │  Edge functions: scan-item, price-comps, jobs, ebay-connect,   │
   ▲             │  ebay-sync, extension-link, ebay-account-deletion              │
   │ window      │  pg_cron: eBay sync, server jobs, pruning                      │
   │ messages    └──────▲───────────────────────────────▲────────────────────────┘
   ▼                    │ its own session                │ official API
 Extension ─────────────┘                                │
 (MV3 worker) ── Vinted tab: Vinted's web endpoints      eBay
             └── Depop, Poshmark, Mercari, Grailed tabs: fill the sell form
```

## Packages

| Path | What it is |
|---|---|
| `packages/core` | Shared TypeScript with no runtime dependencies. It holds the types, taxonomy, conditions, the per-marketplace listing generator, fees and pricing, analytics and SKUs. The web app, the extension and the edge functions all use it. `scripts/sync-core.mjs` copies it into `supabase/functions/_shared/core` for Deno, and CI checks that the copy is current. |
| `apps/web` | The app: React 19, React Router 7, TanStack Query, Tailwind 4 and motion, as an installable PWA. |
| `apps/extension` | The Chrome and Firefox extension, bundled with esbuild. |
| `supabase/migrations` | The schema, row-level security, RPCs, triggers and schedules. |
| `supabase/functions` | Deno edge functions. |
| `scripts/deploy.mjs` | Sets up a Supabase project over the Management API. |

## Data

- **items:** one row per physical piece, with photos in `item_photos`. Paths
  look like `{user}/{item}/{photo}.jpg`, with `-cut.webp` cutouts beside them.
- **listings:** one row per item per marketplace, with a status: draft,
  queued, publishing, listed, needs_action, failed, delisting, delisted or
  sold. Each row also stores the external id and URL, and the per-marketplace
  overrides in `payload`.
- **jobs:** the queue. Each job has a `runner`: `server` for eBay, `extension`
  for the rest. `claim_jobs` hands out work with `FOR UPDATE SKIP LOCKED`, so
  two browsers never run the same job. It also releases jobs that were left
  running for ten minutes. `finish_job` records the outcome and can schedule a
  retry.
- **events:** what analytics is built from. Triggers write `created`,
  `listed`, `price_changed`, `relisted`, `delisted` and `sold`.
- **marketplace_accounts**, **marketplace_secrets**, **marketplace_mappings:**
  connection status, eBay tokens and learned ids. The browser can see account
  status but never the tokens. The learned ids include Vinted catalog and
  brand ids.

Every table has row-level security keyed on `auth.uid()`. The marketplace
secrets table has no policies at all, so only the service role can read it.

## What happens on a sale

`record_sale(listing)` marks the listing and the item sold and writes the
event. Then `take_down_others` works through the item's other listings:

- Queued listings go back to draft.
- Listings on marketplaces pileGo can end get a `delist` job.
- Historical listings on unsupported marketplaces are flagged for the seller
  to remove by hand.

If a second marketplace reports a sale after the first, that listing is flagged
with both sales named, so the seller can cancel one order.
`record_offline_sale(item)` does the same for sales made in person.

## The extension

The extension's background worker keeps its **own** Supabase session. The app
asks the `extension-link` function for a one-time magic-link token hash for the
signed-in user and posts it to the extension. The extension redeems it with
`verifyOtp`. Sharing the app's session would not work: Supabase rotates refresh
tokens and treats a reused one as theft.

The extension trusts app origins set at build time. Any other origin the
content script runs on, such as another `*.pages.dev` site, can only link
after the seller approves it in the popup. Until then that origin learns only
that the extension is installed.

The worker claims waiting jobs when the app cross-lists, when the seller
presses Run now, when the browser starts, and every two minutes. It opens a
Vinted tab in the background and the sell-form tabs for the assisted
marketplaces as it needs them, so a cross-list the app asked for while the
extension was asleep or reloading still goes up. A poke that arrives during a
run is picked up as soon as that run ends.

- **Vinted** (`src/vinted`). The engine is adapted from Bumpline. It runs in
  the Vinted tab and sends requests through a small script in the page's own
  context. To publish, it does the following:
  1. Uploads the photos.
  2. Creates a private draft.
  3. Sends the full draft to `/completion`.

  Catalog, brand, size and colour ids come from Vinted's own lists, and pileGo
  remembers them for next time. When a category cannot be matched with
  confidence, the draft stays on Vinted and the seller finishes it there.
  Relisting creates the new draft before deleting the old listing. Writes are
  paced and capped per hour and per day. A 429 or a bot check pauses Vinted for
  15 minutes to 6 hours, doubling with each refusal in a day.
- **Assisted sites** (`src/assist`). Each site has known selectors. Every field
  falls back to matching on its label, name or placeholder. Values go through
  the native value setter, so React and Vue forms notice them. Photos go into
  the site's own file input with a `DataTransfer`. A panel inside a shadow root
  lists the remaining fields with copy buttons. The listing counts as posted
  when the tab reaches the site's listing URL, or when the seller presses "I've
  posted it".
- **Sold prices** (`src/bg/comps.ts`). When the app asks, the worker reads
  eBay's public sold-listings search for the seller's region from the
  seller's own browser, since eBay's sold-price API is closed and its pages
  refuse servers. It reads titles, sold prices and links from both of eBay's
  result layouts, skips ranges and accepted offers, waits ten seconds between
  searches and keeps each for six hours.
- **Sales.** For Vinted, the worker reads the seller's wardrobe and treats
  closed items as sold. For Depop, Poshmark, Mercari and Grailed, it reads each
  live listing's public page. It looks for schema.org availability first, then
  each site's own markers.

## Server jobs and schedules

pg_cron calls two edge functions on schedules, using the Vault secrets that
the deploy script stores:

- **`ebay-sync`**, every 10 minutes. It checks eBay orders.
- **`jobs`**, every 10 minutes, offset by 5. It runs server jobs: publish,
  relist, delist and price changes on eBay through the Inventory API.

The web app also calls `jobs` right after queueing eBay work, so nobody waits
for the schedule.

## AI

`scan-item` sends up to 12 photos to Gemini Flash with a strict JSON schema.
The result is checked against pileGo's own taxonomy before the seller sees it.
The provider sits behind one function in `_shared/ai.ts`. `price-comps` blends
three sources:

- The AI's range.
- Active eBay listings, through the Browse API, discounted because they are
  asking prices.
- The seller's own past sales.

## Photos from a phone

On a computer the scan page offers "Use my phone". It inserts a
`phone_sessions` row for the item being scanned and shows a QR code for
`/phone/<id>`. That page needs no sign-in: the random id, good for an hour, is
the only key. It shrinks each photo and posts it to `phone-capture`, which files
it under the owner's folder for the current item and adds a `phone_photos` row.
The computer picks the row up through Realtime (with a 4 second poll as a
backstop) and drops the photo into its slot. Saving moves the code on to the
next item; leaving the scan page deletes it. The QR code points at the tab's own
address, or `VITE_PUBLIC_APP_URL` when that is set, so a phone can only use it
when the app is on a real address, not `localhost`.

The background cutout runs in the browser with `@imgly/background-removal`,
so it costs nothing on the server.
