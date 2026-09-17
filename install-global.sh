#!/bin/bash
set -e
INSTALL_DIR="$HOME/.open-sdd"
echo "🚀 Installing open-sdd globally..."
mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"
echo "📥 Downloading..."
curl -fsSL https://github.com/Brujo2020/OpenSDD/releases/download/v1.0.0/open-sdd-final.tar.gz -o open-sdd.tar.gz
tar -xzf open-sdd.tar.gz
cd open-sdd
npm install chalk --silent 2>/dev/null || npm install chalk
npm run build --silent 2>/dev/null || npm run build
cd ..
SHELL_RC="$HOME/.zshrc"
[ ! -f "$SHELL_RC" ] && SHELL_RC="$HOME/.bashrc"
if ! grep -q "alias open-sdd=" "$SHELL_RC"; then
  echo "alias open-sdd='bash $INSTALL_DIR/open-sdd/install.sh'" >> "$SHELL_RC"
fi
echo "✅ Done! Run: source $SHELL_RC"
