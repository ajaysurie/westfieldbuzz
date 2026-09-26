"""Edit decision list for the v2 trailer. All times in seconds."""

W, H, FPS = 1080, 1920, 24

# kind: title | clip | still | tabs | app | card | logo | black
# clip: src (clips/<src>.mp4), ss (source in-point), speed (<1 = slow motion), look (colour grade)
SHOTS = [
    dict(t0=0.0, t1=1.6, kind="title", text="THIS FALL"),
    dict(t0=1.6, t1=6.0, kind="clip", src="drone", ss=0.3, look="warm"),
    dict(t0=6.0, t1=9.2, kind="clip", src="window", ss=0.4, look="night"),
    dict(t0=9.2, t1=12.4, kind="clip", src="dad-phone", ss=0.2, look="night"),
    dict(t0=12.4, t1=14.6, kind="tabs"),
    dict(t0=14.6, t1=17.4, kind="clip", src="board", ss=0.6, look="night"),
    dict(t0=17.4, t1=19.6, kind="still", src="frames/k05-flyer.jpg", zoom=(1.0, 1.16), look="warm"),
    dict(t0=19.6, t1=20.6, kind="title", text="ONE DAD."),
    dict(t0=20.6, t1=21.6, kind="title", text="ZERO PLANS."),
    dict(t0=21.6, t1=28.0, kind="clip", src="doorway", ss=0.0, speed=0.62, look="night"),
    dict(t0=28.0, t1=29.4, kind="clip", src="crayon", ss=1.0, look="night"),
    dict(t0=29.4, t1=31.0, kind="clip", src="kids", ss=1.5, look="night"),
    dict(t0=31.0, t1=32.3, kind="clip", src="phone", ss=0.5, look="night", notifications=True),
    dict(t0=32.3, t1=33.7, kind="clip", src="pdf", ss=1.5, look="warm"),
    dict(t0=33.7, t1=35.4, kind="clip", src="standoff", ss=1.5, look="warm"),
    dict(t0=35.4, t1=36.4, kind="black"),
    dict(t0=36.4, t1=39.0, kind="app", scroll=(0, 1500)),
    dict(t0=39.0, t1=41.4, kind="clip", src="relief", ss=0.8, look="warm"),
    dict(t0=41.4, t1=45.4, kind="clip", src="hero-walk", ss=0.0, speed=0.85, look="warm"),
    dict(t0=45.4, t1=47.8, kind="card"),
    dict(t0=47.8, t1=50.4, kind="logo"),
    dict(t0=50.4, t1=51.0, kind="black"),
]
DURATION = SHOTS[-1]["t1"]

DROP = 35.4
REVEAL = 36.4
END = 50.4

# (t0, t1, text, style)
CAPTIONS = [
    (2.2, 4.6, "In a town where everything is happening...", "vo"),
    (6.5, 8.9, "...no one knows what's happening.", "vo"),
    (9.9, 12.2, "He searched the town website.", "vo"),
    (12.7, 14.5, "He checked the Facebook group.", "vo"),
    (15.2, 17.3, "He found a flyer.", "vo"),
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
    (42.0, 45.3, "\u201cI found out about the street fair BEFORE it happened.\u201d\n\u2014 Local Dad", "quote"),
]

STAMPS = [
    (6.1, 9.1, "WESTFIELD, NJ"),
    (9.3, 12.3, "THURSDAY \u00b7 9:04 PM"),
]

# (appears_at, app, text)
NOTIFICATIONS = [
    (31.05, "FACEBOOK", "Westfield Neighbors: 58 new comments on \u201cparking??\u201d"),
    (31.35, "MESSAGES", "Jen: are we doing the fair or not"),
    (31.65, "TOWN OF WESTFIELD", "Leaf collection schedule has changed."),
    (31.95, "MESSAGES", "Jen: hello??"),
]

TABS = [
    "Events | Town of Westfield \u2014 Page Not Found",
    "Westfield Neighbors (Unofficial) \u00b7 412 comments",
    "Rec_Dept_Fall_Brochure_FINAL_v3.pdf",
    "is the street fair this weekend - Google Search",
    "Downtown Westfield Events (Updated 2021)",
    "Westfield Moms \u00b7 \u201cdoes anyone know??\u201d",
    "westfieldnj.gov/calendar/calendar/calendar",
    "Nextdoor \u00b7 Lost cat (unrelated)",
]

# Audio: (name, file_offset, dst_start, dst_len or None, gain_db, kind)
# kind: narrator | whisper | kid
VOICES = [
    ("vo01", 0.0, 2.2, None, 0, "narrator"),
    ("vo02", 0.0, 6.5, None, 0, "narrator"),
    ("vo03", 0.0, 9.9, None, 0, "narrator"),
    ("vo04", 0.0, 12.7, None, 0, "narrator"),
    ("vo05", 0.0, 15.2, None, 0, "narrator"),
    ("vo06", 0.0, 17.8, None, 0, "narrator"),
    ("mom-line", 0.75, 21.9, 1.3, 2, "whisper"),
    ("dad-line", 0.0, 23.35, 2.05, 9, "whisper"),
    ("dad-line", 9.0, 26.0, 1.95, 10, "whisper"),
    ("kid-a", 0.05, 29.45, None, 3, "kid"),
    ("kid-b", 0.0, 29.52, None, 2, "kid"),
    ("vo07", 0.0, 36.6, None, 0, "narrator"),
]

# (name, src_start, dst_start, dst_end, gain_db)
MUSIC = [
    ("music-build", 0.0, 0.4, 19.6, -2),
    ("music-build", 41.0, 19.6, 21.6, -1),
    ("music-build", 43.0, 21.6, 28.0, -17),
    ("music-build", 148.6, 28.0, DROP, 0),
    ("music-resolve", 3.4, REVEAL, 41.4, 0),
    ("music-resolve", 68.3, 41.4, 47.8, -1),
    ("music-resolve", 89.0, 47.8, END, -1),
]

# (name, dst_start, gain_db)
SFX = [
    ("sfx-boom", 0.05, -2),
    ("sfx-whoosh", 17.25, -8),
    ("sfx-boom", 19.6, -4),
    ("sfx-boom", 20.6, -4),
    ("sfx-boom", 28.0, -3),
    ("sfx-paper-slide", 28.1, -4),
    ("sfx-whoosh", 29.3, -8),
    ("sfx-whoosh", 30.9, -8),
    ("sfx-phone-buzz", 31.05, -4),
    ("sfx-whoosh", 32.2, -8),
    ("sfx-paper-slam", 32.3, -2),
    ("sfx-whoosh", 33.6, -8),
    ("sfx-riser", DROP - 4.05, -4),
]
