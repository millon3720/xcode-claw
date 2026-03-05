#!/usr/bin/env bash
# xcode-claw installer — macOS only
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

SKILL_NAME="xcode-claw"
SKILL_DIR="$HOME/.openclaw/skills/$SKILL_NAME"

log()  { echo -e "${CYAN}[xcode-claw]${NC} $*"; }
ok()   { echo -e "${GREEN}[✓]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }
fail() { echo -e "${RED}[✗]${NC} $*"; exit 1; }

# ── OS check ──────────────────────────────────────────────────────────────────
if [[ "$(uname)" != "Darwin" ]]; then
  fail "This installer is macOS only."
fi

echo
echo -e "${BOLD}${CYAN}XcodeClaw${NC} — Xcode & Apple platform skill for OpenClaw"
echo

# ── Xcode / CLT check ─────────────────────────────────────────────────────────
log "Checking Xcode toolchain…"

if ! command -v xcodebuild &>/dev/null; then
  warn "xcodebuild not found. Attempting to install Command Line Tools…"
  xcode-select --install 2>/dev/null || true
  echo
  echo -e "${YELLOW}  Please complete the CLT installation dialog, then re-run install.sh.${NC}"
  exit 1
fi

XC_VER=$(xcodebuild -version 2>/dev/null | head -1 || echo "unknown")
ok "Xcode toolchain: $XC_VER"

# ── node / npm ────────────────────────────────────────────────────────────────
if ! command -v node &>/dev/null || ! command -v npm &>/dev/null; then
  fail "node/npm not found. Install via: brew install node"
fi
ok "Node.js $(node --version)"

# ── uv ────────────────────────────────────────────────────────────────────────
if ! command -v uv &>/dev/null; then
  warn "uv not found — installing…"
  curl -LsSf https://astral.sh/uv/install.sh | sh
  export PATH="$HOME/.cargo/bin:$HOME/.local/bin:$PATH"
  command -v uv &>/dev/null || fail "uv install failed. Run: brew install uv"
  ok "uv installed"
fi
ok "uv $(uv --version)"

# ── Copy files ────────────────────────────────────────────────────────────────
log "Installing to $SKILL_DIR…"
mkdir -p "$SKILL_DIR"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
rsync -a \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='dist' \
  --exclude='__pycache__' \
  --exclude='.venv' \
  --exclude='*.pyc' \
  "$SCRIPT_DIR/" "$SKILL_DIR/"
ok "Files copied"

cd "$SKILL_DIR"

# ── Python deps ───────────────────────────────────────────────────────────────
log "Installing Python dependencies…"
uv sync --quiet
ok "Python dependencies ready"

# ── Node deps ─────────────────────────────────────────────────────────────────
log "Installing Node.js dependencies…"
npm install --silent --no-fund --no-audit
ok "Node.js dependencies ready"

# ── TypeScript build ──────────────────────────────────────────────────────────
log "Building TypeScript MCP server…"
npm run build --silent
ok "TypeScript compiled → dist/"

# ── OpenClaw registration ─────────────────────────────────────────────────────
OPENCLAW_CONFIG="$HOME/.openclaw/openclaw.json"
mkdir -p "$HOME/.openclaw"

if [[ ! -f "$OPENCLAW_CONFIG" ]]; then
  echo '{"skills":{"entries":{}}}' > "$OPENCLAW_CONFIG"
  log "Created openclaw.json"
fi

log "Registering skill in openclaw.json…"
uv run python - <<PYEOF
import json, pathlib

cfg_path = pathlib.Path("$OPENCLAW_CONFIG")
cfg = json.loads(cfg_path.read_text())
cfg.setdefault("skills", {}).setdefault("entries", {})["xcode"] = {
    "enabled": True,
    "command": "node $SKILL_DIR/dist/index.js",
    "env": {
        "XCODE_CLAW_DEFAULT_SDK": "iphonesimulator",
        "XCODE_CLAW_DERIVED_DATA": "",
        "XCODE_CLAW_LOG_LEVEL": "normal",
        "XCODE_DEVELOPER_DIR": ""
    }
}
cfg_path.write_text(json.dumps(cfg, indent=2))
print("  registered: xcode → $SKILL_DIR/dist/index.js")
PYEOF

ok "Skill registered in openclaw.json"

# ── Smoke test ────────────────────────────────────────────────────────────────
log "Running doctor check…"
uv run python scripts/xcode_claw.py swift-version 2>/dev/null || true

# ── Done ──────────────────────────────────────────────────────────────────────
echo
echo -e "${GREEN}${BOLD}✓ xcode-claw installed successfully!${NC}"
echo
echo -e "${BOLD}Quick start:${NC}"
echo
echo -e "  Check your setup:"
echo -e "    ${CYAN}cd $SKILL_DIR && uv run python scripts/xcode_claw.py doctor${NC}"
echo
echo -e "  Build from your project directory:"
echo -e "    ${CYAN}uv run python scripts/xcode_claw.py build${NC}"
echo
echo -e "  Use in OpenClaw:"
echo -e '    "Build my iOS app in Release mode"'
echo -e '    "Run tests on iPhone 15 simulator"'
echo -e '    "List all available simulators"'
echo -e '    "Check my signing certificates"'
echo
echo -e "${CYAN}Docs:${NC} https://github.com/FinPyromancerLog/xcode-claw"
