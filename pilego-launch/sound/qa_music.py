#!/usr/bin/env python3
"""Measure the music mix (we can't listen, so we look): loudness, true peak, DC, onsets
at the locked hit points, band balance per section, stem-sum check, spectrogram and
waveform PNGs in public/audio/qa/."""
import os
import re
import subprocess
import sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import soundfile as sf  # noqa: E402

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dsp import SR, a2db, bp  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
A = os.path.join(ROOT, "public", "audio")
QA = os.path.join(A, "qa")
os.makedirs(QA, exist_ok=True)


def ebur128(path):
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", path, "-af",
                        "ebur128=peak=true", "-f", "null", "-"], capture_output=True, text=True)
    s = r.stderr[r.stderr.rfind("Summary:"):]
    I = float(re.search(r"I:\s+(-?[\d.]+) LUFS", s).group(1))
    LRA = float(re.search(r"LRA:\s+(-?[\d.]+) LU", s).group(1))
    TP = float(re.search(r"Peak:\s+(-?[\d.]+) dBFS", s).group(1))
    return I, LRA, TP


def main():
    path = os.path.join(A, "music.wav")
    x, sr = sf.read(path)
    info = sf.info(path)
    print(f"music.wav: {info.duration:.4f} s, {sr} Hz, {info.channels} ch, {info.subtype}")
    I, LRA, TP = ebur128(path)
    print(f"integrated {I:.1f} LUFS, LRA {LRA:.1f} LU, true peak {TP:.2f} dBTP, "
          f"sample peak {a2db(np.abs(x).max()):.2f} dBFS")
    print("DC offset L/R:", x.mean(axis=0))
    clip = np.sum(np.abs(x) >= 0.999)
    print("samples at/near full scale:", clip)

    m = x.mean(axis=1)
    # onset check: first sample after t0-20ms exceeding 20 dB over the preceding noise floor
    for t0 in (4.0, 22.0, 24.0):
        i0 = int((t0 - 0.03) * SR)
        seg = np.abs(m[i0:i0 + int(0.06 * SR)])
        floor = seg[: int(0.02 * SR)].max()
        thr = max(floor * 4, 10 ** (-40 / 20))
        k = np.argmax(seg > thr)
        print(f"onset near {t0:.3f}: {(i0 + k) / SR:.5f} s  (floor {a2db(floor):.1f} dBFS)")
    # breath before the drop
    br = x[int(3.76 * SR):int(3.995 * SR)]
    print(f"breath 3.76-3.995 peak {a2db(np.abs(br).max()):.1f} dBFS")
    print(f"tail after 27.8 s peak {a2db(np.abs(x[int(27.8 * SR):]).max() + 1e-12):.1f} dBFS")

    # stems sum
    st = {k: sf.read(os.path.join(A, "stems", f"{k}.wav"))[0] for k in ("drums", "bass", "music", "fx")}
    err = np.abs(sum(st.values()) - x).max()
    print(f"stem-sum max error {a2db(err):.1f} dBFS; stem peaks:",
          {k: round(float(a2db(np.abs(v).max())), 1) for k, v in st.items()})
    # bass/kick mono check
    for k in ("bass",):
        print(f"{k} L-R residual {a2db(np.abs(st[k][:, 0] - st[k][:, 1]).max() + 1e-12):.1f} dBFS")

    # band balance per section (RMS dB)
    bands = [(20, 60, "sub"), (60, 250, "low"), (250, 2000, "mid"), (2000, 5000, "presence"),
             (5000, 16000, "air")]
    secs_ = [(0, 4, "hook"), (4, 10, "drop"), (10, 16, "hook-motif"), (16, 22, "closet"),
             (22, 24, "finale"), (24, 27.8, "button")]
    filt = {b[2]: bp(m, b[0], b[1], 4) for b in bands}
    print("section RMS by band (dBFS):")
    print("  " + " ".join(f"{b[2]:>9}" for b in bands) + "   full")
    for a, b, name in secs_:
        sl = slice(int(a * SR), int(b * SR))
        row = [a2db(np.sqrt(np.mean(filt[bb[2]][sl] ** 2))) for bb in bands]
        full = a2db(np.sqrt(np.mean(m[sl] ** 2)))
        print(f"  {name:<11}" + " ".join(f"{v:9.1f}" for v in row) + f"  {full:6.1f}")

    # long-term spectrum (1/3-oct-ish) of the groove part
    seg = m[int(4 * SR):int(22 * SR)]
    f, p = plt.mlab.psd(seg, NFFT=8192, Fs=SR)[1], plt.mlab.psd(seg, NFFT=8192, Fs=SR)[0]

    # spectrogram + waveform
    fig, ax = plt.subplots(2, 1, figsize=(16, 9), sharex=True, gridspec_kw=dict(height_ratios=[3, 1]))
    ax[0].specgram(m, NFFT=2048, Fs=SR, noverlap=1536, cmap="magma", vmin=-130, vmax=-20, scale="dB")
    ax[0].set_yscale("symlog", linthresh=200)
    ax[0].set_ylim(20, 20000)
    ax[0].set_ylabel("Hz")
    ax[0].set_title("music.wav spectrogram (bars every 2 s)")
    tt = np.arange(len(m)) / SR
    ax[1].plot(tt[::20], x[::20, 0], lw=0.3, color="#c55")
    ax[1].plot(tt[::20], x[::20, 1], lw=0.3, color="#55c", alpha=0.6)
    ax[1].set_ylim(-1, 1)
    for a_ in ax:
        for b in range(15):
            a_.axvline(b * 2, color="w" if a_ is ax[0] else "k", lw=0.5, alpha=0.5)
        for c in (3.75, 4.0, 22.0, 24.0, 27.8):
            a_.axvline(c, color="lime", lw=0.8, alpha=0.8)
    ax[1].set_xlabel("s")
    fig.tight_layout()
    fig.savefig(os.path.join(QA, "music-spectrogram.png"), dpi=80)
    plt.close(fig)

    fig, axs = plt.subplots(5, 1, figsize=(16, 10), sharex=True)
    for a_, (k, v) in zip(axs, [("mix", x)] + list(st.items())):
        a_.plot(tt[::10], v[::10].mean(axis=1), lw=0.3, color="#333")
        a_.set_ylim(-1, 1)
        a_.set_ylabel(k)
        for b in range(15):
            a_.axvline(b * 2, color="r", lw=0.4, alpha=0.4)
    axs[-1].set_xlabel("s")
    fig.tight_layout()
    fig.savefig(os.path.join(QA, "music-waveform.png"), dpi=80)
    plt.close(fig)

    fig, a_ = plt.subplots(figsize=(10, 4))
    a_.semilogx(f[1:], 10 * np.log10(p[1:] + 1e-20))
    a_.set_xlim(20, 20000)
    a_.grid(True, which="both", alpha=0.3)
    a_.set_title("long-term spectrum 4-22 s")
    fig.savefig(os.path.join(QA, "music-ltas.png"), dpi=80)
    plt.close(fig)


if __name__ == "__main__":
    main()
