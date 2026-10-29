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
states and the demo closet used by the end-to-end tests) are real photographs from
Unsplash and Pexels. None are AI generated. pileGo cut the backgrounds out with
`@imgly/background-removal`, the same model the scan uses, and cropped some.

The [Unsplash License](https://unsplash.com/license) and the
[Pexels License](https://www.pexels.com/license/) allow free use, including
commercial use and modification, without permission or attribution. pileGo credits
the photographers anyway.

| File | Photo | Photographer | Changes |
| --- | --- | --- | --- |
| `closet/anorak.webp` | [Unsplash](https://unsplash.com/photos/black-and-white-nike-jacket-u42GjVgZgV0) | [drzi_hamed](https://unsplash.com/@drzi_hamed) | background removed |
| `closet/beanie.webp` | [Unsplash](https://unsplash.com/photos/yellow-knit-bubble-cap-WWpJViNdatc) | [kerimayar](https://unsplash.com/@kerimayar) | background removed |
| `closet/camel-blazer.webp` | [Unsplash](https://unsplash.com/photos/blue-denim-jeans-and-brown-leather-shoes-ItqFmSxKnIg) | [dapperprofessional](https://unsplash.com/@dapperprofessional) | cropped to the blazer, background removed |
| `closet/cap.webp` | [Unsplash](https://unsplash.com/photos/a-yellow-baseball-cap-on-a-white-background-8XZBP38QJFM) | [sonu_kmr](https://unsplash.com/@sonu_kmr) | background removed |
| `closet/dark-jeans.webp` | [Unsplash](https://unsplash.com/photos/blue-denim-jeans-and-brown-leather-shoes-ItqFmSxKnIg) | [dapperprofessional](https://unsplash.com/@dapperprofessional) | cropped to the jeans, background removed |
| `closet/denim-jacket.webp` | [Unsplash](https://unsplash.com/photos/blue-denim-button-up-jacket-QRN47la37gw) | [smokthebikini](https://unsplash.com/@smokthebikini) | background and hanger rail removed |
| `closet/flannel.webp` | [Unsplash](https://unsplash.com/photos/black-and-gray-checkered-dress-shirt-xFmXLq_KJxg) | [smokthebikini](https://unsplash.com/@smokthebikini) | background and hanger rail removed |
| `closet/light-jeans.webp` | [Unsplash](https://unsplash.com/photos/a-pair-of-jeans-and-a-jean-jacket-on-a-white-background-LdekusMFSsA) | [enginakyurt](https://unsplash.com/@enginakyurt) | cropped to the jeans, background removed |
| `closet/longsleeve.webp` | [Unsplash](https://unsplash.com/photos/black-long-sleeve-shirt-on-white-table-A7f7XRKgUWc) | [ryanhoffman007](https://unsplash.com/@ryanhoffman007) | background removed |
| `closet/navy-bomber.webp` | [Unsplash](https://unsplash.com/photos/blue-zip-up-hoodie-jacket-TcRaVI3LXds) | [bulbul252](https://unsplash.com/@bulbul252) | background removed |
| `closet/rust-bomber.webp` | [Unsplash](https://unsplash.com/photos/brown-bomber-jacket-on-hanger-Fg15LdqpWrs) | [tobiastu](https://unsplash.com/@tobiastu) | cropped below the hanger, background removed |
| `closet/sweatshirt.webp` | [Unsplash](https://unsplash.com/photos/white-crew-neck-long-sleeve-shirt-7cERndkOyDw) | [mediamodifier](https://unsplash.com/@mediamodifier) | background and props removed |
| `closet/white-hoodie.webp` | [Unsplash](https://unsplash.com/photos/white-hoodie-and-distressed-jeans-kJXGTOY1wLQ) | [mediamodifier](https://unsplash.com/@mediamodifier) | cropped to the hoodie, background removed |
| `closet/white-tee.webp` | [Unsplash](https://unsplash.com/photos/white-crew-neck-t-shirt-acn5ERAeSb4) | [uyk](https://unsplash.com/@uyk) | background removed |
| `closet/yellow-hoodie.webp` | [Unsplash](https://unsplash.com/photos/yellow-toxic-peeps-pullover-hoodie-AT5-DnsNq70) | [kelvinlutan](https://unsplash.com/@kelvinlutan) | background removed |
| `photos/denim-pair.webp` | [Unsplash](https://unsplash.com/photos/a-pair-of-jeans-and-a-jean-jacket-on-a-white-background-LdekusMFSsA) | [enginakyurt](https://unsplash.com/@enginakyurt) | cropped |
| `photos/grey-hoodie.webp` | [Unsplash](https://unsplash.com/photos/a-childs-hoodie-with-a-smiley-face-on-it-NAvTGXs5FJ8) | [josefholz](https://unsplash.com/@josefholz) | cropped |
| `photos/hanging-hoodie.webp` | [Unsplash](https://unsplash.com/photos/white-hoodie-and-distressed-jeans-kJXGTOY1wLQ) | [mediamodifier](https://unsplash.com/@mediamodifier) | cropped |
| `photos/knit.webp` | [Unsplash](https://unsplash.com/photos/brown-knitted-sweater-with-drawstring-details-Q3sSWcecaCM) | [yuliia_pak](https://unsplash.com/@yuliia_pak) | cropped |
| `photos/navy-hoodie.webp` | [Unsplash](https://unsplash.com/photos/a-pair-of-jeans-and-a-hoodie-on-a-wooden-floor-h3qsf19IY9Y) | [philippewehrli](https://unsplash.com/@philippewehrli) | cropped |
| `photos/tan-hoodie.webp` | [Pexels](https://www.pexels.com/photo/a-person-holding-a-brown-hoodie-6786666/) | [Artem Podrez](https://www.pexels.com/@artempodrez/) | cropped |

To swap a photo, replace the file with one of the same name and update its row.

The product photos in `apps/web/e2e/photos/` are the same cutouts placed on a plain
paper backdrop with a soft shadow, so the demo closet looks like a seller's own
photos. They carry the credits of the matching `closet/` rows above.
