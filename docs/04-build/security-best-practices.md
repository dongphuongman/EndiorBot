# EndiorBot Security Best Practices

**Sprint 49 - Production Hardening**
**Date**: 2026-02-25

## Overview

This document outlines security best practices for deploying and operating EndiorBot in production environments.

---

## Credential Management

### API Key Storage

**DO:**
- Store API keys in OS keychain (keytar)
- Use environment variables for CI/CD
- Rotate keys regularly

**DON'T:**
- Store API keys in config files
- Commit API keys to git
- Share keys between environments

### Secure Storage Hierarchy

| Priority | Method | Use Case |
|----------|--------|----------|
| 1 | OS Keychain (keytar) | Desktop, interactive |
| 2 | Environment Variables | CI/CD, containers |
| 3 | Secrets Manager | Enterprise, cloud |

### Setup Commands

```bash
# Store GitHub PAT in keychain
./endiorbot.mjs setup github

# Verify storage
./endiorbot.mjs secrets list

# Check what's configured
./endiorbot.mjs setup status
```

### Environment Variables

```bash
# Add to shell profile (not in shell history)
read -s ANTHROPIC_API_KEY
export ANTHROPIC_API_KEY

# Or use direnv for project-specific secrets
# .envrc (add to .gitignore)
export ANTHROPIC_API_KEY="sk-ant-..."
```

---

## File Permissions

### Required Permissions

| Path | Mode | Description |
|------|------|-------------|
| `~/.endiorbot/` | `0o700` | State directory |
| `~/.endiorbot/*.json` | `0o600` | Config files |
| `~/.endiorbot/logs/` | `0o700` | Log directory |
| `~/.endiorbot/sessions/` | `0o700` | Session data |

### Verification

```bash
# Check permissions
ls -la ~/.endiorbot/

# Expected output:
# drwx------  ~/.endiorbot/
# -rw-------  ~/.endiorbot/endiorbot.json
```

### Automatic Enforcement

EndiorBot automatically:
1. Creates `~/.endiorbot/` with `0o700` at startup
2. Writes config files with `0o600`
3. Fixes permissions on existing files

```typescript
// Implemented in src/security/secure-fs.ts
ensureSecureStateDir(stateDir);  // Called at CLI startup
```

---

## Network Security

### Gateway Configuration

**Default (Secure):**
```json
{
  "gateway": {
    "host": "127.0.0.1",  // Local only
    "port": 18790,
    "authEnabled": true
  }
}
```

**Never expose to network:**
```json
// DON'T DO THIS
{
  "gateway": {
    "host": "0.0.0.0"  // Exposes to all interfaces
  }
}
```

### If Network Access Required

1. Use reverse proxy (nginx, Caddy)
2. Enable TLS/SSL
3. Implement additional authentication
4. Restrict by IP

```nginx
# nginx reverse proxy example
server {
    listen 443 ssl;
    server_name endiorbot.internal;

    ssl_certificate /etc/ssl/certs/endiorbot.crt;
    ssl_certificate_key /etc/ssl/private/endiorbot.key;

    location / {
        proxy_pass http://127.0.0.1:18790;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # IP restriction
        allow 10.0.0.0/8;
        deny all;
    }
}
```

---

## Input Validation

### External Input Sanitization

All OTT channel messages are:
1. Validated for injection patterns
2. Wrapped in `[EXTERNAL_INPUT]` tags
3. Logged for audit

```typescript
// Implemented in src/security/input-sanitizer.ts
// 12 injection patterns detected:
// - SQL injection
// - Command injection
// - XSS patterns
// - Prompt injection
// - Path traversal
// - Template injection
```

### Command Authentication

Telegram/Zalo commands (`/approve`, `/status`) are protected by:
1. **chatId guard**: Only authorized chat can send commands
2. **OA ID validation**: Webhook events validated against config

```typescript
// src/channels/telegram/telegram-channel.ts:337-345
if (chatId !== this.config?.chatId) {
  this.log.warn("Ignoring message from unauthorized chat");
  return;
}
```

---

## Logging Security

### Credential Scrubbing

Output scrubber automatically redacts:
- API keys (sk-..., ghp_...)
- Tokens (Bearer ...)
- Passwords
- PEM keys

```typescript
// src/security/output-scrubber.ts
// Example: "token = ghp_abc123..." → "token = ghp_****[REDACTED]"
```

### Audit Logging

Security-relevant events are logged:
- Authentication attempts
- Rate limit violations
- Injection attempts
- Permission changes

```bash
# View security events
grep -E "(WARN|ERROR)" ~/.endiorbot/logs/*.log | grep -i "security\|auth\|injection"
```

---

## Budget Protection

### Circuit Breakers

Automatic protection against runaway costs:

| Threshold | Action |
|-----------|--------|
| 50% budget | Warning logged |
| 80% budget | CEO notified |
| 100% budget | Operations paused |

### Task Limits

| Limit | Default | Purpose |
|-------|---------|---------|
| Max cost per task | $0.50 | Prevent single expensive operation |
| Max retries | 3 | Prevent infinite loops |
| Max duration | 5 min | Prevent hung tasks |

### Configuration

```json
{
  "budget": {
    "dailyLimit": 10.0,
    "warningThreshold": 0.8,
    "circuitBreakers": {
      "enabled": true,
      "maxCostPerTask": 0.5,
      "escalateOnBreach": true
    }
  }
}
```

---

## Production Checklist

### Before Deployment

- [ ] API keys in secure storage (not config files)
- [ ] `~/.endiorbot/` permissions are `0o700`
- [ ] Config files are `0o600`
- [ ] No secrets in git history
- [ ] Gateway bound to `127.0.0.1`
- [ ] Authentication enabled
- [ ] Log rotation configured
- [ ] Budget limits set

### After Deployment

- [ ] Verify permissions with `ls -la ~/.endiorbot/`
- [ ] Test `secrets list` shows expected values
- [ ] Test `config validate` passes
- [ ] Monitor logs for security warnings
- [ ] Test rate limiting works
- [ ] Verify circuit breakers trigger

### Regular Maintenance

- [ ] Rotate API keys quarterly
- [ ] Review audit logs weekly
- [ ] Update dependencies monthly
- [ ] Review access permissions

---

## Incident Response

### If API Key Exposed

1. **Revoke immediately** at provider dashboard
2. Generate new key
3. Update secure storage
4. Search git history for exposure
5. Review access logs

```bash
# Rotate GitHub PAT
./endiorbot.mjs setup github

# Check for exposure in git
git log -p | grep -i "ghp_\|sk-ant-\|sk-"
```

### If Unauthorized Access Detected

1. Stop gateway immediately
2. Review access logs
3. Identify attack vector
4. Patch vulnerability
5. Change all credentials

```bash
# Emergency stop
./endiorbot.mjs gateway stop

# Review recent activity
tail -1000 ~/.endiorbot/logs/*.log | grep -i "auth\|error\|warn"
```

---

## Security Updates

Stay informed about security updates:
- Watch repository for releases
- Subscribe to security advisories
- Update promptly when patches released

```bash
# Check current version
./endiorbot.mjs --version

# Update
git pull origin main
pnpm install
pnpm build
```
