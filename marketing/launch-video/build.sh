#!/usr/bin/env bash
# Rebuild the Westfield Buzz launch trailer: build/westfield-buzz-launch.mp4
# Needs: ffmpeg, python3 with numpy/scipy/pillow, edge-tts (pip install edge-tts).
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p audio build

NARRATOR=en-US-AndrewMultilingualNeural

tts() { # voice rate pitch name text
  edge-tts --voice "$1" --rate="$2" --pitch="$3" --text "$5" --write-media "audio/$4.mp3" 2>/dev/null
  ffmpeg -y -v error -i "audio/$4.mp3" \
    -af "silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse" \
    -ar 48000 -ac 1 "audio/$4.wav"
}

if [[ "${SKIP_TTS:-0}" != 1 ]]; then
  tts $NARRATOR -18% -6Hz vo01 "In a town where everything is happening..."
  tts $NARRATOR -18% -6Hz vo02 "no one knows what's happening."
  tts $NARRATOR -10% -6Hz vo03 "He searched the town website."
  tts $NARRATOR -10% -6Hz vo04 "He checked the Facebook group."
  tts $NARRATOR -10% -6Hz vo05 "He found a flyer."
  tts $NARRATOR -15% -6Hz vo06 "From twenty nineteen."
  tts $NARRATOR -8% +0Hz vo07 "Westfield Buzz."
  tts $NARRATOR -5% +0Hz vo08 "Every event in town."
  tts $NARRATOR -5% +0Hz vo09 "Every Friday in your inbox."
  ./kids.sh
fi

python3 audio.py build/mix.wav
python3 render.py build/video.mp4

ffmpeg -y -v error -i build/video.mp4 -i build/mix.wav \
  -af "loudnorm=I=-14:TP=-1.0:LRA=11" -ar 48000 \
  -c:v libx264 -preset slow -crf 23 -maxrate 6M -bufsize 12M -pix_fmt yuv420p -profile:v high \
  -c:a aac -b:a 192k -shortest -movflags +faststart \
  build/westfield-buzz-launch.mp4
echo "built build/westfield-buzz-launch.mp4"
