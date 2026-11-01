#!/usr/bin/env bash
# Combine disha-demo.mp4 + rag-demo.mp4 + learn-demo.mp4 into one polished
# demo video with title cards: docs/assets/disha-full-demo.mp4
#
# Pure ffmpeg (+ Pillow for static title-card PNGs — see make_title_card.py
# for why: the homebrew `ffmpeg` on this machine has no drawtext filter).
# $0 cost, no app/server, nothing sent to Claude.
#
# Usage: scripts/record-demo/build-full-demo.sh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ASSETS="$ROOT_DIR/docs/assets"
WORK="$(mktemp -d /tmp/disha-full-demo.XXXXXX)"
trap 'rm -rf "$WORK"' EXIT

CARD_DUR=2.5
CANVAS=1920x1080
BG_HEX="#201E1B"
MUSIC="$ASSETS/bg-music.mp3"

mkdir -p "$WORK/cards" "$WORK/segments"

echo "==> Work dir: $WORK"

# ---------------------------------------------------------------------------
# 1) Render title-card PNGs (Pillow; see make_title_card.py)
# ---------------------------------------------------------------------------
echo "==> Rendering title cards"
python3 "$ROOT_DIR/scripts/record-demo/make_title_card.py" "$WORK/cards/intro.png" \
  --lines "Disha|big" "What should I learn next?|accent" "Team Matmulattention  ·  Powered by Claude|small"

python3 "$ROOT_DIR/scripts/record-demo/make_title_card.py" "$WORK/cards/before_rag.png" \
  --lines "Ask your material anything|main" "Claude-grounded answers, with citations|accent"

python3 "$ROOT_DIR/scripts/record-demo/make_title_card.py" "$WORK/cards/before_learn.png" \
  --lines "Learn it as a lesson|main" "Adaptive teaching video, generated on the fly|accent"

python3 "$ROOT_DIR/scripts/record-demo/make_title_card.py" "$WORK/cards/outro.png" \
  --lines "Try it|big" "github.com/Laaaaksh/disha|accent" "Powered by Claude|small"

# ---------------------------------------------------------------------------
# 2) Turn each PNG into a CARD_DUR-second video segment with a soft music bed
#    (different offset into bg-music.mp3 per card so it's not the identical
#    slice every time), normalized to the common canvas/fps/audio format.
# ---------------------------------------------------------------------------
make_card_segment() {
  local png="$1" out="$2" music_offset="$3"
  ffmpeg -y -v error \
    -loop 1 -framerate 30 -t "$CARD_DUR" -i "$png" \
    -ss "$music_offset" -t "$CARD_DUR" -i "$MUSIC" \
    -filter_complex "[0:v]scale=${CANVAS}:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=${BG_HEX},setsar=1,fps=30,format=yuv420p[v];\
[1:a]volume=0.4,aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,asetpts=PTS-STARTPTS[a]" \
    -map "[v]" -map "[a]" -t "$CARD_DUR" -r 30 \
    -c:v libx264 -crf 20 -pix_fmt yuv420p -c:a aac -b:a 160k -ar 44100 -ac 2 \
    -shortest "$out"
}

echo "==> Encoding card segments"
make_card_segment "$WORK/cards/intro.png"       "$WORK/segments/1_intro.mp4"       0
make_card_segment "$WORK/cards/before_rag.png"  "$WORK/segments/3_before_rag.mp4"  20
make_card_segment "$WORK/cards/before_learn.png" "$WORK/segments/5_before_learn.mp4" 40
make_card_segment "$WORK/cards/outro.png"       "$WORK/segments/7_outro.mp4"       60

# ---------------------------------------------------------------------------
# 3) Normalize each source clip onto the same canvas/fps/audio format,
#    keeping the clip's own baked-in audio (music bed / narration).
#    Portrait disha-demo.mp4 will pillarbox — expected.
# ---------------------------------------------------------------------------
normalize_clip() {
  local in="$1" out="$2"
  ffmpeg -y -v error -i "$in" \
    -filter_complex "[0:v]scale=${CANVAS}:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=${BG_HEX},setsar=1,fps=30,format=yuv420p[v];\
[0:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,asetpts=PTS-STARTPTS[a]" \
    -map "[v]" -map "[a]" -r 30 \
    -c:v libx264 -crf 20 -pix_fmt yuv420p -c:a aac -b:a 160k -ar 44100 -ac 2 \
    "$out"
}

echo "==> Normalizing source clips"
normalize_clip "$ASSETS/disha-demo.mp4" "$WORK/segments/2_disha.mp4"
normalize_clip "$ASSETS/rag-demo.mp4"   "$WORK/segments/4_rag.mp4"
normalize_clip "$ASSETS/learn-demo.mp4" "$WORK/segments/6_learn.mp4"

# ---------------------------------------------------------------------------
# 4) Concatenate all 7 segments in order via the concat DEMUXER (stream
#    copy — all segments already share identical codec/format params from
#    steps 2-3, so no re-encode is needed and there's zero quality loss or
#    A/V drift risk from a second pass).
# ---------------------------------------------------------------------------
echo "==> Concatenating segments"
LIST="$WORK/concat_list.txt"
: > "$LIST"
for f in 1_intro 2_disha 3_before_rag 4_rag 5_before_learn 6_learn 7_outro; do
  echo "file '$WORK/segments/${f}.mp4'" >> "$LIST"
done

OUT="$ASSETS/disha-full-demo.mp4"
ffmpeg -y -v error -f concat -safe 0 -i "$LIST" -c copy "$OUT"

echo "==> Done: $OUT"
ffprobe -v error -show_entries format=duration,size -show_entries stream=codec_type,codec_name,width,height,r_frame_rate,sample_rate,channels -of default=noprint_wrappers=0 "$OUT"
