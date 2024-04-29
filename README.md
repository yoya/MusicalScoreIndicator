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
# https://nico-lab.net/create_samples_waves_image_with_ffmpeg/
% ffmpeg -i input -filter_complex "showwavespic=s=1000x40:colors=orange:scale=2" showwavespic.png


# Reference

- https://developers.google.com/youtube/iframe_api_reference?hl=ja
