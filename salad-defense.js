/* salad defense — keep the flies off the potato salad.
   tap flies to swat them. 6 landings ruins the batch. endless waves.
   dependency-free canvas. logical space is 400 x 640, CSS owns display size. */
(() => {
'use strict';

const W = 400, H = 640;
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const BOWL = { x: W / 2, y: 512, r: 76 };
const MAX_GERMS = 6;
const SWAT_R = 32;
const COMBO_WINDOW = 1.1;

const $ = (id) => document.getElementById(id);
const scoreboard = $('scoreboard');
const overlay = $('overlay');
const overlayTitle = $('overlayTitle');
const overlaySub = $('overlaySub');
const overlayBtn = $('overlayBtn');
const hint = $('hint');

const store = {
  get(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { window.localStorage.setItem(k, v); } catch (e) {} },
};

/* ---------------- state ---------------- */
const S = {
  phase: 'menu', // menu | wave | breather | over
  score: 0,
  wave: 0,
  combo: 0,
  bestCombo: 0,
  germs: 0,
  best: parseInt(store.get('salad-defense-best') || '0', 10) || 0,
  flies: [],
  particles: [],
  popups: [],
  swats: [],      // swatter swing anims {x,y,rot,t}
  spawnQueue: 0,
  spawnT: 0,
  spawnInterval: 1,
  flySpeed: 60,
  breatherT: 0,
  lastSwatT: -9,
  milestonesHit: new Set(),
  muted: false,
  overlayAction: null,
};

function startGame() {
  S.phase = 'breather';
  S.score = 0;
  S.wave = 0;
  S.combo = 0;
  S.bestCombo = 0;
  S.germs = 0;
  S.flies = [];
  S.particles = [];
  S.popups = [];
  S.swats = [];
  S.milestonesHit = new Set();
  S.breatherT = 1.0;
  hideOverlay();
  renderScore();
  hint.textContent = 'tap the flies. do not let them touch the salad.';
}

function beginWave(n) {
  S.wave = n;
  S.phase = 'wave';
  S.spawnQueue = Math.min(18, 4 + n * 2);
  S.spawnInterval = Math.max(0.5, 1.35 - n * 0.1);
  S.flySpeed = Math.min(150, 52 + n * 9);
  S.spawnT = 0.4;
  showPopup('wave ' + n, n === 1 ? 'they smell the mayo.' : pickTaunt(), W / 2, 220);
  sfx.wave();
  renderScore();
}

function pickTaunt() {
  const t = [
    'they brought friends.',
    'the mayo is too strong.',
    'they can smell fear.',
    'bolder. hungrier. buzzier.',
    'cover the bowl. psychologically.',
  ];
  return t[(S.wave - 2 + t.length * 10) % t.length];
}

function spawnFly() {
  const edge = (Math.random() * 3) | 0;
  let x, y;
  if (edge === 0) { x = 20 + Math.random() * (W - 40); y = -20; }
  else if (edge === 1) { x = -20; y = 40 + Math.random() * 260; }
  else { x = W + 20; y = 40 + Math.random() * 260; }
  const a = Math.atan2(BOWL.y - y, BOWL.x - x);
  const sp = S.flySpeed * (0.85 + Math.random() * 0.3);
  S.flies.push({
    x, y,
    vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
    speed: sp,
    wob: Math.random() * Math.PI * 2,
    wt: Math.random() * 10,
    flapT: Math.random() * 10,
    state: 'fly', // fly | landed | leaving
    landT: 0,
  });
}

/* ---------------- audio (tiny synth) ---------------- */
let AC = null;
function ac() {
  if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { AC = null; } }
  if (AC && AC.state === 'suspended') AC.resume();
  return AC;
}
function tone(freq, dur, type, vol, when, slideTo) {
  if (S.muted) return;
  const a = ac(); if (!a) return;
  const t = a.currentTime + (when || 0);
  const o = a.createOscillator(), g = a.createGain();
  o.type = type || 'sine';
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol || 0.12, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(a.destination);
  o.start(t); o.stop(t + dur + 0.05);
}
const sfx = {
  swat()  { tone(190, 0.07, 'square', 0.10, 0, 70); },
  splat() { tone(120, 0.10, 'sine', 0.12, 0.02, 50); },
  whiff() { tone(320, 0.06, 'sine', 0.04, 0, 180); },
  land()  { tone(300, 0.22, 'sawtooth', 0.06, 0, 80); },
  wave()  { [392, 523, 659].forEach((f, i) => tone(f, 0.12, 'square', 0.06, i * 0.09)); },
  combo() { [660, 880].forEach((f, i) => tone(f, 0.1, 'square', 0.06, i * 0.07)); },
  over()  { [392, 311, 233, 155].forEach((f, i) => tone(f, 0.22, 'sawtooth', 0.07, i * 0.16)); },
  mile()  { [523, 659, 784].forEach((f, i) => tone(f, 0.12, 'square', 0.06, i * 0.08)); },
};

/* ---------------- gameplay ---------------- */
function swatAt(px, py, now) {
  S.swats.push({ x: px, y: py, rot: -0.5 + Math.random() * 0.3, t: 0 });
  let best = null, bestD = SWAT_R;
  for (const f of S.flies) {
    if (f.state !== 'fly' && f.state !== 'landed') continue;
    const d = Math.hypot(f.x - px, f.y - py);
    if (d < bestD) { bestD = d; best = f; }
  }
  if (!best) { sfx.whiff(); return; }
  // splat it
  S.flies.splice(S.flies.indexOf(best), 1);
  burst(best.x, best.y, 10, ['#3A2A1E', '#C8342A', '#2A2320']);
  sfx.swat(); sfx.splat();
  // combo
  if (now - S.lastSwatT < COMBO_WINDOW) S.combo++;
  else S.combo = 1;
  S.lastSwatT = now;
  if (S.combo > S.bestCombo) S.bestCombo = S.combo;
  let gained = 1;
  if (S.combo > 0 && S.combo % 5 === 0) {
    gained += 5;
    showPopup('combo x' + S.combo, '+5 bonus. the swarm fears you.', best.x, best.y - 24);
    sfx.combo();
  } else if (S.combo >= 3) {
    showPopup('x' + S.combo, '', best.x, best.y - 20);
  }
  S.score += gained;
  renderScore();
  checkMilestones();
}

function checkMilestones() {
  const marks = {
    25: '25 swatted. certified swatter.',
    50: '50. the salad is safe. for now.',
    100: '100! flyswatter hall of fame.',
    200: '200. bozo is taking notes.',
  };
  for (const m of Object.keys(marks).map(Number)) {
    if (S.score >= m && !S.milestonesHit.has(m)) {
      S.milestonesHit.add(m);
      showPopup(m + ' swatted', marks[m], W / 2, 260);
      sfx.mile();
    }
  }
}

function landFly(f) {
  f.state = 'landed';
  f.landT = 0;
  S.germs++;
  burst(f.x, f.y, 6, ['#7A8B3C', '#5E6E2E']);
  showPopup('ew.', 'it touched the salad.', f.x, f.y - 26);
  sfx.land();
  renderScore();
  if (S.germs >= MAX_GERMS) gameOver();
}

function gameOver() {
  S.phase = 'over';
  S.flies = [];
  if (S.score > S.best) { S.best = S.score; store.set('salad-defense-best', String(S.best)); }
  sfx.over();
  const bestLine = S.best > 0 ? ' · best ' + S.best : '';
  showOverlay('the flies won.',
    'score ' + S.score + ' · wave ' + S.wave + ' · best combo x' + S.bestCombo + bestLine + '. the salad is ruined.',
    'run it back', startGame);
  renderScore();
}

function showPopup(text, sub, x, y) {
  S.popups.push({ text, sub, x: x == null ? W / 2 : x, y: y == null ? 300 : y, t: 0 });
  if (S.popups.length > 4) S.popups.shift();
}

function burst(x, y, n, colors) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 1 + Math.random() * 3.2;
    S.particles.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1.2,
      life: 1, color: colors[(Math.random() * colors.length) | 0],
      r: 2 + Math.random() * 3,
    });
  }
}

function update(dt, now) {
  if (S.phase === 'breather') {
    S.breatherT -= dt;
    if (S.breatherT <= 0) beginWave(S.wave + 1);
  } else if (S.phase === 'wave') {
    if (S.spawnQueue > 0) {
      S.spawnT -= dt;
      if (S.spawnT <= 0) { S.spawnT = S.spawnInterval; S.spawnQueue--; spawnFly(); }
    } else if (S.flies.length === 0) {
      S.phase = 'breather';
      S.breatherT = 2.2;
      showPopup('wave ' + S.wave + ' clear', 'wipe your hands. they are regrouping.', W / 2, 240);
      sfx.wave();
    }
  }

  for (let i = S.flies.length - 1; i >= 0; i--) {
    const f = S.flies[i];
    f.flapT += dt;
    if (f.state === 'fly') {
      const dx = BOWL.x - f.x, dy = BOWL.y - f.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d < BOWL.r * 0.55) { landFly(f); if (S.phase === 'over') return; continue; }
      // steer toward the bowl, wobble sideways like a drunk pilot
      const tx = dx / d * f.speed, ty = dy / d * f.speed;
      f.vx += (tx - f.vx) * 0.07;
      f.vy += (ty - f.vy) * 0.07;
      f.wt += dt;
      const wob = Math.sin(f.wt * 9 + f.wob) * 34;
      f.x += (f.vx + (-dy / d) * wob) * dt;
      f.y += (f.vy + (dx / d) * wob) * dt;
    } else if (f.state === 'landed') {
      f.landT += dt;
      if (f.landT > 1.6) {
        f.state = 'leaving';
        const a = Math.atan2(f.y - BOWL.y, f.x - BOWL.x) - Math.PI / 2 + (Math.random() - 0.5);
        f.vx = Math.cos(a) * 120; f.vy = Math.sin(a) * 120 - 60;
      }
    } else { // leaving
      f.x += f.vx * dt; f.y += f.vy * dt;
      if (f.x < -40 || f.x > W + 40 || f.y < -40 || f.y > H + 40) S.flies.splice(i, 1);
    }
  }

  for (let i = S.particles.length - 1; i >= 0; i--) {
    const q = S.particles[i];
    q.x += q.vx; q.y += q.vy; q.vy += 0.12; q.life -= dt / 0.7;
    if (q.life <= 0) S.particles.splice(i, 1);
  }
  for (let i = S.popups.length - 1; i >= 0; i--) {
    const p = S.popups[i];
    p.t += dt;
    if (p.t > 1.5) S.popups.splice(i, 1);
  }
  for (let i = S.swats.length - 1; i >= 0; i--) {
    S.swats[i].t += dt;
    if (S.swats[i].t > 0.22) S.swats.splice(i, 1);
  }
}

/* ---------------- input ---------------- */
function pos(e) {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H };
}
let playT = 0;
canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  if (S.phase !== 'wave' && S.phase !== 'breather') return;
  const p = pos(e);
  try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
  swatAt(p.x, p.y, playT);
}, { passive: false });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

/* ---------------- overlay / scoreboard ---------------- */
function showOverlay(title, sub, btn, fn) {
  overlayTitle.textContent = title;
  overlaySub.textContent = sub;
  overlayBtn.textContent = btn;
  S.overlayAction = fn;
  overlay.hidden = false;
}
function hideOverlay() {
  overlay.hidden = true;
  S.overlayAction = null;
}
overlayBtn.addEventListener('click', () => { if (S.overlayAction) S.overlayAction(); });

function renderScore() {
  scoreboard.innerHTML =
    '<div class="sc"><span class="sc-label">swatted</span><span class="sc-val mono">' + S.score + '</span></div>' +
    '<div class="sc"><span class="sc-label">wave</span><span class="sc-val mono">' + Math.max(1, S.wave) + '</span></div>' +
    '<div class="sc"><span class="sc-label">combo</span><span class="sc-val mono">x' + S.combo + '</span></div>' +
    '<div class="sc"><span class="sc-label">germs</span><span class="sc-val mono">' + S.germs + '/' + MAX_GERMS + '</span></div>';
}

/* ---------------- drawing ---------------- */
function drawBackground() {
  const g = ctx;
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#F8EFDA');
  sky.addColorStop(0.62, '#F5E7C8');
  sky.addColorStop(0.621, '#F5E7C8');
  sky.addColorStop(1, '#EFDDB4');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);
  // sun
  g.fillStyle = 'rgba(232,160,32,0.20)';
  g.beginPath(); g.arc(W - 64, 76, 44, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(232,160,32,0.30)';
  g.beginPath(); g.arc(W - 64, 76, 28, 0, Math.PI * 2); g.fill();
  // bunting
  g.strokeStyle = 'rgba(122,82,48,0.5)';
  g.lineWidth = 2;
  g.beginPath(); g.moveTo(-10, 34); g.quadraticCurveTo(W / 2, 66, W + 10, 30); g.stroke();
  const cols = ['#C8342A', '#E8A020', '#7A8B3C', '#2E6E8E'];
  for (let i = 0; i < 9; i++) {
    const t = (i + 0.5) / 9;
    const bx = -10 + (W + 20) * t;
    const by = 34 + (32 - 34) * 4 * t * (1 - t) + 22 * 4 * t * (1 - t) * 0 + 18 * Math.sin(t * Math.PI);
    g.fillStyle = cols[i % cols.length];
    g.beginPath();
    g.moveTo(bx - 11, by); g.lineTo(bx + 11, by); g.lineTo(bx, by + 20);
    g.closePath(); g.fill();
  }
  // picnic tablecloth
  const top = H - 190;
  const sq = 40;
  for (let ry = 0; ry * sq < 190 + sq; ry++) {
    for (let cx = 0; cx * sq < W + sq; cx++) {
      g.fillStyle = (ry + cx) % 2 ? '#C8342A' : '#FAF3E7';
      g.fillRect(cx * sq, top + ry * sq, sq, sq);
    }
  }
  g.fillStyle = 'rgba(200,52,42,0.25)';
  g.fillRect(0, top, W, 190);
  g.fillStyle = 'rgba(30,26,22,0.18)';
  g.fillRect(0, top, W, 6);
}

function drawBowl() {
  const g = ctx;
  const { x, y, r } = BOWL;
  // shadow
  g.fillStyle = 'rgba(30,26,22,0.20)';
  g.beginPath(); g.ellipse(x, y + 44, r + 16, 14, 0, 0, Math.PI * 2); g.fill();
  // bowl body
  g.fillStyle = '#A34A28';
  g.beginPath(); g.ellipse(x, y + 8, r, r * 0.52, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#8A3B1E';
  g.beginPath(); g.ellipse(x, y + 2, r, r * 0.52, 0, 0, Math.PI * 2); g.fill();
  // salad surface
  g.fillStyle = '#F3E3BC';
  g.beginPath(); g.ellipse(x, y, r * 0.86, r * 0.44, 0, 0, Math.PI * 2); g.fill();
  // potato chunks
  const chunks = 16;
  for (let i = 0; i < chunks; i++) {
    const a = (i / chunks) * Math.PI * 2 + 0.4;
    const rr = (i % 3) / 3;
    const px = x + Math.cos(a) * r * 0.62 * rr - 6 + (i % 2) * 12;
    const py = y + Math.sin(a) * r * 0.30 * rr;
    g.fillStyle = i % 2 ? '#EFD9A4' : '#F7EAC8';
    g.beginPath(); g.ellipse(px, py, 13, 8, a, 0, Math.PI * 2); g.fill();
  }
  // pimento + mustard bits
  g.fillStyle = '#C8342A';
  [[-34, -8], [22, -14], [40, 6], [-8, 12]].forEach(([dx, dy]) => {
    g.fillRect(x + dx, y + dy, 7, 5);
  });
  g.strokeStyle = '#E8A020';
  g.lineWidth = 3;
  g.beginPath(); g.moveTo(x - 44, y + 2); g.quadraticCurveTo(x, y - 16, x + 44, y + 4); g.stroke();
  // germs: the salad gets visibly grosser
  for (let i = 0; i < S.germs; i++) {
    const a = (i / MAX_GERMS) * Math.PI * 2 + 1.1;
    const gx = x + Math.cos(a) * r * 0.45;
    const gy = y + Math.sin(a) * r * 0.22;
    g.fillStyle = 'rgba(122,139,60,0.85)';
    g.beginPath(); g.ellipse(gx, gy, 11, 7, a, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(90,105,40,0.9)';
    g.beginPath(); g.ellipse(gx - 3, gy - 2, 4, 2.5, a, 0, Math.PI * 2); g.fill();
  }
  // rim highlight
  g.strokeStyle = 'rgba(250,243,231,0.35)';
  g.lineWidth = 3;
  g.beginPath(); g.ellipse(x, y + 2, r, r * 0.52, 0, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
}

function drawFly(f) {
  const g = ctx;
  g.save();
  g.translate(f.x, f.y);
  if (f.state !== 'landed') g.rotate(Math.atan2(f.vy, f.vx));
  // wings
  const flap = 0.45 + 0.55 * Math.abs(Math.sin(f.flapT * 42));
  g.fillStyle = 'rgba(238,242,250,0.8)';
  g.save();
  g.scale(1, flap);
  g.beginPath(); g.ellipse(-1, -6, 7, 3.6, -0.5, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(-1, 6, 7, 3.6, 0.5, 0, Math.PI * 2); g.fill();
  g.restore();
  // body
  g.fillStyle = '#2A2320';
  g.beginPath(); g.ellipse(0, 0, 7.5, 4.6, 0, 0, Math.PI * 2); g.fill();
  // stripes
  g.strokeStyle = 'rgba(150,140,125,0.7)';
  g.lineWidth = 1.4;
  g.beginPath(); g.moveTo(-3, -3.4); g.lineTo(-3, 3.4); g.stroke();
  g.beginPath(); g.moveTo(0.5, -4); g.lineTo(0.5, 4); g.stroke();
  // head + eyes
  g.fillStyle = '#171310';
  g.beginPath(); g.arc(6.5, 0, 3.2, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#C8342A';
  g.beginPath(); g.arc(7.4, -1.4, 1.3, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(7.4, 1.4, 1.3, 0, Math.PI * 2); g.fill();
  g.restore();
}

function drawSwatter(s) {
  const g = ctx;
  const k = 1 - s.t / 0.22;
  g.save();
  g.translate(s.x, s.y);
  g.rotate(s.rot - (1 - k) * 0.9);
  g.globalAlpha = Math.max(0, Math.min(1, k * 1.4));
  // handle
  g.strokeStyle = '#7A5230';
  g.lineWidth = 6;
  g.beginPath(); g.moveTo(0, 46); g.lineTo(0, 12); g.stroke();
  // head
  g.fillStyle = '#C8342A';
  const r = 20;
  if (g.roundRect) { g.beginPath(); g.roundRect(-r, -r - 8, r * 2, r * 2, 6); g.fill(); }
  else { g.fillRect(-r, -r - 8, r * 2, r * 2); }
  g.strokeStyle = 'rgba(250,243,231,0.7)';
  g.lineWidth = 1.5;
  for (let i = -1; i <= 1; i++) {
    g.beginPath(); g.moveTo(i * 12, -r - 8); g.lineTo(i * 12, r - 8); g.stroke();
    g.beginPath(); g.moveTo(-r, i * 12 - 8); g.lineTo(r, i * 12 - 8); g.stroke();
  }
  g.restore();
  g.globalAlpha = 1;
}

function drawScene() {
  const g = ctx;
  drawBackground();
  drawBowl();
  for (const f of S.flies) drawFly(f);
  for (const s of S.swats) drawSwatter(s);
  // particles
  for (const q of S.particles) {
    g.globalAlpha = Math.max(0, q.life);
    g.fillStyle = q.color;
    g.beginPath(); g.arc(q.x, q.y, q.r * q.life + 0.5, 0, Math.PI * 2); g.fill();
  }
  g.globalAlpha = 1;
  // popups
  for (const p of S.popups) {
    const a = p.t < 0.12 ? p.t / 0.12 : Math.max(0, 1 - (p.t - 0.12) / 1.1);
    g.globalAlpha = Math.max(0, Math.min(1, a));
    g.textAlign = 'center';
    g.fillStyle = '#1E1A16';
    g.font = '400 34px "Alfa Slab One", Georgia, serif';
    g.fillText(p.text, p.x, p.y - p.t * 30);
    if (p.sub) {
      g.font = '600 13px Inter, system-ui, sans-serif';
      g.fillStyle = '#5E5245';
      g.fillText(p.sub, p.x, p.y + 22 - p.t * 30);
    }
  }
  g.globalAlpha = 1;
}

/* ---------------- main loop ---------------- */
let last = 0;
function loop(t) {
  requestAnimationFrame(loop);
  const dtms = Math.min(50, t - (last || t));
  last = t;
  const dt = dtms / 1000;
  playT += dt;
  if (S.phase === 'wave' || S.phase === 'breather') update(dt, playT);
  // particles/popups/swats keep animating on menu/over screens too
  if (S.phase === 'menu' || S.phase === 'over') {
    for (let i = S.particles.length - 1; i >= 0; i--) {
      const q = S.particles[i];
      q.x += q.vx; q.y += q.vy; q.vy += 0.12; q.life -= dt / 0.7;
      if (q.life <= 0) S.particles.splice(i, 1);
    }
    for (let i = S.popups.length - 1; i >= 0; i--) {
      S.popups[i].t += dt;
      if (S.popups[i].t > 1.5) S.popups.splice(i, 1);
    }
  }
  drawScene();
}

/* ---------------- sizing: CSS owns display size ---------------- */
function fit() {
  const r = canvas.getBoundingClientRect();
  if (r.width < 2) return;
  const cw = Math.min(r.width, window.innerWidth || r.width);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const bw = Math.round(cw * dpr);
  const bh = Math.round(cw * (H / W) * dpr);
  if (canvas.width !== bw || canvas.height !== bh) {
    canvas.width = bw; canvas.height = bh;
    ctx.setTransform(bw / W, 0, 0, bw / W, 0, 0);
  }
}
if (window.ResizeObserver) new ResizeObserver(fit).observe(canvas);
window.addEventListener('resize', fit);
window.addEventListener('orientationchange', () => setTimeout(fit, 200));

/* ---------------- ui wiring ---------------- */
$('muteBtn').addEventListener('click', (e) => {
  S.muted = !S.muted;
  e.currentTarget.textContent = S.muted ? 'sound off' : 'sound on';
  e.currentTarget.setAttribute('aria-pressed', String(S.muted));
});

fit();
renderScore();
showOverlay('salad defense.',
  'the flies want your potato salad. tap them before they land. 6 landings ruins the batch.',
  'defend the salad', startGame);
requestAnimationFrame(loop);

})();
