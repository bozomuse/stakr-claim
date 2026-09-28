/* stakr & stakr — card.html driver. renders one holder's plate from
   ?address=0x..., pure onchain reads, no wallet needed. the bankr skill
   hands out links to this page; the link IS the deliverable. */
'use strict';

function pageAddress() {
  const a = new URLSearchParams(location.search).get('address') || '';
  return /^0x[0-9a-fA-F]{40}$/.test(a) ? a : null;
}

/* claimable/claims reads live in share-card.js (claimedViaRpc,
   timingViaRpc, claimsDetailFor, claimableFor) — shared with the
   main-site plate calculator. */

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

    const altForm = document.getElementById('plateAltForm');
    altForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = document.getElementById('plateAltInput').value.trim();
      if (/^0x[0-9a-fA-F]{40}$/.test(v)) {
        location.search = '?address=' + v;
      } else {
        document.getElementById('plateAltMsg').textContent = 'that doesn\u2019t look like an address — 0x plus 40 hex chars.';
      }
    });
  } catch (e) {
    fail('the chain didn\u2019t pick up — try again in a bit.');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
