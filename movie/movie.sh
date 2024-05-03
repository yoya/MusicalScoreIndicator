#! /bin/bash
# Usage: sh setup.sh foo  # foo.mp4 setup
# require) ffmpeg, ImageMagick, zopflipng

set -euo pipefail

b=$1

ffmpeg -y -i $b.mp4 -filter_complex "showwavespic=size=1012x40::split_channels=0:colors=orange:scale=2" $b-wave.png
convert $b-wave.png -fx "(p{i,j}+p{i,39-j})*0.6" -crop x20+0 -resize 'x400%!' +repage -crop x40+0+40 $b-wave.png
zopflipng -y $b-wave.png $b-wave.png
ffmpeg -y -i $b.mp4 $b.wav ;
ffmpeg -y -i $b.wav -filter_complex "showcqt=size=448x136:timeclamp=0.5:rate=12:gamma=6:fontcolor=r(1)+g(1)+b(1)" $b-spectrum.gif
ffmpeg -y -i $b-spectrum.gif -r 12 -pix_fmt yuv420p $b-spectrum.mp4
rm -f $b-spectrum.wav $b-spectrum.gif
