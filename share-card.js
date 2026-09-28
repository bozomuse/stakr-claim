/* stakr & stakr — "my plate" share card. renders a 1200x675 png on canvas
   with live chain numbers (your plate, the cooler, the crown), then shares
   or downloads it. no dependencies, no build step. */
'use strict';

const CARD_W = 1200;
const CARD_H = 675;

/* known burners, for the crown line. unknown -> truncated address. */
const CARD_NAMES = {
  '0x891691ce817db5d09fc5bbbea6ae012cfe829aef': 'kyle',
  '0xbd771a0071ca2833604257eef6d2de5d676d33e1': 'bozo',
};
function cardName(addr) {
  if (!addr) return '—';
  const n = CARD_NAMES[addr.toLowerCase()];
  return n || (addr.slice(0, 6) + '…' + addr.slice(-4));
}

const fmtWhole = (wei) =>
  (wei / 1000000000000000000n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

async function cardData() {
  const bnkrData = SEL_BALANCEOF + encAddr(CONFIG.distributor);
  const coolerRes = await rpcCall('eth_call', [{ to: CONFIG.bnkr, data: bnkrData }, 'latest']);
  const cooler = BigInt(coolerRes);

  let myStakr = 0n;
  if (account) {
    const stakrData = SEL_BALANCEOF + encAddr(account);
    myStakr = BigInt(await rpcCall('eth_call', [{ to: CONFIG.stakr, data: stakrData }, 'latest']));
  }

  const tc = document.getElementById('totalClaimable');
  const claimable = tc ? parseFloat((tc.textContent || '').replace(/[^0-9.]/g, '')) || 0 : 0;

  return { cooler, myStakr, claimable, master: grillMaster() };
}

function fitFont(ctx, text, maxW, base, family, weight) {
  let size = base;
  ctx.font = weight + ' ' + size + 'px ' + family;
  while (size > 24 && ctx.measureText(text).width > maxW) {
    size -= 6;
    ctx.font = weight + ' ' + size + 'px ' + family;
  }
  return size;
}

function drawCard(d) {
  const c = document.createElement('canvas');
  c.width = CARD_W;
  c.height = CARD_H;
  const x = c.getContext('2d');
  const PAPER = '#FAF3E7', INK = '#1E1A16', MUTED = '#6B5F52',
        KETCHUP = '#C8342A', MUSTARD = '#E8A020', LINE = '#E3D5BE';

  x.fillStyle = PAPER;
  x.fillRect(0, 0, CARD_W, CARD_H);

  /* header band */
  x.fillStyle = KETCHUP;
  x.fillRect(0, 0, CARD_W, 128);
  x.fillStyle = MUSTARD;
  x.fillRect(0, 128, CARD_W, 10);
  x.fillStyle = PAPER;
  x.textBaseline = 'alphabetic';
  x.textAlign = 'left';
  x.font = '400 52px "Alfa Slab One", Georgia, serif';
  x.fillText('stakr & stakr', 56, 84);
  x.textAlign = 'right';
  x.font = '500 30px Inter, sans-serif';
  x.fillText('the cookout', CARD_W - 56, 82);

  /* headline */
  x.textAlign = 'left';
  x.fillStyle = INK;
  x.font = '400 104px "Alfa Slab One", Georgia, serif';
  x.fillText('my plate', 56, 268);

  /* hero number: claimable bnkr if there is any, else my stakr weight */
  let hero, sub;
  if (d.claimable > 0) {
    hero = d.claimable.toLocaleString('en-US', { maximumFractionDigits: 2 }) + ' bnkr';
    sub = 'ready to claim — come get it';
  } else {
    hero = fmtWhole(d.myStakr) + ' stakr';
    sub = 'on my plate — first cookout soon';
  }
  x.fillStyle = KETCHUP;
  const hs = fitFont(x, hero, CARD_W - 112, 118, '"Space Mono", monospace', '700');
  x.font = '700 ' + hs + 'px "Space Mono", monospace';
  x.fillText(hero, 56, 268 + hs + 28);
  x.fillStyle = MUTED;
  x.font = '400 30px Inter, sans-serif';
  x.fillText(sub, 58, 268 + hs + 72);

  /* divider */
  const divY = 268 + hs + 108;
  x.fillStyle = LINE;
  x.fillRect(56, divY, CARD_W - 112, 3);

  /* stat rows */
  x.textAlign = 'left';
  x.font = '400 27px Inter, sans-serif';
  x.fillStyle = MUTED;
  x.fillText('the cooler', 58, divY + 52);
  x.fillStyle = INK;
  x.font = '700 34px "Space Mono", monospace';
  x.fillText(fmtWhole(d.cooler) + ' bnkr', 58, divY + 96);

  x.fillStyle = MUTED;
  x.font = '400 27px Inter, sans-serif';
  x.fillText('grill master', 620, divY + 52);
  x.fillStyle = INK;
  x.font = '700 34px "Space Mono", monospace';
  const crown = d.master
    ? cardName(d.master.addr) + ' · ' + fmtKickAmount(d.master.total) + ' burned'
    : 'up for grabs · 1M to enter';
  x.fillText(crown, 620, divY + 96);

  /* footer */
  x.fillStyle = MUTED;
  x.font = '400 24px Inter, sans-serif';
  x.fillText('hold stakr. earn bnkr · bozomuse.github.io/stakr-claim', 58, CARD_H - 36);

  return c;
}

async function sharePlate() {
  const btn = document.getElementById('sharePlateBtn');
  const old = btn ? btn.textContent : '';
  try {
    if (btn) { btn.disabled = true; btn.textContent = 'firing up the grill…'; }
    if (!account) {
      await connect();
      if (!account) { setNote('connect a wallet first — the card needs your plate.'); return; }
    }
    try {
      await document.fonts.load('400 104px "Alfa Slab One"');
      await document.fonts.load('700 118px "Space Mono"');
      await document.fonts.ready;
    } catch { /* fall back to system fonts */ }
    const d = await cardData();
    const canvas = drawCard(d);
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
    if (!blob) throw new Error('render failed');
    const file = new File([blob], 'my-stakr-plate.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'my plate at the stakr cookout' });
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'my-stakr-plate.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 8000);
      setNote('plate saved — post it anywhere.');
    }
  } catch (e) {
    setNote('the chain didn\u2019t pick up — try again in a bit.');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = old; }
  }
}

(function initShareCard() {
  const btn = document.getElementById('sharePlateBtn');
  if (btn) btn.addEventListener('click', sharePlate);
})();
