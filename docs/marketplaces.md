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

## Depop, Poshmark, Mercari, Grailed: Assisted

These sites' APIs are closed to individual sellers, and their sell forms
change often. The extension:

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
