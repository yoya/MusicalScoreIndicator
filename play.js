"use strict";

/*
 * 診断ログ (debug.js) の呼び出し口。
 * キャッシュされた古い play.html が debug.js を読み込まずに新しい play.js を
 * 読んだ場合でも止まらないよう、debug.js の関数が無ければ何もしない。
 */
const dlog = (msg) => {
    if (typeof debugLog === "function") { debugLog(msg); }
};
const dattach = (e, label, events) => {
    if (typeof debugAttachMedia === "function") { debugAttachMedia(e, label, events); }
};
const dsetTimeSource = (fn) => {
    if (typeof debugSetTimeSource === "function") { debugSetTimeSource(fn); }
};

/*
 * https://developers.google.com/youtube/iframe_api_reference?hl=ja
 */

var tag = document.createElement('script');
tag.src = "https://www.youtube.com/iframe_api";
var firstScriptTag = document.getElementsByTagName('script')[0];
firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
let iframe_index = null;

/*
 * https://developer.mozilla.org/ja/docs/Web/API/URLSearchParams
 * https://developer.mozilla.org/ja/docs/Web/HTML/Element/video
 * https://developer.mozilla.org/ja/docs/Web/API/OfflineAudioContext
 */

const context = {
    playing: false,  // onplay や onpause の event に応じて on/off する
    currentTime: 0.0,
    headTime: 0.0,  // タイムスケジュール表示部の先頭
    tailTime: 0.0,  // タイムスケジュール表示部の末尾
    duration: 0.0,  // 動画の全体時間
    hitTime: 0.0,  // クリックで指定した時間
    timeScheduleOffset: 0.0, // 動画の一部を切り出した時の先頭の元の時間
}

let config;  // 設定データ
let waveImage = null; // 音声波形の画像データ

const TICK  = 1000/10;  // 10 fps (0.1 sec)
const TICK2 = 1000/24;  // 24 fps (0.041666... sec)
let timerId = null;
let timerId2 = null;  //  リハーサルプログレスは小刻み更新

// 設定の JSON を取得して config に代入する
const url = getURLParams("c");
config = loadFile(url);
if ('timeScope' in config) {
    context.headTime = stringToTime(config.timeScope.headTime);
    context.tailTime = stringToTime(config.timeScope.tailTime);
}
if ('timeScheduleOffset' in config) {
    const offset = stringToTime(config.timeScheduleOffset);
    context.timeScheduleOffset = offset;
    for (const ti in config.timeSchedule) {
	const t = config.timeSchedule[ti];
	for (const ri in t.rehearsal) {
	    const [rehearsal, timeStr] = t.rehearsal[ri];
	    const tt = stringToTime(timeStr);
	    t.rehearsal[ri][1] = (tt - offset) + "s"
	}
    }
    context.headTime -= offset;
    context.tailTime -= offset;
}

// CQT (spectrum) の表示方法。上から順に使えるものを使う:
//   1. 事前計算データ (movie/cqtdata.sh が曲設定ごとに作る WebP)。
//      場所は movie/<設定と同じディレクトリ>/<設定の名前>-cqt.webp
//      (c=debussy/foo.json でも c=movie/debussy/foo.json でも movie/debussy/foo-cqt.webp)。
//      遅れが無く 0.1 秒先を表示する。YouTube の曲にも使える
//   2. リアルタイム解析 (fastcqt)。データが無く、音声を取り出せる動画の時。
//      解析窓の分だけ少し遅れる (0.06〜0.12 秒程度)
//   3. spectrum 動画。データが無い YouTube や別オリジンの動画の時
// spectrum 動画は 3 になるまで読み込まない。URL の cqt= で選べる (比較用):
//   cqt=video: spectrum 動画, cqt=live: リアルタイム解析, cqt=data: データ,
//   cqt=2: リアルタイム解析と spectrum 動画を並べる, cqt=3: データと spectrum 動画を並べる
const cqtDataUrl = "movie/" + url.replace(/^(\.\/)?(movie\/)?/, "").replace(/\.json$/, "-cqt.webp");
const spectrumMode = (() => {
    const m = getURLParams("cqt");
    const hasCQT = (typeof liveCQT !== "undefined");
    const src = config.bigvideo || config.file;
    const canLive = hasCQT && ! /^https:\/\/www\.youtube\.com\//.test(src) &&
	  new URL(src, window.location.href).origin === window.location.origin;
    if (m === "video" || ! hasCQT) {
	return { video: true, data: false, live: false };
    }
    if (m === "live" || m === "1" || m === "2") {
	return { video: (m === "2") || ! canLive, data: false, live: canLive };
    }
    // 既定 / data / 3: データを試し、無ければ live、それも無理なら spectrum 動画
    return { video: (m === "3"), data: true, live: canLive && m !== "data" && m !== "3" };
})();
// 事前計算データがある曲は spectrum 動画を消して設定からも外している (spectrum が無い)
if (! config.spectrum) {
    spectrumMode.video = false;
}
// データの有無は読んでみないと分からないので、設定を読んだらすぐ取りに行く
const cqtDataPromise = spectrumMode.data ? liveCQT.loadData(cqtDataUrl) : null;
if (cqtDataPromise) {
    cqtDataPromise.catch(err => { console.info("cqt: 事前計算データ無し", cqtDataUrl, err.message); });
}

let boot = 0;
document.addEventListener("DOMContentLoaded", (e) => {
    if (spectrumMode.video) {
	$("#spectrum").setSource(config.spectrum);
    } else {
	$("#spectrum").style.display = "none";  // 読み込みもしない (必要になったら useSpectrumVideo)
    }
    init();
    sendMessage('loaded', {});
});

function onYouTubeIframeAPIReady() { init(); }

function init() {
    boot++;
    if (boot < 2) {
	return ;
    }
    $("#waveimage").src = config.waveimage;
    $("#video").setSource(config.file);
    const spectrumSlaves = spectrumMode.video ? [$("#spectrum")] : [];
    if (config.bigvideo) {
	$("#bigvideo").setSource(config.bigvideo);
	$("#bigvideoContainer").style.display = "block";
	videoCluster = new makeVideoCluster($("#bigvideo"), [$("#video"), ...spectrumSlaves]);
    } else {
	videoCluster = new makeVideoCluster($("#video"), spectrumSlaves);
    }
    masterVideo = videoCluster.getMaster();
    // 診断ログ (URL に debug=1 がある時のみ。debug.js)
    dsetTimeSource(() => masterVideo.getCurrentTime());
    dlog("init master=" + (config.bigvideo ? "bigvideo " + config.bigvideo : "video " + config.file));
    dattach(masterVideo, "master",
		     ["play", "playing", "pause", "waiting", "stalled", "ended", "error",
		      "emptied", "seeking", "playrejected", "ytstate"]);
    const slaveEvents = ["pause", "waiting", "stalled", "ended", "error", "emptied", "playrejected"];
    if (config.bigvideo) {
	dattach($("#video"), "video", slaveEvents);
    }
    if (spectrumMode.video) {
	dattach($("#spectrum"), "spectrum", slaveEvents);
    }
    const setupLive = () => {
	$("#liveSpectrumContainer").style.display = "block";
	liveCQT.setup(masterVideo, $("#liveSpectrum"), $("#liveSpectrumInfo"));
    };
    if (cqtDataPromise) {
	$("#liveSpectrumContainer").style.display = "block";
	cqtDataPromise.then(() => {
	    liveCQT.setupData(masterVideo, $("#liveSpectrum"), $("#liveSpectrumInfo"));
	}).catch(() => {
	    if (spectrumMode.live) {
		setupLive();
	    } else if (! spectrumMode.video) {
		$("#liveSpectrumContainer").style.display = "none";
		useSpectrumVideo();
	    } else {
		$("#liveSpectrumContainer").style.display = "none";
	    }
	});
    } else if (spectrumMode.live) {
	setupLive();
    }
    const refUrl = config.reference;
    if (refUrl) {
	const r = loadFile(refUrl);
        // reference がある場合、timeSchedule の補間に使う
        timeScheduleInterpolate(config.timeSchedule, r.timeSchedule);
	if (r.reference) {
	    const r2 = loadFile(r.reference);
            timeScheduleInterpolate(config.timeSchedule, r2.timeSchedule);
	}
    }
    main();
};

// 事前計算データもリアルタイム解析も使えない時に、spectrum 動画を後から読み込んで同期再生する
function useSpectrumVideo() {
    if (! config.spectrum) {  // spectrum 動画も無い: CQT 表示は無し
	console.warn("cqt: 事前計算データも spectrum 動画も無いので CQT を表示しません");
	return;
    }
    const v = $("#spectrum");
    v.style.display = "";
    v.setSource(config.spectrum);
    dattach(v, "spectrum", ["pause", "waiting", "stalled", "ended", "error", "emptied", "playrejected"]);
    videoCluster.addSlave(v);
    try { v.seekTo(masterVideo.getCurrentTime()); } catch (e) { }  // YouTube の準備前は 0 から
    if (context.playing) {  // もう再生中なら合わせて再生 (まだなら Play で一緒に始まる)
	v.playVideo();
    }
}

function loadFile(url) {  // sync function
    var xhr = new XMLHttpRequest();
    xhr.open("GET", url, false); // async:false
    xhr.send(null);
    if (xhr.readyState === 4) {
	const resp = JSON.parse(xhr.responseText);
	return resp;
    }
    return null;
}

let videoCluster = null;
let masterVideo  = null;
function makeVideoCluster(videoMaster, videoSlaves) {
    const videoAll =  [videoMaster, ... videoSlaves];
    this.getMaster = () => { return videoMaster };
    this.getCurrentTime = () => {
	this.videoMaster.getCurrentTime();
    }
    this.playVideo = (opts) => {
	if (opts && opts.slaveonly) {
	    videoSlaves.forEach(v => { v.playVideo(); });
	} else {
	    videoAll.forEach(v => { v.playVideo(); });
	}
    }
    this.pauseVideo = (opts) => {
	if (opts && opts.slaveonly) {
	    videoSlaves.forEach(v => { v.pauseVideo(); });
	} else {
	    videoAll.forEach(v => { v.pauseVideo(); });
	}
    }
    this.seekTo = (t) => {
	videoAll.forEach(v => { v.seekTo(t); });
    }
    // 後から同期再生に加える (事前計算データが無かった時の spectrum 動画)
    this.addSlave = (v) => {
	videoSlaves.push(v);
	videoAll.push(v);
    }
    this.syncByMaster = () => {
	const currentTime = videoMaster.getCurrentTime();
	for (const v of videoSlaves) {
	    const t = v.getCurrentTime();
            const absdiff = Math.abs(currentTime - t)
	    // 同期補正 (0.05秒ほどズレるのを観測。0.1 まで許容)
            if (0.1 < absdiff) {
		dlog("sync seek " + v.id);  // 頻発していないかを見る
		v.seekTo(currentTime);
	    }
	}
    }
}

// 練習番号の隙間を埋める
function timeScheduleInterpolate(schedule, refSched) {
    for (const idx in schedule) {
        const reha = schedule[idx].rehearsal
        const refReha = refSched[idx].rehearsal;
        let i = 0;
        let startTime, startTimeRef;
        let refQueue = [];
        for (const r of refReha) {
            const timeRef = stringToTime(r[1])
            if (reha[i][0] == r[0]) {
                const time = stringToTime(reha[i][1])
                if (refQueue.length) {
                    const timeScale = (time - startTime) / (timeRef - startTimeRef)
                    for (const rq of refQueue) {
                        const refNo = rq[0];
                        const refTm = stringToTime(rq[1])
                        const t = (refTm - startTimeRef) * timeScale + startTime;
                        reha.splice(i, 0, [refNo, timeToString(t), true])
                        i++;
                    }
                    refQueue = [];
                }
                startTime = time;
                startTimeRef = timeRef;
                i++;
            } else {
                refQueue.push(r)  // 欠けている練習番号
            }
        }
    }
}

// ポインタ位置を canvas 内部の座標 (width/height 属性の座標系) に変換する。
// CSS で縮小表示されている (画面幅が狭い iPad 縦置き等) と offsetX は
// 表示上の座標なのでずれる。範囲外は端に丸める。
function canvasPosition(e, canvas) {
    const rect = canvas.getBoundingClientRect();
    const clamp = (v, max) => Math.min(Math.max(v, 0), max);
    const x = (e.clientX - rect.left) * canvas.width / rect.width;
    const y = (e.clientY - rect.top) * canvas.height / rect.height;
    return [clamp(x, canvas.width - 1), clamp(y, canvas.height - 1)];
}

// 進捗バーで指定された場所の時間
function positionToTime(x, width) {
    const { headTime, tailTime } = context;
    return (tailTime - headTime) * (x / width) + headTime;
}

// 時間に対応する進捗バーの場所
function timeToPosition(t, width) {
    const { headTime, tailTime } = context;
    return ((t - headTime) / (tailTime - headTime)) * width;
}

// 初回の読み込み完了 (metadata 取得 or canplaythrough) が済んだか。
// 済む前に親から来た seek / play は whenReady で保留し、済んだら実行する。
let initialReady = false;
let readyCallbacks = [];
function whenReady(fn) {
    if (initialReady) {
	fn();
    } else {
	readyCallbacks.push(fn);
    }
}
function runReadyCallbacks() {
    const callbacks = readyCallbacks;
    readyCallbacks = [];
    callbacks.forEach(fn => fn());
}

// 再生状態に手を加えずにシークだけする
function seekVideo(t) {
    context.currentTime = t;
    videoCluster.seekTo(t);
}

// 再生が始まるまで playVideo を繰り返し、始まったら親に知らせる。
// (iframe 越しなどで一度の playVideo では再生されない事がある)
// 新しく呼ばれたら前のリトライは止める。上限回数で諦める。
//
// 読み込み完了 (initialReady) 前に呼ばれた場合 (iPad で回線が混んでいる時など):
// - 最初の playVideo はすぐ呼ぶ。iOS は操作 (タップ) の中で呼んだ play() でないと
//   音声付きの再生を許さないので、待ってから呼ぶと拒否される。
// - その後は読み込み完了まで playVideo を呼ばずに待つ (リトライ回数にも数えない)。
//   以前は 2 秒で諦めていたので、メタデータが遅いと再生されなかった。
// - タイマーが動いている間は「再生指示が保留中」として扱い、onInitialReady は
//   一時停止しない (isPlayPending)。
let playRetryTimerId = null;
const PLAY_WAIT_READY_MAX = 60 * 1000;  // 読み込み完了を待つ上限 (ms)
function cancelPlayRetry() {
    if (playRetryTimerId) {
	clearTimeout(playRetryTimerId);
	playRetryTimerId = null;
    }
}
function isPlayPending() {
    return playRetryTimerId !== null;
}
function playWithRetry(maxRetry = 10, interval = 200) {
    cancelPlayRetry();
    clearPauseOnPlayGuard();  // 直前のシークの「play を打ち消す」処理に止められないように
    let count = 0;
    let calledBeforeReady = false;
    const startedAt = Date.now();
    dlog("playWithRetry start" + (initialReady ? "" : " (before ready)"));
    const _play = () => {
	playRetryTimerId = null;
	if (context.playing) {
	    const t = masterVideo.getCurrentTime();
	    sendMessage('playstarted', {currentTime: t});
	    return ;
	}
	if (initialReady) {
	    if (count >= maxRetry) {
		console.error("playWithRetry: retry over", {count});
		dlog("playWithRetry GIVE UP after " + count);
		return ;
	    }
	    count++;
	    videoCluster.playVideo();
	} else {
	    if (Date.now() - startedAt > PLAY_WAIT_READY_MAX) {
		dlog("playWithRetry GIVE UP (not ready in " + PLAY_WAIT_READY_MAX / 1000 + "s)");
		return ;
	    }
	    if (! calledBeforeReady) {  // 操作の中で一度だけ呼んでおく
		calledBeforeReady = true;
		videoCluster.playVideo();
	    }
	}
	playRetryTimerId = setTimeout(_play, interval);
    }
    _play();
}

// setCurrentTime が停止中に仕掛ける「シーク直後の play を pause で打ち消す」処理。
// ユーザーが再生を指示した時 (playWithRetry) は外す。外さないと、読み込み完了直後
// (初期位置へのシーク直後) の 500ms 以内にタップした再生が止められてしまう。
let pauseOnPlayGuard = null;
function clearPauseOnPlayGuard() {
    if (pauseOnPlayGuard) {
	masterVideo.off("play", pauseOnPlayGuard);
	pauseOnPlayGuard = null;
    }
}

function setCurrentTime(t) {
    if (context.playing) {
	seekVideo(t);
    } else {
	seekVideo(t);
	clearPauseOnPlayGuard();
	const fn = pauseOnPlayGuard = () => {
	    videoCluster.pauseVideo();
	};
	masterVideo.on("play", fn);
	setTimeout(() => { // pause の時は上の off が動かないので一旦これで
	    if (pauseOnPlayGuard === fn) {
		clearPauseOnPlayGuard();
	    }
	}, 500);
    }
}

function onPlaying(e) {  // 動画 play 状態になった時に呼ぶ
    // console.debug("onPlaying", {e});
    $("#playButton").innerText = "Pause";
    $("#playButton").style.backgroundColor = "#AFA";
    // 最後まで再生していたら、頭に戻る
    const currentTime = masterVideo.getCurrentTime();
    if (currentTime >= context.tailTime) {
	setCurrentTime(context.headTime);
    }
    currentVideo();
    videoCluster.playVideo({slaveonly:true});
    context.playing = true;
    if (! timerId) {
        timerId = setInterval(tickFunction, TICK);
    }
    if (! timerId2) {
        timerId2 = setInterval(tickFunction2, TICK2);
    }
}

function onPause(e) {  // 動画 pause 状態になった時に呼ぶ
    // console.debug("onPause", {e});
    cancelPlayRetry();  // pause 後に再生リトライが走って勝手に再開しないように
    $("#playButton").innerText = "Play";
    $("#playButton").style.backgroundColor = "";
    currentVideo();
    videoCluster.pauseVideo({slaveonly:true});
    context.playing = false;
    if (timerId) {
        clearInterval(timerId);
        timerId = null;
    }
    if (timerId2) {
        clearInterval(timerId2);
        timerId2 = null;
    }
}

function currentVideo() {  // 現在時刻を追う
    const currentTime = masterVideo.getCurrentTime();
    $("#currentTime").innerText = timeToString(currentTime + context.timeScheduleOffset);
    context.currentTime = currentTime;
}

function durationVideo() {  // duration が確定する時
    const duration = masterVideo.getDuration();
    $("#durationTime").innerText = timeToString(duration + context.timeScheduleOffset);
    context.duration = duration;
    if (context.tailTime === 0) {
	context.tailTime = duration;
    }
    makeProgressBase();
    showProgressBar();
    showRehearsalProgressBar();
}

function hitVideo(hitTime) {  // progressBar で時間を指示された
    $("#hitTime").innerText = timeToString(hitTime + context.timeScheduleOffset);
    setURLParams("t", Math.round(hitTime*10)/10+"s"); // URL hash に反映
    context.hitTime = hitTime;
}

function getRehearsalIdx(currentTime) {
    let prevTi = 0, prevRi = 0;
    for (const ti in config.timeSchedule) {
        const t = config.timeSchedule[ti];
        for (const ri in t.rehearsal) {
            const [rehearsal, timeStr] = t.rehearsal[ri];
            const tt = stringToTime(timeStr);
            if (currentTime < tt) {
                return [Number(prevTi), Number(prevRi)];
            }
            prevTi = ti;  prevRi = ri;
        }
    }
    return [parseInt(prevTi, 10), parseInt(prevRi, 10)];
}

function getRehearsalByIdx(ti, ri) {
    // console.debug("getRehearsalByIdx", {ti, ri});
    if (ri < 0) {
        while (ri < 0) {
            ti = ti - 1;
            if (ti < 0) {
                break;  // failsafe
            }
            const t = config.timeSchedule[ti];
            // rehearsal 配列には terminator があるので -1 する
            ri = ri + t.rehearsal.length - 1;
        }
    } else if ((config.timeSchedule[ti].rehearsal.length - 1) <= ri) {
        while ((config.timeSchedule[ti].rehearsal.length - 1) <= ri) {
            let t = config.timeSchedule[ti];
            ri = ri - (t.rehearsal.length - 1);  // -1: terminator
            ti = ti + 1;
            if (config.timeSchedule.length <= ti) {
                break;  // failsafe
            }
        }
    }
    // console.debug("getRehearsalByIdx => ", {ti, ri});
    if (ti < 0) {
        const t = config.timeSchedule[0];
        return t.rehearsal[0];
    }
    const tlen = config.timeSchedule.length;
    if (ti >= tlen) {
        const t = config.timeSchedule[tlen-1];
        const rlen = t.rehearsal.length;
        return t.rehearsal[rlen-1];
    }
    const t = config.timeSchedule[ti];
    const rlen = t.rehearsal.length;
    if (ri < 0) {
        return t.rehearsal[0];
    }
    if (ri >= rlen) {
        return t.rehearsal[rlen-1];
    }
    return t.rehearsal[ri];
}

function getRehearsalNumber(currentTime) {
    const [ti, ri] = getRehearsalIdx(currentTime);
    const r = getRehearsalByIdx(ti, ri);
    const [rehearsal, timeStr] = r;
    return rehearsal;
}

function getRehearsalTime(currentTime, offset) {
    const [ti, ri] = getRehearsalIdx(currentTime)
    const r = getRehearsalByIdx(ti, ri + offset);
    const [rehearsal, timeStr] = r;
    const tt = stringToTime(timeStr);
    return tt;
}

function rehearsalVideo() {  // 現在時刻から検索
    //const { currentTime } = $("#video");
    const { currentTime } = context;
    const rehearsalNumber = getRehearsalNumber(currentTime);
    $("#rehearsalNumber").innerText = rehearsalNumber;
    context.rehearsalNumber = rehearsalNumber;
}

function hitProgressBar(x, y, width, height) {
    const t = positionToTime(x, width);
    let ret = 0;
    // 触る場所によってキリの良い場所に移動
    const choice = (y * 3 / height) | 0;
    switch (choice) {
    case 0:  // setion (movement 等)
        for (const t1 of config.timeSchedule) {
            const tt = stringToTime(t1.rehearsal[0][1]);
            if (t <= tt) {
                break;
            }
            ret = tt;
        }
        break;
    case 1:  // rehearsal
        ret = getRehearsalTime(t, 0);
        break;
    case 2:  // time
    default:
        ret = t;
        break;
    }
    return ret;
}

function hitRehearsalProgressBar(x, y, width, height) {
    const t = masterVideo.getCurrentTime();
    const curr = getRehearsalTime(t, 0);
    const next = getRehearsalTime(t, 1);
    const r = x / width;
    const ret = curr + (next - curr) * r;
    return ret;
}

let baseImageData = null;
function makeProgressBase() {
    const c = document.createElement("canvas");
    const { width, height } = $("#progressBar");
    c.width = width;
    c.height = height;
    const { duration } = context;
    if (duration <= 0) {
        console.warn("makeProgressBase, duration <= 0", { duration });
        return ;
    }
    const ctx = c.getContext("2d");
    // 下部の1/3を塗りつぶす
    ctx.fillStyle = "black";
    ctx.fillRect(0, height*2/3, width, height/3);
    let prevT = -1, prevComment;
    for (const i in config.timeSchedule) {
        const t = config.timeSchedule[i];
        const t2 = stringToTime(t.rehearsal[0][1]);
        if (0 <= prevT) {
            ctx.fillStyle = getScheduleColor(i);
            const x = timeToPosition(prevT, width);
            const w = timeToPosition(t2, width) - x;
            const h = height/3;
            ctx.strokeStyle = "gray";
            ctx.fillRect(x, 0, w, h);
            ctx.fillStyle = "black";
            const ty = height / 6;
	    const idxCR = prevComment.indexOf("\n");
	    if (0 < idxCR) {  // 複数行対応(とりあえず2行だけ)
		ctx.fillText(prevComment.substring(0, idxCR), x, ty-2);
		ctx.fillText(prevComment.substring(idxCR+1), x, ty+14);
	    } else {
		// 一行の時はこちら
		ctx.fillText(prevComment, x, ty);
	    }
        }
        prevComment = t.comment;
        prevT = t2;
    }
    for (const t of config.timeSchedule) {
        let prevTT = -1;
        let prevInterp = false;
        let prevRehearsal = -1;
        for (const i in t.rehearsal) {
            const [rehearsal, timeStr, interp] = t.rehearsal[i];
            const tt = stringToTime(timeStr);
            if (0 <= prevTT) {
                const x = timeToPosition(prevTT, width);
                const w = timeToPosition(tt, width) - x;
                const y = height/3 + ((i-1)%3) * height / 9;
                const h = height/3/3;
                ctx.fillStyle = getRehearsalColor(prevRehearsal);
                ctx.fillRect(x, y, w, h);
                if (! prevInterp) {
                    // (補間でなく)、明示的に時間を指定している場合マーク。
                    ctx.fillStyle = "hotpink";
                    ctx.fillRect(x+0.5, y+0.5, 3.5, 2.5);
                }
                // 下の波形の方にもマーク
                if (! prevInterp) {
                    const xx = x-1;
                    const yy = height*2/3
                    const ww = 1;
                    const hh = height/3
                    const grad = ctx.createLinearGradient(xx, yy, xx+ww, yy+hh);
                    grad.addColorStop(0.0, "hotpink");
                    grad.addColorStop(0.2, "hotpink");
                    grad.addColorStop(0.5, "gray");
                    ctx.fillStyle = grad;
                    ctx.fillRect(xx, yy, ww, hh);
                }
            }
            prevTT = tt;
            prevInterp = interp;
            prevRehearsal = rehearsal;
        }
        prevRehearsal = -1;
        for (const i in t.rehearsal) {
            const b = t.rehearsal[i];
            const [rehearsal, timeStr] = b;
            const tt = stringToTime(timeStr);
            if (0 <= prevTT) {
                const x = timeToPosition(prevTT, width)
                const y = [(height*2/5), (height/2), (height*3/5)][((i-1)%3)];
                ctx.fillStyle = "black";
                ctx.fillText(prevRehearsal, x, y+5);
            }
            prevTT = tt;
            prevRehearsal = rehearsal;
        }
    }
    baseImageData = ctx.getImageData(0, 0, width, height);
}

function showProgressBar() {
    const { currentTime, hitTime, headTime, tailTime, duration } = context;
    const scopeDuration = tailTime - headTime;
    // console.debug("showProgressBar",  { currentTime, duration, hitTime });
    // if (hitTime > currentTime) {
    // context.hitTime = currentTime;
    // }
    const canvas = $("#progressBar");
    const ctx = canvas.getContext("2d");
    const { width, height } = canvas;
    canvas.width = width;  // all clear
    if (baseImageData) {
        ctx.putImageData(baseImageData, 0, 0);
    }
    if (waveImage) {
	ctx.save();
	const x1 = headTime / duration * waveImage.width;
	const x2 = tailTime / duration * waveImage.width;
	ctx.imageSmoothingEnabled = false;
	ctx.drawImage(waveImage, x1, 0, x2 - x1, waveImage.height,
		      0, height*2/3, width, height/3);
	ctx.restore();
    }
    //
    ctx.globalAlpha = 0.6;
    const hitX = timeToPosition(hitTime, width);
    const currentX = timeToPosition(currentTime, width)
    const grad = ctx.createLinearGradient(0, 0, width, height);
    [ [0.0, "red"], [0.2, "orange"], [0.4, "yellowgreen"],
      [0.6, "lime"], [0.8, "RoyalBlue"], [1.0, "violet"]
    ].forEach(s => grad.addColorStop(s[0], s[1]));
    ctx.fillStyle = grad;
    const x1 = hitX, y1 = height*2/3;
    const x2 = currentX - hitX, y2 = height / 3;
    ctx.fillRect(x1, y1, x2, y2);
    const x1r = currentX;
    ctx.fillStyle = "red";
    ctx.fillRect(x1r, 0, 1, height);
}

function showRehearsalProgressBar() {
    const t = masterVideo.getCurrentTime();
    const curr = getRehearsalTime(t, 0);
    const next = getRehearsalTime(t, 1);
    const [ti, ri] = getRehearsalIdx(curr);
    const [ti2, ri2] = getRehearsalIdx(next);
    const [rehearsal, timeStr, interp] = getRehearsalByIdx(ti, ri);
    const [rehearsal2, timeStr2, interp2] = getRehearsalByIdx(ti2, ri2);
    const canvas = $("#rehearsalProgressBar");
    const ctx = canvas.getContext("2d");
    const { width, height } = canvas;
    canvas.width = width;  // all clear
    const progress = (next - curr)? ((t - curr) / (next - curr)): 1.0;
    const [xx, ww] = [progress * width, width];
    const [yy, hh] = [height / 4, height /4 * (4-2)];
    const reheColor  = getRehearsalColor(rehearsal);
    const reheColor2 = getRehearsalColor(rehearsal2);
    const grad = ctx.createLinearGradient(xx, yy, xx+ww, yy+hh);
    grad.addColorStop(0.0, reheColor);
    grad.addColorStop(0.5, reheColor);
    grad.addColorStop(0.9, reheColor2);
    grad.addColorStop(1.0, reheColor2);
    ctx.fillStyle = grad;
    ctx.globalAlpha = 1.0;
    ctx.fillRect(xx, yy, ww, hh);
    if (! interp) {
        ctx.fillStyle = "hotpink";
        ctx.fillRect(0, 0, 5, 5);
    }
    if (! interp2) {
        ctx.fillStyle = "hotpink";
        ctx.fillRect(width-5, 0, 5, 5);
    }
}

/*
 * interval process
 */
function tickFunction() {
    // console.debug("tickFunction");
    const currentTime = masterVideo.getCurrentTime();
    if (context.playing) {
	if (currentTime < context.headTime) {
	    dlog("before headTime, seek to " + context.headTime);
	    setCurrentTime(context.headTime);
	}
        currentVideo();
        rehearsalVideo();
        showProgressBar();
	videoCluster.syncByMaster();
	if (currentTime > context.tailTime) {
	    finished("tailTime " + context.tailTime);
	}
    }
}

function tickFunction2() {
    if (context.playing) {
        showRehearsalProgressBar();
    }
}

function main() {
    const ts = getURLParams("t");
    let startTime = (ts)? stringToTime(ts): 0;
    if (startTime < context.headTime) {
	startTime = context.headTime;
    }
    let startTimeDone = (startTime)? false: true;
    /*
     * video event handler
     */
    // 読み込み完了時の初期化。
    // - iPhone はユーザー操作まで metadata しか読まず canplaythrough が来ない
    //   事があるので、loadedmetadata でも初期化する (シーク・duration 取得は可能)。
    //   YouTube は onReady で canplaythrough を発火する。
    // - canplaythrough はシーク後などにも再発火するが、その度に pause や
    //   onPause (再生リトライの停止) をすると再生を妨げるので、初回だけ処理する。
    const onInitialReady = () => {
	if (initialReady || context.playing)  {
            return ;
        }
	initialReady = true;
	// 読み込み中に再生が指示されていたら (iPad で回線が遅い時など)、
	// 一時停止も初期位置へのシークもしない。以前はここで pause して
	// 指示された再生を潰し、タップした位置も失っていた。
	const playPending = isPlayPending();
	dlog("initial ready" + (playPending ? " (play pending: keep playing)" : ""));
	if (! playPending) {
	    videoCluster.pauseVideo();  // YouTube は autoplay で始まるので止める
            onPause();
	}
        // Loading 表示を上書き
        $("#resetButton").innerText = "Reset";
        $("#resetButton").style.backgroundColor = "#FCB";
	if (! context.playing) {
            $("#playButton").innerText = "Play";
	}
        if (! startTimeDone) {  // t パラメータによる開始位置設定は一度だけ
	    if (! playPending) {
		setCurrentTime(startTime);
		context.hitTime = startTime;
	    }
            startTimeDone = true;
        }
	sendMessage('ready', {});
	runReadyCallbacks();  // 準備完了待ちだった親からの seek / play を実行
    };
    masterVideo.on(["loadedmetadata", "canplaythrough"], onInitialReady);
    // リスナー登録前に読み込み済みの場合 (キャッシュ等)。YouTube の iframe は readyState を持たない。
    if (masterVideo.readyState >= 1) {  // HAVE_METADATA
	onInitialReady();
    }
    masterVideo.on("durationchange", durationVideo);
    masterVideo.on("playing", onPlaying);
    masterVideo.on("pause", onPause);
    masterVideo.on("ended", () => {
	finished("ended event");
    });
    masterVideo.on("volumechange", () => {
	const volume = masterVideo.getVolume();
	$("#volumeRange").value = volume;
	sendMessage('volume', {'volume': volume});
    })
    /*
     *
     */
    $("#waveimage").on("load", e => {
        waveImage = $("#waveimage");
        // 万が一、video load & duration 取得より image load が遅い時用
        if (context.duration) {
            makeProgressBase();
        }
    });
    /*
     * botton handler
     */
    $("#resetButton").on("click", (e) => {
        // context.playing = false;
        // duration は初期化しない
        context.hitTime = startTime;
        setCurrentTime(startTime);
	videoCluster.pauseVideo();
        currentVideo();
        rehearsalVideo();
        showProgressBar();
        showRehearsalProgressBar();
    });
    $("#playButton").on("click", (e) => {
        cancelPlayRetry();  // ボタン操作を優先する
        dlog("user: " + (context.playing ? "Pause" : "Play") + " button");
        if (context.playing) {
	    videoCluster.pauseVideo();
        } else {
	    if (! startTimeDone) {
		// 読み込み中に押された。onInitialReady は再生中は初期位置へシークしないので、
		// t パラメータの開始位置へはここで合わせる。
		seekVideo(startTime);
		context.hitTime = startTime;
		startTimeDone = true;
	    }
	    // 読み込み中に押されても再生が始まるまで待ち、始まったら親に知らせる
	    playWithRetry();
        }
    });
    $("#prevButton").on("click", (e) => {
        const t = masterVideo.getCurrentTime();
        const rt = getRehearsalTime(t, -1);
        console.debug("#prevButton", { t, rt });
        setCurrentTime(rt);
        currentVideo();
        rehearsalVideo();
        showProgressBar();
        showRehearsalProgressBar();
    });
    $("#currButton").on("click", (e) => {
        const t = masterVideo.getCurrentTime();
        const rt = getRehearsalTime(t, 0);
        console.debug("#currButton", { t, rt });
        setCurrentTime(rt);
        currentVideo();
        rehearsalVideo();
        showProgressBar();
        showRehearsalProgressBar();
    });
    $("#nextButton").on("click", (e) => {
        const t = masterVideo.getCurrentTime();
        const rt = getRehearsalTime(t, 1);
        console.debug("#nextButton", { t, rt });
        setCurrentTime(rt);
        currentVideo();
        rehearsalVideo();
        showProgressBar();
        showRehearsalProgressBar();
    });
    /*
     * progress handler
     */
    $("#progressBarContainer").on("pointerdown", (e) => {
        e.preventDefault();
        if (! e.buttons) { return ; }
        const canvas = $("#progressBar");
        const { width, height } = canvas;
        const [x, y] = canvasPosition(e, canvas);
        const t = hitProgressBar(x, y, width, height);
        dlog("user: tap progressBar → " + t.toFixed(1));
        hitVideo(t);
        seekVideo(t);  // 直後に再生するので setCurrentTime の pause 抑止は使わない
        startTimeDone = true;  // 選んだ位置を優先 (t パラメータの開始位置で上書きしない)
        showProgressBar();
        showRehearsalProgressBar();
        playWithRetry();
    });
    $("#rehearsalProgressBarContainer").on("pointerdown", (e) => {
        e.preventDefault();
        if (! e.buttons) { return ; }
        const canvas = $("#rehearsalProgressBar");
        const { width, height } = canvas;
        const [x, y] = canvasPosition(e, canvas);
        const t = hitRehearsalProgressBar(x, y, width, height);
        dlog("user: tap rehearsalBar → " + t.toFixed(1));
        hitVideo(t);
        seekVideo(t);  // 直後に再生するので setCurrentTime の pause 抑止は使わない
        startTimeDone = true;  // 選んだ位置を優先 (t パラメータの開始位置で上書きしない)
        showProgressBar();
        showRehearsalProgressBar();
        playWithRetry();
    });
    $("#volumeRange").on("input", e => {
	masterVideo.setVolume($("#volumeRange").value);
    })
    // 初期化
    $("#volumeRange").value = masterVideo.getVolume();
}

function finished(reason) {
    dlog("finished (" + reason + ")");
    videoCluster.pauseVideo();
    context.hitTime = 0;
    if (iframe_index != null) {
	sendMessage('finished', {});
    }
}

function sendMessage(method, params) {
    const map = new Map();
    map.set('method', method);
    if (iframe_index != null) {
	map.set('index', iframe_index);
    }
    for (const k in params) {
	const v = params[k];
	map.set(k, v);
    }
    if (window.parent !== window) {
	dlog("→parent " + method);
    }
    window.parent.postMessage(map, "*");
}

// parent から message 受信
window.addEventListener("message", (message) => {
    console.debug("play listen:", iframe_index, message.data);
    const map = message.data;
    if (! (map instanceof  Map)) {
	return ;  // 多分、YouTube のメッセージなので skip する
    }
    const method = map.get("method");
    if (message.source !== window) {  // 単体表示の時に自分宛てに送ったものは除く
	dlog("←parent " + method + (map.has('startTime') ? " " + map.get('startTime') : ""));
    }
    if (method == "index") {
	iframe_index = map.get('index');
    } else if (method == "seek") {  // 初期表示
	const startTime = map.get('startTime');
	setURLParams("t", startTime);
	whenReady(() => {  // 読み込み完了前ならそれまで保留
	    setCurrentTime(startTime);
	    context.hitTime = startTime;
	    showProgressBar();
	    showRehearsalProgressBar();
	});
    } else if (method == "play") {  // 連続プレイ
	const startTime = map.get('startTime');
	// console.log({method, startTime});
	setURLParams("t", startTime);
	whenReady(() => {  // 読み込み完了前ならそれまで保留
	    seekVideo(startTime);  // 直後に再生するので pause 抑止は使わない
	    context.hitTime = startTime;
	    showProgressBar();
	    showRehearsalProgressBar();
	    // iframe 越しに play 実行すると delay かけないと
	    // 動かないので、動くまで playVideo を呼ぶ
	    playWithRetry(9, 100);
	});
    } else if (method == "pause") {
	videoCluster.pauseVideo();
    } else if (method == "volume") {
	const volume = map.get('volume');
	masterVideo.setVolume(volume);
	// $("#volumeRange").value = volume;
    }
});
