---
name: stakr-claim
description: Claim STAKR weekly BNKR rewards and kick the grill via Bankr. Checks your Bankr wallet for claimable STAKR epochs, verifies onchain claim status, and submits claim transactions — or burns STAKR through the Kicker with a message that lands on the grill feed. Also answers "what's in the cooler?" and "what's my cut from the cooler?" with the live distributor balance and the asker's estimated allotment. Use when a holder wants to claim their STAKR rewards, check their cooler cut, or kick the grill through Bankr instead of the web claim site.
metadata:
  requires:
    bins: ["bankr"]
---

# STAKR Claim via Bankr

Claim your weekly $BNKR rewards for holding $STAKR, using your Bankr wallet. This skill checks the public STAKR proofs, finds your claimable amounts, verifies you haven't already claimed onchain, and submits the claim transactions.

**Distributor:** `0x7b896a892C052C5243Dde20b54a4654e51A3A952` (Base)
**Proofs:** `https://bozomuse.github.io/stakr-claim/proofs/epochs.json`
**Claim site:** `https://bozomuse.github.io/stakr-claim/`

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

## What's in the cooler? / What's my cut from the cooler?

When someone asks "@bankrbot what's in the cooler", read the live $BNKR balance of the distributor (`balanceOf(0x7b896a892C052C5243Dde20b54a4654e51A3A952)` on BNKR `0x22af33fe49fd1fa80c7149773dde5890d3c76f3b`, Base) and answer with the amount. Never answer from memory or a dashboard — the chain is the source of truth. (Without this skill loaded, "what's in the cooler?" would return the asker's own wallet balance. Always read the distributor.)

When someone asks "@bankrbot what's my cut from the cooler" (or "what's my cut", "my cooler cut"), answer with two numbers: the total $BNKR sitting in the cooler right now, and their estimated allotment of it.

**The formula** (mirrors the claim site's plate calculator): `cut = (their STAKR × cooler BNKR) / eligible STAKR`.

### Steps

1. Get the asker's wallet address (their Bankr wallet).
2. Read their STAKR: `balanceOf(wallet)` on STAKR `0x9319f1a40b284c77fEa9808d1DDD71CC0ec05Ba3` (selector `0x70a08231`).
3. Read the cooler: `balanceOf(distributor)` on BNKR (same as above).
4. If their address is in the excluded list, or their STAKR balance is 0, their cut is 0 — say so plainly and stop.
5. Otherwise compute eligible STAKR: `totalSupply(STAKR)` (selector `0x18160ddd`) minus `balanceOf` of every excluded address below.
6. Cut = (their STAKR × cooler BNKR) / eligible STAKR. Values are in wei (up to 1e29) — do the math in Python with full-precision ints, not bash arithmetic (64-bit overflows here). Present a rounded number. Do the division with full precision, then present a rounded number.

### Excluded plates (never earn, always subtract)

- `0x000000000000000000000000000000000000dEaD` (burned)
- `0x7b896a892C052C5243Dde20b54a4654e51A3A952` (the distributor itself)
- `0x72b30a9DfEEdC67e8a554e16bFCA3b57600f7258` (keeper)
- `0x498581fF718922c3f8e6A244956aF099B2652b2b` (pool)
- `0xBDF938149ac6a781F94FAa0ed45E6A0e984c6544` (fee hook)
- `0xbd771a0071ca2833604257eef6d2de5d676d33e1` (bozo's bankr wallet — house wallet, can't play)
- `0xe7aD68a354403660b4BEB99068580431D5c72602` (work wallet — house wallet, can't play)

### Respond

Both numbers in $BNKR, lowercase cookout voice. Example: "cooler's holding 24,603 bnkr right now. your cut: ~41.2 bnkr."

Always label the cut an **estimate**: real epochs pay from their own time-weighted snapshot, and plates under $5 sit out (which nudges everyone else's share up). If their STAKR is 0, tell them they need at least $5 of stakr to get a plate — one good steak-burger-priced buy covers it.

## Kick the grill

Burn $STAKR through the StakrKicker and attach a message — it lands on the grill feed at https://bozomuse.github.io/stakr-claim/#kick.

**King of the hill:** whoever has burned the most $STAKR *total* is the **grill master** — their latest message rules the bubble until someone out-burns them. Ties keep the earlier crown. Recent burns still show in the "recent burns" list below the bubble.

**Kicker:** `0xdbc07f099d169e9BE01249e4E1eeCD01f7ad815b` (Base)
**STAKR:** `0x9319f1a40b284c77fEa9808d1DDD71CC0ec05Ba3`

Rules, enforced onchain:
- Minimum burn: **1,000,000 STAKR** (`MIN_KICK = 1_000_000 * 1e18`)
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
