"use strict";

class URLHashParams {
    constructor() {
	// search parameter と同じ形式。#a=x&b=y&...  substring で頭の # を削る
	const hash_payload = new URL(window.location).hash.substring(1);
	this.hashParam = new URLSearchParams(hash_payload);
    }
    toString() { return this.hashParam.toString() }
    has(p)     { return this.hashParam.has(p)     }
    get(p)     { return this.hashParam.get(p)     }
    set(p, v)  { return this.hashParam.set(p ,v) }
}

const hashParams = new URLHashParams();

function getURLParams(p) {
    const url = new URL(window.location);
    if (hashParams.has(p)) {
	return hashParams.get(p);
    } else {
	return url.searchParams.get(p);
    }
}

function setURLParams(p, v) {
    hashParams.set(p, v);
    if (false) {
    // window.location.hash だと hit の度に history が先に進む。
    // 具体的には操作した数だけ back しないと戻れなくなって不便。
	window.location.hash = '#' + hashParams.toString();  // URL に反映
    } else {
	const loc = window.location;
	const u = loc.protocol + "//" + loc.host + loc.pathname + loc.search + "#" + hashParams.toString();  // URL に反映
	history.replaceState(null, "", u);
    }
}

const _$ = e => {
    e.setSource = (s) => {
	const youtubePrefix = "https://www.youtube.com/watch?v=";
	const { length } = youtubePrefix;
	if (s.substr(0, length) == youtubePrefix) {
	    const { width, height } = e;
	    const videoId = s.substr(length, 11);
	    const playerContext = { state: -1 }
	    // e.id は 'bigvideo' もしくは video
	    const player = new YT.Player(e.id, {
		width, height, videoId,
		events: {
		    'onReady': () => {
			e.dispatchEvent(new Event("canplaythrough"));
			e.dispatchEvent(new Event("durationchange"));
		    },
		    'onStateChange': () => {
			const state = player.getPlayerState();
			if (playerContext.state !== state) {
			    switch (state) {
			    case -1: //  => no-start
			    case 0: //  => stop
				e.dispatchEvent(new Event("ended"));
				break;
			    case 1: //  => playing
				e.dispatchEvent(new Event("playing"));
				break;
			    case 2: //  => pause
				e.dispatchEvent(new Event("pause"));
				break;
			    default:
				console.debug("event state:", state);
			    }
			    playerContext.state = state;
			}
                    },
		},
		playerVars: {
		    autoplay: 1,
		    controls: 0,
		    loop: 0,
		    modestbranding: 0,
		    playsinline: 1,
		}
	    });
	    e = player.g;
	    e.playVideo = () => { player.playVideo(); }
	    e.pauseVideo = () => { player.pauseVideo(); }
	    e.seekTo = (t) => { player.seekTo(t); }
	    e.getCurrentTime = () => { return player.getCurrentTime(); }
	    e.getDuration = () => { return player.getDuration(); }
	    e.setVolume = (v) => { return player.setVolume(v); }
	    e.getVolume = () => (player.getVolume)? player.getVolume(): 100;
	} else {
	    // 通常の video 要素
	    e.src = s
	    // YouTube API と同じメソッドを生やす
	    if (! e.seekTo) { e.seekTo = (t) => { e.currentTime = t; } }
	    if (! e.getCurrentTime) { e.getCurrentTime = () => e.currentTime }
	    if (! e.getDuration) { e.getDuration = () => e.duration }
	    if (! e.playVideo) { e.playVideo = e.play }
	    if (! e.pauseVideo) { e.pauseVideo = e.pause }
	    if (! e.setVolume) { e.setVolume = (v) => { e.volume = v/100; } }
	    if (! e.getVolume) { e.getVolume = () => e.volume * 100 }
	    e.load();  // iPhone は明示的に load しないと読み込み開始しない
	}
    }
    // jQuery 風の eventListener
    e.on = (t, f) => {
	t = Array.isArray(t)? t: [t];
        t.forEach((tt) => { e.addEventListener(tt, f) });
    }
    e.off = (t, f) => {
	t = Array.isArray(t)? t: [t];
        t.forEach((tt) => e.removeEventListener(tt, f));
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
