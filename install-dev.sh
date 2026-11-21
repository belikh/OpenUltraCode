#!/usr/bin/env sh
set -eu
# Model IDs and paths are never meant to be glob patterns.
set -f

REPO_ROOT=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd -P)
cd "$REPO_ROOT"
: "${HOME:?HOME must be set}"
OPENCODE_CONFIG_DIR="${OPENCODE_CONFIG_DIR:-$HOME/.config/opencode}"
INSTALLER_LIB="$REPO_ROOT/scripts/installer-lib.mjs"
MODEL_MENU="$REPO_ROOT/scripts/model-menu.mjs"

usage() {
  cat <<'USAGE'
Usage: install-dev.sh [options]

Installs OpenUltraCode for opencode from this checkout.
Options:
  -remove, --remove, -r   Remove OpenUltraCode from opencode instead of installing.
  --non-interactive       Do not prompt; keep installed fusion models or use the shipped defaults.
  --skip-runtime-check    Do not reload opencode or check the installation against it (by default every
                          fusion agent is dispatched once through opencode: a few tiny model calls).
  --panel-a <model>       Fusion panel A model (provider/model or provider/model#max).
  --panel-b <model>       Fusion panel B model.
  --decider <model>       Fusion arbiter model.
  --skip-checks           Skip pnpm install and pnpm run check.
  -h, --help              Show this help.
USAGE
}

fail() {
  echo "OpenUltraCode: $*" >&2
  exit 1
}

REMOVE=0
NON_INTERACTIVE=0
RUNTIME_CHECK=live
SKIP_CHECKS=0
PANEL_A=""
PANEL_B=""
DECIDER=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    -remove|--remove|-r) REMOVE=1 ;;
    --non-interactive) NON_INTERACTIVE=1 ;;
    --skip-runtime-check) RUNTIME_CHECK=skip ;;
    --skip-checks) SKIP_CHECKS=1 ;;
    --panel-a|--panel-b|--decider)
      [ "$#" -ge 2 ] || fail "$1 needs a value"
      case "$1" in
        --panel-a) PANEL_A="$2" ;;
        --panel-b) PANEL_B="$2" ;;
        --decider) DECIDER="$2" ;;
      esac
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
  shift
done

# Model selection, asset installation, and the runtime check are shared with install.sh.
# installer-common.sh reads these; naming them here fails early if one is unset.
: "$OPENCODE_CONFIG_DIR" "$INSTALLER_LIB" "$MODEL_MENU" "$NON_INTERACTIVE" "$RUNTIME_CHECK"
# shellcheck source=scripts/installer-common.sh
. "$REPO_ROOT/scripts/installer-common.sh"

ensure_pnpm() {
  if command -v pnpm >/dev/null 2>&1; then
    return 0
  fi
  if command -v corepack >/dev/null 2>&1; then
    corepack enable || echo "OpenUltraCode: 'corepack enable' failed" >&2
  fi
  command -v pnpm >/dev/null 2>&1 || fail "pnpm is required. Enable it with 'corepack enable' or install pnpm, then rerun ./install-dev.sh."
}

enable_git_hooks() {
  if command -v git >/dev/null 2>&1 && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    git config core.hooksPath .githooks
  fi
}

command -v node >/dev/null 2>&1 || fail "node is required for OpenUltraCode install."

if [ "$REMOVE" -eq 1 ]; then
  remove_global_assets "$REPO_ROOT"
  echo "OpenUltraCode has been removed from opencode. Restart opencode to unload the plugin, commands, skills, and agents. This checkout was left in place."
  exit 0
fi

for model in "$PANEL_A" "$PANEL_B" "$DECIDER"; do
  if [ -n "$model" ]; then
    lib validate-model "$model"
  fi
done

if [ "$SKIP_CHECKS" -eq 0 ]; then
  ensure_pnpm
  pnpm install --frozen-lockfile
  pnpm run check
fi
install_global_assets "$REPO_ROOT"
enable_git_hooks
verify_runtime "$REPO_ROOT"
print_summary "$REPO_ROOT"
