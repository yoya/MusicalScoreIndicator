"use strict";

const _$ = e => {
    e.setSource = (s) => {
	const youtubePrefix = "https://www.youtube.com/watch?v=";
	const { length } = youtubePrefix;
	if (s.substr(0, length) == youtubePrefix) {
	    const videoId = s.substr(length, 11);
	    const playerContext = { state: -1 }
	    const player = new YT.Player('bigvideo', {
		width: '1280', height: '720',
		videoId: videoId,
		events: {
		    'onReady': () => {
			e.dispatchEvent(new Event("canplaythrough"));
			e.dispatchEvent(new Event("durationchange"));
		    },
		    'onStateChange': () => {
			const state = player.getPlayerState();
			if (playerContext.state !== state) {
			    switch (state) {
			    case -1: //  => init
			    case 0: //  => stop
				e.dispatchEvent(new Event("ended"));
				break;
			    case 1: //  => playing
				e.dispatchEvent(new Event("playing"));
				break;
			    case 2: //  => pause
				e.dispatchEvent(new Event("pause"));
				break;
			    case 3: //  => play
				e.dispatchEvent(new Event("play"));
				break;
			    }
			    playerContext.state = state;
			}
                    },
		},
		playerVars: {
		    autoplay: 0,
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
	} else {
	    // 通常の video 要素
	    e.src = s
	    // YouTube API と同じメソッドを生やす
	    if (! e.seekTo) { e.seekTo = (t) => { e.currentTime = t; } }
	    if (! e.getCurrentTime) { e.getCurrentTime = () => e.currentTime }
	    if (! e.getDuration) { e.getDuration = () => e.duration }
	    if (! e.playVideo) { e.playVideo = e.play }
	    if (! e.pauseVideo) { e.pauseVideo = e.pause }
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
