"use strict";

/*
 * play.html を iframe で並べたページ用。各 iframe と postMessage で連携する。
 *
 * 以前は全 iframe から loaded と canplaythrough が揃うのを待って index を
 * 配っていたが、iPhone は canplaythrough が来ない事があり、揃わずに
 * 連携が一切始まらなかった。index の配布に必要なのは iframe 側の
 * スクリプトが動いている事だけなので、iframe ごとに loaded が来た時点で
 * その iframe に index を返す。動画の読み込み完了待ちは iframe 側
 * (play.js の whenReady) で行う。
 */

const iframes = document.querySelectorAll("iframe");

// URL の #i=&t= で指定された初期表示位置 (i は 1 始まり。0 なら指定なし)
const startIndex = Number(getURLParams("i"));
const startTimeParam = getURLParams("t");

function iframeIndexOf(source) {  // message.source から 1 始まりの index を引く
    for (let i = 0, n = iframes.length; i < n; i++) {
	if (iframes[i].contentWindow === source) {
	    return i + 1;
	}
    }
    return 0;
}

// iframe に index を教え、初期表示位置の指定対象なら seek させる。
// 同じ iframe に複数回呼ばれても問題ない (play.js 側は冪等)。
function introduce(index) {
    const iframe = iframes[index - 1];
    const map = new Map();
    map.set('method', 'index');
    map.set('index', index);
    iframe.contentWindow.postMessage(map, "*");
    if (index === startIndex) {
	const startTime = (startTimeParam)? stringToTime(startTimeParam): 0;
	const seekMap = new Map();
	seekMap.set('method', 'seek');
	seekMap.set('startTime', startTime);
	iframe.contentWindow.postMessage(seekMap, "*");
	iframe.scrollIntoView({ behavior: 'smooth' });
    }
}

window.addEventListener("message", (message) => {
    const map = message.data;
    if (! (map instanceof Map)) {
	return ;  // 拡張機能などからの無関係なメッセージ
    }
    console.debug("list listen:", map);
    const method = map.get("method");
    if (method == "loaded") {
	const index = iframeIndexOf(message.source);
	if (index) {
	    introduce(index);
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
	setURLParams("i", index);
	setURLParams("t", currentTime);
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

// list.js は iframe 要素より後に読み込まれるが、iframe の方が先に読み込みを
// 終えて loaded を送ってしまう (このリスナーが間に合わない) 事があるので、
// ここで一度全 iframe に送っておく。まだ読み込み中の iframe には届かないが、
// その iframe は後で loaded を送ってくるので、そこで改めて送る。
for (let i = 1, n = iframes.length; i <= n; i++) {
    introduce(i);
}
