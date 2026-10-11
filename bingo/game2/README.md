# Bingo night 2 · play site (LOCAL BUILD, not deployed)

Rebuild of the bingo play page for game 2. Fixes every game-night-1 site
failure: wallet lookup instead of hand-typed token IDs, a full 75-ball board
instead of the last-8 strip, stage results driven by the official game state
instead of the viewer's own cards, and winner highlights that clear the
moment a prize is paid.

Game 1 files (`../play.html`, `../called.json`) are untouched.

## File layout

```
game2/
  index.html            the play page (single file: CSS + JS inline)
  wallets.json          FIXTURE: { "<lowercase 0x address>": [tokenIds] }
  metadata/             FIXTURE card metadata (Numbers attribute, 24 numbers)
  games/2/state.json    FIXTURE: simulated mid-game paused state
  games/2/draw.json     FIXTURE: precomputed draw order + stage hits
  tools/gen_fixtures.py regenerates every fixture above (deterministic)
  README.md             this file
```

## Schemas

### wallets.json
```json
{ "0x1111…": [1001, 1002, 1003] }
```
Keys are lowercase addresses. Values are token IDs in the mint-close
snapshot. Production: built once from CardMinted events after `closeMint`.
The close-time snapshot is final; mid-game transfers are not tracked.

### games/<id>/state.json (live, polled every 5s)
```json
{
  "game_id": 2,
  "status": "live | paused | complete",
  "balls_called": 52,
  "called": [16, 19, 9, …],          // ordered, latest last
  "draw_order_commit": { "block_number": 52500000, "block_hash": "0x…",
                         "algorithm": "Fisher-Yates over balls 1..75" },
  "stages": [
    { "stage": "single | double | frame | coverall",
      "winners": [{ "token_id": 1001, "owner": "0x…" }],
      "winning_ball": 68, "balls_drawn": 28,
      "paid": false, "paid_tx": null }
  ],
  "updated_at": "2026-10-11T12:00:00-04:00"
}
```
- `status` is informational. The page keys behavior off the stages list:
  a stage with `paid: false` counts as prize-pending.
- Winner highlights appear for unpaid stages and clear the moment a
  `paid: true` update lands. This is the exact specified behavior.
- Stage tracker pills, the banner, and the status line read ONLY this
  file. The viewer's own cards never declare a winner.
- `winners` uses `{token_id, owner}` objects (a guess; game 1 used bare
  token IDs, but the page needs both to highlight cards and name winners).

### games/<id>/draw.json (precomputed, published before showtime)
Full draw order plus per-stage hits, generated from the committed
blockhash via `draw.py`. The live runner only reveals balls; pauses are
scripted from this file, never detected at runtime.

### metadata/<tokenId>.json (fallback only)
`{ "name": …, "attributes": [{ "trait_type": "Numbers",
"value": "n1,…,n24" }] }`, 24 numbers in contract slot order. Only used
when the onchain `cardOf` read fails.

## Card numbers

Primary source is the pass contract on Base
(`0x7dFec9524B8CCd290A7E5EfA3446Cab4990f42c9`), `cardOf(uint256)` —
selector `0xc22b8d82` (keccak256("cardOf(uint256)")[:4], computed
2026-10-11), decoded as 24 seven-bit slots, least-significant first:
B rows 0-4, I rows 0-4, N rows 0,1,3,4 (row 2 is FREE), G rows 0-4,
O rows 0-4. Zero/invalid unpacks fall back to `metadata/<id>.json`.

## Previewing with fixtures

```bash
cd ~/workspace/stakr/claim-site/bingo/game2
python3 -m http.server 8137
# open http://localhost:8137/
```

Two fixture wallets (addresses are fake):
- `0x1111111111111111111111111111111111111111` — 6 passes (1001-1006).
  Pass 1003 just hit the picture frame and the prize is UNPAID, so it
  renders with the gold winner highlight. Passes 1001/1002 won single
  and double, both paid (no highlight, correct).
- `0x2222222222222222222222222222222222222222` — 35 passes (1007-1041),
  to check the compact card layout at pack scale.

Or deep-link: `http://localhost:8137/?wallet=0x1111…1111`.

Regenerate fixtures: `python3 tools/gen_fixtures.py` (deterministic).

## What the backend must provide at deploy

1. `wallets.json` — real snapshot from CardMinted events after mint close.
2. `games/2/state.json` — written by the draw runner (ball reveals,
   stage hits) and the payout flow (`paid: true` + `paid_tx` per stage).
   The page polls it; nothing else drives the UI.
3. `games/2/draw.json` — precomputed order + stage hits.
4. `metadata/<id>.json` — only as fallback; the page prefers the chain.
5. Delete the fixture wallets/metadata or replace with real files. The
   fixture state.json must be replaced before showtime.

## Design notes

- Visual identity carries over from night 1: charcoal grill-night scene,
  cream cards, grill red, marigold. Display face is Fraunces (Google
  Fonts, swap); body is system sans; addresses use ui-monospace.
- Motion is calm: one pulsing latest ball, soft mark transitions.
  `prefers-reduced-motion` kills all animation.
- Mobile-first: 390px board is five 38px-ball columns; cards collapse
  to a compact auto-fill grid that holds 35 without strain.
- Copy buttons on the wallet address, payout tx hashes, and block hash.
- No em dashes in any user-facing copy, per house rule.
