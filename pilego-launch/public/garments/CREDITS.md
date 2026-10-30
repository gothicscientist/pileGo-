# Garment and texture credits (pileGo! launch film)

Every image here is a real photograph. None is AI generated. Each one is used under a
licence that allows free commercial use and modification:

- [Unsplash License](https://unsplash.com/license)
- [Pexels License](https://www.pexels.com/license/)

Neither licence requires attribution, but pileGo! credits the photographers anyway.
Each Unsplash photo page was checked and says "Free to use under the Unsplash License"
(none is Unsplash+).

## How the cutouts were made

The scripts live in `assets-src/`:

- `matte.py`: BiRefNet (`birefnet-general`, through `rembg`) makes a soft mask.
- `cutout.py`: cleans up the cutout.
  - Removes specks and props, keeping only the garment component(s).
  - Paints out hands, hooks and brand-label text where noted.
  - Erodes the edge by about 1 px with a 0.6 px feather.
  - Decontaminates edge colour with pymatting `estimate_foreground_ml`, so no halo is left on cream or dark backgrounds.
  - Trims to the content bounding box plus 8 px of padding, with the long side at most 1600 px.
- `textures.py`: builds the textures.
- `final_sheet.py`: builds `contact-sheet.webp`.

The downloaded originals are kept in `assets-src/originals/full/` and
`assets-src/originals/textures/`.

## New cutouts (sourced for the launch film)

| File | Photo page | Photographer | Licence | Changes |
| --- | --- | --- | --- | --- |
| `red-cardigan.webp` | [Pexels 36129313](https://www.pexels.com/photo/bright-red-knit-cardigan-on-hanger-display-36129313/) | [Polina Chistyakova](https://www.pexels.com/@polinachistyakova/) | Pexels License | background removed (wooden hanger kept), trimmed, scaled |
| `striped-knit-sweater.webp` | [Pexels 45982](https://www.pexels.com/photo/gray-and-black-striped-crew-neck-top-45982/) | [Dom J](https://www.pexels.com/@dom-j-7304/) | Pexels License | background removed, text on neck label painted out, trimmed, scaled |
| `rose-floral-dress.webp` | [Pexels 31683080](https://www.pexels.com/photo/elegant-vintage-floral-dress-hanging-in-closet-31683080/) | [Lisa Fotios](https://www.pexels.com/@fotios-photos/) | Pexels License | background removed, neck-label text painted out, trimmed, scaled |
| `blue-sweater-tulips.webp` | [Pexels 30988803](https://www.pexels.com/photo/cozy-blue-sweater-with-yellow-tulips-bouquet-30988803/) | [Anna Danilina](https://www.pexels.com/@anna-danilina-241843489/) | Pexels License | background removed (tulips and envelope kept), trimmed, scaled |
| `tan-blazer.webp` | [Pexels 6909817](https://www.pexels.com/photo/photograph-of-a-jacket-on-a-wooden-hanger-6909817/) | [Roger Aribau Gisbert](https://www.pexels.com/@roger-aribau-gisbert-19420784/) | Pexels License | background and wall hook removed (hanger kept), trimmed, scaled |
| `sage-blazer.webp` | [Pexels 37524688](https://www.pexels.com/photo/elegant-beige-suit-jacket-hanging-on-rustic-wall-37524688/) | [Alexander Mass](https://www.pexels.com/@rebornfilmes/) | Pexels License | background removed, shirt-label text painted out, trimmed, scaled |
| `silk-scarf.webp` | [Pexels 36455708](https://www.pexels.com/photo/colorful-geometric-patterned-silk-scarf-36455708/) | [Đậu Photograph](https://www.pexels.com/@dauphotographer/) | Pexels License | background removed, trimmed, scaled |
| `brogues.webp` | [Pexels 1619655](https://www.pexels.com/photo/brown-leather-brogue-shoes-beside-eyeglasses-and-watch-1619655/) | [Mnz](https://www.pexels.com/@mnzoutfits/) | Pexels License | background removed, watch and glasses removed, trimmed, scaled |
| `pink-coat-outfit.webp` | [Pexels 14577586](https://www.pexels.com/photo/set-of-clothes-on-white-fabric-14577586/) | [Pegah Sharifi](https://www.pexels.com/@peg1997/) | Pexels License | background removed, "GLAMOUR DESIGN" coat label painted out, trimmed, scaled |
| `rust-sweater.webp` | [Unsplash e9W-oPLQOp8](https://unsplash.com/photos/a-knitted-rust-colored-sweater-with-loose-yarn-e9W-oPLQOp8) | [Yuliia Pakhomova](https://unsplash.com/@yuliia_pak) | Unsplash License | background removed (yarn and needle kept), trimmed, scaled |
| `green-cable-vest.webp` | [Unsplash GcSXNqXdPOk](https://unsplash.com/photos/a-green-knitted-piece-of-clothing-GcSXNqXdPOk) | [Asiya Bhat](https://unsplash.com/@istaber) | Unsplash License | background and eyeshadow palette removed, trimmed, scaled |
| `floral-tea-dress.webp` | [Unsplash 7QIRrJmUkkg](https://unsplash.com/photos/white-and-orange-floral-button-up-shirt-7QIRrJmUkkg) | [Erik Mclean](https://unsplash.com/@introspectivedsgn) | Unsplash License | background removed (hanger, beads and price tag kept), Sears neck label painted out, trimmed, scaled |
| `wool-chore-jacket.webp` | [Unsplash gJtwWqMiyUw](https://unsplash.com/photos/a-brown-jacket-hanging-on-a-wooden-wall-gJtwWqMiyUw) | [Nikola Tasic](https://unsplash.com/@tasae34) | Unsplash License | background removed (rustic hanger kept), trimmed, scaled; the photo shows a 19th-century Serbian jacket |
| `kraft-tote.webp` | [Unsplash 1Pgq9ZpIatI](https://unsplash.com/photos/beige-eco-bag-1Pgq9ZpIatI) | [Kelly Sikkema](https://unsplash.com/@kellysikkema) | Unsplash License | background removed, trimmed, scaled |
| `jeans.webp` | [Unsplash 9yoXrG6Er_g](https://unsplash.com/photos/a-pair-of-blue-jeans-on-a-white-background-9yoXrG6Er_g) | [TuanAnh Blue](https://unsplash.com/@blueeyeaa) | Unsplash License | background removed, text on waistband patch painted out, trimmed, scaled |
| `straw-hat.webp` | [Unsplash nEhiF06YDRM](https://unsplash.com/photos/brown-hat-beside-black-handkerchief-nEhiF06YDRM) | [Debby Hudson](https://unsplash.com/@hudsoncrafted) | Unsplash License | background removed (bandana and sunglasses kept with the hat), trimmed, scaled |
| `lilac-sweater.webp` | [Unsplash HDsXgLf4w5Q](https://unsplash.com/photos/a-purple-sweater-hanging-on-a-rack-next-to-a-vase-with-dried-flowers-HDsXgLf4w5Q) | [Ihor Rapita](https://unsplash.com/@rapitaihor) | Unsplash License | background, vase and the hand holding the hanger removed (hanger kept, hook shortened), trimmed, scaled |
| `cream-turtleneck.webp` | [Unsplash m2chM9O-ZHs](https://unsplash.com/photos/a-white-sweater-hanging-on-a-clothes-rack-m2chM9O-ZHs) | [Ihor Rapita](https://unsplash.com/@rapitaihor) | Unsplash License | background, vase, hand and hanger hook removed, trimmed, scaled |

## Reused from the pileGo! repo

These are the licensed Unsplash cutouts from `apps/web/src/assets/closet/`; see the
"Unsplash and Pexels" table in the repo's `/CREDITS.md`. They were converted from WebP
to RGBA PNG and trimmed to the content bounding box plus 8 px of padding. Their source
cutouts are small, at most 736 px tall.

| File | Photo page | Photographer | Licence | Changes |
| --- | --- | --- | --- | --- |
| `anorak.webp` | [Unsplash](https://unsplash.com/photos/black-and-white-nike-jacket-u42GjVgZgV0) | [drzi_hamed](https://unsplash.com/@drzi_hamed) | Unsplash License | background removed (repo); PNG, trimmed |
| `beanie.webp` | [Unsplash](https://unsplash.com/photos/yellow-knit-bubble-cap-WWpJViNdatc) | [kerimayar](https://unsplash.com/@kerimayar) | Unsplash License | background removed (repo); PNG, trimmed |
| `camel-blazer.webp` | [Unsplash](https://unsplash.com/photos/blue-denim-jeans-and-brown-leather-shoes-ItqFmSxKnIg) | [dapperprofessional](https://unsplash.com/@dapperprofessional) | Unsplash License | cropped to the blazer, background removed (repo); PNG, trimmed |
| `cap.webp` | [Unsplash](https://unsplash.com/photos/a-yellow-baseball-cap-on-a-white-background-8XZBP38QJFM) | [sonu_kmr](https://unsplash.com/@sonu_kmr) | Unsplash License | background removed (repo); PNG, trimmed |
| `denim-jacket.webp` | [Unsplash](https://unsplash.com/photos/blue-denim-button-up-jacket-QRN47la37gw) | [smokthebikini](https://unsplash.com/@smokthebikini) | Unsplash License | background and hanger rail removed (repo); PNG, trimmed |
| `flannel.webp` | [Unsplash](https://unsplash.com/photos/black-and-gray-checkered-dress-shirt-xFmXLq_KJxg) | [smokthebikini](https://unsplash.com/@smokthebikini) | Unsplash License | background and hanger rail removed (repo); PNG, trimmed |
| `navy-bomber.webp` | [Unsplash](https://unsplash.com/photos/blue-zip-up-hoodie-jacket-TcRaVI3LXds) | [bulbul252](https://unsplash.com/@bulbul252) | Unsplash License | background removed (repo); PNG, trimmed |
| `rust-bomber.webp` | [Unsplash](https://unsplash.com/photos/brown-bomber-jacket-on-hanger-Fg15LdqpWrs) | [tobiastu](https://unsplash.com/@tobiastu) | Unsplash License | cropped below the hanger, background removed (repo); PNG, trimmed |
| `rust-bomber-photo.webp` | [Unsplash](https://unsplash.com/photos/brown-bomber-jacket-on-hanger-Fg15LdqpWrs) | [tobiastu](https://unsplash.com/@tobiastu) | Unsplash License | the repo's `apps/web/e2e/photos/rust-bomber.webp`: the cutout on a plain paper backdrop with a soft shadow; converted to PNG |
| `white-tee.webp` | [Unsplash](https://unsplash.com/photos/white-crew-neck-t-shirt-acn5ERAeSb4) | [uyk](https://unsplash.com/@uyk) | Unsplash License | background removed (repo); PNG, trimmed |

## Textures (`public/textures/`)

| File | Photo page | Photographer | Licence | Changes |
| --- | --- | --- | --- | --- |
| `denim.jpg` | [Unsplash 49BJS7Dml_Y](https://unsplash.com/photos/a-close-up-of-a-blue-jean-fabric-49BJS7Dml_Y) | [Second Breakfast](https://unsplash.com/@breakfast2) | Unsplash License | cropped, 2000 px, made seamless (offset blend) |
| `tweed-check.jpg` | [Unsplash 5qbFSyK83h8](https://unsplash.com/photos/a-close-up-of-a-black-and-white-checkered-jacket-5qbFSyK83h8) | [Second Breakfast](https://unsplash.com/@breakfast2) | Unsplash License | resized to 2000 px |
| `chunky-knit.jpg` | [Pexels 1487703](https://www.pexels.com/photo/brown-knitted-textile-1487703/) | [Engin Akyurt](https://www.pexels.com/@enginakyurt/) | Pexels License | resized to 2000 px |
| `tartan-flannel.jpg` | [Unsplash DklaS1faCkI](https://unsplash.com/photos/red-white-and-black-plaid-textile-DklaS1faCkI) | [Ekaterina Grosheva](https://unsplash.com/@kitkat93) | Unsplash License | cropped to the flat area, 2000 px |
| `kraft-paper.jpg` | [Unsplash qZiXut0ikLc](https://unsplash.com/photos/a-sheet-of-light-brown-recycled-paper-with-a-subtle-fibrous-texture-qZiXut0ikLc) | [Kiwihug](https://unsplash.com/@kiwihug) | Unsplash License | edges cropped, 2000 px, made seamless (offset blend) |
| `cream-paper.jpg` | [Unsplash 3ch06Zm4bV0](https://unsplash.com/photos/old-creased-blank-paper-texture-3ch06Zm4bV0) | [Heather Green](https://unsplash.com/@heathergreengreen) | Unsplash License | edges cropped, 2000 px |
| `cardboard.jpg` | [Unsplash l29EA7qvSoI](https://unsplash.com/photos/brown-corrugated-cardboard-texture-background-l29EA7qvSoI) | [Umut Hasanoglu](https://unsplash.com/@umuthasanoglu) | Unsplash License | edges cropped, 2000 px |
