#!/usr/bin/env bash
set -e

echo ""
echo " =========================================="
echo "  Shopify Auto-Lister"
echo " =========================================="
echo ""

# Check Node.js
if ! command -v node &>/dev/null; then
  echo " ERROR: Node.js is not installed."
  echo ""
  echo " Download it from https://nodejs.org"
  echo " Install it, then run this script again."
  echo ""
  exit 1
fi

# Install dependencies on first run
if [ ! -d "node_modules" ]; then
  echo " Installing dependencies (first run only, may take a minute)..."
  echo ""
  npm install
  echo ""
fi

# Copy .env if it doesn't exist yet
if [ ! -f ".env" ] && [ -f ".env.example" ]; then
  cp ".env.example" ".env"
  echo " Created .env from .env.example"
  echo ""
fi

echo " Starting server..."
echo " Your browser will open automatically."
echo ""
echo " Press Ctrl+C to stop the app."
echo " =========================================="
echo ""

# Open browser after 3 seconds (macOS: open, Linux: xdg-open)
(sleep 3 && (open "http://localhost:3000" 2>/dev/null || xdg-open "http://localhost:3000" 2>/dev/null || true)) &

npm run dev
