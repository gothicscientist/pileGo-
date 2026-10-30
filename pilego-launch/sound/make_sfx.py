#!/usr/bin/env python3
"""pileGo! launch film -- tactile SFX library.

    python3 sound/make_sfx.py

Writes public/audio/sfx/*.wav (48 kHz, 24-bit). Each file is either synthesized here or
layered/processed from CC0 recordings by Kenney (vendored in sound/sources/kenney/, see
the License.txt next to them). SOURCES below records exactly what went into each file;
public/audio/CREDITS.md is written from it.
"""
import json
import os
import sys

import numpy as np
import soundfile as sf
from scipy import signal

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dsp import *  # noqa: E402,F401,F403

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(HERE, "sources", "kenney")
OUT = os.path.join(ROOT, "public", "audio", "sfx")
os.makedirs(OUT, exist_ok=True)

rng = np.random.default_rng(424242)
SOURCES = {}  # filename -> list of source descriptors
PACK_URL = {
    "rpg-audio": "https://kenney.nl/assets/rpg-audio",
    "casino-audio": "https://kenney.nl/assets/casino-audio",
    "impact-sounds": "https://kenney.nl/assets/impact-sounds",
    "interface-sounds": "https://kenney.nl/assets/interface-sounds",
    "ui-audio": "https://kenney.nl/assets/ui-audio",
}
_used = []


# ----------------------------------------------------------------------------- helpers
def K(pack, name):
    """Load a Kenney CC0 clip as stereo float @48k and remember it for the credits."""
    x, sr = sf.read(os.path.join(SRC, pack, name + ".ogg"), always_2d=True)
    x = x.T
    if x.shape[0] == 1:
        x = np.vstack([x[0], x[0]])
    if sr != SR:
        x = resample(x, sr, SR)
    _used.append(f"Kenney '{pack}' pack: {name}.ogg")
    return x


def st(x):
    return to_stereo(x) if x.ndim == 1 else x


def pitch(x, semis):
    """Varispeed pitch shift (changes length, like tape)."""
    if semis == 0:
        return x
    r = 2 ** (semis / 12)
    n = int(round(x.shape[-1] / r))
    return signal.resample(x, n, axis=-1)


def seg(x, t0, t1=None):
    a = secs(t0)
    b = x.shape[-1] if t1 is None else secs(t1)
    return x[..., a:b]


def onset_trim(x, thr_db=-38, pre=0.0012):
    m = np.max(np.abs(st(x)), axis=0)
    thr = m.max() * db2a(thr_db)
    i = int(np.argmax(m > thr))
    return x[..., max(0, i - secs(pre)):]


def tail_trim(x, thr_db=-62):
    m = np.max(np.abs(st(x)), axis=0)
    thr = m.max() * db2a(thr_db)
    j = len(m) - int(np.argmax(m[::-1] > thr))
    return x[..., :min(len(m), j + secs(0.004))]


def mix(*parts):
    """mix((signal, offset_s, gain_db), ...) -> stereo"""
    parts = [(st(p), o, g) for p, o, g in parts]
    n = max(secs(o) + p.shape[1] for p, o, g in parts)
    out = np.zeros((2, n))
    for p, o, g in parts:
        i = secs(o)
        out[:, i:i + p.shape[1]] += p * db2a(g)
    return out


def finish(name, x, peak_db=-3.0, max_len=None, min_len=None, fin=0.0008, fout=0.03,
           trim_start=True, mono=False, src=None, how=""):
    x = st(np.asarray(x, dtype=float))
    x = hp(x, 25, 2)  # DC / rumble
    if trim_start:
        x = onset_trim(x)
    x = tail_trim(x)
    if max_len and x.shape[1] > secs(max_len):
        x = x[:, :secs(max_len)]
    if min_len and x.shape[1] < secs(min_len):
        x = np.pad(x, ((0, 0), (0, secs(min_len) - x.shape[1])))
    x = fade(x, fin, min(fout, x.shape[1] / SR * 0.4))
    x = normalize_peak(x, peak_db)
    if mono:
        x = 0.5 * (x[0] + x[1])
        x = normalize_peak(x, peak_db)
    path = os.path.join(OUT, name + ".wav")
    sf.write(path, (x.T if x.ndim == 2 else x), SR, subtype="PCM_24")
    SOURCES[name] = {"how": how, "sources": sorted(set(_used)) if src is None else src,
                     "duration": round(x.shape[-1] / SR, 3)}
    _used.clear()
    print(f"{name:18s} {x.shape[-1] / SR:6.3f}s  {'mono' if x.ndim == 1 else 'stereo'}")


ir_small = make_ir(0.35, np.random.default_rng(5), predelay=0.004, damp_hz=6000)
ir_mid = make_ir(0.9, np.random.default_rng(6), predelay=0.010, damp_hz=5500)
ir_big = make_ir(2.2, np.random.default_rng(7), predelay=0.020, damp_hz=5000)


def verb(x, ir, wet=0.2):
    x = st(x)
    r = convolve_stereo(hp(x, 200), ir)
    out = np.pad(x, ((0, 0), (0, r.shape[1] - x.shape[1])))
    return out + wet * r


def air_whoosh(dur, f_lo=500, f_hi=2600, peak_at=0.55, q=0.9, pan_from=-0.4, pan_to=0.4, seed=0):
    r = np.random.default_rng(seed)
    n = secs(dur)
    u = np.linspace(0, 1, n)
    shape = np.where(u < peak_at, (u / peak_at), (1 - u) / (1 - peak_at))
    fc = f_lo * (f_hi / f_lo) ** np.clip(shape, 0, 1)
    nz = np.vstack([r.standard_normal(n), r.standard_normal(n)])
    nz[1] = 0.6 * nz[1] + 0.4 * nz[0]
    x = svf_tv(nz, fc, q=q, mode="bp")
    amp = np.sin(np.pi * np.clip(u, 0, 1)) ** 1.6 * (0.4 + 0.6 * shape)
    x *= amp
    p = pan_from + (pan_to - pan_from) * u
    gl, gr = pan_gains(p)
    m = 0.5 * (x[0] + x[1])
    s = 0.5 * (x[0] - x[1])
    return np.vstack([(m + s) * gl * 1.41, (m - s) * gr * 1.41])


def thump(f0=95, f1=55, tau=0.07, n_s=0.35, nz_lp=220, seed=0):
    r = np.random.default_rng(seed)
    n = secs(n_s)
    t = tvec(n)
    f = f1 + (f0 - f1) * np.exp(-t / 0.02)
    x = np.sin(TAU * np.cumsum(f) / SR) * env_ad(n, 0.0015, tau)
    x += 0.8 * lp(r.standard_normal(n), nz_lp, 2) * env_ad(n, 0.001, tau * 0.6) * 3
    return x


def click(f=3200, tau=0.0025, n_s=0.03, seed=0, bw=(1800, 7000)):
    r = np.random.default_rng(seed)
    n = secs(n_s)
    t = tvec(n)
    x = bp(r.standard_normal(n), *bw) * np.exp(-t / tau)
    x += 0.5 * np.sin(TAU * f * t) * np.exp(-t / (tau * 1.5))
    return x


def glide_tone(f0, f1, dur, curve=1.0):
    n = secs(dur)
    u = np.linspace(0, 1, n)
    f = f0 * (f1 / f0) ** (u ** curve)
    return np.sin(TAU * np.cumsum(f) / SR)


def mallet(f, n_s=0.6, tau=0.35, bright=1.0):
    n = secs(n_s)
    t = tvec(n)
    x = np.sin(TAU * f * t) * np.exp(-t / tau)
    x += 0.25 * bright * np.sin(TAU * 4.0 * f * t) * np.exp(-t / (tau * 0.18))   # marimba-ish overtone
    x += 0.35 * fm_bell(f, n, ratio=1.0, index=0.9 * bright, tau=tau * 0.8, itau=0.05)
    return x * np.clip(t / 0.0015, 0, 1)


SYN = "synthesized in sound/make_sfx.py"


# ============================================================================== build
def fabric():
    def c(i):
        return K("rpg-audio", f"cloth{i}")

    finish("fabric_swish_1", mix((onset_trim(c(1)), 0.0, 0), (air_whoosh(0.5, 450, 2300, 0.4, seed=1), 0.0, -9)),
           max_len=0.62, fout=0.12, how="Kenney cloth1 + synthesized air whoosh (band-pass noise sweep)")
    finish("fabric_swish_2", mix((onset_trim(c(2)), 0.0, 0), (air_whoosh(0.42, 600, 3000, 0.35, 0.4, -0.3, seed=2), 0.0, -12)),
           max_len=0.45, fout=0.10, how="Kenney cloth2 + synthesized air whoosh")
    finish("fabric_swish_3", mix((pitch(onset_trim(c(3)), -2.5), 0.0, 0), (air_whoosh(0.55, 350, 1800, 0.45, seed=3), 0.03, -10)),
           max_len=0.62, fout=0.14, how="Kenney cloth3, varispeed -2.5 st + synthesized air whoosh")
    finish("fabric_swish_4", mix((pitch(onset_trim(c(4)), 1.5), 0.0, 0), (pitch(onset_trim(c(2)), 3), 0.08, -8),
                                 (air_whoosh(0.4, 700, 3400, 0.5, seed=4), 0.0, -14)),
           max_len=0.5, fout=0.1, how="Kenney cloth4 (+1.5 st) layered with cloth2 (+3 st) + air whoosh")

    d1 = K("rpg-audio", "dropLeather")
    finish("fabric_drop_1", verb(mix((onset_trim(d1), 0.0, 0), (thump(90, 52, 0.06, seed=1), 0.0, -8)), ir_small, 0.12),
           max_len=0.42, fout=0.12, how="Kenney dropLeather + synthesized soft low thump, small room")
    i0 = K("impact-sounds", "impactSoft_heavy_000")
    finish("fabric_drop_2", verb(mix((lp(onset_trim(i0), 1400, 2), 0.0, -2), (pitch(onset_trim(c(2)), -2), 0.02, -3)), ir_small, 0.1),
           max_len=0.45, fout=0.15, how="Kenney impactSoft_heavy_000 (low-passed) + cloth2 rustle (-2 st)")
    fc_ = K("impact-sounds", "footstep_carpet_001")
    finish("fabric_drop_3", verb(mix((lp(fc_, 2000, 2), 0.0, 0), (thump(80, 48, 0.05, seed=3), 0.0, -9),
                                     (seg(onset_trim(c(3)), 0.08, 0.36), 0.025, -4)), ir_small, 0.1),
           max_len=0.36, fout=0.12, how="Kenney footstep_carpet_001 + cloth3 tail + synthesized thump")
    i2 = K("impact-sounds", "impactSoft_medium_002")
    hl = K("rpg-audio", "handleSmallLeather")
    finish("fabric_drop_4", verb(mix((lp(pitch(i2, -3), 1600, 2), 0.0, 0), (onset_trim(hl), 0.015, -2),
                                     (thump(110, 60, 0.045, seed=4), 0.0, -10)), ir_small, 0.1),
           max_len=0.3, fout=0.1, how="Kenney impactSoft_medium_002 (-3 st, low-passed) + handleSmallLeather + thump")


def paper():
    fan = K("casino-audio", "card-fan-1")
    finish("paper_shuffle_1", onset_trim(fan, -24), max_len=0.72, fout=0.12, how="Kenney card-fan-1")
    sh = K("casino-audio", "card-shuffle")
    finish("paper_shuffle_2", onset_trim(seg(sh, 0.10, 1.0), -24), max_len=0.85, fout=0.2, how="Kenney card-shuffle (excerpt 0.10-0.95 s)")
    bf = K("rpg-audio", "bookFlip1")
    sh = K("casino-audio", "card-shuffle")
    finish("paper_shuffle_3", mix((onset_trim(bf, -20), 0.0, 0), (pitch(seg(sh, 1.55, 2.1), 1.0), 0.05, -5)),
           max_len=0.7, fout=0.15, how="Kenney bookFlip1 + card-shuffle excerpt (+1 st)")

    s2 = K("casino-audio", "card-slide-2")
    finish("paper_slide_1", s2, max_len=0.5, fout=0.15, how="Kenney card-slide-2")
    s5 = K("casino-audio", "card-slide-5")
    finish("paper_slide_2", pitch(onset_trim(s5, -26), -1.0), max_len=0.55, fout=0.15, how="Kenney card-slide-5 (-1 st)")
    sv = K("casino-audio", "card-shove-3")
    finish("paper_slide_3", lp(onset_trim(sv, -26), 9000, 1), max_len=0.58, fout=0.2, how="Kenney card-shove-3 (gentle top cut)")


def tags():
    b3 = K("rpg-audio", "bookFlip3")
    finish("tag_flick_1", mix((onset_trim(b3), 0.0, 0), (click(4200, 0.002, seed=1), 0.0, -12)),
           max_len=0.22, fout=0.08, how="Kenney bookFlip3 + synthesized paper tick")
    s8 = K("casino-audio", "card-slide-8")
    sw = seg(onset_trim(s8), 0.0, 0.2)
    finish("tag_flick_2", mix((click(3600, 0.0025, seed=2), 0.0, -2), (pitch(sw, 4), 0.012, -4),
                              (click(2900, 0.002, seed=22), 0.095, -14)),
           max_len=0.2, fout=0.07, how="synthesized paper tick x2 (flick + swing-back) + Kenney card-slide-8 excerpt (+4 st)")
    p3 = K("casino-audio", "card-place-3")
    finish("tag_flick_3", mix((pitch(seg(onset_trim(p3), 0.0, 0.18), 2.0), 0.0, 0), (click(5000, 0.0015, seed=3), 0.0, -9),
                              (click(4400, 0.0015, seed=33), 0.13, -18)),
           max_len=0.26, fout=0.08, how="Kenney card-place-3 attack (+2 st) + synthesized ticks")


def tape_rip(dur, density, seed, press_delay, press_pitch):
    r = np.random.default_rng(seed)
    n = secs(dur)
    u = np.linspace(0, 1, n)
    # stick-slip: an impulse train whose rate swells then dies; each impulse is a tiny crack
    rate = density * (np.clip(u / 0.15, 0, 1)) * (1 - u) ** 0.4
    imp = (r.uniform(0, 1, n) < rate / SR) * r.lognormal(0, 0.5, n)
    imp = imp * (r.choice([-1, 1], n))
    cracks = bp(imp, 1800, 9000, 2)
    cracks = signal.lfilter([1], [1, -0.55], cracks)  # tiny ring
    tear = bp(r.standard_normal(n), 1400, 6000, 2) * (0.35 + 0.65 * r.uniform(0, 1, n) ** 3)
    tear = lp(tear * np.sin(np.pi * u) ** 0.7, 7000, 1)
    x = cracks * 3.0 + tear * 0.22
    x *= np.sin(np.pi * np.clip(u * 1.05, 0, 1)) ** 0.5
    pr = K("casino-audio", "card-place-1")
    press = lp(pitch(onset_trim(pr), press_pitch), 3000, 2)
    return mix((x, 0.0, 0), (press, press_delay, -7), (thump(120, 70, 0.03, n_s=0.15, seed=seed), press_delay, -16))


def tape_stamp():
    finish("tape_rip_1", verb(tape_rip(0.32, 1400, 11, 0.36, -2), ir_small, 0.08), max_len=0.58, fout=0.08,
           how="synthesized stick-slip tear (impulse train + band-passed noise) + Kenney card-place-1 as the press")
    finish("tape_rip_2", verb(tape_rip(0.2, 2200, 12, 0.24, 1), ir_small, 0.08), max_len=0.44, fout=0.08,
           how="synthesized quick tear + Kenney card-place-1 (+1 st) press")
    bp1 = K("rpg-audio", "bookPlace1")
    finish("stamp_1", verb(mix((onset_trim(bp1), 0.0, 0), (thump(140, 70, 0.045, n_s=0.25, seed=21), 0.0, -5),
                               (click(1800, 0.004, seed=21, bw=(600, 3500)), 0.0, -12)), ir_small, 0.15),
           max_len=0.34, fout=0.1, how="Kenney bookPlace1 + synthesized rubber thump + paper slap")
    bp3 = K("rpg-audio", "bookPlace3")
    sm = K("impact-sounds", "impactSoft_medium_001")
    finish("stamp_2", verb(mix((pitch(onset_trim(bp3), -2), 0.0, 0), (lp(sm, 2500), 0.0, -5),
                               (thump(120, 62, 0.05, n_s=0.25, seed=22), 0.0, -6)), ir_small, 0.15),
           max_len=0.36, fout=0.1, how="Kenney bookPlace3 (-2 st) + impactSoft_medium_001 + synthesized thump")


def shutters():
    # vintage mechanical: curtain 1, mirror slap, curtain 2, then the advance lever
    def mech_click(f_set, seed, tau=0.012):
        r = np.random.default_rng(seed)
        n = secs(0.05)
        t = tvec(n)
        x = sum(np.sin(TAU * f * t + r.uniform(0, TAU)) * np.exp(-t / (tau * r.uniform(0.6, 1.2))) for f in f_set)
        x += 1.5 * bp(r.standard_normal(n), 2000, 9000) * np.exp(-t / 0.0015)
        return x
    latch = K("rpg-audio", "metalLatch")
    a = mech_click([2150, 3420, 5650, 7900], 1)
    slap = thump(160, 90, 0.018, n_s=0.08, nz_lp=900, seed=2)
    b = mech_click([1980, 3610, 5200, 8300], 3)
    r = np.random.default_rng(4)
    n = secs(0.16)
    ratchet = np.zeros(n)
    for k in range(7):
        i = secs(k * 0.021 + r.uniform(0, 0.003))
        cc = click(2600 + 200 * k, 0.0012, 0.012, seed=40 + k)
        ratchet[i:i + len(cc)] += cc[: n - i] * (0.5 + 0.08 * k)
    x = mix((a, 0.0, 0), (slap, 0.004, -6), (b, 0.062, -2), (lp(onset_trim(latch), 6000), 0.06, -10),
            (ratchet, 0.17, -11))
    finish("shutter_1", verb(x, ir_small, 0.1), max_len=0.4, fout=0.06,
           how="synthesized two-curtain mechanical shutter + mirror slap + advance ratchet, Kenney metalLatch layered low")
    c3 = K("ui-audio", "click3")
    c1 = K("ui-audio", "click1")
    air = hp(np.random.default_rng(9).standard_normal(secs(0.06)), 5000) * env_ad(secs(0.06), 0.002, 0.012)
    x = mix((onset_trim(c3), 0.0, 0), (click(5200, 0.0018, seed=91), 0.0, -6), (air, 0.002, -16),
            (onset_trim(c1), 0.045, -4), (click(4300, 0.0016, seed=92), 0.045, -9))
    finish("shutter_2", verb(x, ir_small, 0.06), max_len=0.25, min_len=0.2, fout=0.05,
           how="Kenney ui-audio click3 + click1 + synthesized ticks and air (modern digital shutter)")


def ui():
    srcs = [("interface-sounds", "tick_001"), ("interface-sounds", "tick_002"), ("ui-audio", "click2"), ("ui-audio", "click5")]
    for k, (f, (pack, nm)) in enumerate(zip([1850, 2150, 2500, 1600], srcs), 1):
        n = secs(0.07)
        t = tvec(n)
        f_ = f * (1 + 0.15 * np.exp(-t / 0.004))
        tone = np.sin(TAU * np.cumsum(f_) / SR) * env_ad(n, 0.0004, 0.010)
        tone += 0.3 * bp(rng.standard_normal(n), 2500, 8000) * np.exp(-t / 0.0012)
        kk = lp(K(pack, nm), 6500, 2)
        x = mix((tone, 0.0, 0), (onset_trim(kk), 0.0, -8 if k != 3 else -5))
        finish(f"ui_tick_{k}", x, peak_db=-6, max_len=0.08, fout=0.02, mono=True,
               how=f"synthesized wooden tap at {f} Hz + Kenney {nm} (low-passed), peak -6 dBFS")

    for k, (f0, pk) in enumerate([(380, ("interface-sounds", "pluck_001")), (470, ("interface-sounds", "pluck_002")),
                                  (560, ("interface-sounds", "drop_001"))], 1):
        n = secs(0.16)
        t = tvec(n)
        f = f0 * (1 + 1.6 * (1 - np.exp(-t / 0.010)))
        x = np.sin(TAU * np.cumsum(f) / SR) * env_ad(n, 0.001, 0.032)
        x += 0.12 * np.sin(2 * TAU * np.cumsum(f) / SR) * env_ad(n, 0.001, 0.015)
        x = lp(x, 4000, 2)
        kk = lp(K(*pk), 5000, 2)
        x = verb(mix((x, 0.0, 0), (kk, 0.0, -14)), ir_small, 0.08)
        finish(f"ui_pop_{k}", x, max_len=0.18, fout=0.05, mono=True,
               how=f"synthesized rising-sine bubble pop (~{f0} Hz) + Kenney {pk[1]} at -14 dB")

    # two-note chimes in the score's key
    for k, (m1, m2) in enumerate([(81, 86), (77, 84)], 1):  # A5->D6 (D minor), F5->C6 (F major)
        x = mix((mallet(float(midi_hz(m1)), 0.5, 0.28), 0.0, 0), (mallet(float(midi_hz(m2)), 0.5, 0.33), 0.085, -1))
        x = verb(x, ir_mid, 0.18)
        finish(f"ui_confirm_{k}", x, max_len=0.58, fout=0.25,
               how=f"synthesized FM mallet chime, notes MIDI {m1}->{m2} ({'A5-D6' if k == 1 else 'F5-C6'})", src=[SYN])


def scan_ai():
    for k, (dur, up_only, seed) in enumerate([(1.4, True, 31), (1.55, False, 32)], 1):
        r = np.random.default_rng(seed)
        n = secs(dur)
        u = np.linspace(0, 1, n)
        if up_only:
            fc = 900 * (9500 / 900) ** (u ** 0.9)
            pan = -0.2 + 0.4 * u
        else:
            fc = 1200 * (8000 / 1200) ** np.sin(np.pi * u)
            pan = -0.7 + 1.4 * u
        nz = np.vstack([r.standard_normal(n), r.standard_normal(n)])
        x = svf_tv(nz, fc, q=3.0, mode="bp") * 0.6
        x += 0.25 * svf_tv(nz[::-1], fc * 1.5, q=6.0, mode="bp")
        # shimmer partials: F-major pentatonic, high, tremolo
        sh = np.zeros(n)
        for m in [84, 86, 89, 91, 93, 96]:
            f = float(midi_hz(m)) * (1 + r.uniform(-0.002, 0.002))
            sh += np.sin(TAU * f * tvec(n)) * (0.5 + 0.5 * np.sin(TAU * r.uniform(5, 11) * tvec(n) + r.uniform(0, 6)))
        sh *= np.exp(-((u - (0.75 if up_only else 0.5)) / 0.28) ** 2) * 0.05
        tone = glide_tone(220, 880, dur, 1.2) if up_only else glide_tone(330, 660, dur, 1.0)
        tone = tone * 0.05 * np.sin(np.pi * u) ** 2
        env = np.sin(np.pi * u) ** 1.2
        mono = x.mean(axis=0) * env + sh + tone
        side = (x[0] - x[1]) * 0.5 * env
        gl, gr = pan_gains(pan)
        y = np.vstack([(mono + side) * gl, (mono - side) * gr]) * 1.41
        y = verb(y, ir_mid, 0.25)
        finish(f"scan_sweep_{k}", y, max_len=min(dur + 0.25, 1.78), fin=0.03, fout=0.3, trim_start=False,
               how="synthesized resonant band-pass noise sweep + pentatonic shimmer + soft glide tone", src=[SYN])

    for k, (asc, seed) in enumerate([(True, 41), (False, 42)], 1):
        r = np.random.default_rng(seed)
        notes = [77, 81, 84, 86, 89, 91, 93, 96, 98]
        n_gr = 11
        times = np.sort(r.uniform(0, 0.36, n_gr))
        times[0] = 0
        seq = np.sort(r.choice(notes, n_gr)) if asc else np.sort(r.choice(notes, n_gr))[::-1]
        parts = []
        for t0, m in zip(times, seq):
            f = float(midi_hz(m)) * (1 + r.uniform(-0.003, 0.003))
            g = fm_bell(f, secs(0.35), ratio=r.choice([2.0, 3.0, 4.0]), index=0.8, tau=0.11, itau=0.03)
            parts.append((to_stereo(g, r.uniform(-0.6, 0.6)), t0, r.uniform(-7, 0)))
        x = verb(mix(*parts), ir_mid, 0.35)
        finish(f"ai_sparkle_{k}", x, max_len=0.78, fout=0.25,
               how=f"synthesized FM bell grains in F-major pentatonic ({'ascending' if asc else 'descending'}) + reverb", src=[SYN])


def typing():
    pool = [("ui-audio", f"click{i}") for i in (1, 2, 3, 4, 5)] + [("ui-audio", "mouseclick1"), ("ui-audio", "mouserelease1"),
                                                                  ("interface-sounds", "click_001")]
    clips = [lp(onset_trim(K(*p)), 7000, 2) for p in pool]
    used = sorted(set(_used))
    for k, (count, seed) in enumerate([(6, 51), (8, 52), (10, 53)], 1):
        r = np.random.default_rng(seed)
        t = 0.0
        parts = []
        for i in range(count):
            c = clips[r.integers(len(clips))]
            c = pitch(c, r.uniform(-3, 2))
            body = thump(r.uniform(260, 340), 180, 0.012, n_s=0.04, nz_lp=1200, seed=int(seed * 10 + i))
            parts.append((to_stereo(mix((c, 0, 0), (body, 0, -12))[0], r.uniform(-0.25, 0.25)), t, r.uniform(-7, 0)))
            t += r.uniform(0.045, 0.085) * (1.6 if r.uniform() < 0.12 else 1.0)
        x = verb(mix(*parts), ir_small, 0.08)
        finish(f"type_{k}", x, peak_db=-6, max_len=0.8, fout=0.05,
               how=f"{count} soft key clicks from Kenney ui-audio/interface clicks (random pitch, level, timing) + synthesized key-bed thump, peak -6 dBFS",
               src=used + [SYN])


def whooshes_impacts():
    for k, (dur, lo, hi, pk, pf, pt, seed) in enumerate([(0.42, 500, 2800, 0.6, -0.5, 0.5, 61),
                                                         (0.55, 350, 2000, 0.5, 0.6, -0.6, 62),
                                                         (0.68, 280, 1600, 0.45, -0.3, 0.3, 63)], 1):
        x = air_whoosh(dur, lo, hi, pk, 0.8, pf, pt, seed=seed)
        x += 0.5 * lp(air_whoosh(dur, 120, 500, pk, 0.7, pf, pt, seed=seed + 100), 600)
        x = verb(x, ir_mid, 0.15)
        finish(f"whoosh_soft_{k}", x, max_len=dur + 0.12, fin=0.02, fout=0.12, trim_start=False,
               how="synthesized: band-pass noise sweep (SVF) with pan motion + low air layer", src=[SYN])

    # riser: 2.000 s exactly, loudest at the very end
    n = secs(2.0)
    u = np.linspace(0, 1, n)
    nz = np.vstack([rng.standard_normal(n), rng.standard_normal(n)])
    x = svf_tv(nz, 300 * (11000 / 300) ** (u ** 1.4), q=2.0, mode="bp")
    tones = sum(glide_tone(float(midi_hz(m)), float(midi_hz(m + 12)), 2.0, 1.6) for m in (50, 57, 62, 65)) / 4
    tones = lp(tones, 3000, 1)
    y = (x + to_stereo(tones) * 0.5) * (u ** 2.2)
    rc = make_ir(1.0, np.random.default_rng(71), predelay=0.0)
    wet = convolve_stereo(hp(y, 300), rc)[:, :n]
    y = y + 0.18 * wet
    y[:, -secs(0.003):] *= np.linspace(1, 0.0, secs(0.003))
    y = normalize_peak(hp(y, 30), -3)
    sf.write(os.path.join(OUT, "riser_1.wav"), y.T, SR, subtype="PCM_24")
    SOURCES["riser_1"] = {"how": "synthesized: resonant noise sweep 300 Hz-11 kHz + D-minor sine cluster gliding up an octave; peak at file end",
                          "sources": [SYN], "duration": 2.0}
    print("riser_1            2.000s  stereo")

    n = secs(1.8)
    t = tvec(n)
    f = 38 + 62 * np.exp(-t / 0.09)
    ph = TAU * np.cumsum(f) / SR
    boom = (np.sin(ph) + 0.35 * np.sin(2 * ph) + 0.12 * np.sin(3 * ph)) * env_ad(n, 0.003, 0.32)
    th = lp(rng.standard_normal(n), 180, 2) * np.exp(-t / 0.08) * 2.5
    ih = lp(K("impact-sounds", "impactSoft_heavy_001"), 900, 2)
    x = mix((np.tanh(1.3 * (boom + th)), 0.0, 0), (ih, 0.0, -10))
    x = verb(x, ir_big, 0.18)
    finish("impact_soft_1", x, max_len=1.8, fout=0.5,
           how="synthesized sub boom (100->38 Hz, with 2nd/3rd harmonics) + low noise thump + Kenney impactSoft_heavy_001 (low-passed), hall")

    coins = K("rpg-audio", "handleCoins2")
    chip = K("casino-audio", "chips-collide-1")
    ting = mallet(2637.0, 0.6, 0.18, bright=0.6) * 0.5 + mallet(3951.0, 0.6, 0.12, bright=0.4) * 0.3
    x = mix((onset_trim(coins), 0.0, 0), (onset_trim(chip), 0.03, -6), (ting, 0.055, -13))
    finish("cash_1", verb(x, ir_mid, 0.15), max_len=0.7, fout=0.25,
           how="Kenney handleCoins2 + chips-collide-1 + a quiet synthesized E7/B7 mallet ting")


def main():
    fabric()
    paper()
    tags()
    tape_stamp()
    shutters()
    ui()
    scan_ai()
    typing()
    whooshes_impacts()
    with open(os.path.join(HERE, "sfx_sources.json"), "w") as fh:
        json.dump({"packs": PACK_URL, "files": SOURCES}, fh, indent=1)


if __name__ == "__main__":
    main()
