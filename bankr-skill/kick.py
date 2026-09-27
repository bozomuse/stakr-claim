#!/usr/bin/env python3
"""
STAKR kick-the-grill via Bankr - burn STAKR through the StakrKicker
and attach a message that shows up on the grill feed.

Usage:
  export BANKR_API_KEY="bk_..."
  python3 kick.py --amount 1000000 --message "did you burn the stakr?"
  python3 kick.py --amount 1000000 --message "..." --check-only  # preview

The script:
1. Validates amount (>= 1M STAKR) and message (1-140 bytes, no links)
2. Checks your STAKR balance, leaving at least 1 STAKR dust
   (STAKR reverts full-balance transfers)
3. Submits approve(STAKR -> Kicker) then kick(amount, message) via Bankr
"""

import json
import os
import re
import sys
import urllib.request

BANKR_API = "https://api.bankr.bot"
CHAIN = "base"

STAKR = "0x9319f1a40b284c77fEa9808d1DDD71CC0ec05Ba3"
KICKER = "0xdbc07f099d169e9BE01249e4E1eeCD01f7ad815b"

MIN_KICK = 1_000_000 * 10**18   # 1M STAKR
DUST = 1 * 10**18               # always leave >= 1 STAKR (full-balance transfers revert)
MAX_MSG = 140                   # bytes

SEL_APPROVE = "0x095ea7b3"
SEL_KICK = "0xaa53276b"
SEL_BALANCE_OF = "0x70a08231"


def api_get(path):
    req = urllib.request.Request(
        f"{BANKR_API}{path}",
        headers={"X-API-Key": os.environ["BANKR_API_KEY"]},
    )
    with urllib.request.urlopen(req) as r:
        return json.load(r)


def api_post(path, data):
    req = urllib.request.Request(
        f"{BANKR_API}{path}",
        data=json.dumps(data).encode(),
        headers={"X-API-Key": os.environ["BANKR_API_KEY"], "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req) as r:
        return json.load(r)


def get_wallet_address():
    me = api_get("/wallet/me")
    for key in ["address", "evmAddress", "walletAddress"]:
        if key in me:
            return me[key]
    if "wallets" in me:
        for w in me["wallets"]:
            if w.get("chain") in ["base", "ethereum", "evm"] or "address" in w:
                return w["address"]
    raise Exception(f"Could not find wallet address in: {me}")


def eth_call(to, data):
    rpc = "https://mainnet.base.org"
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "eth_call",
        "params": [{"to": to, "data": data}, "latest"],
    }
    req = urllib.request.Request(
        rpc, data=json.dumps(payload).encode(), headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req) as r:
        res = json.load(r)
    return res.get("result", "0x")


def u256(n):
    return format(int(n), "064x")


def enc_addr(a):
    return a.lower().replace("0x", "").zfill(64)


def encode_approve(spender, amount):
    return SEL_APPROVE[2:] + enc_addr(spender) + u256(amount)


def encode_kick(amount, message):
    # kick(uint256 amount, string message)
    mb = message.encode("utf-8")
    padded_len = ((len(mb) + 31) // 32) * 32
    out = SEL_KICK[2:]
    out += u256(amount)
    out += u256(64)  # offset to message bytes
    out += u256(len(mb))
    out += mb.hex().ljust(padded_len * 2, "0")
    return "0x" + out


def stakr_balance(holder):
    data = SEL_BALANCE_OF + enc_addr(holder)
    return int(eth_call(STAKR, data), 16)


def main():
    if "BANKR_API_KEY" not in os.environ:
        print("Error: Set BANKR_API_KEY environment variable")
        sys.exit(1)

    args = sys.argv[1:]
    check_only = "--check-only" in args
    args = [a for a in args if a != "--check-only"]

    amount = None
    message = None
    for i, a in enumerate(args):
        if a == "--amount" and i + 1 < len(args):
            amount = int(float(args[i + 1]) * 10**18)
        elif a == "--message" and i + 1 < len(args):
            message = args[i + 1]

    if amount is None or message is None:
        print('Usage: python3 kick.py --amount <STAKR> --message "<text>" [--check-only]')
        print("  amount:  STAKR to burn (min 1,000,000)")
        print("  message: 1-140 bytes, shown on the grill feed (no links)")
        sys.exit(1)

    # --- validate ---
    if amount < MIN_KICK:
        print(f"Error: minimum kick is 1,000,000 STAKR (got {amount / 10**18:,.0f})")
        sys.exit(1)
    mb = message.encode("utf-8")
    if not (1 <= len(mb) <= MAX_MSG):
        print(f"Error: message must be 1-{MAX_MSG} bytes (got {len(mb)})")
        sys.exit(1)
    if re.search(r"https?://|www\.", message, re.IGNORECASE):
        print("Error: links get bounced from the grill feed — drop the URL.")
        sys.exit(1)

    print("Getting Bankr wallet address...")
    wallet = get_wallet_address()
    print(f"Wallet: {wallet}")

    bal = stakr_balance(wallet)
    print(f"STAKR balance: {bal / 10**18:,.2f}")
    if bal - amount < DUST:
        print(
            f"Error: kicking {amount / 10**18:,.0f} would leave < 1 STAKR dust — "
            "STAKR reverts full-balance transfers. Lower the amount."
        )
        sys.exit(1)

    print(f"\nBurn:    {amount / 10**18:,.0f} STAKR -> dead")
    print(f'Message: "{message}"')

    if check_only:
        print("\n--check-only: not submitting.")
        return

    # 1. approve the kicker
    print("\n1/2 approving kicker...")
    try:
        res = api_post(
            "/wallet/submit",
            {"chain": CHAIN, "to": STAKR, "data": "0x" + encode_approve(KICKER, amount), "value": "0"},
        )
        print(f"  approve submitted: {json.dumps(res)[:200]}")
    except Exception as e:
        print(f"  approve failed: {e}")
        sys.exit(1)

    # 2. kick
    print("2/2 kicking...")
    try:
        res = api_post(
            "/wallet/submit",
            {"chain": CHAIN, "to": KICKER, "data": encode_kick(amount, message), "value": "0"},
        )
        print(f"  kick submitted: {json.dumps(res)[:200]}")
    except Exception as e:
        print(f"  kick failed: {e}")
        sys.exit(1)

    print("\nDone — your message will hit the grill feed shortly: https://bozomuse.github.io/stakr-claim/#kick")


if __name__ == "__main__":
    main()
