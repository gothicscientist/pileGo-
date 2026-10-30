#!/usr/bin/env python3
"""pileGo! launch film -- original score ("Second Hand, First Class").

Original composition written for this film. 28.000 s, 120 BPM, 4/4, D minor -> F major.
Everything (drums included) is synthesized here; no samples, no third-party material.

    python3 sound/make_music.py

Writes public/audio/music.wav, public/audio/stems/{drums,bass,music,fx}.wav (they sum to
the mix), public/audio/music-cues.json. Licence of the output audio: CC0 1.0.

Timing grid: 1 beat = 0.5 s = 15 frames @30 fps, 1 bar = 2 s = 60 frames, 14 bars.
"""
import json
import os
import sys

import numpy as np
import soundfile as sf

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dsp import *  # noqa: E402,F401,F403

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, "public", "audio")
os.makedirs(os.path.join(OUT, "stems"), exist_ok=True)

BPM = 120
BEAT = 0.5
BAR = 2.0
S16 = 0.125
DUR = 28.0
N = secs(DUR)
NB = N + secs(4.0)  # work buffers carry tails; trimmed at the end
SWING = 0.021  # odd 16ths are late by 21 ms (~58 % swing)
TARGET_LUFS = -16.0
CEILING = -1.2  # dBFS true-peak-aware limiter ceiling

rng = np.random.default_rng(20261030)

BREATH = 3.75   # intro cut: an 8th-note of air before the drop
DROP = 4.0
GATE2 = 21.965  # end of bar-11 filter-down; the finale hits at 22.0
FINALE = 22.0
BUTTON = 24.0
FADE_START, FADE_END = 25.5, 27.8


def T(bar, pos16=0.0, swing=0.0):
    """Absolute time (s) of a 16th position inside a 1-based bar, optional swing."""
    t = (bar - 1) * BAR + pos16 * S16
    if swing and abs(pos16 - round(pos16)) < 1e-9 and int(round(pos16)) % 2 == 1:
        t += swing
    return t


def layer_of(t):
    return 0 if t < DROP - 1e-9 else (1 if t < FINALE - 1e-9 else 2)


# ============================================================================ harmony
CH = {
    "Dm9":    dict(root=38, v=[53, 57, 60, 64], col=10),
    "G13":    dict(root=31, v=[53, 57, 59, 64], col=10),
    "Cmaj9":  dict(root=36, v=[52, 55, 59, 62], col=9),
    "A7sus4": dict(root=33, v=[55, 59, 62, 64], col=10),
    "Bbmaj9": dict(root=34, v=[53, 57, 60, 62], col=9),
    "A7b9":   dict(root=33, v=[55, 61, 64, 70], col=10),
    "C13sus": dict(root=36, v=[58, 62, 65, 69], col=10),
    "Fmaj9":  dict(root=29, v=[53, 57, 60, 64, 67, 72], col=11),
}
# (bar, beat offset in 16ths, chord) -- one chord per bar except bars 11 and 12
CHART = [(1, 0, "Dm9"), (2, 0, "A7sus4"),
         (3, 0, "Dm9"), (4, 0, "G13"), (5, 0, "Cmaj9"), (6, 0, "A7sus4"),
         (7, 0, "Dm9"), (8, 0, "G13"), (9, 0, "Cmaj9"), (10, 0, "A7sus4"),
         (11, 0, "Bbmaj9"), (11, 8, "A7b9"),
         (12, 0, "Dm9"), (12, 8, "C13sus"), (13, 0, "Fmaj9")]


def chord_at(bar):
    return [c for b, p, c in CHART if b == bar and p == 0][0]


# ============================================================================ mixer
class Mixer:
    """Buffers keyed by (stem, layer, bus); bus in dry/room/hall/delay."""

    def __init__(self):
        self.buf = {}

    def _get(self, key):
        if key not in self.buf:
            self.buf[key] = np.zeros((2, NB))
        return self.buf[key]

    def add(self, stem, sig, t, gain=1.0, pan=0.0, room=0.0, hall=0.0, delay=0.0, layer=None,
            pump=None):
        lay = layer_of(t) if layer is None else layer
        s = to_stereo(np.asarray(sig, dtype=float), pan) * gain
        i = secs(t)
        n = min(s.shape[1], NB - i)
        if n <= 0:
            return
        s = s[:, :n]
        if pump is not None:
            s = s * PUMP_CURVE(pump, i, n)
        for bus, amt in (("dry", 1.0), ("room", room), ("hall", hall), ("delay", delay)):
            if amt:
                self._get((stem, lay, bus))[:, i:i + n] += s * amt


MX = Mixer()
KICKS = []


def _pump(depth, i, n):
    return 1.0 - depth * DUCK[i:i + n]


PUMP_CURVE = _pump
DUCK = np.zeros(NB)


def build_duck():
    t = tvec(secs(0.45))
    shape = np.exp(-t / 0.085) * np.clip(t / 0.003, 0, 1)
    shape[: secs(0.003)] = np.linspace(0, 1, secs(0.003))
    for tk, v in KICKS:
        i = secs(tk)
        n = min(len(shape), NB - i)
        DUCK[i:i + n] = np.maximum(DUCK[i:i + n], shape[:n] * min(1, v))


# ============================================================================ instruments
def kick(vel=1.0):
    n = secs(0.55)
    t = tvec(n)
    f = 49 + 105 * np.exp(-t / 0.032) + 260 * np.exp(-t / 0.0035)
    ph = TAU * np.cumsum(f) / SR
    body = np.sin(ph) * env_ad(n, 0.0008, 0.17, hold=0.02)
    click = hp(noise(n, rng), 2500) * np.exp(-t / 0.0025) * 0.22
    knock = np.sin(TAU * 1150 * t) * np.exp(-t / 0.006) * 0.10
    x = body + click + knock
    x = np.tanh(1.8 * x) / np.tanh(1.8)
    x = hp(x, 28, 2)
    x[: 16] *= np.linspace(0.6, 1, 16)
    return fade(x * vel, 0, 0.02)


def clap(vel=1.0):
    n = secs(0.5)
    t = tvec(n)
    nz = bp(noise(n, rng), 850, 4200, 2)
    env = np.zeros(n)
    for k, d in enumerate([0.0, 0.0095, 0.0185, 0.0265]):
        tt = t - d
        e = np.where(tt >= 0, np.exp(-np.maximum(tt, 0) / (0.0045 if k < 3 else 0.10)), 0)
        env += e * (0.8 if k < 3 else 1.0)
    body = np.sin(TAU * 205 * t) * np.exp(-t / 0.035) * 0.25
    x = nz * env * 0.6 + body
    x = peq(x, 1300, 2.5, 1.2)
    x = hp(x, 260)
    return fade(x * vel / np.max(np.abs(x)), 0, 0.05)


def snare(vel=1.0, tune=1.0):
    n = secs(0.35)
    t = tvec(n)
    f = (190 + 60 * np.exp(-t / 0.01)) * tune
    body = np.sin(TAU * np.cumsum(f) / SR) * np.exp(-t / 0.05)
    nz = bp(noise(n, rng), 1600, 9000) * np.exp(-t / 0.075)
    x = 0.55 * body + 0.8 * nz
    x = hp(x, 150)
    return fade(x * vel / np.max(np.abs(x)), 0, 0.04)


METAL = [3170, 4720, 6610, 8240, 9930, 11420]


def hat(vel=1.0, open_=False):
    n = secs(0.5 if open_ else 0.09)
    t = tvec(n)
    tau = 0.12 if open_ else 0.020
    nz = hp(noise(n, rng), 7000, 2)
    met = sum(np.sin(TAU * f * (1 + rng.uniform(-0.01, 0.01)) * t + rng.uniform(0, TAU)) for f in METAL)
    x = (nz + 0.18 * hp(met, 6000)) * env_ad(n, 0.0004, tau)
    x = peq(x, 10500, 2.0, 0.9)
    x = shelf(x, 14000, -3, "high")
    return fade(x * vel / np.max(np.abs(x)), 0, 0.01)


def shaker(vel=1.0):
    n = secs(0.09)
    t = tvec(n)
    nz = bp(noise(n, rng), 4200, 11000, 2)
    e = np.clip(t / 0.007, 0, 1) ** 2 * np.exp(-np.maximum(t - 0.007, 0) / 0.022)
    x = nz * e
    return fade(x * vel / np.max(np.abs(x)), 0, 0.01)


def conga(vel=1.0, f0=330):
    n = secs(0.3)
    t = tvec(n)
    f = f0 * (1 + 0.18 * np.exp(-t / 0.012))
    x = np.sin(TAU * np.cumsum(f) / SR) * np.exp(-t / 0.10)
    x += 0.3 * bp(noise(n, rng), 1500, 5000) * np.exp(-t / 0.006)
    return fade(x * vel / np.max(np.abs(x)), 0, 0.03)


def crash(length=2.8, seed=0):
    r = np.random.default_rng(seed)
    n = secs(length)
    t = tvec(n)
    out = np.zeros((2, n))
    for c in range(2):
        nz = hp(r.standard_normal(n), 3500, 2) * np.exp(-t / 0.75)
        met = np.zeros(n)
        for _ in range(48):
            f = r.uniform(2800, 13500)
            met += np.sin(TAU * f * t + r.uniform(0, TAU)) * np.exp(-t / r.uniform(0.3, 1.1)) / 48 ** 0.5
        x = nz + 0.25 * hp(met, 2500)
        x *= np.clip(t / 0.0015, 0, 1)
        x = shelf(x, 12000, -4, "high")
        out[c] = x
    return fade(out / np.max(np.abs(out)), 0, 0.3)


def bass_note(midi, dur, vel=1.0, rel=0.03):
    f = float(midi_hz(midi))
    n = secs(dur + rel * 5 + 0.01)
    t = tvec(n)
    fc = 190 + 2100 * vel * np.exp(-t / 0.06) + 260 * np.exp(-t / 0.35)
    saw = additive(f, n, "saw", fc=fc, order=2, res=0.35, fmax=7000)
    sq = additive(f, n, "square", fc=fc * 0.8, order=2, fmax=5000)
    sub = np.sin(TAU * f * t)
    x = 0.5 * saw + 0.18 * sq + 0.75 * sub
    env = env_ad(n, 0.0025, 0.5) * (0.72 + 0.28 * np.exp(-t / 0.10))
    env = release_at(env, dur, rel)
    x = np.tanh(1.7 * x * env) / np.tanh(1.7)
    return fade(x * vel, 0.0, 0.004)


def rhodes_chord(notes, dur, vel=0.8, t_abs=0.0, tone="full", strum=0.004, rel=0.07):
    parts = []
    for k, m in enumerate(notes):
        v = vel * rng.uniform(0.88, 1.0)
        x = fm_epiano(float(midi_hz(m)), dur, v, rel=rel)
        x = np.pad(x, (secs(k * strum * rng.uniform(0.5, 1)), 0))
        parts.append(x)
    n = max(len(p) for p in parts)
    x = sum(np.pad(p, (0, n - len(p))) for p in parts) / len(notes) ** 0.6
    x = np.tanh(1.5 * x) / 1.5  # tape-ish saturation of the chord bus
    x = lp(x, 7500, 1)
    x = peq(x, 140, 1.5, 0.8)
    if tone == "open":  # bars 3-5: keep the mids open for the UI shots
        x = peq(x, 1800, -4.0, 0.8)
        x = lp(x, 3200, 1)
    # suitcase tremolo / autopan, phase-locked to absolute time
    tt = t_abs + tvec(len(x))
    lfo = np.sin(TAU * 4.0 * tt)
    st = np.vstack([x * (1 - 0.16 * (1 + lfo) / 2), x * (1 - 0.16 * (1 - lfo) / 2)])
    return fade(st, 0, 0.004)


def pad_chord(notes, dur, att=0.35, rel=0.9, cutoff=2400, level=1.0, tau=None):
    n = secs(dur + rel * 4)
    out = np.zeros((2, n))
    for m in notes:
        f = float(midi_hz(m))
        for det, pan in ((-9, -0.75), (0, 0.0), (8, 0.75)):
            x = additive(f, n, "saw", fc=cutoff, order=2, fmax=9000, detune=det,
                         phase="random", rng=rng)
            out += to_stereo(x, pan)
    env = env_ad(n, att, tau if tau else 1e6)
    env = release_at(env, dur, rel)
    out *= env
    out = hp(out, 140)
    out = peq(out, 2600, -2.0, 0.8)
    return out * level / (len(notes) * 3) ** 0.5


def pluck_lead(midi, dur, vel=1.0):
    f = float(midi_hz(midi))
    n = secs(dur + 0.35)
    t = tvec(n)
    fc = 650 + 3400 * vel * np.exp(-t / 0.09)
    x = 0.55 * additive(f, n, "square", fc=fc, order=2, res=0.25, fmax=12000)
    x += 0.45 * additive(f, n, "saw", fc=fc * 0.9, order=2, fmax=12000)
    x += 0.22 * fm_bell(2 * f, n, ratio=1.0, index=1.2, tau=0.5, itau=0.08)
    env = env_ad(n, 0.003, 0.9) * (0.55 + 0.45 * np.exp(-t / 0.18))
    env = release_at(env, dur, 0.05)
    return fade(x * env * vel, 0, 0.01)


def arp_note(midi, vel=1.0):
    f = float(midi_hz(midi))
    n = secs(0.4)
    t = tvec(n)
    x = additive(f, n, "tri", fmax=8000) + 0.4 * np.sin(TAU * 2 * f * t)
    x *= env_ad(n, 0.002, 0.11)
    return fade(lp(x, 3800, 1) * vel, 0, 0.01)


# ============================================================================ sequencing
def seq_drums():
    # --- kick: 4-on-the-floor; intro is muffled by the master sweep
    for bar in range(1, 13):
        for b in range(4):
            t = T(bar, b * 4)
            if bar == 2 and b >= 2:  # leave room for the riser
                continue
            if bar == 8 and b == 3:  # fill
                continue
            if bar == 11 and b == 3:  # snare build
                continue
            if bar == 12:
                v = 1.0 if b == 0 else 0.78
            elif bar <= 2:
                v = 0.9
            else:
                v = 1.0 if b in (0, 2) else 0.95
            KICKS.append((t, v))
    KICKS.append((BUTTON, 1.0))
    for t, v in KICKS:
        MX.add("drums", kick(v), t, gain=db2a(-4.5))

    # --- clap on 2 & 4 (bars 3-11), only beat 4 in the lighter bar 12
    for bar in range(3, 12):
        for b in (1, 3):
            if bar == 11 and b == 3:
                continue
            MX.add("drums", clap(rng.uniform(0.92, 1.0)), T(bar, b * 4) + 0.002,
                   gain=db2a(-4.5), room=0.35)
    MX.add("drums", clap(0.75), T(12, 12) + 0.002, gain=db2a(-8.5), room=0.35)

    # --- hats
    def hats_bar(bar, density="full", lvl=0.0, stop=None):
        for p in range(16):
            t = T(bar, p, SWING)
            if stop is not None and t >= stop:
                continue
            if p % 4 == 2:  # offbeat 8th: open hat
                MX.add("drums", hat(rng.uniform(0.85, 1.0), True), t,
                       gain=db2a(-12 + lvl), pan=0.12, room=0.06)
            elif p % 2 == 1:
                MX.add("drums", hat(rng.uniform(0.75, 1.0)), t,
                       gain=db2a(-11.5 + lvl + (1.5 if p % 4 == 3 else 0)), pan=-0.18, room=0.04)
            elif density == "full":
                MX.add("drums", hat(rng.uniform(0.5, 0.65)), t, gain=db2a(-17.5 + lvl), pan=-0.18)

    for bar in (1, 2):
        for p in (2, 6, 10, 14):
            if bar == 2 and p > 10:
                continue
            MX.add("drums", hat(0.9, True), T(bar, p), gain=db2a(-21), pan=0.12)
    for bar in range(3, 6):
        hats_bar(bar, "light")
    for bar in range(6, 11):
        hats_bar(bar, "full", 0.5)
    hats_bar(11, "full", 0.5, stop=T(11, 8))
    hats_bar(12, "light", -2.0, stop=T(12, 14))

    # --- bar 8 fill (15.5 -> 16.0): snare 16ths/32nds rising
    for k, (p, v) in enumerate([(13, 0.45), (14, 0.6), (14.5, 0.55), (15, 0.75), (15.5, 0.9)]):
        MX.add("drums", snare(v, 1.0 + 0.05 * k), T(8, p), gain=db2a(-10), room=0.3, pan=0.05)
    # --- bar 11 build over beats 3-4 (21.0 -> 21.97): 8ths, 16ths, 32nds, crescendo
    build = [8, 10, 12, 13, 14, 14.5, 15, 15.25, 15.5, 15.75]
    for k, p in enumerate(build):
        v = 0.35 + 0.6 * k / (len(build) - 1)
        MX.add("drums", snare(v, 0.95 + 0.04 * k), T(11, p), gain=db2a(-10.5), room=0.3)

    # --- shaker + congas: bars 9-11 (whole-closet energy)
    sh_acc = [0.45, 0.6, 1.0, 0.6]
    for bar in (9, 10, 11):
        for p in range(16):
            if bar == 11 and p >= 8:
                break
            MX.add("drums", shaker(sh_acc[p % 4] * rng.uniform(0.85, 1)), T(bar, p, SWING * 0.9),
                   gain=db2a(-14), pan=0.42, room=0.08)
        for p, f0, v in [(3, 330, 0.7), (6, 250, 0.85), (10, 330, 0.6), (11, 330, 0.75), (14, 250, 0.9)]:
            if bar == 11 and p >= 8:
                continue
            MX.add("drums", conga(v, f0), T(bar, p, SWING * 0.8), gain=db2a(-15), pan=-0.38, room=0.15)

    # --- crashes
    for t, g in ((DROP, -10.5), (T(6), -17.0), (T(9), -12.0), (FINALE, -9.5), (BUTTON, -13.0)):
        MX.add("drums", crash(3.2 if t >= FINALE else 2.4, seed=int(t * 10)), t,
               gain=db2a(g), room=0.12, hall=0.08 if t >= FINALE else 0.0)


def seq_bass():
    def note(t, m, d16, v):
        MX.add("bass", bass_note(m, d16 * S16 * 0.92, v), t, gain=db2a(-11.0), pump=0.5)

    full = [(0, 0, 2.2, 1.0), (3, 0, 0.8, 0.55), (4, 12, 1.0, 0.8), (6, 0, 1.6, 0.9),
            (9, 7, 0.8, 0.6), (10, 12, 1.0, 0.85), (12, 0, 1.4, 0.8), (14, "col", 0.9, 0.7),
            (15, "lead", 0.9, 0.75)]
    intro = [(0, 0, 3.5, 0.8), (6, 0, 1.5, 0.75), (10, 12, 1, 0.7), (12, 0, 2, 0.75)]
    bars = [(b, c) for b, p, c in CHART if p == 0 and b <= 10]
    for idx, (bar, cname) in enumerate(bars):
        c = CH[cname]
        nxt = CH[bars[idx + 1][1]]["root"] if idx + 1 < len(bars) else CH["Bbmaj9"]["root"]
        pat = intro if bar <= 2 else full
        for p, iv, d, v in pat:
            if bar == 2 and p >= 10:
                continue
            if iv == "col":
                m = c["root"] + c["col"]
            elif iv == "lead":
                m = nxt - 1 if abs(nxt - 1 - c["root"]) <= 7 else nxt + 11
            else:
                m = c["root"] + iv
            if bar in (5, 9) and p == 3:
                continue
            note(T(bar, p, SWING * 0.5), m, d, v)
    # bar 11: Bbmaj9 -> A7b9, driving 8ths/16ths under the filter-down
    bb, a = CH["Bbmaj9"]["root"], CH["A7b9"]["root"]
    for p, m, d, v in [(0, bb, 2, 1.0), (3, bb, 0.8, 0.6), (4, bb + 12, 1, 0.8), (6, bb, 1.5, 0.85),
                       (8, a, 1, 0.95), (9, a, 0.8, 0.6), (10, a + 12, 1, 0.8), (11, a, 0.8, 0.65),
                       (12, a, 0.9, 0.85), (13, a + 12, 0.8, 0.7), (14, a, 0.9, 0.85), (15, a + 4, 0.7, 0.8)]:
        note(T(11, p, SWING * 0.5), m, d, v)
    # bar 12: big D, then ii-V into F
    note(FINALE, 38, 6, 1.0)
    for p, m, d, v in [(6, 38, 1, 0.7), (8, 36, 2, 0.85), (11, 36, 0.8, 0.6), (12, 48, 1, 0.7), (14, 40, 1, 0.75)]:
        note(T(12, p, SWING * 0.5), m, d, v)
    # button: F1 + F2, rings ~1.6 s
    MX.add("bass", bass_note(29, 0.7, 1.0, rel=0.3), BUTTON, gain=db2a(-10.5))
    MX.add("bass", bass_note(41, 0.25, 0.7, rel=0.2), BUTTON, gain=db2a(-15.0))


def seq_music():
    sparse = [(0, 1.5, 0.85), (6, 1.0, 0.65), (11, 1.5, 0.72)]
    full = [(0, 1.5, 0.85), (3, 0.8, 0.6), (6, 1.2, 0.72), (11, 1.4, 0.75), (14, 0.8, 0.6)]

    def stab(t, notes, d16, v, tone="full", hall=0.2, gain=-9.5, delay=0.0):
        MX.add("music", rhodes_chord(notes, d16 * S16, v, t, tone), t, gain=db2a(gain),
               hall=hall, delay=delay, pump=0.4)

    # intro: stabs + pad (filtered by the master intro sweep)
    for bar in (1, 2):
        v = CH[chord_at(bar)]["v"]
        for p, d, vel in sparse:
            if bar == 2 and p > 8:
                continue
            stab(T(bar, p, SWING * 0.6), v, d, vel)
    MX.add("music", pad_chord(CH["Dm9"]["v"], 2.0, att=0.8, rel=0.4, cutoff=1800), 0.0,
           gain=db2a(-15), hall=0.25, pump=0.5)
    MX.add("music", pad_chord(CH["A7sus4"]["v"], 1.7, att=0.3, rel=0.2, cutoff=1800), 2.0,
           gain=db2a(-15), hall=0.25, pump=0.5)

    for bar in range(3, 11):
        v = CH[chord_at(bar)]["v"]
        pat = sparse if bar <= 5 else full
        tone = "open" if bar <= 5 else "full"
        for p, d, vel in pat:
            stab(T(bar, p, SWING * 0.6), v, d, vel, tone, gain=-9.5 if bar <= 5 else -9.5)
    # bar 11
    for p, d, vel in [(0, 1.5, 0.85), (3, 0.8, 0.6), (6, 1.2, 0.7)]:
        stab(T(11, p, SWING * 0.6), CH["Bbmaj9"]["v"], d, vel)
    for p, d, vel in [(8, 1.2, 0.85), (11, 0.8, 0.65), (12, 0.8, 0.7), (14, 0.8, 0.75), (15, 0.7, 0.8)]:
        stab(T(11, p, SWING * 0.6), CH["A7b9"]["v"], d, vel)

    # soft string pad for bars 9-11 (energy without clutter)
    for bar, cn, d in [(9, "Cmaj9", 2.0), (10, "A7sus4", 2.0), (11, "Bbmaj9", 1.0)]:
        MX.add("music", pad_chord(CH[cn]["v"], d, att=0.25, rel=0.3, cutoff=2600),
               T(bar), gain=db2a(-20), hall=0.3, pump=0.55)
    MX.add("music", pad_chord(CH["A7b9"]["v"], 0.95, att=0.15, rel=0.1, cutoff=2600), T(11, 8),
           gain=db2a(-20), hall=0.3, pump=0.55)

    # --- hook motif (bars 6-11): same rhythm every bar, ladder follows the chord
    rhythm = [(0, 2.0), (3, 2.0), (6, 3.0), (10, 1.5), (12, 3.0)]
    ladders = {6: [74, 76, 81, 79, 76], 7: [74, 77, 81, 79, 76], 8: [74, 77, 81, 79, 77],
               9: [72, 74, 79, 76, 74], 10: [74, 76, 81, 79, 76], 11: [74, 77, 81]}
    for bar, notes in ladders.items():
        for k, m in enumerate(notes):
            p, d = rhythm[k]
            if bar == 11 and k == 2:
                d = 5.0
            vel = 1.0 if k in (0, 2) else 0.82
            MX.add("music", pluck_lead(m, d * S16 * 0.95, vel), T(bar, p, SWING * 0.6),
                   gain=db2a(-13.5), hall=0.18, delay=0.24, pump=0.22)

    # --- arp layer (bars 6-11), 16ths, chord tones an octave up, ping-pong panned
    order = [0, 2, 1, 3, 2, 0, 3, 1]
    k = 0
    for bar in range(6, 12):
        for p in range(16):
            if bar == 11:
                cn = "Bbmaj9" if p < 8 else "A7b9"
            else:
                cn = chord_at(bar)
            v = CH[cn]["v"]
            m = v[order[k % 8] % len(v)] + 12
            acc = 1.0 if p % 2 else 0.7
            lvl = -22.5 if bar < 9 else -21.0
            MX.add("music", arp_note(m, acc), T(bar, p, SWING * 0.6), gain=db2a(lvl),
                   pan=0.45 if k % 2 else -0.45, hall=0.15, delay=0.3, pump=0.4)
            k += 1

    # --- FINALE 22.0: big Dm9 hit (Rhodes + pad + octave doubling)
    big = CH["Dm9"]["v"] + [69, 74]
    stab(FINALE, big, 7.0, 1.0, hall=0.35, gain=-11.5)
    MX.add("music", pad_chord(CH["Dm9"]["v"] + [62, 69], 0.9, att=0.006, rel=0.7, cutoff=3200, tau=1.2),
           FINALE, gain=db2a(-13), hall=0.4)
    # lighter bar 12: C13sus stabs
    for p, d, vel in [(8, 1.5, 0.7), (11, 1.0, 0.6), (13, 0.8, 0.55)]:
        stab(T(12, p, SWING * 0.6), CH["C13sus"]["v"], d, vel, gain=-15.0)
    # pickup into the button: E5 G5 -> A5
    for p, m in [(13, 76), (14, 79)]:
        MX.add("music", pluck_lead(m, 0.11, 0.8), T(12, p), gain=db2a(-16.5), hall=0.2, delay=0.15)

    # --- BUTTON 24.0: Fmaj9, rings out
    fm = CH["Fmaj9"]["v"]
    MX.add("music", rhodes_chord(fm, 2.6, 0.95, BUTTON, strum=0.006, rel=0.8), BUTTON,
           gain=db2a(-11.5), hall=0.45)
    MX.add("music", pad_chord(fm, 1.6, att=0.01, rel=1.4, cutoff=2600, tau=1.5), BUTTON,
           gain=db2a(-14), hall=0.5)
    MX.add("music", pluck_lead(81, 0.5, 1.0), BUTTON, gain=db2a(-15), hall=0.35, delay=0.3)
    for k, (m, d) in enumerate([(81, 0.0), (84, 0.035), (88, 0.07)]):
        b = fm_bell(float(midi_hz(m)), secs(3.0), ratio=3.5, index=1.4, tau=1.3, itau=0.2)
        MX.add("music", b, BUTTON + d, gain=db2a(-24 - 2 * k), pan=(-0.3, 0.3, 0.0)[k], hall=0.6)


def seq_fx():
    # vinyl crackle bed (0-28 s): ticks + pops + hiss + rumble, louder in the intro
    n = N
    t = tvec(n)
    bed = np.zeros((2, n))
    for rate, amp_mu, width, lpf in ((26, -40, 1, 9000), (2.2, -30, 6, 3500)):
        cnt = rng.poisson(rate * DUR)
        pos = rng.integers(0, n - 64, cnt)
        amps = db2a(amp_mu + rng.normal(0, 4, cnt))
        for p, a in zip(pos, amps):
            pan = rng.uniform(-0.6, 0.6)
            gl, gr = pan_gains(pan)
            imp = rng.standard_normal(width) * a
            bed[0, p:p + width] += imp * gl
            bed[1, p:p + width] += imp * gr
    bed = bp(bed, 900, 9000, 1)
    hiss = np.vstack([noise(n, rng, "pink"), noise(n, rng, "pink")])
    hiss = bp(hiss, 2500, 11000, 1) * db2a(-54)
    rumble = lp(noise(n, rng), 45, 2) * db2a(-44)
    bed += hiss + rumble
    lvl = np.where(t < DROP, db2a(0), db2a(-5))
    lvl[: secs(0.6)] *= np.linspace(0, 1, secs(0.6))
    bed *= lvl
    MX.add("fx", bed, 0.0, gain=db2a(-2), layer=-1)

    # intro riser + reverse crash into 3.75 (the breath), then the drop at 4.0
    def riser(t0, t1, f0=350, f1=9000, gain_db=-17):
        n = secs(t1 - t0)
        u = np.linspace(0, 1, n)
        fc = f0 * (f1 / f0) ** (u ** 1.3)
        x = np.vstack([noise(n, rng), noise(n, rng)])
        x = svf_tv(x, fc, q=2.2, mode="bp")
        x *= (u ** 2.0) * db2a(gain_db) * 4
        x[:, -secs(0.004):] *= np.linspace(1, 0, secs(0.004))
        MX.add("fx", x, t0, hall=0.25, layer=-1)

    def rev_crash(t_end, length, gain_db, seed):
        c = crash(3.0, seed)[:, : secs(length)][:, ::-1].copy()
        c *= np.linspace(0, 1, c.shape[1]) ** 1.5
        c[:, -secs(0.004):] *= np.linspace(1, 0, secs(0.004))
        MX.add("fx", c, t_end - length, gain=db2a(gain_db), layer=-1)

    riser(2.0, BREATH, gain_db=-22)
    rev_crash(BREATH, 1.6, -18, 7)
    riser(T(11, 8), GATE2, f0=500, f1=10000, gain_db=-21)
    rev_crash(GATE2, 1.2, -18, 11)

    # finale impact 22.0: sub boom + thump + air
    n = secs(2.0)
    tt = tvec(n)
    f = 31 + 42 * np.exp(-tt / 0.12)
    boom = np.sin(TAU * np.cumsum(f) / SR) * env_ad(n, 0.002, 0.55)
    thump = lp(noise(n, rng), 160, 2) * np.exp(-tt / 0.09) * 3
    boom = np.tanh(1.4 * (boom + thump)) / np.tanh(1.4)
    MX.add("fx", fade(boom, 0, 0.3), FINALE, gain=db2a(-9), hall=0.12, layer=-1)
    # downlifter after the hit
    n = secs(1.4)
    u = np.linspace(0, 1, n)
    x = np.vstack([noise(n, rng), noise(n, rng)])
    x = svf_tv(x, 7000 * (300 / 7000) ** u, q=1.5, mode="bp") * (1 - u) ** 2 * np.clip(u / 0.02, 0, 1)
    MX.add("fx", x, FINALE + 0.01, gain=db2a(-24), hall=0.3, layer=-1)
    # button: soft sub tap
    n = secs(1.2)
    tt = tvec(n)
    tap = np.sin(TAU * np.cumsum(38 + 30 * np.exp(-tt / 0.06)) / SR) * env_ad(n, 0.002, 0.35)
    MX.add("fx", fade(tap, 0, 0.2), BUTTON, gain=db2a(-15), layer=-1)


# ============================================================================ render
def main():
    print("sequencing...")
    seq_drums()
    build_duck()
    seq_bass()
    seq_music()
    seq_fx()

    print("reverbs...")
    ir_room = make_ir(0.75, np.random.default_rng(1), predelay=0.008, damp_hz=5500)
    ir_hall = make_ir(2.4, np.random.default_rng(2), predelay=0.022, damp_hz=5000)

    stems = {}
    t = tvec(NB)
    for stem in ("drums", "bass", "music", "fx"):
        acc = np.zeros((2, NB))
        for lay in (-1, 0, 1, 2):
            keys = [k for k in MX.buf if k[0] == stem and k[1] == lay]
            if not keys:
                continue
            x = MX.buf.get((stem, lay, "dry"), np.zeros((2, NB))).copy()
            if (stem, lay, "delay") in MX.buf:
                d = pingpong(MX.buf[(stem, lay, "delay")], 0.375, fb=0.38, taps=6)
                x += 0.55 * d[:, :NB]
                MX.buf[(stem, lay, "hall")] = MX.buf.get((stem, lay, "hall"), np.zeros((2, NB))) + 0.2 * d[:, :NB]
            for bus, ir, g in (("room", ir_room, 0.30), ("hall", ir_hall, 0.26)):
                if (stem, lay, bus) in MX.buf:
                    s = hp(MX.buf[(stem, lay, bus)], 250)
                    r = convolve_stereo(s, ir)[:, :NB]
                    x += g * lp(r, 9000, 1)

            if lay == 0:  # intro: rising filter sweep + fade-in, then the breath
                i1 = secs(BREATH)
                u = np.clip(t[:i1] / BREATH, 0, 1)
                fc = 230 * (6500 / 230) ** (u ** 1.7)
                seg = svf_tv(x[:, :i1], fc, q=1.25, mode="lp")
                if stem == "drums":
                    g = db2a(-18 + 16 * u ** 0.9)
                else:
                    g = db2a(-30 + 28 * u ** 0.8)
                seg = seg * g
                x[:, :i1] = seg
                x[:, i1:] = 0
                x[:, i1 - secs(0.006):i1] *= np.linspace(1, 0, secs(0.006))
            if lay == 1:  # bar 11 filter-down (21.0 -> 21.965) on bass + music, then cut
                i0, i1 = secs(T(11, 8) - 0.5), secs(GATE2)
                if stem in ("bass", "music"):
                    tt = t[i0:i1] - (T(11, 8))
                    u = np.clip(tt / (GATE2 - T(11, 8)), 0, 1)
                    fc = 18000 * (330 / 18000) ** (u ** 0.75)
                    x[:, i0:i1] = svf_tv(x[:, i0:i1], fc, q=1.4, mode="lp")
                x[:, i1:] = 0
                x[:, i1 - secs(0.012):i1] *= np.linspace(1, 0, secs(0.012))
            acc += x

        # per-stem tone shaping (linear) + DC removal
        if stem == "drums":
            acc = hp(acc, 25, 2)
        elif stem == "bass":
            acc = hp(lp(acc, 6000, 2), 25, 2)
            m = 0.5 * (acc[0] + acc[1])  # keep the bass mono
            acc = np.vstack([m, m])
        elif stem == "music":
            acc = hp(acc, 110, 2)
            acc = peq(acc, 3200, -1.0, 0.9)
            acc = shelf(acc, 7000, 2.5, "high")
        else:
            acc = hp(acc, 22, 2)
        stems[stem] = acc

    # master fade (shared envelope) -- silent by 27.8 s
    env = np.ones(NB)
    i0, i1 = secs(FADE_START), secs(FADE_END)
    u = np.linspace(0, 1, i1 - i0)
    env[i0:i1] = (0.5 + 0.5 * np.cos(np.pi * u)) ** 1.3
    env[i1:] = 0
    for k in stems:
        stems[k] = stems[k][:, :N] * env[:N]

    # master bus: gentle glue compression + true-peak limiter, computed on the sum and
    # applied identically to every stem so the stems sum exactly to the mix.
    import pyloudnorm as pyln
    meter = pyln.Meter(SR)
    mix_raw = sum(stems.values())
    G = db2a(TARGET_LUFS) / db2a(meter.integrated_loudness(mix_raw.T))
    for it in range(8):
        pre = mix_raw * G
        cg = comp_gain(pre, thr_db=-14, ratio=2.0, knee=6, attack=0.015, release=0.2)
        lg = limiter_gain(pre * cg, ceiling_db=CEILING)
        gain = G * cg * lg
        mix = mix_raw * gain
        L = meter.integrated_loudness(mix.T)
        print(f"  iter {it}: G={a2db(G):+.2f} dB  LUFS={L:.2f}  comp max GR={-a2db(cg.min()):.1f} dB"
              f"  limiter max GR={-a2db(lg.min()):.1f} dB")
        if abs(L - TARGET_LUFS) < 0.05:
            break
        G *= db2a(TARGET_LUFS - L)
    for k in stems:
        stems[k] = stems[k] * gain
    mix = sum(stems.values())

    sf.write(os.path.join(OUT, "music.wav"), mix.T, SR, subtype="PCM_24")
    for k, v in stems.items():
        sf.write(os.path.join(OUT, "stems", f"{k}.wav"), v.T, SR, subtype="PCM_24")
    print("peak", a2db(np.max(np.abs(mix))), "dBFS")

    cues = {
        "bpm": BPM, "fps": 30, "durationSeconds": DUR, "barSeconds": BAR, "beatSeconds": BEAT,
        "key": "D minor -> F major",
        "cues": [
            {"name": "intro_start", "time": 0.0, "frame": 0, "note": "vinyl crackle + muffled kick, filter opens"},
            {"name": "riser_start", "time": 2.0, "frame": 60},
            {"name": "breath", "time": BREATH, "frame": round(BREATH * 30), "note": "8th-note of silence before the drop"},
            {"name": "drop", "time": DROP, "frame": 120, "note": "full groove, Dm9; crash"},
            {"name": "hook_in", "time": 10.0, "frame": 300, "note": "hook motif + arp layer"},
            {"name": "fill", "time": 15.5, "frame": 465, "note": "snare fill into bar 9"},
            {"name": "energy_up", "time": 16.0, "frame": 480, "note": "shaker + congas + pad, crash"},
            {"name": "filter_down", "time": 21.0, "frame": 630, "note": "filter-down + riser + snare build"},
            {"name": "pre_hit_gap", "time": GATE2, "frame": round(GATE2 * 30)},
            {"name": "finale_hit", "time": FINALE, "frame": 660, "note": "big Dm9 + impact + crash (logo)"},
            {"name": "button", "time": BUTTON, "frame": 720, "note": "Fmaj9 stinger, rings out"},
            {"name": "fade_start", "time": FADE_START, "frame": round(FADE_START * 30)},
            {"name": "silence", "time": FADE_END, "frame": round(FADE_END * 30)},
        ],
        "beats": [{"time": round(b * BEAT, 3), "frame": int(b * 15), "bar": b // 4 + 1, "beat": b % 4 + 1}
                  for b in range(56)],
    }
    with open(os.path.join(OUT, "music-cues.json"), "w") as fh:
        json.dump(cues, fh, indent=1)
    print("done")


if __name__ == "__main__":
    main()
