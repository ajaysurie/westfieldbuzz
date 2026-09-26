"""Download Runway outputs listed in a `list_recent` dump into frames/ or clips/.

Usage: python3 fetch.py <list_recent_output.txt>
"""

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).parent

# Runway task id -> local file name (without extension).
TASKS = {
    "ce4de47b-c2a5-4169-ab83-1730f36efbff": "refs/dad",
    "85b77070-9315-4e01-b91d-264a41259dad": "refs/kids",
    "27bfe37d-0739-4ce0-9802-14ce94f8b748": "refs/mom",
    "9e537c96-7437-4356-9bfa-ec680db674c1": "frames/k01-drone",
    "28cdddd8-7e71-4251-9f14-e08e78df9ff4": "frames/k02-window",
    "c0c233d0-c521-4281-a32b-9f00db28da1e": "frames/k03-dad-phone",
    "340a2605-5b7e-474b-b53e-cea249e68569": "frames/k04-board",
    "242d053b-813d-4b07-85d4-b62437681223": "frames/k05-flyer",
    "c6975579-f3e2-46d9-9c2a-5aaead9deb3c": "frames/k06-doorway",
    "f72c6953-cef3-489e-a7c0-ab21fe640d84": "frames/k07-crayon",
    "5ae909e3-8857-4c47-b4e0-5ecd6fdd596e": "frames/k08-kids",
    "afaad9db-4130-472c-b208-62763e724dc2": "frames/k09-phone",
    "0e533ccb-1746-4435-88a2-7e30aa770122": "frames/k10-pdf",
    "4f2438c3-6e78-4a6f-be18-13ae2b17e0b4": "frames/k11-standoff",
    "e5b8ee2f-e6c9-4675-8504-a99d6a0d7a13": "frames/k12-relief",
    "6ef233f8-0983-44a7-8925-96c387f242a7": "frames/k13-hero-walk",
    "2cabfa29-46d4-4cdd-b199-f2ef5f388007": "clips/dad-phone",
    "b5144167-82a6-4ba7-8d23-90bfee35dc0b": "clips/board",
    "0cc9ebee-996e-4f34-be88-0640995747f3": "clips/window",
    "e0c63aee-d452-460b-85fc-e23b8a3d8c7e": "clips/drone",
    "de8faedf-4200-4e57-b959-bc5139365326": "audio/vo01",
    "08834bb0-bc57-4de8-8dc4-bac2d4b8c1da": "audio/vo02",
    "dc7a8be2-f40c-40af-ad15-11c15af6c54b": "audio/vo03",
    "7329d46e-5aee-4934-8671-8c0113665eb0": "audio/vo04",
    "3e205bec-c852-4153-9253-c07047bf55c2": "audio/vo05",
    "6f8ba6d1-43cb-4928-bda0-ef887f811b33": "audio/vo06",
    "668cecbe-72a7-4b89-9149-9a30116e1953": "audio/vo07",
    "d7ec254c-411d-4050-b7a5-f35b0beb364a": "audio/mom-line",
    "d0cc6deb-84c5-4e00-a058-722a042b8137": "audio/dad-line",
    "a1cc07d9-911e-41c5-abda-a31c98e5a09b": "audio/kid-a",
    "6e1be0c7-126c-44bc-90b7-412920fd6712": "audio/kid-b",
    "0e82d4e6-5abc-4f65-84f1-0798abff0bcc": "audio/music-build",
    "35b9c7a7-f0ef-45fd-8db7-d5f1227b7f04": "audio/music-resolve",
    "4207e424-f5c7-4ead-8b46-97b930e8794d": "audio/sfx-boom",
    "c8db6656-1bad-4982-8f46-eac29ad88bb2": "audio/sfx-phone-buzz",
    "eabc9a4d-49e2-48e4-9934-43af454c1c13": "audio/sfx-paper-slam",
    "40be44fe-8e5a-4b5d-baed-8df975a90ac4": "audio/sfx-paper-slide",
    "1c887fca-27ca-466a-8e13-f4fc3dfaa60f": "audio/sfx-whoosh",
    "ba617a97-9d9e-4d56-b439-194b82c3eab7": "audio/sfx-riser",
    "1e246226-9e13-4ec0-ae93-39d7dba7be97": "clips/doorway",
    "f0e815e5-b3a8-48f7-a011-1f52d6ef77d9": "clips/crayon",
    "bdf965b8-1b3c-4553-8f47-fe2382dfe117": "clips/kids",
    "be900ea4-6acd-4daf-8b54-84cdbdca1ac2": "clips/phone",
    "bd0a5dbd-d249-41a4-89fb-ade952262a4f": "clips/pdf",
    "a062c477-c77c-4cbd-b1b1-d6b55ce03d2f": "clips/relief",
    "0b3d37ab-1be7-4aeb-93ff-5d53430769dd": "clips/standoff",
    "890fad06-a265-418e-885f-295f99f52eeb": "clips/hero-walk",
}


def main():
    text = Path(sys.argv[1]).read_text()
    for m in re.finditer(r"(https://\S+?), task ([0-9a-f-]{36})", text):
        url, task = m.group(1), m.group(2)
        name = TASKS.get(task)
        if not name:
            continue
        ext = ".mp4" if ".mp4" in url.split("?")[0] else (".mp3" if ".mp3" in url.split("?")[0] else ".png")
        out = ROOT / f"{name}{ext}"
        if out.exists():
            continue
        out.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(["curl", "-s", "-o", str(out), url], check=True)
        print("saved", out.relative_to(ROOT))
    missing = [n for t, n in TASKS.items() if not list(ROOT.glob(f"{n}.*"))]
    print("missing:", missing)


if __name__ == "__main__":
    main()
