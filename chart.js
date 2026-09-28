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

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 3);
    var r = FRAME.getBoundingClientRect();
    W = Math.max(50, r.width);
    H = Math.max(50, r.height);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
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
    function x(i) { return PAD_L + (i + 0.5) * (plotW / data.length); }
    var cw = Math.max(2, (plotW / data.length) * 0.62);

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
    // time labels
    ctx.fillStyle = "#8a7f6a";
    var every = Math.max(1, Math.floor(data.length / 5));
    for (var ti = 0; ti < data.length; ti += every) {
      ctx.fillText(fmtTime(data[ti][0]), x(ti) - 30, H - PAD_B / 2);
    }

    // volume bars
    data.forEach(function (c, i) {
      var vh = vmax > 0 ? (c[5] / vmax) * plotH * VOL_H : 0;
      ctx.fillStyle = c[4] >= c[1] ? "rgba(46,189,133,0.35)" : "rgba(246,70,93,0.35)";
      ctx.fillRect(x(i) - cw / 2, volTop + plotH * VOL_H - vh, cw, vh);
    });

    // candles
    data.forEach(function (c, i) {
      var up = c[4] >= c[1];
      var col = up ? "#2ebd85" : "#f6465d";
      ctx.strokeStyle = col;
      ctx.fillStyle = col;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x(i), y(c[2])); ctx.lineTo(x(i), y(c[3]));
      ctx.stroke();
      var yo = y(c[1]), yc = y(c[4]);
      var top = Math.min(yo, yc), hgt = Math.max(1, Math.abs(yc - yo));
      ctx.fillRect(x(i) - cw / 2, top, cw, hgt);
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
      var c = data[hover];
      ctx.strokeStyle = "rgba(250,243,231,0.35)";
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(x(hover), PAD_T); ctx.lineTo(x(hover), volTop + plotH * VOL_H); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(PAD_L, y(c[4])); ctx.lineTo(W - PAD_R, y(c[4])); ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  function setHoverFromEvent(e) {
    var r = canvas.getBoundingClientRect();
    var px = (e.touches && e.touches.length ? e.touches[0].clientX : e.clientX) - r.left;
    var data = visible();
    var plotW = W - PAD_L - PAD_R;
    var i = Math.floor((px - PAD_L) / (plotW / data.length));
    hover = Math.max(0, Math.min(data.length - 1, i));
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
        lastUpdated = doc.updated_at || 0;
        if (LOADING) LOADING.style.display = "none";
        var last = candles[candles.length - 1][4];
        document.getElementById("chartPrice").textContent = fmtPrice(last) + " bnkr";
        var chgEl = document.getElementById("chartChg");
        var refIdx = Math.max(0, candles.length - 1 - 96);
        var ref = candles[refIdx][4];
        if (ref > 0 && candles.length > 1) {
          var chg = (last - ref) / ref * 100;
          chgEl.textContent = (chg >= 0 ? "+" : "") + chg.toFixed(2) + "% / 24h";
          chgEl.style.color = chg >= 0 ? "#2ebd85" : "#f6465d";
        }
        draw();
      })
      .catch(function () {
        if (LOADING) {
          LOADING.innerHTML = "chart's still on the grill — " +
            "<a href='https://dexscreener.com/base/0x3059a617cfd2c3b49c7ddab7b4ff947bef76846494e648fc9b9130621439f515' target='_blank' rel='noopener'>open it on dexscreener</a>";
        }
      });
  }

  new ResizeObserver(resize).observe(FRAME);
  window.addEventListener("orientationchange", function () { setTimeout(resize, 300); });
  load();
  setInterval(function () { load(); }, 5 * 60 * 1000); // refresh every 5 min
  resize();
})();
