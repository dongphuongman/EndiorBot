# EndiorBot Configuration Reference

**Sprint 49 - Production Hardening**
**Date**: 2026-02-25

## Overview

EndiorBot uses a layered configuration system:
1. **Default values** (built-in)
2. **Config file** (`~/.endiorbot/endiorbot.json`)
3. **Environment variables** (highest priority)

---

## Configuration File

**Location:** `~/.endiorbot/endiorbot.json`

**Format:** JSON5 (supports comments, trailing commas)

### Full Example

```json5
{
  // Gateway server configuration
  "gateway": {
    "port": 18790,
    "host": "127.0.0.1",
    "authEnabled": true,
    "authSecret": "${ENDIORBOT_AUTH_SECRET}"
  },

  // SDLC Framework settings
  "sdlc": {
    "frameworkVersion": "6.1.1",
    "tier": "STANDARD",
    "strict": true
  },

  // Multi-model orchestrator
  "orchestrator": {
    "queryMode": "parallel",
    "maxParallelQueries": 3,
    "perModelTimeout": 30000
  },

  // Logging configuration
  "logging": {
    "level": "info",
    "format": "pretty",
    "file": "~/.endiorbot/logs/endiorbot.log",
    "maxSize": "10m",
    "maxFiles": 5,
    "rotation": "daily"
  },

  // Budget limits
  "budget": {
    "dailyLimit": 10.0,
    "perSessionLimit": 2.0,
    "warningThreshold": 0.8
  }
}
```

---

## Configuration Sections

### Gateway

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `port` | number | `18790` | WebSocket server port |
| `host` | string | `"127.0.0.1"` | Bind address |
| `authEnabled` | boolean | `true` | Enable authentication |
| `authSecret` | string | - | Shared secret for auth |
| `maxConnections` | number | `10` | Max concurrent connections |

### SDLC

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `frameworkVersion` | string | `"6.1.1"` | SDLC framework version |
| `tier` | string | `"STANDARD"` | Project tier (STANDARD/ENTERPRISE) |
| `strict` | boolean | `true` | Enforce gate requirements |

### Orchestrator

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `queryMode` | string | `"parallel"` | Query mode (parallel/sequential/consensus) |
| `maxParallelQueries` | number | `3` | Max concurrent provider queries |
| `perModelTimeout` | number | `30000` | Timeout per model (ms) |
| `fallbackEnabled` | boolean | `true` | Enable provider fallback |

### Logging

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `level` | string | `"info"` | Log level (debug/info/warn/error) |
| `format` | string | `"pretty"` | Output format (pretty/json) |
| `file` | string | - | Log file path |
| `maxSize` | string | `"10m"` | Max file size before rotation |
| `maxFiles` | number | `5` | Max rotated files to keep |
| `rotation` | string | `"daily"` | Rotation interval |

### Budget

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `dailyLimit` | number | `10.0` | Daily spend limit (USD) |
| `perSessionLimit` | number | `2.0` | Per-session limit (USD) |
| `perTrackLimit` | number | `0.5` | Per-parallel-track limit (USD) |
| `warningThreshold` | number | `0.8` | Warning at % of limit |

---

## Environment Variables

### Core Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ENDIORBOT_STATE_DIR` | `~/.endiorbot/` | State directory path |
| `ENDIORBOT_CONFIG_PATH` | `~/.endiorbot/endiorbot.json` | Config file path |
| `ENDIORBOT_PROFILE` | `default` | Active profile |
| `ENDIORBOT_DEBUG` | `false` | Debug mode |
| `ENDIORBOT_LOG_LEVEL` | `info` | Override log level |

### Gateway Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ENDIORBOT_GATEWAY_PORT` | `18790` | Gateway port |
| `ENDIORBOT_GATEWAY_HOST` | `127.0.0.1` | Gateway bind address |
| `ENDIORBOT_AUTH_SECRET` | - | Auth secret |

### Provider API Keys

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Anthropic Claude API key |
| `OPENAI_API_KEY` | OpenAI API key |
| `GOOGLE_API_KEY` | Google Gemini API key |
| `GEMINI_API_KEY` | Alias for GOOGLE_API_KEY |
| `GITHUB_TOKEN` | GitHub Models PAT (fallback) |
| `MISTRAL_API_KEY` | Mistral AI API key |

### Runtime Modes

| Variable | Description |
|----------|-------------|
| `CI` | CI mode (disables interactive prompts) |
| `NODE_ENV` | Environment (development/production/test) |
| `NIX_STORE` | Nix mode detection |

---

## Provider Configuration

### Anthropic

```json5
{
  "providers": {
    "anthropic": {
      "enabled": true,
      "defaultModel": "claude-sonnet-4-20250514",
      "maxRequestsPerMinute": 50,
      "maxTokens": 8192
    }
  }
}
```

### OpenAI

```json5
{
  "providers": {
    "openai": {
      "enabled": true,
      "defaultModel": "gpt-4o",
      "maxRequestsPerMinute": 60,
      "maxTokens": 4096
    }
  }
}
```

### GitHub Models

```json5
{
  "providers": {
    "github": {
      "enabled": true,
      "defaultModel": "gpt-4o-mini",
      "maxRequestsPerMinute": 15
    }
  }
}
```

### Ollama (Local)

```json5
{
  "providers": {
    "ollama": {
      "enabled": true,
      "baseUrl": "http://localhost:11434",
      "defaultModel": "qwen2.5-coder:7b",
      "maxRequestsPerMinute": 200
    }
  }
}
```

---

## Rate Limits

See [Rate Limits Documentation](./rate-limits.md) for detailed information.

| Provider | Default Limit | Configurable |
|----------|---------------|--------------|
| GitHub Models | 15 req/min | Yes |
| Anthropic | 50 req/min | Yes |
| OpenAI | 60 req/min | Yes |
| Gemini | 60 req/min | Yes |
| Ollama | 200 req/min | Yes |
| Gateway | 100 req/min | Yes |

---

## Conversation Limits

| Limit | Default | Config Key |
|-------|---------|------------|
| Max messages | 50 | `limits.maxMessages` |
| Max tokens | 100,000 | `limits.maxTokens` |
| Max tool calls | 20 | `limits.maxToolCalls` |
| Timeout | 30 min | `limits.timeoutMinutes` |
| Max retries | 3 | `limits.maxRetriesPerStep` |
| Max diff size | 10,000 | `limits.maxDiffSize` |
| Max delegation depth | 1 | `limits.maxDelegationDepth` |
| Max budget | $10 | `limits.maxBudgetCents` |

---

## CLI Commands

### View Configuration

```bash
# Show current config
endiorbot config show

# Show raw JSON
endiorbot config show --raw

# Show config paths
endiorbot config path

# Show environment variables
endiorbot config env

# Validate config
endiorbot config validate
```

### Manage Secrets

```bash
# List all secrets (masked)
endiorbot secrets list

# Setup GitHub Models
endiorbot setup github

# Show provider status
endiorbot setup status
```

---

## Environment Variable Substitution

Config files support `${VAR}` syntax for environment variable substitution:

```json5
{
  "gateway": {
    "authSecret": "${ENDIORBOT_AUTH_SECRET}",
    "port": "${ENDIORBOT_GATEWAY_PORT:-18790}"
  }
}
```

**Syntax:**
- `${VAR}` - Substitute value, empty if not set
- `${VAR:-default}` - Use default if not set

---

## Profiles

Support for multiple configuration profiles:

```bash
# Use specific profile
ENDIORBOT_PROFILE=development endiorbot start

# Profile config files
~/.endiorbot/endiorbot.json           # default
~/.endiorbot/endiorbot.development.json
~/.endiorbot/endiorbot.production.json
```
