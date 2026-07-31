#!/bin/bash
# ==============================================================================
# RAGE OPTIMISER — INSTALLATION SCRIPT
# ==============================================================================

echo "⚙️  Starting installation sequence..."

# Verify Node version
NODE_VER=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VER" -lt 20 ]; then
  echo "❌ Error: Node.js version 20 or higher is required. Found v$NODE_VER"
  exit 1
fi

echo "📦 Installing workspaces dependencies..."
npm install

echo "🛠️  Compiling project modules..."
npm run build

echo "✅ Installation completed successfully! Configure .env and run ./start.sh to launch."
