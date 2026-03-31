"use strict";

document.addEventListener("DOMContentLoaded", (e) => {
    init()
});

function getHashParam(p) {
    const url = new URL(window.location);
    return url.searchParams.get(p);
}

let iframes = null;
let iframesLoadedCount = 0;

function init() {
    console.log("init()");
    iframes = document.querySelectorAll("iframe");
    window.addEventListener("message", (message) => {
	console.log("list", message.data);
	const map = message.data;
	const method = map.get("method");
	if (method == "loaded") {
	    iframesLoadedCount++;
	    if (iframesLoadedCount == iframes.length) {
		iframeLoadedAll();
	    }
	} else if (method == "finished") {
	    const index = map.get("index");
	    const iframe = iframes[index - 1 + 1];
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
    const i = Number(getHashParam("i"));
    const t = getHashParam("t");
    if (i > 0) {
	const startTime = (t)? stringToTime(t): 0;
	const iframe = iframes[i-1];
	const map = new Map();
	map.set('method', 'play');
	map.set('startTime', startTime);
	iframe.contentWindow.postMessage(map, "*");
    }
}
