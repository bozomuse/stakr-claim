#!/bin/bash
# Install the STAKR claim skill for Bankr
# Usage: curl -sSL https://bozomuse.github.io/stakr-claim/bankr-skill/install.sh | bash

set -e

SKILL_DIR="$HOME/.stakr-claim"
BASE_URL="https://bozomuse.github.io/stakr-claim/bankr-skill"

echo "Installing STAKR claim skill..."

mkdir -p "$SKILL_DIR"
curl -sSL "$BASE_URL/claim.py" -o "$SKILL_DIR/claim.py"
curl -sSL "$BASE_URL/README.md" -o "$SKILL_DIR/README.md"
chmod +x "$SKILL_DIR/claim.py"

echo ""
echo "✓ Installed to $SKILL_DIR"
echo ""
echo "To claim your STAKR rewards:"
echo "  export BANKR_API_KEY='bk_...'"
echo "  python3 $SKILL_DIR/claim.py --check-only  # preview"
echo "  python3 $SKILL_DIR/claim.py               # claim"
echo ""
echo "Get your Bankr API key at https://bankr.bot/api-keys"
