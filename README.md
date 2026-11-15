# Musical Score Indicator

YouTube で音を再生しながら、楽譜の該当する場所を表示するだけのツールです。
楽譜をクリックすると該当の場所から再生する機能もできれば作りたい。

# JSON 設定

sample.json を参考にして下さい。

- movie/sample.mp4 (再生したい動画)
  - ffmpeg -i original.mp4 -vf scale=320:-1 -movflags +faststart sample.mp4
- movie/sample-wave.png, movie/sample-spectrum.mp4 (movie/movie.sh で movie/sample.mp4 から生成)

# movie seup

```
% cd movie
% sh movie.sh sample  # sample.mp4
=> generate sample-wave.png, sample-spectrum.mp4
```
## bigvideo layout

% ffmpeg -i sample.mp4 -vcodec copy -an -movflags +faststart sample-noaudio.mp4
% ffmpeg -i original.mp4 -acodec copy -vf scale=1280:-1 -movflags +faststart sample-big.mp4
ffmpeg -i in.mp4

## mp4 のメタデータを先頭に置く (faststart)

mp4 のメタデータ (moov) がファイル末尾にあると、ブラウザは再生前に末尾を
取りに行く必要があり、iPad など回線が混む環境で読み込みが大きく遅れる。
上の ffmpeg コマンドには `-movflags +faststart` を付けてある。
付け忘れたファイルや既存のファイルは faststart.sh で後から直せる
(再エンコードなし。中身が変わっていない事を確認してから置き換える)。

```
% cd movie
% bash faststart.sh -n .          # 対象 (メタデータが末尾) の一覧だけ表示
% bash faststart.sh .             # ディレクトリ以下の *.mp4 を全部処理
% bash faststart.sh sample.mp4    # ファイルを指定して処理
```

# usage

http://〜/MusicalScoreIndicator/play.html?c=sample.json
