/* stakr & stakr — claim window logic. no dependencies, no build step. */
'use strict';

const CONFIG = {
  chainIdHex: '0x2105', // Base
  distributor: '0x7b896a892C052C5243Dde20b54a4654e51A3A952', // placeholder until launch
  bnkr: '0x22af33fe49fd1fa80c7149773dde5890d3c76f3b',
  bnkrDecimals: 18,
  stakr: '0x9319f1a40b284c77fEa9808d1DDD71CC0ec05Ba3',
  kicker: '0xdbc07f099d169e9BE01249e4E1eeCD01f7ad815b',
  kickDeployBlock: 51849243,
  proofsBase: './proofs/',
  demo: false, // flip to false at launch; enables tx preview instead of signing
};

// selectors, verified against StakrDistributor.sol
const SEL = {
  claim: '0xae0b51df',
  nextEpochId: '0xd28147ee',
  epochs: '0xc6b61e4c',
  hasClaimed: '0x873f6f9e',
};

/* ---------------- abi helpers ---------------- */
const u256 = (n) => BigInt(n).toString(16).padStart(64, '0');
const encAddr = (a) => a.toLowerCase().replace('0x', '').padStart(64, '0');
const encB32 = (h) => h.toLowerCase().replace('0x', '').padStart(64, '0');

function encodeClaim(epochId, amount, proof) {
  return (
    SEL.claim + u256(epochId) + u256(amount) + u256(96) +
    u256(proof.length) + proof.map(encB32).join('')
  );
}
function splitWords(hex) {
  const h = hex.replace('0x', '');
  const out = [];
  for (let i = 0; i < h.length; i += 64) out.push('0x' + h.slice(i, i + 64));
  return out;
}
function fmtBnkr(weiStr) {
  const v = BigInt(weiStr);
  const cents = (v * 100n) / 10n ** 18n;
  const int = cents / 100n;
  const frac = (cents % 100n).toString().padStart(2, '0');
  return int.toLocaleString('en-US') + '.' + frac;
}
const trunc = (h, n = 10) => h.slice(0, n) + '…' + h.slice(-6);

/* ---------------- state ---------------- */
let account = null;
let epochsData = [];

/* ---------------- proofs ---------------- */
async function loadProofs() {
  const idxRes = await fetch(CONFIG.proofsBase + 'epochs.json');
  if (!idxRes.ok) return [];
  const idx = await idxRes.json();
  const out = [];
  for (const e of idx.epochs || []) {
    const r = await fetch(CONFIG.proofsBase + e.file);
    if (!r.ok) continue;
    const data = await r.json();
    data._meta = e;
    // normalize claim keys for case-insensitive lookup
    data._claimsLower = {};
    for (const [k, v] of Object.entries(data.claims || {})) {
      data._claimsLower[k.toLowerCase()] = v;
    }
    out.push(data);
  }
  return out;
}

/* ---------------- wallet ---------------- */
async function connect() {
  if (!window.ethereum) {
    setNote('no wallet found in this browser. the grill needs one to serve you.');
    return;
  }
  try {
    if (!CONFIG.demo) {
      const chainId = await window.ethereum.request({ method: 'eth_chainId' });
      if (chainId !== CONFIG.chainIdHex) {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: CONFIG.chainIdHex }],
        });
      }
    }
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    account = accounts[0];
    renderWallet();
    await renderClaims();
  } catch (err) {
    setNote('connection refused. the window stays open whenever you are ready.');
  }
}

async function ethCall(to, data) {
  return window.ethereum.request({
    method: 'eth_call',
    params: [{ to, data }, 'latest'],
  });
}

async function onChainClaimed(epochId, holder) {
  if (CONFIG.demo || !window.ethereum) return false;
  try {
    const res = await ethCall(CONFIG.distributor, SEL.hasClaimed + u256(epochId) + encAddr(holder));
    return BigInt(res) === 1n;
  } catch {
    return false;
  }
}

/* Claim timing: the 24h CLAIM_DELAY means claims open 1 day after the root is
   published. Read claimStart/claimDeadline from the contract (live) or from
   the manifest (demo). Returns {claimStart, claimDeadline} as unix seconds,
   or null when unknown (demo manifests without timing). */
async function epochTiming(ep) {
  if (CONFIG.demo) {
    if (ep.claimStart) return { claimStart: Number(ep.claimStart), claimDeadline: Number(ep.claimDeadline || 0) };
    return null;
  }
  if (!window.ethereum || !CONFIG.distributor) return null;
  try {
    const res = await ethCall(CONFIG.distributor, SEL.epochs + u256(ep.epochId));
    const words = splitWords(res);
    if (words.length < 6) return null;
    return {
      claimStart: Number(BigInt('0x' + words[3])),
      claimDeadline: Number(BigInt('0x' + words[4])),
    };
  } catch {
    return null;
  }
}

function fmtCountdown(targetSec) {
  const nowSec = Math.floor(Date.now() / 1000);
  let d = Math.max(0, targetSec - nowSec);
  const days = Math.floor(d / 86400); d -= days * 86400;
  const hrs = Math.floor(d / 3600); d -= hrs * 3600;
  const mins = Math.floor(d / 60);
  if (days > 0) return `${days}d ${hrs}h ${mins}m`;
  if (hrs > 0) return `${hrs}h ${mins}m`;
  return `${mins}m`;
}

/* ---------------- rendering ---------------- */
function renderWallet() {
  const line = document.getElementById('walletLine');
  if (!account) return;
  line.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'wallet-addr';
  const pill = document.createElement('span');
  pill.className = 'addr-pill';
  pill.textContent = trunc(account, 12);
  const copy = document.createElement('button');
  copy.className = 'copy-btn';
  copy.type = 'button';
  copy.textContent = 'copy';
  copy.setAttribute('aria-label', 'copy wallet address');
  copy.addEventListener('click', () => copyText(account, copy));
  const label = document.createElement('span');
  label.className = 'muted';
  label.textContent = 'on the tray:';
  wrap.append(label, pill, copy);
  line.appendChild(wrap);
}

async function renderClaims() {
  const rows = document.getElementById('epochRows');
  const totalBox = document.getElementById('receiptTotal');
  const claimAll = document.getElementById('claimAllBtn');
  rows.innerHTML = '';
  rows.hidden = false;
  totalBox.hidden = false;

  let total = 0n;
  let anyClaimable = false;
  const viewing = account ? account.toLowerCase() : null;

  for (const ep of epochsData) {
    // no wallet: demo shows sample rows; live shows a connect hint per epoch
    const sampleEntries = !viewing && CONFIG.demo
      ? Object.entries(ep._claimsLower || {})
      : [];
    const entries = viewing
      ? [[viewing, ep._claimsLower[viewing] || null]]
      : sampleEntries.length
        ? sampleEntries.map(([h, c]) => [h, c])
        : [[null, null]];

    for (const [holderKey, claim] of entries) {
      const li = document.createElement('li');
      const meta = document.createElement('div');
      meta.className = 'er-meta';
      const title = document.createElement('strong');
      title.textContent = 'epoch ' + ep.epochId + (ep._meta && ep._meta.demo ? ' (demo)' : '');
      meta.appendChild(title);
      const sub = document.createElement('span');
      sub.className = 'muted';

      const right = document.createElement('div');
      right.className = 'er-amount';

      if (!claim) {
        sub.textContent = holderKey
          ? 'nothing on your tray this week.'
          : 'connect a wallet to see what\'s on your tray.';
        right.innerHTML = '<small>0.00 bnkr</small>';
      } else {
        const amount = BigInt(claim.amount);
        const claimed = viewing ? await onChainClaimed(ep.epochId, account) : false;
        const timing = await epochTiming(ep);
        const nowSec = Math.floor(Date.now() / 1000);
        const notOpen = timing && timing.claimStart > nowSec;
        const expired = timing && timing.claimDeadline > 0 && nowSec > timing.claimDeadline;
        sub.textContent = viewing
          ? 'your share of ' + fmtBnkr(ep.totalAllocated) + ' bnkr served.'
          : 'sample serving for ' + trunc(holderKey, 10) + ' — connect to see yours.';
        const amt = document.createElement('span');
        amt.textContent = fmtBnkr(claim.amount);
        const unit = document.createElement('small');
        unit.textContent = 'bnkr';
        right.append(amt, unit);
        if (claimed) {
          const stamp = document.createElement('span');
          stamp.className = 'stamp';
          stamp.textContent = 'PAID';
          right.appendChild(stamp);
        } else if (expired) {
          const stamp = document.createElement('span');
          stamp.className = 'stamp';
          stamp.textContent = 'EXPIRED';
          right.appendChild(stamp);
        } else if (notOpen) {
          const wait = document.createElement('span');
          wait.className = 'muted';
          wait.textContent = 'claims open in ' + fmtCountdown(timing.claimStart);
          wait.title = 'the 24h safety delay: claims open one day after the root is published.';
          right.appendChild(wait);
        } else {
          const btn = document.createElement('button');
          btn.className = 'btn btn-small';
          btn.type = 'button';
          btn.textContent = viewing ? 'claim' : 'preview';
          btn.setAttribute('aria-label', (viewing ? 'claim ' : 'preview claim of ') + fmtBnkr(claim.amount) + ' bnkr from epoch ' + ep.epochId);
          btn.addEventListener('click', () => {
            if (viewing) claimOne(ep, claim);
            else openPreview(CONFIG.distributor, claim.amount,
              encodeClaim(ep.epochId, claim.amount, claim.proof));
          });
          right.appendChild(btn);
          if (viewing) { total += amount; anyClaimable = true; }
        }
      }
      meta.appendChild(sub);
      li.append(meta, right);
      rows.appendChild(li);
    }
  }

  if (!epochsData.length) {
    const li = document.createElement('li');
    li.innerHTML = '<div class="er-meta"><strong>no epochs yet</strong><span class="muted">the grill hasn\'t served its first week.</span></div>';
    rows.appendChild(li);
  }

  document.getElementById('totalClaimable').textContent = fmtBnkr(total.toString()) + ' bnkr';
  claimAll.hidden = false;
  claimAll.disabled = !anyClaimable;
  claimAll.onclick = claimAllFn;
}

function renderEpochTable() {
  const body = document.getElementById('epochBody');
  body.innerHTML = '';
  if (!epochsData.length) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td colspan="4" class="muted">the grill hasn\'t served its first epoch yet.</td>';
    body.appendChild(tr);
    return;
  }
  for (const ep of epochsData) {
    const tr = document.createElement('tr');
    const holders = Object.keys(ep.claims || {}).length;

    const tdId = document.createElement('td');
    tdId.textContent = '#' + ep.epochId + (ep._meta && ep._meta.demo ? ' (demo)' : '');
    const tdServed = document.createElement('td');
    tdServed.className = 'mono';
    tdServed.textContent = fmtBnkr(ep.totalAllocated) + ' bnkr';
    const tdHolders = document.createElement('td');
    tdHolders.className = 'mono';
    tdHolders.textContent = holders;
    const tdRoot = document.createElement('td');
    tdRoot.className = 'mono';
    const cell = document.createElement('span');
    cell.className = 'root-cell';
    const rootTxt = document.createElement('span');
    rootTxt.textContent = trunc(ep.root, 10);
    rootTxt.title = ep.root;
    const copy = document.createElement('button');
    copy.className = 'copy-btn';
    copy.type = 'button';
    copy.textContent = 'copy';
    copy.setAttribute('aria-label', 'copy payout root for epoch ' + ep.epochId);
    copy.addEventListener('click', () => copyText(ep.root, copy));
    cell.append(rootTxt, copy);
    tdRoot.appendChild(cell);

    tr.append(tdId, tdServed, tdHolders, tdRoot);
    body.appendChild(tr);
  }
  document.getElementById('receiptNo').textContent =
    'order #' + String(epochsData.length).padStart(3, '0');
}

function setNote(msg) {
  const n = document.getElementById('receiptNote');
  n.hidden = false;
  n.textContent = msg;
}

async function copyText(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  const old = btn.textContent;
  btn.textContent = 'copied';
  setTimeout(() => { btn.textContent = old; }, 1500);
}

/* ---------------- claiming ---------------- */
function claimOne(ep, claim) {
  const data = encodeClaim(ep.epochId, claim.amount, claim.proof);
  if (CONFIG.demo) {
    openPreview(CONFIG.distributor, claim.amount, data);
    return;
  }
  sendClaim(ep.epochId, data);
}

async function claimAllFn() {
  const nowSec = Math.floor(Date.now() / 1000);
  for (const ep of epochsData) {
    const claim = account ? ep._claimsLower[account.toLowerCase()] : null;
    if (!claim) continue;
    if (await onChainClaimed(ep.epochId, account)) continue;
    const timing = await epochTiming(ep);
    if (timing && (timing.claimStart > nowSec ||
        (timing.claimDeadline > 0 && nowSec > timing.claimDeadline))) continue; // not open yet or expired
    if (CONFIG.demo) {
      openPreview(CONFIG.distributor, claim.amount, encodeClaim(ep.epochId, claim.amount, claim.proof));
      return; // one preview at a time in demo
    }
    await sendClaim(ep.epochId, encodeClaim(ep.epochId, claim.amount, claim.proof));
  }
  await renderClaims();
}

async function sendClaim(epochId, data) {
  try {
    const txHash = await window.ethereum.request({
      method: 'eth_sendTransaction',
      params: [{ from: account, to: CONFIG.distributor, data }],
    });
    setNote('order sent — waiting on the kitchen (' + trunc(txHash, 10) + ')…');
    await waitForReceipt(txHash);
    setNote('served. check your wallet for the $bnkr.');
    await renderClaims();
  } catch (err) {
    setNote('that one didn\'t go through. no harm — try again when ready.');
  }
}

function waitForReceipt(txHash) {
  return new Promise((resolve) => {
    const t = setInterval(async () => {
      try {
        const r = await window.ethereum.request({
          method: 'eth_getTransactionReceipt',
          params: [txHash],
        });
        if (r && r.blockNumber) { clearInterval(t); resolve(r); }
      } catch { /* keep waiting */ }
    }, 2500);
    setTimeout(() => { clearInterval(t); resolve(null); }, 120000);
  });
}

function openPreview(to, amount, data) {
  document.getElementById('txTo').textContent = to;
  document.getElementById('txAmount').textContent = fmtBnkr(amount.toString()) + ' bnkr';
  const dlg = document.getElementById('txDialog');
  if (typeof dlg.showModal === 'function') dlg.showModal();
}

/* ---------------- grill smoke (price-reactive) ---------------- */
const GRILL_REF_PRICE = 1.06e-7; // ~launch price in usd per stakr (dev buy); smoke scales vs this
let smokeLevel = 1;

function grillSmokeLevel(priceUsd) {
  if (!priceUsd || priceUsd <= 0) return 1;
  return Math.min(3, Math.max(0.15, priceUsd / GRILL_REF_PRICE));
}

/* steak doneness stages: the grill's heat as the price climbs vs launch */
function grillStage(mult) {
  if (mult < 0.75) return 'blue rare';
  if (mult < 1) return 'rare';
  if (mult < 2) return 'medium rare';
  if (mult < 4) return 'medium';
  if (mult < 8) return 'medium well';
  return 'well done';
}

async function fetchStakrPrice() {
  const urls = [
    'https://api.geckoterminal.com/api/v2/networks/base/tokens/0x9319f1a40b284c77fEa9808d1DDD71CC0ec05Ba3',
    'https://api.dexscreener.com/latest/dex/tokens/0x9319f1a40b284c77fEa9808d1DDD71CC0ec05Ba3',
  ];
  for (const u of urls) {
    try {
      const r = await fetch(u);
      if (!r.ok) continue;
      const j = await r.json();
      const p = parseFloat(j && j.data && j.data.attributes && j.data.attributes.price_usd);
      if (p > 0) return p;
      const q = parseFloat(j && j.pairs && j.pairs[0] && j.pairs[0].priceUsd);
      if (q > 0) return q;
    } catch { /* try next source */ }
  }
  return 0;
}

function initGrill() {
  const canvas = document.getElementById('smokeCanvas');
  const img = document.getElementById('grillImg');
  const label = document.getElementById('stakrPrice');
  if (!canvas || !img) return;
  const ctx = canvas.getContext('2d');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const parts = [];
  let spawnAcc = 0, last = 0;

  function sizeCanvas() {
    const r = img.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
  }

  function spawn() {
    const w = canvas.width, h = canvas.height;
    const life = 2.6 + Math.random() * 2.2;
    parts.push({
      x: w * (0.28 + Math.random() * 0.34),
      y: h * (0.72 + Math.random() * 0.06),
      vx: (Math.random() - 0.5) * w * 0.02,
      vy: -h * (0.10 + Math.random() * 0.08),
      r: w * (0.015 + Math.random() * 0.02),
      grow: w * 0.022,
      life: 0, maxLife: life,
      wob: Math.random() * Math.PI * 2,
    });
  }

  function frame(dt) {
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const maxParts = Math.round(110 * smokeLevel);
    spawnAcc += 16 * smokeLevel * dt;
    if (spawnAcc > 4) spawnAcc = 4;
    while (spawnAcc >= 1 && parts.length < maxParts) { spawn(); spawnAcc -= 1; }
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life += dt;
      if (p.life >= p.maxLife) { parts.splice(i, 1); continue; }
      const t = p.life / p.maxLife;
      p.wob += dt * 2;
      p.x += (p.vx + Math.sin(p.wob) * w * 0.008) * dt;
      p.y += p.vy * dt;
      const rad = p.r + p.grow * t;
      const alpha = 0.34 * Math.min(1, smokeLevel) * (1 - t) * Math.min(1, t * 6);
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rad);
      g.addColorStop(0, 'rgba(235,235,240,' + alpha.toFixed(3) + ')');
      g.addColorStop(1, 'rgba(235,235,240,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, rad, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function loop(ts) {
    const dt = Math.min(0.05, (ts - last) / 1000 || 0.016);
    last = ts;
    frame(dt);
    requestAnimationFrame(loop);
  }

  async function refreshPrice() {
    const p = await fetchStakrPrice();
    if (p > 0) {
      smokeLevel = grillSmokeLevel(p);
      const mult = p / GRILL_REF_PRICE;
      if (label) label.textContent = '$' + p.toPrecision(3) + '  ·  ' + grillStage(mult) + ' (' + mult.toFixed(1) + '× launch heat)';
    } else if (label && label.dataset.fed !== '1') {
      label.dataset.fed = '1';
      label.textContent = 'price feed napping — grill at medium heat';
    }
  }

  function start() {
    sizeCanvas();
    if (!reduced) requestAnimationFrame(loop);
    refreshPrice();
    setInterval(refreshPrice, 5 * 60 * 1000);
  }

  if (img.complete && img.naturalWidth) start();
  else img.addEventListener('load', start, { once: true });
  window.addEventListener('resize', sizeCanvas);
}

/* ---------------- copy contract pill ---------------- */
const STAKR_ADDR = '0x9319f1a40b284c77fEa9808d1DDD71CC0ec05Ba3';

function initContractPill() {
  const pill = document.getElementById('contractPill');
  if (!pill) return;
  const copyEl = document.getElementById('pillCopy');
  async function copy() {
    try {
      await navigator.clipboard.writeText(STAKR_ADDR);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = STAKR_ADDR;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch { /* give up gracefully */ }
      ta.remove();
    }
    if (copyEl) {
      copyEl.textContent = 'copied ✓';
      setTimeout(() => { copyEl.textContent = 'copy'; }, 1600);
    }
  }
  pill.addEventListener('click', copy);
  pill.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); copy(); }
  });
}

/* ---------------- init ---------------- */
function buildTicker() {
  const phrase = 'hold stakr <b>•</b> earn bnkr <b>•</b> stake bnkr <b>•</b> mfer <b>•</b> ';
  document.getElementById('tickerInner').innerHTML = phrase.repeat(8);
}


/* ---------------- kick the grill ----------------
   Burn >= 1M $STAKR through the kicker contract with a message; the site
   reads Kick events and shows them in the speech bubble above bozo's head. */
const KICK_TOPIC = '0x43fe7ae845cc4c446c011530cec63504d3d3c08d2ddc95df79ba025293ac756e';
const KICK_RPC = 'https://mainnet.base.org';
const KICK_MIN = 1000000n * 10n ** 18n;
// public RPC caps eth_getLogs at 2,000 blocks per call — chunk below that
const KICK_LOG_CHUNK = 1800;
const KICK_CACHE_KEY = 'stakr-kicks-v1';
const SEL_APPROVE = '0x095ea7b3';
const SEL_KICK = '0xaa53276b'; // kick(uint256,string)
const HIDDEN_KICKS = []; // tx hashes (lowercase) bounced from the bubble
const KICK_DENY = [
  'http://', 'https://', 'www.', '.xyz/', '.io/', '.com/',
  'nigger', 'nigga', 'faggot', 'retard', 'kike', 'chink', 'spic',
];

let kicks = [];

function decodeKick(log) {
  try {
    const kicker = '0x' + log.topics[1].slice(-40);
    const data = log.data.slice(2);
    const amount = BigInt('0x' + data.slice(0, 64));
    const msgOff = parseInt(data.slice(64, 128), 16) * 2;
    const msgLen = parseInt(data.slice(msgOff, msgOff + 64), 16);
    const msgHex = data.slice(msgOff + 64, msgOff + 64 + msgLen * 2);
    const bytes = new Uint8Array(msgHex.match(/../g).map((h) => parseInt(h, 16)));
    const message = new TextDecoder().decode(bytes);
    return { kicker, amount, message, tx: (log.transactionHash || '').toLowerCase() };
  } catch {
    return null;
  }
}

function kickAllowed(k) {
  if (!k || !k.message.trim()) return false;
  if (HIDDEN_KICKS.includes(k.tx)) return false;
  const low = k.message.toLowerCase();
  return !KICK_DENY.some((d) => low.includes(d));
}

async function rpcCall(method, params) {
  const res = await fetch(KICK_RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const j = await res.json();
  if (j.error) throw new Error((j.error && j.error.message) || method + ' failed');
  return j.result;
}

async function fetchKickLogs(from, to) {
  return (await rpcCall('eth_getLogs', [{
    address: CONFIG.kicker,
    fromBlock: '0x' + from.toString(16),
    toBlock: '0x' + to.toString(16),
    topics: [KICK_TOPIC],
  }])) || [];
}

function loadKickCache() {
  try {
    const c = JSON.parse(localStorage.getItem(KICK_CACHE_KEY) || 'null');
    if (c && Array.isArray(c.logs) && Number.isFinite(c.lastBlock)) return c;
  } catch { /* corrupted cache — rescan */ }
  return null;
}

function saveKickCache(logs, lastBlock) {
  try {
    localStorage.setItem(KICK_CACHE_KEY, JSON.stringify({ logs, lastBlock }));
  } catch { /* storage full/blocked — feed still works, just rescans */ }
}

async function fetchKicks() {
  try {
    const latest = parseInt(await rpcCall('eth_blockNumber', []), 16);
    const cache = loadKickCache();
    let logs, from;
    if (cache && cache.lastBlock >= CONFIG.kickDeployBlock) {
      logs = cache.logs;
      from = cache.lastBlock + 1;
    } else {
      logs = [];
      from = CONFIG.kickDeployBlock;
    }
    if (from <= latest) {
      for (let s = from; s <= latest; s += KICK_LOG_CHUNK) {
        const e = Math.min(s + KICK_LOG_CHUNK - 1, latest);
        logs.push(...await fetchKickLogs(s, e));
      }
      saveKickCache(logs, latest);
    }
    return logs.map(decodeKick).filter(kickAllowed);
  } catch {
    return null; // failure signal — caller keeps the last good feed
  }
}

function fmtKickAmount(wei) {
  const n = Number(wei) / 1e18;
  if (n >= 1e6) {
    const m = n / 1e6;
    return (m >= 100 ? Math.round(m) : m.toFixed(1).replace(/\.0$/, '')) + 'M';
  }
  return Math.round(n).toLocaleString('en-US');
}

function shortKickAddr(a) {
  return a.slice(0, 6) + '…' + a.slice(-4);
}

function grillMaster() {
  if (!kicks.length) return null;
  const totals = new Map(); // kicker -> { total, latest }
  for (const k of kicks) {
    const e = totals.get(k.kicker) || { total: 0n, latest: null };
    e.total += k.amount;
    e.latest = k; // kicks arrive oldest-first, so this ends as their newest
    totals.set(k.kicker, e);
  }
  let master = null;
  for (const [addr, e] of totals) {
    // strict > : on a tie the earlier burner keeps the crown
    if (!master || e.total > master.total) master = { addr, total: e.total, latest: e.latest };
  }
  return master;
}

let lastMasterSig = '';

function renderRecentKicks() {
  const el = document.getElementById('recentKicks');
  if (!el) return;
  const recent = kicks.slice(-5).reverse();
  el.innerHTML = '';
  if (!recent.length) return;
  const title = document.createElement('div');
  title.className = 'recent-kicks-title';
  title.textContent = 'recent burns';
  el.appendChild(title);
  for (const k of recent) {
    const row = document.createElement('div');
    row.innerHTML = '';
    const q = document.createElement('span');
    q.textContent = '\u201c' + k.message + '\u201d';
    const m = document.createElement('span');
    m.className = 'muted';
    m.textContent = ' — ' + shortKickAddr(k.kicker) + ' · ' + fmtKickAmount(k.amount);
    row.appendChild(q);
    row.appendChild(m);
    el.appendChild(row);
  }
}

function renderKick() {
  const bubble = document.getElementById('kickBubble');
  const msg = document.getElementById('kickMsg');
  const meta = document.getElementById('kickMeta');
  if (!bubble || !msg || !meta) return;
  const master = grillMaster();
  const sig = master ? master.addr + ':' + master.latest.tx : 'none';
  renderRecentKicks();
  if (sig === lastMasterSig) return; // crown hasn't moved — leave the bubble alone
  lastMasterSig = sig;
  bubble.style.opacity = '0';
  setTimeout(() => {
    const grillMsg = document.getElementById('grillBubbleMsg');
    if (!master) {
      msg.textContent = 'Tell a mfer how you want your steak cooked?';
      meta.textContent = 'no kicks yet · min 1M $stakr';
      if (grillMsg) grillMsg.textContent = 'did you burn the stakr?';
    } else {
      msg.textContent = '\u201c' + master.latest.message + '\u201d';
      meta.textContent = '\uD83D\uDC51 grill master · ' + shortKickAddr(master.addr) +
        ' · burned ' + fmtKickAmount(master.total) + ' $stakr total';
      if (grillMsg) grillMsg.textContent = master.latest.message;
    }
    bubble.style.opacity = '1';
  }, 400);
}

function encString(s) {
  const bytes = new TextEncoder().encode(s);
  const len = u256(bytes.length);
  let hex = '';
  bytes.forEach((b) => { hex += b.toString(16).padStart(2, '0'); });
  return len + hex.padEnd(Math.ceil(hex.length / 64) * 64, '0');
}

function setKickStatus(t) {
  const el = document.getElementById('kickStatus');
  if (el) el.textContent = t;
}

async function kickAllowance(holder) {
  // allowance(address,address): 0xdd62ed3e
  const data = '0xdd62ed3e' + encAddr(holder) + encAddr(CONFIG.kicker);
  const res = await ethCall(CONFIG.stakr, data);
  return BigInt(res);
}

async function initKicker() {
  kicks = (await fetchKicks()) || [];
  renderKick();
  setInterval(async () => {
    // refetch every minute — the crown moves when someone out-burns the master
    const fresh = await fetchKicks();
    if (!fresh) return; // rpc hiccup — keep the last good feed
    if (fresh.length !== kicks.length ||
        (fresh.length && fresh[fresh.length - 1].tx !== kicks[kicks.length - 1].tx)) {
      kicks = fresh;
    }
    renderKick();
  }, 60000);

  const btnC = document.getElementById('kickConnect');
  const btnA = document.getElementById('kickApprove');
  const btnK = document.getElementById('kickSend');
  if (btnC) btnC.addEventListener('click', async () => {
    await connect();
    setKickStatus(account ? 'wallet connected: ' + shortKickAddr(account) : 'connection refused.');
  });
  if (btnA) btnA.addEventListener('click', async () => {
    if (!account) { setKickStatus('connect your wallet first.'); return; }
    const amtRaw = document.getElementById('kickAmount').value;
    const amount = BigInt(Math.floor(Number(amtRaw) || 0)) * 10n ** 18n;
    if (amount < KICK_MIN) { setKickStatus('minimum kick is 1,000,000 $stakr.'); return; }
    try {
      setKickStatus('sending approval…');
      const data = SEL_APPROVE + encAddr(CONFIG.kicker) + u256(amount);
      const txHash = await window.ethereum.request({
        method: 'eth_sendTransaction',
        params: [{ from: account, to: CONFIG.stakr, data }],
      });
      setKickStatus('approved in ' + txHash.slice(0, 10) + '… now hit "kick it".');
    } catch (err) {
      setKickStatus('approval rejected. the grill understands.');
    }
  });
  if (btnK) btnK.addEventListener('click', async () => {
    if (!account) { setKickStatus('connect your wallet first.'); return; }
    const message = document.getElementById('kickMessage').value.trim();
    const amtRaw = document.getElementById('kickAmount').value;
    const amount = BigInt(Math.floor(Number(amtRaw) || 0)) * 10n ** 18n;
    if (!message) { setKickStatus('give the grill something to say.'); return; }
    if (message.length > 140) { setKickStatus('140 characters max — keep it punchy.'); return; }
    if (amount < KICK_MIN) { setKickStatus('minimum kick is 1,000,000 $stakr.'); return; }
    if (!kickAllowed({ message, tx: '' })) { setKickStatus('the grill has standards — try different words.'); return; }
    try {
      const ok = await kickAllowance(account);
      if (ok < amount) { setKickStatus('approve $stakr first (button 1), then kick.'); return; }
      setKickStatus('kicking… burn it down.');
      const data = SEL_KICK + u256(amount) + u256(64) + encString(message);
      const txHash = await window.ethereum.request({
        method: 'eth_sendTransaction',
        params: [{ from: account, to: CONFIG.kicker, data }],
      });
      setKickStatus('kicked! ' + txHash.slice(0, 10) + '… your words are on the grill — out-burn the master to take the crown.');
      document.getElementById('kickMessage').value = '';
    } catch (err) {
      setKickStatus('kick rejected. the steak remains unjudged.');
    }
  });
}


async function init() {
  // wire buttons FIRST — never let later failures break them
  try {
    const cb1 = document.getElementById('connectBtn');
    const cb2 = document.getElementById('connectBtn2');
    if (cb1) cb1.addEventListener('click', connect);
    if (cb2) cb2.addEventListener('click', connect);
  } catch (e) { console.error('button wiring failed', e); }
  buildTicker();
  try { initGrill(); } catch (e) { console.error('grill failed', e); }
  try { initKicker(); } catch (e) { console.error('kicker failed', e); }
  try { initContractPill(); } catch (e) { console.error('contract pill failed', e); }
  try {
    document.querySelectorAll('[data-copy]').forEach((btn) => {
      btn.addEventListener('click', () => copyText(btn.dataset.copy, btn));
    });
  } catch (e) { console.error('copy buttons failed', e); }
  try {
    epochsData = await loadProofs();
  } catch {
    epochsData = [];
  }
  renderEpochTable();
  await renderClaims();
  if (window.ethereum) {
    window.ethereum.on('accountsChanged', (accs) => {
      account = accs[0] || null;
      renderWallet();
      renderClaims();
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
