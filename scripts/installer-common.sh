# shellcheck shell=sh
# Shared by install.sh and install-dev.sh, which source it once the release or checkout that
# holds scripts/ is known. Everything that edits opencode's config or the installed files is
# done by scripts/installer-lib.mjs; this file only orchestrates.
#
# The sourcing installer provides fail() and these variables:
#   OPENCODE_CONFIG_DIR, INSTALLER_LIB, MODEL_MENU, NON_INTERACTIVE, RUNTIME_CHECK,
#   PANEL_A, PANEL_B, DECIDER
# shellcheck disable=SC2154

FUSION_AGENTS="ultracode-fusion-panel-a.md ultracode-fusion-panel-b.md ultracode-fusion-arbiter.md"

lib() {
  node "$INSTALLER_LIB" "$@"
}

# Your providers' models first, then opencode's hosted catalog; see list-models in
# scripts/installer-lib.mjs (it retries `opencode models` and adds models from your config).
detect_opencode_models() {
  lib list-models --config-dir "$OPENCODE_CONFIG_DIR" || true
}

has_tty() {
  [ "$NON_INTERACTIVE" -eq 0 ] && (: </dev/tty >/dev/tty) 2>/dev/null
}

agent_override() {
  case "$1" in
    ultracode-fusion-panel-a.md) printf '%s' "$PANEL_A" ;;
    ultracode-fusion-panel-b.md) printf '%s' "$PANEL_B" ;;
    *) printf '%s' "$DECIDER" ;;
  esac
}

agent_prompt() {
  case "$1" in
    ultracode-fusion-panel-a.md) echo "Choose fusion panel A model" ;;
    ultracode-fusion-panel-b.md) echo "Choose fusion panel B model" ;;
    *) echo "Choose fusion arbiter model" ;;
  esac
}

# Prints the chosen model. Always called as $(choose_model ...) || exit $? because bash
# does not apply set -e inside command substitutions. The menu reads /dev/tty so it
# also works when the installer itself arrives on stdin (curl | sh).
choose_model() {
  if ! has_tty; then
    printf '%s: using %s\n' "$1" "$2" >&2
    printf '%s' "$2"
    return 0
  fi
  # shellcheck disable=SC2086 # one detected model per word
  node "$MODEL_MENU" "$1" "$2" $DETECTED_MODELS </dev/tty 2>/dev/tty || return $?
}

# Chooses every fusion model before anything is copied, so a cancelled menu or an invalid
# model leaves the existing installation untouched. A model the user already installed is
# kept unless a flag or the menu replaces it.
resolve_fusion_models() {
  source_agents="$1"
  RESOLVED_MODELS=""
  DETECTED_MODELS=""
  if has_tty; then
    DETECTED_MODELS=$(detect_opencode_models)
  fi
  for agent in $FUSION_AGENTS; do
    model=$(agent_override "$agent")
    if [ -z "$model" ]; then
      default_model=$(lib get-agent-model "$source_agents/$agent") || exit $?
      [ -n "$default_model" ] || fail "shipped agent $agent has no default model"
      current_model=$(lib get-agent-model "$OPENCODE_CONFIG_DIR/agents/$agent") || exit $?
      model=$(choose_model "$(agent_prompt "$agent")" "${current_model:-$default_model}") || exit $?
    fi
    lib validate-model "$model"
    RESOLVED_MODELS="$RESOLVED_MODELS $agent=$model"
  done
}

model_for() {
  for pair in $RESOLVED_MODELS; do
    case "$pair" in
      "$1="*) printf '%s' "${pair#*=}" ;;
    esac
  done
}

# Installs the skill, commands, agents, and plugin entry from a release or checkout.
install_global_assets() {
  source_dir="$1"
  resolve_fusion_models "$source_dir/assets/agents"

  lib install-assets --source-dir "$source_dir" --config-dir "$OPENCODE_CONFIG_DIR"
  for agent in $FUSION_AGENTS; do
    lib set-agent-model "$OPENCODE_CONFIG_DIR/agents/$agent" "$(model_for "$agent")"
  done
  lib register --config-dir "$OPENCODE_CONFIG_DIR" --plugin-path "$source_dir/.opencode/plugins/open-ultracode"
}

# Removes only what the release or checkout at $1 ships, never a user's own agents or commands.
remove_global_assets() {
  lib remove-assets --source-dir "$1" --config-dir "$OPENCODE_CONFIG_DIR"
  lib unregister --config-dir "$OPENCODE_CONFIG_DIR"
}

# Makes the running opencode pick up the install (`opencode reload`), then checks the REAL
# installation: the coordinator and every fusion agent must name a provider, model, and variant
# that opencode offers; with RUNTIME_CHECK=live each fusion agent must also answer a real dispatch.
verify_runtime() {
  source_dir="$1"
  if [ "$RUNTIME_CHECK" = "skip" ]; then
    echo "OpenUltraCode: runtime check skipped (--skip-runtime-check)."
    return 0
  fi
  if ! command -v opencode >/dev/null 2>&1; then
    echo "OpenUltraCode: opencode is not on PATH; skipped the runtime check." >&2
    return 0
  fi
  opencode reload >/dev/null 2>&1 || echo "OpenUltraCode: 'opencode reload' failed; restart opencode to load the changes." >&2
  check_status=0
  if [ "$RUNTIME_CHECK" = "live" ]; then
    node "$source_dir/scripts/runtime-check.mjs" --config-dir "$OPENCODE_CONFIG_DIR" --live || check_status=$?
  else
    node "$source_dir/scripts/runtime-check.mjs" --config-dir "$OPENCODE_CONFIG_DIR" || check_status=$?
  fi
  if [ "$check_status" -eq 1 ]; then
    fail "the runtime check found problems (see above). Fix them with --panel-a/--panel-b/--decider or /ultracode-fusion-models."
  fi
  if [ "$check_status" -ne 0 ]; then
    echo "OpenUltraCode: the runtime check could not reach opencode; run 'node $source_dir/scripts/runtime-check.mjs' after starting it." >&2
  fi
}

# Shows what is actually installed, read back from disk.
print_summary() {
  echo
  lib summary --config-dir "$OPENCODE_CONFIG_DIR" --source-dir "$1"
}
