# pileGo! launch film — concept and storyboard

**Length** 28 s · **Format** 1920×1080, 30 fps, H.264 + AAC · **Score** original, 120 BPM (a beat is 15 frames, a bar is 60)

## Concept: the pile, sorted

pileGo!'s own visual language is already a scrapbook: warm paper with a faint
grid, real garment cutouts, kraft hang tags on string, washi tape, instant
photos, a tomato "!" and green tag-shaped buttons. The film keeps that identity
and stages it like a fashion editorial: a magazine cover line,
Libre Franklin black italics against an Instrument Serif accent, and a
typewriter mono for labels.

The through-line is one garment, a rust satin bomber. It falls onto a pile, is
picked out of it, photographed, read by the AI, listed on six marketplaces,
sold on one and taken down from the rest, and finally lands back on the pile as
"Sold on Vinted". Everything it touches in pileGo! is a real capture of the app.

Garments behave like objects: they fall with weight, squash a little when they
land, cast shadows that grow and soften as they lift, and fly between scenes
rather than cross-fading. Interface captures are laid on the table like prints,
and the app's own controls (Scan with AI, Save and cross-list, List on 6
marketplaces, Relist 3 old listings) are pressed in time with the music.

## Honesty rules the film follows

- Every interface shot is a real capture of the app (`public/ui`, made by
  `capture/`), driven with the repo's mocked backend and one consistent item.
- Marketplace methods and fees are the ones the cross-list sheet shows for a
  $30 listing: eBay *Automatic* (official API), Vinted *One click*, Depop /
  Poshmark / Mercari / Grailed *Auto-post* (the free browser extension). A
  Each listing card carries its method label from the sheet.
- "Gone everywhere else" is the app's sale flow: a sale queues removal from
  every other marketplace (README, "Sales").
- Relisting is shown on the three listings the app actually relists (eBay and
  Vinted).
- The scan checklist is the app's real loading state; the film doesn't claim
  it reports live model progress.

## Scenes

| # | Time | Frames | Beat | What happens |
|---|---|---|---|---|
| 1 | 0.0–6.2 s | 0–186 | Hook → drop at 4.0 s | Thirteen real garments fall onto the paper on 8th notes; kraft tags ("price?", "draft", "unlisted") tumble in and swing. Cover line: *That pile? It's ~~a mess.~~ inventory.* On the drop the bomber lifts out of the pile (the pile sinks and goes soft), a viewfinder closes on it, *Snap.*, the shutter fires at 5.0 s and the photo develops like an instant print, then slides into the cover slot of the real scan page as the page assembles around it. |
| 2 | 6.2–11.2 s | 186–336 | Groove | *Scan.* — "Scan with AI" is pressed; the app's real checklist ("Reading the label… Checking what it sells for…") runs while its green beam sweeps the photo. *Done.* — "Check it over" with every field filled. The page around the form dissolves, the camera pushes in and the form scrolls like the real page while kraft labels name what the AI filled (title/size/era, condition, flaws, colours & fabric, measurements, description); a "$30 suggested" tag swings in. "Save and cross-list" is pressed. |
| 3 | 11.2–17.1 s | 336–512 | Hook motif enters | The real cross-list sheet opens over the dimmed review page with all six marketplaces ticked; "List on 6 marketplaces" is pressed. The bomber is dealt out as six listing cards, each with its marketplace, method, title length limit and what you keep. *One listing. Six marketplaces.* Then Vinted's card rises and is stamped SOLD; the other five are marked TAKEN DOWN and fall away. *Sold on one? Gone everywhere else.* |
| 4 | 16.5–21.9 s | 496–656 | Energy up | A fresh sheet is torn off the pad. *Your whole closet, handled.* The pile sorts itself into the closet's real tabs — Drafts 3, Ready 4, Listed 7, Sold 2 — with the bomber stamped SOLD. The real "Out there" Live list slides in: the old listings' ages are circled, "Relist 3 old listings" is pressed, the three relistable rows get "Relisting" tags and the app's toast appears. *Old listings? One press.* |
| 5 | 21.3–28.0 s | 640–840 | Hit at 22.0 s, final chord at 24.0 s | Another sheet. Garments fly in from every edge onto the green mat from pileGo!'s sign-in page and land on 16ths into the hit. The wordmark lands on the hit and its "!" jumps. *Less listing. More living.* On the final chord: the green tag button "pilego.app", "Free · open source for resellers", the "Sold in 2 days" sticker. The end card holds for four seconds. |

## Typography and colour

- Libre Franklin 900 italic, −0.05 em: headlines and the wordmark (the app's face).
- Instrument Serif italic: the editorial accent words (*inventory.*, *Six marketplaces.*, *handled.*, *More living.*).
- DM Mono: small details on the listing cards.
- The film is graded in pileGo!'s own **dark theme** (tokens from `apps/web/src/styles/app.css`): night paper `#161813`, card `#262a21`, warm white ink `#f2efe4`, light grass green `#a8c68a`, kraft `#c8b083`, tomato `#ff7b5e`, and the app captures are taken in dark mode too. Shadows are black and about twice as strong so garments still lift off the dark floor. `MODE` in `src/theme.ts` switches the whole film back to the light paper version.
