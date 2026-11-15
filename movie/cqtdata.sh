#! /bin/bash
# 事前計算 CQT データ (play.html の CQT 表示用) を作る。
# require) ffmpeg, cwebp
#
# usage: bash cqtdata.sh foo        # foo.mp4 → foo-cqt/ (index.json, 000.webp, 001.webp, ...)
#
# movie.sh が作る spectrum 動画 (showcqt の動画) の代わり。
# 動画は 1 フレームごとに絵 (バー・軸・流れるソノグラム) を持つので大きいが、
# こちらは「時刻 × 周波数」の値だけを持ち、絵はブラウザ (cqt.js) で描く。
#   - showcqt の設定は movie.sh と同じ (size=600x180:timeclamp=0.5:gamma=5 の
#     crop=448:136:100 で見える範囲 = 448 列)
#   - 毎秒 24 行。1 行 = 左チャンネル 448 列 + 右チャンネル 448 列 (gamma 適用後の 0〜255)
#   - 60 秒 (1440 行) ごとに 896x1440 のグレースケール WebP (品質 80) に分ける
#     (ブラウザが一度にデコードする量を抑えるため)
# 値の時刻は showcqt と同じく「解析窓の中心」なので、動画と同じく遅れは無い。

set -euo pipefail

if [ $# -ne 1 ]; then
    echo "Usage: bash cqtdata.sh foo  # foo.mp4 -> foo-cqt/"
    exit 1
fi

b=$1
in=$b.mp4
out=$b-cqt
rate=24          # 1 秒あたりの行数 (movie.sh の r と同じ)
chunk=1440       # 1 ファイルの行数 (60 秒)
quality=80       # WebP の品質
# movie.sh の showcqt と同じ設定。高さ 2 のソノグラムだけにして、最新の 1 行を取る。
showcqt="showcqt=s=600x2:bar_h=0:axis_h=0:sono_h=2:count=1:rate=$rate:timeclamp=0.5:gamma=5:gamma2=5"

if [ ! -f "$in" ]; then
    echo "$in: not found"
    exit 1
fi

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

# 左 (r) と右 (b) の値を横に並べ、chunk 行ずつ 1 枚の画像にする (最後の 1 枚の余りは黒)
ffmpeg -v error -y -i "$in" -filter_complex \
       "[0:a:0]$showcqt,format=rgb24,crop=448:1:100:0,format=gbrp,extractplanes=r+b[l][r];[l][r]hstack,tile=1x$chunk" \
       -start_number 0 "$tmp/%03d.png"

rm -rf "$out"
mkdir -p "$out"
n=0
for f in "$tmp"/*.png; do
    cwebp -quiet -q $quality -m 6 "$f" -o "$out/$(basename "$f" .png).webp"
    n=$((n + 1))
done

duration=$(ffprobe -v error -select_streams a:0 -show_entries stream=duration -of csv=p=0 "$in")
rows=$(awk -v d="$duration" -v r=$rate 'BEGIN { printf "%d", d * r + 0.999 }')

cat > "$out/index.json" <<EOF
{
    "format": "cqtdata-1",
    "source": "$(basename "$in")",
    "rate": $rate,
    "rows": $rows,
    "chunkRows": $chunk,
    "chunks": $n,
    "width": 448,
    "file": "%03d.webp",
    "showcqt": "$showcqt",
    "crop": "448:136:100"
}
EOF

echo "$out: $n files, $(du -sk "$out" | cut -f1) KB"
