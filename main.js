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
          bar:[ [83, "5m1s"],
                
                [92, "7m34s"] ]
        },
        { comment: "3 movement",
          bar:[ [92, "7m34s"],
                
                [131, "11m36s"] ]
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
            const x1 = width * prevT / duration;
            const x2 = width * t2 / duration;
            ctx.fillStyle = getNextColor();
            ctx.strokeStyle = "gray";
            ctx.fillRect(x1, 0, x2 - x1, height/3);
            ctx.fillStyle = "black";
            ctx.fillText(prevComment, x1, height/6);
        }
        prevComment = t.comment;
        prevT = t2;
    }
    for (const t of config.timeSchedule) {
        let prevTT = -1, prevBar;
        for (const b of t.bar) {
            const [bar, timeStr] = b;
            const tt = stringToTime(timeStr);
            if (0 <= prevTT) {
                const x1 = width * prevTT / duration;
                const x2 = width * tt / duration;
                ctx.fillStyle = getNextColor();
                ctx.strokeStyle = "gray";
                console.log({x1, x2, c, prevBar });
                ctx.fillRect(x1, height/3, x2 - x1, height/3);
                ctx.fillStyle = "black";
                ctx.fillText(prevBar, x1, height/2);
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
    $("#video").on("canplaythrough", pauseVideo);
    $("#video").on("durationchange", durationVideo);
    $("#video").on(["play", "playing"], (e) => { context.playing = true; });
    $("#video").on("pause", (e) => { context.playing = false; });
    // botton handler
    $("#playButton").on("click", (e) => {
        if (context.playing) {
            pauseVideo();
        } else {
            playVideo();
        }
    });
    // botton handler
    $("#progressBarContainer").on(["mousedown", "mousemove", "mouseup"], (e) => {
        console.log(e.buttons);
        if (! e.buttons) return ;
        const { width } = $("#progressBar");
        const { offsetX } = e;
        const { duration } = context;
        const t = duration * (offsetX / width)
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
