#!/usr/bin/env python3
"""SFX QA: contact sheet of spectrograms (public/audio/qa/sfx.png) + numeric checks:
peak, DC, boundary samples (clicks), lead-in time to the transient, most-similar pair."""
import glob
import os
import sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import soundfile as sf  # noqa: E402

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dsp import a2db  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SFX = os.path.join(ROOT, "public", "audio", "sfx")
QA = os.path.join(ROOT, "public", "audio", "qa")

files = sorted(glob.glob(os.path.join(SFX, "*.wav")),
               key=lambda p: (os.path.basename(p).rsplit("_", 1)[0], p))
cols = 6
rows = int(np.ceil(len(files) / cols))
fig, axs = plt.subplots(rows, cols, figsize=(cols * 3.2, rows * 2.0))
specs = {}
print(f"{'file':18s} {'dur':>6s} {'peak':>6s} {'DC':>8s} {'first':>7s} {'last':>7s} {'lead-in':>7s}")
for ax, f in zip(axs.flat, files):
    x, sr = sf.read(f, always_2d=True)
    m = x.mean(axis=1)
    name = os.path.basename(f)[:-4]
    pk = np.abs(x).max()
    lead = np.argmax(np.abs(m) > pk * 0.1) / sr
    print(f"{name:18s} {len(m) / sr:6.3f} {a2db(pk):6.1f} {m.mean():8.1e} {a2db(np.abs(x[0]).max()):7.1f} "
          f"{a2db(np.abs(x[-1]).max()):7.1f} {lead * 1000:6.1f}ms {sr}Hz {x.shape[1]}ch")
    ax.specgram(m + 1e-9, NFFT=512, Fs=sr, noverlap=448, cmap="magma", vmin=-120, vmax=-25)
    ax.set_ylim(0, 16000)
    t = np.arange(len(m)) / sr
    ax2 = ax.twinx()
    ax2.plot(t, m, color="cyan", lw=0.4, alpha=0.7)
    ax2.set_ylim(-1, 1)
    ax2.set_yticks([])
    ax.set_title(f"{name}  {len(m) / sr:.2f}s", fontsize=8)
    ax.tick_params(labelsize=6)
    sp = np.abs(np.fft.rfft(m, 16384))
    specs[name] = np.log10(sp[::16] + 1e-9)
for ax in list(axs.flat)[len(files):]:
    ax.axis("off")
fig.tight_layout()
fig.savefig(os.path.join(QA, "sfx.png"), dpi=70)

names = list(specs)
S = np.array([specs[n] - specs[n].mean() for n in names])
S /= np.linalg.norm(S, axis=1, keepdims=True)
C = S @ S.T
np.fill_diagonal(C, -1)
i, j = np.unravel_index(np.argmax(C), C.shape)
print(f"most similar pair (log-spectrum corr): {names[i]} / {names[j]} = {C[i, j]:.3f}")
print(f"{len(files)} files")
