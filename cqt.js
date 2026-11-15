"use strict";

/*
 * 再生中の音声を Web Audio でリアルタイムに解析し、spectrum 動画 (showcqt) と
 * 同じ絵を canvas に描く。spectrum 動画を読み込まずに済むので通信量が減る。
 * 解析窓の分だけ表示が遅れるので、既定で窓長を showcqt の半分にして遅れを減らしている
 * (fastcqt。低音 0.12 秒、中音 0.08 秒、高音 0.06 秒程度。cqtfast=0 で showcqt と同じ窓長)。
 *
 * spectrum 動画は movie/movie.sh の
 *   showcqt=size=600x180:timeclamp=0.5:rate=24:gamma=5:gamma2=5:fontcolor=r(1)+g(1)+b(1),
 *   crop=448:136:100
 * で作っているので、ffmpeg (libavfilter/avf_showcqt.c) の同じ設定の計算をなぞる:
 *   - 周波数: 20.0152Hz〜20495.6Hz (10 オクターブ) を幅 600 × fcount 4 のサブビンに対数で割り当て
 *   - 窓長: tlength = 384*tc/(384+tc*f) 秒 (tc = timeclamp 0.5)。低音ほど長い
 *   - 周波数方向: 幅 8/tlength Hz の Nuttall 窓。値はパワー × volume(16)²
 *   - 色: 左 (1, 0.5, 0) + 右 (0, 0.5, 1)、1 で頭打ちにしてから 1/gamma(5) 乗
 *   - バー: 高さ = (bar_v² × L/R 平均)^(1/gamma2)。下ほど明るい
 *   - 軸: 背景はその時の色、その上に白の音名 "EF G A BC D " (1 文字 = 半音)
 *   - ソノグラム: 1 フレーム (1/24 秒) に count(6) 行、新しい行が上で下へ流れる
 *   - 配置: bar 84 / axis 10 / sono 86 (高さ 180)。crop は y = 22 から 136 行
 *
 * 違い (リアルタイムなので避けられないもの):
 *   ffmpeg は解析窓の中心をフレーム時刻に置く (先の音も使う) が、リアルタイムでは
 *   過去の音しか使えないので、表示は窓長の半分ほど遅れる (低音 0.2 秒、高音 0.02 秒程度)。
 *   また AnalyserNode (Blackman 窓、振幅のみ) の FFT を窓長の近いもので代用し、
 *   中心の純音で ffmpeg と同じ値になるよう正規化している。
 *
 * 仕組み:
 *   <video> → MediaElementSource → (2ch) → ChannelSplitter → AnalyserNode (L/R × 窓長 6 種)
 *                                └→ (DelayNode) → destination
 *
 * 調整用の URL パラメータ:
 *   cqtgain=<倍率>   明るさ (既定 1)
 *   cqtfast=0        窓長を showcqt と同じにする (既定は半分: 遅れが減る代わりに低音が少しぼやける)
 *   cqtdelay=<秒>    音声だけを遅らせる (解析窓の遅れを打ち消す実験用。楽譜表示は補正しない)
 *   cqtlat=auto|<秒> 出力レイテンシ分だけ表示を遅らせる (既定 auto: AudioContext の値を使う)
 *   cqtfps=<fps>     解析・描画の上限 fps (既定 30。間の行は補間する)
 *
 * AudioContext は操作 (タップ等) の中でないと鳴らせない (iOS) ので、最初の操作で
 * 作る。それまでは video 要素がそのまま音を出す。
 */

const liveCQT = (() => {
    // ---- showcqt の設定 (movie.sh と avf_showcqt.c の既定値) ----
    const BASE_FREQ = 20.01523126408007475;
    const END_FREQ = 20495.59681441799654;
    const SRC_W = 600, SRC_H = 180;          // size=600x180
    const TIMECLAMP = 0.5;                   // timeclamp=0.5
    const SONO_G = 5, BAR_G = 5;             // gamma=5, gamma2=5
    const SONO_V = 16, BAR_V = 16;           // volume 既定 16, volume2 既定 = volume
    const RATE = 24, COUNT = 6;              // rate=24 (movie.sh の r), count 既定 6
    const CSCHEME = [1, 0.5, 0, 0, 0.5, 1];  // cscheme 既定 (左 rgb | 右 rgb)
    const AXIS_STR = "EF G A BC D ";         // 軸の文字 (1 文字 = 半音、E0 から)
    const CROP_W = 448, CROP_H = 136, CROP_X = 100;  // crop=448:136:100
    const CROP_Y = (SRC_H - CROP_H) / 2;     // crop の y 既定は中央

    // showcqt の init() と同じ高さの決め方
    let AXIS_H = (SRC_W / 60) | 0; if (AXIS_H & 1) { AXIS_H++; }
    let BAR_H = ((SRC_H - AXIS_H) / 2) | 0; if (BAR_H & 1) { BAR_H--; }
    let FCOUNT = 0; do { FCOUNT++; } while (FCOUNT * SRC_W < 1920 && FCOUNT < 10);
    const CQT_LEN = SRC_W * FCOUNT;
    // crop 後の行
    const BAR_ROWS = BAR_H - CROP_Y;                // バー (上 CROP_Y 行は切られる)
    const AXIS_TOP = BAR_ROWS;
    const SONO_TOP = AXIS_TOP + AXIS_H;
    const SONO_ROWS = CROP_H - SONO_TOP;            // ソノグラムの見える行数
    const ROWS_PER_SEC = RATE * COUNT;

    const FFT_LOG2_MIN = 10, FFT_LOG2_MAX = 15;     // AnalyserNode: 1024〜32768
    const FFT_SIZES = [];
    for (let b = FFT_LOG2_MIN; b <= FFT_LOG2_MAX; b++) { FFT_SIZES.push(1 << b); }

    const num = (name, def) => {
	const v = parseFloat(getURLParams(name));
	return Number.isFinite(v) ? v : def;
    };
    const log = (msg) => { if (typeof dlog === "function") { dlog("cqt: " + msg); } };

    let media = null, canvas = null, ctx2d = null, info = null;
    let actx = null, analysers = null, kernel = null, dbBufs = null, pwBufs = null;
    let connected = false;  // video の音声を解析につないだか
    let gain = 1, audioDelay = 0, latMode = "auto", minInterval = 0, tlScale = 1;
    let frameQueue = [];  // 出力レイテンシ分だけ表示を遅らせるための待ち行列
    let lastCompute = 0, lastRowTime = null, rowAcc = 0;
    let statCompute = 0, statFrames = 0, statSince = 0;
    let image = null, axisAlpha = null;
    let sonoBuf = null, sonoIdx = 0;          // ソノグラムのリングバッファ (行単位, RGB)
    let prevColor = null;                      // 前回のフレームの色 (行の補間用)

    const subFreq = (k) => Math.exp(Math.log(BASE_FREQ) +
				    (k + 0.5) * (Math.log(END_FREQ) - Math.log(BASE_FREQ)) / CQT_LEN);
    const tlength = (f) => Math.min(TIMECLAMP, Math.max(0.001, 384 * TIMECLAMP / (384 + TIMECLAMP * f)));
    // showcqt の Nuttall 窓 (y: -π〜π)
    const nuttall = (y) => 0.355768 + 0.487396 * Math.cos(y) + 0.144232 * Math.cos(2 * y) + 0.012604 * Math.cos(3 * y);
    // AnalyserNode の Blackman 窓の周波数応答 (d: ビン単位のずれ、d=0 で 0.42)
    const dirichlet = (d) => (Math.abs(d) < 1e-9) ? 1 : Math.sin(Math.PI * d) / (Math.PI * d);
    const blackman = (d) => 0.42 * dirichlet(d) + 0.25 * (dirichlet(d - 1) + dirichlet(d + 1)) +
	  0.04 * (dirichlet(d - 2) + dirichlet(d + 2));

    // FFT ビン → 表示列 (crop 後の x) の重み表。
    // サブビンごとに窓長 tlength 以下の AnalyserNode を 1 つ選び、
    // Nuttall² で重み付けしたパワーの和が「中心の純音 振幅 A」で A² になるよう正規化する
    // (showcqt の値と同じ尺度。左右分離時の ×2 込み)。
    function buildKernel(sampleRate) {
	const perAnalyser = FFT_SIZES.map(() => new Map());  // key: x * 65536 + bin
	for (let x = 0; x < CROP_W; x++) {
	    for (let i = 0; i < FCOUNT; i++) {
		const k = (x + CROP_X) * FCOUNT + i;
		const f = subFreq(k);
		if (f >= sampleRate / 2) { continue; }
		const tl = tlength(f);
		const flen = 8 / tl;  // Nuttall 窓の全幅 (Hz)
		// 窓長が tlength 以下で一番長い FFT サイズを使う (fastcqt では tlength の半分以下)。
		// 長い窓を少しでも混ぜると、gamma=5 で小さい値も明るく見えるため
		// 音が止まった後に長い尾を引くので、混ぜずに 1 つだけ使う。
		let p = Math.floor(Math.log2(sampleRate * tl * tlScale));
		p = Math.min(FFT_LOG2_MAX, Math.max(FFT_LOG2_MIN, p));
		for (const [ai, bw] of [[p - FFT_LOG2_MIN, 1]]) {
		    const size = FFT_SIZES[ai];
		    const binHz = sampleRate / size;
		    const c = f / binHz;
		    const j0 = Math.max(1, Math.ceil((f - flen / 2) / binHz));
		    const j1 = Math.min(size / 2 - 1, Math.floor((f + flen / 2) / binHz));
		    const g = [];
		    let s1 = 0;
		    for (let j = j0; j <= j1; j++) {
			const gj = nuttall(2 * Math.PI * (j * binHz - f) / flen) ** 2;
			g.push(gj);
			s1 += gj * blackman(j - c) ** 2;
		    }
		    if (s1 <= 0) { continue; }
		    // |X_j| = (A/2)|W(j-c)| なので Σ g|X|² = A²/4 · s1。A² にするには × 4/s1
		    const norm = 4 / s1 * bw / FCOUNT;
		    const m = perAnalyser[ai];
		    for (let j = j0; j <= j1; j++) {
			const key = x * 65536 + j;
			m.set(key, (m.get(key) || 0) + g[j - j0] * norm);
		    }
		}
	    }
	}
	return perAnalyser.map(m => {
	    const n = m.size;
	    const outIdx = new Int32Array(n), fftIdx = new Int32Array(n), weight = new Float32Array(n);
	    let i = 0, kmin = Infinity, kmax = -1;
	    for (const [key, w] of m) {
		outIdx[i] = (key / 65536) | 0;
		fftIdx[i] = key % 65536;
		weight[i] = w;
		kmin = Math.min(kmin, fftIdx[i]); kmax = Math.max(kmax, fftIdx[i]);
		i++;
	    }
	    return { outIdx, fftIdx, weight, kmin, kmax };
	});
    }

    // 軸の文字の不透明度 (crop 後の 448 × AXIS_H)。
    // showcqt は 1920x32 に文字を描いてから 600 x axis_h に縮小している。
    function buildAxisAlpha() {
	const big = document.createElement("canvas");
	big.width = 1920; big.height = 32;
	const g = big.getContext("2d");
	g.fillStyle = "white";
	g.font = "bold 28px serif";
	g.textAlign = "center";
	g.textBaseline = "middle";
	for (let x = 0; x < 1920; x += 16) {
	    const ch = AXIS_STR[(x / 16) % 12];
	    if (ch !== " ") { g.fillText(ch, x + 8, 17, 16); }
	}
	const small = document.createElement("canvas");
	small.width = SRC_W; small.height = AXIS_H;
	const s = small.getContext("2d", { willReadFrequently: true });
	s.imageSmoothingQuality = "high";
	s.drawImage(big, 0, 0, SRC_W, AXIS_H);
	const d = s.getImageData(CROP_X, 0, CROP_W, AXIS_H).data;
	const a = new Float32Array(CROP_W * AXIS_H);
	for (let i = 0; i < a.length; i++) { a[i] = d[i * 4 + 3] / 255; }
	return a;
    }

    // 描画先の準備
    function initCanvas(mediaElement, canvasElement, infoElement) {
	media = mediaElement;
	canvas = canvasElement;
	info = infoElement;
	canvas.width = CROP_W;
	canvas.height = CROP_H;
	ctx2d = canvas.getContext("2d");
	image = ctx2d.createImageData(CROP_W, CROP_H);
	for (let p = 3; p < image.data.length; p += 4) { image.data[p] = 255; }
	sonoBuf = new Uint8ClampedArray(SONO_ROWS * CROP_W * 3);
	axisAlpha = buildAxisAlpha();
	render(new Float32Array(CROP_W * 3), new Float32Array(CROP_W));  // 無音の絵 (軸の文字だけ)
    }

    // リアルタイム解析で表示する
    function setup(mediaElement, canvasElement, infoElement) {
	initCanvas(mediaElement, canvasElement, infoElement);
	gain = num("cqtgain", 1);
	tlScale = (getURLParams("cqtfast") === "0") ? 1 : 0.5;  // 既定は fastcqt (窓長半分)
	audioDelay = Math.max(0, num("cqtdelay", 0));
	const lat = getURLParams("cqtlat");
	latMode = (lat === null || lat === "auto") ? "auto" : Math.max(0, parseFloat(lat) || 0);
	minInterval = 1000 / num("cqtfps", 30) - 2;  // rAF の揺れで間引きすぎないよう少し甘く
	setInfo("タップすると解析を始めます");
	// AudioContext は操作の中で作る (iOS は操作の外では鳴らせない)
	const onGesture = () => start();
	// PC ブラウザは、同じオリジンの親ページで操作済みなら、操作なしの iframe
	// (一覧ページの連続再生の次の曲) でも音付きの自動再生を許す。その場合は
	// AudioContext も動かせるので、再生が始まった時にも開始を試みる。
	// 許されなければ (iOS など) 何もせず、タップを待つ。
	media.addEventListener("playing", () => tryAutoStart());
	for (const t of ["pointerdown", "touchend", "click", "keydown"]) {
	    document.addEventListener(t, onGesture, true);
	}
    }

    function setInfo(s) { if (info) { info.textContent = s; } }

    // AudioContext を作る (まだ動いていなくてもよい)
    function ensureContext() {
	if (actx) { return true; }
	try {
	    // iOS 17+: Web Audio の音がマナースイッチで消えないようにする
	    if (navigator.audioSession) { navigator.audioSession.type = "playback"; }
	    actx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: "interactive" });
	    log("context state=" + actx.state);
	    return true;
	} catch (err) {
	    console.error("liveCQT: AudioContext failed", err);
	    setInfo("開始できません: " + err.message);
	    return false;
	}
    }

    // 操作 (タップ等) の中: 開始が許されるので、すぐ解析につなぐ
    function start() {
	if (! ensureContext()) { return; }
	if (actx.state === "suspended") { actx.resume(); }
	if (! connected) { connect(); }
    }

    // 操作の外 (再生開始時): 開始を試み、本当に動いた時だけ解析につなぐ。
    // 動いていない AudioContext に video の音声をつなぐと無音になるため。
    function tryAutoStart() {
	if (connected || ! ensureContext()) { return; }
	if (actx.state === "running") { connect(); return; }
	actx.resume().then(() => {
	    if (actx.state === "running" && ! connected) {
		log("auto start (no tap)");
		connect();
	    }
	}).catch(() => { });
    }

    function connect() {
	connected = true;
	try {
	    const src = actx.createMediaElementSource(media);
	    // 先に音の出口をつなぐ (以降で失敗しても無音にならないように)
	    let out = src;
	    if (audioDelay > 0) {
		const d = actx.createDelay(Math.max(1, audioDelay));
		d.delayTime.value = audioDelay;
		src.connect(d);
		out = d;
	    }
	    out.connect(actx.destination);
	    // モノラルなら L=R に広げてから L/R に分ける
	    // (ChannelSplitter 自体の channelInterpretation は変えられない)
	    const stereo = actx.createGain();
	    stereo.channelCount = 2;
	    stereo.channelCountMode = "explicit";
	    stereo.channelInterpretation = "speakers";
	    const splitter = actx.createChannelSplitter(2);
	    src.connect(stereo);
	    stereo.connect(splitter);
	    kernel = buildKernel(actx.sampleRate);
	    // 使わない窓長 (全部の重みが 0) の AnalyserNode は作らない
	    analysers = [0, 1].map(ch => FFT_SIZES.map((size, ai) => {
		if (! kernel[ai].outIdx.length) { return null; }
		const a = actx.createAnalyser();
		a.fftSize = size;
		a.smoothingTimeConstant = 0;  // 平滑化すると遅れるので無し
		splitter.connect(a, ch);
		return a;
	    }));
	    dbBufs = FFT_SIZES.map(size => new Float32Array(size / 2));
	    pwBufs = FFT_SIZES.map(size => new Float32Array(size / 2));
	    log("connect sr=" + actx.sampleRate + " state=" + actx.state);
	    requestAnimationFrame(loop);
	} catch (err) {
	    console.error("liveCQT start failed", err);
	    setInfo("開始できません: " + err.message);
	    log("start failed " + err.message);
	}
    }

    function outputLatency() {
	if (latMode !== "auto") { return latMode; }
	return (actx.outputLatency || 0) + (actx.baseLatency || 0);
    }

    // 解析: 列ごとの色 (RGB 0〜255) とバーの高さ (0〜, 1 以上は頭打ち)
    function analyse() {
	const t0 = performance.now();
	const pw = [new Float32Array(CROP_W), new Float32Array(CROP_W)];
	for (let ch = 0; ch < 2; ch++) {
	    const acc = pw[ch];
	    for (let ai = 0; ai < FFT_SIZES.length; ai++) {
		const a = analysers[ch][ai];
		if (! a) { continue; }
		const db = dbBufs[ai], p = pwBufs[ai];
		a.getFloatFrequencyData(db);
		const { outIdx, fftIdx, weight, kmin, kmax } = kernel[ai];
		for (let k = kmin; k <= kmax; k++) {  // dB → パワー (使う範囲だけ)
		    p[k] = (db[k] > -250) ? Math.exp(db[k] * 0.23025850929940458) : 0;  // 10^(db/10)
		}
		for (let j = 0; j < outIdx.length; j++) {
		    acc[outIdx[j]] += weight[j] * p[fftIdx[j]];
		}
	    }
	}
	const color = new Float32Array(CROP_W * 3), height = new Float32Array(CROP_W);
	const sv = SONO_V * SONO_V * gain, bv = BAR_V * BAR_V * gain;
	const gam = (v, g) => Math.exp(Math.log(v) / g);
	for (let x = 0; x < CROP_W; x++) {
	    const l = pw[0][x], r = pw[1][x];
	    height[x] = gam(bv * 0.5 * (l + r), BAR_G);
	    const L = sv * l, R = sv * r;
	    color[x * 3]     = 255 * gam(Math.min(1, CSCHEME[0] * L + CSCHEME[3] * R), SONO_G);
	    color[x * 3 + 1] = 255 * gam(Math.min(1, CSCHEME[1] * L + CSCHEME[4] * R), SONO_G);
	    color[x * 3 + 2] = 255 * gam(Math.min(1, CSCHEME[2] * L + CSCHEME[5] * R), SONO_G);
	}
	statCompute += performance.now() - t0;
	return { color, height };
    }

    // ソノグラムに n 行足す (前回の色から今回の色へ補間。新しい行が上)
    function pushSonoRows(color, n) {
	if (n <= 0) { return; }
	const from = prevColor || color;
	n = Math.min(n, SONO_ROWS);
	const rowLen = CROP_W * 3;
	for (let i = 1; i <= n; i++) {
	    const t = i / n;
	    sonoIdx = (sonoIdx + SONO_ROWS - 1) % SONO_ROWS;
	    const o = sonoIdx * rowLen;
	    for (let q = 0; q < rowLen; q++) {
		sonoBuf[o + q] = from[q] + (color[q] - from[q]) * t;
	    }
	}
	prevColor = color;
    }

    // 1 フレーム描く (showcqt の draw_bar / draw_axis / draw_sono と同じ並び)
    function render(color, height) {
	const d = image.data;
	// バー: 元の y (0〜BAR_H-1) の段の高さ ht = (BAR_H - y) / BAR_H
	for (let yc = 0; yc < BAR_ROWS; yc++) {
	    const ht = (BAR_H - (yc + CROP_Y)) / BAR_H;
	    let p = yc * CROP_W * 4;
	    for (let x = 0; x < CROP_W; x++, p += 4) {
		const h = height[x];
		if (h <= ht) {
		    d[p] = d[p + 1] = d[p + 2] = 0;
		} else {
		    const mul = (h - ht) / (h + 0.0001);  // bar_t = 1
		    d[p] = mul * color[x * 3]; d[p + 1] = mul * color[x * 3 + 1]; d[p + 2] = mul * color[x * 3 + 2];
		}
	    }
	}
	// 軸: 背景はその時の色、文字 (白) を不透明度で重ねる
	for (let y = 0; y < AXIS_H; y++) {
	    let p = (AXIS_TOP + y) * CROP_W * 4;
	    for (let x = 0; x < CROP_W; x++, p += 4) {
		const a = axisAlpha[y * CROP_W + x];
		d[p]     = a * 255 + (1 - a) * color[x * 3];
		d[p + 1] = a * 255 + (1 - a) * color[x * 3 + 1];
		d[p + 2] = a * 255 + (1 - a) * color[x * 3 + 2];
	    }
	}
	// ソノグラム: リングバッファの新しい行から順に
	for (let y = 0; y < SONO_ROWS; y++) {
	    const o = ((sonoIdx + y) % SONO_ROWS) * CROP_W * 3;
	    let p = (SONO_TOP + y) * CROP_W * 4;
	    for (let x = 0; x < CROP_W; x++, p += 4) {
		d[p] = sonoBuf[o + x * 3]; d[p + 1] = sonoBuf[o + x * 3 + 1]; d[p + 2] = sonoBuf[o + x * 3 + 2];
	    }
	}
	ctx2d.putImageData(image, 0, 0);
    }

    function loop(now) {
	requestAnimationFrame(loop);
	if (media.paused) {  // 停止中は止めた絵のまま (spectrum 動画と同じ)
	    lastRowTime = null;
	    return ;
	}
	if (now - lastCompute >= minInterval) {
	    lastCompute = now;
	    frameQueue.push({ t: now, ...analyse() });
	    statFrames++;
	}
	// 出力レイテンシ分だけ古いフレームを表示する (音が耳に届く時刻に合わせる)
	const lat = outputLatency() * 1000;
	let frame = null;
	while (frameQueue.length && frameQueue[0].t <= now - lat) { frame = frameQueue.shift(); }
	if (frameQueue.length > 120) { frameQueue.splice(0, frameQueue.length - 120); }
	if (frame) {
	    if (lastRowTime === null) { lastRowTime = now; }
	    rowAcc += (now - lastRowTime) * ROWS_PER_SEC / 1000;
	    lastRowTime = now;
	    const n = Math.floor(rowAcc);
	    rowAcc -= n;
	    pushSonoRows(frame.color, n);
	    render(frame.color, frame.height);
	}
	if (now - statSince > 1000) {
	    const fps = statFrames * 1000 / (now - statSince);
	    const ms = statFrames ? statCompute / statFrames : 0;
	    setInfo("解析 " + ms.toFixed(2) + "ms/frame, " + fps.toFixed(0) + "fps" +
		    " | 出力遅延 " + (outputLatency() * 1000).toFixed(0) + "ms" +
		    " (base " + ((actx.baseLatency || 0) * 1000).toFixed(0) +
		    " + out " + ((actx.outputLatency || 0) * 1000).toFixed(0) + ")" +
		    (audioDelay ? " | 音声遅延 " + (audioDelay * 1000).toFixed(0) + "ms" : "") +
		    (tlScale === 1 ? " | 標準窓" : "") +
		    " | " + actx.state);
	    statSince = now; statFrames = 0; statCompute = 0;
	}
    }

    return { setup, start };
})();
