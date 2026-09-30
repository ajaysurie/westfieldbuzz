"""Render the trailer picture as raw RGB frames piped into ffmpeg.

Usage: python3 render.py build/video.mp4
"""

import math
import subprocess
import sys
from functools import lru_cache
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

from timeline import CAPTIONS, DURATION, FPS, H, SHOTS, STAMPS, W

ROOT = Path(__file__).parent
STILLS = ROOT / "stills"
FONTS = ROOT / "fonts"

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


# ---------- colour grades ----------

def grade(img: Image.Image, look: str) -> Image.Image:
    a = np.asarray(img.convert("RGB")).astype(np.float32) / 255.0
    if look == "gold":
        a = a * np.array([1.06, 1.0, 0.9]) + np.array([0.01, 0.0, -0.01])
    elif look == "night":
        lum = a.mean(axis=2, keepdims=True)
        shadows = (1 - lum) ** 2
        a = a + shadows * np.array([-0.03, 0.01, 0.04])
        a = a * 0.96
    elif look == "warm":
        a = a * np.array([1.07, 1.02, 0.9]) + 0.015
    a = np.clip(a, 0, 1)
    # gentle S-curve for filmic contrast
    a = a + 0.12 * (a - 0.5) * (1 - np.abs(2 * a - 1))
    return Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8))


@lru_cache(maxsize=None)
def source(name: str, look: str) -> Image.Image:
    im = Image.open(STILLS / name).convert("RGB")
    im = im.resize((im.width * 2, im.height * 2), Image.LANCZOS)
    return grade(im, look)


def vignette() -> np.ndarray:
    y, x = np.mgrid[0:H, 0:W].astype(np.float32)
    d = np.sqrt(((x - W / 2) / (W / 2)) ** 2 + ((y - H / 2) / (H / 2)) ** 2)
    return np.clip(1.0 - 0.35 * np.clip(d - 0.55, 0, None) ** 1.6, 0, 1)[..., None]


VIGNETTE = vignette()
RNG = np.random.default_rng(7)
GRAIN = [RNG.normal(0, 5.0, (H // 2, W // 2, 1)).astype(np.float32) for _ in range(6)]


def lerp(a, b, t):
    return a + (b - a) * t


def ease_in_out(t):
    return 0.5 - 0.5 * math.cos(math.pi * max(0.0, min(1.0, t)))


def shake_offset(t, amp):
    if not amp:
        return 0.0, 0.0
    return (
        amp * (math.sin(t * 37.0) * 0.6 + math.sin(t * 91.0 + 1.3) * 0.4),
        amp * (math.sin(t * 43.0 + 0.7) * 0.6 + math.sin(t * 77.0 + 2.1) * 0.4),
    )


def still_frame(shot, t):
    im = source(shot["src"], shot.get("grade", "none"))
    p = (t - shot["t0"]) / (shot["t1"] - shot["t0"])
    z = lerp(*shot["zoom"], p)
    x0, y0, x1, y1 = shot["pan"]
    cx, cy = lerp(x0, x1, p) * im.width, lerp(y0, y1, p) * im.height
    bw, bh = im.width / z, im.height / z
    dx, dy = shake_offset(t, shot.get("shake", 0))
    cx += dx * bw / W
    cy += dy * bh / H
    cx = min(max(cx, bw / 2), im.width - bw / 2)
    cy = min(max(cy, bh / 2), im.height - bh / 2)
    box = (cx - bw / 2, cy - bh / 2, cx + bw / 2, cy + bh / 2)
    return im.resize((W, H), Image.BICUBIC, box=box)


@lru_cache(maxsize=1)
def app_source():
    return Image.open(STILLS / "app-home.png").convert("RGB")


def app_frame(shot, t):
    im = app_source()
    p = ease_in_out((t - shot["t0"] - 0.6) / (shot["t1"] - shot["t0"] - 0.9))
    y = lerp(*shot["scroll"], p)
    return im.resize((W, H), Image.BICUBIC, box=(0, y, im.width, y + H * im.width / W))


THREAD = [
    ("Linda M.", "Park at the train station.", (196, 120, 80)),
    ("Dave R.", "Train station lot is permit only.", (80, 130, 190)),
    ("Linda M.", "Not on Saturdays.", (196, 120, 80)),
    ("Dave R.", "Since when??", (80, 130, 190)),
    ("Karen P.", "I've lived here 22 years and there has NEVER been parking.", (150, 100, 170)),
    ("Mike T.", "Just walk.", (90, 160, 120)),
    ("Sue W.", "Walk from where, Mike?", (200, 160, 70)),
    ("Mike T.", "From your house, Sue.", (90, 160, 120)),
    ("Sue W.", "I live in Scotch Plains.", (200, 160, 70)),
    ("Jen K.", "Wait, is the fair this Saturday or next?", (190, 90, 110)),
    ("Tom B.", "It was last weekend.", (110, 110, 120)),
    ("Jen K.", "…", (190, 90, 110)),
    ("Group Admin", "Turning off comments on this post.", (60, 90, 140)),
]


@lru_cache(maxsize=1)
def thread_source():
    bg, bubble, text, muted = (24, 25, 26), (58, 59, 60), (228, 230, 235), (176, 179, 184)
    im = Image.new("RGB", (W, 4800), bg)
    d = ImageDraw.Draw(im)
    d.text((56, 70), "←", font=dm_sans(56, "Medium"), fill=text)
    d.text((140, 74), "Westfield Neighbors (Unofficial)", font=dm_sans(44, "Bold"), fill=text)
    y = 200
    d.ellipse([56, y, 156, y + 100], fill=(70, 110, 160))
    d.text((180, y + 6), "Rob S.", font=dm_sans(40, "Bold"), fill=text)
    d.text((180, y + 56), "Thursday at 8:51 PM", font=dm_sans(32, "Regular"), fill=muted)
    y += 150
    post_font = dm_sans(54, "Medium")
    for line in wrap(d, "Is there parking for the street fair on Saturday? Asking before I drive over.", post_font, W - 112):
        d.text((56, y), line, font=post_font, fill=text)
        y += 70
    y += 30
    d.text((56, y), "38 reactions", font=dm_sans(34, "Regular"), fill=muted)
    count = "412 comments"
    cf = dm_sans(34, "Regular")
    d.text((W - 56 - d.textlength(count, font=cf), y), count, font=cf, fill=muted)
    y += 70
    d.line([(56, y), (W - 56, y)], fill=(62, 64, 66), width=2)
    y += 50
    name_f, body_f = dm_sans(36, "Bold"), dm_sans(42, "Regular")
    for name, body, color in THREAD:
        lines = wrap(d, body, body_f, W - 330)
        bh = 76 + len(lines) * 56 + 24
        bw = max(d.textlength(l, font=body_f) for l in lines + [name]) + 64
        d.ellipse([56, y, 146, y + 90], fill=color)
        initials = "".join(p[0] for p in name.split()[:2])
        f = dm_sans(34, "Bold")
        d.text((101 - d.textlength(initials, font=f) / 2, y + 24), initials, font=f, fill=(255, 255, 255))
        d.rounded_rectangle([170, y, 170 + bw, y + bh], radius=36, fill=bubble)
        d.text((202, y + 20), name, font=name_f, fill=text)
        for k, line in enumerate(lines):
            d.text((202, y + 76 + k * 56), line, font=body_f, fill=text)
        d.text((202, y + bh + 12), "Like   Reply   " + f"{(len(body) * 7) % 50 + 1}m", font=dm_sans(30, "Bold"), fill=muted)
        y += bh + 90
    return im


def thread_frame(shot, t):
    im = thread_source()
    p = ease_in_out((t - shot["t0"]) / (shot["t1"] - shot["t0"]))
    y = lerp(*shot["scroll"], p)
    z = shot.get("zoom", 1.0)
    bw, bh = W / z, H / z
    dx, dy = shake_offset(t, shot.get("shake", 0))
    x0 = max(0.0, 20 + dx) if z > 1 else 0.0
    return im.resize((W, H), Image.BICUBIC, box=(x0, y + dy, x0 + bw, y + bh + dy))


def centered(draw, y, text, font, fill, spacing=0):
    w = draw.textlength(text, font=font) + spacing * (len(text) - 1)
    x = (W - w) / 2
    if spacing:
        for ch in text:
            draw.text((x, y), ch, font=font, fill=fill)
            x += draw.textlength(ch, font=font) + spacing
    else:
        draw.text((x, y), text, font=font, fill=fill)


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
    return card_base().resize((W, H), Image.BICUBIC, box=((W - bw) / 2, (H - bh) / 2, (W + bw) / 2, (H + bh) / 2))


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
    tw = d.textlength("Get the List", font=f)
    d.text(((W - tw) / 2, by + 34), "Get the List", font=f, fill=PAPER)
    centered(d, 1260, "westfieldbuzz.com", dm_sans(44, "Medium"), INK)
    return im


def logo_frame(shot, t):
    return logo_base()


# ---------- captions ----------

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


@lru_cache(maxsize=None)
def caption_layer(text, style):
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    if style == "chant":
        font, fill, lh = dm_sans(92, "Black"), (255, 214, 90, 255), 104
    elif style == "warm":
        font, fill, lh = serif(112), PAPER + (255,), 118
    elif style == "box":
        font, fill, lh = dm_sans(76, "ExtraBold"), (255, 255, 255, 255), 90
    else:
        font, fill, lh = dm_sans(80, "ExtraBold"), (255, 255, 255, 255), 94
    lines = wrap(d, text, font, W - 160)
    top = int(H * (0.78 if style == "box" else 0.64)) - (len(lines) * lh) // 2
    if style in ("warm", "box"):
        widest = max(d.textlength(l, font=font) for l in lines)
        pad_x, pad_y = 56, 34
        box_fill = INK + (235,) if style == "warm" else (0, 0, 0, 245)
        d.rounded_rectangle(
            [(W - widest) / 2 - pad_x, top - pad_y + 14, (W + widest) / 2 + pad_x, top + len(lines) * lh + pad_y],
            radius=36, fill=box_fill,
        )
        for i, line in enumerate(lines):
            centered(d, top + i * lh, line, font, fill)
        return layer
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    for i, line in enumerate(lines):
        centered(sd, top + i * lh + 4, line, font, (0, 0, 0, 230))
    shadow = shadow.filter(ImageFilter.GaussianBlur(10))
    for i, line in enumerate(lines):
        w = d.textlength(line, font=font)
        d.text(((W - w) / 2, top + i * lh), line, font=font, fill=fill, stroke_width=3, stroke_fill=(0, 0, 0, 200))
    return Image.alpha_composite(shadow, layer)


@lru_cache(maxsize=None)
def stamp_layer(text):
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    font = dm_sans(40, "Bold")
    spacing = 6
    w = d.textlength(text, font=font) + spacing * (len(text) - 1)
    y = 260
    d.rectangle([(W - w) / 2 - 28, y - 16, (W + w) / 2 + 28, y + 62], fill=(0, 0, 0, 150))
    centered(d, y, text, font, (255, 255, 255, 235), spacing=spacing)
    return layer


def overlay_alpha(t, t0, t1, fade=0.12):
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


def render_frame(i):
    t = i / FPS
    shot = next(s for s in SHOTS if s["t0"] <= t < s["t1"])
    kind = shot["kind"]
    if kind == "black":
        return np.zeros((H, W, 3), np.uint8)
    renderers = {"still": still_frame, "app": app_frame, "thread": thread_frame, "card": card_frame, "logo": logo_frame}
    frame = renderers[kind](shot, t)

    for t0, t1, text in STAMPS:
        if t0 <= t < t1:
            frame = composite(frame, stamp_layer(text), overlay_alpha(t, t0, t1))
    for t0, t1, text, style in CAPTIONS:
        if t0 <= t < t1:
            frame = composite(frame, caption_layer(text, style), overlay_alpha(t, t0, t1, 0.08))

    a = np.asarray(frame).astype(np.float32)
    if kind in ("still",):
        a *= VIGNETTE
        g = GRAIN[i % len(GRAIN)]
        a += np.repeat(np.repeat(g, 2, axis=0), 2, axis=1)
    fade_in = shot.get("fade_in", 0)
    if fade_in:
        a *= min(1.0, (t - shot["t0"]) / fade_in)
    return np.clip(a, 0, 255).astype(np.uint8)


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else str(ROOT / "build" / "video.mp4")
    n = int(round(DURATION * FPS))
    ff = subprocess.Popen(
        ["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
         "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "18",
         "-pix_fmt", "yuv420p", out],
        stdin=subprocess.PIPE,
    )
    for i in range(n):
        ff.stdin.write(render_frame(i).tobytes())
        if i % 150 == 0:
            print(f"frame {i}/{n}", flush=True)
    ff.stdin.close()
    ff.wait()
    print("wrote", out)


if __name__ == "__main__":
    main()
