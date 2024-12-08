"use strict";

/*
 * https://developer.mozilla.org/ja/docs/Web/API/URLSearchParams
 * https://developer.mozilla.org/ja/docs/Web/HTML/Element/video
 * https://developer.mozilla.org/ja/docs/Web/API/OfflineAudioContext
 */

const context = {
    playing: false,
    currentTime: 0.0,
    headTime: 0.0,
    tailTime: 0.0,
    duration: 0.0,
    hitTime: 0.0,
}

let config;  // 設定データ
let waveImage = null; // 音声波形の画像データ

const TICK  = 1000/10;  // 10 fps (0.1 sec)
const TICK2 = 1000/24;  // 24 fps (0.041666... sec)
let timerId = null;
let timerId2 = null;

let bootFlags = 0;

function getHashParam(p) {
    const url = new URL(window.location);
    return url.searchParams.get(p);
}

document.addEventListener("DOMContentLoaded", () => {
    // 設定の JSON を取得して config に代入する
    const url = getHashParam("c");
    const resp = loadFile(url);
    config = resp
    if ('timeScope' in config) {
	context.headTime = stringToTime(config.timeScope.headTime);
	context.tailTime = stringToTime(config.timeScope.tailTime);
    }
    $("#waveimage").src = config.waveimage;
    $("#video").src = config.file;
    $("#spectrum").src = config.spectrum;
    if (config.bigvideo) {
	$("#bigvideo").src = config.bigvideo;
	$("#bigvideoContainer").style.display = "block";
	videoCluster = new makeVideoCluster($("#bigvideo"), [$("#video"), $("#spectrum")]);
    } else {
	videoCluster = new makeVideoCluster($("#video"), [$("#spectrum")]);
    }
    masterVideo = videoCluster.getMaster();
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
});

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
    this.videoMaster = videoMaster;
    this.videoSlaves = videoSlaves;
    const videoAll =  [videoMaster, ... videoSlaves];
    this.videoAll = videoAll;
    this.getMaster = () => { return this.videoMaster };
    this.getCurrentTime = () => {
	this.videoMaster.getCurrentTime();
    }
    this.playVideo = () => {
	for (const v of this.videoAll) {
	    v.playVideo();
	}
    }
    this.pauseVideo = () => {
	for (const v of this.videoAll) {
	    v.pauseVideo();
	}
    }
    this.seekTo = (t) => {
	for (const v of this.videoAll) {
	    v.seekTo(t);
	}
    }
    this.syncByMaster = () => {
	const currentTime = this.videoMaster.getCurrentTime();
	for (const v of this.videoSlaves) {
	    const t = v.getCurrentTime();
            const absdiff = Math.abs(currentTime - t)
	    // 同期補正 (0.05秒ほどズレるのを観測。0.1 まで許容)
            if (0.1 < absdiff) {
		v.seekTo(t);
	    }
	}
    }
}

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

function positionToTime(x, width) {
    const { headTime, tailTime } = context;
    return (tailTime - headTime) * (x / width) + headTime;
}

function timeToPosition(t, width) {
    const { headTime, tailTime } = context;
    return ((t - headTime) / (tailTime - headTime)) * width;
}

function setCurrentTime(t) {
    videoCluster.seekTo(t);
    context.currentTime = t;
}

function playVideo(e) {  // 動画 play 状態になった時に呼ぶ
    // console.debug("playVideo", {e});
    $("#playButton").innerText = "Pause";
    $("#playButton").style.backgroundColor = "#AFA";
    currentVideo();
    context.playing = true;
    if (! timerId) {
        timerId = setInterval(tickFunction, TICK);
    }
    if (! timerId2) {
        timerId2 = setInterval(tickFunction2, TICK2);
    }
}

function pauseVideo(e) {  // 動画 pause 状態になった時に呼ぶ
    // console.debug("pauseVideo", {e});
    $("#playButton").innerText = "Play";
    $("#playButton").style.backgroundColor = "";
    currentVideo();
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
    $("#currentTime").innerText = timeToString(currentTime);
    context.currentTime = currentTime;
}

function durationVideo() {  // duration が確定する時
    const { duration } = masterVideo;
    $("#durationTime").innerText = timeToString(duration);
    context.duration = duration;
    if (context.tailTime === 0) {
	context.tailTime = duration;
    }
    makeProgressBase();
    showProgressBar();
    showRehearsalProgressBar();
}

function hitVideo(hitTime) {  // progressBar で時間を指示された
    $("#hitTime").innerText = timeToString(hitTime);
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
        currentVideo();
        rehearsalVideo();
        showProgressBar();
	videoCluster.syncByMaster();
	if (currentTime > context.tailTime) {
	    videoCluster.pauseVideo();
	}
    }
}

function tickFunction2() {
    if (context.playing) {
        showRehearsalProgressBar();
    }
}

function main() {
    const ts = getHashParam("t");
    let startTime = (ts)? stringToTime(ts): 0;
    if (startTime < context.headTime) {
	startTime = context.headTime;
    }
    let startTimeDone = (startTime)? false: true;
    /*
     * video event handler
     */
    masterVideo.on("canplaythrough", e => {
	if (context.playing)  {
            return ;
        }
	videoCluster.pauseVideo();
        pauseVideo();
        // Loading 表示を上書き
        $("#resetButton").innerText = "Reset";
        $("#resetButton").style.backgroundColor = "#FCB";
        $("#playButton").innerText = "Play";
        if (! startTimeDone) {  // t パラメータによる開始位置設定は一度だけ
            setCurrentTime(startTime);
            context.hitTime = startTime;
            startTimeDone = true;
        }
    });
    masterVideo.on("durationchange", durationVideo);
    masterVideo.on("play", playVideo);
    masterVideo.on("playing", e => {
	videoCluster.playVideo();
    });
    $("#video").on("pause", () => {
        pauseVideo();
	videoCluster.pauseVideo();
    });
    $("#video").on("ended", () => {
        pauseVideo();
        context.hitTime = 0;
    });
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
        context.playing = false;
        // duration は初期化しない
        context.hitTime = startTime;
        setCurrentTime(startTime);
	videoCluster.pauseVideo();
        currentVideo();
        rehearsalVideo();
        showProgressBar();
    });
    $("#playButton").on("click", (e) => {
        if (context.playing) {
	    videoCluster.pauseVideo();
        } else {
	    videoCluster.playVideo();
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
        const { width, height } = $("#progressBar");
        let { offsetX, offsetY } = e;
        const t = hitProgressBar(offsetX, offsetY, width, height);
        hitVideo(t);
        setCurrentTime(t);
        showProgressBar();
        showRehearsalProgressBar();
        // 待たずに play しても無駄
        setTimeout(() => {
	    videoCluster.playVideo();
        }, 200);
    });
    $("#rehearsalProgressBarContainer").on("pointerdown", (e) => {
        e.preventDefault();
        if (! e.buttons) { return ; }
        const { width, height } = $("#rehearsalProgressBar");
        let { offsetX, offsetY } = e;
        const t = hitRehearsalProgressBar(offsetX, offsetY, width, height);
        hitVideo(t);
        setCurrentTime(t);
        showProgressBar();
        showRehearsalProgressBar();
        // 待たずに play しても無駄
        setTimeout(() => {
	    videoCluster.playVideo();
        }, 200);
    });
}
