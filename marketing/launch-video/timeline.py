"""Single source of truth for the Westfield Buzz launch trailer (40s, 9:16, 30fps).

Every time is in seconds. `render.py` reads SHOTS/CAPTIONS/STAMPS, `audio.py`
reads VO/KIDS/CUES, so picture and sound stay locked together.
"""

W, H, FPS = 1080, 1920, 30
DURATION = 40.0

# Beat markers shared by picture and music.
MONTAGE_START = 15.0
DROP = 23.7          # hard cut to silence
REVEAL = 24.8        # Westfield Buzz on screen
CARD = 31.4          # "Your weekend, solved."
LOGO = 35.0          # logo + "Get the List."
BLACK = 38.6         # cut to black

# kind: "still" (Ken Burns over an image), "app" (scroll the real homepage),
# "card", "logo", "black".
# zoom: (start, end) scale; pan: (x0, y0, x1, y1) focus in 0..1 of the image.
SHOTS = [
    dict(t0=0.0, t1=6.0, kind="still", src="01-drone.png", zoom=(1.0, 1.22), pan=(0.5, 0.35, 0.52, 0.55), grade="gold", fade_in=0.8),
    dict(t0=6.0, t1=9.2, kind="still", src="02-dad-night.png", zoom=(1.05, 1.2), pan=(0.45, 0.3, 0.45, 0.28), grade="night"),
    dict(t0=9.2, t1=11.4, kind="still", src="03-tabs.png", zoom=(1.1, 1.3), pan=(0.55, 0.32, 0.6, 0.3), grade="night"),
    dict(t0=11.4, t1=15.0, kind="still", src="04-flyer-2019.png", zoom=(1.0, 1.45), pan=(0.55, 0.45, 0.62, 0.62), grade="gold"),
    # Montage: cuts get shorter as the music escalates.
    dict(t0=15.0, t1=16.6, kind="still", src="05-kids.png", zoom=(1.05, 1.18), pan=(0.62, 0.45, 0.62, 0.4), grade="night"),
    dict(t0=16.6, t1=17.8, kind="still", src="06-pole-flyer.png", zoom=(1.1, 1.25), pan=(0.4, 0.45, 0.4, 0.42), grade="gold", shake=9),
    dict(t0=17.8, t1=19.2, kind="thread", scroll=(0, 520)),
    dict(t0=19.2, t1=20.2, kind="still", src="05-kids.png", zoom=(1.35, 1.6), pan=(0.62, 0.35, 0.62, 0.32), grade="night", shake=4),
    dict(t0=20.2, t1=20.8, kind="still", src="08-street-fair.png", zoom=(1.1, 1.25), pan=(0.5, 0.55, 0.52, 0.5), grade="gold"),
    dict(t0=20.8, t1=22.4, kind="thread", scroll=(2790, 2870), zoom=1.12, shake=3),
    dict(t0=22.4, t1=22.7, kind="still", src="10-library.png", zoom=(1.1, 1.25), pan=(0.6, 0.6, 0.62, 0.55), grade="gold"),
    dict(t0=22.7, t1=23.0, kind="still", src="06-pole-flyer.png", zoom=(1.5, 1.7), pan=(0.4, 0.4, 0.4, 0.4), grade="gold", shake=14),
    dict(t0=23.0, t1=23.35, kind="still", src="05-kids.png", zoom=(2.0, 2.3), pan=(0.5, 0.3, 0.5, 0.3), grade="night", shake=8),
    dict(t0=23.35, t1=DROP, kind="still", src="02-dad-night.png", zoom=(1.6, 1.9), pan=(0.45, 0.22, 0.45, 0.22), grade="night", shake=6),
    dict(t0=DROP, t1=REVEAL, kind="black"),
    dict(t0=REVEAL, t1=28.6, kind="app", src="app-home.png", scroll=(0, 2250), fade_in=0.25),
    dict(t0=28.6, t1=CARD, kind="still", src="09-dad-smile.png", zoom=(1.05, 1.16), pan=(0.5, 0.35, 0.5, 0.32), grade="warm"),
    dict(t0=CARD, t1=LOGO, kind="card", fade_in=0.35),
    dict(t0=LOGO, t1=BLACK, kind="logo"),
    dict(t0=BLACK, t1=DURATION, kind="black"),
]

# Big burned-in captions (most viewers watch muted). style: "vo" | "box" | "chant" | "warm"
CAPTIONS = [
    (0.8, 4.0, "In a town where everything is happening…", "vo"),
    (4.1, 5.9, "no one knows what's happening.", "vo"),
    (6.5, 9.1, "He searched the town website.", "vo"),
    (9.4, 11.3, "He checked the Facebook group.", "vo"),
    (11.6, 13.1, "He found a flyer.", "vo"),
    (13.2, 15.0, "From 2019.", "vo"),
    (15.1, 16.6, "“WHAT ARE WE DOING THIS WEEKEND”", "chant"),
    (17.8, 19.2, "412 comments.\nAbout parking.", "box"),
    (19.2, 20.2, "“WHAT ARE WE DOING THIS WEEKEND”", "chant"),
    (20.8, 22.4, "413 comments.", "box"),
    (25.3, 26.5, "Westfield Buzz.", "warm"),
    (26.5, 28.5, "Every event in town.", "warm"),
    (28.7, 31.3, "Every Friday in your inbox.", "warm"),
]

# Small thriller-style location/time stamps near the top of frame.
STAMPS = [
    (0.4, 5.6, "WESTFIELD, NEW JERSEY"),
    (6.2, 9.1, "THURSDAY  ·  9:04 PM"),
    (9.4, 11.3, "TAB 14 OF 14"),
    (16.7, 17.8, "ELM ST.  ·  POLE 7"),
    (20.2, 20.8, "STREET FAIR  ·  PARKING: UNCLEAR"),
    (22.4, 22.7, "THE LIBRARY. PROBABLY."),
]

# Voiceover clips (audio/<name>.wav), start time, gain in dB, trailer = add low end + room.
VO = [
    ("vo01", 0.8, 0.0, True),
    ("vo02", 4.2, 0.0, True),
    ("vo03", 6.6, 0.0, True),
    ("vo04", 9.5, 0.0, True),
    ("vo05", 11.7, 0.0, True),
    ("vo06", 13.3, 0.0, True),
    ("vo07", 25.4, 0.0, False),
    ("vo08", 26.6, 0.0, False),
    ("vo09", 28.8, 0.0, False),
]

# Kids chanting: (start, speed, gain dB)
KIDS = [
    (15.15, 1.0, -3.0),
    (19.2, 1.12, 0.0),
]
