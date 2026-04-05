"use strict";

document.addEventListener("DOMContentLoaded", (e) => {
    init()
});

let iframes = null;
let iframesLoadedCount = 0;

function init() {
    iframes = document.querySelectorAll("iframe");
    window.addEventListener("message", (message) => {
	console.debug("list listen:", message.data);
	const map = message.data;
	const method = map.get("method");
	if ((method == "loaded")  || method == "canplaythrough") {
	    iframesLoadedCount++;
	    if (iframesLoadedCount == iframes.length * 2) {
		iframeLoadedAll();
	    }
	} else if (method == "volume") {
	    const index = map.get("index");
	    const volume = map.get("volume");
	    for (let i = 0, n = iframes.length; i < n; i++) {
		if ((i+1) != index) {
		    map.set('method', 'volume');
		    map.set('volume', volume);
		    const iframe = iframes[i];
		    iframe.contentWindow.postMessage(map, "*");
		}
	    }
	} else if (method == "playstarted") {
	    const index = map.get("index");
	    const currentTime = map.get("currentTime");
	    console.log({index});
	    setURLParams("i", index);
	    setURLParams("t", currentTime);
	    const t = getURLParams("t");
	    for (let i = 0, n = iframes.length; i < n; i++) {
		if ((i+1) != index) {
		    map.set('method', 'pause');
		    const iframe = iframes[i];
		    iframe.contentWindow.postMessage(map, "*");
		}
	    }
	} else if (method == "finished") {
	    const index = map.get("index");
	    const iframe = iframes[index - 1 + 1]; // next iframe
	    if (iframe) {
		map.set('method', 'play');
		map.set('startTime', 0);
		iframe.contentWindow.postMessage(map, "*");
		iframe.scrollIntoView({ behavior: 'smooth' });
	    }
	}
    });
}

function iframeLoadedAll() {
    // console.log("iframeLoadedAll");
    for (let i = 0, n = iframes.length; i < n; i++) {
	const iframe = iframes[i];
	// console.log({i, iframe});
	const map = new Map();
	map.set('method', 'index');
	map.set('index', i+1);
	iframe.contentWindow.postMessage(map, "*");
    }
    const i = Number(getURLParams("i"));
    const t = getURLParams("t");
    if (i > 0) {
	const startTime = (t)? stringToTime(t): 0;
	const iframe = iframes[i-1];
	const map = new Map();
	map.set('method', 'seek');
	map.set('startTime', startTime);
	iframe.contentWindow.postMessage(map, "*");
	iframe.scrollIntoView({ behavior: 'smooth' });
    }
}
