#! /bin/bash
# 曲設定 (JSON) の再生範囲の CQT 表示データ (WebP) を作る。
# require) ffmpeg, ffprobe, cwebp, webpmux, python3
#
# usage: bash movie/cqtdata.sh <曲設定.json> [音声ファイル]
#   例) bash movie/cqtdata.sh movie/debussy/images-Iberia-2-boulez.json
#       bash movie/cqtdata.sh gounod/faust-juwelenarie-score.json
#
# 出力: movie/<設定と同じディレクトリ>/<設定の名前>-cqt.webp
#   (movie/debussy/foo.json と debussy/foo.json は、どちらも movie/debussy/foo-cqt.webp)
#   play.js は設定の名前からこの場所を探し、あれば spectrum 動画の代わりに使う。
#   設定 JSON の書き換えは不要。
#
# 中身: movie.sh の spectrum 動画と同じ showcqt の設定
#   (size=600x180:timeclamp=0.5:gamma=5 を crop=448:136:100 した 448 列) の値を、
#   毎秒 24 行、1 行 = 左 448 列 + 右 448 列 のグレースケール画像にしたもの。
#   設定の再生範囲 (timeScope、無ければ全体) の前後 1 秒を含めて作る。
#   開始時刻などは WebP の XMP 領域に JSON で入れてある (cqt.js が読む)。
#   1 枚の高さは WebP の上限 16383 行 (約 11 分) までなので、長いと
#   foo-cqt-2.webp, foo-cqt-3.webp … に分ける。
# 値の時刻は showcqt と同じく解析窓の中心なので、動画と同じく遅れは無い。
#
# 音声は設定の bigvideo / file から音声のあるものを探す
# (noaudio / YouTube の時は、同じ名前の -noaudio を除いたもの・-big・spectrum の元の名前も見る)。
# 見つからない時は 2 番目の引数で指定する。

set -euo pipefail

if [ $# -lt 1 ] || [ $# -gt 2 ]; then
    echo "Usage: bash movie/cqtdata.sh <config.json> [audio-file]"
    exit 1
fi

root=$(cd "$(dirname "$0")/.." && pwd)   # リポジトリの最上位 (play.html の場所)
config=$(cd "$(dirname "$1")" && pwd)/$(basename "$1")
audio=${2:-}

rate=24          # 1 秒あたりの行数 (movie.sh の r と同じ)
maxrows=16383    # WebP の高さの上限
quality=80       # WebP の品質
margin=1         # 再生範囲の前後に足す秒数
# movie.sh の showcqt と同じ設定。高さ 2 のソノグラムだけにして、最新の 1 行を取る。
showcqt="showcqt=s=600x2:bar_h=0:axis_h=0:sono_h=2:count=1:rate=$rate:timeclamp=0.5:gamma=5:gamma2=5"

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

# 設定を読んで、出力先・音声ファイル・範囲を決める
# (bash 3.2 は $( ) の中のヒアドキュメントが不安定なので、一度ファイルに書く)
cat > "$tmp/conf.py" <<'EOF'
import json, os, re, shlex, subprocess, sys
root, config, audio, margin = sys.argv[1], sys.argv[2], sys.argv[3], float(sys.argv[4])

def string_to_time(s):  # utils.js の stringToTime と同じ解釈
    s = str(s).strip()
    num = r"[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?"
    if re.fullmatch(num + r"(?::" + num + r")+s?", s):
        t = 0.0
        for x in re.sub(r"s$", "", s).split(":"):
            t = t * 60 + float(x)
        return t
    m = re.fullmatch(r"(?:(" + num + r")h)?(?:(" + num + r")m)?(?:(" + num + r")s?)?", s)
    if m and any(g is not None for g in m.groups()):
        h, mi, se = (float(g) if g is not None else 0.0 for g in m.groups())
        return h * 3600 + mi * 60 + se
    sys.exit("cqtdata: 解釈できない時間表記: %r" % s)

def has_audio(path):
    if not os.path.isfile(path):
        return False
    r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries",
                        "stream=index", "-of", "csv=p=0", path], capture_output=True, text=True)
    return r.stdout.strip() != ""

def duration(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                        "-of", "csv=p=0", path], capture_output=True, text=True, check=True)
    return float(r.stdout.strip())

c = json.load(open(config))
rel = os.path.relpath(config, root)
if rel.startswith(".."):
    sys.exit("cqtdata: 設定がリポジトリの外にあります: " + config)
rel = re.sub(r"^movie/", "", rel)
out = os.path.join(root, "movie", re.sub(r"\.json$", "", rel) + "-cqt")

# 音声ファイル
cands = []
if audio:
    cands.append(os.path.abspath(audio))
else:
    for key in ("bigvideo", "file"):
        v = c.get(key, "")
        if v and not v.startswith("http"):
            p = os.path.join(root, v)
            cands += [p, p.replace("-noaudio", ""), re.sub(r"(-noaudio)?\.mp4$", "-big.mp4", p)]
    sp = c.get("spectrum", "")
    if sp:
        b = os.path.join(root, re.sub(r"-spectrum\.mp4$", "", sp))
        cands += [b + ".mp4", b + ".m4a", b + "-big.mp4"]
src = next((p for p in cands if has_audio(p)), None)
if not src:
    sys.exit("cqtdata: 音声のあるファイルが見つかりません。2 番目の引数で指定してください。候補: "
             + ", ".join(sorted(set(os.path.relpath(p, root) for p in cands))))

# 範囲 (動画の時間。timeScheduleOffset があれば play.js と同じく引く)
dur = duration(src)
offset = string_to_time(c["timeScheduleOffset"]) if "timeScheduleOffset" in c else 0.0
if "timeScope" in c:
    head = string_to_time(c["timeScope"]["headTime"]) - offset
    tail = string_to_time(c["timeScope"]["tailTime"]) - offset
else:
    head, tail = 0.0, dur
start = max(0.0, head - margin)
end = min(dur, tail + margin)
if end <= start:
    sys.exit("cqtdata: 範囲が空です (%.1f〜%.1f, 音声の長さ %.1f)" % (start, end, dur))

for k, v in (("out", out), ("src", src), ("start", "%.3f" % start), ("length", "%.3f" % (end - start))):
    print("%s=%s" % (k, shlex.quote(v)))
EOF
vars=$(python3 "$tmp/conf.py" "$root" "$config" "$audio" "$margin")
eval "$vars"

rows=$(awk -v d="$length" -v r=$rate 'BEGIN { printf "%d", d * r + 0.999 }')
files=$(( (rows + maxrows - 1) / maxrows ))
chunk=$(( (rows + files - 1) / files ))   # 1 枚の行数 (枚数で均等に割る)

# 左 (r) と右 (b) の値を横に並べ、chunk 行ずつ 1 枚の画像にする (最後の 1 枚の余りは黒)
ffmpeg -nostdin -v error -y -ss "$start" -t "$length" -i "$src" -filter_complex \
       "[0:a:0]$showcqt,format=rgb24,crop=448:1:100:0,format=gbrp,extractplanes=r+b[l][r];[l][r]hstack,tile=1x$chunk" \
       -start_number 1 "$tmp/%d.png"

mkdir -p "$(dirname "$out")"
rm -f "$out.webp" "$out"-[0-9]*.webp
cat > "$tmp/meta.json" <<EOF
{"format":"cqtdata-2","start":$start,"rate":$rate,"rows":$rows,"chunkRows":$chunk,"files":$files,"width":448,"source":"$(basename "$src")","showcqt":"$showcqt","crop":"448:136:100"}
EOF
for i in $(seq 1 $files); do
    if [ $i -eq 1 ]; then f="$out.webp"; else f="$out-$i.webp"; fi
    cwebp -quiet -q $quality -m 6 "$tmp/$i.png" -o "$tmp/$i.webp"
    if [ $i -eq 1 ]; then
        webpmux -set xmp "$tmp/meta.json" "$tmp/$i.webp" -o "$f" 2>&1 | grep -v "^Saved file" >&2 || true
        [ -s "$f" ] || { echo "cqtdata: webpmux に失敗しました: $f"; exit 1; }
    else
        mv "$tmp/$i.webp" "$f"
    fi
done

echo "${out#$root/}.webp: $files file(s), $(cat "$out".webp "$out"-[0-9]*.webp 2>/dev/null | wc -c | awk '{printf "%d", $1/1024}') KB," \
     "range ${start}s + ${length}s, source $(basename "$src")"
