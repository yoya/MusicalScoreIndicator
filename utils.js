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
			// 診断ログ用 (debug.js)。-1:未開始 0:終了 1:再生 2:停止 3:バッファ 5:頭出し
			e.dispatchEvent(new CustomEvent("ytstate", {detail: state}));
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
	    e = player.getIframe();  // player.g は非公開プロパティで、現行 API では undefined
	    e.playVideo = () => { player.playVideo(); }
	    e.pauseVideo = () => { player.pauseVideo(); }
	    e.seekTo = (t) => { player.seekTo(t); }
	    e.getCurrentTime = () => { return player.getCurrentTime(); }
	    e.getDuration = () => { return player.getDuration(); }
	    e.setVolume = (v) => { return player.setVolume(v); }
	    e.getVolume = () => (player.getVolume)? player.getVolume(): 100;
	    // iframe 要素には paused が無いので player state から判定する。
	    // onReady 前 (getPlayerState 未定義) は操作できないので false を返して待たせる。
	    e.isPaused = () => {
		if (! player.getPlayerState) { return false; }
		const state = player.getPlayerState();
		return (state !== 1) && (state !== 3);  // 1:playing, 3:buffering
	    }
	} else {
	    // 通常の video 要素
	    e.src = s
	    // YouTube API と同じメソッドを生やす
	    if (! e.seekTo) { e.seekTo = (t) => { e.currentTime = t; } }
	    if (! e.getCurrentTime) { e.getCurrentTime = () => e.currentTime }
	    if (! e.getDuration) { e.getDuration = () => e.duration }
	    if (! e.playVideo) {
		e.playVideo = () => {
		    // iOS の自動再生制限などで play() が拒否された事を診断ログ (debug.js) に伝える
		    const p = e.play();
		    if (p && p.catch) {
			p.catch(err => {
			    e.dispatchEvent(new CustomEvent("playrejected", {detail: err.name + ": " + err.message}));
			});
		    }
		}
	    }
	    if (! e.pauseVideo) { e.pauseVideo = e.pause }
	    if (! e.setVolume) { e.setVolume = (v) => { e.volume = v/100; } }
	    if (! e.getVolume) { e.getVolume = () => e.volume * 100 }
	    if (! e.isPaused) { e.isPaused = () => e.paused }
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

// 時間表記を秒に変換する。
//   単位付き:     "1h2m3.5s" "1h1s" "1h" "4m" "1m05s" "14m10.5s" "90s"
//                 (h, m, s はそれぞれ省略できるが、並びは h → m → s。
//                  最後の s も省略可: "1m30" は 90 秒)
//   コロン区切り: "1:00:01" "10:19.5" (時:分:秒 / 分:秒)
//   数値のみ:     "90" "-12.5" "1e-7" (秒。プログラムが内部で作る表記を含む)
// 以前は h/m/: で区切って 60 倍ずつ足していたので、"1h1s" が 61 秒になり、
// "1h" や "4m" のように単位で終わる表記は NaN になっていた。
// 解釈できない表記は NaN を返し、console.warn で知らせる。
const TIME_NUM = "[-+]?(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][-+]?\\d+)?";
const TIME_UNIT_RE = new RegExp("^(?:(" + TIME_NUM + ")h)?(?:(" + TIME_NUM + ")m)?(?:(" + TIME_NUM + ")s?)?$");
const TIME_COLON_RE = new RegExp("^" + TIME_NUM + "(?::" + TIME_NUM + ")+s?$");
const stringToTime = (s) => {
    const str = String(s).trim();
    if (TIME_COLON_RE.test(str)) {  // 時:分:秒 / 分:秒
        let t = 0;
        for (const tt of str.replace(/s$/, "").split(":")) {
            t = t * 60 + parseFloat(tt);
        }
        return t;
    }
    const m = str.match(TIME_UNIT_RE);
    if (m && (m[1] !== undefined || m[2] !== undefined || m[3] !== undefined)) {
        const [h, min, sec] = [m[1], m[2], m[3]].map(v => (v === undefined) ? 0 : parseFloat(v));
        return h * 3600 + min * 60 + sec;
    }
    console.warn("stringToTime: 解釈できない時間表記", s);
    return NaN;
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
