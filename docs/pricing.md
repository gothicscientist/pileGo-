# How pileGo prices an item

pileGo prices a piece the way an appraiser prices a house: from comparable
sales. The code is `suggestPrice` in `packages/core/src/pricing.ts`; the
picker that shows it is `apps/web/src/components/PricePicker.tsx`.

## Where the comparables come from

| Marketplace | What it gives | Read by |
| --- | --- | --- |
| eBay | Sold prices, sale date, condition | The extension, from eBay's public sold search (`LH_Sold=1`). eBay refuses servers. |
| Poshmark | Sold prices, sale date, listing date, condition, size | The extension, and the server when the extension sent none. The search page carries its results as JSON. |
| Mercari | Sold prices, size | The extension, from a search tab it opens in the background (`itemStatuses=2`). Mercari draws results in the page and refuses servers. |
| Depop | Live asking prices | The extension, from a background search tab. Depop's search does not show sales. |
| eBay (live) | Asking prices | The server, through eBay's Browse API, once eBay keys are set. |
| Your own sales | Sold prices | The server, from your sold items of the same brand and type. |
| The photo scan | A rough guess | Gemini, during the scan. Cut by 20%; it counts for little once there is market data. |

Grailed hides sold prices behind a login and Vinted does not show them, so
neither is read. Mercari and Depop are read in the United States only, and
Poshmark in the United States and Canada.

## How they are weighed

1. **Cleaning.** Comparables in another currency, bundles and lots, other
   letter sizes (when the size filter leaves enough), and prices far from the
   rest (outside 1.5 IQR, or more than 3x off the median) are left out.
2. **Similarity.** Each comparable counts by how many of the item's words
   (brand, title, type) its title shares: weight `(0.05 + share)^4`, so close
   matches dominate a broad search.
3. **Recency.** A sale counts half as much every 180 days, never less than a
   fifth.
4. **Condition.** A comparable's price moves 75% of the way toward this item's
   condition, using the values below.
5. **Blend.** The weighted median of sold prices is blended with live asking
   prices (cut 15%), your own sales and the photo scan, by how much of each
   there is.
6. **The three cards.** *Balanced* is the blend. *Likely to sell* and *Less
   likely* sit at the 20th and 75th weighted percentiles of the sold prices,
   as shares of the median, so they keep the spread of real sales. With too
   few sales they fall back to 0.8x and 1.2x.
7. **The hint.** A typed price above *Less likely* gets "Your price is high"
   with the price to come down to; one well below *Likely to sell* gets "on
   the low side".

## Calibration

The constants were fitted on 4,176 Poshmark sales from 87 searches across
brands and garment types (Levi's 501, Lululemon Align, Patagonia Better
Sweater, Carhartt, Free People, Zara, Talbots and so on), fetched on
29 October 2026. Each sale was priced from the other sales in its search,
leaving itself out.

Condition values, the median price by condition next to "excellent" within a
search:

| Condition | Value |
| --- | --- |
| New with tags | 1.30 |
| New without tags | 1.05 |
| Excellent | 1.00 |
| Good | 0.91 |
| Fair | 0.70 |

Leave-one-out results:

| | Median error | Within ±25% |
| --- | --- | --- |
| Previous pricing | 36.0% | 39.9% |
| This pricing | 33.3% | 41.4% |
| This pricing, only 8 comparables | 40.0% | 36.0% |
| This pricing, only 16 comparables | 37.1% | 38.6% |

Two things follow. Secondhand prices scatter a lot even within one search,
so no method gets most sales within a few dollars; the cards show that
spread instead of hiding it. And the number of comparables matters more than
any weighting, which is why pileGo reads four marketplaces rather than one.

The cards are calibrated: 27% of held-out sales sold at or below *Likely to
sell*, 54% at or below *Balanced* and 74% at or below *Less likely*.
