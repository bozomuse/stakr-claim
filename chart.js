/* stakr & stakr — homegrown candle chart. no embeds, no spinners of doom.
   reads candles.json (built from base swaps by the keeper) and draws
   lightweight canvas candlesticks. dependency-free. */
(function () {
  "use strict";
  var FRAME = document.getElementById("chartFrame");
  var LOADING = document.getElementById("chartLoading");
  if (!FRAME) return;

  var SUBS = "₀₁₂₃₄₅₆₇₈₉";
  function fmtPrice(p) {
    if (!isFinite(p) || p <= 0) return "–";
    if (p >= 100) return p.toFixed(2);
    if (p >= 1) return p.toFixed(4).replace(/\.?0+$/, "");
    var zeros = -Math.floor(Math.log10(p)) - 1;
    var sig = (p * Math.pow(10, zeros)).toPrecision(4).replace(/\.?0+$/, "");
    if (sig.indexOf(".") === 0) sig = sig.slice(1) === "" ? "" : sig;
    sig = sig.replace(/^0\./, "");
    if (zeros <= 2) return "0." + "0".repeat(zeros) + sig;
    var sub = String(zeros).split("").map(function (d) { return SUBS[+d]; }).join("");
    return "0.0" + sub + sig;
  }
  function fmtTime(t) {
    var d = new Date(t * 1000);
    var mo = d.toLocaleString(undefined, { month: "short" });
    return mo + " " + d.getDate() + " " +
      String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  }

  var head = document.createElement("div");
  head.className = "chart-head";
  head.innerHTML =
    '<div class="chart-sym">stakr / bnkr <span class="chart-tf">15m</span></div>' +
    '<div class="chart-stats"><span class="chart-price mono" id="chartPrice">–</span> ' +
    '<span class="chart-chg mono" id="chartChg"></span></div>' +
    '<div class="chart-ohlc mono" id="chartOhlc"></div>';
  FRAME.appendChild(head);

  var canvas = document.createElement("canvas");
  canvas.className = "chart-canvas";
  FRAME.appendChild(canvas);
  var ctx = canvas.getContext("2d");

  var candles = [];
  var hover = -1;
  var W = 0, H = 0, DPR = 1;
  var PAD_R = 64, PAD_B = 22, PAD_T = 8, PAD_L = 6;
  var VOL_H = 0.18; // fraction of plot height for volume
  var INTERVAL = 900; // candle interval, seconds (overridden by candles.json when present)
  var geom = null; // last computed time geometry {t0,t1,span,plotW}, shared with hover

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 3);
    // measure the canvas's CSS box (stylesheet-driven). setting the bitmap
    // below never disturbs layout, so no measure->inline-style feedback loop.
    var r = canvas.getBoundingClientRect();
    if (!r.width || !r.height || r.width < 50 || r.height < 50) return;
    // clamp to viewport: never trust a transient huge rect
    var vw = window.innerWidth || r.width;
    W = Math.min(r.width, vw);
    H = r.height;
    var bw = Math.round(W * DPR), bh = Math.round(H * DPR);
    if (canvas.width !== bw) canvas.width = bw;   // assigning resets the bitmap; avoid churn
    if (canvas.height !== bh) canvas.height = bh;
    draw();
  }

  function visible() {
    var max = 240;
    return candles.length > max ? candles.slice(candles.length - max) : candles;
  }

  function draw() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    var data = visible();
    if (!data.length) return;
    var plotW = W - PAD_L - PAD_R;
    var plotH = H - PAD_T - PAD_B;
    var priceH = plotH * (1 - VOL_H);
    var volTop = PAD_T + priceH;

    var lo = Infinity, hi = -Infinity, vmax = 0;
    data.forEach(function (c) {
      if (c[3] < lo) lo = c[3];
      if (c[2] > hi) hi = c[2];
      if (c[5] > vmax) vmax = c[5];
    });
    if (hi <= lo) { hi = lo * 1.001; }
    var pad = (hi - lo) * 0.08;
    hi += pad; lo = Math.max(0, lo - pad);

    function y(p) { return PAD_T + (1 - (p - lo) / (hi - lo)) * priceH; }
    // time-scaled x, right-anchored on the data: gaps render as gaps, never
    // as one evenly-spaced slot. window adapts to the data span (min 6h).
    var firstT = data[0][0], lastT = data[data.length - 1][0];
    var t1 = lastT + INTERVAL * 2;
    var t0 = firstT - INTERVAL;
    if (t1 - t0 < 6 * 3600) t0 = t1 - 6 * 3600;
    var span = t1 - t0;
    geom = { t0: t0, t1: t1, span: span, plotW: plotW };
    function x(t) { return PAD_L + (t - t0) / span * plotW; }
    function xc(c) { return x(c[0] + INTERVAL / 2); }
    var slotPx = INTERVAL / span * plotW;
    var cw = Math.max(2, Math.min(slotPx * 0.62, 22));

    // grid + price labels
    ctx.font = "10px 'Space Mono', monospace";
    ctx.textBaseline = "middle";
    var steps = 5;
    for (var g = 0; g <= steps; g++) {
      var pv = lo + (hi - lo) * g / steps;
      var gy = y(pv);
      ctx.strokeStyle = "rgba(250,243,231,0.07)";
      ctx.beginPath(); ctx.moveTo(PAD_L, gy); ctx.lineTo(W - PAD_R, gy); ctx.stroke();
      ctx.fillStyle = "#8a7f6a";
      ctx.fillText(fmtPrice(pv), W - PAD_R + 6, gy);
    }
    // time labels at nice intervals across the window
    ctx.fillStyle = "#8a7f6a";
    var tickSteps = [3600, 7200, 10800, 21600, 43200, 86400, 172800];
    var tick = tickSteps[tickSteps.length - 1];
    for (var si = 0; si < tickSteps.length; si++) {
      if (tickSteps[si] >= span / 5) { tick = tickSteps[si]; break; }
    }
    ctx.textAlign = "center";
    for (var tt = Math.ceil(t0 / tick) * tick; tt <= t1; tt += tick) {
      ctx.fillText(fmtTime(tt), x(tt), H - PAD_B / 2);
    }
    ctx.textAlign = "left";

    // volume bars
    data.forEach(function (c) {
      var vh = vmax > 0 ? (c[5] / vmax) * plotH * VOL_H : 0;
      ctx.fillStyle = c[4] >= c[1] ? "rgba(46,189,133,0.35)" : "rgba(246,70,93,0.35)";
      ctx.fillRect(xc(c) - cw / 2, volTop + plotH * VOL_H - vh, cw, vh);
    });

    // candles
    data.forEach(function (c) {
      var up = c[4] >= c[1];
      var col = up ? "#2ebd85" : "#f6465d";
      ctx.strokeStyle = col;
      ctx.fillStyle = col;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(xc(c), y(c[2])); ctx.lineTo(xc(c), y(c[3]));
      ctx.stroke();
      var yo = y(c[1]), yc = y(c[4]);
      var top = Math.min(yo, yc), hgt = Math.max(1, Math.abs(yc - yo));
      ctx.fillRect(xc(c) - cw / 2, top, cw, hgt);
    });

    // last price line
    var last = data[data.length - 1][4];
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = "rgba(232,160,32,0.6)";
    ctx.beginPath(); ctx.moveTo(PAD_L, y(last)); ctx.lineTo(W - PAD_R, y(last)); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#E8A020";
    var ly = Math.min(Math.max(y(last), PAD_T + 8), PAD_T + priceH - 8);
    ctx.fillRect(W - PAD_R, ly - 9, PAD_R - 4, 18);
    ctx.fillStyle = "#1E1A16";
    ctx.fillText(fmtPrice(last), W - PAD_R + 6, ly);

    // crosshair
    if (hover >= 0 && hover < data.length) {
      var hc = data[hover];
      ctx.strokeStyle = "rgba(250,243,231,0.35)";
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(xc(hc), PAD_T); ctx.lineTo(xc(hc), volTop + plotH * VOL_H); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(PAD_L, y(hc[4])); ctx.lineTo(W - PAD_R, y(hc[4])); ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  function setHoverFromEvent(e) {
    var r = canvas.getBoundingClientRect();
    var px = (e.touches && e.touches.length ? e.touches[0].clientX : e.clientX) - r.left;
    var data = visible();
    if (!data.length || !geom) return;
    var best = -1, bestD = Infinity;
    for (var i = 0; i < data.length; i++) {
      var cxp = PAD_L + (data[i][0] + INTERVAL / 2 - geom.t0) / geom.span * geom.plotW;
      var d = Math.abs(cxp - px);
      if (d < bestD) { bestD = d; best = i; }
    }
    var slotPx = INTERVAL / geom.span * geom.plotW;
    if (bestD > Math.max(slotPx * 0.75, 24)) { clearHover(); return; }
    hover = best;
    var c = data[hover];
    var up = c[4] >= c[1];
    document.getElementById("chartOhlc").innerHTML =
      "o " + fmtPrice(c[1]) + " &nbsp;h " + fmtPrice(c[2]) +
      " &nbsp;l " + fmtPrice(c[3]) + " &nbsp;c " + fmtPrice(c[4]) +
      " &nbsp;<span style='color:" + (up ? "#2ebd85" : "#f6465d") + "'>" +
      (up ? "▲" : "▼") + "</span> &nbsp;" + fmtTime(c[0]);
    draw();
  }
  function clearHover() {
    hover = -1;
    document.getElementById("chartOhlc").textContent = "";
    draw();
  }
  canvas.addEventListener("mousemove", setHoverFromEvent);
  canvas.addEventListener("mouseleave", clearHover);
  canvas.addEventListener("touchstart", function (e) { setHoverFromEvent(e); }, { passive: true });
  canvas.addEventListener("touchmove", function (e) { setHoverFromEvent(e); e.preventDefault(); }, { passive: false });
  canvas.addEventListener("touchend", function () { setTimeout(clearHover, 2500); });

  var lastUpdated = 0;
  function load() {
    fetch("candles.json?v=" + Date.now(), { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error("http " + r.status); return r.json(); })
      .then(function (doc) {
        if (!doc.candles || !doc.candles.length) throw new Error("empty");
        candles = doc.candles;
        if (doc.interval) INTERVAL = doc.interval;
        lastUpdated = doc.updated_at || 0;
        if (LOADING) LOADING.style.display = "none";
        var last = candles[candles.length - 1][4];
        document.getElementById("chartPrice").textContent = fmtPrice(last) + " bnkr";
        var chgEl = document.getElementById("chartChg");
        // honest window label: the feed only has candles for intervals with
        // swaps, so label the change with the actual span, not "24h".
        if (candles.length > 1) {
          var first = candles[0];
          var ref = first[4];
          var hrs = (candles[candles.length - 1][0] - first[0]) / 3600;
          if (ref > 0) {
            var chg = (last - ref) / ref * 100;
            var spanLbl = hrs >= 48 ? Math.round(hrs / 24) + "d" : Math.max(1, Math.round(hrs)) + "h";
            chgEl.textContent = (chg >= 0 ? "+" : "") + chg.toFixed(2) + "% / " + spanLbl;
            chgEl.style.color = chg >= 0 ? "#2ebd85" : "#f6465d";
          }
        }
        resize(); // re-measure + repaint from the fresh data
      })
      .catch(function () {
        if (LOADING) {
          LOADING.innerHTML = "chart's still on the grill — " +
            "<a href='https://dexscreener.com/base/0x3059a617cfd2c3b49c7ddab7b4ff947bef76846494e648fc9b9130621439f515' target='_blank' rel='noopener'>open it on dexscreener</a>";
        }
      });
  }

  new ResizeObserver(resize).observe(canvas);
  // mobile browsers can drop the canvas backing store while it's off-screen;
  // repaint from the cached candles whenever it scrolls back into view.
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) resize();
      });
    }, { threshold: 0.05 });
    io.observe(canvas);
  }
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) resize();
  });
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { draw(); });
  }
  window.addEventListener("orientationchange", function () { setTimeout(resize, 300); });
  resize();
  load();
  setInterval(function () { load(); }, 5 * 60 * 1000); // refresh every 5 min
})();
