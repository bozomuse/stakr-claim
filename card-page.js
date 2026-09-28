/* stakr & stakr — card.html driver. renders one holder's plate from
   ?address=0x..., pure onchain reads, no wallet needed. the bankr skill
   hands out links to this page; the link IS the deliverable. */
'use strict';

function pageAddress() {
  const a = new URLSearchParams(location.search).get('address') || '';
  return /^0x[0-9a-fA-F]{40}$/.test(a) ? a : null;
}

/* rpc versions of the wallet-gated helpers in app.js */
async function claimedViaRpc(epochId, holder) {
  const data = SEL.hasClaimed + u256(epochId) + encAddr(holder);
  const res = await rpcCall('eth_call', [{ to: CONFIG.distributor, data }, 'latest']);
  return BigInt(res) === 1n;
}

async function timingViaRpc(ep) {
  try {
    const data = SEL.epochs + u256(ep.epochId);
    const res = await rpcCall('eth_call', [{ to: CONFIG.distributor, data }, 'latest']);
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

/* total claimable bnkr for an address, same rules as the claim rows:
   in the proofs, not claimed onchain, window open. */
async function claimableFor(address) {
  const epochs = await loadProofs();
  if (!epochs.length) return 0;
  const nowSec = Math.floor(Date.now() / 1000);
  const lower = address.toLowerCase();
  let total = 0n;
  for (const ep of epochs) {
    const claim = (ep._claimsLower || {})[lower];
    if (!claim) continue;
    if (await claimedViaRpc(ep.epochId, address)) continue;
    const timing = await timingViaRpc(ep);
    if (timing && (timing.claimStart > nowSec ||
        (timing.claimDeadline > 0 && nowSec > timing.claimDeadline))) continue;
    total += BigInt(claim.amount);
  }
  return Number(total) / 1e18;
}

function showState(which) {
  for (const id of ['plateLoading', 'plateReady', 'plateError', 'plateAsk']) {
    document.getElementById(id).hidden = id !== which;
  }
}

function fail(msg) {
  showState('plateError');
  document.getElementById('plateErrorMsg').textContent = msg;
}

async function boot() {
  const addr = pageAddress();
  if (!addr) {
    showState('plateAsk');
    const form = document.getElementById('plateAskForm');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = document.getElementById('plateAskInput').value.trim();
      if (/^0x[0-9a-fA-F]{40}$/.test(v)) {
        location.search = '?address=' + v;
      } else {
        document.getElementById('plateAskMsg').textContent = 'that doesn\u2019t look like an address — 0x plus 40 hex chars.';
      }
    });
    return;
  }

  showState('plateLoading');
  document.getElementById('plateAddrLine').textContent = cardName(addr);

  try {
    // crown inputs — same sources as the grill bubble
    kicks = (await fetchKicks()) || [];
    directBurns = (await fetchDirectBurns()) || [];
    const claimable = await claimableFor(addr);
    const canvas = await plateCanvasFor(addr, claimable);

    const img = document.getElementById('plateImg');
    img.src = canvas.toDataURL('image/png');
    img.alt = 'my plate at the stakr cookout — ' + cardName(addr);

    const dl = document.getElementById('plateDownload');
    dl.addEventListener('click', () => {
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = 'my-stakr-plate.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
    });

    const sh = document.getElementById('plateShare');
    sh.addEventListener('click', async () => {
      const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
      if (!blob) return;
      const file = new File([blob], 'my-stakr-plate.png', { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: 'my plate at the stakr cookout' });
        } catch { /* user dismissed — nothing to do */ }
      } else {
        dl.click();
      }
    });

    showState('plateReady');
  } catch (e) {
    fail('the chain didn\u2019t pick up — try again in a bit.');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
