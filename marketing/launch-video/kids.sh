#!/usr/bin/env bash
# Build a layered "group of kids" chant from several neural voices.
# Every take is stretched to the same length and adult voices are pitched up.
set -euo pipefail
cd "$(dirname "$0")"
TEXT="What are we DOING this weekend?"
TARGET=1.45
# voice rate semitones
TAKES=(
  "en-US-AnaNeural +8% 0"
  "en-US-AnaNeural +14% 2"
  "en-US-AvaNeural +12% 5"
  "en-US-EmmaNeural +10% 6"
  "en-US-JennyNeural +12% 5"
  "en-US-AriaNeural +10% 4"
  "en-US-BrianNeural +12% 8"
  "en-US-AndrewNeural +10% 7"
)
i=0
for take in "${TAKES[@]}"; do
  read -r voice rate semis <<<"$take"
  base="audio/kid$i"
  edge-tts --voice "$voice" --rate="$rate" --text "$TEXT" --write-media "$base.mp3" 2>/dev/null
  ffmpeg -y -v error -i "$base.mp3" \
    -af "silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse" \
    -ar 48000 -ac 1 "$base.trim.wav"
  dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$base.trim.wav")
  r=$(python3 -c "print(2**($semis/12))")
  tempo=$(python3 -c "print($dur/$TARGET)")
  ffmpeg -y -v error -i "$base.trim.wav" \
    -af "atempo=$tempo,asetrate=48000*$r,aresample=48000,atempo=1/$r" -ar 48000 -ac 1 "$base.wav"
  rm "$base.trim.wav"
  i=$((i+1))
done
