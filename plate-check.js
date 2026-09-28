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
    const balRes = await rpcCall('eth_call', [{ to: CONFIG.stakr, data: SEL_BALANCEOF + encAddr(addr) }, 'latest']);
    const stakr = BigInt(balRes);
    const rows = await claimsDetailFor(addr);

    document.getElementById('plateCheckWho').textContent =
      'plate for ' + cardName(addr) + ' — ' + fmtWhole(stakr) + ' stakr';

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

(function initPlateCheck() {
  const form = document.getElementById('plateCheckForm');
  if (form) form.addEventListener('submit', runPlateCheck);
})();
