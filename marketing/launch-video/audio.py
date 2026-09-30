"""Synthesize the score + SFX and mix them with the voiceover.

Usage: python3 audio.py build/mix.wav
Expects trimmed mono 48k WAVs in audio/ (see build.sh).
"""

import sys
from pathlib import Path

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, fftconvolve, sosfilt

from timeline import BLACK, CARD, DROP, DURATION, KIDS, LOGO, MONTAGE_START, REVEAL, VO

SR = 48000
ROOT = Path(__file__).parent
N = int(DURATION * SR)
rng = np.random.default_rng(11)


def db(x):
    return 10 ** (x / 20)


def t_axis(dur):
    return np.arange(int(dur * SR)) / SR


def lp(x, hz, order=2):
    return sosfilt(butter(order, hz, "low", fs=SR, output="sos"), x)


def hp(x, hz, order=2):
    return sosfilt(butter(order, hz, "high", fs=SR, output="sos"), x)


def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], "band", fs=SR, output="sos"), x)


def saw(freq, t):
    return 2 * ((freq * t) % 1.0) - 1


def note(name):
    names = {"C": -9, "C#": -8, "D": -7, "D#": -6, "E": -5, "F": -4, "F#": -3, "G": -2, "G#": -1, "A": 0, "A#": 1, "B": 2}
    pitch, octave = name[:-1], int(name[-1])
    return 440.0 * 2 ** ((names[pitch] + 12 * (octave - 4)) / 12)


class Bus:
    def __init__(self):
        self.l = np.zeros(N)
        self.r = np.zeros(N)

    def add(self, sig, start, gain_db=0.0, pan=0.0):
        i = int(start * SR)
        if i >= N:
            return
        sig = sig[: N - i] * db(gain_db)
        self.l[i : i + len(sig)] += sig * np.sqrt(0.5 * (1 - pan))
        self.r[i : i + len(sig)] += sig * np.sqrt(0.5 * (1 + pan))

    def stereo(self):
        return np.stack([self.l, self.r], axis=1)


def reverb_ir(seconds, decay, bright=6000):
    t = t_axis(seconds)
    ir = rng.normal(0, 1, len(t)) * np.exp(-t / decay)
    ir = lp(ir, bright)
    ir[0] = 0
    return ir / np.sqrt(np.sum(ir**2))


def add_room(x, wet, seconds=1.6, decay=0.35):
    tail = fftconvolve(x, reverb_ir(seconds, decay))[: len(x) + int(seconds * SR)]
    out = np.zeros(len(tail))
    out[: len(x)] += x
    return out + wet * tail


def load(name):
    sr, x = wavfile.read(ROOT / "audio" / f"{name}.wav")
    assert sr == SR, (name, sr)
    x = x.astype(np.float64)
    if x.ndim > 1:
        x = x.mean(axis=1)
    return x / 32768.0


# ---------- instruments ----------

def braam(dur=3.2, root=55.0):
    t = t_axis(dur)
    env = np.minimum(t / 0.08, 1) * np.exp(-t / 1.1)
    sig = sum(saw(root * m * (1 + d), t) for m in (1, 2, 3) for d in (-0.004, 0.0, 0.005))
    cutoff = 180 + 1400 * np.exp(-t / 0.5)
    # time-varying LP approximated by crossfading two static filters
    lo, hi = lp(sig, 220, 4), lp(sig, 1600, 4)
    mix = (cutoff - 180) / 1400
    return (lo * (1 - mix) + hi * mix) * env * 0.12


def boom(dur=2.0, f0=70.0):
    t = t_axis(dur)
    f = f0 * np.exp(-t / 0.35) + 32
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.6)
    click = lp(rng.normal(0, 1, len(t)), 2500) * np.exp(-t / 0.015) * 0.4
    return (body + click) * 0.9


def taiko(dur=0.7):
    t = t_axis(dur)
    f = 120 * np.exp(-t / 0.05) + 60
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.18)
    skin = bp(rng.normal(0, 1, len(t)), 150, 900) * np.exp(-t / 0.04) * 0.5
    return (body + skin) * 0.7


def tick(high=True):
    t = t_axis(0.06)
    freq = 3200 if high else 2400
    return np.sin(2 * np.pi * freq * t) * np.exp(-t / 0.006) * 0.25 + hp(rng.normal(0, 1, len(t)), 4000) * np.exp(-t / 0.003) * 0.08


def string_note(freq, dur, bright=1500):
    t = t_axis(dur)
    env = np.minimum(t / 0.01, 1) * np.exp(-t / (dur * 0.7))
    sig = saw(freq, t) + saw(freq * 1.004, t) * 0.7 + saw(freq * 0.996, t) * 0.7
    return lp(sig, bright, 2) * env * 0.1


def pad(freqs, dur, attack=0.6, release=1.0):
    t = t_axis(dur)
    env = np.minimum(t / attack, 1) * np.minimum(np.maximum(dur - t, 0) / release, 1)
    sig = np.zeros(len(t))
    for f in freqs:
        for d in (-0.003, 0.0, 0.003):
            sig += np.sin(2 * np.pi * f * (1 + d) * t) + 0.25 * np.sin(4 * np.pi * f * (1 + d) * t)
    return lp(sig, 2500) * env * 0.03


def pluck(freq, dur=1.4):
    t = t_axis(dur)
    sig = np.sin(2 * np.pi * freq * t) + 0.4 * np.sin(4 * np.pi * freq * t) * np.exp(-t / 0.3) + 0.15 * np.sin(6 * np.pi * freq * t) * np.exp(-t / 0.15)
    return sig * np.minimum(t / 0.004, 1) * np.exp(-t / 0.5) * 0.12


def noise_riser(dur):
    t = t_axis(dur)
    p = t / dur
    n = rng.normal(0, 1, len(t))
    bands = [bp(n, lo, lo * 2.5) for lo in (300, 800, 2000, 5000)]
    idx = p * (len(bands) - 1)
    out = np.zeros(len(t))
    for k, b in enumerate(bands):
        out += b * np.clip(1 - np.abs(idx - k), 0, 1)
    tone = np.sin(2 * np.pi * np.cumsum(110 * 2 ** (p * 3)) / SR) * 0.3
    return (out * 0.35 + tone) * p**2.2


def whoosh(dur=0.45):
    t = t_axis(dur)
    env = np.sin(np.pi * t / dur) ** 2
    return bp(rng.normal(0, 1, len(t)), 400, 3500) * env * 0.35


def flutter(dur):
    t = t_axis(dur)
    am = 0.5 + 0.5 * np.sign(np.sin(2 * np.pi * (13 + 4 * np.sin(2 * np.pi * 1.7 * t)) * t))
    am = lp(am, 60)
    paper = bp(rng.normal(0, 1, len(t)), 900, 5000) * am
    wind = lp(rng.normal(0, 1, len(t)), 500) * 0.6
    fade = np.minimum(np.minimum(t / 0.05, 1), np.minimum((dur - t) / 0.08, 1))
    return (paper * 0.25 + wind * 0.25) * fade


def phone_tap():
    t = t_axis(0.05)
    return (np.sin(2 * np.pi * 1800 * t) * 0.3 + hp(rng.normal(0, 1, len(t)), 3000) * 0.2) * np.exp(-t / 0.008)


# ---------- arrangement ----------

def build_music():
    m = Bus()

    # Cold open: braam + a low A drone that swells into the montage.
    m.add(braam(4.0), 0.2, 0)
    dur = MONTAGE_START + 0.2
    t = t_axis(dur)
    drone = sum(saw(f, t) for f in (55.0, 55.3, 82.4)) * 0.06 + np.sin(2 * np.pi * 55 * t) * 0.15
    drone = lp(drone, 380, 4) * np.clip(t / 3.0, 0, 1) * (0.55 + 0.45 * t / dur)
    m.add(drone, 0.0, -2)

    # Deadpan clock ticks under the search sequence, stopping for "From 2019".
    k = 0
    for s in np.arange(6.0, 13.1, 0.5):
        m.add(tick(k % 2 == 0), s, -4, pan=0.2 if k % 2 else -0.2)
        k += 1
    m.add(braam(3.0, 55.0), 13.25, -3)

    # Montage: taiko + ostinato, density doubles twice, then a riser into the drop.
    m.add(boom(), MONTAGE_START, -1)
    riff = ["A3", "A3", "C4", "A3", "E4", "A3", "D4", "C4"]
    s, beat = MONTAGE_START, 0
    while s < DROP - 0.05:
        step = 0.25 if s < 19.2 else (0.125 if s < 21.7 else 0.0625)
        n = riff[beat % len(riff)]
        f = note(n) * (2 if s >= 19.2 else 1)
        bright = 900 + 2600 * (s - MONTAGE_START) / (DROP - MONTAGE_START)
        m.add(string_note(f, min(step * 1.6, 0.4), bright), s, -6 + 5 * (s - MONTAGE_START) / (DROP - MONTAGE_START))
        m.add(string_note(f / 2, min(step * 1.6, 0.4), bright * 0.6), s, -9)
        if beat % 2 == 0 or s >= 21.7:
            m.add(taiko(), s, -5 if s < 19.2 else -3, pan=rng.uniform(-0.3, 0.3))
        s += step
        beat += 1
    t = t_axis(DROP - MONTAGE_START)
    low = lp(saw(55, t) + saw(55.4, t), 300, 4) * 0.08 * (0.7 + 0.6 * t / t[-1])
    m.add(low, MONTAGE_START, 0)
    m.add(noise_riser(2.6), DROP - 2.6, -1)

    # Warm section: D major-ish progression under the reveal, resolving on the card.
    chords = [
        (REVEAL, ["D3", "F#3", "A3", "D4"]),
        (26.6, ["G2", "B3", "D4", "G4"]),
        (28.6, ["B2", "D4", "F#4", "B4"]),
        (30.0, ["A2", "C#4", "E4", "A4"]),
        (CARD, ["D3", "F#3", "A3", "D4", "F#4"]),
    ]
    for idx, (start, names) in enumerate(chords):
        end = chords[idx + 1][0] + 0.4 if idx + 1 < len(chords) else BLACK
        m.add(pad([note(n) for n in names], end - start, attack=0.4, release=0.8 if idx + 1 < len(chords) else 2.5), start, -1)
        step = 0.3
        arp = [note(n) * 2 for n in names[1:]]
        s, j = start, 0
        while s < min(end - 0.4, LOGO):
            m.add(pluck(arp[j % len(arp)]), s, -8 + (1 if j % 4 == 0 else 0), pan=0.25 * np.sin(j))
            s += step
            j += 1
    m.add(boom(2.5, 55.0), CARD, -9)
    m.add(boom(2.5, 50.0), LOGO, -12)
    return m


def build_sfx():
    fx = Bus()
    for s in (16.6, 17.8, 19.2, 20.2, 20.8, 22.4, 22.7, 23.0, 23.35):
        fx.add(whoosh(0.35), s - 0.2, -8, pan=rng.uniform(-0.5, 0.5))
    fx.add(flutter(1.2), 16.6, -2)
    fx.add(flutter(0.3), 22.7, 0)
    fx.add(phone_tap(), REVEAL - 0.25, -6)
    return fx


def build_kids():
    kb = Bus()
    names = sorted(p.stem for p in (ROOT / "audio").glob("kid[0-9].wav"))
    clips = [load(n) for n in names]
    pans = np.linspace(-0.7, 0.7, len(clips))
    for start, speed, gain in KIDS:
        for j, c in enumerate(clips):
            if speed != 1.0:
                idx = np.arange(0, len(c) - 1, speed)
                c = np.interp(idx, np.arange(len(c)), c)
            c = c / (np.sqrt(np.mean(c**2)) + 1e-9) * 0.08
            c = add_room(c, 0.3, 1.0, 0.2)
            kb.add(c, start + rng.uniform(0, 0.05), gain - 6 + rng.uniform(-2, 1), pan=pans[j])
    return kb


def build_vo():
    v = Bus()
    for name, start, gain, trailer in VO:
        x = load(name)
        if trailer:
            low = lp(x, 180)
            x = x + 0.5 * low
            x = add_room(x, 0.22, 2.0, 0.45)
        else:
            x = add_room(x, 0.08, 1.0, 0.25)
        v.add(x, start, gain)
    return v


def duck_env(vo: np.ndarray, depth_db=-7.0):
    level = np.abs(vo[:, 0]) + np.abs(vo[:, 1])
    active = lp((level > 0.01).astype(float), 4, 1)
    active = np.clip(active * 3, 0, 1)
    return db(depth_db * active)[:, None]


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else str(ROOT / "build" / "mix.wav")
    music = build_music().stereo()
    sfx = build_sfx().stereo()
    kids = build_kids().stereo()
    vo = build_vo().stereo()

    music *= duck_env(vo + kids)
    mix = music * db(-1) + sfx + kids * db(3) + vo * db(3)

    # Hard silence for the drop and after the cut to black.
    t = np.arange(N) / SR
    gate = np.ones(N)
    gate[(t >= DROP) & (t < REVEAL - 0.3)] = 0
    gate[t >= BLACK] = 0
    tail = (t >= BLACK - 0.6) & (t < BLACK)
    gate[tail] = np.linspace(1, 0.0, tail.sum())
    mix *= gate[:, None]

    peak = np.max(np.abs(mix))
    mix = np.tanh(mix / peak * 1.4) / np.tanh(1.4) * 0.89
    wavfile.write(out, SR, (mix * 32767).astype(np.int16))
    print("wrote", out, "peak", peak)


if __name__ == "__main__":
    main()
