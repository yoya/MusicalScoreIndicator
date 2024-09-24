"use strict";

const _$ = e => {
    e.on = (t, f) => {
        if (Array.isArray(t)) {
            t.forEach((tt) => e.addEventListener(tt, f));
        } else {
            e.addEventListener(t, f);
        }
    }
    e.off = (t, f) => {
        if (Array.isArray(t)) {
            t.forEach((tt) => e.removeEventListener(tt, f));
        } else {
            e.momoveEventListener(t, f);
        }
    }
    return e;
}
const $ = s => {
    const e = document.querySelector(s);
    _$(e);
    return e;
}
const $$ = s => {
    const eList = document.querySelectorAll(s);
    eList.forEach((e) => _$(e));
    return eList;
}
const timeToHMS = (t) => {
    const h = (t / 3600) | 0;
    const m = ((t % 3600) / 60) | 0;
    const p = 10;  // precision
    const s = (((t % 60) * p) | 0) / p;
    return [h, m, s];
}
const numberTo2digitString = (n) => {
    return (n < 10)? ("0"+n): (""+n);
}
const timeToString = (t) => {
    const hms = timeToHMS(t);
    const [h, m, s] = hms.map(n => numberTo2digitString(n));;
    const ss = (s%1)? s: (s + ".0")
    return (hms[0])? (h+":"+m+":"+ss+""): (m+":"+ss+"");
}

const stringToTime = (s) => {
    let t = 0;
    for (const tt of s.split(/h|m|:/)) {
        t = t * 60 + parseFloat(tt);
    }
    return t;
}

let currentColorHue = 0;

const getNextColor = () => {
    const c = "hsl("+currentColorHue+"deg 90% 90%)"; 
    currentColorHue = (currentColorHue + (360/5+11)) % 360;
    return c;
}

const getScheduleColor = (r) => {
    let hue = 0;
    for (let i = 0; i < r; i++) {
        hue = (hue + (360/5+11)) % 360;
    }
    const color = "hsl("+hue+"deg 80% 80%)";
    return color;
}

const getRehearsalColor = (r) => {
    let hue = 0;
    for (let i = 0; i < r; i++) {
        hue = (hue + (360/5+11)) % 360;
    }
    const color = "hsl("+hue+"deg 90% 85%)";
    return color;
}
