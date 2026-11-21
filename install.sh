#!/usr/bin/env sh
set -eu
# Model IDs and paths are never meant to be glob patterns.
set -f

REPO="${OPENULTRACODE_REPO:-belikh/OpenUltraCode}"
: "${HOME:?HOME must be set}"
INSTALL_DIR="${OPENULTRACODE_HOME:-$HOME/.local/share/open-ultracode}"
OPENCODE_CONFIG_DIR="${OPENCODE_CONFIG_DIR:-$HOME/.config/opencode}"
RELEASE_URL="https://github.com/$REPO/releases/latest/download/open-ultracode-release.tar.gz"

usage() {
  cat <<'USAGE'
Usage: install.sh [options]

Installs the latest OpenUltraCode release for opencode. The download is checked against the
checksum the release publishes. Set OPENULTRACODE_REPO=owner/name to install from another fork.
Options:
  -remove, --remove, -r   Remove OpenUltraCode from opencode instead of installing.
  --non-interactive       Do not prompt; keep installed fusion models or use the shipped defaults.
  --verify                Also dispatch every fusion agent once through opencode (a few tiny model calls).
  --skip-runtime-check    Do not reload opencode or check the installation against it.
  --panel-a <model>       Fusion panel A model (provider/model or provider/model#max).
  --panel-b <model>       Fusion panel B model.
  --decider <model>       Fusion arbiter model.
  --archive <file>        Install from a local release archive instead of downloading it.
                          A <file>.sha256 next to it is checked when present.
  -h, --help              Show this help.
USAGE
}

fail() {
  echo "OpenUltraCode: $*" >&2
  exit 1
}

REMOVE=0
NON_INTERACTIVE=0
RUNTIME_CHECK=static
ARCHIVE=""
PANEL_A=""
PANEL_B=""
DECIDER=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    -remove|--remove|-r) REMOVE=1 ;;
    --non-interactive) NON_INTERACTIVE=1 ;;
    --verify) RUNTIME_CHECK=live ;;
    --skip-runtime-check) RUNTIME_CHECK=skip ;;
    --panel-a|--panel-b|--decider|--archive)
      [ "$#" -ge 2 ] || fail "$1 needs a value"
      case "$1" in
        --panel-a) PANEL_A="$2" ;;
        --panel-b) PANEL_B="$2" ;;
        --decider) DECIDER="$2" ;;
        --archive) ARCHIVE="$2" ;;
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

INSTALLER_LIB="$INSTALL_DIR/scripts/installer-lib.mjs"
MODEL_MENU="$INSTALL_DIR/scripts/model-menu.mjs"
COMMON="$INSTALL_DIR/scripts/installer-common.sh"

need_command() {
  command -v "$1" >/dev/null 2>&1 || fail "$1 is required for OpenUltraCode install."
}

# Model selection, asset installation, and the runtime check are shared with install-dev.sh.
# They ship inside the release, so they are loaded from the installation itself.
load_common() {
  [ -f "$COMMON" ] || fail "$INSTALL_DIR was installed by an older release. Run this installer once without --remove to update it, then try again."
  # installer-common.sh reads these; naming them here fails early if one is unset.
  : "$OPENCODE_CONFIG_DIR" "$INSTALLER_LIB" "$MODEL_MENU" "$NON_INTERACTIVE" "$RUNTIME_CHECK"
  # shellcheck source=scripts/installer-common.sh
  . "$COMMON"
}

# Prints the SHA-256 of a file. The file is read from stdin so the output never carries a path.
sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum <"$1" | cut -d ' ' -f 1
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 <"$1" | cut -d ' ' -f 1
  else
    fail "sha256sum or shasum is required to verify the release archive."
  fi
}

# $2 is the checksum file the release publishes: the output of sha256sum for the archive.
verify_checksum() {
  expected=$(cut -d ' ' -f 1 <"$2" | tr 'A-F' 'a-f')
  actual=$(sha256_of "$1") || exit $?
  if [ -z "$expected" ] || [ "$expected" != "$actual" ]; then
    fail "the release archive does not match its checksum (expected ${expected:-none}, got $actual); the existing installation was left unchanged."
  fi
}

is_install_dir() {
  [ -d "$1/.opencode/plugins/open-ultracode" ] && [ -f "$1/scripts/installer-lib.mjs" ]
}

TMP_DIR=""
STAGE_DIR=""
cleanup() {
  if [ -n "$TMP_DIR" ]; then rm -rf "$TMP_DIR"; fi
  if [ -n "$STAGE_DIR" ]; then rm -rf "$STAGE_DIR"; fi
}
trap cleanup EXIT
trap 'exit 130' INT TERM

# Downloads and verifies the release next to INSTALL_DIR, then swaps it in. Any failure
# leaves the existing installation (which opencode.json points at) unchanged.
install_latest_release() {
  need_command tar
  need_command mktemp
  if [ -d "$INSTALL_DIR" ] && [ -n "$(ls -A "$INSTALL_DIR" 2>/dev/null)" ] && [ ! -d "$INSTALL_DIR/.opencode/plugins/open-ultracode" ]; then
    fail "refusing to replace $INSTALL_DIR because it is not an OpenUltraCode installation. Set OPENULTRACODE_HOME to another directory."
  fi

  mkdir -p "$(dirname "$INSTALL_DIR")"
  TMP_DIR=$(mktemp -d)
  STAGE_DIR=$(mktemp -d "$INSTALL_DIR.new-XXXXXX")
  archive="$TMP_DIR/open-ultracode-release.tar.gz"

  if [ -n "$ARCHIVE" ]; then
    cp "$ARCHIVE" "$archive"
    # A checksum file next to a local archive is checked; without one the archive is taken as given.
    if [ -f "$ARCHIVE.sha256" ]; then
      cp "$ARCHIVE.sha256" "$archive.sha256"
    fi
  else
    need_command curl
    echo "Downloading latest OpenUltraCode release from $RELEASE_URL..."
    curl -fsSL --retry 3 --connect-timeout 20 "$RELEASE_URL" -o "$archive" ||
      fail "could not download the latest OpenUltraCode release asset."
    curl -fsSL --retry 3 --connect-timeout 20 "$RELEASE_URL.sha256" -o "$archive.sha256" ||
      fail "could not download the checksum of the latest OpenUltraCode release asset."
  fi
  if [ -f "$archive.sha256" ]; then
    verify_checksum "$archive" "$archive.sha256"
  fi
  tar -xzf "$archive" -C "$STAGE_DIR" || fail "could not extract the release archive; the existing installation was left unchanged."
  is_install_dir "$STAGE_DIR" || fail "the release archive is incomplete; the existing installation was left unchanged."

  previous=""
  if [ -e "$INSTALL_DIR" ]; then
    previous="$INSTALL_DIR.old-$$"
    mv "$INSTALL_DIR" "$previous"
  fi
  mv "$STAGE_DIR" "$INSTALL_DIR"
  STAGE_DIR=""
  if [ -n "$previous" ]; then
    rm -rf "$previous"
  fi
}

need_command node

if [ "$REMOVE" -eq 1 ]; then
  [ -f "$INSTALLER_LIB" ] || fail "$INSTALL_DIR does not contain an OpenUltraCode installation. Set OPENULTRACODE_HOME, or reinstall and then run --remove."
  load_common
  remove_global_assets "$INSTALL_DIR"
  if is_install_dir "$INSTALL_DIR"; then
    rm -rf "$INSTALL_DIR"
  fi
  echo "OpenUltraCode has been removed from opencode. Restart opencode to unload the plugin, commands, skills, and agents."
  exit 0
fi

for model in "$PANEL_A" "$PANEL_B" "$DECIDER"; do
  if [ -n "$model" ]; then
    printf '%s' "$model" | grep -Eq '^[A-Za-z0-9][A-Za-z0-9._-]*/[^[:space:]#]+(#max)?$' ||
      fail "$model must be provider/model or provider/model#max"
  fi
done

install_latest_release
load_common
install_global_assets "$INSTALL_DIR"
verify_runtime "$INSTALL_DIR"
print_summary "$INSTALL_DIR"
