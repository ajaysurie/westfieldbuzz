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

# 16:9 desktop copy: vertical cut centred over a colour wash sampled from the frame.
# The wash is built from a tiny downscale so on-screen text never ghosts into the sides.
ffmpeg -y -v error -i build/westfield-buzz-trailer-v2.mp4 -filter_complex \
  "[0:v]split[a][b];[a]scale=24:14:force_original_aspect_ratio=increase,crop=24:14,gblur=sigma=1.5,scale=1920:1080:flags=bicubic,eq=brightness=-0.10:saturation=0.85[bg];[b]scale=-2:1080:flags=lanczos[fg];[bg][fg]overlay=(W-w)/2:0,noise=alls=3:allf=t,format=yuv420p" \
  -c:v libx264 -preset slow -crf 22 -maxrate 8M -bufsize 16M -profile:v high -c:a copy -movflags +faststart \
  build/westfield-buzz-trailer-v2-desktop.mp4
echo "built build/westfield-buzz-trailer-v2-desktop.mp4"
