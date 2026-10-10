/* Game plan live bits: BRB vault pending meter + sweepstakes seasoning pile.
   Read-only public RPC with failover. No wallet needed. */
(async () => {
  const RPCS = [
    'https://mainnet.base.org',
    'https://base.llamarpc.com',
    'https://1rpc.io/base',
    'https://base.meowrpc.com',
  ];
  let idx = 0;
  async function rpcCall(method, params) {
    for (let i = 0; i < RPCS.length; i++) {
      const url = RPCS[(idx + i) % RPCS.length];
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        });
        if (!res.ok) throw new Error('http ' + res.status);
        const j = await res.json();
        if (j.error) throw new Error(j.error.message);
        idx = (idx + i) % RPCS.length;
        return j.result;
      } catch (e) { /* try next rpc */ }
    }
    throw new Error('all rpcs failed');
  }

  const VAULT = '0xe77ba6aa7cbdcc771fa24840fbc87d3d770408a0';
  const STAKR = '0x9319f1a40b284c77fEa9808d1DDD71CC0ec05Ba3';
  const DISTRIBUTOR = '0x7b896a892C052C5243Dde20b54a4654e51A3A952';
  const DEAD = '0x000000000000000000000000000000000000dEaD';
  const FLOOR = 6969;
  const PENDING_SEL = '0x6849bcbb';
  const BAL_SEL = '0x70a08231';
  const encAddr = (a) => a.slice(2).toLowerCase().padStart(64, '0');

  // vault meter: pending / 6,969
  try {
    const hex = await rpcCall('eth_call', [{ to: VAULT, data: PENDING_SEL }, 'latest']);
    const pending = Number(BigInt(hex)) / 1e18;
    const el = document.getElementById('vaultPending');
    const fill = document.getElementById('vaultFill');
    const sub = document.getElementById('vaultSub');
    const fmt = (n) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });
    if (el) el.textContent = fmt(pending) + ' / 6,969 bnkr';
    if (fill) fill.style.width = Math.min(100, (pending / FLOOR) * 100) + '%';
    if (sub) {
      sub.textContent = pending >= FLOOR
        ? 'the vault is open — sweep it. tell bankrbot "fill the cooler mfer".'
        : fmt(FLOOR - pending) + ' bnkr to go before anyone can sweep.';
    }
  } catch (e) {
    const sub = document.getElementById('vaultSub');
    if (sub) sub.textContent = 'the vault is simmering — check back shortly.';
  }

  // seasoning pile: $stakr creator fees sitting in the pool hook awaiting claim.
  // FeesManager accounting (token1 = STAKR): owed = (cumulated1 - lastCumulated1) * shares / WAD.
  const HOOK = '0xBDF938149ac6a781F94FAa0ed45E6A0e984c6544';
  const POOL_ID = '0x3059a617cfd2c3b49c7ddab7b4ff947bef76846494e648fc9b9130621439f515';
  const SEL_SHARES = '0x5ebb58fb'; // getShares(bytes32,address)
  const SEL_CUM1 = '0x5a302347';   // getCumulatedFees1(bytes32)
  const SEL_LAST1 = '0x1564cf6c';  // getLastCumulatedFees1(bytes32,address)
  try {
    const poolEnc = POOL_ID.slice(2).toLowerCase();
    const distEnc = encAddr(DISTRIBUTOR);
    const [sharesHex, cumHex, lastHex] = await Promise.all([
      rpcCall('eth_call', [{ to: HOOK, data: SEL_SHARES + poolEnc + distEnc }, 'latest']),
      rpcCall('eth_call', [{ to: HOOK, data: SEL_CUM1 + poolEnc }, 'latest']),
      rpcCall('eth_call', [{ to: HOOK, data: SEL_LAST1 + poolEnc + distEnc }, 'latest']),
    ]);
    const owed = ((BigInt(cumHex) - BigInt(lastHex)) * BigInt(sharesHex)) / (10n ** 18n);
    const amt = Number(owed) / 1e18;
    const el = document.getElementById('seasoningAmt');
    if (el) el.textContent = amt.toLocaleString('en-US', { maximumFractionDigits: 0 });
  } catch (e) { /* leave the placeholder */ }

  // total burned: dead-address STAKR balance as % of the 100B supply
  try {
    const hex = await rpcCall('eth_call', [{ to: STAKR, data: BAL_SEL + encAddr(DEAD) }, 'latest']);
    const burned = Number(BigInt(hex)) / 1e18;
    const el = document.getElementById('burnedTotal');
    if (el) el.textContent = burned.toLocaleString('en-US', { maximumFractionDigits: 0 }) +
      ' $stakr (' + (burned / 1e9).toFixed(2) + '% of supply) burned to date';
  } catch (e) { /* leave the placeholder */ }
})();
