"""Cut the Runway clips to the timeline, add titles/captions/overlays, pipe frames to ffmpeg.

Usage: python3 render.py build/video.mp4
"""

import math
import subprocess
import sys
from functools import lru_cache
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

from timeline import AGENT_PROMPT, AGENT_REPLY, CAPTIONS, DURATION, FPS, H, NOTIFICATIONS, SHOTS, STAMPS, TABS, W

ROOT = Path(__file__).parent
V1 = ROOT.parent / "launch-video"
FONTS = V1 / "fonts"
STILLS = V1 / "stills"

INK = (23, 33, 43)
PAPER = (247, 243, 235)
ACCENT = (27, 58, 92)
GOLD = (212, 168, 67)


def dm_sans(size, weight="Bold"):
    f = ImageFont.truetype(str(FONTS / "DMSans.ttf"), size)
    f.set_variation_by_name(weight)
    return f


def serif(size, italic=False):
    name = "InstrumentSerif-Italic.ttf" if italic else "InstrumentSerif-Regular.ttf"
    return ImageFont.truetype(str(FONTS / name), size)


def lerp(a, b, t):
    return a + (b - a) * t


def ease_in_out(t):
    return 0.5 - 0.5 * math.cos(math.pi * max(0.0, min(1.0, t)))


def ease_out(t):
    t = max(0.0, min(1.0, t))
    return 1 - (1 - t) ** 3


# ---------- grade / texture ----------

def grade(a: np.ndarray, look: str) -> np.ndarray:
    a = a.astype(np.float32) / 255.0
    if look == "warm":
        a = a * np.array([1.05, 1.0, 0.91], np.float32) + np.array([0.012, 0.004, -0.008], np.float32)
    elif look == "night":
        lum = a.mean(axis=2, keepdims=True)
        a = a + (1 - lum) ** 2 * np.array([-0.02, 0.004, 0.03], np.float32)
    a = np.clip(a, 0, 1)
    a = a + 0.10 * (a - 0.5) * (1 - np.abs(2 * a - 1))
    return a * 255.0


def _vignette():
    y, x = np.mgrid[0:H, 0:W].astype(np.float32)
    d = np.sqrt(((x - W / 2) / (W / 2)) ** 2 + ((y - H / 2) / (H / 2)) ** 2)
    return np.clip(1.0 - 0.35 * np.clip(d - 0.55, 0, None) ** 1.6, 0, 1)[..., None]


VIGNETTE = _vignette()
_ys = np.linspace(0, 1, H, dtype=np.float32)[:, None, None]
SCRIM_BOTTOM = 1 - np.clip((_ys - 0.62) / 0.08, 0, 1)
RNG = np.random.default_rng(7)
GRAIN = [RNG.normal(0, 4.0, (H // 2, W // 2, 1)).astype(np.float32) for _ in range(6)]


# ---------- sources ----------

class ClipReader:
    """Streams one shot's frames from ffmpeg, already retimed and scaled to W x H."""

    def __init__(self, shot):
        n = int(round((shot["t1"] - shot["t0"]) * FPS)) + 2
        speed = shot.get("speed", 1.0)
        vf = f"setpts=(PTS-STARTPTS)/{speed}"
        vf += f",minterpolate=fps={FPS}:mi_mode=blend" if speed != 1.0 else f",fps={FPS}"
        vf += f",scale={W}:{H}:flags=lanczos"
        self.proc = subprocess.Popen(
            ["ffmpeg", "-v", "error", "-ss", str(shot["ss"]), "-i", str(ROOT / "clips" / f"{shot['src']}.mp4"),
             "-vf", vf, "-frames:v", str(n), "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
            stdout=subprocess.PIPE,
        )
        self.last = None

    def next(self):
        buf = self.proc.stdout.read(W * H * 3)
        if len(buf) == W * H * 3:
            self.last = np.frombuffer(buf, np.uint8).reshape(H, W, 3)
        return self.last

    def close(self):
        self.proc.stdout.close()
        self.proc.wait()


_reader = {"shot": None, "r": None}


def clip_frame(shot, t):
    if _reader["shot"] is not shot:
        if _reader["r"]:
            _reader["r"].close()
        _reader.update(shot=shot, r=ClipReader(shot))
    a = _reader["r"].next()
    p = (t - shot["t0"]) / (shot["t1"] - shot["t0"])
    z = 1.0 + 0.035 * p
    if z > 1.001:
        im = Image.fromarray(a)
        bw, bh = W / z, H / z
        im = im.resize((W, H), Image.BICUBIC, box=((W - bw) / 2, (H - bh) / 2, (W + bw) / 2, (H + bh) / 2))
        a = np.asarray(im)
    return a


@lru_cache(maxsize=None)
def still_source(path):
    im = Image.open(ROOT / path).convert("RGB")
    scale = max(W / im.width, H / im.height) * 1.25
    return im.resize((int(im.width * scale), int(im.height * scale)), Image.LANCZOS)


def still_frame(shot, t):
    im = still_source(shot["src"])
    p = ease_in_out((t - shot["t0"]) / (shot["t1"] - shot["t0"]))
    z = lerp(*shot["zoom"], p)
    bw, bh = W * 1.25 / z, H * 1.25 / z
    cx, cy = im.width / 2, im.height / 2
    return np.asarray(im.resize((W, H), Image.BICUBIC, box=(cx - bw / 2, cy - bh / 2, cx + bw / 2, cy + bh / 2)))


@lru_cache(maxsize=1)
def app_source():
    return Image.open(STILLS / "app-home.png").convert("RGB")


def app_frame(shot, t):
    im = app_source()
    p = ease_in_out((t - shot["t0"] - 0.5) / (shot["t1"] - shot["t0"] - 0.7))
    y = lerp(*shot["scroll"], p)
    return np.asarray(im.resize((W, H), Image.BICUBIC, box=(0, y, im.width, y + H * im.width / W)))


# ---------- text helpers ----------

def wrap(draw, text, font, max_w):
    lines = []
    for para in text.split("\n"):
        cur = ""
        for w in para.split():
            trial = (cur + " " + w).strip()
            if draw.textlength(trial, font=font) <= max_w or not cur:
                cur = trial
            else:
                lines.append(cur)
                cur = w
        lines.append(cur)
    return lines


def spaced_width(draw, text, font, spacing):
    return draw.textlength(text, font=font) + spacing * (len(text) - 1)


def centered(draw, y, text, font, fill, spacing=0, **kw):
    x = (W - spaced_width(draw, text, font, spacing)) / 2
    if not spacing:
        draw.text((x, y), text, font=font, fill=fill, **kw)
        return
    for ch in text:
        draw.text((x, y), ch, font=font, fill=fill, **kw)
        x += draw.textlength(ch, font=font) + spacing


# ---------- generated shots ----------

@lru_cache(maxsize=None)
def title_base(text, top=None):
    im = Image.new("RGB", (W, H), (0, 0, 0))
    d = ImageDraw.Draw(im)
    size, spacing = 118, 22
    while spaced_width(d, text, dm_sans(size, "Bold"), spacing) > W - 140:
        size, spacing = size - 4, spacing - 1
    centered(d, H / 2 - 80, text, dm_sans(size, "Bold"), (238, 232, 220), spacing=spacing)
    if top:
        centered(d, H / 2 - 170, top, dm_sans(44, "Medium"), (160, 156, 148), spacing=12)
    return im


def title_frame(shot, t):
    p = (t - shot["t0"]) / (shot["t1"] - shot["t0"])
    z = 1.0 + 0.05 * p
    bw, bh = W / z, H / z
    im = title_base(shot["text"], shot.get("top")).resize((W, H), Image.BICUBIC, box=((W - bw) / 2, (H - bh) / 2, (W + bw) / 2, (H + bh) / 2))
    a = np.asarray(im).astype(np.float32)
    fade = min(1.0, (t - shot["t0"]) / 0.12, (shot["t1"] - t) / 0.1)
    return (a * max(fade, 0)).astype(np.uint8)


@lru_cache(maxsize=None)
def tab_card(i):
    cw, ch = 470, 340
    card = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    d = ImageDraw.Draw(card)
    d.rounded_rectangle([0, 0, cw, ch], radius=28, fill=(44, 46, 52, 255))
    d.ellipse([22, 26, 62, 66], fill=[(66, 103, 178), (90, 90, 96), (196, 64, 52), (66, 133, 244)][i % 4] + (255,))
    f = dm_sans(30, "Medium")
    lines = wrap(d, TABS[i], f, cw - 110)[:2]
    for k, line in enumerate(lines):
        d.text((78, 22 + k * 36), line, font=f, fill=(230, 232, 236, 255))
    d.rounded_rectangle([14, 110, cw - 14, ch - 14], radius=18, fill=(250, 250, 250, 255))
    rng = np.random.default_rng(i)
    y = 140
    while y < ch - 60:
        w = int(rng.uniform(0.45, 0.95) * (cw - 80))
        d.rounded_rectangle([40, y, 40 + w, y + 20], radius=10, fill=(214, 216, 222, 255))
        y += int(rng.uniform(40, 60))
    return card


def tabs_frame(shot, t):
    im = Image.new("RGB", (W, H), (22, 23, 27))
    d = ImageDraw.Draw(im)
    el = t - shot["t0"]
    shown = min(len(TABS), 1 + int(el / 0.2))
    count = 6 + int(41 * ease_in_out(el / (shot["t1"] - shot["t0"] - 0.3)))
    d.text((60, 120), f"{count} Tabs", font=dm_sans(64, "Bold"), fill=(240, 240, 244))
    d.text((W - 60 - d.textlength("Done", font=dm_sans(44, "Medium")), 132), "Done", font=dm_sans(44, "Medium"), fill=(120, 170, 255))
    for i in range(shown):
        pop = ease_out((el - i * 0.2) / 0.18)
        card = tab_card(i)
        s = 0.85 + 0.15 * pop
        c = card.resize((int(card.width * s), int(card.height * s)), Image.BICUBIC)
        col, row = i % 2, i // 2
        cx = 60 + col * 490 + 235
        cy = 260 + row * 370 + 170
        im.paste(c, (int(cx - c.width / 2), int(cy - c.height / 2)), c)
    a = np.asarray(im).astype(np.float32)
    return (a * SCRIM_BOTTOM + np.array([22, 23, 27], np.float32) * (1 - SCRIM_BOTTOM)).astype(np.uint8)


@lru_cache(maxsize=1)
def card_base():
    im = Image.new("RGB", (W, H), PAPER)
    d = ImageDraw.Draw(im)
    centered(d, 700, "Your weekend,", serif(170), INK)
    centered(d, 880, "solved.", serif(210, italic=True), ACCENT)
    d.line([(W / 2 - 60, 1180), (W / 2 + 60, 1180)], fill=GOLD, width=4)
    return im


def card_frame(shot, t):
    p = (t - shot["t0"]) / (shot["t1"] - shot["t0"])
    z = 1.0 + 0.04 * p
    bw, bh = W / z, H / z
    return np.asarray(card_base().resize((W, H), Image.BICUBIC, box=((W - bw) / 2, (H - bh) / 2, (W + bw) / 2, (H + bh) / 2)))


@lru_cache(maxsize=1)
def logo_base():
    im = Image.new("RGB", (W, H), PAPER)
    logo = Image.open(STILLS / "logo.png").convert("RGBA")
    lw = 900
    logo = logo.resize((lw, int(logo.height * lw / logo.width)), Image.LANCZOS)
    im.paste(logo, ((W - lw) // 2, 640), logo)
    d = ImageDraw.Draw(im)
    btn_w, btn_h, by = 560, 150, 1060
    d.rounded_rectangle([(W - btn_w) / 2, by, (W + btn_w) / 2, by + btn_h], radius=75, fill=ACCENT)
    f = dm_sans(64, "Bold")
    d.text(((W - d.textlength("Get the List", font=f)) / 2, by + 34), "Get the List", font=f, fill=PAPER)
    centered(d, 1260, "westfieldbuzz.com", dm_sans(44, "Medium"), INK)
    return im


def logo_frame(shot, t):
    return np.asarray(logo_base())


def agent_frame(shot, t):
    im = Image.new("RGB", (W, H), (16, 20, 26))
    d = ImageDraw.Draw(im)
    el = t - shot["t0"]
    muted = (140, 146, 156)
    centered(d, 330, "YOUR AI AGENT", dm_sans(40, "Bold"), muted, spacing=12)
    d.line([(80, 420), (W - 80, 420)], fill=(40, 46, 56), width=2)

    body = dm_sans(64, "Medium")
    prompt_chars = int(len(AGENT_PROMPT) * min(1.0, max(0.0, (el - 0.15) / 0.9)))
    typed = AGENT_PROMPT[:prompt_chars]
    y = 560
    if typed:
        lines = wrap(d, AGENT_PROMPT, body, W - 300)
        shown, left = [], len(typed)
        for line in lines:
            shown.append(line[:left])
            left = max(0, left - len(line) - 1)
        bw = max(d.textlength(l, font=body) for l in lines) + 80
        bh = len(lines) * 82 + 64
        d.rounded_rectangle([W - 70 - bw, y, W - 70, y + bh], radius=50, fill=ACCENT)
        for k, line in enumerate(shown):
            d.text((W - 70 - bw + 40, y + 30 + k * 82), line, font=body, fill=PAPER)
        y += bh + 70

    reply_at = 1.35
    if el >= reply_at:
        thinking = el < reply_at + 0.35
        lines = [] if thinking else [l for p in AGENT_REPLY for l in wrap(d, p, body, W - 240)]
        bw = W - 140 if lines else 200
        bh = (len(lines) * 82 + 170) if lines else 120
        d.rounded_rectangle([70, y, 70 + bw, y + bh], radius=50, fill=PAPER)
        if thinking:
            for k in range(3):
                on = int((el - reply_at) / 0.1) % 3 == k
                d.ellipse([112 + k * 44, y + 46, 142 + k * 44, y + 76], fill=INK if on else (170, 170, 175))
        else:
            for k, line in enumerate(lines):
                d.text((110, y + 34 + k * 82), line, font=body, fill=INK)
            chip_y = y + 50 + len(lines) * 82
            chip = "Source: Westfield Buzz"
            cf = dm_sans(36, "Bold")
            cw = d.textlength(chip, font=cf) + 48
            d.rounded_rectangle([110, chip_y, 110 + cw, chip_y + 68], radius=34, fill=(232, 226, 212))
            d.text((134, chip_y + 13), chip, font=cf, fill=ACCENT)

    if el >= 2.3:
        a = ease_out((el - 2.3) / 0.3)
        f = dm_sans(66, "Bold")
        col = tuple(int(lerp(16, c, a)) for c in GOLD)
        centered(d, 1500, "westfieldbuzz.com/agents", f, col)
        centered(d, 1600, "Events API  \u00b7  llms.txt  \u00b7  no key needed", dm_sans(40, "Medium"),
                 tuple(int(lerp(16, c, a)) for c in muted))
    return np.asarray(im)


# ---------- overlays ----------

@lru_cache(maxsize=None)
def caption_layer(text, style):
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    if style == "chant":
        font, fill, lh, anchor = dm_sans(96, "Black"), (255, 214, 90, 255), 108, 0.72
    elif style == "warm":
        font, fill, lh, anchor = serif(112), PAPER + (255,), 118, 0.76
    elif style == "whisper":
        font, fill, lh, anchor = serif(92, italic=True), (240, 236, 228, 255), 100, 0.80
    elif style == "slam":
        font, fill, lh, anchor = dm_sans(120, "Black"), (255, 255, 255, 255), 128, 0.50
    elif style == "quote":
        font, fill, lh, anchor = serif(84, italic=True), (255, 255, 255, 255), 92, 0.20
    else:
        font, fill, lh, anchor = dm_sans(78, "ExtraBold"), (255, 255, 255, 255), 92, 0.76
    lines = wrap(d, text, font, W - 160)
    top = int(H * anchor) - (len(lines) * lh) // 2
    if style in ("warm", "slam"):
        widest = max(d.textlength(l, font=font) for l in lines)
        pad_x, pad_y = 56, 34
        box_fill = INK + (235,) if style == "warm" else (0, 0, 0, 245)
        d.rounded_rectangle(
            [(W - widest) / 2 - pad_x, top - pad_y + 14, (W + widest) / 2 + pad_x, top + len(lines) * lh + pad_y],
            radius=36 if style == "warm" else 8, fill=box_fill,
        )
        for i, line in enumerate(lines):
            centered(d, top + i * lh, line, font, fill)
        return layer
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    if style == "quote":
        bottom = top + len(lines) * lh + 160
        alpha = (np.clip(1 - np.arange(bottom) / bottom, 0, 1) ** 0.8 * 190).astype(np.uint8)
        scrim = np.zeros((H, W, 4), np.uint8)
        scrim[:bottom, :, 3] = alpha[:, None]
        shadow = Image.fromarray(scrim, "RGBA")
    sd = ImageDraw.Draw(shadow)
    for i, line in enumerate(lines):
        centered(sd, top + i * lh + 4, line, font, (0, 0, 0, 235))
    shadow = shadow.filter(ImageFilter.GaussianBlur(12))
    for i, line in enumerate(lines):
        stroke = 0 if style in ("whisper", "quote") else 3
        centered(d, top + i * lh, line, font, fill, stroke_width=stroke, stroke_fill=(0, 0, 0, 200))
    return Image.alpha_composite(shadow, layer)


@lru_cache(maxsize=None)
def stamp_layer(text):
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    font = dm_sans(40, "Bold")
    spacing = 6
    w = spaced_width(d, text, font, spacing)
    y = 220
    d.rectangle([(W - w) / 2 - 28, y - 16, (W + w) / 2 + 28, y + 62], fill=(0, 0, 0, 150))
    centered(d, y, text, font, (255, 255, 255, 235), spacing=spacing)
    return layer


@lru_cache(maxsize=None)
def notification_card(app, text):
    cw = W - 80
    body_f, app_f = dm_sans(38, "Medium"), dm_sans(28, "Bold")
    tmp = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
    lines = wrap(tmp, text, body_f, cw - 150)
    ch = 90 + len(lines) * 48
    card = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    d = ImageDraw.Draw(card)
    d.rounded_rectangle([0, 0, cw, ch], radius=36, fill=(242, 242, 245, 238))
    color = {"FACEBOOK": (66, 103, 178), "MESSAGES": (52, 199, 89)}.get(app, (27, 58, 92))
    d.rounded_rectangle([28, 30, 98, 100], radius=16, fill=color + (255,))
    d.text((122, 26), app, font=app_f, fill=(110, 110, 118, 255))
    d.text((cw - 36 - d.textlength("now", font=app_f), 26), "now", font=app_f, fill=(110, 110, 118, 255))
    for k, line in enumerate(lines):
        d.text((122, 66 + k * 48), line, font=body_f, fill=(20, 20, 24, 255))
    return card


def notifications_layer(t):
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    y = 150
    for at, app, text in NOTIFICATIONS:
        if t < at:
            break
        card = notification_card(app, text)
        p = ease_out((t - at) / 0.18)
        layer.alpha_composite(card, (40, int(y - (1 - p) * 120)))
        y += card.height + 18
    return layer


def overlay_alpha(t, t0, t1, fade=0.1):
    return max(0.0, min(1.0, (t - t0) / fade, (t1 - t) / fade))


def composite(frame: Image.Image, layer: Image.Image, alpha: float) -> Image.Image:
    if alpha <= 0:
        return frame
    if alpha < 1:
        layer = layer.copy()
        layer.putalpha(layer.getchannel("A").point(lambda v: int(v * alpha)))
    base = frame.convert("RGBA")
    base.alpha_composite(layer)
    return base.convert("RGB")


RENDERERS = {
    "title": title_frame, "clip": clip_frame, "still": still_frame, "tabs": tabs_frame,
    "app": app_frame, "card": card_frame, "logo": logo_frame, "agent": agent_frame,
}


def render_frame(i):
    t = i / FPS
    shot = next(s for s in SHOTS if s["t0"] <= t < s["t1"])
    kind = shot["kind"]
    if kind == "black":
        return np.zeros((H, W, 3), np.uint8)
    a = RENDERERS[kind](shot, t)
    if kind in ("clip", "still"):
        a = grade(a, shot.get("look", "none")) * VIGNETTE
        g = GRAIN[i % len(GRAIN)]
        a = a + np.repeat(np.repeat(g, 2, axis=0), 2, axis=1)
        a = np.clip(a, 0, 255).astype(np.uint8)
    frame = Image.fromarray(a)

    if shot.get("notifications"):
        frame = composite(frame, notifications_layer(t), 1.0)
    for t0, t1, text in STAMPS:
        if t0 <= t < t1:
            frame = composite(frame, stamp_layer(text), overlay_alpha(t, t0, t1))
    for t0, t1, text, style in CAPTIONS:
        if t0 <= t < t1:
            fade = 0.03 if style == "slam" else 0.08
            frame = composite(frame, caption_layer(text, style), overlay_alpha(t, t0, t1, fade))
    return np.asarray(frame)


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else str(ROOT / "build" / "video.mp4")
    n = int(round(DURATION * FPS))
    ff = subprocess.Popen(
        ["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
         "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "17",
         "-pix_fmt", "yuv420p", out],
        stdin=subprocess.PIPE,
    )
    for i in range(n):
        ff.stdin.write(np.ascontiguousarray(render_frame(i)).tobytes())
        if i % 120 == 0:
            print(f"frame {i}/{n}", flush=True)
    ff.stdin.close()
    ff.wait()
    if _reader["r"]:
        _reader["r"].close()
    print("wrote", out)


if __name__ == "__main__":
    main()
