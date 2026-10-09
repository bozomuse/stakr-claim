/* stakr & stakr — main-site plate calculator. paste any address, see
   its stakr weight and per-epoch bnkr rewards. pure onchain reads,
   no wallet needed. */
'use strict';

function plateCheckStatus(row) {
  switch (row.status) {
    case 'ready': return { label: fmtBnkr(row.amount.toString()), sub: 'ready to claim — connect a wallet above to pick it up.' };
    case 'paid': return { label: fmtBnkr(row.amount.toString()), sub: 'already served.', stamp: 'PAID' };
    case 'wait': return { label: fmtBnkr(row.amount.toString()), sub: 'claims open in ' + fmtCountdown(row.claimStart) + '.' };
    case 'expired': return { label: fmtBnkr(row.amount.toString()), sub: 'window closed — rolled into the next cookout.', stamp: 'EXPIRED' };
    default: return { label: '0.00', sub: 'nothing on your plate this week.' };
  }
}

/* sauce telemetry (epoch 1, live): the 1.25x multiplier applies when your
   ending balance >= your starting balance — i.e. you didn't dump during
   the epoch. we read your balance at the epoch-start block and compare. */
const EPOCH1_START_BLOCK = '0x31a4bda'; // 52055002, oct 1 2026

async function sauceStatus(addr, currentBal) {
  // returns { sauced: bool, startBal: bigint, currentBal: bigint }
  // or null when the historical read fails (don't block the plate check).
  try {
    const startHex = await rpcCall('eth_call', [
      { to: CONFIG.stakr, data: SEL_BALANCEOF + encAddr(addr) },
      EPOCH1_START_BLOCK,
    ]);
    const startBal = BigInt(startHex);
    return { sauced: currentBal >= startBal, startBal, currentBal };
  } catch {
    return null;
  }
}

/* throttle check: stakr throttles sends over 1,000 after a large send
   (reverts for ~3h). simulate a 1,001 stakr transfer from the address —
   if the eth_call reverts, the throttle is active. */
const THROTTLE_LINE = 1000n * 10n ** 18n; // 1,000 stakr in wei
const SEL_TRANSFER = '0xa9059cbb';

async function throttleStatus(addr, balance) {
  // returns { throttled: bool, applicable: bool } or null when the
  // simulation can't run. only meaningful when the holder actually has
  // more than 1,000 stakr to move — below that the throttle can't bite.
  if (balance <= THROTTLE_LINE) return { throttled: false, applicable: false };
  try {
    const probeAmt = THROTTLE_LINE + 1n; // 1,001 stakr — just over the line
    await rpcCall('eth_call', [{
      from: addr,
      to: CONFIG.stakr,
      data: SEL_TRANSFER + encAddr(addr) + u256(probeAmt),
    }, 'latest']);
    return { throttled: false, applicable: true };
  } catch {
    return { throttled: true, applicable: true };
  }
}

async function runPlateCheck(e) {
  e.preventDefault();
  const input = document.getElementById('plateCheckInput');
  const addr = input.value.trim();
  const msg = document.getElementById('plateCheckMsg');
  const out = document.getElementById('plateCheckOut');
  const btn = document.getElementById('plateCheckBtn');
  if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) {
    msg.textContent = 'that doesn\u2019t look like an address — 0x plus 40 hex chars.';
    msg.hidden = false;
    out.hidden = true;
    return;
  }
  msg.hidden = true;
  btn.disabled = true;
  btn.textContent = 'reading the chain…';
  try {
    const balRes = await ethCallRetry(CONFIG.stakr, SEL_BALANCEOF + encAddr(addr));
    const stakr = BigInt(balRes);
    const [cut, rows, sauce, throttle] = await Promise.all([
      coolerCutEstimate(addr, stakr),
      claimsDetailFor(addr),
      sauceStatus(addr, stakr),
      throttleStatus(addr, stakr),
    ]);

    document.getElementById('plateCheckWho').textContent =
      'plate for ' + cardName(addr) + ' — ' + fmtWhole(stakr) + ' stakr';
    document.getElementById('plateCheckCut').textContent =
      '~' + fmtBnkr(cut.toString()) + ' bnkr';

    // sauce + throttle telemetry line
    const tele = document.getElementById('plateCheckTelemetry');
    if (tele) {
      const bits = [];
      if (sauce) {
        bits.push(sauce.sauced
          ? 'sauce: 1.25x active — holding strong since oct 1'
          : 'sauce: off — balance dipped below your oct 1 mark (' + fmtWhole(sauce.startBal) + ' stakr)');
      }
      if (throttle && throttle.applicable) {
        bits.push(throttle.throttled
          ? 'transfers: throttled — sends over 1,000 stakr will revert for a bit, sit tight'
          : 'transfers: clear — sends over 1,000 stakr will go through');
      }
      tele.textContent = bits.join(' · ');
      tele.hidden = bits.length === 0;
    }

    const list = document.getElementById('plateCheckRows');
    list.innerHTML = '';
    let total = 0n;
    let anyEpochs = false;
    for (const r of rows) {
      anyEpochs = true;
      if (r.status === 'ready') total += r.amount;
      const s = plateCheckStatus(r);
      const li = document.createElement('li');
      const meta = document.createElement('div');
      meta.className = 'er-meta';
      const title = document.createElement('strong');
      title.textContent = 'epoch ' + r.epochId;
      const sub = document.createElement('span');
      sub.className = 'muted';
      sub.textContent = s.sub;
      meta.append(title, sub);
      const right = document.createElement('div');
      right.className = 'er-amount';
      const amt = document.createElement('span');
      amt.textContent = s.label;
      const unit = document.createElement('small');
      unit.textContent = 'bnkr';
      right.append(amt, unit);
      if (s.stamp) {
        const stamp = document.createElement('span');
        stamp.className = 'stamp';
        stamp.textContent = s.stamp;
        right.appendChild(stamp);
      }
      li.append(meta, right);
      list.appendChild(li);
    }
    if (!anyEpochs) {
      const li = document.createElement('li');
      li.innerHTML = '<div class="er-meta"><strong>no epochs yet</strong><span class="muted">the grill hasn\'t served its first week.</span></div>';
      list.appendChild(li);
    }
    document.getElementById('plateCheckTotal').textContent = fmtBnkr(total.toString()) + ' bnkr';
    document.getElementById('plateCheckCard').href = 'card.html?address=' + addr;
    out.hidden = false;
  } catch {
    msg.textContent = 'the chain didn\u2019t pick up — try again in a bit.';
    msg.hidden = false;
    out.hidden = true;
  } finally {
    btn.disabled = false;
    btn.textContent = 'check my plate';
  }
}

/* your cut of the cooler, right now: your weight divided by every
   eligible plate, times what's sitting in the distributor. this is an
   estimate — real cookouts pay from their own epoch snapshot, and
   plates under $5 sit out (which nudges eligible shares up). */
/* cooler math (SEL_TOTALSUPPLY, EXCLUDED_PLATES, ethCallRetry,
   isExcludedPlate, coolerCutFor) lives in share-card.js, loaded before
   this file on index.html. */
async function coolerCutEstimate(addr, stakr) {
  if (stakr <= 0n || isExcludedPlate(addr)) return 0n;
  const coolerHex = await ethCallRetry(CONFIG.bnkr, SEL_BALANCEOF + encAddr(CONFIG.distributor));
  return coolerCutFor(addr, stakr, BigInt(coolerHex));
}

(function initPlateCheck() {
  const form = document.getElementById('plateCheckForm');
  if (form) form.addEventListener('submit', runPlateCheck);
})();
