#! /bin/bash
# Usage: sh movie.sh foo  # foo.mp4 movie setup
# require) ffmpeg, ImageMagick, zopflipng

set -euo pipefail

b=$1

r=24

ffmpeg -y -i $b.mp4 -filter_complex "showwavespic=size=1012x40::split_channels=0:colors=orange:scale=2" $b-wave.png
convert $b-wave.png -fx "(p{i,j}+p{i,39-j})*0.6" -crop x20+0 -resize 'x400%!' +repage -crop x40+0+40 $b-wave.png
zopflipng -y $b-wave.png $b-wave.png

ffmpeg -y -i $b.mp4 $b.wav ;

ffmpeg -y -i $b.wav -filter_complex "showcqt=size=600x180:timeclamp=0.5:rate=$r:gamma=5:gamma2=5:fontcolor=r(1)+g(1)+b(1),crop=448:136:100" $b-spectrum.gif
ffmpeg -y -i $b-spectrum.gif -r $r -pix_fmt yuv420p $b-spectrum.mp4
rm -f $b.wav $b-spectrum.gif
