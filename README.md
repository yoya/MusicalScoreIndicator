# Musical Score Indicator

YouTube で音を再生しながら、楽譜の該当する場所を表示するだけのツールです。
楽譜をクリックすると該当の場所から再生する機能もできれば作りたい。

# JSON 設定

sample.json を参考にして下さい。

- movie/sample.mp4 (再生したい動画)
- movie/sample-wave.png, movie/sample-spectrum.mp4 (movie/movie.sh で movie/sample.mp4 から生成)

# movie seup

```
% cd movie
% sh movie.sh sample  # sample.mp4
=> generate sample-wave.png, sample-spectrum.mp4
```
## bigvideo layout

% ffmpeg -i sample.mp4 -vcodec copy -an sample-noaudio.mp4
% ffmpeg -i original.mp4 -acodec copy -vf scale=1280:-1 sample-big.mp4
ffmpeg -i in.mp4

# usage

http://〜/MusicalScoreIndicator/play.html?c=sample.json
