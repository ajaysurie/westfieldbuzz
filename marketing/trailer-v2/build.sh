#!/usr/bin/env bash
# Rebuild a trailer from the Runway assets: build/<name>.mp4 (default: the v2 cut)
# Needs: ffmpeg, python3 with numpy/scipy/pillow. Fetch assets first with fetch.py.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p build/wav

for f in audio/*.mp3; do
  ffmpeg -y -v error -i "$f" -ar 48000 -ac 2 "build/wav/$(basename "$f" .mp3).wav"
done

# TRAILER_TIMELINE=timeline_town TRAILER_NAME=westfield-buzz-trailer-town ./build.sh builds the town cut.
name=${TRAILER_NAME:-westfield-buzz-trailer-v2}
python3 mix.py build/mix.wav

# Vertical master, then a 16:9 desktop cut (native titles/captions, footage centred).
for format in vertical desktop; do
  suffix=$([[ $format == desktop ]] && echo "-desktop" || true)
  TRAILER_FORMAT=$format python3 render.py "build/video$suffix.mp4"
  ffmpeg -y -v error -i "build/video$suffix.mp4" -i build/mix.wav \
    -af "loudnorm=I=-14:TP=-1.0:LRA=11" -ar 48000 \
    -c:v libx264 -preset slow -crf 23 -maxrate 6M -bufsize 12M -pix_fmt yuv420p -profile:v high \
    -c:a aac -b:a 192k -shortest -movflags +faststart \
    "build/$name$suffix.mp4"
  echo "built build/$name$suffix.mp4"
done
