/* Cooler fills leaderboard: who swept the most BNKR from the BRB vault.
   Ranks by total BNKR swept, most first. Data: fills.json (30-min indexer). */
(async () => {
  const body = document.getElementById('fillsBody');
  if (!body) return;
  const short = (a) => a.slice(0, 6) + '…' + a.slice(-4);
  try {
    const r = await fetch('fills.json', { cache: 'no-store' });
    if (!r.ok) throw new Error('no board yet');
    const data = await r.json();
    const board = data.board || [];
    if (!board.length) {
      body.innerHTML = '<tr><td colspan="4" class="muted">no fills yet — the vault is still simmering. be the first.</td></tr>';
      return;
    }
    body.innerHTML = board.map((row, i) => {
      const bnkr = Number(BigInt(row.totalBnkr)) / 1e18;
      const amt = bnkr.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      return '<tr' + (i === 0 ? ' class="leader"' : '') + '>' +
        '<td>' + (i + 1) + '</td>' +
        '<td class="mono" title="' + row.caller + '">' + short(row.caller) + '</td>' +
        '<td>' + row.fills + '</td>' +
        '<td class="mono">' + amt + '</td></tr>';
    }).join('');
  } catch (e) {
    body.innerHTML = '<tr><td colspan="4" class="muted">board is down — check back shortly.</td></tr>';
  }
})();
