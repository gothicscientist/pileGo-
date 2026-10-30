#!/usr/bin/env python3
"""Writes public/audio/CREDITS.md from sound/sfx_sources.json + the rendered files."""
import glob
import json
import os

import soundfile as sf

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
A = os.path.join(ROOT, "public", "audio")
meta = json.load(open(os.path.join(HERE, "sfx_sources.json")))


def dur(p):
    i = sf.info(p)
    return f"{i.duration:.3f} s, {i.samplerate // 1000} kHz, {'stereo' if i.channels == 2 else 'mono'}"


L = []
w = L.append
w("# pileGo! launch film: audio credits and licences\n")
w("Every audio file in `public/audio/` is listed below, with how it was made, its sources and its licence.\n")
w("**Licence of the audio in this folder:** the music and every synthesized sound are original works made for "
  "this film and are released under **CC0 1.0 Universal** (public domain dedication, "
  "https://creativecommons.org/publicdomain/zero/1.0/). The Kenney recordings that some SFX are built from are "
  "CC0 1.0 as well, so every file here is CC0 1.0. The rest of the repository stays AGPL-3.0. Credit is not "
  "required, but it is welcome: \"Music and sound: pileGo! (CC0), with foley from Kenney.nl (CC0)\".\n")

w("## Music\n")
w("| File | Format | How it was made | Licence |\n|---|---|---|---|")
w(f"| `music.wav` | {dur(os.path.join(A, 'music.wav'))}, 24-bit | **Original composition written for this film** "
  "(working title \"Second Hand, First Class\"). 120 BPM, D minor resolving to F major. Every sound, drums "
  "included, is synthesized by `sound/make_music.py` with `sound/dsp.py`: an FM electric piano, additive "
  "band-limited bass, pad, lead and arp, and synthesized kick, clap, hats, shaker, congas and cymbals. It contains "
  "no samples and no third-party material. | CC0 1.0 |")
for s in ("drums", "bass", "music", "fx"):
    w(f"| `stems/{s}.wav` | {dur(os.path.join(A, 'stems', s + '.wav'))}, 24-bit | Stem of the same render. "
      "The four stems sum sample-for-sample to `music.wav`, because the master compressor and limiter gain is "
      "computed on the sum and applied to every stem. | CC0 1.0 |")
w("| `music-cues.json` | JSON | Bar, beat and cue map in seconds and in frames at 30 fps, written by `make_music.py`. | CC0 1.0 |")
w("")

w("## Sound effects (`sfx/`)\n")
w("All are 48 kHz, 24-bit WAV. The peak is normalised to -3 dBFS, except `ui_tick_*` and `type_*`, which are at -6 dBFS "
  "because they are meant to stay soft. They are made by `sound/make_sfx.py`. \"st\" means semitones of "
  "varispeed (pitch and length change together, as on tape).\n")
w("| File | Format | How it was made | Sources | Licence |\n|---|---|---|---|---|")
for p in sorted(glob.glob(os.path.join(A, "sfx", "*.wav"))):
    n = os.path.basename(p)[:-4]
    m = meta["files"].get(n, {})
    srcs = m.get("sources", [])
    srcs = [s for s in srcs if s != "synthesized in sound/make_sfx.py"] or ["none: fully synthesized"]
    w(f"| `{n}.wav` | {dur(p)} | {m.get('how', '')} | {'; '.join(srcs)} | CC0 1.0 |")
w("")

w("## Third-party sources\n")
w("Only CC0 material was used. The original files are kept unmodified in `sound/sources/kenney/<pack>/`, next to "
  "each pack's own `License.txt`.\n")
w("| Pack | Author | URL | Licence |\n|---|---|---|---|")
names = {"rpg-audio": "RPG Audio", "casino-audio": "Casino Audio (1.1)", "impact-sounds": "Impact Sounds (1.0)",
         "interface-sounds": "Interface Sounds (1.0)", "ui-audio": "UI Audio (UI SFX Set)"}
for k, u in meta["packs"].items():
    w(f"| {names[k]} | Kenney Vleugels / Kenney.nl | {u} | CC0 1.0 (https://creativecommons.org/publicdomain/zero/1.0/) |")
w("")
w("These sources were checked and **not** used:\n")
w("- `kapishdima/soundcn` is under the MIT licence, which covers the repository. The provenance of the individual sounds "
  "was not clear, so none were used.\n"
  "- `remotion.media` sound effects: no licence terms were published on the site at the time of checking, so none were used.\n")

w("## How to regenerate\n")
w("Requirements: Python 3 with `numpy scipy soundfile matplotlib pyloudnorm`, and `ffmpeg` for the loudness check. "
  "`pip install numpy scipy soundfile matplotlib pyloudnorm` installs the Python packages.\n")
w("```bash\n"
  "python3 sound/make_music.py   # music.wav, stems/*.wav, music-cues.json (~40 s)\n"
  "python3 sound/make_sfx.py     # sfx/*.wav and sound/sfx_sources.json\n"
  "python3 sound/make_credits.py # this file\n"
  "python3 sound/qa_music.py     # loudness, true peak, onsets, band balance, qa/music-*.png\n"
  "python3 sound/qa_sfx.py       # qa/sfx.png contact sheet and boundary/DC checks\n"
  "```\n")
w("The renders are deterministic because the random seeds are fixed. The music targets -16 LUFS integrated with "
  "true peak at or below -1 dBTP. To change the arrangement, edit the `seq_*` functions in "
  "`make_music.py`. The bar grid is fixed: 1 bar = 2 s = 60 frames at 30 fps.\n")

with open(os.path.join(A, "CREDITS.md"), "w") as fh:
    fh.write("\n".join(L))
print("wrote CREDITS.md")
