/* Game plan live bits: BRB vault pending meter + keeper seasoning pile.
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
  const KEEPER = '0x72b30a9DfEEdC67e8a554e16bFCA3b57600f7258';
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

  // seasoning pile: keeper STAKR balance
  try {
    const hex = await rpcCall('eth_call', [{ to: STAKR, data: BAL_SEL + encAddr(KEEPER) }, 'latest']);
    const amt = Number(BigInt(hex)) / 1e18;
    const el = document.getElementById('seasoningAmt');
    if (el) el.textContent = amt.toLocaleString('en-US', { maximumFractionDigits: 0 });
  } catch (e) { /* leave the placeholder */ }
})();
