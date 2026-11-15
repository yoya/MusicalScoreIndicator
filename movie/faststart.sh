#! /bin/bash
# require) ffmpeg, ffprobe
#
# mp4 のメタデータ (moov) をファイルの先頭に移す (faststart)。
# moov が末尾にあると、ブラウザは再生前にファイル末尾を取りに行く必要があり、
# iPad など回線が混む環境で読み込み完了が大きく遅れる。
# 再エンコードはしない (-c copy) ので、画質・音質は変わらない。
#
# Usage:
#   bash faststart.sh foo.mp4 bar.mp4 ...   # ファイルを指定
#   bash faststart.sh beethoven             # ディレクトリ以下の *.mp4 を全部
#   bash faststart.sh -n .                  # 処理せず、対象 (moov が末尾) を表示するだけ
#
# 安全のため、一時ファイルに書き出して次を確認してから元ファイルと置き換える:
#   - ストリーム構成 (映像/音声のコーデック) が同じ
#   - 長さの差が 0.1 秒未満
#   - 書き出したファイルの moov が先頭にある
#   - 映像・音声のパケットのハッシュが一致する (中身が変わっていない)
# 確認に失敗したファイルは元のまま残し、最後に一覧を出して終了コード 1 で終わる。
# 既に moov が先頭にあるファイルは何もしない (何度実行しても問題ない)。

set -euo pipefail

dry_run=0
if [ "${1:-}" = "-n" ]; then
    dry_run=1
    shift
fi
if [ $# -lt 1 ]; then
    echo "Usage: bash faststart.sh [-n] file.mp4|dir ..." >&2
    exit 1
fi

tmp=""
cleanup() {
    if [ -n "$tmp" ] && [ -e "$tmp" ]; then
        rm -f "$tmp"
    fi
}
trap cleanup EXIT INT TERM

# moov と mdat のどちらが先にあるか (moov / mdat / unknown)
atom_order() {
    local first
    first=$(ffprobe -v trace -i "$1" 2>&1 | grep -o -m 1 "type:'\(moov\|mdat\)'" || true)
    case "$first" in
        "type:'moov'") echo moov ;;
        "type:'mdat'") echo mdat ;;
        *) echo unknown ;;
    esac
}

duration() {
    ffprobe -v error -show_entries format=duration -of csv=p=0 "$1"
}

streams() {
    ffprobe -v error -show_entries stream=codec_type,codec_name -of csv=p=0 "$1" | tr '\n' ' '
}

# 映像・音声のパケット (中身) のハッシュ。-c copy なので処理前後で一致するはず
packet_hash() {
    ffmpeg -nostdin -v error -i "$1" -map 0 -c copy -f streamhash -hash md5 - | tr '\n' ' '
}

processed=0
skipped=0
failed=()

process() {
    local f="$1"
    local order
    order=$(atom_order "$f")
    if [ "$order" = "moov" ]; then
        skipped=$((skipped + 1))
        return
    fi
    if [ "$order" = "unknown" ]; then
        echo "SKIP (moov/mdat が見つからない): $f" >&2
        failed+=("$f")
        return
    fi
    if [ "$dry_run" = 1 ]; then
        echo "target: $f"
        processed=$((processed + 1))
        return
    fi

    tmp="${f%.mp4}.faststart-tmp.mp4"
    if ! ffmpeg -nostdin -v error -y -i "$f" -map 0 -c copy -movflags +faststart "$tmp"; then
        echo "NG (ffmpeg 失敗): $f" >&2
        failed+=("$f")
        rm -f "$tmp"; tmp=""
        return
    fi

    local s1 s2 d1 d2 order2
    s1=$(streams "$f");  s2=$(streams "$tmp")
    d1=$(duration "$f"); d2=$(duration "$tmp")
    order2=$(atom_order "$tmp")
    if [ "$s1" != "$s2" ]; then
        echo "NG (ストリームが変わった: [$s1] -> [$s2]): $f" >&2
    elif ! awk -v a="$d1" -v b="$d2" 'BEGIN { d = a - b; if (d < 0) d = -d; exit !(d < 0.1) }'; then
        echo "NG (長さが変わった: $d1 -> $d2): $f" >&2
    elif [ "$order2" != "moov" ]; then
        echo "NG (moov が先頭にならない): $f" >&2
    elif [ "$(packet_hash "$f")" != "$(packet_hash "$tmp")" ]; then
        echo "NG (映像/音声の中身が変わった): $f" >&2
    else
        touch -r "$f" "$tmp"   # 更新日時は元のまま
        mv -f "$tmp" "$f"
        tmp=""
        processed=$((processed + 1))
        echo "OK: $f"
        return
    fi
    failed+=("$f")
    rm -f "$tmp"; tmp=""
}

for arg in "$@"; do
    if [ -d "$arg" ]; then
        while IFS= read -r -d '' f; do
            process "$f"
        done < <(find "$arg" -type f -name '*.mp4' ! -name '*.faststart-tmp.mp4' -print0 | sort -z)
    elif [ -f "$arg" ]; then
        process "$arg"
    else
        echo "見つからない: $arg" >&2
        failed+=("$arg")
    fi
done

if [ "$dry_run" = 1 ]; then
    echo "対象: ${processed} 件 / 既に先頭: ${skipped} 件"
else
    echo "処理: ${processed} 件 / 既に先頭 (変更なし): ${skipped} 件 / 失敗: ${#failed[@]} 件"
fi
if [ ${#failed[@]} -gt 0 ]; then
    printf '  %s\n' "${failed[@]}" >&2
    exit 1
fi
