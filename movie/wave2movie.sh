#! /bin/bash
# Usage: sh wave2movie.sh foo.wav foo.mp4  # foo.mp4 spectrum & wave show
# require) ffmpeg

set -euo pipefail

i=$1 ; o=$2

ffmpeg -y -i $i -filter_complex  \
       "[0:a]showspectrum=mode=combined:color=rainbow:scale=cbrt:slide=scroll:s=320x100:fps=24,pad=320:180[vs]; \
       [0:a]showwaves=s=320x80:mode=cline:scale=sqrt[sw]; \
        [vs][sw]overlay=0:H-h[out]" -map "[out]" -map 0:a $o
