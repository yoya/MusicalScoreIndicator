"use strict";

/*
 * https://developer.mozilla.org/ja/docs/Web/API/URLSearchParams
 * https://developer.mozilla.org/ja/docs/Web/HTML/Element/video
 * https://developer.mozilla.org/ja/docs/Web/API/OfflineAudioContext
 */

const file = "daphchlo-no1.mp4";

const context = {
    playing: false,
    currentTime: 0.0,
    duration: 0.0,
    hitTime: 0.0,
}

let config;  // 設定データ
let waveImage = null; // 音声波形の画像データ

const TICK = 100;  // 0.1sec
let timerId = null;

let bootFlags = 0;

function getHashParam(p) {
    const url = new URL(window.location);
    return url.searchParams.get(p);
}

function _main() {
    if (bootFlags === 3) {
        main();
    }
}

document.addEventListener("DOMContentLoaded", () => {
    bootFlags |= 1;
    _main();
});

(() => {  // 設定の JSON を取得して config に代入する
    const file = getHashParam("c");
    var xhr = new XMLHttpRequest();
    xhr.onreadystatechange = (e) => {
        // console.debug({ url, file, xhr, e });
        if (xhr.readyState === 4) {
            config = JSON.parse(xhr.responseText);
            bootFlags |= 2;
            _main();
        }
    }
    xhr.open("GET", file, true); // async:true
    xhr.send(null);
})();

function setCurrentTime(t) {
    $("#video").currentTime = t;     // seek video
    $("#spectrum").currentTime = t;  // seek video
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
}

function currentVideo() {  // 現在時刻を追う
    const { currentTime } = $("#video");
    $("#currentTime").innerText = timeToString(currentTime);
    context.currentTime = currentTime;
}
function durationVideo() {  // duration が確定する時
    const { duration } = $("#video")
    $("#durationTime").innerText = timeToString(duration);
    context.duration = duration;
    makeProgressBase();
    showProgressBar();
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
    console.debug("getRehearsalIdx last:=> ", {prevTi, prevRi});
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
    const { duration } = context;
    const t = duration * (x / width);
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
    let prevT = -1, prevComment;
    for (const t of config.timeSchedule) {
        const t2 = stringToTime(t.rehearsal[0][1]);
        if (0 <= prevT) {
            ctx.fillStyle = getNextColor();
            const x = width * prevT / duration;
            const w = width * (t2 - prevT) / duration;
            const h = height/3;
            ctx.fillStyle = getNextColor();
            ctx.strokeStyle = "gray";
            ctx.fillRect(x, 0, w, h);
            ctx.fillStyle = "black";
            const ty = height / 6;
            ctx.fillText(prevComment, x, ty);
        }
        prevComment = t.comment;
        prevT = t2;
    }
    for (const t of config.timeSchedule) {
        let prevTT = -1;
        for (const i in t.rehearsal) {
            const [rehearsal, timeStr] = t.rehearsal[i];
            const tt = stringToTime(timeStr);
            if (0 <= prevTT) {
                const x = width * prevTT / duration;
                const w = width * (tt - prevTT) / duration;
                const y = height/3 + ((i-1)%3) * height / 9;
                const h = height/3/3;
                ctx.fillStyle = getNextColor();
                ctx.fillRect(x, y, w, h);
            }
            prevTT = tt;
        }
        let  prevRehearsal;
        for (const i in t.rehearsal) {
            const b = t.rehearsal[i];
            const [rehearsal, timeStr] = b;
            const tt = stringToTime(timeStr);
            if (0 <= prevTT) {
                const x = width * prevTT / duration;
                const y = [(height*2/5), (height/2), (height*3/5)][((i-1)%3)];
                ctx.fillStyle = "black";
                ctx.fillText(prevRehearsal, x, y+4);
            }
            prevTT = tt;
            prevRehearsal = rehearsal;
        }
        ctx.fillStyle = "black";
        ctx.fillRect(0, height*2/3, width, height/3);
    }
    baseImageData = ctx.getImageData(0, 0, width, height);
}

function showProgressBar() {
    const { currentTime, duration, hitTime } = context;
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
        ctx.drawImage(waveImage, 0, height*2/3, width, height/3);
    }
    //
    ctx.globalAlpha = 0.6;
    const hitX = (hitTime / duration) * width;
    const currentX = (currentTime / duration) * width;
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

/*
 * interval process
 */
function tickFunction() {
    // console.debug("tickFunction");
    if (context.playing) {
        currentVideo();
        rehearsalVideo();
        showProgressBar();
        // spectrum 画像の補正 (0.05秒ほどズレるのを観測。0.1 まで許容)
        const diff = $("#spectrum").currentTime - $("#video").currentTime;
        if (Math.abs(diff) > 0.1) {
            // console.warn("spectrum - video: ", diff);
            $("#spectrum").currentTime = $("#video").currentTime;
        }
    }
}

function main() {
    const ts = getHashParam("t");
    const startTime = (ts)? stringToTime(ts): 0;
    let startTimeDone = (startTime)? false: true;
    $("#video").src = config.file;
    $("#waveimage").src = config.waveimage;
    $("#spectrum").src = config.spectrum;
    /*
     * video event handler
     */
    $("#video").on("canplaythrough", e => {
	if (context.playing)  {
            return ;
        }
        $("#video").pause();
        $("#spectrum").pause();
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
    $("#video").on("durationchange", durationVideo);
    $("#video").on("play", playVideo);
    $("#video").on("playing", e => {
        $("#video").play();
        $("#spectrum").play();
    });
    $("#video").on("pause", () => {
        pauseVideo();
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
        context.hitTime = 0;
        setCurrentTime(0);
        $("#video").pause();
        $("#spectrum").pause();
        currentVideo();
        rehearsalVideo();
        showProgressBar();
    });
    $("#playButton").on("click", (e) => {
        if (context.playing) {
            $("#video").pause();
            $("#spectrum").pause();
        } else {
            $("#video").play();
            $("#spectrum").play();
        }
    });
    $("#prevButton").on("click", (e) => {
        const t = $("#video").currentTime;
        const rt = getRehearsalTime(t, -1);
        console.debug("#prevButton", { t, rt });
        setCurrentTime(rt);
        currentVideo();
        rehearsalVideo();
        showProgressBar();
    });
    $("#currButton").on("click", (e) => {
        const t = $("#video").currentTime;
        const rt = getRehearsalTime(t, 0);
        console.debug("#currButton", { t, rt });
        setCurrentTime(rt);
        currentVideo();
        rehearsalVideo();
        showProgressBar();
    });
    $("#nextButton").on("click", (e) => {
        const t = $("#video").currentTime;
        const rt = getRehearsalTime(t, 1);
        console.debug("#nextButton", { t, rt });
        setCurrentTime(rt);
        currentVideo();
        rehearsalVideo();
        showProgressBar();
    });
    /*
     * progress handler
     */
    const pushEvents = [ "mousedown", "mousemove", "mouseup",
                         "touchstart", "touchmove", "touchend" ];
    $("#progressBarContainer").on(pushEvents, (e) => {
        e.preventDefault();
        const isMouse = (e.type[0] === "m");
        const isTouch = (e.type[0] === "t");
        const isPointer = (e.type[0] === "p");
        if (isTouch) {
            const r = e.target.getBoundingClientRect()
            const x = (e.touches[0].clientX - window.pageXOffset - r.left);
            const y = (e.touches[0].clientY - window.pageYOffset - r.top);
            context.offsetX = x;
            context.offsetY = y;
        }
        if (isMouse && (! e.buttons)) return ;
        const { width, height } = $("#progressBar");
        let { offsetX, offsetY } = (isTouch)? context: e;
        const t = hitProgressBar(offsetX, offsetY, width, height);
        console.log({ offsetX, offsetY, t })
        hitVideo(t);
        setCurrentTime(t);
        showProgressBar();
        // 待たずに play しても無駄
        setTimeout(() => {
            $("#video").play();
            $("#spectrum").play();
        }, 200);
    });
}
