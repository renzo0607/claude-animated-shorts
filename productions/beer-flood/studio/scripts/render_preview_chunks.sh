#!/bin/bash
# 15 fps half-size preview in 4 chunks (a failure only costs one chunk), then concat + mux the mix
cd "$(dirname "$0")/.."
export REMOTION_TMP=/tmp
N=1118; C=4; step=$(( (N + C - 1) / C ))
for k in ${CHUNKS:-$(seq 0 $((C-1)))}; do
  a=$((k*step)); b=$(( (k+1)*step - 1 )); [ $b -ge $N ] && b=$((N-1))
  out=out/beer/part_$k.mp4
  [ -s $out ] && { echo "chunk $k exists"; continue; }
  echo "chunk $k: frames $a-$b start $(date +%H:%M)"
  npx remotion render src/index.ts BeerFloodPreview $out --frames=$a-$b --codec h264 --crf 20 \
    --props '{"step":2,"post":{"msaa":2,"shadow":1024,"lens":false,"bloom":false}}' \
    --browser-executable /opt/pw-browsers/chromium-1243/chrome-linux64/chrome --gl angle --concurrency 1 --timeout 400000 \
    > out/beer/part_$k.log 2>&1 || { echo "chunk $k FAILED"; grep -m3 -E "Error|error rendering" out/beer/part_$k.log; exit 1; }
  echo "chunk $k done $(date +%H:%M)"
done
[ -n "$CHUNKS" ] && { echo "CHUNKS $CHUNKS DONE"; exit 0; }
printf "file 'part_0.mp4'\nfile 'part_1.mp4'\nfile 'part_2.mp4'\nfile 'part_3.mp4'\n" > out/beer/parts.txt
ffmpeg -loglevel error -y -f concat -safe 0 -i out/beer/parts.txt -c copy out/beer/preview_video.mp4
ffmpeg -loglevel error -y -i out/beer/preview_video.mp4 -i out/beer/audio/mix.wav -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -b:a 192k -shortest out/beer/preview_beer_flood.mp4
echo "ALL DONE $(date +%H:%M)"
