"""Small DSP toolkit shared by make_music.py and make_sfx.py (pileGo! launch film).

Everything is plain numpy/scipy so the audio is fully reproducible from source.
All signals are float64 at SR = 48 kHz; stereo arrays are shaped (2, n).
"""
import numpy as np
from scipy import signal

SR = 48000
TAU = 2 * np.pi


# ----------------------------------------------------------------------------- basics
def db2a(d):
    return 10.0 ** (d / 20.0)


def a2db(a):
    return 20.0 * np.log10(np.maximum(np.abs(a), 1e-12))


def midi_hz(m):
    return 440.0 * 2.0 ** ((np.asarray(m, dtype=float) - 69.0) / 12.0)


def tvec(n):
    return np.arange(n) / SR


def secs(n_seconds):
    return int(round(n_seconds * SR))


def pan_gains(p):
    """Constant-power pan, p in [-1, 1]; centre = 0.7071 each side."""
    a = (np.clip(p, -1, 1) + 1) * np.pi / 4
    return np.cos(a), np.sin(a)


def to_stereo(x, pan=0.0):
    if x.ndim == 2:
        return x
    gl, gr = pan_gains(pan)
    return np.vstack([x * gl, x * gr])


def fade(x, fin=0.0, fout=0.0):
    """Raised-cosine fade in/out (seconds) on mono or stereo arrays (copy)."""
    x = np.array(x, dtype=float, copy=True)
    n = x.shape[-1]
    ni, no = min(secs(fin), n), min(secs(fout), n)
    if ni > 0:
        x[..., :ni] *= 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, ni))
    if no > 0:
        x[..., n - no:] *= 0.5 + 0.5 * np.cos(np.linspace(0, np.pi, no))
    return x


def env_ad(n, attack=0.002, tau=0.2, hold=0.0):
    t = tvec(n)
    a = np.clip(t / max(attack, 1e-5), 0, 1)
    a = np.sin(a * np.pi / 2) ** 2
    d = np.exp(-np.maximum(t - attack - hold, 0) / tau)
    return a * d


def release_at(env, t_off, rel):
    """Multiply an envelope by an exponential release that begins at t_off seconds."""
    n = env.shape[-1]
    i = secs(t_off)
    if i >= n:
        return env
    t = tvec(n - i)
    out = env.copy()
    out[..., i:] *= np.exp(-t / max(rel, 1e-4)) * (1 - np.clip(t / (rel * 6), 0, 1))
    return out


# ----------------------------------------------------------------------------- filters
def sos_filter(x, kind, f, order=2):
    nyq = SR / 2
    if np.ndim(f):
        f = [min(max(v, 5), nyq * 0.98) for v in f]
    else:
        f = min(max(f, 5), nyq * 0.98)
    sos = signal.butter(order, f, btype=kind, fs=SR, output="sos")
    return signal.sosfilt(sos, x, axis=-1)


def lp(x, f, order=2):
    return sos_filter(x, "lowpass", f, order)


def hp(x, f, order=2):
    return sos_filter(x, "highpass", f, order)


def bp(x, f1, f2, order=2):
    return sos_filter(x, "bandpass", [f1, f2], order)


def _biquad(x, b, a):
    return signal.lfilter(np.array(b) / a[0], np.array(a) / a[0], x, axis=-1)


def peq(x, f0, gain_db, q=1.0):
    A = 10 ** (gain_db / 40)
    w = TAU * f0 / SR
    al = np.sin(w) / (2 * q)
    b = [1 + al * A, -2 * np.cos(w), 1 - al * A]
    a = [1 + al / A, -2 * np.cos(w), 1 - al / A]
    return _biquad(x, b, a)


def shelf(x, f0, gain_db, kind="high", s=0.8):
    A = 10 ** (gain_db / 40)
    w = TAU * f0 / SR
    al = np.sin(w) / 2 * np.sqrt((A + 1 / A) * (1 / s - 1) + 2)
    c = np.cos(w)
    sa = 2 * np.sqrt(A) * al
    if kind == "high":
        b = [A * ((A + 1) + (A - 1) * c + sa), -2 * A * ((A - 1) + (A + 1) * c), A * ((A + 1) + (A - 1) * c - sa)]
        a = [(A + 1) - (A - 1) * c + sa, 2 * ((A - 1) - (A + 1) * c), (A + 1) - (A - 1) * c - sa]
    else:
        b = [A * ((A + 1) - (A - 1) * c + sa), 2 * A * ((A - 1) - (A + 1) * c), A * ((A + 1) - (A - 1) * c - sa)]
        a = [(A + 1) + (A - 1) * c + sa, -2 * ((A - 1) + (A + 1) * c), (A + 1) + (A - 1) * c - sa]
    return _biquad(x, b, a)


def svf_tv(x, fc, q=0.707, mode="lp"):
    """Time-varying TPT state-variable filter (Zavalishin/Cytomic). x mono or stereo,
    fc array (len n) or scalar. mode: lp | bp | hp."""
    x = np.atleast_2d(np.asarray(x, dtype=float))
    n = x.shape[-1]
    fc = np.broadcast_to(np.asarray(fc, dtype=float), (n,))
    g = np.tan(np.pi * np.clip(fc, 10, SR * 0.49) / SR)
    k = 1.0 / q
    a1 = 1.0 / (1.0 + g * (g + k))
    a2 = g * a1
    a3 = g * a2
    out = np.zeros_like(x)
    for c in range(x.shape[0]):
        xc = x[c].tolist()
        A1, A2, A3 = a1.tolist(), a2.tolist(), a3.tolist()
        ic1 = ic2 = 0.0
        y = [0.0] * n
        if mode == "lp":
            for i in range(n):
                v3 = xc[i] - ic2
                v1 = A1[i] * ic1 + A2[i] * v3
                v2 = ic2 + A2[i] * ic1 + A3[i] * v3
                ic1 = 2 * v1 - ic1
                ic2 = 2 * v2 - ic2
                y[i] = v2
        elif mode == "bp":
            for i in range(n):
                v3 = xc[i] - ic2
                v1 = A1[i] * ic1 + A2[i] * v3
                v2 = ic2 + A2[i] * ic1 + A3[i] * v3
                ic1 = 2 * v1 - ic1
                ic2 = 2 * v2 - ic2
                y[i] = v1
        else:
            for i in range(n):
                v3 = xc[i] - ic2
                v1 = A1[i] * ic1 + A2[i] * v3
                v2 = ic2 + A2[i] * ic1 + A3[i] * v3
                ic1 = 2 * v1 - ic1
                ic2 = 2 * v2 - ic2
                y[i] = xc[i] - k * v1 - v2
        out[c] = y
    return out if out.shape[0] > 1 else out[0]


# ----------------------------------------------------------------------------- oscillators
def additive(f, n, wave="saw", fc=None, order=2.0, res=0.0, fmax=16000.0, detune=0.0,
             phase=None, rng=None):
    """Band-limited oscillator by additive synthesis (no aliasing by construction).
    fc: optional lowpass cutoff (scalar or per-sample array) applied per harmonic, so
    filter envelopes are free of zipper noise. res adds a resonant bump at fc."""
    t = tvec(n)
    f = f * 2 ** (detune / 1200)
    out = np.zeros(n)
    kmax = max(1, int(min(fmax, SR * 0.45) / f))
    fcv = None if fc is None else np.broadcast_to(np.asarray(fc, dtype=float), (n,))
    for k in range(1, kmax + 1):
        if wave == "square" and k % 2 == 0:
            continue
        if wave == "tri":
            if k % 2 == 0:
                continue
            amp = (1.0 / k ** 2) * (-1) ** ((k - 1) // 2)
        else:
            amp = 1.0 / k
        fk = f * k
        if fcv is not None:
            r = fk / fcv
            gk = 1.0 / np.sqrt(1.0 + r ** (2 * order))
            if res:
                gk = gk + res * np.exp(-((r - 1.0) / 0.35) ** 2)
            if gk.max() < 2e-4:
                break
        else:
            gk = 1.0
        ph = 0.0 if phase is None else (rng.uniform(0, TAU) if phase == "random" else phase)
        out += amp * gk * np.sin(TAU * fk * t + ph)
    return out * (2 / np.pi if wave != "tri" else 8 / np.pi ** 2)


def fm_epiano(f, dur, vel=0.8, rel=0.09, n_tail=None, bright=1.0):
    """Two-operator-pair FM electric piano (Rhodes-ish tine + bark)."""
    tail = rel * 6 if n_tail is None else n_tail
    n = secs(dur + tail)
    t = tvec(n)
    tau = 1.5 * (261.6 / f) ** 0.45
    amp = env_ad(n, 0.0015, tau)
    amp = release_at(amp, dur, rel)
    i1 = (0.35 + 1.5 * vel * bright) * np.exp(-t / 0.4) + 0.22
    body = np.sin(TAU * f * t + i1 * np.sin(TAU * f * t))
    ratio = min(14.0, 7000.0 / f)
    i2 = 1.1 * vel * bright * np.exp(-t / 0.010)
    tine = np.sin(TAU * f * t + i2 * np.sin(TAU * ratio * f * t)) * np.exp(-t / 0.06)
    oct2 = np.sin(TAU * 2 * f * t) * np.exp(-t / 0.35)
    x = body + 0.33 * vel * tine + 0.12 * oct2
    x = np.tanh(1.3 * (x + 0.18 * x * x)) / np.tanh(1.3)  # pickup asymmetry -> warm even harmonics
    return x * amp


def fm_bell(f, n, ratio=3.5, index=2.2, tau=1.0, itau=0.25):
    t = tvec(n)
    i = index * np.exp(-t / itau)
    x = np.sin(TAU * f * t + i * np.sin(TAU * ratio * f * t))
    return x * env_ad(n, 0.001, tau)


def noise(n, rng, color="white"):
    w = rng.standard_normal(n)
    if color == "pink":
        # Paul Kellet-ish pink via filtering in the frequency domain
        W = np.fft.rfft(w)
        fr = np.fft.rfftfreq(n, 1 / SR)
        W[1:] /= np.sqrt(fr[1:] / 100.0)
        W[0] = 0
        w = np.fft.irfft(W, n)
        w /= np.std(w) + 1e-12
    return w


# ----------------------------------------------------------------------------- reverb / delay
def make_ir(rt60, rng, length=None, predelay=0.012, damp_hz=6000, hp_hz=200, er=True, width=1.0):
    """Synthetic stereo reverb IR: decorrelated noise with frequency-dependent decay
    (high bands decay faster), optional early reflections. Returns (2, n)."""
    length = length or rt60 * 1.3
    n = secs(length)
    t = tvec(n)
    bands = [(hp_hz, 600, 1.0), (600, 2500, 0.85), (2500, damp_hz, 0.6), (damp_hz, 16000, 0.35)]
    ir = np.zeros((2, n))
    for c in range(2):
        w = rng.standard_normal(n)
        acc = np.zeros(n)
        for lo, hi, k in bands:
            b = bp(w, lo, hi, 2)
            acc += b * np.exp(-6.91 * t / (rt60 * k))
        ir[c] = acc
    # fade-in of the diffuse tail (softens the onset)
    ir *= np.clip(t / 0.02, 0, 1) ** 1.5
    if er:
        for c in range(2):
            for _ in range(10):
                d = rng.uniform(0.004, 0.045)
                ir[c, secs(d)] += rng.uniform(-1, 1) * 2.5 * np.exp(-d / 0.03)
    m = 0.5 * (ir[0] + ir[1])
    s = 0.5 * (ir[0] - ir[1]) * width
    ir = np.vstack([m + s, m - s])
    ir /= np.sqrt(np.sum(ir ** 2) / 2)
    pd = secs(predelay)
    return np.pad(ir, ((0, 0), (pd, 0)))


def convolve_stereo(x, ir):
    """x (2, n) or (n,), ir (2, m) -> (2, n + m - 1)."""
    x = to_stereo(x) if x.ndim == 1 else x
    mono_in = 0.5 * (x[0] + x[1])
    side_in = 0.5 * (x[0] - x[1])
    l = signal.fftconvolve(mono_in, ir[0]) + 0.5 * signal.fftconvolve(side_in, ir[0])
    r = signal.fftconvolve(mono_in, ir[1]) - 0.5 * signal.fftconvolve(side_in, ir[1])
    return np.vstack([l, r])


def pingpong(x, delay_s, fb=0.4, taps=6, lp_hz=4500, hp_hz=300):
    """Ping-pong delay return (wet only). x stereo (2, n) -> (2, n + taps*d)."""
    x = to_stereo(x) if x.ndim == 1 else x
    d = secs(delay_s)
    n = x.shape[1]
    out = np.zeros((2, n + d * taps))
    src = hp(0.5 * (x[0] + x[1]), hp_hz)
    g = 1.0
    for k in range(1, taps + 1):
        src = lp(src, lp_hz * (0.85 ** (k - 1)), 1)
        ch = (k - 1) % 2
        out[ch, k * d:k * d + n] += src * g
        g *= fb
    return out


# ----------------------------------------------------------------------------- dynamics
def follower(x_abs, attack, release):
    """Peak envelope follower (per-sample loop)."""
    ga = np.exp(-1.0 / (attack * SR))
    gr = np.exp(-1.0 / (release * SR))
    xs = x_abs.tolist()
    y = [0.0] * len(xs)
    e = 0.0
    for i, v in enumerate(xs):
        if v > e:
            e = ga * e + (1 - ga) * v
        else:
            e = gr * e + (1 - gr) * v
        y[i] = e
    return np.array(y)


def comp_gain(x, thr_db=-18, ratio=2.0, knee=6.0, attack=0.012, release=0.18):
    """Stereo-linked feed-forward compressor gain curve (linear), x (2, n)."""
    det = np.max(np.abs(x), axis=0)
    env = follower(det, attack, release)
    lv = a2db(env)
    over = lv - thr_db
    gr = np.where(over <= -knee / 2, 0.0,
                  np.where(over >= knee / 2, over * (1 - 1 / ratio),
                           (1 - 1 / ratio) * (over + knee / 2) ** 2 / (2 * knee)))
    return db2a(-gr)


def limiter_gain(x, ceiling_db=-1.3, lookahead=0.0015, release=0.08, oversample=4):
    """True-peak-aware lookahead limiter gain (linear), x (2, n)."""
    from scipy.ndimage import minimum_filter1d, uniform_filter1d
    up = signal.resample_poly(x, oversample, 1, axis=-1)
    pk = np.max(np.abs(up), axis=0).reshape(-1, oversample).max(axis=1)[: x.shape[1]]
    c = db2a(ceiling_db)
    req = np.minimum(1.0, c / np.maximum(pk, 1e-9))
    L = max(1, secs(lookahead))
    # window min looking ahead, then smooth so the gain is down before the peak
    g = minimum_filter1d(req, size=2 * L + 1, origin=0)
    g = uniform_filter1d(g, size=L, origin=0)
    # release smoothing (gain may fall instantly, rises with time-constant)
    rr = 1 - np.exp(-1.0 / (release * SR))
    gl = g.tolist()
    out = [1.0] * len(gl)
    cur = 1.0
    for i, v in enumerate(gl):
        cur = v if v < cur else cur + (v - cur) * rr
        out[i] = cur
    return np.array(out)


def normalize_peak(x, peak_db=-3.0):
    p = np.max(np.abs(x))
    return x * (db2a(peak_db) / p) if p > 0 else x


def resample(x, sr_in, sr_out=SR):
    from math import gcd
    g = gcd(int(sr_in), int(sr_out))
    return signal.resample_poly(x, sr_out // g, sr_in // g, axis=-1)
