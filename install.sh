#!/usr/bin/env bash
# ==============================================================================
# Open-SDD Universal Installer
# Spec-Driven Development Orchestration Engine & Agent Skills
# ==============================================================================
set -e

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_DIR="$SCRIPT_DIR/tools/cc-sdd"

echo -e "${CYAN}${BOLD}"
echo "  ___                      ____  ____  ____  "
echo " / _ \ _ __   ___ _ __    / ___||  _ \|  _ \ "
echo "| | | | '_ \ / _ \ '_ \   \___ \| | | | | | |"
echo "| |_| | |_) |  __/ | | |   ___) | |_| | |_| |"
echo " \___/| .__/ \___|_| |_|  |____/|____/|____/ "
echo "      |_|                                    "
echo -e "${NC}"
echo -e "${BOLD}Open-SDD Universal Installer (September 2026)${NC}"
echo -e "Model-agnostic Spec-Driven Development on an enterprise agentic SDLC.\n"

# Function: Build package if source exists
build_package() {
  if [ -d "$PACKAGE_DIR" ]; then
    echo -e "${YELLOW}→ Compiling Open-SDD Engine...${NC}"
    npm --prefix "$PACKAGE_DIR" run build --silent
    echo -e "${GREEN}✓ Engine compiled successfully.${NC}\n"
  fi
}

# Function: Install globally
install_global() {
  build_package
  echo -e "${YELLOW}→ Installing 'open-sdd' and 'sdd' globally...${NC}"
  if [ -d "$PACKAGE_DIR" ]; then
    npm install -g "$PACKAGE_DIR"
  else
    npm install -g cc-sdd@latest
  fi
  echo -e "${GREEN}✓ Global installation complete!${NC}"
  echo -e "  Binaries available in PATH:"
  echo -e "    • ${BOLD}open-sdd${NC}  (e.g., 'open-sdd status', 'open-sdd impl <feature> --parallel')"
  echo -e "    • ${BOLD}sdd${NC}       (short alias, e.g., 'sdd status')\n"
}

# Function: Install in current project
install_project() {
  local target_dir="${1:-$(pwd)}"
  local agent="$2"

  echo -e "${YELLOW}→ Setting up Open-SDD in project: ${BOLD}$target_dir${NC}"

  # Auto-detect agent if not provided
  if [ -z "$agent" ]; then
    if [ -d "$target_dir/.gemini" ] || [ -d "$target_dir/.agent" ]; then
      agent="antigravity"
    elif [ -d "$target_dir/.cursor" ]; then
      agent="cursor"
    elif [ -d "$target_dir/.claude" ]; then
      agent="claude"
    elif [ -d "$target_dir/.codeium" ] || [ -d "$target_dir/.windsurf" ]; then
      agent="windsurf"
    elif [ -d "$target_dir/.github" ]; then
      agent="copilot"
    else
      agent="antigravity"
    fi
  fi

  local flag=""
  case "$agent" in
    antigravity) flag="--antigravity" ;;
    cursor)      flag="--cursor-skills" ;;
    claude)      flag="" ;;
    copilot)     flag="--copilot-skills" ;;
    windsurf)    flag="--windsurf-skills" ;;
    opencode)    flag="--opencode-skills" ;;
    gemini)      flag="--gemini-cli-skills" ;;
    codex)       flag="--codex-skills" ;;
    *)           flag="--antigravity" ;;
  esac

  if command -v open-sdd >/dev/null 2>&1; then
    (cd "$target_dir" && open-sdd $flag -y --overwrite force)
  elif [ -f "$PACKAGE_DIR/dist/cli.js" ]; then
    (cd "$target_dir" && node "$PACKAGE_DIR/dist/cli.js" $flag -y --overwrite force)
  else
    (cd "$target_dir" && npx cc-sdd@latest $flag -y --overwrite force)
  fi

  echo -e "\n${GREEN}✓ Project skills and steering initialized for: ${BOLD}$agent${NC}"
  echo -e "  20 Open-SDD skills installed in your agent's directory."
  echo -e "  Project memory (.sdd/steering/) ready.\n"
}

# Parse command line flags
case "$1" in
  --global|-g)
    install_global
    exit 0
    ;;
  --project|-p)
    install_project "${2:-$(pwd)}" "$3"
    exit 0
    ;;
  --both|-b)
    install_global
    install_project "${2:-$(pwd)}" "$3"
    exit 0
    ;;
  --help|-h)
    echo "Usage:"
    echo "  ./install.sh                Interactive menu (Global, Project, or Both)"
    echo "  ./install.sh --global       Install 'open-sdd' and 'sdd' globally"
    echo "  ./install.sh --project      Install Open-SDD skills in current project"
    echo "  ./install.sh --both         Install both globally and in current project"
    echo ""
    echo "Examples:"
    echo "  ./install.sh --project /path/to/my-repo cursor"
    echo "  ./install.sh --project /path/to/my-repo antigravity"
    exit 0
    ;;
esac

# Interactive prompt if no arguments passed
echo "Select installation mode:"
echo "  [1] Both: Install CLI globally + configure current project (Recommended)"
echo "  [2] Global CLI only ('open-sdd' command everywhere)"
echo "  [3] Current Project only (Install 20 skills in this directory)"
echo ""

if [ -t 0 ]; then
  read -p "Enter choice [1-3] (default: 1): " choice
elif [ -e /dev/tty ]; then
  read -p "Enter choice [1-3] (default: 1): " choice < /dev/tty || choice=1
else
  choice=1
fi
choice=${choice:-1}

case "$choice" in
  1)
    install_global
    install_project "$(pwd)"
    ;;
  2)
    install_global
    ;;
  3)
    install_project "$(pwd)"
    ;;
  *)
    echo "Invalid choice. Exiting."
    exit 1
    ;;
esac

echo -e "${CYAN}${BOLD}Open-SDD is ready to use!${NC}"
echo -e "Try running in your terminal:"
echo -e "  ${BOLD}open-sdd status${NC}"
echo -e "  ${BOLD}open-sdd help${NC}"
