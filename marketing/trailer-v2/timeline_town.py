"""Edit decision list for the town cut: the v2 trailer told about the whole town, not one dad.

Same Runway footage, voices, music and effects as timeline.py; nothing new is generated.
Differences from v2:
- The "He searched / He checked / He found" narration (vo03-vo05) becomes on-screen text
  about everyone, so no new voice lines are needed. "From 2019." (vo06) keeps its voice.
- "ONE DAD." becomes "ONE TOWN."; the "Local Dad" testimonial is replaced by a line that
  closes the opening ("...no one knows what's happening" / "Now everyone knows").
- The two dad-only close-ups (dad-phone, relief) are cut. The browser tabs and the live site
  get their time, using screenshots of the site as of October 2026.

Build: TRAILER_TIMELINE=timeline_town TRAILER_NAME=westfield-buzz-trailer-town ./build.sh
"""

from timeline import (  # noqa: F401  (re-exported for render.py / mix.py)
    AGENT_PROMPT, AGENT_REPLY, DROP, END, FH, FINAL, FORMAT, FPS, FW, H, MUSIC, NOTIFICATIONS, REVEAL, SFX, TABS, TAG,
    W,
)

APP_STILLS = {"vertical": "stills/app-home-2026-10.png", "desktop": "stills/site-desktop-2026-10.jpg"}

SHOTS = [
    dict(t0=0.0, t1=1.6, kind="title", text="THIS FALL"),
    dict(t0=1.6, t1=6.0, kind="clip", src="drone", ss=0.3, look="warm"),
    dict(t0=6.0, t1=9.2, kind="clip", src="window", ss=0.4, look="night"),
    dict(t0=9.2, t1=14.6, kind="tabs"),
    dict(t0=14.6, t1=17.4, kind="clip", src="board", ss=0.6, look="night"),
    dict(t0=17.4, t1=19.6, kind="still", src="frames/k05-flyer.jpg", zoom=(1.0, 1.16), look="warm"),
    dict(t0=19.6, t1=20.6, kind="title", text="ONE TOWN."),
    dict(t0=20.6, t1=21.6, kind="title", text="ZERO PLANS."),
    dict(t0=21.6, t1=28.0, kind="clip", src="doorway", ss=0.0, speed=0.62, look="night"),
    dict(t0=28.0, t1=29.4, kind="clip", src="crayon", ss=1.0, look="night"),
    dict(t0=29.4, t1=31.0, kind="clip", src="kids", ss=1.5, look="night"),
    dict(t0=31.0, t1=32.3, kind="clip", src="phone", ss=0.5, look="night", notifications=True),
    dict(t0=32.3, t1=33.7, kind="clip", src="pdf", ss=1.5, look="warm"),
    dict(t0=33.7, t1=35.4, kind="clip", src="standoff", ss=1.5, look="warm"),
    dict(t0=35.4, t1=36.4, kind="black"),
    # The live site takes the relief close-up's 2.4s, so it scrolls further into the week's events.
    dict(t0=36.4, t1=41.4, kind="app", scroll=(0, 2500), desktop_scroll=(0, 1300)),
    dict(t0=41.4, t1=45.4, kind="clip", src="hero-walk", ss=0.0, speed=0.85, look="warm"),
    dict(t0=45.4, t1=47.8, kind="card"),
    dict(t0=47.8, t1=50.4, kind="logo"),
    dict(t0=50.4, t1=50.8, kind="black"),
    dict(t0=50.8, t1=52.8, kind="title", top="ALSO AVAILABLE TO", text="YOUR AI AGENT."),
    dict(t0=52.8, t1=56.6, kind="agent"),
    dict(t0=56.6, t1=57.2, kind="black"),
]
DURATION = SHOTS[-1]["t1"]

# Both stamps sit on the house at night; over the tabs screen the time stamp covered the tab titles.
STAMPS = [
    (6.1, 7.6, "WESTFIELD, NJ"),
    (7.6, 9.1, "THURSDAY \u00b7 9:04 PM"),
]

# (t0, t1, text, style). Lines without a matching entry in VOICES are on-screen text only.
CAPTIONS = [
    (2.2, 4.6, "In a town where everything is happening...", "vo"),
    (6.5, 8.9, "...no one knows what's happening.", "vo"),
    (9.9, 12.0, "Everyone searched the town website.", "vo"),
    (12.3, 14.5, "Everyone asked the Facebook group.", "vo"),
    (15.2, 17.3, "Someone even found a flyer.", "vo"),
    (17.8, 19.5, "From 2019.", "vo"),
    (21.95, 23.3, "What did you find?", "whisper"),
    (23.4, 25.4, "A pancake breakfast.", "whisper"),
    (26.0, 27.95, "...It was in March.", "whisper"),
    (29.5, 31.0, "WHAT ARE WE DOING\nTHIS WEEKEND?", "chant"),
    (32.35, 33.0, "38 PAGES.", "slam"),
    (33.0, 33.7, "LAST UPDATED:\nNEVER.", "slam"),
    (33.8, 35.4, "THE PARKING\nSITUATION.", "slam"),
    (36.6, 38.1, "Westfield Buzz.", "warm"),
    (38.3, 39.9, "Every event in town.", "warm"),
    (40.0, 41.4, "Every Friday in your inbox.", "warm"),
    (42.0, 45.3, "Now everyone knows\nwhat's happening.", "quote"),
]

# Audio: (name, file_offset, dst_start, dst_len or None, gain_db, kind). vo03-vo05 ("He ...") are dropped.
VOICES = [
    ("vo01", 0.0, 2.2, None, 0, "narrator"),
    ("vo02", 0.0, 6.5, None, 0, "narrator"),
    ("vo06", 0.0, 17.8, None, 0, "narrator"),
    ("mom-line", 0.75, 21.9, 1.3, 2, "whisper"),
    ("dad-line", 0.0, 23.35, 2.05, 9, "whisper"),
    ("dad-line", 9.0, 26.0, 1.95, 10, "whisper"),
    ("kid-a", 0.05, 29.45, None, 3, "kid"),
    ("kid-b", 0.0, 29.52, None, 2, "kid"),
    ("vo07", 0.0, 36.6, None, 0, "narrator"),
    ("vo08", 0.0, 51.0, None, 0, "narrator"),
]
