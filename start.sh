#!/usr/bin/env bash
set -e

echo ""
echo " =========================================="
echo "  Shopify Auto-Lister"
echo " =========================================="
echo ""

# ── Check Node.js ─────────────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  echo " ERROR: Node.js is not installed."
  echo ""
  echo " Node.js is required to run this app. To install it:"
  echo ""
  echo "   macOS (recommended — via Homebrew):"
  echo "     1. Install Homebrew if you don't have it:"
  echo "          /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
  echo "     2. Then run:  brew install node"
  echo ""
  echo "   macOS / Linux (direct download):"
  echo "     Go to https://nodejs.org and download the LTS version"
  echo ""
  echo "   Linux (apt):"
  echo "     sudo apt install nodejs npm"
  echo ""
  echo " After installing Node.js, run this script again."
  echo ""
  # Try to open the download page
  open "https://nodejs.org" 2>/dev/null || xdg-open "https://nodejs.org" 2>/dev/null || true
  exit 1
fi

# ── Install dependencies on first run ─────────────────────────────────────────
if [ ! -d "node_modules" ]; then
  echo " Installing dependencies (first run only, takes about a minute)..."
  echo ""
  npm install
  echo ""
fi

# ── Copy .env if missing ──────────────────────────────────────────────────────
if [ ! -f ".env" ] && [ -f ".env.example" ]; then
  cp ".env.example" ".env"
  echo " Created .env — you can add API keys there or in the app's Settings panel."
  echo ""
fi

# ── Check AI provider ─────────────────────────────────────────────────────────
if ! command -v ollama &>/dev/null; then
  echo " ── AI Provider Setup ──────────────────────────────────────────"
  echo ""
  echo " No AI provider detected. You need one of the following:"
  echo ""
  echo " OPTION A — Ollama (free, runs on your Mac/PC):"
  echo "   1. Go to  https://ollama.com  and download Ollama"
  echo "   2. Install it, then open a NEW terminal window and run:"
  echo "        ollama pull qwen3:8b"
  echo "        ollama serve"
  echo "   3. Come back and run ./start.sh again"
  echo ""
  echo " OPTION B — Claude API (cloud, faster, no local install):"
  echo "   1. Go to  https://console.anthropic.com  and create an account"
  echo "   2. Generate an API key"
  echo "   3. Start the app below, then open Settings and enter your key"
  echo ""
  echo " ───────────────────────────────────────────────────────────────"
  echo ""
  echo " If you've chosen Option B, the app will open now."
  echo " If you've chosen Option A, press Ctrl+C and set up Ollama first."
  echo ""
  read -rp " Continue and open the app now? [y/N] " answer
  [[ "$answer" =~ ^[Yy]$ ]] || exit 0
  echo ""
else
  # Ollama is installed — check if it's running
  if ! curl -s http://localhost:11434 &>/dev/null; then
    echo " Note: Ollama is installed but not running."
    echo " Open a separate terminal and run:  ollama serve"
    echo ""
  fi
fi

# ── Start ─────────────────────────────────────────────────────────────────────
echo " Starting Shopify Auto-Lister..."
echo " Opening http://localhost:3000 in your browser in a moment."
echo ""
echo " Press Ctrl+C to stop the app."
echo " =========================================="
echo ""

(sleep 3 && (open "http://localhost:3000" 2>/dev/null || xdg-open "http://localhost:3000" 2>/dev/null || true)) &

npm run dev
