#!/usr/bin/env bash
# Rebuild the v2 trailer from the Runway assets: build/westfield-buzz-trailer-v2.mp4
# Needs: ffmpeg, python3 with numpy/scipy/pillow. Fetch assets first with fetch.py.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p build/wav

for f in audio/*.mp3; do
  ffmpeg -y -v error -i "$f" -ar 48000 -ac 2 "build/wav/$(basename "$f" .mp3).wav"
done

python3 mix.py build/mix.wav
python3 render.py build/video.mp4

ffmpeg -y -v error -i build/video.mp4 -i build/mix.wav \
  -af "loudnorm=I=-14:TP=-1.0:LRA=11" -ar 48000 \
  -c:v libx264 -preset slow -crf 23 -maxrate 6M -bufsize 12M -pix_fmt yuv420p -profile:v high \
  -c:a aac -b:a 192k -shortest -movflags +faststart \
  build/westfield-buzz-trailer-v2.mp4
echo "built build/westfield-buzz-trailer-v2.mp4"
