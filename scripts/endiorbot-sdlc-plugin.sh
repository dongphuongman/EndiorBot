#!/bin/bash
# Package EndiorBot SDLC Plugin for Claude Code
# Creates distributable .claude/ directory
#
# Sprint 53: Claude Code Integration - Extended DevEx
# SDLC Framework 6.1.1

set -e

VERSION="1.0.0"
OUTPUT_DIR="dist/endiorbot-sdlc-plugin"

echo "========================================"
echo "  EndiorBot SDLC Plugin v${VERSION}"
echo "========================================"
echo ""

# Clean
echo "Cleaning previous build..."
rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"

# Copy files
echo "Copying plugin files..."
cp -r .claude/* "$OUTPUT_DIR/"

# Remove local settings
rm -f "$OUTPUT_DIR/settings.local.json"

# Create README
echo "Creating README..."
cat > "$OUTPUT_DIR/README.md" << 'EOF'
# EndiorBot SDLC Plugin for Claude Code

## Installation

1. Copy this directory to your project root as `.claude/`
2. Make hooks executable: `chmod +x .claude/hooks/*.sh`
3. Install jq: `brew install jq` (macOS) or `apt install jq` (Linux)

## Contents

### Commands
- `/project:gate <G0-G4>` - Check SDLC gate status
- `/project:consult <query>` - Multi-model consultation
- `/project:vibecoding <path>` - Code quality index

### Hooks
- **PreToolUse**: Secret guard (blocks sensitive files)
- **PostToolUse**: Lint + vibecoding-lite (non-blocking)

### Skills
- **sdlc-compliance** - Auto-invoke on gate/merge keywords
- **multi-model-router** - Route to consultation
- **security-validator** - Input validation guidance

### Agents
- **Architect** (model: opus) - Design decisions, ADRs
- **Coder** (model: sonnet) - Code implementation
- **Reviewer** (model: sonnet) - Code review, security audit

## Requirements

- Claude Code CLI
- EndiorBot gateway running (port 18790)
- jq for JSON parsing in hooks
- Optional: GitHub MCP server for issue/PR management

## Quick Start

```bash
# Check SDLC gate
claude
> /project:gate G3

# Multi-model consultation
> /project:consult "Redis vs PostgreSQL for sessions?"

# Code quality check
> /project:vibecoding src/

# Use Architect agent
claude --agent architect
> "Design caching strategy"
```

## 4 Non-Negotiable Invariants

1. **THIN CLIENT**: Commands call `./endiorbot.mjs`, no business logic in .md
2. **STDIN JSON**: Hooks receive JSON via stdin, parse with jq
3. **ENDIORBOT SOUL = GOVERNANCE**: PM decisions in EndiorBot, not Claude Code
4. **DEFAULT MODEL = SONNET**: Opus only for explicit architecture decisions

---

*EndiorBot SDLC Plugin v1.0.0*
*SDLC Framework v6.1.1*
EOF

# Create manifest
echo "Creating manifest..."
cat > "$OUTPUT_DIR/manifest.json" << EOF
{
  "name": "endiorbot-sdlc-plugin",
  "version": "${VERSION}",
  "description": "SDLC compliance automation for Claude Code",
  "author": "EndiorBot Team",
  "date": "$(date -u +%Y-%m-%d)",
  "requires": {
    "claude-code": ">=1.0.0",
    "jq": ">=1.6"
  },
  "commands": ["gate", "consult", "vibecoding"],
  "hooks": {
    "preToolUse": ".claude/hooks/pre-tool-use.sh",
    "postToolUse": ".claude/hooks/post-tool-use.sh"
  },
  "skills": [
    "sdlc-compliance",
    "multi-model-router",
    "security-validator"
  ],
  "agents": [
    {
      "name": "architect",
      "model": "opus",
      "description": "Design decisions, ADRs"
    },
    {
      "name": "coder",
      "model": "sonnet",
      "description": "Code implementation"
    },
    {
      "name": "reviewer",
      "model": "sonnet",
      "description": "Code review, security audit"
    }
  ],
  "invariants": [
    "THIN_CLIENT_PATTERN",
    "STDIN_JSON_FOR_HOOKS",
    "ENDIORBOT_SOUL_GOVERNANCE",
    "DEFAULT_MODEL_SONNET"
  ]
}
EOF

# Create archive
echo "Creating archive..."
cd dist
tar -czf "endiorbot-sdlc-plugin-${VERSION}.tar.gz" endiorbot-sdlc-plugin/
cd ..

echo ""
echo "========================================"
echo "  Build Complete!"
echo "========================================"
echo ""
echo "Package: dist/endiorbot-sdlc-plugin-${VERSION}.tar.gz"
echo "Directory: $OUTPUT_DIR"
echo ""
echo "Contents:"
ls -la "$OUTPUT_DIR/"
echo ""
echo "To install in another project:"
echo "  tar -xzf dist/endiorbot-sdlc-plugin-${VERSION}.tar.gz"
echo "  mv endiorbot-sdlc-plugin .claude"
echo "  chmod +x .claude/hooks/*.sh"
echo ""
