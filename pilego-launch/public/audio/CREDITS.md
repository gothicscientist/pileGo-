# pileGo! launch film: audio credits and licences

Every audio file in `public/audio/` is listed below, with how it was made, its sources and its licence.

**Licence of the audio in this folder:** the music and every synthesized sound are original works made for this film and are released under **CC0 1.0 Universal** (public domain dedication, https://creativecommons.org/publicdomain/zero/1.0/). The Kenney recordings that some SFX are built from are CC0 1.0 as well, so every file here is CC0 1.0. The rest of the repository stays AGPL-3.0. Credit is not required, but it is welcome: "Music and sound: pileGo! (CC0), with foley from Kenney.nl (CC0)".

## Music

| File | Format | How it was made | Licence |
|---|---|---|---|
| `music.wav` | 28.000 s, 48 kHz, stereo, 24-bit | **Original composition written for this film** (working title "Second Hand, First Class"). 120 BPM, D minor resolving to F major. Every sound, drums included, is synthesized by `sound/make_music.py` with `sound/dsp.py`: an FM electric piano, additive band-limited bass, pad, lead and arp, and synthesized kick, clap, hats, shaker, congas and cymbals. It contains no samples and no third-party material. | CC0 1.0 |
| `stems/drums.flac` | 28.000 s, 48 kHz, stereo, 24-bit FLAC | Stem of the same render. The four stems sum sample-for-sample to `music.wav`, because the master compressor and limiter gain is computed on the sum and applied to every stem. | CC0 1.0 |
| `stems/bass.flac` | 28.000 s, 48 kHz, stereo, 24-bit FLAC | Stem of the same render. The four stems sum sample-for-sample to `music.wav`, because the master compressor and limiter gain is computed on the sum and applied to every stem. | CC0 1.0 |
| `stems/music.flac` | 28.000 s, 48 kHz, stereo, 24-bit FLAC | Stem of the same render. The four stems sum sample-for-sample to `music.wav`, because the master compressor and limiter gain is computed on the sum and applied to every stem. | CC0 1.0 |
| `stems/fx.flac` | 28.000 s, 48 kHz, stereo, 24-bit FLAC | Stem of the same render. The four stems sum sample-for-sample to `music.wav`, because the master compressor and limiter gain is computed on the sum and applied to every stem. | CC0 1.0 |
| `music-cues.json` | JSON | Bar, beat and cue map in seconds and in frames at 30 fps, written by `make_music.py`. | CC0 1.0 |

## Sound effects (`sfx/`)

All are 48 kHz, 24-bit WAV. The peak is normalised to -3 dBFS, except `ui_tick_*` and `type_*`, which are at -6 dBFS because they are meant to stay soft. They are made by `sound/make_sfx.py`. "st" means semitones of varispeed (pitch and length change together, as on tape).

| File | Format | How it was made | Sources | Licence |
|---|---|---|---|---|
| `ai_sparkle_1.wav` | 0.780 s, 48 kHz, stereo | synthesized FM bell grains in F-major pentatonic (ascending) + reverb | none: fully synthesized | CC0 1.0 |
| `ai_sparkle_2.wav` | 0.780 s, 48 kHz, stereo | synthesized FM bell grains in F-major pentatonic (descending) + reverb | none: fully synthesized | CC0 1.0 |
| `cash_1.wav` | 0.700 s, 48 kHz, stereo | Kenney handleCoins2 + chips-collide-1 + a quiet synthesized E7/B7 mallet ting | Kenney 'casino-audio' pack: chips-collide-1.ogg; Kenney 'rpg-audio' pack: handleCoins2.ogg | CC0 1.0 |
| `fabric_drop_1.wav` | 0.420 s, 48 kHz, stereo | Kenney dropLeather + synthesized soft low thump, small room | Kenney 'rpg-audio' pack: dropLeather.ogg | CC0 1.0 |
| `fabric_drop_2.wav` | 0.450 s, 48 kHz, stereo | Kenney impactSoft_heavy_000 (low-passed) + cloth2 rustle (-2 st) | Kenney 'impact-sounds' pack: impactSoft_heavy_000.ogg; Kenney 'rpg-audio' pack: cloth2.ogg | CC0 1.0 |
| `fabric_drop_3.wav` | 0.360 s, 48 kHz, stereo | Kenney footstep_carpet_001 + cloth3 tail + synthesized thump | Kenney 'impact-sounds' pack: footstep_carpet_001.ogg; Kenney 'rpg-audio' pack: cloth3.ogg | CC0 1.0 |
| `fabric_drop_4.wav` | 0.300 s, 48 kHz, stereo | Kenney impactSoft_medium_002 (-3 st, low-passed) + handleSmallLeather + thump | Kenney 'impact-sounds' pack: impactSoft_medium_002.ogg; Kenney 'rpg-audio' pack: handleSmallLeather.ogg | CC0 1.0 |
| `fabric_swish_1.wav` | 0.620 s, 48 kHz, stereo | Kenney cloth1 + synthesized air whoosh (band-pass noise sweep) | Kenney 'rpg-audio' pack: cloth1.ogg | CC0 1.0 |
| `fabric_swish_2.wav` | 0.415 s, 48 kHz, stereo | Kenney cloth2 + synthesized air whoosh | Kenney 'rpg-audio' pack: cloth2.ogg | CC0 1.0 |
| `fabric_swish_3.wav` | 0.575 s, 48 kHz, stereo | Kenney cloth3, varispeed -2.5 st + synthesized air whoosh | Kenney 'rpg-audio' pack: cloth3.ogg | CC0 1.0 |
| `fabric_swish_4.wav` | 0.400 s, 48 kHz, stereo | Kenney cloth4 (+1.5 st) layered with cloth2 (+3 st) + air whoosh | Kenney 'rpg-audio' pack: cloth2.ogg; Kenney 'rpg-audio' pack: cloth4.ogg | CC0 1.0 |
| `impact_soft_1.wav` | 1.800 s, 48 kHz, stereo | synthesized sub boom (100->38 Hz, with 2nd/3rd harmonics) + low noise thump + Kenney impactSoft_heavy_001 (low-passed), hall | Kenney 'impact-sounds' pack: impactSoft_heavy_001.ogg | CC0 1.0 |
| `paper_shuffle_1.wav` | 0.689 s, 48 kHz, stereo | Kenney card-fan-1 | Kenney 'casino-audio' pack: card-fan-1.ogg | CC0 1.0 |
| `paper_shuffle_2.wav` | 0.850 s, 48 kHz, stereo | Kenney card-shuffle (excerpt 0.10-0.95 s) | Kenney 'casino-audio' pack: card-shuffle.ogg | CC0 1.0 |
| `paper_shuffle_3.wav` | 0.569 s, 48 kHz, stereo | Kenney bookFlip1 + card-shuffle excerpt (+1 st) | Kenney 'casino-audio' pack: card-shuffle.ogg; Kenney 'rpg-audio' pack: bookFlip1.ogg | CC0 1.0 |
| `paper_slide_1.wav` | 0.500 s, 48 kHz, stereo | Kenney card-slide-2 | Kenney 'casino-audio' pack: card-slide-2.ogg | CC0 1.0 |
| `paper_slide_2.wav` | 0.524 s, 48 kHz, stereo | Kenney card-slide-5 (-1 st) | Kenney 'casino-audio' pack: card-slide-5.ogg | CC0 1.0 |
| `paper_slide_3.wav` | 0.571 s, 48 kHz, stereo | Kenney card-shove-3 (gentle top cut) | Kenney 'casino-audio' pack: card-shove-3.ogg | CC0 1.0 |
| `riser_1.wav` | 2.000 s, 48 kHz, stereo | synthesized: resonant noise sweep 300 Hz-11 kHz + D-minor sine cluster gliding up an octave; peak at file end | none: fully synthesized | CC0 1.0 |
| `scan_sweep_1.wav` | 1.650 s, 48 kHz, stereo | synthesized resonant band-pass noise sweep + pentatonic shimmer + soft glide tone | none: fully synthesized | CC0 1.0 |
| `scan_sweep_2.wav` | 1.780 s, 48 kHz, stereo | synthesized resonant band-pass noise sweep + pentatonic shimmer + soft glide tone | none: fully synthesized | CC0 1.0 |
| `shutter_1.wav` | 0.360 s, 48 kHz, stereo | synthesized two-curtain mechanical shutter + mirror slap + advance ratchet, Kenney metalLatch layered low | Kenney 'rpg-audio' pack: metalLatch.ogg | CC0 1.0 |
| `shutter_2.wav` | 0.237 s, 48 kHz, stereo | Kenney ui-audio click3 + click1 + synthesized ticks and air (modern digital shutter) | Kenney 'ui-audio' pack: click1.ogg; Kenney 'ui-audio' pack: click3.ogg | CC0 1.0 |
| `stamp_1.wav` | 0.340 s, 48 kHz, stereo | Kenney bookPlace1 + synthesized rubber thump + paper slap | Kenney 'rpg-audio' pack: bookPlace1.ogg | CC0 1.0 |
| `stamp_2.wav` | 0.360 s, 48 kHz, stereo | Kenney bookPlace3 (-2 st) + impactSoft_medium_001 + synthesized thump | Kenney 'impact-sounds' pack: impactSoft_medium_001.ogg; Kenney 'rpg-audio' pack: bookPlace3.ogg | CC0 1.0 |
| `tag_flick_1.wav` | 0.202 s, 48 kHz, stereo | Kenney bookFlip3 + synthesized paper tick | Kenney 'rpg-audio' pack: bookFlip3.ogg | CC0 1.0 |
| `tag_flick_2.wav` | 0.171 s, 48 kHz, stereo | synthesized paper tick x2 (flick + swing-back) + Kenney card-slide-8 excerpt (+4 st) | Kenney 'casino-audio' pack: card-slide-8.ogg | CC0 1.0 |
| `tag_flick_3.wav` | 0.160 s, 48 kHz, stereo | Kenney card-place-3 attack (+2 st) + synthesized ticks | Kenney 'casino-audio' pack: card-place-3.ogg | CC0 1.0 |
| `tape_rip_1.wav` | 0.580 s, 48 kHz, stereo | synthesized stick-slip tear (impulse train + band-passed noise) + Kenney card-place-1 as the press | Kenney 'casino-audio' pack: card-place-1.ogg | CC0 1.0 |
| `tape_rip_2.wav` | 0.440 s, 48 kHz, stereo | synthesized quick tear + Kenney card-place-1 (+1 st) press | Kenney 'casino-audio' pack: card-place-1.ogg | CC0 1.0 |
| `type_1.wav` | 0.556 s, 48 kHz, stereo | 6 soft key clicks from Kenney ui-audio/interface clicks (random pitch, level, timing) + synthesized key-bed thump, peak -6 dBFS | Kenney 'interface-sounds' pack: click_001.ogg; Kenney 'ui-audio' pack: click1.ogg; Kenney 'ui-audio' pack: click2.ogg; Kenney 'ui-audio' pack: click3.ogg; Kenney 'ui-audio' pack: click4.ogg; Kenney 'ui-audio' pack: click5.ogg; Kenney 'ui-audio' pack: mouseclick1.ogg; Kenney 'ui-audio' pack: mouserelease1.ogg | CC0 1.0 |
| `type_2.wav` | 0.787 s, 48 kHz, stereo | 8 soft key clicks from Kenney ui-audio/interface clicks (random pitch, level, timing) + synthesized key-bed thump, peak -6 dBFS | Kenney 'interface-sounds' pack: click_001.ogg; Kenney 'ui-audio' pack: click1.ogg; Kenney 'ui-audio' pack: click2.ogg; Kenney 'ui-audio' pack: click3.ogg; Kenney 'ui-audio' pack: click4.ogg; Kenney 'ui-audio' pack: click5.ogg; Kenney 'ui-audio' pack: mouseclick1.ogg; Kenney 'ui-audio' pack: mouserelease1.ogg | CC0 1.0 |
| `type_3.wav` | 0.800 s, 48 kHz, stereo | 10 soft key clicks from Kenney ui-audio/interface clicks (random pitch, level, timing) + synthesized key-bed thump, peak -6 dBFS | Kenney 'interface-sounds' pack: click_001.ogg; Kenney 'ui-audio' pack: click1.ogg; Kenney 'ui-audio' pack: click2.ogg; Kenney 'ui-audio' pack: click3.ogg; Kenney 'ui-audio' pack: click4.ogg; Kenney 'ui-audio' pack: click5.ogg; Kenney 'ui-audio' pack: mouseclick1.ogg; Kenney 'ui-audio' pack: mouserelease1.ogg | CC0 1.0 |
| `ui_confirm_1.wav` | 0.580 s, 48 kHz, stereo | synthesized FM mallet chime, notes MIDI 81->86 (A5-D6) | none: fully synthesized | CC0 1.0 |
| `ui_confirm_2.wav` | 0.580 s, 48 kHz, stereo | synthesized FM mallet chime, notes MIDI 77->84 (F5-C6) | none: fully synthesized | CC0 1.0 |
| `ui_pop_1.wav` | 0.180 s, 48 kHz, mono | synthesized rising-sine bubble pop (~380 Hz) + Kenney pluck_001 at -14 dB | Kenney 'interface-sounds' pack: pluck_001.ogg | CC0 1.0 |
| `ui_pop_2.wav` | 0.180 s, 48 kHz, mono | synthesized rising-sine bubble pop (~470 Hz) + Kenney pluck_002 at -14 dB | Kenney 'interface-sounds' pack: pluck_002.ogg | CC0 1.0 |
| `ui_pop_3.wav` | 0.180 s, 48 kHz, mono | synthesized rising-sine bubble pop (~560 Hz) + Kenney drop_001 at -14 dB | Kenney 'interface-sounds' pack: drop_001.ogg | CC0 1.0 |
| `ui_tick_1.wav` | 0.070 s, 48 kHz, mono | synthesized wooden tap at 1850 Hz + Kenney tick_001 (low-passed), peak -6 dBFS | Kenney 'interface-sounds' pack: tick_001.ogg | CC0 1.0 |
| `ui_tick_2.wav` | 0.070 s, 48 kHz, mono | synthesized wooden tap at 2150 Hz + Kenney tick_002 (low-passed), peak -6 dBFS | Kenney 'interface-sounds' pack: tick_002.ogg | CC0 1.0 |
| `ui_tick_3.wav` | 0.070 s, 48 kHz, mono | synthesized wooden tap at 2500 Hz + Kenney click2 (low-passed), peak -6 dBFS | Kenney 'ui-audio' pack: click2.ogg | CC0 1.0 |
| `ui_tick_4.wav` | 0.070 s, 48 kHz, mono | synthesized wooden tap at 1600 Hz + Kenney click5 (low-passed), peak -6 dBFS | Kenney 'ui-audio' pack: click5.ogg | CC0 1.0 |
| `whoosh_soft_1.wav` | 0.540 s, 48 kHz, stereo | synthesized: band-pass noise sweep (SVF) with pan motion + low air layer | none: fully synthesized | CC0 1.0 |
| `whoosh_soft_2.wav` | 0.670 s, 48 kHz, stereo | synthesized: band-pass noise sweep (SVF) with pan motion + low air layer | none: fully synthesized | CC0 1.0 |
| `whoosh_soft_3.wav` | 0.800 s, 48 kHz, stereo | synthesized: band-pass noise sweep (SVF) with pan motion + low air layer | none: fully synthesized | CC0 1.0 |

## Third-party sources

Only CC0 material was used. The original files are kept unmodified in `sound/sources/kenney/<pack>/`, next to each pack's own `License.txt`.

| Pack | Author | URL | Licence |
|---|---|---|---|
| RPG Audio | Kenney Vleugels / Kenney.nl | https://kenney.nl/assets/rpg-audio | CC0 1.0 (https://creativecommons.org/publicdomain/zero/1.0/) |
| Casino Audio (1.1) | Kenney Vleugels / Kenney.nl | https://kenney.nl/assets/casino-audio | CC0 1.0 (https://creativecommons.org/publicdomain/zero/1.0/) |
| Impact Sounds (1.0) | Kenney Vleugels / Kenney.nl | https://kenney.nl/assets/impact-sounds | CC0 1.0 (https://creativecommons.org/publicdomain/zero/1.0/) |
| Interface Sounds (1.0) | Kenney Vleugels / Kenney.nl | https://kenney.nl/assets/interface-sounds | CC0 1.0 (https://creativecommons.org/publicdomain/zero/1.0/) |
| UI Audio (UI SFX Set) | Kenney Vleugels / Kenney.nl | https://kenney.nl/assets/ui-audio | CC0 1.0 (https://creativecommons.org/publicdomain/zero/1.0/) |

These sources were checked and **not** used:

- `kapishdima/soundcn` is under the MIT licence, which covers the repository. The provenance of the individual sounds was not clear, so none were used.
- `remotion.media` sound effects: no licence terms were published on the site at the time of checking, so none were used.

## How to regenerate

Requirements: Python 3 with `numpy scipy soundfile matplotlib pyloudnorm`, and `ffmpeg` for the loudness check. `pip install numpy scipy soundfile matplotlib pyloudnorm` installs the Python packages.

```bash
python3 sound/make_music.py   # music.wav, stems/*.wav, music-cues.json (~40 s)
python3 sound/make_sfx.py     # sfx/*.wav and sound/sfx_sources.json
python3 sound/make_credits.py # this file
python3 sound/qa_music.py     # loudness, true peak, onsets, band balance, qa/music-*.png
python3 sound/qa_sfx.py       # qa/sfx.png contact sheet and boundary/DC checks
```

The renders are deterministic because the random seeds are fixed. The music targets -16 LUFS integrated with true peak at or below -1 dBTP. To change the arrangement, edit the `seq_*` functions in `make_music.py`. The bar grid is fixed: 1 bar = 2 s = 60 frames at 30 fps.
