/* stakr & stakr — "my plate" share card. renders a 1200x675 png on canvas
   with live chain numbers (your plate, the cooler, the crown), then shares
   or downloads it. no dependencies, no build step. */
'use strict';

const CARD_W = 1200;
const CARD_H = 675;

/* known burners, for the crown line. unknown -> truncated address. */
const CARD_NAMES = {
  '0x891691ce817db5d09fc5bbbea6ae012cfe829aef': 'kyle', // admin wallet
  '0xda641d4ff3a5ea3c8b5265db8701622a68998903': 'kyle', // holdings wallet — the 69M grill-master burn
  '0xbd771a0071ca2833604257eef6d2de5d676d33e1': 'bozo',
};
function cardName(addr) {
  if (!addr) return '—';
  const n = CARD_NAMES[addr.toLowerCase()];
  return n || (addr.slice(0, 6) + '…' + addr.slice(-4));
}

const fmtWhole = (wei) =>
  (wei / 1000000000000000000n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/* pro-rata cooler math, shared by the card and the main-site plate
   calculator. your cut = your stakr / eligible stakr * cooler bnkr.
   plates under $5 sit out of real payouts (which nudges eligible shares
   up) — the card shows the raw estimate. */
const SEL_TOTALSUPPLY = '0x18160ddd';
const EXCLUDED_PLATES = [
  '0x000000000000000000000000000000000000dEaD', // burned
  '0x72b30a9DfEEdC67e8a554e16bFCA3b57600f7258', // keeper
  '0x498581fF718922c3f8e6A244956aF099B2652b2b', // pool-side holder
  '0xBDF938149ac6a781F94FAa0ed45E6A0e984c6544', // fee hook
  '0xbd771a0071ca2833604257eef6d2de5d676d33e1', // bozo bankr wallet — Kyle: can't play (Sep 28 2026)
  '0xe7aD68a354403660b4BEB99068580431D5c72602', // work/ceremonial wallet — Kyle: can't play (Sep 28 2026)
];

async function ethCallRetry(to, data, tries = 4) {
  let lastErr = null;
  for (let i = 0; i < tries; i++) {
    try {
      return await rpcCall('eth_call', [{ to, data }, 'latest']);
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 600 * (i + 1) + Math.random() * 300));
    }
  }
  throw lastErr;
}

function isExcludedPlate(addr) {
  const low = addr.toLowerCase();
  return low === CONFIG.distributor.toLowerCase() ||
    EXCLUDED_PLATES.some((a) => a.toLowerCase() === low);
}

async function coolerCutFor(addr, myStakr, cooler) {
  if (myStakr <= 0n || isExcludedPlate(addr)) return 0n;
  // sequential, not parallel: one flaky burst used to nuke the whole
  // calculator on phones. 9 calls, each with its own retry budget.
  const supplyHex = await ethCallRetry(CONFIG.stakr, SEL_TOTALSUPPLY);
  let eligible = BigInt(supplyHex);
  for (const a of [CONFIG.distributor, ...EXCLUDED_PLATES]) {
    eligible -= BigInt(await ethCallRetry(CONFIG.stakr, SEL_BALANCEOF + encAddr(a)));
  }
  if (eligible <= 0n) return 0n;
  return (myStakr * cooler) / eligible;
}

/* Data for one plate. address = any 0x holder (card.html), or the
   connected wallet (index.html). claimableBnkr overrides the DOM scrape
   when the caller computed it directly (card.html has no claim rows). */
async function cardDataFor(address, claimableBnkr) {
  const bnkrData = SEL_BALANCEOF + encAddr(CONFIG.distributor);
  const coolerRes = await rpcCall('eth_call', [{ to: CONFIG.bnkr, data: bnkrData }, 'latest']);
  const cooler = BigInt(coolerRes);

  let myStakr = 0n;
  if (address) {
    const stakrData = SEL_BALANCEOF + encAddr(address);
    myStakr = BigInt(await rpcCall('eth_call', [{ to: CONFIG.stakr, data: stakrData }, 'latest']));
  }

  let claimable = claimableBnkr;
  if (typeof claimable !== 'number') {
    const tc = document.getElementById('totalClaimable');
    claimable = tc ? parseFloat((tc.textContent || '').replace(/[^0-9.]/g, '')) || 0 : 0;
  }

  let cut = 0n;
  try {
    cut = await coolerCutFor(address, myStakr, cooler);
  } catch { /* cut stays 0 — card still renders */ }

  return { cooler, myStakr, claimable, cut, master: grillMaster(), address };
}

async function cardData() {
  return cardDataFor(account);
}

/* wallet-free plate reads — shared by card.html and the main-site plate
   calculator. same rules as the claim rows: the address must be in the
   epoch proofs, not claimed onchain, and the claim window must be open. */
async function claimedViaRpc(epochId, holder) {
  const data = SEL.hasClaimed + u256(epochId) + encAddr(holder);
  const res = await rpcCall('eth_call', [{ to: CONFIG.distributor, data }, 'latest']);
  return BigInt(res) === 1n;
}

async function timingViaRpc(ep) {
  try {
    const res = await rpcCall('eth_call', [{ to: CONFIG.distributor, data: SEL.epochs + u256(ep.epochId) }, 'latest']);
    const words = splitWords(res);
    if (words.length < 6) return null;
    return {
      claimStart: Number(BigInt(words[3])),
      claimDeadline: Number(BigInt(words[4])),
    };
  } catch {
    return null;
  }
}

/* per-epoch reward detail for any address.
   status: 'ready' | 'paid' | 'wait' | 'expired' | 'none' */
async function claimsDetailFor(address) {
  const epochs = await loadProofs();
  const lower = address.toLowerCase();
  const nowSec = Math.floor(Date.now() / 1000);
  const out = [];
  for (const ep of epochs) {
    const claim = (ep._claimsLower || {})[lower];
    if (!claim) { out.push({ epochId: ep.epochId, amount: 0n, status: 'none' }); continue; }
    const amount = BigInt(claim.amount);
    if (await claimedViaRpc(ep.epochId, address)) {
      out.push({ epochId: ep.epochId, amount, status: 'paid' });
      continue;
    }
    const timing = await timingViaRpc(ep);
    if (timing && timing.claimStart > nowSec) {
      out.push({ epochId: ep.epochId, amount, status: 'wait', claimStart: timing.claimStart });
      continue;
    }
    if (timing && timing.claimDeadline > 0 && nowSec > timing.claimDeadline) {
      out.push({ epochId: ep.epochId, amount, status: 'expired' });
      continue;
    }
    out.push({ epochId: ep.epochId, amount, status: 'ready' });
  }
  return out;
}

async function claimableFor(address) {
  const rows = await claimsDetailFor(address);
  let total = 0n;
  for (const r of rows) if (r.status === 'ready') total += r.amount;
  return Number(total) / 1e18;
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
  x.fillText('my plate', 56, 250);

  /* the wallet this plate belongs to — full address, mono */
  x.fillStyle = MUTED;
  x.font = '400 24px "Space Mono", monospace';
  x.fillText(d.address || '', 58, 290);

  /* hero number: claimable bnkr if there is any, else my stakr weight.
     hs capped at 92 so the address + stats + footer all fit in 675px. */
  let hero, sub;
  if (d.claimable > 0) {
    hero = d.claimable.toLocaleString('en-US', { maximumFractionDigits: 2 }) + ' bnkr';
    sub = 'ready to claim — come get it';
  } else {
    hero = fmtWhole(d.myStakr) + ' stakr';
    sub = 'on my plate — first cookout soon';
  }
  x.fillStyle = KETCHUP;
  const hs = fitFont(x, hero, CARD_W - 112, 92, '"Space Mono", monospace', '700');
  const heroY = 290 + hs + 24;
  const subY = heroY + 42;
  x.font = '700 ' + hs + 'px "Space Mono", monospace';
  x.fillText(hero, 56, heroY);
  x.fillStyle = MUTED;
  x.font = '400 30px Inter, sans-serif';
  x.fillText(sub, 58, subY);

  /* divider */
  const divY = subY + 32;
  x.fillStyle = LINE;
  x.fillRect(56, divY, CARD_W - 112, 3);

  /* stat rows — worst case hs=92 puts divY at 480, cut value at 610,
     footer at 639. clears with room to spare. */
  x.textAlign = 'left';
  x.font = '400 27px Inter, sans-serif';
  x.fillStyle = MUTED;
  x.fillText('the cooler', 58, divY + 40);
  x.fillStyle = INK;
  x.font = '700 34px "Space Mono", monospace';
  x.fillText(fmtWhole(d.cooler) + ' bnkr', 58, divY + 74);

  x.fillStyle = MUTED;
  x.font = '400 27px Inter, sans-serif';
  x.fillText('my cut', 58, divY + 110);
  x.fillStyle = KETCHUP;
  x.font = '700 34px "Space Mono", monospace';
  x.fillText('~' + fmtWhole(d.cut) + ' bnkr', 58, divY + 144);

  x.fillStyle = MUTED;
  x.font = '400 27px Inter, sans-serif';
  x.fillText('grill master', 620, divY + 40);
  x.fillStyle = INK;
  x.font = '700 34px "Space Mono", monospace';
  const crown = d.master
    ? cardName(d.master.addr) + ' · ' + fmtKickAmount(d.master.total) + ' burned'
    : 'up for grabs · 1M to enter';
  x.fillText(crown, 620, divY + 74);

  /* footer */
  x.fillStyle = MUTED;
  x.font = '400 24px Inter, sans-serif';
  x.fillText('hold stakr. earn bnkr · bozomuse.github.io/stakr-claim', 58, CARD_H - 36);

  return c;
}

/* Render the plate canvas for any address. Shared by the index page
   (connected wallet) and card.html (?address=, no wallet). */
async function plateCanvasFor(address, claimableBnkr) {
  try {
    await document.fonts.load('400 104px "Alfa Slab One"');
    await document.fonts.load('700 118px "Space Mono"');
    await document.fonts.ready;
  } catch { /* fall back to system fonts */ }
  const d = await cardDataFor(address, claimableBnkr);
  return drawCard(d);
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
    const canvas = await plateCanvasFor(account);
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
