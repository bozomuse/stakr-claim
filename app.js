/* stakr & stakr — claim window logic. no dependencies, no build step. */
'use strict';

const CONFIG = {
  chainIdHex: '0x2105', // Base
  distributor: '0x7b896a892C052C5243Dde20b54a4654e51A3A952', // placeholder until launch
  bnkr: '0x22af33fe49fd1fa80c7149773dde5890d3c76f3b',
  bnkrDecimals: 18,
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
  document.getElementById('txDemoNote').hidden = !CONFIG.demo;
  const dlg = document.getElementById('txDialog');
  if (typeof dlg.showModal === 'function') dlg.showModal();
}

/* ---------------- init ---------------- */
function buildTicker() {
  const phrase = 'hold stakr <b>•</b> earn bnkr <b>•</b> stake bnkr <b>•</b> mfer <b>•</b> ';
  document.getElementById('tickerInner').innerHTML = phrase.repeat(8);
}

async function init() {
  buildTicker();
  document.getElementById('demoBanner').hidden = !CONFIG.demo;
  try {
    epochsData = await loadProofs();
  } catch {
    epochsData = [];
  }
  renderEpochTable();
  await renderClaims();
  document.getElementById('connectBtn').addEventListener('click', connect);
  document.getElementById('connectBtn2').addEventListener('click', connect);
  if (window.ethereum) {
    window.ethereum.on('accountsChanged', (accs) => {
      account = accs[0] || null;
      renderWallet();
      renderClaims();
    });
  }
}

document.addEventListener('DOMContentLoaded', init);
