#!/bin/bash
# Pre-tool-use hook: SDLC compliance + secret guard
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

case $TOOL_NAME in
  "Write"|"Edit")
    # EXPANDED SECRET GUARD (P0 from Expert H)
    # Block writes to sensitive files
    if [[ $FILE_PATH =~ \.env ]] || \
       [[ $FILE_PATH =~ secret ]] || \
       [[ $FILE_PATH =~ token ]] || \
       [[ $FILE_PATH =~ \.pem$ ]] || \
       [[ $FILE_PATH =~ \.key$ ]] || \
       [[ $FILE_PATH =~ credential ]] || \
       [[ $FILE_PATH =~ password ]]; then
      echo "❌ BLOCKED: Cannot write to sensitive file: $FILE_PATH"
      echo "Reason: Secret/credential file detected"
      echo "Use secure environment variable management instead"
      exit 1
    fi

    # Warn on breaking changes without ADR
    if [[ $FILE_PATH == src/providers/* ]] || [[ $FILE_PATH == src/gateway/* ]]; then
      BASE_NAME=$(basename "$FILE_PATH" .ts)
      if ! ls docs/02-design/01-ADRs/ADR-*.md 2>/dev/null | grep -qi "$BASE_NAME"; then
        echo "⚠️  WARNING: Potential breaking change without ADR"
        echo "File: $FILE_PATH"
        echo "Consider creating ADR-XXX-${BASE_NAME}.md"
        echo ""
        echo "Continue? This is a warning, not a block."
      fi
    fi
    ;;
esac

exit 0  # Always allow (warnings only, no hard blocks except secrets)
