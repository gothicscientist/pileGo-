# Credits

pileGo builds on three earlier projects.

## Bumpline

Bumpline is a one-click relister for Vinted, by g1ampy, licensed GPL-3.0-or-later.
pileGo's Vinted engine is adapted from it:

- the main-world fetch bridge (`apps/extension/static/bridge.js`)
- the CSRF token and anon id lookups
- the headers Vinted's upload form sends
- the draft-then-complete publish flow
- the size handling
- the pacing and back-off rules

GPL-3.0-or-later code may be used in an AGPL-3.0-or-later project. The adapted
files carry Bumpline's copyright notice alongside pileGo's.

## eBayOS

eBayOS is an eBay listing tool with a Poshmark cross-lister. The extension's
Poshmark selectors are taken from its `poshmark-content.js`, and so is the
photos-first fill order.

## closet-to-cash

closet-to-cash is a closet inventory app. It informed pileGo's item model and
its scan, review and list flow.

## Clothing photos

The garment cutouts and photos in `apps/web/src/assets/` (the sign-in page, empty
states and the demo closet used by the end-to-end tests) are real photographs.
None are AI generated or AI recreations. pileGo! cut the backgrounds out with
`@imgly/background-removal` (the same model the scan uses), cleaned the edges so
no white fringe is left, and cropped some.

### Shop product photos

Most pieces come from the product pages of [Lucid Blanks](https://lucidblanks.com)
(heavyweight hoodies, sweats, cargos, mesh shorts and selvedge jeans),
[Naked & Famous Denim](https://nakedandfamousdenim.com) (the selvedge jacket) and
[Onitsuka Tiger](https://www.onitsukatiger.com) (the Mexico 66 trainers), [Stüssy](https://www.stussy.com) (the graphic tee) and [HUF](https://www.hufworldwide.com) (the cargo shorts). These
photos belong to those brands. They are used here as placeholders for a demo
closet and have not been licensed; swap them before any commercial launch.

| File | Product | Source | Changes |
| --- | --- | --- | --- |
| `closet/banana-hoodie.webp` | [600 GSM 'Banana Milk' Core Hoodie](https://lucidblanks.com/products/600-gsm-banana-milk-core-hoodie) | [image](https://cdn.shopify.com/s/files/1/0748/8556/2674/files/Bananamilkhood1.png) | background removed |
| `closet/black-denim.webp` | ['Dusk' Denim (Washed Black)](https://lucidblanks.com/products/dusk-denim-washed-black) | [image](https://cdn.shopify.com/s/files/1/0748/8556/2674/files/duskdenimwashed1.png) | background removed |
| `closet/black-hoodie.webp` | [600 GSM 'Black' Classic Fit Hoodie](https://lucidblanks.com/products/600-gsm-black-classic-fit-hoodie) | [image](https://cdn.shopify.com/s/files/1/0748/8556/2674/files/blackclassichoodie4.png) | background removed |
| `closet/black-zip.webp` | [600 GSM 'Black' Classic Fit Zip-Up](https://lucidblanks.com/products/600-gsm-black-classic-fit-zip-up) | [image](https://cdn.shopify.com/s/files/1/0748/8556/2674/files/Classicblackzipuphoodie.png) | background removed |
| `closet/cabernet-hoodie.webp` | [600 GSM 'Cabernet' Core Hoodie](https://lucidblanks.com/products/600-gsm-cabernet-core-hoodie) | [image](https://cdn.shopify.com/s/files/1/0748/8556/2674/files/cabernethood1.png) | background removed |
| `closet/clay-hoodie.webp` | [600 GSM 'Clay' Core Hoodie](https://lucidblanks.com/products/600-gsm-clay-core-hoodie) | [image](https://cdn.shopify.com/s/files/1/0748/8556/2674/files/39.png) | background removed |
| `closet/coffee-longsleeve.webp` | [300 GSM 'Coffee' Long Sleeve Tee](https://lucidblanks.com/products/300-gsm-coffee-long-sleeve-tee) | [image](https://cdn.shopify.com/s/files/1/0748/8556/2674/files/lsbrownt.png) | background removed |
| `closet/cream-cargos.webp` | ['Payload' Flared Cargos (Cream)](https://lucidblanks.com/products/payload-flared-cargos-cream) | [image](https://cdn.shopify.com/s/files/1/0748/8556/2674/files/cargoscream1.png) | background removed |
| `closet/espresso-hoodie.webp` | [600 GSM 'Espresso' Core Hoodie](https://lucidblanks.com/products/600-gsm-espresso-core-hoodie) | [image](https://cdn.shopify.com/s/files/1/0748/8556/2674/files/Espressohood1.png) | background removed |
| `closet/grey-hoodie.webp` | [600 GSM 'Heather Grey' Classic Fit Hoodie](https://lucidblanks.com/products/600-gsm-heather-grey-classic-fit-hoodie) | [image](https://cdn.shopify.com/s/files/1/0748/8556/2674/files/Classic600gsmgreyhoodie.png) | background removed |
| `closet/grey-sweats.webp` | [600 GSM 'Heather Grey' Baggy Sweatpants](https://lucidblanks.com/products/600-gsm-heather-grey-baggy-sweatpants) | [image](https://cdn.shopify.com/s/files/1/0748/8556/2674/files/WideBaggy600gsmsweats.png) | background removed |
| `closet/lemon-hoodie.webp` | [600 GSM 'Lemonade' Core Hoodie](https://lucidblanks.com/products/600-gsm-lemonade-core-hoodie) | [image](https://cdn.shopify.com/s/files/1/0748/8556/2674/files/lemonade_hood_1_9d6d1b19-0cd4-48c0-8ca2-74781bf6ec94.png) | background removed |
| `closet/lilac-hoodie.webp` | [600 GSM 'Lilac' Core Hoodie](https://lucidblanks.com/products/600-gsm-lilac-core-hoodie-1) | [image](https://cdn.shopify.com/s/files/1/0748/8556/2674/files/flat_lay_lilac_01.png) | background removed |
| `closet/mesh-shorts.webp` | [Carolina Blue Baggy Mesh Shorts](https://lucidblanks.com/products/carolina-blue-baggy-mesh-shorts) | [image](https://cdn.shopify.com/s/files/1/0748/8556/2674/files/carolinabuebaggymeshshorts.png) | background removed |
| `closet/pine-hoodie.webp` | [600 GSM 'Pine' Core Hoodie](https://lucidblanks.com/products/600-gsm-pine-core-hoodie) | [image](https://cdn.shopify.com/s/files/1/0748/8556/2674/files/flat_lay_pine_green_01.png) | background removed |
| `closet/raw-selvedge.webp` | ['Veil' Raw Indigo Selvedge Denim](https://lucidblanks.com/products/veil-raw-selvedge-indigo-denim) | [image](https://cdn.shopify.com/s/files/1/0748/8556/2674/files/veil_d1231fdb-b6aa-4028-abba-4d62c9a193e7.png) | background removed |
| `closet/selvedge-jacket.webp` | [Denim Jacket - The Cat’s Pyjamas Selvedge - Unsanforized](https://nakedandfamousdenim.com/products/denim-jacket-the-cat-s-pajamas-selvedge-blue) | [image](https://cdn.shopify.com/s/files/1/0322/0537/files/164136264.jpg) | background removed |
| `closet/shroud-selvedge.webp` | ['Shroud' Washed Indigo Selvedge Denim](https://lucidblanks.com/products/shroud-washed-indigo-selvedge-denim) | [image](https://cdn.shopify.com/s/files/1/0748/8556/2674/files/shroud_1.png) | background removed |
| `closet/mexico66-yellow.webp` | Onitsuka Tiger Mexico 66 (yellow), style 1183C102.751 | [image](https://asics.scene7.com/is/image/asics/1183C102_751_SR_RT_GLB?$otmag_product_shoes$&qlt=99,1&wid=1200&hei=1125&fmt=png-alpha) | trimmed |
| `closet/mexico66-cream.webp` | Onitsuka Tiger Mexico 66 (cream and grey), style 1183A872.255 | [image](https://asics.scene7.com/is/image/asics/1183A872_255_SR_RT_GLB?$otmag_product_shoes$&qlt=99,1&wid=1200&hei=1125&fmt=png-alpha) | trimmed |
| `photos/banana-fit.webp` | [600 GSM 'Lemonade' Core Hoodie](https://lucidblanks.com/products/600-gsm-lemonade-core-hoodie) | [image](https://cdn.shopify.com/s/files/1/0748/8556/2674/files/600_lemonade_blue_hoodie.png) | cropped |
| `photos/cargo-fit.webp` | ['Payload' Flared Cargos (Cream)](https://lucidblanks.com/products/payload-flared-cargos-cream) | [image](https://cdn.shopify.com/s/files/1/0748/8556/2674/files/cargoscreammodel3.png) | cropped |
| `photos/grey-fit.webp` | [600 GSM 'Heather Grey' Classic Fit Hoodie](https://lucidblanks.com/products/600-gsm-heather-grey-classic-fit-hoodie) | [image](https://cdn.shopify.com/s/files/1/0748/8556/2674/files/heathergreystandardhoodie3.png) | cropped |
| `photos/lilac-fit.webp` | [600 GSM 'Lilac' Core Hoodie](https://lucidblanks.com/products/600-gsm-lilac-core-hoodie-1) | [image](https://cdn.shopify.com/s/files/1/0748/8556/2674/files/600_lilac_hoodie.png) | cropped |
| `photos/pine-fit.webp` | [600 GSM 'Pine' Core Hoodie](https://lucidblanks.com/products/600-gsm-pine-core-hoodie) | [image](https://cdn.shopify.com/s/files/1/0748/8556/2674/files/600_pine_hoodie.png) | cropped |
| `photos/selvedge-fit.webp` | ['Shroud' Washed Indigo Selvedge Denim](https://lucidblanks.com/products/shroud-washed-indigo-selvedge-denim) | [image](https://cdn.shopify.com/s/files/1/0748/8556/2674/files/shroud2.png) | cropped |
| `closet/skull-tee.webp` | [Stüssy Fresh Foils Tee (Rock)](https://www.stussy.com/products/1905216-fresh-foils-tee-rock) | [image](https://cdn.shopify.com/s/files/1/0087/6193/3920/files/1905216_ROCK_2.jpg) | background removed |
| `closet/cargo-shorts.webp` | [HUF Oval Denim Cargo Short](https://www.hufworldwide.com/products/oval-denim-cargo-short-pt00389) | [image](https://cdn.shopify.com/s/files/1/0268/5180/3305/files/OVAL-DENIM-CARGO-SHORT_FROST-GRAY_PT00389_FRGRY_01.png) | trimmed |

### Unsplash and Pexels

The [Unsplash License](https://unsplash.com/license) and the
[Pexels License](https://www.pexels.com/license/) allow free use, including
commercial use and modification, without permission or attribution. pileGo! credits
the photographers anyway.

| File | Photo | Photographer | Changes |
| --- | --- | --- | --- |
| `closet/anorak.webp` | [Unsplash](https://unsplash.com/photos/black-and-white-nike-jacket-u42GjVgZgV0) | [drzi_hamed](https://unsplash.com/@drzi_hamed) | background removed |
| `closet/beanie.webp` | [Unsplash](https://unsplash.com/photos/yellow-knit-bubble-cap-WWpJViNdatc) | [kerimayar](https://unsplash.com/@kerimayar) | background removed |
| `closet/camel-blazer.webp` | [Unsplash](https://unsplash.com/photos/blue-denim-jeans-and-brown-leather-shoes-ItqFmSxKnIg) | [dapperprofessional](https://unsplash.com/@dapperprofessional) | cropped to the blazer, background removed |
| `closet/cap.webp` | [Unsplash](https://unsplash.com/photos/a-yellow-baseball-cap-on-a-white-background-8XZBP38QJFM) | [sonu_kmr](https://unsplash.com/@sonu_kmr) | background removed |
| `closet/denim-jacket.webp` | [Unsplash](https://unsplash.com/photos/blue-denim-button-up-jacket-QRN47la37gw) | [smokthebikini](https://unsplash.com/@smokthebikini) | background and hanger rail removed |
| `closet/flannel.webp` | [Unsplash](https://unsplash.com/photos/black-and-gray-checkered-dress-shirt-xFmXLq_KJxg) | [smokthebikini](https://unsplash.com/@smokthebikini) | background and hanger rail removed |
| `closet/navy-bomber.webp` | [Unsplash](https://unsplash.com/photos/blue-zip-up-hoodie-jacket-TcRaVI3LXds) | [bulbul252](https://unsplash.com/@bulbul252) | background removed |
| `closet/rust-bomber.webp` | [Unsplash](https://unsplash.com/photos/brown-bomber-jacket-on-hanger-Fg15LdqpWrs) | [tobiastu](https://unsplash.com/@tobiastu) | cropped below the hanger, background removed |
| `closet/white-tee.webp` | [Unsplash](https://unsplash.com/photos/white-crew-neck-t-shirt-acn5ERAeSb4) | [uyk](https://unsplash.com/@uyk) | background removed |
| `photos/denim-pair.webp` | [Unsplash](https://unsplash.com/photos/a-pair-of-jeans-and-a-jean-jacket-on-a-white-background-LdekusMFSsA) | [enginakyurt](https://unsplash.com/@enginakyurt) | cropped |
| `photos/knit.webp` | [Unsplash](https://unsplash.com/photos/brown-knitted-sweater-with-drawstring-details-Q3sSWcecaCM) | [yuliia_pak](https://unsplash.com/@yuliia_pak) | cropped |

To swap a photo, replace the file with one of the same name and update its row.

The product photos in `apps/web/e2e/photos/` are the same cutouts placed on a plain
paper backdrop with a soft shadow, so the demo closet looks like a seller's own
photos. They carry the credits of the matching `closet/` rows above.

## Marketplace icons

The small round icons next to marketplace names (`apps/web/src/assets/marketplaces/`)
are each site's own favicon, fetched through Google's favicon service
(`https://www.google.com/s2/favicons?domain=<site>&sz=128`), except eBay's, which is
its `apple-touch-icon.png`. They are scaled to 64 px. The names and logos are
trademarks of Depop, eBay, Grailed, Mercari, Poshmark and Vinted,
used only to say which site a listing is on.

