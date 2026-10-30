#!/usr/bin/env bash
# Renders the film and masters it to film/pilego-launch.mp4.
#  1. Remotion renders a ProRes 422 HQ master with PCM audio (out/, not committed).
#  2. ffmpeg measures loudness, then normalises to -14 LUFS / -1.5 dBTP (EBU R128,
#     two-pass loudnorm) and encodes H.264 High (CRF 16, BT.709) + AAC 320k.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p out film
npx remotion render LaunchFilm out/pilego-launch-master.mov --codec=prores --prores-profile=hq --log=error

measure=$(ffmpeg -hide_banner -i out/pilego-launch-master.mov -af loudnorm=I=-14:TP=-1.5:LRA=9:print_format=json -f null - 2>&1 | sed -n '/^{/,/^}/p')
get() { echo "$measure" | python3 -c "import json,sys; print(json.load(sys.stdin)['$1'])"; }
af="loudnorm=I=-14:TP=-1.5:LRA=9:measured_I=$(get input_i):measured_TP=$(get input_tp):measured_LRA=$(get input_lra):measured_thresh=$(get input_thresh):offset=$(get target_offset):linear=true,aresample=48000"

ffmpeg -hide_banner -loglevel error -y -i out/pilego-launch-master.mov \
  -c:v libx264 -preset slow -crf 16 -pix_fmt yuv420p -profile:v high \
  -color_primaries bt709 -color_trc bt709 -colorspace bt709 \
  -af "$af" -c:a aac -b:a 320k -movflags +faststart film/pilego-launch.mp4

ffmpeg -hide_banner -i film/pilego-launch.mp4 -af ebur128=peak=true -f null - 2>&1 | grep -A16 Summary | grep -E "I:|Peak:"
