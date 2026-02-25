# EndiorBot Troubleshooting Guide

**Sprint 49 - Production Hardening**
**Date**: 2026-02-25

## Quick Diagnostics

Run these commands first to identify issues:

```bash
# Check configuration
./endiorbot.mjs config validate

# Check secrets
./endiorbot.mjs secrets list

# Check provider status
./endiorbot.mjs setup status

# Check gateway
./endiorbot.mjs gateway status
```

---

## Common Issues

### 1. "Config file not found"

**Symptom:**
```
Error loading config:
  Config file not found: ~/.endiorbot/endiorbot.json
```

**Solution:**
```bash
# Initialize config
./endiorbot.mjs config init

# Verify
./endiorbot.mjs config path
```

---

### 2. "Permission denied" errors

**Symptom:**
```
EACCES: permission denied, open '~/.endiorbot/endiorbot.json'
```

**Solution:**
```bash
# Fix directory permissions
chmod 700 ~/.endiorbot/

# Fix file permissions
chmod 600 ~/.endiorbot/*.json

# Verify
ls -la ~/.endiorbot/
```

---

### 3. "API key not configured"

**Symptom:**
```
Provider 'anthropic' requires ANTHROPIC_API_KEY
```

**Solution:**
```bash
# Option 1: Environment variable
export ANTHROPIC_API_KEY="sk-ant-..."

# Option 2: Add to shell profile
echo 'export ANTHROPIC_API_KEY="sk-ant-..."' >> ~/.zshrc
source ~/.zshrc

# Verify
./endiorbot.mjs secrets list
```

---

### 4. "Rate limit exceeded"

**Symptom:**
```
ProviderError: Rate limit exceeded. Try again in 45 seconds.
```

**Causes:**
- Too many requests in short period
- Free tier limits reached

**Solutions:**
1. Wait for the specified time
2. Switch to different provider
3. Upgrade API tier

```bash
# Check current limits
cat docs/04-build/rate-limits.md

# Adjust limit in config
# Edit ~/.endiorbot/endiorbot.json
{
  "providers": {
    "anthropic": {
      "maxRequestsPerMinute": 30  # Lower limit
    }
  }
}
```

---

### 5. "Gateway connection refused"

**Symptom:**
```
WebSocket connection to 'ws://127.0.0.1:18790' failed
```

**Causes:**
- Gateway not running
- Wrong port
- Firewall blocking

**Solutions:**
```bash
# Check if gateway is running
./endiorbot.mjs gateway status

# Start gateway
./endiorbot.mjs gateway start

# Check port
lsof -i :18790

# Check firewall (macOS)
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --listapps
```

---

### 6. "Keytar not available"

**Symptom:**
```
Warning: keytar not available, using environment variable fallback
```

**Causes:**
- keytar not installed
- Missing system dependencies

**Solutions:**

**macOS:**
```bash
# Usually works out of the box
pnpm rebuild keytar
```

**Linux:**
```bash
# Install libsecret
sudo apt-get install libsecret-1-dev

# Rebuild
pnpm rebuild keytar
```

**Fallback:**
```bash
# Use environment variable instead
export GITHUB_TOKEN="ghp_..."
```

---

### 7. "Circuit breaker open"

**Symptom:**
```
CircuitBreakerError: Circuit breaker is OPEN. Requests blocked.
```

**Causes:**
- Provider failures exceeded threshold
- Budget limit reached

**Solutions:**
```bash
# Wait for cool-down (30 seconds)
# Then retry

# Check budget status
./endiorbot.mjs status

# Reset if needed (use with caution)
rm ~/.endiorbot/circuit-state.json
```

---

### 8. "Health check failed"

**Symptom:**
```
system.health returns status: "unhealthy"
```

**Diagnose:**
```bash
# Get detailed health report
wscat -c ws://127.0.0.1:18790
> {"jsonrpc":"2.0","method":"system.health","params":{"checkProviders":true},"id":1}
```

**Common causes:**
- All providers unhealthy
- Memory usage > 95%
- Brain not initialized

**Solutions:**
```bash
# Check memory
free -h  # Linux
vm_stat  # macOS

# Check providers
./endiorbot.mjs setup status

# Restart gateway
./endiorbot.mjs gateway stop
./endiorbot.mjs gateway start
```

---

### 9. "Invalid JSON-RPC request"

**Symptom:**
```
{"jsonrpc":"2.0","error":{"code":-32600,"message":"Invalid Request"},"id":null}
```

**Causes:**
- Malformed JSON
- Missing required fields

**Correct format:**
```json
{
  "jsonrpc": "2.0",
  "method": "session.start",
  "params": {},
  "id": 1
}
```

---

### 10. "Checkpoint not found"

**Symptom:**
```
Error: Checkpoint not found: session-abc123
```

**Solutions:**
```bash
# List available checkpoints
ls -la ~/.endiorbot/sessions/

# Check checkpoint directory
./endiorbot.mjs checkpoint list
```

---

## Debug Mode

Enable verbose logging for troubleshooting:

```bash
# CLI debug mode
./endiorbot.mjs --debug start

# Environment variable
ENDIORBOT_DEBUG=true ./endiorbot.mjs start

# Log level
ENDIORBOT_LOG_LEVEL=debug ./endiorbot.mjs start
```

---

## Log Files

### Locations

```bash
# Main log
~/.endiorbot/logs/endiorbot.log

# Gateway log
~/.endiorbot/logs/gateway.log

# Error log
~/.endiorbot/logs/error.log
```

### Viewing Logs

```bash
# Real-time
tail -f ~/.endiorbot/logs/endiorbot.log

# Last 100 lines
tail -100 ~/.endiorbot/logs/endiorbot.log

# Search for errors
grep ERROR ~/.endiorbot/logs/*.log

# Search by date
grep "2026-02-25" ~/.endiorbot/logs/endiorbot.log
```

---

## Reset & Recovery

### Clear Cache

```bash
# Clear config cache
rm ~/.endiorbot/.cache/*

# Or programmatically
./endiorbot.mjs config init --force
```

### Reset State

```bash
# Backup first!
cp -r ~/.endiorbot ~/.endiorbot.bak

# Remove state (keeps config)
rm ~/.endiorbot/sessions/*
rm ~/.endiorbot/*.state.json

# Full reset (removes everything)
rm -rf ~/.endiorbot
./endiorbot.mjs config init
```

### Reinstall Dependencies

```bash
# Clean install
rm -rf node_modules
pnpm install

# Rebuild native modules
pnpm rebuild
```

---

## Getting Help

### Built-in Help

```bash
./endiorbot.mjs --help
./endiorbot.mjs config --help
./endiorbot.mjs gateway --help
```

### Report Issues

1. Gather diagnostic info:
```bash
./endiorbot.mjs --version
node --version
pnpm --version
./endiorbot.mjs config validate
./endiorbot.mjs setup status
```

2. Check logs for errors
3. Report at: https://github.com/anthropics/claude-code/issues
