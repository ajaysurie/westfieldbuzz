"""Mix the Runway voices, music and SFX to the timeline.

Usage: python3 mix.py build/mix.wav
Expects 48k stereo WAVs in build/wav/ (see build.sh).
"""

import sys
from pathlib import Path

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, fftconvolve, sosfilt

from timeline import DROP, DURATION, END, MUSIC, REVEAL, SFX, VOICES

SR = 48000
ROOT = Path(__file__).parent
N = int(DURATION * SR)
rng = np.random.default_rng(11)


def db(x):
    return 10 ** (x / 20)


def lp(x, hz, order=2):
    return sosfilt(butter(order, hz, "low", fs=SR, output="sos"), x, axis=0)


def hp(x, hz, order=2):
    return sosfilt(butter(order, hz, "high", fs=SR, output="sos"), x, axis=0)


def load(name):
    sr, x = wavfile.read(ROOT / "build" / "wav" / f"{name}.wav")
    assert sr == SR, (name, sr)
    x = x.astype(np.float64) / 32768.0
    return x if x.ndim == 2 else np.stack([x, x], axis=1)


def room(x, wet, seconds, decay):
    t = np.arange(int(seconds * SR)) / SR
    ir = lp(rng.normal(0, 1, len(t)) * np.exp(-t / decay), 6000)
    ir[0] = 0
    ir /= np.sqrt(np.sum(ir**2))
    out = np.zeros((len(x) + len(ir) - 1, 2))
    for c in range(2):
        out[:, c] = fftconvolve(x[:, c], ir)
    out *= wet
    out[: len(x)] += x
    return out


def place(bus, sig, start, gain_db=0.0):
    i = int(round(start * SR))
    if i >= N:
        return
    sig = sig[: N - i] * db(gain_db)
    bus[i : i + len(sig)] += sig


def fade(x, fin, fout):
    x = x.copy()
    a, b = int(fin * SR), int(fout * SR)
    if a:
        x[:a] *= np.linspace(0, 1, a)[:, None]
    if b:
        x[-b:] *= np.linspace(1, 0, b)[:, None]
    return x


def build_music():
    bus = np.zeros((N, 2))
    for name, src, t0, t1, gain in MUSIC:
        x = load(name)
        a = int(src * SR)
        seg = x[a : a + int((t1 - t0 + 0.15) * SR)]
        hard_out = abs(t1 - DROP) < 1e-6
        seg = fade(seg, 0.02 if t0 in (REVEAL,) else 0.15, 0.0 if hard_out else 0.15)
        if hard_out:
            seg = seg[: int((t1 - t0) * SR)]
        place(bus, seg, t0, gain)
    return bus


def build_voices():
    vo = np.zeros((N, 2))
    whispers = np.zeros((N, 2))
    kids = np.zeros((N, 2))
    for name, off, start, length, gain, kind in VOICES:
        x = load(name)
        a = int(off * SR)
        x = x[a : a + int(length * SR)] if length else x[a:]
        x = fade(x, 0.01, 0.04)
        if kind == "narrator":
            x = x + 0.45 * lp(x, 180)
            place(vo, room(x, 0.2, 2.0, 0.4), start, gain)
        elif kind == "whisper":
            place(whispers, room(hp(x, 120), 0.12, 0.8, 0.18), start, gain)
        else:
            place(kids, room(x, 0.3, 1.0, 0.2), start, gain)
    return vo, whispers, kids


def build_sfx():
    bus = np.zeros((N, 2))
    for name, start, gain in SFX:
        place(bus, load(name), start, gain)
    return bus


def duck_env(voice, depth_db):
    level = np.abs(voice).sum(axis=1)
    active = sosfilt(butter(1, 4, "low", fs=SR, output="sos"), (level > 0.01).astype(float))
    return db(depth_db * np.clip(active * 3, 0, 1))[:, None]


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else str(ROOT / "build" / "mix.wav")
    music = build_music()
    vo, whispers, kids = build_voices()
    sfx = build_sfx()

    music *= duck_env(vo + whispers + kids, -8)
    mix = music + sfx * db(-1) + kids * db(2) + vo * db(4) + whispers * db(6)

    t = np.arange(N) / SR
    gate = np.ones(N)
    gate[(t >= DROP) & (t < REVEAL)] = 0
    tail = (t >= END - 0.6) & (t < END)
    gate[tail] = np.linspace(1, 0, tail.sum())
    gate[t >= END] = 0
    mix *= gate[:, None]

    peak = np.max(np.abs(mix))
    mix = np.tanh(mix / peak * 1.3) / np.tanh(1.3) * 0.89
    wavfile.write(out, SR, (mix * 32767).astype(np.int16))
    print("wrote", out, "peak", round(float(peak), 3))


if __name__ == "__main__":
    main()
