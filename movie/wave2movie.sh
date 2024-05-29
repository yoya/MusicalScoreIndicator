#! /bin/bash
# Usage: sh wave2movie.sh foo.wav foo.mp4  # foo.mp4 spectrum & wave show
# require) ffmpeg

set -euo pipefail

i=$1 ; o=$2

r=24

# ref) https://shingoushori.hatenablog.jp/entry/2018/03/04/001806

ffmpeg -y -i $i -r $r -filter_complex  \
       "[0:a]showspectrum=mode=combined:color=rainbow:scale=cbrt:slide=scroll:s=320x100:fps=$r,pad=320:180[vs]; \
       [0:a]aformat=channel_layouts=mono,showwaves=s=640x80:mode=line:scale=sqrt:colors=yellow:n=0.25[sw]; \
        [vs][sw]overlay=0:H-h[out]" -map "[out]" -map 0:a $o
