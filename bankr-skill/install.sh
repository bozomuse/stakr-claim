#!/bin/bash
# Install the STAKR claim skill for Bankr
# Usage: curl -sSL https://bozomuse.github.io/stakr-claim/bankr-skill/install.sh | bash

set -e

SKILL_DIR="$HOME/.stakr-claim"
# raw.githubusercontent serves every file verbatim (GitHub Pages renders
# README.md -> README.html, so the Pages URL can't be used for it)
BASE_URL="https://raw.githubusercontent.com/bozomuse/stakr-claim/master/bankr-skill"

echo "Installing STAKR claim skill..."

mkdir -p "$SKILL_DIR"
curl -sSL "$BASE_URL/claim.py" -o "$SKILL_DIR/claim.py"
curl -sSL "$BASE_URL/kick.py" -o "$SKILL_DIR/kick.py"
curl -sSL "$BASE_URL/README.md" -o "$SKILL_DIR/README.md"
chmod +x "$SKILL_DIR/claim.py" "$SKILL_DIR/kick.py"

echo ""
echo "✓ Installed to $SKILL_DIR"
echo ""
echo "To claim your STAKR rewards:"
echo "  export BANKR_API_KEY='bk_...'"
echo "  python3 $SKILL_DIR/claim.py --check-only  # preview"
echo "  python3 $SKILL_DIR/claim.py               # claim"
echo ""
echo "To kick the grill (burn STAKR + post a message):"
echo "  python3 $SKILL_DIR/kick.py --amount 1000000 --message 'did you burn the stakr?' --check-only  # preview"
echo "  python3 $SKILL_DIR/kick.py --amount 1000000 --message 'did you burn the stakr?'               # burn + post"
echo ""
echo "Get your Bankr API key at https://bankr.bot/api-keys"
