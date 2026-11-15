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

## CQT 表示

play.html は spectrum 動画 (showcqt) と同じ絵を canvas に描く (cqt.js)。上から順に使えるものを使う。

1. 事前計算データ (WebP): 曲設定ごとに movie/cqtdata.sh で作る。遅れが無く、0.1 秒先を
   表示する。通信量は spectrum 動画の 1/10 程度。YouTube の曲にも使える
2. リアルタイム解析: データが無い時に、再生中の音声を解析して描く。0.06〜0.12 秒ほど遅れる
3. spectrum 動画: データが無い YouTube や別オリジンの動画の時

```
% bash movie/cqtdata.sh movie/debussy/images-Iberia-2-boulez.json
=> movie/debussy/images-Iberia-2-boulez-cqt.webp
% bash movie/cqtdata.sh gounod/faust-juwelenarie-score.json
=> movie/gounod/faust-juwelenarie-score-cqt.webp
```

- WebP は movie/ 以下の、設定と同じディレクトリに「設定の名前-cqt.webp」で置く
  (debussy/foo.json と movie/debussy/foo.json は同じ movie/debussy/foo-cqt.webp を使う)。
  play.html はこの名前で探すので、設定 JSON の書き換えは要らない
- 設定の再生範囲 (timeScope) の分だけ作る。11 分を超えると foo-cqt-2.webp … に分かれる
- 音声は設定の bigvideo / file から探す (noaudio や YouTube の時は同じ名前の音声付きの
  ファイルを探す)。見つからなければ 2 番目の引数で音声ファイルを指定する
- 設定の再生範囲を変えたら作り直す

URL パラメータ: `cqt=video` (spectrum 動画)、`cqt=live` (リアルタイム解析)、
`cqt=3` (データと spectrum 動画を並べる)、`cqt=2` (リアルタイム解析と spectrum 動画を並べる)、
`cqtlead=0.1` (データを何秒先に表示するか)、`cqtfast=0` (リアルタイム解析の窓長を showcqt と同じにする)。

# usage

http://〜/MusicalScoreIndicator/play.html?c=sample.json
