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
    const url = new URL(window.location);
    const file = url.searchParams.get("c");
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

function playVideo(e) {  // 動画 play 状態になった時に呼ぶ
    console.debug("playVideo", {e});
    $("#playButton").innerText = "Pause";
    $("#playButton").style.backgroundColor = "#AFA";
    currentVideo();
    context.playing = true
    if (! timerId) {
        timerId = setInterval(tickFunction, TICK);
    }
}

function pauseVideo(e) {  // 動画 pause 状態になった時に呼ぶ
    console.debug("pauseVideo", {e});
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

function getRehearsalNumber(currentTime) {
    let prevRehearsal = "-";
    for (const t of config.timeSchedule) {
        for (const i in t.rehearsal) {
            const b = t.rehearsal[i];
            const [rehearsal, timeStr] = b;
            const tt = stringToTime(timeStr);
            if (currentTime <= tt) {
                return prevRehearsal;
            }
            prevRehearsal = rehearsal;
        }
    }
    return prevRehearsal;  // XXX
}

function rehearsalVideo() {  // 現在時刻から検索
    const { currentTime } = $("#video");
    const rehearsalNumber = getRehearsalNumber(currentTime);
    $("#rehearsalNumber").innerText = rehearsalNumber;
    context.rehearsalNumber = rehearsalNumber;
}
function hitProgressBar(x, y, width, height) {
    const { duration } = context;
    const t = duration * (x / width);
    let ret = 0;
    const choice = (y * 3 / height) | 0;
    switch (choice) {
    case 0:
        for (const t1 of config.timeSchedule) {
            const tt = stringToTime(t1.rehearsal[0][1]);
            if (t < tt) {
                break;
            }
            ret = tt;
        }
        break;
    case 1:
        for (const t1 of config.timeSchedule) {
            for (const b of t1.rehearsal) {
                const tt = stringToTime(b[1]);
                if (t < tt) {
                    break;
                }
                ret = tt;
            }
        }
        break;
    case 2:
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
        console.log(waveImage);
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
    }
}

function main() {
    $("#video").src = config.file;
    $("#waveimage").src = config.waveimage;
    /*
     * video event handler
     */
    $("#video").on("canplaythrough", e => {
	if (! context.playing)  {
            $("#video").pause();
            pauseVideo();
            // Loading 表示を上書き
            $("#resetButton").innerText = "Reset";
            $("#resetButton").style.backgroundColor = "#FCB";
            $("#playButton").innerText = "Play";
	}
    });
    $("#video").on("durationchange", durationVideo);
    $("#video").on("play", playVideo);
    $("#video").on("playing", e => { $("#video").play(); });
    $("#video").on(["pause", "ended"], pauseVideo);
    /*
     *
     */
    $("#waveimage").on("load", e => {
        waveImage = $("#waveimage");
        makeProgressBase();
    });
    /*
     * botton handler
     */
    $("#resetButton").on("click", (e) => {
        console.log("resetButton");
        context.playing = false;
        context.currentTime = 0;
        // duration は初期化しない
        context.hitTime = 0;
        $("#video").currentTime = 0;
        $("#video").pause();
        currentVideo();
        rehearsalVideo();
        showProgressBar();
    });
    $("#playButton").on("click", (e) => {
        if (context.playing) {
            $("#video").pause();
        } else {
            $("#video").play();
        }
    });
    /*
     * progress handler
     */
    const pushEvents = [ "mousedown", "mousemove", "mouseup",
                         "touchstart", "touchmove", "touchend",
                         "pointermove" ];
    $("#progressBarContainer").on(pushEvents, (e) => {
        const isMouse = (e.type[0] === "m");
        const isTouch = (e.type[0] === "t");
        const isPointer = (e.type[0] === "p");
        if (isPointer) {  // touch イベントは offsetX,Y ないので代わりに取得
            context.offsetX = e.offsetX;
            context.offsetY = e.offsetY;
            return ;
        }
        if (isMouse && (! e.buttons)) return ;
        const { width, height } = $("#progressBar");
        let { offsetX, offsetY } = (isTouch)? context: e;
        const t = hitProgressBar(offsetX, offsetY, width, height);
        console.log({ offsetX, offsetY, t })
        hitVideo(t);
        $("#video").currentTime = t;  // seek video
        showProgressBar();
        // 待たずに play しても無駄
        setTimeout(() => { $("#video").play(); }, 200);
    });
}
