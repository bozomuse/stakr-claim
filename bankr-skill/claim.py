#!/usr/bin/env python3
"""
STAKR claim via Bankr - lets holders claim their weekly BNKR rewards
using their Bankr wallet.

Usage:
  export BANKR_API_KEY="bk_..."
  python3 claim.py [--check-only]

The script:
1. Gets your Bankr wallet address
2. Fetches STAKR epoch proofs from the public site
3. Finds your claimable amounts
4. Checks onchain if you've already claimed
5. Submits claim transactions via Bankr (unless --check-only)
"""

import json
import os
import sys
import urllib.request
import urllib.parse

BANKR_API = "https://api.bankr.bot"
DISTRIBUTOR = "0x7b896a892C052C5243Dde20b54a4654e51A3A952"
PROOFS_BASE = "https://bozomuse.github.io/stakr-claim/proofs/"
CHAIN = "base"

# Selectors
SEL_CLAIM = "0xae0b51df"
SEL_HAS_CLAIMED = "0x873f6f9e"
SEL_EPOCHS = "0xc6b61e4c"

def api_get(path):
    req = urllib.request.Request(
        f"{BANKR_API}{path}",
        headers={"X-API-Key": os.environ["BANKR_API_KEY"]}
    )
    with urllib.request.urlopen(req) as r:
        return json.load(r)

def api_post(path, data):
    req = urllib.request.Request(
        f"{BANKR_API}{path}",
        data=json.dumps(data).encode(),
        headers={"X-API-Key": os.environ["BANKR_API_KEY"], "Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req) as r:
        return json.load(r)

def get_wallet_address():
    me = api_get("/wallet/me")
    # Try common response shapes
    for key in ["address", "evmAddress", "walletAddress"]:
        if key in me:
            return me[key]
    # Check nested
    if "wallets" in me:
        for w in me["wallets"]:
            if w.get("chain") in ["base", "ethereum", "evm"] or "address" in w:
                return w["address"]
    raise Exception(f"Could not find wallet address in: {me}")

def fetch_json(url):
    with urllib.request.urlopen(url) as r:
        return json.load(r)

def u256(n):
    return BigInt_to_hex(n)

def BigInt_to_hex(n):
    # n can be int or str
    val = int(str(n))
    return format(val, '064x')

def enc_addr(a):
    return a.lower().replace('0x', '').zfill(64)

def encode_claim(epoch_id, amount, proof):
    # claim(uint256,uint256,bytes32[])
    # offset for proof array = 3 * 32 = 96 bytes = 0x60
    out = SEL_CLAIM[2:]  # strip 0x
    out += BigInt_to_hex(epoch_id)
    out += BigInt_to_hex(amount)
    out += BigInt_to_hex(96)  # offset to proof array
    out += BigInt_to_hex(len(proof))
    for p in proof:
        out += p.lower().replace('0x', '').zfill(64)
    return "0x" + out

def eth_call(to, data):
    # Use Bankr's sign/submit? No, we need eth_call.
    # Bankr Wallet API doesn't have a direct eth_call.
    # We'll use a public RPC for reads.
    rpc = "https://mainnet.base.org"
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "eth_call",
        "params": [{"to": to, "data": data}, "latest"]
    }
    req = urllib.request.Request(
        rpc,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req) as r:
        res = json.load(r)
    return res.get("result", "0x")

def has_claimed(epoch_id, holder):
    data = SEL_HAS_CLAIMED + BigInt_to_hex(epoch_id) + enc_addr(holder)
    res = eth_call(DISTRIBUTOR, data)
    return int(res, 16) == 1

def get_epoch_info(epoch_id):
    data = SEL_EPOCHS + BigInt_to_hex(epoch_id)
    res = eth_call(DISTRIBUTOR, data)
    # epochs returns (uint256 claimStart, uint256 claimDeadline, bytes32 root, uint256 totalAllocated, uint256 claimed)
    # Each 32 bytes
    h = res[2:]  # strip 0x
    if len(h) < 320:
        return None
    claim_start = int(h[0:64], 16)
    claim_deadline = int(h[64:128], 16)
    return {"claimStart": claim_start, "claimDeadline": claim_deadline}

def main():
    if "BANKR_API_KEY" not in os.environ:
        print("Error: Set BANKR_API_KEY environment variable")
        sys.exit(1)

    check_only = "--check-only" in sys.argv

    print("Getting Bankr wallet address...")
    wallet = get_wallet_address()
    print(f"Wallet: {wallet}")

    print("\nFetching STAKR epochs...")
    idx = fetch_json(PROOFS_BASE + "epochs.json")
    epochs = idx.get("epochs", [])

    if not epochs:
        print("No epochs published yet. Check back after the first weekly distribution.")
        return

    claimable = []
    for ep in epochs:
        epoch_id = ep["id"]
        print(f"\n--- Epoch {epoch_id} ---")

        # Fetch epoch proofs
        epoch_data = fetch_json(PROOFS_BASE + ep["file"])
        claims = epoch_data.get("claims", {})
        
        # Find our claim (case-insensitive)
        our_claim = None
        for addr, claim_info in claims.items():
            if addr.lower() == wallet.lower():
                our_claim = claim_info
                break

        if not our_claim:
            print(f"  No claim for {wallet} in this epoch")
            continue

        amount = our_claim["amount"]
        proof = our_claim["proof"]
        amount_bnkr = int(amount) / 1e18
        print(f"  Amount: {amount_bnkr:.4f} BNKR")

        # Check if already claimed
        if has_claimed(epoch_id, wallet):
            print(f"  Already claimed ✓")
            continue

        # Check epoch timing
        info = get_epoch_info(epoch_id)
        if info:
            import time
            now = int(time.time())
            if now < info["claimStart"]:
                print(f"  Claims not open yet (opens at {info['claimStart']})")
                continue
            if now > info["claimDeadline"]:
                print(f"  Claim window expired")
                continue

        print(f"  ✓ Claimable!")
        claimable.append((epoch_id, amount, proof))

    if not claimable:
        print("\nNo claimable rewards found.")
        return

    if check_only:
        print(f"\n{len(claimable)} epoch(s) claimable. Run without --check-only to claim.")
        return

    print(f"\nClaiming {len(claimable)} epoch(s)...")
    for epoch_id, amount, proof in claimable:
        print(f"\nClaiming epoch {epoch_id}...")
        calldata = encode_claim(epoch_id, amount, proof)
        
        # Submit via Bankr
        try:
            result = api_post("/wallet/submit", {
                "chain": CHAIN,
                "to": DISTRIBUTOR,
                "data": calldata,
                "value": "0"
            })
            print(f"  Submitted: {json.dumps(result)[:200]}")
        except Exception as e:
            print(f"  Failed: {e}")

if __name__ == "__main__":
    main()
