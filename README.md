# Musical Score Indicator

(開発中)

YouTube で音を再生しながら、楽譜の該当する場所を表示するだけのツールです。
楽譜をクリックすると該当の場所から再生する機能もできれば作りたい。

# Make movie

```
ffmpeg -i foo.mp4 -vf scale=320:-1 -acodec copy movie/foo.mp4
```

# Make Spectrum

```
% ffmpeg -i music.mp4 -filter_complex "showwavespic=s=1000x40:colors=orange:scale=2" music-wave.png
% ffmpeg -y -i music.mp4 music.wav
% ffmpeg -y -i music.wav -filter_complex "showcqt=size=448x136" music-spectrum.gif
% ffmpeg -y -i music-spectrum.gif -pix_fmt yuv420p music-spectrum.mp4
% rm -f music-spectrum.wav music-spectrum.gif
```


# Reference

- https://developers.google.com/youtube/iframe_api_reference?hl=ja
