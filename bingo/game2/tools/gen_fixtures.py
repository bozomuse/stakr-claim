#!/usr/bin/env python3
"""Generate FIXTURE data for the game-2 play site preview.

Writes (all under the game2/ dir):
  wallets.json                  { "<lowercase 0x address>": [tokenIds] }
  metadata/<tokenId>.json       fake card metadata (Numbers attribute, 24 nums)
  games/2/state.json            mid-game paused fixture (frame hit, unpaid)
  games/2/draw.json             precomputed draw order + stage hits fixture

The fixture is coherent: pass 1003 (wallet 0x1111...) really does complete a
picture frame on the last called ball; single/double winners are derived from
the rigged cards. Production replaces every one of these files:
wallets.json is built once from CardMinted events after mint closes.
"""
import json
import os
import random

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)  # game2/
rng = random.Random(20261011)

COLS = [("B", 1, 15), ("I", 16, 30), ("N", 31, 45), ("G", 46, 60), ("O", 61, 75)]

# slot order matches CookoutBingoPass._drawCard packing:
# B rows 0-4, I rows 0-4, N rows 0,1,3,4, G rows 0-4, O rows 0-4
def slot_col_row(slot):
    if slot < 5:
        return 0, slot
    if slot < 10:
        return 1, slot - 5
    if slot < 14:
        return 2, [0, 1, 3, 4][slot - 10]
    if slot < 19:
        return 3, slot - 14
    return 4, slot - 19

FRAME_SLOTS = [s for s in range(24) if (lambda c, r: r in (0, 4) or c in (0, 4))(*slot_col_row(s))]
ROW0_SLOTS = [0, 5, 10, 14, 19]          # B0 I0 N0 G0 O0
ROW4_SLOTS = [4, 9, 13, 18, 23]          # B4 I4 N4 G4 O4

WALLET_A = "0x1111111111111111111111111111111111111111"
WALLET_B = "0x2222222222222222222222222222222222222222"
PASSES_A = list(range(1001, 1007))       # 6-pack
PASSES_B = list(range(1007, 1042))       # 35-pack

CALLED_52 = rng.sample(range(1, 76), 52)
BALL_INDEX = {b: i for i, b in enumerate(CALLED_52)}  # draw order position


def pick_from_prefix(slots, prefix_len, force_ball=None, force_slot=None):
    """Assign distinct in-range balls from called[:prefix_len] to slots.
    Returns {slot: ball}. If force_ball/force_slot given, that pair is fixed."""
    prefix = CALLED_52[:prefix_len]
    assigned = {}
    if force_ball is not None:
        assigned[force_slot] = force_ball
    used = set(assigned.values())
    for s in slots:
        if s in assigned:
            continue
        col, _row = slot_col_row(s)
        lo, hi = COLS[col][1], COLS[col][2]
        cands = [b for b in prefix if lo <= b <= hi and b not in used]
        if not cands:
            raise RuntimeError(f"no candidate ball for slot {s}")
        b = rng.choice(cands)
        assigned[s] = b
        used.add(b)
    return assigned


def gen_card(rigged):
    """rigged: {slot: ball}. Fill remaining slots with valid unique-per-column numbers."""
    nums = [None] * 24
    used_by_col = {c: set() for c in range(5)}
    for s, b in rigged.items():
        nums[s] = b
        used_by_col[slot_col_row(s)[0]].add(b)
    for s in range(24):
        if nums[s] is not None:
            continue
        col, _row = slot_col_row(s)
        lo, hi = COLS[col][1], COLS[col][2]
        pool = [n for n in range(lo, hi + 1) if n not in used_by_col[col]]
        n = rng.choice(pool)
        nums[s] = n
        used_by_col[col].add(n)
    return nums


def winning_ball_of(assigned):
    """Latest-drawn ball among assigned {slot: ball} and its 1-based balls_drawn."""
    b = max(assigned.values(), key=lambda x: BALL_INDEX[x])
    return b, BALL_INDEX[b] + 1


def fake_tx():
    return "0x" + "".join(rng.choice("0123456789abcdef") for _ in range(64))


# Rig the three winner cards. Frame completes exactly on the last called ball.
frame_rig = pick_from_prefix(
    FRAME_SLOTS, 52,
    force_ball=CALLED_52[51], force_slot=next(
        s for s in FRAME_SLOTS
        if COLS[slot_col_row(s)[0]][1] <= CALLED_52[51] <= COLS[slot_col_row(s)[0]][2]
    ),
)
single_rig = pick_from_prefix(ROW0_SLOTS, 28)
double_rig = pick_from_prefix(ROW0_SLOTS + ROW4_SLOTS, 45)

rigged = {1001: single_rig, 1002: double_rig, 1003: frame_rig}

cards = {}
for tid in PASSES_A + PASSES_B:
    cards[tid] = gen_card(rigged.get(tid, {}))

sb, sb_n = winning_ball_of(single_rig)
db, db_n = winning_ball_of(double_rig)
fb, fb_n = winning_ball_of(frame_rig)
assert fb_n == 52, "frame must complete on the final called ball"

os.makedirs(os.path.join(ROOT, "metadata"), exist_ok=True)
os.makedirs(os.path.join(ROOT, "games", "2"), exist_ok=True)

# wallets.json
with open(os.path.join(ROOT, "wallets.json"), "w") as f:
    json.dump({WALLET_A: PASSES_A, WALLET_B: PASSES_B}, f, indent=2)
    f.write("\n")

# metadata fixtures
for tid, nums in cards.items():
    meta = {
        "name": f"Cookout Bingo Pass #{tid} (FIXTURE)",
        "attributes": [{"trait_type": "Numbers", "value": ",".join(map(str, nums))}],
    }
    with open(os.path.join(ROOT, "metadata", f"{tid}.json"), "w") as f:
        json.dump(meta, f)

# draw.json fixture
draw = {
    "game_id": 2,
    "note": "FIXTURE: coherent fake draw for site preview only. Production file is generated from the committed blockhash via draw.py.",
    "draw_order_commit": {
        "block_number": 52500000,
        "block_hash": "0x" + "".join(rng.choice("0123456789abcdef") for _ in range(64)),
        "algorithm": "Fisher-Yates over balls 1..75 (see draw.py)",
    },
    "draw_order": CALLED_52 + [b for b in range(1, 76) if b not in CALLED_52],
    "stage_hits": {
        "single": {"winning_ball": sb, "balls_drawn": sb_n,
                   "winners": [{"token_id": 1001, "owner": WALLET_A}]},
        "double": {"winning_ball": db, "balls_drawn": db_n,
                   "winners": [{"token_id": 1002, "owner": WALLET_A}]},
        "frame": {"winning_ball": fb, "balls_drawn": fb_n,
                  "winners": [{"token_id": 1003, "owner": WALLET_A}]},
    },
}

# state.json fixture: mid-game, paused for the unpaid frame
state = {
    "game_id": 2,
    "status": "paused",
    "note": "FIXTURE: simulated mid-game state for site preview. Production file is written by the draw runner and payout flow.",
    "balls_called": 52,
    "called": CALLED_52,
    "draw_order_commit": draw["draw_order_commit"],
    "stages": [
        {"stage": "single",
         "winners": [{"token_id": 1001, "owner": WALLET_A}],
         "winning_ball": sb, "balls_drawn": sb_n,
         "paid": True, "paid_tx": fake_tx()},
        {"stage": "double",
         "winners": [{"token_id": 1002, "owner": WALLET_A}],
         "winning_ball": db, "balls_drawn": db_n,
         "paid": True, "paid_tx": fake_tx()},
        {"stage": "frame",
         "winners": [{"token_id": 1003, "owner": WALLET_A}],
         "winning_ball": fb, "balls_drawn": fb_n,
         "paid": False, "paid_tx": None},
    ],
    "updated_at": "2026-10-11T12:00:00-04:00",
}

with open(os.path.join(ROOT, "games", "2", "draw.json"), "w") as f:
    json.dump(draw, f, indent=2)
    f.write("\n")
with open(os.path.join(ROOT, "games", "2", "state.json"), "w") as f:
    json.dump(state, f, indent=2)
    f.write("\n")

print(f"wallets: 2 fixture wallets, {len(cards)} passes")
print(f"single hit: ball {sb} at {sb_n} drawn (pass 1001, paid)")
print(f"double hit: ball {db} at {db_n} drawn (pass 1002, paid)")
print(f"frame hit:  ball {fb} at {fb_n} drawn (pass 1003, UNPAID -> highlight demo)")
