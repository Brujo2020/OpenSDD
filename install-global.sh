#!/bin/bash
set -e
INSTALL_DIR="${HOME}/.open-sdd"
REPO_URL="https://github.com/Brujo2020/OpenSDD.git"
echo "🚀 Installing open-sdd..."
rm -rf "$INSTALL_DIR"
git clone "$REPO_URL" "$INSTALL_DIR" --depth 1
cd "$INSTALL_DIR"
npm install --silent
npm run build
echo ""
echo "✅ Installation complete!"
echo ""
echo "Add to ~/.zshrc:"
echo "  alias open-sdd='bash $INSTALL_DIR/install.sh'"
echo ""
echo "Then:"
echo "  source ~/.zshrc"
echo "  open-sdd /path/to/repo"
