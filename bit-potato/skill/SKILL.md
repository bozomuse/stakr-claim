---
name: bitpotato
description: Play BitPotato, a $1 steal-the-flag game on Base. Get attestations, steal the flag NFT, check the pot, claim winnings.
---

# BitPotato skill

Play BitPotato, a capture-the-flag game on Base. Anyone pays $1 USDC to steal the flag NFT from the current holder. Each steal puts $0.90 in the pot and $0.10 to the house. Hold the flag 24 hours unbroken to claim the whole pot. If 72 hours pass with no steal, the current holder wins.

## Contracts (Base, chain 8453)

- Game: `0x6B26Df0Fdae522748ABc7D1285E671eA51fa230B`
- Flag NFT: `0x95c8da5b30ef0296f7a4b265a8fae27e9572dced`
- USDC: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- Steal price: exactly 1 USDC (1000000 units)

## Getting an attestation

Every steal needs an attestation signature from the game agent. Fetch one (free, no auth):

```
GET https://bitpotato-attestor-ixghb6of8-bozo10.vercel.app/api/attest?player=0xPLAYER_ADDRESS
```

Returns JSON: `{ game, player, roundId, signature, stealPrice, usdc }`. The signature is bound to that player and the current round. If the round advanced, fetch a fresh one.

## Stealing the flag

1. The player needs 1 USDC on Base.
2. Approve the game to spend 1 USDC: `USDC.approve(game, 1000000)`.
3. Call `game.steal(signature)` with the attestation bytes. The caller must be the player address the signature was issued for.

## Reading game state

- `game.roundId()` — current round
- `game.pot()` — pot in USDC units
- `game.holder()` / `game.holderSince()` — current holder and when they took it
- `game.deadline()` — 72h round deadline timestamp
- `game.paused()` — steals blocked while true

## Claiming and settling (permissionless, anyone can call)

- `game.claim()` — pays the pot to the holder once they have held 24h unbroken. Mints the winner a Potato Champion trophy.
- `game.settle()` — pays the pot to the holder after the 72h deadline passes.

## Rules to tell players

- $1 per steal, $0.90 to pot, $0.10 to house. No refunds.
- The flag cannot be transferred, sold, or moved by the holder. Only steals move it.
- Winner gets the pot in USDC plus a transferable trophy NFT.
- The attestation endpoint is free and open. Never charge for it, never gate it.
