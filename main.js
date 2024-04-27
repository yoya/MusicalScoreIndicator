"use strict";

const file = "daphchlo-no1.mp4";

const context = {
    playing: false,
    currentTime: 0.0,
    duration: 0.0,
    hitTime: 0.0,
};

const config = {
    file: "daphchlo-no1.mp4",
    timeSchedule: [
        { comment: "1 movement",
          bar:[ [70, "4s"], [71 ,"45s", ], [72, "1m05s"], [73, "1m21s"],
                [74, "1m44s"], [75, "2m15s"], [76, "2m39s"], [77, "2m55s"],
                [78, "3m20s"], [79, "3m46s"], [80, "4m3s"],
                [81, "4m20s"], [82, "4m41s"], [83, "5m1s"]
              ]
        },
        { comment: "2 movement",
          bar:[ [83, "5m1s"], [84, "5m31s"], [85, "5m50s"], [86, "6m12s"],
                [87, "6m25s"],
                [88, "6m41s"], [89, "6m59s"], [90, "7m11s"], [91, "7m23s"],
                [92, "7m34s"] ]
        },
        { comment: "3 movement",
          bar:[ [92, "7m34s"], [93, "7m39s"], [94, "7m44s"],
                [95, "7m50s"], [96, "7m57s"], [97, "8m3s"],
                [98, "8m10s"], [99, "8m17s"], [100, "8m23s"],
                [101, "8m26s"], [102, "8m33s"], [103, "8m40s"],
                [104, "8m47s"], [105, "8m54s"], [106, "9m1s"], [107, "9m7s"],
                [108, "9m14s"], [109, "9m20s"], [110, "9m27s"],
                [111, "9m32s"], [112, "9m40s"],
                [113, "9m47s"], [114, "9m50s"], [115, "9m58s"],
                [116, "10m6s"], [117, "10m10s"],
                [118, "10m17s"], [119, "10m21s"],
                [120, "10m27s"], [121, "10m32s"],
                [122, "10m43s"], [123, "10m50s"],[124, "10m54s"], [125,"10m59s"],
                [126, "11m2s"], [127, "11m9s"], [128, "11m14s"], [129, "11m19s"],
                [130, "11m26s"], [131, "11m36s"] ]
        },
        { comment: "terminater", bar:[ [131, "11m36s"] ] }
    ]
};

const TICK = 100;  // 0.1sec

document.addEventListener("DOMContentLoaded", main);

function playVideo() {
    console.debug("playVideo");
    $("#playButton").innerText = "Pause";
    $("#video").play();
    currentVideo();
}
function pauseVideo() {
    console.debug("pauseVideo");
    $("#playButton").innerText = "Play";
    $("#video").pause();
    currentVideo();
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
            const tt = stringToTime(t1.bar[0][1]);
            if (t < tt) {
                break;
            }
            ret = tt;
        }
        break;
    case 1:
        for (const t1 of config.timeSchedule) {
            for (const b of t1.bar) {
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
        const t2 = stringToTime(t.bar[0][1]);
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
        let prevTT = -1, prevBar;
        for (const i in t.bar) {
            const b = t.bar[i];
            const [bar, timeStr] = b;
            const tt = stringToTime(timeStr);
            if (0 <= prevTT) {
                const x = width * prevTT / duration;
                const w = width * (tt - prevTT) / duration;
                const y = height/3;
                const h = height/3;
                ctx.fillStyle = getNextColor();
                ctx.fillRect(x, y, w, h);
            }
            prevTT = tt;
            prevBar = bar;
        }
        for (const i in t.bar) {
            const b = t.bar[i];
            const [bar, timeStr] = b;
            const tt = stringToTime(timeStr);
            if (0 <= prevTT) {
                const x = width * prevTT / duration;
                const y = [(height*2/5), (height/2), (height*3/5)][((i-1)%3)];
                ctx.fillStyle = "black";
                ctx.fillText(prevBar, x, y+4);
            }
            prevTT = tt;
            prevBar = bar;
        }
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
    $("#video").on("canplaythrough", e => {
	if (! context.playing)  {
	    pauseVideo(e)
	}
    });
    $("#video").on("durationchange", durationVideo);
    $("#video").on(["play", "playing"], (e) => { context.playing = true; });
    $("#video").on("pause", (e) => { context.playing = false; });
    // botton handler
    $("#playButton").on("click", (e) => {
        if (context.playing) {
            pauseVideo(e);
        } else {
            playVideo(e);
        }
    });
    // botton handler
    $("#progressBarContainer").on(["mousedown", "mousemove", "mouseup"], (e) => {
        if (! e.buttons) return ;
        const { width, height } = $("#progressBar");
        const { offsetX, offsetY } = e;
        const t = hitProgressBar(offsetX, offsetY, width, height);
        hitVideo(t);
        $("#video").currentTime = t;  // seek video
        setTimeout(() => { playVideo() }, 200);  // 直後に play しても無駄
    });
    // interval process
    setInterval(() => {
        if (context.playing) {
            currentVideo();
            showProgressBar();
        }
    }, TICK);
}
