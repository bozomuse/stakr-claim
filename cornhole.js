/* cornhole at the cookout — toss patties at the grill board.
   solo endless or 2-player pass-and-play. first to 21 takes the cookout.
   dependency-free canvas. logical space is 400 x 640, CSS owns display size. */
(() => {
'use strict';

const W = 400, H = 640;
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const CX = W / 2;
const BOARD = { yNear: 196, yFar: 66, halfNear: 134, halfFar: 84 };
const HOLE = { x: CX, y: 104, rx: 28, ry: 15 };
const START = { x: CX, y: 560 };
const PATTY_R = 17;
const GRAV = 0.55;
const DRAG = 0.96;
const THROW_K = 0.16;
const WIN_SCORE = 21;
const BAGS = 4;

const $ = (id) => document.getElementById(id);
const scoreboard = $('scoreboard');
const overlay = $('overlay');
const overlayTitle = $('overlayTitle');
const overlaySub = $('overlaySub');
const overlayBtn = $('overlayBtn');
const hint = $('hint');

/* ---------------- state ---------------- */
const S = {
  mode: 'solo',
  scores: [0, 0],
  round: 1,
  player: 0,
  bag: 0,
  roundScore: [0, 0],
  phase: 'aim', // aim | flying | rest | over
  patty: null,
  landed: [],      // {x, y, rot, player}
  particles: [],
  popup: null,     // {text, sub, t}
  drag: null,
  milestonesHit: new Set(),
  muted: false,
  overlayAction: null,
};

function reset(mode) {
  S.mode = mode;
  S.scores = [0, 0];
  S.round = 1;
  S.player = 0;
  S.bag = 0;
  S.roundScore = [0, 0];
  S.landed = [];
  S.particles = [];
  S.popup = null;
  S.drag = null;
  S.milestonesHit = new Set();
  hideOverlay();
  startTurn();
  renderScore();
}

function startTurn() {
  S.bag = 0;
  S.roundScore = [0, 0];
  S.landed = [];
  S.phase = 'aim';
  spawnPatty();
  renderScore();
}

function spawnPatty() {
  S.patty = {
    x: START.x, y: START.y, h: 0,
    vx: 0, vy: 0, vh: 0,
    rot: 0, vr: 0,
    flying: false,
  };
  S.drag = null;
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
  toss()  { tone(300, 0.18, 'triangle', 0.08, 0, 90); },
  thud()  { tone(130, 0.12, 'sine', 0.14, 0, 55); },
  board() { tone(180, 0.10, 'sine', 0.10, 0, 90); tone(520, 0.09, 'square', 0.05, 0.02); },
  hole()  { tone(523, 0.12, 'square', 0.07); tone(659, 0.12, 'square', 0.07, 0.1); tone(784, 0.22, 'square', 0.08, 0.2); },
  win()   { [523, 659, 784, 1046, 784, 1046].forEach((f, i) => tone(f, 0.16, 'square', 0.07, i * 0.13)); },
};

/* ---------------- physics ---------------- */
function stepPatty(p) {
  p.vx *= DRAG; p.vy *= DRAG;
  p.x += p.vx; p.y += p.vy;
  p.vh -= GRAV; p.h += p.vh;
  p.rot += p.vr;
  if (p.h <= 0) { p.h = 0; return true; } // landed
  return false;
}

function boardHalf(y) {
  const t = (BOARD.yNear - y) / (BOARD.yNear - BOARD.yFar);
  return BOARD.halfNear + (BOARD.halfFar - BOARD.halfNear) * Math.max(0, Math.min(1, t));
}
function onBoard(x, y) {
  if (y < BOARD.yFar || y > BOARD.yNear) return false;
  return Math.abs(x - CX) <= boardHalf(y);
}
function inHole(x, y) {
  const dx = (x - HOLE.x) / HOLE.rx, dy = (y - HOLE.y) / HOLE.ry;
  return dx * dx + dy * dy <= 1;
}

function resolveLanding(p) {
  let kind = 'miss', pts = 0;
  if (inHole(p.x, p.y)) { kind = 'hole'; pts = 3; }
  else if (onBoard(p.x, p.y)) { kind = 'board'; pts = 1; }
  S.scores[S.player] += pts;
  S.roundScore[S.player] += pts;

  if (kind === 'hole') {
    sfx.hole();
    burst(HOLE.x, HOLE.y - 6, 16, ['#E8A020', '#C8342A', '#FAF3E7']);
    showPopup('+3', 'CORNHOLE! straight in the grease trap');
  } else if (kind === 'board') {
    sfx.board();
    burst(p.x, p.y, 6, ['#D9C6A5', '#B08D5F']);
    S.landed.push({ x: p.x, y: p.y, rot: p.rot, player: S.player });
    showPopup('+1', 'on the board. the grill approves');
  } else {
    sfx.thud();
    showPopup('+0', p.y < BOARD.yFar ? 'too much mustard. way long.' : 'off the board. the crowd goes mild.');
  }

  S.bag++;
  S.phase = 'rest';
  S.restT = 0;
  renderScore();
  checkMilestones();
}

function checkMilestones() {
  if (S.mode !== 'solo') return;
  const total = S.scores[0];
  const marks = { 21: '21! certified grill master.', 42: '42! the tongs are yours.', 69: '69. nice.', 100: '100! bozo wants a rematch.' };
  for (const m of Object.keys(marks).map(Number)) {
    if (total >= m && !S.milestonesHit.has(m)) {
      S.milestonesHit.add(m);
      showPopup(m + ' total', marks[m]);
      sfx.win();
    }
  }
}

function showPopup(text, sub) {
  S.popup = { text, sub, t: 0 };
}

function burst(x, y, n, colors) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 1 + Math.random() * 3;
    S.particles.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1.5,
      life: 1, color: colors[(Math.random() * colors.length) | 0],
      r: 2 + Math.random() * 3,
    });
  }
}

/* aim preview: simulate the throw, draw the dots */
function predict(sx, sy, cx, cy) {
  const dx = sx - cx, dy = sy - cy;
  const p = {
    x: START.x, y: START.y, h: 0,
    vx: dx * THROW_K, vy: dy * THROW_K,
    vh: Math.max(3.5, Math.min(16, Math.hypot(dx, dy) * THROW_K * 0.62)),
    rot: 0, vr: 0,
  };
  // clamp horizontal so you can't throw it into the next cookout
  p.vx = Math.max(-9, Math.min(9, p.vx));
  const pts = [];
  for (let i = 0; i < 400; i++) {
    if (stepPatty(p)) break;
    if (i % 5 === 0) pts.push({ x: p.x, y: p.y - p.h });
  }
  const kind = inHole(p.x, p.y) ? 'hole' : (onBoard(p.x, p.y) ? 'board' : 'miss');
  return { pts, lx: p.x, ly: p.y, kind };
}

function launch(sx, sy, cx, cy) {
  const dx = sx - cx, dy = sy - cy;
  if (Math.hypot(dx, dy) < 24) { S.drag = null; return; } // too timid, no throw
  const p = S.patty;
  p.vx = Math.max(-9, Math.min(9, dx * THROW_K));
  p.vy = dy * THROW_K;
  p.vh = Math.max(3.5, Math.min(16, Math.hypot(dx, dy) * THROW_K * 0.62));
  p.vr = (Math.random() - 0.5) * 0.3;
  p.flying = true;
  S.phase = 'flying';
  S.drag = null;
  sfx.toss();
}

/* ---------------- input ---------------- */
function pos(e) {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H };
}
canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  if (S.phase !== 'aim' || !S.patty) return;
  const p = pos(e);
  S.drag = { sx: p.x, sy: p.y, cx: p.x, cy: p.y };
  canvas.setPointerCapture(e.pointerId);
}, { passive: false });
canvas.addEventListener('pointermove', (e) => {
  if (!S.drag) return;
  e.preventDefault();
  const p = pos(e);
  S.drag.cx = Math.max(0, Math.min(W, p.x));
  S.drag.cy = Math.max(0, Math.min(H, p.y));
}, { passive: false });
function endDrag(e) {
  if (!S.drag) return;
  const d = S.drag;
  launch(d.sx, d.sy, d.cx, d.cy);
}
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', () => { S.drag = null; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

/* ---------------- flow ---------------- */
function nextAfterRest() {
  if (S.bag >= BAGS) return endTurn();
  S.phase = 'aim';
  spawnPatty();
}

function endTurn() {
  if (S.mode === 'solo') {
    const gained = S.roundScore[0];
    S.round++;
    showOverlay('round ' + (S.round - 1) + ': +' + gained,
      'total ' + S.scores[0] + '. the grill stays hot.',
      'keep tossing', () => { hideOverlay(); startTurn(); });
    // auto-continue solo after a beat so the flow never stalls
    S.autoT = 1.8;
    return;
  }
  // duo: switch player or finish the round
  if (S.player === 0) {
    S.player = 1;
    showOverlay('pass the phone',
      'player 1 banked ' + S.roundScore[0] + ' this round (total ' + S.scores[0] + '). player 2, you are up.',
      'player 2: toss', () => { hideOverlay(); startTurn(); });
  } else {
    const w0 = S.scores[0] >= WIN_SCORE, w1 = S.scores[1] >= WIN_SCORE;
    if ((w0 || w1) && S.scores[0] !== S.scores[1]) {
      const w = S.scores[0] > S.scores[1] ? 0 : 1;
      S.phase = 'over';
      sfx.win();
      showOverlay('player ' + (w + 1) + ' takes the cookout!',
        'final: ' + S.scores[0] + ' to ' + S.scores[1] + ' after ' + S.round + ' rounds. loser flips the next batch.',
        'run it back', () => reset('duo'));
      return;
    }
    S.round++;
    S.player = 0;
    showOverlay('round ' + (S.round - 1) + ' in the books',
      'player 1: ' + S.scores[0] + ' · player 2: ' + S.scores[1] + '. first to ' + WIN_SCORE + '.',
      'player 1: toss', () => { hideOverlay(); startTurn(); });
  }
}

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
  S.autoT = 0;
}
overlayBtn.addEventListener('click', () => { if (S.overlayAction) S.overlayAction(); });

/* ---------------- scoreboard ---------------- */
function renderScore() {
  if (S.mode === 'solo') {
    scoreboard.innerHTML =
      '<div class="sc"><span class="sc-label">round</span><span class="sc-val mono">' + S.round + '</span></div>' +
      '<div class="sc"><span class="sc-label">this round</span><span class="sc-val mono">+' + S.roundScore[0] + '</span></div>' +
      '<div class="sc"><span class="sc-label">total</span><span class="sc-val mono">' + S.scores[0] + '</span></div>' +
      '<div class="sc"><span class="sc-label">patty</span><span class="sc-val mono">' + Math.min(S.bag + 1, BAGS) + '/' + BAGS + '</span></div>';
    hint.textContent = S.phase === 'aim' ? 'drag anywhere to aim. release to toss.' : '';
  } else {
    const turn = S.phase === 'over' ? 'game over' :
      'player ' + (S.player + 1) + ' tossing · patty ' + Math.min(S.bag + 1, BAGS) + '/' + BAGS;
    scoreboard.innerHTML =
      '<div class="sc"><span class="sc-label">player 1</span><span class="sc-val mono">' + S.scores[0] + '</span></div>' +
      '<div class="sc"><span class="sc-label">player 2</span><span class="sc-val mono">' + S.scores[1] + '</span></div>' +
      '<div class="sc"><span class="sc-label">round</span><span class="sc-val mono">' + S.round + '</span></div>' +
      '<div class="sc"><span class="sc-label">status</span><span class="sc-val small">' + turn + '</span></div>';
    hint.textContent = S.phase === 'aim' ? 'player ' + (S.player + 1) + ': drag anywhere, release to toss.' : '';
  }
}

/* ---------------- drawing ---------------- */
function scaleAt(y) {
  return 1 - (START.y - y) * 0.00095;
}

function drawBoard() {
  const g = ctx;
  // shadow
  g.fillStyle = 'rgba(30,26,22,0.12)';
  g.beginPath();
  g.ellipse(CX, BOARD.yNear + 14, BOARD.halfNear + 14, 16, 0, 0, Math.PI * 2);
  g.fill();
  // legs
  g.fillStyle = '#7A5230';
  g.fillRect(CX - BOARD.halfNear + 8, BOARD.yNear - 4, 12, 26);
  g.fillRect(CX + BOARD.halfNear - 20, BOARD.yNear - 4, 12, 26);
  // deck
  const grad = g.createLinearGradient(0, BOARD.yFar, 0, BOARD.yNear);
  grad.addColorStop(0, '#C98F54');
  grad.addColorStop(1, '#A96F3B');
  g.beginPath();
  g.moveTo(CX - BOARD.halfFar, BOARD.yFar);
  g.lineTo(CX + BOARD.halfFar, BOARD.yFar);
  g.lineTo(CX + BOARD.halfNear, BOARD.yNear);
  g.lineTo(CX - BOARD.halfNear, BOARD.yNear);
  g.closePath();
  g.fillStyle = grad;
  g.fill();
  g.lineWidth = 5;
  g.strokeStyle = '#7A5230';
  g.stroke();
  // plank lines
  g.strokeStyle = 'rgba(122,82,48,0.35)';
  g.lineWidth = 2;
  for (let i = 1; i < 4; i++) {
    const t = i / 4;
    const y = BOARD.yFar + (BOARD.yNear - BOARD.yFar) * t;
    const hw = boardHalf(y);
    g.beginPath(); g.moveTo(CX - hw, y); g.lineTo(CX + hw, y); g.stroke();
  }
  // stakr brand
  g.fillStyle = 'rgba(250,243,231,0.85)';
  g.font = '700 26px Georgia, serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('S', CX, BOARD.yNear - 34);
  g.font = '600 10px Inter, system-ui, sans-serif';
  g.fillText('STAKR & STAKR', CX, BOARD.yNear - 14);
  // hole
  g.beginPath();
  g.ellipse(HOLE.x, HOLE.y, HOLE.rx, HOLE.ry, 0, 0, Math.PI * 2);
  g.fillStyle = '#14100C';
  g.fill();
  g.lineWidth = 3;
  g.strokeStyle = 'rgba(250,243,231,0.25)';
  g.stroke();
  g.beginPath();
  g.ellipse(HOLE.x, HOLE.y - 2, HOLE.rx - 6, HOLE.ry - 5, 0, 0, Math.PI * 2);
  g.fillStyle = '#000';
  g.fill();
}

function drawPatty(x, y, r, rot, alpha) {
  const g = ctx;
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.globalAlpha = alpha == null ? 1 : alpha;
  // patty body
  const grad = g.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.2, 0, 0, r);
  grad.addColorStop(0, '#8A5A33');
  grad.addColorStop(1, '#5E3A1E');
  g.beginPath();
  if (g.roundRect) g.roundRect(-r, -r * 0.82, r * 2, r * 1.64, r * 0.5);
  else g.arc(0, 0, r, 0, Math.PI * 2);
  g.fillStyle = grad;
  g.fill();
  g.lineWidth = 2.5;
  g.strokeStyle = '#3E2412';
  g.stroke();
  // grill marks
  g.strokeStyle = 'rgba(30,16,8,0.55)';
  g.lineWidth = 2.5;
  for (let i = -1; i <= 1; i++) {
    g.beginPath();
    g.moveTo(-r * 0.7, i * r * 0.42 - r * 0.18);
    g.lineTo(r * 0.7, i * r * 0.42 + r * 0.18);
    g.stroke();
  }
  g.restore();
}

function drawScene() {
  const g = ctx;
  // sky to grass
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#F7EEDC');
  sky.addColorStop(0.45, '#F3E8D2');
  sky.addColorStop(0.451, '#7FA35A');
  sky.addColorStop(1, '#5E8445');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);
  // grass blades
  g.strokeStyle = 'rgba(46,74,32,0.35)';
  g.lineWidth = 2;
  for (let i = 0; i < 40; i++) {
    const x = (i * 97) % W, y = 300 + ((i * 53) % 320);
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + 3, y - 9); g.stroke();
  }
  // toss line
  g.strokeStyle = 'rgba(250,243,231,0.7)';
  g.lineWidth = 3;
  g.setLineDash([10, 8]);
  g.beginPath(); g.moveTo(40, START.y + 44); g.lineTo(W - 40, START.y + 44); g.stroke();
  g.setLineDash([]);
  g.fillStyle = 'rgba(250,243,231,0.75)';
  g.font = '600 11px Inter, system-ui, sans-serif';
  g.textAlign = 'center';
  g.fillText('toss line', CX, START.y + 62);

  drawBoard();

  // landed patties
  for (const l of S.landed) {
    const s = scaleAt(l.y);
    g.fillStyle = 'rgba(30,26,22,0.18)';
    g.beginPath();
    g.ellipse(l.x, l.y + 4, PATTY_R * s, PATTY_R * s * 0.4, 0, 0, Math.PI * 2);
    g.fill();
    drawPatty(l.x, l.y, PATTY_R * s, l.rot, 1);
  }

  // live patty
  const p = S.patty;
  if (p && (S.phase === 'aim' || S.phase === 'flying')) {
    let dx = 0, dy = 0;
    if (S.phase === 'aim' && S.drag) { dx = S.drag.sx - S.drag.cx; dy = S.drag.sy - S.drag.cy; }
    const px = p.x + dx * 0.35, py = p.y + dy * 0.35; // patty pulls back with the drag
    const s = scaleAt(p.y);
    // shadow
    const shScale = Math.max(0.25, 1 - p.h / 380);
    g.fillStyle = 'rgba(30,26,22,' + (0.28 * shScale).toFixed(2) + ')';
    g.beginPath();
    g.ellipse(p.x, p.y + 5, PATTY_R * s * shScale, PATTY_R * s * 0.45 * shScale, 0, 0, Math.PI * 2);
    g.fill();
    drawPatty(px, py - p.h, PATTY_R * s, p.rot, 1);
  }

  // particles
  for (const q of S.particles) {
    g.globalAlpha = Math.max(0, q.life);
    g.fillStyle = q.color;
    g.beginPath(); g.arc(q.x, q.y, q.r, 0, Math.PI * 2); g.fill();
  }
  g.globalAlpha = 1;

  // aim preview
  if (S.phase === 'aim' && S.drag) {
    const d = S.drag;
    if (Math.hypot(d.sx - d.cx, d.sy - d.cy) > 24) {
      const pr = predict(d.sx, d.sy, d.cx, d.cy);
      g.fillStyle = 'rgba(30,26,22,0.4)';
      for (const pt of pr.pts) {
        g.beginPath(); g.arc(pt.x, pt.y, 2.5, 0, Math.PI * 2); g.fill();
      }
      const col = pr.kind === 'hole' ? '#E8A020' : (pr.kind === 'board' ? '#FAF3E7' : 'rgba(30,26,22,0.45)');
      g.strokeStyle = col; g.lineWidth = 3;
      g.beginPath(); g.arc(pr.lx, pr.ly, 12, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.moveTo(pr.lx - 18, pr.ly); g.lineTo(pr.lx + 18, pr.ly);
      g.moveTo(pr.lx, pr.ly - 18); g.lineTo(pr.lx, pr.ly + 18); g.stroke();
    }
    // slingshot band
    g.strokeStyle = 'rgba(200,52,42,0.6)';
    g.lineWidth = 4;
    g.beginPath(); g.moveTo(d.sx, d.sy); g.lineTo(d.cx, d.cy); g.stroke();
  }

  // popup
  if (S.popup) {
    const t = S.popup.t;
    const a = t < 0.15 ? t / 0.15 : Math.max(0, 1 - (t - 0.15) / 1.0);
    g.globalAlpha = Math.max(0, Math.min(1, a));
    g.textAlign = 'center';
    g.fillStyle = '#1E1A16';
    g.font = '400 44px "Alfa Slab One", Georgia, serif';
    g.fillText(S.popup.text, CX, 300 - t * 34);
    g.font = '600 14px Inter, system-ui, sans-serif';
    g.fillStyle = '#5E5245';
    g.fillText(S.popup.sub, CX, 328 - t * 34);
    g.globalAlpha = 1;
  }
}

/* ---------------- main loop ---------------- */
let last = 0;
function loop(t) {
  requestAnimationFrame(loop);
  const dt = Math.min(50, t - (last || t));
  last = t;
  const steps = Math.max(1, Math.min(3, Math.round(dt / 16.67)));

  if (S.phase === 'flying' && S.patty && S.patty.flying) {
    for (let i = 0; i < steps; i++) {
      if (stepPatty(S.patty)) { resolveLanding(S.patty); break; }
    }
  }
  if (S.phase === 'rest') {
    S.restT += dt / 1000;
    if (S.restT > 0.9) nextAfterRest();
  }
  if (S.autoT > 0 && !overlay.hidden) {
    S.autoT -= dt / 1000;
    if (S.autoT <= 0 && S.overlayAction) S.overlayAction();
  }
  // particles
  for (let i = S.particles.length - 1; i >= 0; i--) {
    const q = S.particles[i];
    q.x += q.vx; q.y += q.vy; q.vy += 0.12; q.life -= dt / 700;
    if (q.life <= 0) S.particles.splice(i, 1);
  }
  if (S.popup) {
    S.popup.t += dt / 1000;
    if (S.popup.t > 1.4) S.popup = null;
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
$('soloBtn').addEventListener('click', () => {
  $('soloBtn').className = 'btn btn-ketchup';
  $('duoBtn').className = 'btn';
  reset('solo');
});
$('duoBtn').addEventListener('click', () => {
  $('duoBtn').className = 'btn btn-ketchup';
  $('soloBtn').className = 'btn';
  reset('duo');
});
$('muteBtn').addEventListener('click', (e) => {
  S.muted = !S.muted;
  e.currentTarget.textContent = S.muted ? 'sound off' : 'sound on';
  e.currentTarget.setAttribute('aria-pressed', String(S.muted));
});

fit();
reset('solo');
requestAnimationFrame(loop);

})();
