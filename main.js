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
};

let config;

const TICK = 100;  // 0.1sec

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

(() => {
    //     const params = new URLSearchParams(url.search);
    const url = new URL(window.location);
    const file = url.searchParams.get("c");
    var xhr = new XMLHttpRequest();
    xhr.onreadystatechange = (e) => {
        console.log({ url, file, xhr, e });
        if (xhr.readyState === 4) {
            config = JSON.parse(xhr.responseText);
            bootFlags |= 2;
            _main();
        }
    }
    xhr.open("GET", file, true); // async:true
    xhr.send(null);
})();


function playVideo() {  // 動画 play 状態になった時に呼ぶ
    console.debug("playVideo");
    $("#playButton").innerText = "Pause";
    currentVideo();
    context.playing = true
}

function pauseVideo() {  // 動画 pause 状態になった時に呼ぶ
    console.debug("pauseVideo");
    $("#playButton").innerText = "Play";
    currentVideo();
    context.playing = false;
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
    if (hitTime > currentTime) {
        context.hitTime = currentTime;
        return ;
    }
    const canvas = $("#progressBar");
    const { width, height } = canvas;
    const hitX = (hitTime / duration) * width;
    const currentX = (currentTime / duration) * width;
    const ctx = canvas.getContext("2d");
    canvas.width = width;  // all clear
    if (baseImageData) {
        ctx.putImageData(baseImageData, 0, 0);
    }
    const grad = ctx.createLinearGradient(0, 0, width, height);
    [ [0.0, "red"], [0.2, "orange"], [0.4, "yellowgreen"],
      [0.6, "green"], [0.8, "blue"], [1.0, "violet"]
    ].forEach(s => grad.addColorStop(s[0], s[1]));
    ctx.fillStyle = grad;
    const x1 = hitX, y1 = height*2/3;
    const x2 = currentX - hitX, y2 = height / 3;
    ctx.fillRect(x1, y1, x2, y2);
    const x1r = currentX;
    ctx.fillStyle = "red";
    ctx.fillRect(x1r, 0, 1, height);
}

function main() {
    $("#video").src = config.file;
    /*
     * video event handler
     */
    $("#video").on("canplaythrough", e => {
	if (! context.playing)  {
            $("#video").pause();
            pauseVideo();
	}
    });
    $("#video").on("durationchange", durationVideo);
    $("#video").on("play", playVideo);
    $("#video").on("playing", e => { $("#video").play(); });
    $("#video").on(["pause", "ended"], pauseVideo);
    /*
     * botton handler
     */
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
        hitVideo(t);
        $("#video").currentTime = t;  // seek video
        showProgressBar();
        // 待たずに play しても無駄
        setTimeout(() => { $("#video").play(); }, 200);
    });
    /*
     * interval process
     */
    setInterval(() => {
        if (context.playing) {
            currentVideo();
            showProgressBar();
        }
    }, TICK);
}
