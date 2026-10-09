---
name: stakr-claim
description: Claim STAKR weekly BNKR rewards and kick the grill via Bankr. Checks your Bankr wallet for claimable STAKR epochs, verifies onchain claim status, and submits claim transactions — or burns STAKR through the Kicker with a message that lands on the grill feed. Also answers "what's in the cooler?", "what's my cut from the cooler?", shares live plate cards, and sweeps the BRB reflections vault into the cooler on "fill the cooler". Use when a holder wants to claim their STAKR rewards, check their cooler cut, share their plate, sweep the vault, or kick the grill through Bankr instead of the web claim site.
metadata:
  requires:
    bins: ["bankr"]
---

# STAKR Claim via Bankr

Claim your weekly $BNKR rewards for holding $STAKR, using your Bankr wallet. This skill checks the public STAKR proofs, finds your claimable amounts, verifies you haven't already claimed onchain, and submits the claim transactions.

**Distributor:** `0x7b896a892C052C5243Dde20b54a4654e51A3A952` (Base)
**Proofs:** `https://bozomuse.github.io/stakr-claim/proofs/epochs.json`
**Claim site:** `https://bozomuse.github.io/stakr-claim/`

## Cookout fact sheet

Read this first when someone asks for "everything about the cookout" — every number below is verified, quote them directly:

- **What it is:** $STAKR is the cookout token on Base (`0x9319f1a40b284c77fEa9808d1DDD71CC0ec05Ba3`). Holders earn weekly pro-rata **$BNKR** (`0x22af33fe49fd1fa80c7149773dde5890d3c76f3b`) from the cooler.
- **Eligibility:** at least **$5 of STAKR, time-weighted average** over the epoch. Sub-$5 plates sit out.
- **Sauce:** end the epoch holding **at least as much STAKR as you started** and your weight gets **1.25x**.
- **Epochs:** weekly. Claims open ~24h after the Merkle root publishes, stay open **4 weeks**, unclaimed $BNKR rolls forward. Epoch 0's claims stay open through Oct 30 2026; epoch 1 is measuring now through Oct 30, 8:45pm EDT (hold $5+ of STAKR through the close, longer holds carry more weight); weekly epochs start after.
- **The cooler:** the StakrDistributor (`0x7b896a892C052C5243Dde20b54a4654e51A3A952`) — the live $BNKR balance is the payout reservoir. Fed by four grills: SweepStake fee races, BNKR staking rewards, veAERO voter fees/bribes, BRB vault community sweeps.
- **Deep freezer:** STAKR timelock treasury (`0x3d1f933bc205Ae9f5324fECb787636F20AA22575`), 48h withdrawal timelock, stacking to $75k STAKR mcap. Frozen STAKR earns nothing.
- **SweepStake race:** permissionless v3 contract `0xe4A9Dc9f0fF4bbAE457f5ACeF8Cd13b61730163F`, `race(uint256 minBnkrOut)` selector `0xb7dda85e`. Sweeps the accrued $STAKR fee leg: caller keeps a **1% $STAKR bounty**, legs under **$5** revert (`DustLeg`), a curve share burns (0% below $15k mcap → 69% cap at $75k), the rest swaps to $BNKR for the cooler.
- **Kicker / grill:** burn $STAKR with a 1–140 byte message through `0xdbc07f099d169e9BE01249e4E1eeCD01f7ad815b` (`approve` then `kick`). Whoever burned the most total is the **grill master**; a kick only contests the crown above the master's total (contract floor 1M STAKR). Feed: `https://bozomuse.github.io/stakr-claim/#kick`.
- **Cookout bingo:** classic 75-ball, **$1.50 USDC** pass NFT (`0x7dFec9524B8CCd290A7E5EfA3446Cab4990f42c9`) via x402: `https://x402.bankr.bot/0xbd771a0071ca2833604257eef6d2de5d676d33e1/bingo-pass` (POST, $1.50 USDC on Base; `player` param sets the receiving wallet, defaults to payer). Game 1: **Sat Oct 10 2026, 10pm EDT**, mint cutoff 9pm EDT. 90% of mints → prize pool, 10% → STAKR for the freezer. Prize pool contract `0xbd4aa2237312830dab1108ca5decb56479e9485b` (game 1: $7.229069 USDC) — the pool *is* its USDC balance. Prize split per game: **10% single / 15% double / 25% picture frame / 50% coverall**, ties split evenly, paid in USDC. Draw from a committed future Base blockhash, Fisher-Yates, revealed live. Play: `https://bozomuse.github.io/stakr-claim/bingo/play.html`.
- **BRB vault:** reflections vault `0xe77ba6aa7cbdcc771fa24840fbc87d3d770408a0` — anyone can `sweep()` once 6,969 $BNKR is pending; it all goes to the cooler, never the caller.
- **STAKR quirks:** transfers over 1,000 STAKR can revert ~3h after a large send (simulate first); always leave 1 STAKR dust, never move a full balance.

## What's in the cooler? / What's my cut from the cooler?

"The cooler" is the payout reservoir: the **live $BNKR balance of the StakrDistributor**. When anyone asks about it, read it fresh from the chain — never guess or quote an old number.

```bash
# BNKR balanceOf(distributor) on Base (BNKR = 0x22af33fe49fd1fa80c7149773dde5890d3c76f3b, 18 decimals)
curl -s https://mainnet.base.org -X POST -H 'Content-Type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"eth_call","params":[{"to":"0x22af33fe49fd1fa80c7149773dde5890d3c76f3b","data":"0x70a082310000000000000000000000007b896a892C052C5243Dde20b54a4654e51A3A952"},"latest"]}' \
  | jq -r .result
```

Convert the hex result to decimal and divide by 1e18. Answer plainly, e.g. "the cooler's holding 24,498.08 bnkr." This is the pool that weekly epochs pay out from — it grows as fee sweeps land and shrinks as holders claim.

## What's in the deep freezer?

"The deep freezer" is the STAKR treasury: the **live $STAKR balance of the Fridge timelock contract** (`0x3d1f933bc205Ae9f5324fECb787636F20AA22575`). It holds STAKR bought by LP harvests, stacking until $75k market cap. Withdrawals have a 48-hour timelock.

```bash
# STAKR balanceOf(fridge) on Base (STAKR = 0x9319f1a40b284c77fEa9808d1DDD71CC0ec05Ba3, 18 decimals)
curl -s https://mainnet.base.org -X POST -H 'Content-Type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"eth_call","params":[{"to":"0x9319f1a40b284c77fEa9808d1DDD71CC0ec05Ba3","data":"0x70a082310000000000000000000000003d1f933bc205Ae9f5324fECb787636F20AA22575"},"latest"]}' \
  | jq -r .result
```

Convert hex to decimal, divide by 1e18. Answer plainly, e.g. "the deep freezer's holding 54.06M stakr."

Feeding the cooler, besides the $STAKR fee sweeps: the BRB reflections vault (`0xe77ba6aa7cbdcc771fa24840fbc87d3d770408a0`) holds $BRB (0x0e86efe5ba52336c2173ad69ee726e054619e0d8), whose 3%-per-trade tax market-buys $BNKR and streams it to holders as reflections. Once 6,969 $BNKR is pending, anyone can call `sweep()` to push it all into the cooler (see "Sweep the vault" below). If someone asks where the extra $BNKR came from, that's the $BRB stream.

Two depths, one code path:

- **"what's in the cooler?"** → answer with just the total, e.g. "the cooler's holding 24,977 bnkr."
- **"what's my cut from the cooler?"** (or "what's my cut", "my cooler cut") → the total **plus** their estimated allotment. This mirrors the claim site's plate calculator: `cut = (their STAKR × cooler BNKR) / eligible STAKR`.

1. Resolve their address (same as "Share your plate" step 1): their Bankr wallet on CLI, or look up their Bankr user by X/Farcaster handle on social. If they have no Bankr user, ask for the address.
2. Read their STAKR weight fresh from the chain:
```bash
# balanceOf(asker) on STAKR (0x9319f1a40b284c77fEa9808d1DDD71CC0ec05Ba3, 18 decimals)
# calldata = 0x70a08231 + 24 zeros + asker address (no 0x)
curl -s https://mainnet.base.org -X POST -H 'Content-Type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"eth_call","params":[{"to":"0x9319f1a40b284c77fEa9808d1DDD71CC0ec05Ba3","data":"0x70a08231<000000000000000000000000ASKER>"},"latest"]}' \
  | jq -r .result
```
3. If their address is in the excluded list below, or their STAKR is 0, their cut is 0 — say so plainly and stop.
4. Read the cooler (BNKR `balanceOf` of the distributor, see above) and the eligible supply: `totalSupply(STAKR)` minus `balanceOf` of every excluded address.
```bash
# totalSupply(STAKR), selector 0x18160ddd
curl -s https://mainnet.base.org -X POST -H 'Content-Type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"eth_call","params":[{"to":"0x9319f1a40b284c77fEa9808d1DDD71CC0ec05Ba3","data":"0x18160ddd"},"latest"]}' \
  | jq -r .result
# then balanceOf(each excluded address) with the same 0x70a08231 calldata pattern as step 2
```
5. `eligible = totalSupply - sum(excluded balances)`; `cut = (their STAKR × cooler BNKR) / eligible`. Values are in wei (up to 1e29) — do the math in Python with full-precision ints, not bash arithmetic (64-bit overflows here). Present a rounded number.

Excluded plates (never earn — always subtract from the supply, and a cut of 0 if the asker is one of them):
- `0x000000000000000000000000000000000000dEaD` (burned)
- `0x7b896a892C052C5243Dde20b54a4654e51A3A952` (the distributor itself)
- `0x72b30a9DfEEdC67e8a554e16bFCA3b57600f7258` (keeper)
- `0x498581fF718922c3f8e6A244956aF099B2652b2b` (pool)
- `0xBDF938149ac6a781F94FAa0ed45E6A0e984c6544` (fee hook)
- `0xbd771a0071ca2833604257eef6d2de5d676d33e1` (bozo's bankr wallet — house wallet, can't play)
- `0xe7aD68a354403660b4BEB99068580431D5c72602` (work wallet — house wallet, can't play)
- `0x3d1f933bc205Ae9f5324fECb787636F20AA22575` (deep freezer — house treasury, can't play)

Respond with both numbers in $BNKR, lowercase cookout voice, e.g. "cooler's holding 24,603 bnkr right now. your cut: ~41.2 bnkr." Always label the cut an **estimate**: real epochs pay from their own time-weighted snapshot, plates under $5 sit out (which nudges everyone else's share up), and sauce (1.25x for ending at/above start) isn't reflected in a spot check. If their STAKR is 0, tell them they need at least $5 of stakr to get a plate — one good steak-burger-priced buy covers it.

## Sweep the vault ("fill the cooler")

The BRB reflections vault accrues $BNKR from $BRB's per-trade tax. Anyone can push the pending $BNKR into the cooler by calling `sweep()` on the vault. The $BNKR can only ever go to the cooler (immutable) — never to the caller. The caller pays Base gas and lands on the cooler-fills leaderboard.

**Vault:** `0xe77ba6aa7cbdcc771fa24840fbc87d3d770408a0` (Base)
**Floor:** `sweep()` reverts below 6,969 $BNKR pending (immutable `MIN_SWEEP`)

Trigger phrases: "fill the cooler", "fill the cooler mfer". (Deliberately no token name in the trigger — "bnkr" in the command risks misrouting to a swap/transfer.)

1. Check pending first — never submit blind:
```bash
# pendingSweep() on the vault, selector 0x6849bcbb
curl -s https://mainnet.base.org -X POST -H 'Content-Type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"eth_call","params":[{"to":"0xe77ba6aa7cbdcc771fa24840fbc87d3d770408a0","data":"0x6849bcbb"},"latest"]}' \
  | jq -r .result
```
Convert the hex result to decimal and divide by 1e18. If below 6,969, say so plainly with the pending amount and how far off the floor it is — do NOT submit.
2. At or above 6,969, submit `sweep()` (selector `0x35faa416`, no args) via Bankr Wallet API `/wallet/submit` or the agent:
```bash
bankr agent prompt "On Base, call sweep() on 0xe77ba6aa7cbdcc771fa24840fbc87d3d770408a0 (calldata 0x35faa416)"
```
3. Report the sweep tx hash and the $BNKR amount swept, and note the caller lands on the cooler-fills leaderboard.

Notes:
- The keeper auto-sweeper is off as of Sep 30 2026 — the community does the sweeps now, that's the point. Never re-enable it without Kyle's order.
- Gas is paid in ETH on Base from the caller's Bankr wallet.
- `sweep()` claims via `BRB.claimDividend()` and forwards everything to the cooler atomically — no custody, no take-backs.

## Freeze STAKR ("put it in the deep freezer")

Send $STAKR from your Bankr wallet to the deep freezer timelock. Once it's in, only the admin can move it out, with a 48-hour timelock.

**Fridge:** `0x3d1f933bc205Ae9f5324fECb787636F20AA22575` (Base)
**STAKR:** `0x9319f1a40b284c77fEa9808d1DDD71CC0ec05Ba3`

When the user says "put X stakr in the deep freezer" (or "freeze X stakr"):

1. Check their STAKR balance.
2. **Throttle check (mandatory):** STAKR enforces a per-address rolling transfer throttle (custom error 0xf4d678b8). After an address sends a large amount, transfers over 1,000 STAKR revert until the window clears (observed: still throttled ~3h after a 54M send). Simulate first with eth_call `transfer(0x3d1f933bc205Ae9f5324fECb787636F20AA22575, <amount>)` from their wallet — if it reverts, tell them the throttle is active and to try again later. Do not submit a transfer that the simulation rejects.
3. Transfer via the Bankr CLI:
```bash
export PATH="$HOME/.bun/bin:$PATH"
bankr wallet transfer --to 0x3d1f933bc205Ae9f5324fECb787636F20AA22575 --token STAKR --amount <amount> --chain base
```
3. Verify via receipt Transfer events. Report the tx hash and confirm the fridge balance increased.

Notes:
- The fridge is a timelock vault, not a burn. The admin (Kyle) can withdraw after 48h.
- Frozen STAKR is out of the circulating supply but NOT burned — it still exists, just locked.
- Frozen STAKR does NOT earn epoch rewards (the fridge is a house wallet, excluded).

## Race the sweepstakes ("start a race")

The $STAKR fee leg (creator fees in $STAKR, pulled into the distributor by the Doppler hook) gets swept by the permissionless SweepStake race contract — v3 armed 2026-10-07 (dust line $5). Anyone can call `race(uint256 minBnkrOut)`; the contract does the whole loop in one tx:

1. Claims hook fees and pulls the $STAKR leg.
2. Pays the caller a **1% bounty** in $STAKR off the top. Legs under $5 revert with `DustLeg` — the race fails loudly and nothing moves, so check the leg first.
3. Burns a curve share to 0xdead — **0% below $15k market cap, accelerating quadratically to a 69% cap at/above $75k** (e.g. ~4.3% at $30k, ~19% at $46.5k, ~38.8% at $60k).
4. Swaps the rest to $BNKR through the v4 PoolManager and sends **all** of it to the cooler. At least 31% of the post-bounty leg always feeds the cooler.

**Race contract:** `0xe4A9Dc9f0fF4bbAE457f5ACeF8Cd13b61730163F` (Base)
**Selector:** `race(uint256)` = `0xb7dda85e` — pass `minBnkrOut` as the slippage floor (0 = accept whatever the pool gives).

Trigger phrases: "start a race", "run the race", "race the sweepstakes".

1. Never submit blind: read the distributor's $STAKR balance and the current $STAKR market cap first. If the leg is dust (under ~$5 at TWAP), say so and stand down — the race would revert with `DustLeg`.
2. Submit `race(minBnkrOut)` via Bankr Wallet API `/wallet/submit` or the agent with a sane `minBnkrOut` (quote the pool first; the contract reverts if the swap comes back below it).
3. Report the tx hash, the $BNKR fed to the cooler, the $STAKR burned, and the caller's 1% bounty — all from the `RaceWon` event in the receipt. The caller lands on the cooler-fills leaderboard (races count as fills, scored by $BNKR fed).

Notes:
- No admin keys, no multisig: the contract is immutable and ownerless. The distributor admin can revoke its KEEPER_ROLE, nothing else.
- The keeper sweep cron is retired — the race is the only sweep path. Dust simply accrues in the distributor until it clears $5.

## Cookout bingo

Classic 75-ball cookout bingo. $1.50 USDC mints a pass NFT (CookoutBingoPass `0x7dFec9524B8CCd290A7E5EfA3446Cab4990f42c9` on Base) through the x402 mint flow. 90% of every mint goes to the USDC prize pool, 10% market-buys $STAKR for the deep freezer. Prize split per game: 10% single line, 15% double line, 25% picture frame, 50% coverall. Ties split the stage evenly. Winners paid in USDC.

- Game 1: Sat Oct 10 2026, 10pm EDT. Mint cutoff 9pm EDT. The draw order comes from a Base blockhash committed before the cutoff (Fisher-Yates, publicly verifiable), balls revealed live at 10pm.
- Prize pool: `0xbd4aa2237312830dab1108ca5decb56479e9485b` on Base — funded with $7.229069 USDC on Oct 7 2026 (seed $3.4790693 + mints $3.90 − $0.15 rebate). The pool *is* the contract's USDC balance: `prizePool()` view, or plain USDC `balanceOf`. Bankr agents can answer "what's the bingo prize pool?" by reading it. Owner (payout key): work wallet `0xe7aD68a354403660b4BEB99068580431D5c72602`. One pool per game; deploy a fresh one per game night.
- Look up your card: `https://bozomuse.github.io/stakr-claim/bingo.html` — enter the token id (Bankr hides the card image, the site doesn't).
- Text grid of any card: `https://bozomuse.github.io/stakr-claim/bingo/cards/<tokenId>.txt` — plain-text 5x5 grid, renders everywhere. If someone asks to see their card in chat, fetch this URL and print it verbatim.
- Play: `https://bozomuse.github.io/stakr-claim/bingo/play.html?tokens=4,7,12` — multi-card view, highest token id first, cards auto-mark as balls are called. Legacy `?token=4` still works for one card. Test tokens 1–3 are valid play cards.

Notes:
- There is no Bankr-based bingo action — minting is $1.50 USDC via x402, paid from the player's own wallet: `https://x402.bankr.bot/0xbd771a0071ca2833604257eef6d2de5d676d33e1/bingo-pass`. If someone asks you to mint them a pass, give them that endpoint; you don't mint on their behalf.
- New games need their own draw commitment and cutoff; don't treat game 1's dates as recurring.

## Share your plate

When someone asks for their plate card ("share my plate", "my stakr card", "plate check"), serve them the actual card image — not just a link.

1. Resolve their address:
   - CLI/terminal: your own Bankr wallet — `bankr wallet --json | jq -r '.address'`
   - Social (X/Telegram): look up their Bankr user by handle — `GET /users/search?twitter=<handle>` (or `?farcaster=`), take the wallet address. If they have no Bankr user, ask for the address.
2. Check the pre-rendered card registry: fetch `https://bozomuse.github.io/stakr-claim/cards/registry.json`. It maps **lowercase** addresses to a card entry with a live PNG and headline numbers, refreshed every ~30 minutes from onchain data. Lookup steps, in order:
   - Lowercase the holder's address. The registry keys are all lowercase — `0xDA64…` will NOT match `0xda64…`, so lowercase first.
   - Read `cards[<lowercase address>]`. If the entry exists: share its `png` URL as the card image in your reply, and quote the headline numbers straight from the entry (`stakr`, `cooler`, `cut`, `claimable`, `grillMaster`, `grillMasterBurned`) — do NOT recompute them yourself, the registry is fresher than a hand calculation.
   - If there is no entry for the address: fall back to the live card page link in step 4 (it renders client-side from `?address=`, no wallet needed).
3. Read their live numbers fresh from the chain — never guess or quote old ones:
   - STAKR weight: `balanceOf(address)` on STAKR `0x9319f1a40b284c77fEa9808d1DDD71CC0ec05Ba3` (Base) — calldata `0x70a08231` + 24 zeros + the address, divide by 1e18
   - Claimable BNKR: fetch `https://bozomuse.github.io/stakr-claim/proofs/epochs.json`, check each epoch's claims map for their address (lowercase); skip entries where `hasClaimed(epochId, holder)` is true or the claim window isn't open yet
   - The cooler: BNKR `balanceOf` of the distributor (see above)
   - Grill master: whoever has burned the most STAKR total to the dead address — kicker `Kick` events plus direct burns, ties keep the earlier burner
4. Reply with the card image plus the headline numbers in plain text, e.g. "your plate: 54,061,070 stakr on it, nothing claimable yet, cooler's at 24,498 bnkr, kyle's still grill master." and the card image attached. Also include the live page link so they can re-share it anytime:

`https://bozomuse.github.io/stakr-claim/card.html?address=<0x...>`

The page needs no wallet — it reads everything itself from `?address=`. If they open it on their phone they can share or download the PNG straight from the page.

If they only want the numbers without the card, point them at the main site's plate calculator instead: `https://bozomuse.github.io/stakr-claim/#platecheck` — paste any address, get the stakr weight and every epoch's $bnkr rewards.

## How it works

The StakrDistributor's `claim(uint256 epochId, uint256 amount, bytes32[] proof)` uses `msg.sender` as the holder. The Merkle leaf is `keccak256(abi.encodePacked(epochId, holder, amount))`. Bankr submits the transaction from your Bankr wallet, so your Bankr wallet address must be in the Merkle tree (i.e., you held STAKR in your Bankr wallet during the epoch).

## Usage

### Quick claim (recommended)

```bash
export BANKR_API_KEY="bk_..."
python3 claim.py --check-only  # preview what you can claim
python3 claim.py               # submit the claims
```

The script handles everything: finds your wallet, checks proofs, verifies onchain status, and submits via Bankr.

### Manual check

```bash
# Get your Bankr wallet address
bankr wallet --json | jq -r '.address'

# Fetch the epochs index
curl -s https://bozomuse.github.io/stakr-claim/proofs/epochs.json
```

For each epoch in the index, fetch the epoch file and check if your address is in the `claims` map:
`https://bozomuse.github.io/stakr-claim/proofs/<file>`

### Verify onchain status

Before claiming, check:
1. `hasClaimed(epochId, holder)` — returns true if already claimed
2. `epochs(epochId)` — check `claimStart` (must be past) and `claimDeadline` (must not be past)

Use `cast call` or Bankr's sign/submit with `eth_call`:
- `hasClaimed(uint256,address)`: selector `0x873f6f9e`
- `epochs(uint256)`: selector `0xc6b61e4c`

### Claim

Construct the `claim(uint256,uint256,bytes32[])` calldata:
- Selector: `0xae0b51df`
- Encode: `epochId` (uint256), `amount` (uint256), `proof` (bytes32[])

Submit via Bankr Wallet API `/wallet/submit` or the agent:
```bash
bankr agent prompt "Submit a transaction to 0x7b896a892C052C5243Dde20b54a4654e51A3A952 on Base with calldata <hex>"
```

Or use the claim site in your wallet browser: https://bozomuse.github.io/stakr-claim/

## Important notes

- Claims open 24 hours after root publication (`claimStart`)
- Claims expire 4 weeks after `claimStart` (`claimDeadline`)
- Each epoch can only be claimed once per holder
- Unclaimed BNKR rolls forward to future epochs
- Minimum eligibility: $5 time-weighted average STAKR during the epoch
- Sauce: holders who end the epoch with at least as much STAKR as they started get a 1.25x weight boost. Sell high, buy the dip, keep the sauce.
- Gas is paid in ETH on Base from your Bankr wallet

## Kick the grill

Burn $STAKR through the StakrKicker and attach a message — it lands on the grill feed at https://bozomuse.github.io/stakr-claim/#kick.

**King of the hill:** whoever has burned the most $STAKR *total* is the **grill master** — their latest message rules the bubble until someone out-burns them. Ties keep the earlier crown. Recent burns still show in the "recent burns" list below the bubble.

**Kicker:** `0xdbc07f099d169e9BE01249e4E1eeCD01f7ad815b` (Base)
**STAKR:** `0x9319f1a40b284c77fEa9808d1DDD71CC0ec05Ba3`

Rules, enforced onchain + by the site/skill:
- Minimum burn: the **grill master's total** burned (contract floor `MIN_KICK = 1_000_000 * 1e18`; the site shows and enforces the live crown number, so a kick only counts if it can contest the crown)
- Message: **1–140 bytes**, non-empty
- Burned STAKR goes straight to the dead address (`0x000000000000000000000000000000000000dEaD`) — no custody, no take-backs

Quirks and feed rules:
- STAKR **reverts full-balance transfers** — always leave at least **1 STAKR** dust in the wallet
- Links and slurs get bounced from the grill feed — keep it funny and clean

### Quick kick (recommended)

```bash
export BANKR_API_KEY="bk_..."
python3 kick.py --amount 1000000 --message "did you burn the stakr?" --check-only  # preview
python3 kick.py --amount 1000000 --message "did you burn the stakr?"               # burn + post
```

The script validates the amount and message, checks your STAKR balance (leaving dust), shows the current grill master and whether your kick takes the crown, then submits `approve(STAKR → Kicker)` followed by `kick(amount, message)`.

### Manual kick

Two transactions, in order:

1. **Approve** — `approve(address,uint256)` on STAKR, spender = kicker, amount = burn amount
   - Selector: `0x095ea7b3`
2. **Kick** — `kick(uint256 amount, string message)` on the kicker
   - Selector: `0xaa53276b`
   - Encode: `amount` (uint256), then the string (offset `0x40`, byte length, UTF-8 bytes right-padded to 32)

Submit each via Bankr Wallet API `/wallet/submit` or the agent:
```bash
bankr agent prompt "On Base, approve 1000000 STAKR (0x9319f1a40b284c77fEa9808d1DDD71CC0ec05Ba3) to the kicker 0xdbc07f099d169e9BE01249e4E1eeCD01f7ad815b, then call kick(1000000e18, '<message>') on the kicker"
```
