# Marketplace support, site by site

pileGo tells you how it reaches each marketplace, and this page gives the
details. Where a marketplace offers no seller API, pileGo works through your
own logged-in browser, at a pace a person could keep. It never stores your
marketplace passwords.

## eBay: Automatic

- **Listing:** uses the official Sell Inventory API. pileGo creates an
  inventory item and an offer, then publishes it. The category comes from
  eBay's Taxonomy API, and the item specifics come from the item's details.
  Shipping, payment and return policies are your own; pileGo creates simple
  ones if you have none.
- **Ending and relisting:** relisting withdraws the offer and publishes a fresh
  one. Listings imported from eBay end through the Trading API.
- **Sales:** the Fulfillment API is checked every 10 minutes.
- **Import:** brings in your active listings.
- **Price comparisons:** active listings from the Browse API. eBay restricts its
  sold-price API, so asking prices are discounted in the blend.

## Vinted: One click

Vinted has no public seller API. The extension calls the same web endpoints
Vinted's own upload form uses, from a Vinted tab where you are logged in. The
engine comes from [Bumpline](../CREDITS.md#bumpline), a relister tested on
real Vinted accounts.

- **Listing** works like this:
  1. Upload the photos.
  2. Create a private draft.
  3. Complete the draft.

  pileGo looks up the catalog, brand, size and colours in Vinted's own lists
  and remembers what it learned. When it cannot match a category with
  confidence, it saves the draft on Vinted and asks you to finish it there.
  Once you publish the draft, the next sync links it back.
- **Relisting:** creates the new draft first, then deletes the old listing,
  then publishes. The new listing goes to the top of search, and the draft is
  a safety net if anything fails part way.
- **Taking down:** deletes the listing.
- **Price changes:** uses the edit endpoint. If Vinted refuses, pileGo asks you
  to change the price on Vinted.
- **Sales and import:** both read your wardrobe. Sold items are recorded, and
  importing creates pileGo items with photos for listings pileGo does not
  have yet.
- **Pace:**
  - Pauses of about a second or two between steps.
  - About ten seconds between listings.
  - At most 8 new or relisted items an hour and 40 a day.
  - A rate limit or bot check stops all Vinted work for 15 minutes to 6 hours.
    The pause doubles with each refusal in a day and honours Vinted's
    Retry-After.

## Depop and Poshmark: Auto-post

These sites' APIs are closed to individual sellers, so the extension works
their sell forms the way a person would, in the seller's logged-in tab. The
tab opens in front, because browsers throttle pages in background tabs.

- **Depop** (`apps/extension/src/assist/depop.ts`): photos (JPEG or PNG, up to
  8, checked and sent again if the page was still loading), description,
  category under the right MEN / WOMEN / KIDS heading, material, brand,
  condition, up to two colours (removing the colours Depop guesses from the
  photos), size, source, age, up to three styles, price and package size.
  Then Post. Worldwide shipping stays as you set it. Depop's prepaid labels
  are domestic only, so worldwide needs its own international price. If
  worldwide is on with the international price empty, pileGo turns it off.
  Menus close through their own toggle and blur. Sending Escape after picking
  a size can clear Downshift's selection and crash Depop's size handler into
  a 500 page, even though no request to post has been made.
- **Poshmark** (`apps/extension/src/assist/poshmark.ts`): photos and the
  cover-shot editor's Apply, title, description, department, category and
  subcategory, size (a custom size when it is not on the list), condition,
  brand, up to two colours, up to three style tags, and price through the price
  pop-up. Then Next and List This Item.

What to pick for each item is in `apps/extension/src/assist/choices.ts`:
source and age come from the item's era, styles and tags from its style tags,
era and materials, and package size from its category. A panel shows each step
and counts down for three seconds before posting, with a Stop button. If a
required field cannot be filled, or the site refuses the form, nothing is
posted: the listing is marked as needing you, the tab stays open with the
panel, and pressing "I've posted it" or posting from the tab settles it.

When the tab lands on the new listing, pileGo records it as live with its link.
After a redirect to your closet or feed, pileGo must find this item's listing
link before marking it live. A redirect alone can also mean a cancellation
or rejection. If no link is found, the item needs attention rather than
silently appearing live without evidence.

The app retains its List wake-up until the linked extension acknowledges it,
including across a refresh or initial account linking. Chrome's temporary
"Tabs cannot be edited right now" lock is retried for opening, navigating,
activating and closing tabs. Other tab errors are surfaced immediately.

When the sell page itself loads as a 500 error, pileGo loads a fresh form and
fills it again, up to three forms. After that it closes the tab and tries
again by itself in 10 minutes, up to four times, before handing the listing
to you. When Depop answers Post with a 500 (a "status code 500" toast),
pileGo presses it once more. If that fails too, the form goes to you: the
same form would get the same answer, and a Post that fails with a 500 can
still have gone through, so check your Depop listings before posting again.
Poshmark still presses List again up to three times, then fills fresh forms
as above; check for a double after a run like that.

No tab holds up the queue. A sell form gets 10 minutes to answer and a Vinted
request gets 5. Vinted jobs run before the sell forms. Each run of the queue
also settles listings whose tab was closed, or that nothing has heard from
since the fill should have ended, so nothing sits on "Listing…" for good.

## Mercari, Grailed: Assisted

The extension:

1. Opens the sell form in a new tab.
2. Adds your photos, up to each site's limit.
3. Fills in the title, description, price, brand and size where the form has
   them. The description includes hashtags on Depop. The original price is
   filled on Poshmark.
4. Shows a pileGo panel with every field and a copy button. Category,
   condition and other pickers stay with you, since each site builds them
   differently.

You press the site's own post button. When the tab lands on the new listing,
pileGo records it as live with its link. You can also press "I've posted it".

- **Sales:** pileGo checks each live listing's public page about every 30
  minutes while your browser is open. It reads schema.org availability first,
  then each site's own markers.
These also apply to Depop and Poshmark:

- **Taking down after a sale elsewhere:** pileGo opens the listing with a panel
  that asks you to delete it or mark it sold. Then you press Done.
- **Relisting and import:** not supported on these sites yet.

## Facebook Marketplace: Assisted

The extension fills the create-item form in the same way. Facebook has no
public listing pages that pileGo could check reliably, so sales and taking
listings down are by hand. pileGo flags the listing when the item sells
elsewhere.

## Etsy and Vestiaire Collective: Listing kit

pileGo gives you text ready to copy, with photos to download or share, and a
link to the sell page. You press "Mark listed" once it is up. Etsy only allows
vintage items that are 20 years or older. Vestiaire wants designer pieces and
reviews them first.

## Adding a marketplace

1. Add it to `packages/core/src/marketplaces.ts` with its limits, fees and
   capabilities. The app, the cross-list sheet and the fee maths pick it up
   from there.
2. For an assisted site, add an adapter to `apps/extension/src/assist/sites.ts`
   with the sell page, the posted-listing URL and any known selectors. Then
   add its host to `assistMatches` in `apps/extension/build.mjs`.
3. For sales checks, add its markers to `apps/extension/src/shared/sold.ts`.
