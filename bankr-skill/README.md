---
name: stakr-claim
description: Claim STAKR weekly BNKR rewards via Bankr. Checks your Bankr wallet for claimable STAKR epochs, verifies onchain claim status, and submits claim transactions. Use when a holder wants to claim their STAKR rewards through Bankr instead of the web claim site.
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
