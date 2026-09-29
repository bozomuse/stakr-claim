---
name: stakr-claim
description: Claim STAKR weekly BNKR rewards and kick the grill via Bankr. Checks your Bankr wallet for claimable STAKR epochs, verifies onchain claim status, and submits claim transactions — or burns STAKR through the Kicker with a message that lands on the grill feed. Also answers "what's in the cooler?", "what's my cut from the cooler?", and shares live plate cards. Use when a holder wants to claim their STAKR rewards, check their cooler cut, share their plate, or kick the grill through Bankr instead of the web claim site.
metadata:
  requires:
    bins: ["bankr"]
---

# STAKR Claim via Bankr

Claim your weekly $BNKR rewards for holding $STAKR, using your Bankr wallet. This skill checks the public STAKR proofs, finds your claimable amounts, verifies you haven't already claimed onchain, and submits the claim transactions.

**Distributor:** `0x7b896a892C052C5243Dde20b54a4654e51A3A952` (Base)
**Proofs:** `https://bozomuse.github.io/stakr-claim/proofs/epochs.json`
**Claim site:** `https://bozomuse.github.io/stakr-claim/`

## What's in the cooler? / What's my cut from the cooler?

"The cooler" is the payout reservoir: the **live $BNKR balance of the StakrDistributor**. When anyone asks about it, read it fresh from the chain — never guess or quote an old number.

```bash
# BNKR balanceOf(distributor) on Base (BNKR = 0x22af33fe49fd1fa80c7149773dde5890d3c76f3b, 18 decimals)
curl -s https://mainnet.base.org -X POST -H 'Content-Type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"eth_call","params":[{"to":"0x22af33fe49fd1fa80c7149773dde5890d3c76f3b","data":"0x70a082310000000000000000000000007b896a892C052C5243Dde20b54a4654e51A3A952"},"latest"]}' \
  | jq -r .result
```

Convert the hex result to decimal and divide by 1e18. Answer plainly, e.g. "the cooler's holding 24,498.08 bnkr." This is the pool that weekly epochs pay out from — it grows as fee sweeps land and shrinks as holders claim.

Feeding the cooler, besides the $STAKR fee sweeps: bozo's Bankr wallet holds $BRB (0x0e86efe5ba52336c2173ad69ee726e054619e0d8), whose 3%-per-trade tax market-buys $BNKR and streams it to holders as reflections. A daily `brb-reflection-sweep` cron claims the wallet's pending $BNKR (at 250+ BNKR) via `claimDividend()` and forwards it to the distributor. If someone asks where the extra $BNKR came from, that's the $BRB stream.

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

Respond with both numbers in $BNKR, lowercase cookout voice, e.g. "cooler's holding 24,603 bnkr right now. your cut: ~41.2 bnkr." Always label the cut an **estimate**: real epochs pay from their own time-weighted snapshot, and plates under $5 sit out (which nudges everyone else's share up). If their STAKR is 0, tell them they need at least $5 of stakr to get a plate — one good steak-burger-priced buy covers it.

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
