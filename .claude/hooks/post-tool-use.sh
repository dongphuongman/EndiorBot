#!/bin/bash
# Post-tool-use hook: Auto-quality checks
# Input: JSON via stdin (NOT positional args)
# Sprint 52 - Claude Code Integration

# Read JSON from stdin
INPUT=$(cat /dev/stdin)

# Parse with jq
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')
FILE_PATH=$(echo "$INPUT" | jq -r '.file_path // empty')

# Exit if required fields missing
[[ -z "$TOOL_NAME" ]] && exit 0
[[ -z "$FILE_PATH" ]] && exit 0

# Get project root (where this script is run from)
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

case $TOOL_NAME in
  "Edit"|"Write")
    # Lint on touched package (NOT auto-format to avoid loops)
    if [[ $FILE_PATH == src/* ]] || [[ $FILE_PATH == apps/* ]]; then
      PKG_DIR=$(dirname "$FILE_PATH")
      # Find nearest package.json
      while [[ "$PKG_DIR" != "." ]] && [[ ! -f "$PROJECT_ROOT/$PKG_DIR/package.json" ]]; do
        PKG_DIR=$(dirname "$PKG_DIR")
      done

      if [[ -f "$PROJECT_ROOT/$PKG_DIR/package.json" ]] || [[ -f "$PROJECT_ROOT/package.json" ]]; then
        echo "🔍 Linting: $FILE_PATH"
        (cd "$PROJECT_ROOT" && pnpm lint --fix "$FILE_PATH" 2>/dev/null) || true
      fi
    fi

    # Vibecoding-lite check for src/ changes
    if [[ $FILE_PATH == src/* ]]; then
      echo "📊 Vibecoding-lite: $FILE_PATH"
      # Check: tsc pass?
      (cd "$PROJECT_ROOT" && pnpm tsc --noEmit 2>&1 | grep -q "$FILE_PATH") && echo "⚠️  TypeScript errors in $FILE_PATH"
    fi
    ;;
esac

exit 0  # Non-blocking
