"use strict";

/*
 * 診断ログ (iPad で音声が止まる原因調査用)
 *
 * URL に debug=1 を付けた時だけ有効。play.html?c=...&debug=1 か、
 * 一覧ページ側に付けると (同一オリジンの) iframe 内の play.html も有効になる。
 *   例) mahler/mahler-lieder.html?debug=1
 *
 * 画面下部に直近のログを重ねて表示する (タップは素通しするので操作の邪魔はしない)。
 * ページが再読み込みされても (iPad のメモリ不足による強制リロード等) 直前のログが
 * 残るよう、sessionStorage にも保存する。
 * 無効時は debugLog などは何もしない。
 */

const DEBUG = (() => {
    const enabled = (loc) => {
	const hash = new URLSearchParams(loc.hash.substring(1));
	const search = new URLSearchParams(loc.search);
	return hash.get("debug") === "1" || search.get("debug") === "1";
    };
    if (enabled(window.location)) {
	return true;
    }
    try {  // 一覧ページ (親) の URL に debug=1 があれば iframe 側も有効にする
	return (window.parent !== window) && enabled(window.parent.location);
    } catch (e) {
	return false;  // 別オリジンの親は読めない
    }
})();

const DEBUG_MAX_LINES = 200;      // 保存する行数
const DEBUG_SHOW_LINES = 14;      // 画面に出す行数
const debugStorageKey = "debuglog:" + window.location.pathname + window.location.search;
let debugLines = [];
let debugView = null;
let debugTimeSource = null;  // 現在の再生位置を返す関数 (play.js が debugSetTimeSource で設定)
function debugSetTimeSource(fn) {
    debugTimeSource = fn;
}
let debugLastMsg = null;     // 連続する同じメッセージをまとめる用
let debugLastCount = 0;

function debugNow() {
    const d = new Date();
    const pad = (n, w = 2) => String(n).padStart(w, "0");
    return pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds())
	+ "." + String(d.getMilliseconds()).padStart(3, "0").substring(0, 1);
}

function debugRender() {
    if (! debugView) {
	return ;
    }
    debugView.textContent = debugLines.slice(-DEBUG_SHOW_LINES).join("\n");
}

function debugSave() {
    try {
	sessionStorage.setItem(debugStorageKey, JSON.stringify(debugLines.slice(-DEBUG_MAX_LINES)));
    } catch (e) { /* 保存できなくても表示は続ける */ }
}

function debugLog(msg) {
    if (! DEBUG) {
	return ;
    }
    let t = "";
    try {
	if (debugTimeSource) {
	    const v = debugTimeSource();
	    if (typeof v === "number" && isFinite(v)) {
		t = " t=" + v.toFixed(1);
	    }
	}
    } catch (e) { /* 再生位置が取れない時は省略 */ }
    const line = debugNow() + t + " " + msg;
    // 同じメッセージが続く時は 1 行にまとめて回数を付ける (時刻は最新に更新)
    if (msg === debugLastMsg && debugLines.length) {
	debugLastCount++;
	debugLines[debugLines.length - 1] = line + " ×" + debugLastCount;
    } else {
	debugLastMsg = msg;
	debugLastCount = 1;
	debugLines.push(line);
    }
    if (debugLines.length > DEBUG_MAX_LINES) {
	debugLines = debugLines.slice(-DEBUG_MAX_LINES);
    }
    console.debug("[debug]", line);
    debugRender();
    debugSave();
}

// メディア要素 (video / YouTube の iframe) のイベントを記録する
function debugAttachMedia(e, label, events) {
    if (! DEBUG || ! e) {
	return ;
    }
    events.forEach(type => {
	e.addEventListener(type, (ev) => {
	    let detail = "";
	    if (type === "error" && e.error) {
		detail = " code=" + e.error.code + " " + (e.error.message || "");
	    } else if (ev instanceof CustomEvent) {  // ytstate / playrejected
		detail = " " + ev.detail;
	    }
	    debugLog("[" + label + "] " + type + detail);
	});
    });
}

if (DEBUG) {
    // 前回 (再読み込み前) のログを引き継ぐ
    try {
	const prev = JSON.parse(sessionStorage.getItem(debugStorageKey) || "[]");
	if (prev.length) {
	    debugLines = prev.concat(["---- reload " + debugNow() + " ----"]);
	}
    } catch (e) { /* 読めなければ新規 */ }
    debugLog("boot " + navigator.userAgent.replace(/^Mozilla\/5\.0 /, "").substring(0, 60)
	     + " touch=" + navigator.maxTouchPoints);

    window.addEventListener("error", (e) => debugLog("JS error: " + e.message));
    window.addEventListener("unhandledrejection", (e) => {
	const r = e.reason;
	debugLog("unhandled rejection: " + ((r && r.name) ? r.name + " " + r.message : r));
    });
    document.addEventListener("visibilitychange", () => debugLog("visibility " + document.visibilityState));
    window.addEventListener("pagehide", () => debugLog("pagehide"));
    window.addEventListener("pageshow", (e) => debugLog("pageshow persisted=" + e.persisted));

    document.addEventListener("DOMContentLoaded", () => {
	debugView = document.createElement("div");
	debugView.id = "debugLog";
	Object.assign(debugView.style, {
	    position: "fixed", left: "0", right: "0", bottom: "0", zIndex: "9999",
	    maxHeight: "45%", overflow: "hidden", pointerEvents: "none",
	    background: "rgba(0, 0, 0, 0.72)", color: "#7f7",
	    font: "11px/1.35 monospace", whiteSpace: "pre-wrap", padding: "2px 4px",
	});
	document.body.appendChild(debugView);
	debugRender();
    });
}
