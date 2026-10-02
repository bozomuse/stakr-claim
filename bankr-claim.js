/* bankr wallet claim helper: shows raw claim calldata for any address,
   since bankr-managed wallets can't connect to the site directly. */
'use strict';

(function () {
  function u256(n) { return BigInt(n).toString(16).padStart(64, '0'); }
  function encB32(h) { return h.toLowerCase().replace('0x', '').padStart(64, '0'); }
  function encodeClaim(epochId, amount, proof) {
    return ('0xae0b51df' + u256(epochId) + u256(amount) + u256(96) +
      u256(proof.length) + proof.map(encB32).join(''));
  }

  async function copyText(text, btn) {
    try { await navigator.clipboard.writeText(text); }
    catch {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta);
      ta.select(); document.execCommand('copy'); ta.remove();
    }
    const old = btn.textContent;
    btn.textContent = 'copied';
    setTimeout(() => { btn.textContent = old; }, 1500);
  }

  async function loadProofs() {
    const out = [];
    const idxRes = await fetch('./proofs/epochs.json');
    if (!idxRes.ok) return out;
    const idx = await idxRes.json();
    for (const e of idx.epochs || []) {
      const r = await fetch('./proofs/' + e.file);
      if (!r.ok) continue;
      const data = await r.json();
      data._claimsLower = {};
      for (const [k, v] of Object.entries(data.claims || {})) {
        data._claimsLower[k.toLowerCase()] = v;
      }
      out.push(data);
    }
    return out;
  }

  let epochs = null;
  async function ensureProofs() {
    if (!epochs) epochs = await loadProofs();
    return epochs;
  }

  document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('bankrClaimForm');
    if (!form) return;
    const input = document.getElementById('bankrClaimInput');
    const msg = document.getElementById('bankrClaimMsg');
    const out = document.getElementById('bankrClaimOut');
    const toEl = document.getElementById('bankrClaimTo');
    const dataEl = document.getElementById('bankrClaimData');
    const DISTRIBUTOR = '0x7b896a892C052C5243Dde20b54a4654e51A3A952';

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const addr = (input.value || '').trim().toLowerCase();
      msg.hidden = true; out.hidden = true;
      if (!/^0x[0-9a-f]{40}$/.test(addr)) {
        msg.hidden = false;
        msg.textContent = 'that doesn\u2019t look like an address — paste your full 0x bankr wallet address.';
        return;
      }
      msg.hidden = false;
      msg.textContent = 'checking the proofs…';
      const eps = await ensureProofs();
      const found = [];
      for (const ep of eps) {
        const c = ep._claimsLower[addr];
        if (c) found.push({ epochId: ep.epochId, amount: c.amount, proof: c.proof });
      }
      if (!found.length) {
        msg.textContent = 'no plate for that address in any served epoch. double-check the address?';
        return;
      }
      // one claim tx per epoch; show the first (most users have one)
      const f = found[0];
      const data = encodeClaim(f.epochId, f.amount, f.proof);
      const bnkr = (BigInt(f.amount) / 10n ** 16n).toString();
      const pretty = (Number(bnkr) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });
      toEl.textContent = DISTRIBUTOR;
      dataEl.value = data;
      msg.textContent = `epoch ${f.epochId}: ${pretty} bnkr waiting. copy both fields and submit from your bankr wallet.`;
      out.hidden = false;
      document.getElementById('bankrCopyTo').onclick = (e) => copyText(DISTRIBUTOR, e.target);
      document.getElementById('bankrCopyData').onclick = (e) => copyText(data, e.target);
    });
  });
})();
