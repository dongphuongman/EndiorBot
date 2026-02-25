# EndiorBot Deployment Guide

**Sprint 49 - Production Hardening**
**Date**: 2026-02-25

## Prerequisites

### System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| Node.js | 18.x | 20.x LTS |
| RAM | 512 MB | 2 GB |
| Disk | 100 MB | 500 MB |
| OS | macOS 12+, Linux, Windows 10+ | macOS 14+, Ubuntu 22.04 |

### Required Dependencies

```bash
# Node.js 20.x (via nvm)
nvm install 20
nvm use 20

# pnpm package manager
npm install -g pnpm
```

---

## Installation

### 1. Clone Repository

```bash
git clone https://github.com/your-org/endiorbot.git
cd endiorbot
```

### 2. Install Dependencies

```bash
pnpm install
```

### 3. Build

```bash
pnpm build
```

### 4. Verify Installation

```bash
./endiorbot.mjs --version
./endiorbot.mjs --help
```

---

## Configuration

### Initialize Configuration

```bash
# Create default config file
./endiorbot.mjs config init

# View config paths
./endiorbot.mjs config path
```

**Default paths:**
- Config: `~/.endiorbot/endiorbot.json`
- State: `~/.endiorbot/`
- Logs: `~/.endiorbot/logs/`

### Configure API Keys

**Secure Storage (Recommended):**

```bash
# GitHub Models (uses OS keychain)
./endiorbot.mjs setup github

# View configured secrets
./endiorbot.mjs secrets list
```

**Environment Variables:**

```bash
# Add to ~/.bashrc or ~/.zshrc
export ANTHROPIC_API_KEY="sk-ant-..."
export OPENAI_API_KEY="sk-..."
export GITHUB_TOKEN="ghp_..."  # Fallback if keytar unavailable
```

### Verify Configuration

```bash
./endiorbot.mjs config validate
./endiorbot.mjs setup status
```

---

## Running EndiorBot

### CLI Mode

```bash
# Start with a project
./endiorbot.mjs start my-project

# Switch projects
./endiorbot.mjs switch another-project

# Check status
./endiorbot.mjs status
```

### Gateway Mode

```bash
# Start gateway server
./endiorbot.mjs gateway start

# Check gateway status
./endiorbot.mjs gateway status

# Stop gateway
./endiorbot.mjs gateway stop
```

**Default Gateway:**
- Host: `127.0.0.1`
- Port: `18790`
- Protocol: WebSocket + JSON-RPC 2.0

### Desktop App

```bash
# Development
cd apps/desktop
pnpm dev

# Production build
pnpm build
```

---

## Production Deployment

### Security Checklist

- [ ] API keys in secure storage (keytar) or env vars
- [ ] `~/.endiorbot/` has `0o700` permissions
- [ ] Config files have `0o600` permissions
- [ ] No secrets in git history
- [ ] Gateway bound to `127.0.0.1` (local only)

### File Permissions

```bash
# Verify state directory permissions
ls -la ~/.endiorbot/
# Should show: drwx------ (0o700)

# Fix if needed
chmod 700 ~/.endiorbot/
chmod 600 ~/.endiorbot/*.json
```

### Systemd Service (Linux)

```ini
# /etc/systemd/system/endiorbot.service
[Unit]
Description=EndiorBot Gateway
After=network.target

[Service]
Type=simple
User=endiorbot
WorkingDirectory=/opt/endiorbot
ExecStart=/opt/endiorbot/endiorbot.mjs gateway start
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable endiorbot
sudo systemctl start endiorbot
sudo systemctl status endiorbot
```

### launchd Service (macOS)

```xml
<!-- ~/Library/LaunchAgents/com.endiorbot.gateway.plist -->
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.endiorbot.gateway</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/endiorbot</string>
        <string>gateway</string>
        <string>start</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
</dict>
</plist>
```

```bash
launchctl load ~/Library/LaunchAgents/com.endiorbot.gateway.plist
```

---

## Health Monitoring

### Health Check Endpoint

```bash
# Via gateway
wscat -c ws://127.0.0.1:18790
> {"jsonrpc":"2.0","method":"system.health","id":1}

# Response includes:
# - status: healthy/degraded/unhealthy
# - uptime, memory, provider health
```

### Log Monitoring

```bash
# Real-time logs
tail -f ~/.endiorbot/logs/endiorbot.log

# Error logs
grep ERROR ~/.endiorbot/logs/*.log
```

### Metrics

```bash
# Check provider status
./endiorbot.mjs setup status

# Check budget status
./endiorbot.mjs status
```

---

## Backup & Recovery

### Backup

```bash
# Backup state directory
tar -czf endiorbot-backup-$(date +%Y%m%d).tar.gz ~/.endiorbot/

# Backup config only
cp ~/.endiorbot/endiorbot.json endiorbot.json.bak
```

### Recovery

```bash
# Restore from backup
tar -xzf endiorbot-backup-YYYYMMDD.tar.gz -C ~/

# Verify permissions
chmod 700 ~/.endiorbot/
chmod 600 ~/.endiorbot/*.json
```

---

## Troubleshooting

See [Troubleshooting Guide](./troubleshooting-guide.md) for common issues.

### Quick Diagnostics

```bash
# Check config
./endiorbot.mjs config validate

# Check secrets
./endiorbot.mjs secrets list

# Check providers
./endiorbot.mjs setup status

# Check gateway
./endiorbot.mjs gateway status
```

---

## Updates

### Update Process

```bash
# Pull latest changes
git pull origin main

# Update dependencies
pnpm install

# Rebuild
pnpm build

# Restart services
sudo systemctl restart endiorbot  # Linux
launchctl stop com.endiorbot.gateway && launchctl start com.endiorbot.gateway  # macOS
```

### Rollback

```bash
# Checkout previous version
git checkout v1.0.0

# Rebuild
pnpm install && pnpm build
```
