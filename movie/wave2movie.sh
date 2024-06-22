#! /bin/bash
# Usage: sh wave2movie.sh foo.wav foo.mp4  # foo.mp4 spectrum & wave show
# require) ffmpeg

set -euo pipefail

i=$1
o=$2

r=24

# コマンドラインの結果が  false だと -o pipeline に引っかかる
# || true をつけて回避。
# ref) https://qiita.com/progrhyme/items/6e522d83de3c94aadec9

duration=`ffmpeg  -i $i >& /dev/stdout | grep  Duration |  awk -F " "  '{print $2}' | awk  -F "." '{print $1}' || true`

opt_duration="-t $duration"

# ref) https://shingoushori.hatenablog.jp/entry/2018/03/04/001806

ffmpeg -y -i $i -r $r  $opt_duration -filter_complex \
       "[0:a]showspectrum=mode=combined:color=rainbow:scale=sqrt:fscale=log:slide=scroll:s=320x80:fps=$r,pad=320:180[ss]; \
       [0:a]aformat=channel_layouts=mono,showwaves=s=400x100:mode=line:scale=sqrt:colors=yellow:n=0.25[sw]; \
       [0:a]showvolume=w=100:h=50:b=4:o=v:t=0:v=0,pad=210:100[vs]; \
       [sw][vs]overlay=w[bg]; \
       [ss][bg]overlay=0:H-h[out]" \
       -map "[out]" -map 0:a $o
