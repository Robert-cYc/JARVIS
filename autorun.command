#!/usr/bin/env bash
# ==============================================================================
#  STARK INDUSTRIES // J.A.R.V.I.S. MARK LXXXV HUD
#  macOS Unified Auto-Runner & Service Manager
# ==============================================================================

set -o pipefail

# 1. Resolve project directory (handles symlinks, spaces, and Unicode paths)
SOURCE="${BASH_SOURCE[0]}"
while [ -h "$SOURCE" ]; do
  DIR="$( cd -P "$( dirname "$SOURCE" )" >/dev/null 2>&1 && pwd )"
  SOURCE="$(readlink "$SOURCE")"
  [[ $SOURCE != /* ]] && SOURCE="$DIR/$SOURCE"
done
PROJECT_DIR="$( cd -P "$( dirname "$SOURCE" )" >/dev/null 2>&1 && pwd )"
cd "$PROJECT_DIR" || {
  echo "[J.A.R.V.I.S. ERROR] Failed to change directory to project root: $PROJECT_DIR"
  exit 1
}

# 2. Set Terminal window title if interactive
if [ -t 1 ]; then
  printf '\033]0;%s\007' "STARK INDUSTRIES // J.A.R.V.I.S. MARK LXXXV HUD"
fi

# ANSI Colors
CYAN="\033[1;36m"
GOLD="\033[1;33m"
GREEN="\033[1;32m"
RED="\033[1;31m"
GRAY="\033[0;90m"
BOLD="\033[1m"
RESET="\033[0m"

# Print J.A.R.V.I.S. Header Banner
print_banner() {
  cat << 'EOF'
 __________________________________________________________________________
|                                                                          |
|       J . A . R . V . I . S .  //  M A R K   L X X X V   H U D           |
|                 STARK INDUSTRIES AUTONOMOUS SYSTEM CORE                  |
|__________________________________________________________________________|

EOF
}

# 3. Locate Node.js binary across common macOS paths
find_node_binary() {
  # Direct check in current PATH
  if command -v node >/dev/null 2>&1; then
    command -v node
    return 0
  fi

  # Attempt sourcing common user shell profiles (Terminal GUI double-click may not load these)
  local profile
  for profile in "$HOME/.zprofile" "$HOME/.zshrc" "$HOME/.bash_profile" "$HOME/.profile"; do
    if [ -f "$profile" ]; then
      set +e
      # shellcheck disable=SC1090
      source "$profile" >/dev/null 2>&1
      if command -v node >/dev/null 2>&1; then
        command -v node
        return 0
      fi
    fi
  done

  # Standard & package manager locations on macOS
  local CANDIDATES=(
    "/opt/homebrew/bin/node"
    "/usr/local/bin/node"
    "/usr/bin/node"
    "$HOME/.local/bin/node"
    "$HOME/.volta/bin/node"
    "$HOME/.asdf/shims/node"
    "$HOME/.fnm/current/bin/node"
    "$HOME/.local/share/fnm/current/bin/node"
  )

  local cand
  for cand in "${CANDIDATES[@]}"; do
    if [ -x "$cand" ]; then
      echo "$cand"
      return 0
    fi
  done

  # NVM versions directory
  if [ -d "$HOME/.nvm/versions/node" ]; then
    local NVM_NODE
    NVM_NODE="$(find "$HOME/.nvm/versions/node" -maxdepth 2 -name "node" -type f -perm +111 2>/dev/null | sort -V | tail -n 1)"
    if [ -n "$NVM_NODE" ] && [ -x "$NVM_NODE" ]; then
      echo "$NVM_NODE"
      return 0
    fi
  fi

  # Hermes / Custom local toolchain directory
  if [ -d "$HOME/.hermes/tools" ]; then
    local HERMES_NODE
    HERMES_NODE="$(find "$HOME/.hermes/tools" -maxdepth 3 -name "node" -type f -perm +111 2>/dev/null | sort -V | tail -n 1)"
    if [ -n "$HERMES_NODE" ] && [ -x "$HERMES_NODE" ]; then
      echo "$HERMES_NODE"
      return 0
    fi
  fi

  return 1
}

# 4. macOS LaunchAgent (Startup on Login / Boot) Management
PLIST_LABEL="com.stark.jarvis"
PLIST_FILE="$HOME/Library/LaunchAgents/${PLIST_LABEL}.plist"

install_startup_service() {
  local node_bin="$1"
  print_banner
  echo -e "${CYAN}[J.A.R.V.I.S. STARTUP] Installing macOS LaunchAgent service...${RESET}"
  
  mkdir -p "$HOME/Library/LaunchAgents"
  mkdir -p "$PROJECT_DIR/reports"

  cat << EOF > "$PLIST_FILE"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${PLIST_LABEL}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${node_bin}</string>
        <string>${PROJECT_DIR}/run.js</string>
        <string>--no-open</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${PROJECT_DIR}</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${PROJECT_DIR}/reports/jarvis-launchagent.log</string>
    <key>StandardErrorPath</key>
    <string>${PROJECT_DIR}/reports/jarvis-launchagent-err.log</string>
</dict>
</plist>
EOF

  # Unload previous instance if present
  launchctl unload "$PLIST_FILE" 2>/dev/null || true
  # Load new plist
  launchctl load "$PLIST_FILE"

  echo -e "${GREEN}[J.A.R.V.I.S. STARTUP] Service successfully registered and activated!${RESET}"
  echo -e "${GRAY}Config:  $PLIST_FILE${RESET}"
  echo -e "${GRAY}Logs:    $PROJECT_DIR/reports/jarvis-launchagent.log${RESET}"
  echo -e "${CYAN}J.A.R.V.I.S. will now automatically start in the background when you log into macOS.${RESET}\n"
  exit 0
}

uninstall_startup_service() {
  print_banner
  echo -e "${CYAN}[J.A.R.V.I.S. STARTUP] Uninstalling macOS LaunchAgent service...${RESET}"
  if [ -f "$PLIST_FILE" ]; then
    launchctl unload "$PLIST_FILE" 2>/dev/null || true
    rm -f "$PLIST_FILE"
    echo -e "${GREEN}[J.A.R.V.I.S. STARTUP] Service removed successfully.${RESET}\n"
  else
    echo -e "${GOLD}[J.A.R.V.I.S. STARTUP] No LaunchAgent found at $PLIST_FILE.${RESET}\n"
  fi
  exit 0
}

status_startup_service() {
  print_banner
  echo -e "${CYAN}[J.A.R.V.I.S. STARTUP] Checking macOS LaunchAgent status...${RESET}"
  if [ -f "$PLIST_FILE" ]; then
    echo -e "Plist File: ${GREEN}Installed${RESET} ($PLIST_FILE)"
    local STATUS
    STATUS="$(launchctl list | grep "$PLIST_LABEL" || true)"
    if [ -n "$STATUS" ]; then
      echo -e "Service State: ${GREEN}Active & Running in background${RESET}"
      echo -e "Telemetry:     $STATUS"
    else
      echo -e "Service State: ${GOLD}Loaded plist, but process not currently active${RESET}"
    fi
  else
    echo -e "Plist File: ${GRAY}Not installed${RESET}"
  fi
  echo ""
  exit 0
}

# 5. Check if any startup management flags were passed
case "$1" in
  --install-startup)
    NODE_EXEC="$(find_node_binary)"
    if [ -z "$NODE_EXEC" ]; then
      echo -e "${RED}[J.A.R.V.I.S. ERROR] Cannot install startup service: Node.js was not found.${RESET}"
      exit 1
    fi
    install_startup_service "$NODE_EXEC"
    ;;
  --uninstall-startup)
    uninstall_startup_service
    ;;
  --status-startup)
    status_startup_service
    ;;
  --help|-h)
    print_banner
    echo -e "Usage:"
    echo -e "  ./autorun.command                  Launch J.A.R.V.I.S. HUD and open browser"
    echo -e "  ./autorun.command [options]        Pass options directly to J.A.R.V.I.S. runner"
    echo -e ""
    echo -e "Runner Options:"
    echo -e "  --port <number>                    Specify custom port (default: 63219)"
    echo -e "  --no-open                          Start server without automatically opening browser"
    echo -e "  --skip-ollama                      Skip auto-starting local Ollama daemon"
    echo -e "  --test                             Run unit test suite before launching server"
    echo -e ""
    echo -e "macOS Service Options:"
    echo -e "  --install-startup                  Register as macOS LaunchAgent (starts on Mac login)"
    echo -e "  --uninstall-startup                Remove macOS LaunchAgent startup service"
    echo -e "  --status-startup                   Check status of macOS LaunchAgent"
    echo ""
    exit 0
    ;;
esac

# 6. Standard Interactive / CLI Launch
print_banner

NODE_EXEC="$(find_node_binary)"
if [ -z "$NODE_EXEC" ]; then
  echo -e "${RED}[J.A.R.V.I.S. CRITICAL FAULT] Node.js was not found on your system.${RESET}"
  echo -e "J.A.R.V.I.S. requires Node.js (v20.6.0 or higher) to operate."
  echo ""
  echo -e "Recommended installation options:"
  echo -e "  1. Using Homebrew (recommended for Mac):"
  echo -e "     ${BOLD}brew install node${RESET}"
  echo -e "  2. Official installer:"
  echo -e "     Visit ${BOLD}https://nodejs.org/${RESET} and download the macOS pkg."
  echo ""
  if [ -t 0 ]; then
    read -n 1 -s -r -p "Press any key to exit..."
    echo ""
  fi
  exit 1
fi

# Prepend the directory containing node to PATH so subprocesses inherit it
NODE_DIR="$(dirname "$NODE_EXEC")"
export PATH="$NODE_DIR:$PATH"

# Validate Node.js version
NODE_VERSION="$("$NODE_EXEC" -v 2>/dev/null | sed 's/^v//')"
NODE_MAJOR="$(echo "$NODE_VERSION" | cut -d. -f1)"
NODE_MINOR="$(echo "$NODE_VERSION" | cut -d. -f2)"

if [ -n "$NODE_MAJOR" ] && [ "$NODE_MAJOR" -lt 20 ] || { [ "$NODE_MAJOR" -eq 20 ] && [ "$NODE_MINOR" -lt 6 ]; }; then
  echo -e "${GOLD}[J.A.R.V.I.S. WARNING] Node.js version v${NODE_VERSION} detected.${RESET}"
  echo -e "J.A.R.V.I.S. recommends v20.6.0 or higher. Some features may not work as intended.\n"
fi

echo -e "${GRAY}[J.A.R.V.I.S. CORE] Node.js runtime: $NODE_EXEC (v${NODE_VERSION})${RESET}"
echo -e "${GRAY}[J.A.R.V.I.S. CORE] Working Directory: $PROJECT_DIR${RESET}\n"

# Run J.A.R.V.I.S. unified launcher and forward all arguments
"$NODE_EXEC" "$PROJECT_DIR/run.js" "$@"
EXIT_CODE=$?

if [ "$EXIT_CODE" -ne 0 ]; then
  echo ""
  echo -e "${RED}[J.A.R.V.I.S. SYSTEM] Process exited with status code ${EXIT_CODE}.${RESET}"
  if [ -t 0 ]; then
    read -n 1 -s -r -p "Press any key to close this terminal..."
    echo ""
  fi
else
  echo ""
  echo -e "${CYAN}[J.A.R.V.I.S. OFFLINE] Systems safely disengaged. Have a pleasant day, Sir.${RESET}"
fi

exit $EXIT_CODE

