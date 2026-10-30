# pileGo! launch film

A 28-second launch film for [pileGo!](https://pilego.app), made in [Remotion](https://www.remotion.dev).

**The film:** [`film/pilego-launch.mp4`](film/pilego-launch.mp4). It is 1920×1080 at 30 fps, encoded as H.264 High (CRF 16, BT.709) with 48 kHz AAC audio at 320 kbps. The audio is mastered to −14.0 LUFS integrated with a −1.4 dBFS peak.

The concept, the scene-by-scene storyboard and the rules the film follows to stay accurate about the product are in [STORYBOARD.md](STORYBOARD.md).

This folder is separate from the app. Nothing in `apps/`, `packages/` or `supabase/` is touched.

## Rerender

```sh
cd pilego-launch
npm install
npx remotion studio            # preview and edit; the scenes are also registered on their own under "Scenes"
scripts/master.sh              # render the master and write film/pilego-launch.mp4
```

`scripts/master.sh` works in three steps:

1. It renders a ProRes 422 HQ master with PCM audio to `out/`, which is not committed.
2. It measures the loudness.
3. It normalises to −14 LUFS / −1.5 dBTP with two-pass `loudnorm` and encodes the H.264 delivery file.

The script needs Node 20.19+ (or 22.13+) and ffmpeg.

To check frames without rendering the whole film, `node scripts/stills.mjs <composition> <outDir> <scale> <frames…|every:N>` renders stills plus a labelled contact sheet. For example:

```sh
node scripts/stills.mjs LaunchFilm /tmp/sheet 0.25 every:15
```

## Layout

| Path | What it is |
|---|---|
| `src/LaunchFilm.tsx` | The film: five scenes on one timeline, plus film grain and the soundtrack. |
| `src/layout.ts` | The timeline (scene starts and lengths) and shared geometry. Scenes use it to hand objects to each other on the same pixels. |
| `src/scenes/S1Pile.tsx` … `S5Finale.tsx` | The scenes: the pile, Snap/Scan/Done, cross-listing, the closet and relisting, and the finale. |
| `src/Soundtrack.tsx` | The score plus every sound effect, placed by frame. |
| `src/components/` | Paper and grain, garment cutouts with lift-dependent shadows, kraft tags, tape, polaroids, stamps, the torn-sheet transition, app captures (`Screen`), the wordmark and kinetic type. |
| `src/theme.ts` | pileGo!'s colour tokens (from `apps/web/src/styles/app.css`) and fonts. |
| `public/ui/` | Real captures of the app that the film uses. See `MANIFEST.md`. |
| `public/garments/`, `public/textures/` | Licensed garment cutouts and textures, with `CREDITS.md`. |
| `public/audio/` | Score (`music.wav`), stems (FLAC), sound effects, cue map, QA plots and `CREDITS.md`. |
| `public/fonts/` | Libre Franklin, Instrument Serif and DM Mono, bundled so renders never fetch fonts. |
| `public/marketplaces/` | The app's marketplace icons. |
| `capture/` | The Playwright script that captures the app's real interface. |
| `assets-src/` | The scripts that fetch the garment photos, cut them out and clean the edges. |
| `sound/` | The scripts that compose the score and build the sound effects (Python; deterministic). |

## Swapping things

- **A garment:** drop a transparent `.webp` into `public/garments/`, run `python3 scripts/garment-index.py`, and refer to it by name in a scene's `PILE`, `COLUMNS` or `PIECES` list.
- **Timing:** scene lengths live in `src/layout.ts`. Each scene keeps its own beats as named constants at the top of its file (`PICK`, `SNAP`, `PRESS`, `DONE`, `SOLD`, `HIT`…). The sound effects in `Soundtrack.tsx` are placed relative to those scene starts.
- **App captures:** run `pnpm install` at the repo root, then:

  ```sh
  cd apps/web
  pnpm exec playwright test -c ../../pilego-launch/capture/capture.config.ts
  ```

  This writes all 106 states to `public/ui/`, but only the nine the film uses are committed. The run needs Chromium; set `PW_CHROMIUM` to its path if Playwright's own copy isn't installed.
- **Score:**

  ```sh
  pip install numpy scipy soundfile matplotlib pyloudnorm
  python3 sound/make_music.py && python3 sound/make_sfx.py
  ```

  `make_music.py` writes the stems as WAV. The repo keeps FLAC copies, made with `ffmpeg -i x.wav -c:a flac x.flac`.

## Credits and licences

| What | Source | Licence |
|---|---|---|
| Interface | Captures of pileGo! itself, with mocked demo data | AGPL-3.0-or-later, as for the repo |
| Garment photos | Unsplash and Pexels photographers, listed per file in [`public/garments/CREDITS.md`](public/garments/CREDITS.md). Real photographs; none is AI generated. Background removal and cleanup by `assets-src/`. | Unsplash License / Pexels License |
| Textures | As above, same file | Unsplash License / Pexels License |
| Music | "Second Hand, First Class", an original composition for this film, synthesized by `sound/make_music.py` with no samples | CC0 1.0 |
| Sound effects | Synthesized, plus layered and processed recordings from Kenney.nl (RPG, Casino, Impact, Interface and UI Audio packs), listed per file in [`public/audio/CREDITS.md`](public/audio/CREDITS.md) | CC0 1.0 |
| Fonts | Libre Franklin (Impallari Type), Instrument Serif (Instrument), DM Mono (Colophon), via Fontsource | SIL Open Font License 1.1 |
| Marketplace icons | Each site's own favicon, as in the app (`CREDITS.md` at the repo root) | Trademarks of their owners, used only to name the marketplace |
| Remotion | [remotion.dev](https://www.remotion.dev) | Free for individuals and teams of up to 3; larger companies need a [company license](https://www.remotion.pro/license) |

The garment photos used in the film all come from the licensed Unsplash and Pexels sets. The brand product shots that the app's own demo closet uses (Lucid Blanks, Stüssy, HUF, Onitsuka Tiger) are not used in the film. The one exception is inside a real app capture: in the Out there list, the small jeans thumbnail comes from that demo closet (a Lucid Blanks product photo, flagged as unlicensed in the repo's `CREDITS.md`). Swap that demo photo before any commercial use of the film.
