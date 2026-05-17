# Hướng dẫn cấu hình Claude Code + Kimi k2.6 trên Server S1

> **Audience:** @itadmin  
> **Scope:** Deployment guide — cấu hình Claude Code CLI kết nối trực tiếp Kimi k2.6 qua API key trên server S1.  
> **Ref:** Cấu hình tương đương MacBook local của CEO (EndiorBot scaffold → MTClaw handoff boundary).

---

## 1. Prerequisites

| Yêu cầu | Chi tiết |
|---------|----------|
| OS | Linux (Ubuntu 22.04+ khuyến nghị) hoặc bất kỳ distro hỗ trợ Node.js 20+ |
| Node.js | >= 20 (Claude Code CLI yêu cầu) |
| Shell | Bash hoặc Zsh |
| Network | Outbound HTTPS đến `api.kimi.com` (port 443) |
| API Key | Kimi Code API key (prefix `sk-kimi-*`) từ platform.kimi.ai |

### Kiểm tra Node.js

```bash
node --version  # Phải >= v20.0.0
npm --version
```

Nếu thiếu, cài đặt qua NodeSource hoặc `n`:

```bash
# Cách 1: NodeSource (Ubuntu/Debian)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# Cách 2: n (nếu đã có node cũ)
sudo npm install -g n
sudo n 22
```

---

## 2. Cài đặt Claude Code CLI

```bash
npm install -g @anthropic-ai/claude-code
```

Kiểm tra:

```bash
claude --version
# Expected: Claude Code v2.1.x+
```

---

## 3. Cấu hình API Key

### 3.1. Lấy API key

- Truy cập: https://platform.kimi.ai/console/api-keys
- Tạo key mới (gói Allegro cho phép tối đa 5 key)
- Copy key có prefix `sk-kimi-...`

### 3.2. Set API key trong shell profile

**Nếu dùng Zsh:**

```bash
cat >> ~/.zshrc << 'EOF'

# ============================================
# Kimi Code API Key (Allegro plan)
# ============================================
export KIMI_API_KEY="sk-kimi-YOUR-KEY-HERE"
EOF
```

**Nếu dùng Bash:**

```bash
cat >> ~/.bashrc << 'EOF'

# ============================================
# Kimi Code API Key (Allegro plan)
# ============================================
export KIMI_API_KEY="sk-kimi-YOUR-KEY-HERE"
EOF
```

> **Security:** Không commit API key lên Git. Nếu server dùng shared dotfiles, tách key ra file `~/.kimi_env` riêng và `source` từ `.zshrc`/`.bashrc`.

---

## 4. Tạo function `claude-kimi`

Thêm function wrapper vào shell profile (chọn phần phù hợp với shell đang dùng):

### Zsh (`~/.zshrc`)

```bash
cat >> ~/.zshrc << 'EOF'

# ============================================
# Claude Code + Kimi k2.6 (Direct API)
# ============================================
claude-kimi() {
    local api_key="${KIMI_API_KEY:-}"
    if [[ -z "$api_key" ]]; then
        echo "Error: KIMI_API_KEY is not set."
        echo "  export KIMI_API_KEY='sk-kimi-xxxxxxxx'"
        return 1
    fi

    export ANTHROPIC_BASE_URL="https://api.kimi.com/coding"
    export ANTHROPIC_API_KEY="$api_key"
    export ANTHROPIC_MODEL="kimi-k2.6"
    export ANTHROPIC_SMALL_FAST_MODEL="kimi-k2.6"
    export CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1
    export DISABLE_AUTO_COMPACT=1
    export ENABLE_TOOL_SEARCH=FALSE

    echo "Connected to Kimi k2.6 via Kimi Code API (direct)"
    # --bare: skip keychain OAuth reads to avoid auth conflict
    claude --bare "$@"
}

claude-kimi-test() {
    local api_key="${KIMI_API_KEY:-}"
    if [[ -z "$api_key" ]]; then
        echo "Error: KIMI_API_KEY is not set."
        return 1
    fi

    echo "Testing Kimi Code API ..."
    local response
    response=$(curl -s -w "\n%{http_code}" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $api_key" \
        -d '{"model":"kimi-k2.6","max_tokens":1024,"messages":[{"role":"user","content":"Say hello in 3 words"}]}' \
        "https://api.kimi.com/coding/v1/messages" 2>/dev/null)

    local http_code=$(echo "$response" | tail -n1)
    local body=$(echo "$response" | sed '$d')

    if [[ "$http_code" == "200" ]]; then
        echo "API key is valid. Response preview:"
        echo "$body" | head -c 300
        echo ""
    else
        echo "API test failed (HTTP $http_code)"
        echo "Response: $body"
    fi
}
EOF
```

### Bash (`~/.bashrc`)

```bash
cat >> ~/.bashrc << 'EOF'

# ============================================
# Claude Code + Kimi k2.6 (Direct API)
# ============================================
claude-kimi() {
    local api_key="${KIMI_API_KEY:-}"
    if [ -z "$api_key" ]; then
        echo "Error: KIMI_API_KEY is not set."
        echo "  export KIMI_API_KEY='sk-kimi-xxxxxxxx'"
        return 1
    fi

    export ANTHROPIC_BASE_URL="https://api.kimi.com/coding"
    export ANTHROPIC_API_KEY="$api_key"
    export ANTHROPIC_MODEL="kimi-k2.6"
    export ANTHROPIC_SMALL_FAST_MODEL="kimi-k2.6"
    export CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1
    export DISABLE_AUTO_COMPACT=1
    export ENABLE_TOOL_SEARCH=FALSE

    echo "Connected to Kimi k2.6 via Kimi Code API (direct)"
    claude --bare "$@"
}

claude-kimi-test() {
    local api_key="${KIMI_API_KEY:-}"
    if [ -z "$api_key" ]; then
        echo "Error: KIMI_API_KEY is not set."
        return 1
    fi

    echo "Testing Kimi Code API ..."
    local response
    response=$(curl -s -w "\n%{http_code}" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $api_key" \
        -d '{"model":"kimi-k2.6","max_tokens":1024,"messages":[{"role":"user","content":"Say hello in 3 words"}]}' \
        "https://api.kimi.com/coding/v1/messages" 2>/dev/null)

    local http_code=$(echo "$response" | tail -n1)
    local body=$(echo "$response" | sed '$d')

    if [ "$http_code" = "200" ]; then
        echo "API key is valid. Response preview:"
        echo "$body" | head -c 300
        echo ""
    else
        echo "API test failed (HTTP $http_code)"
        echo "Response: $body"
    fi
}
EOF
```

---

## 5. Áp dụng và Test

```bash
# Reload shell profile
source ~/.zshrc        # hoặc source ~/.bashrc

# Test API key
claude-kimi-test

# Chạy Claude Code với Kimi k2.6
claude-kimi
```

Kết quả mong đợi:

```
Connected to Kimi k2.6 via Kimi Code API (direct)
 ▐▛███▜▌   Claude Code v2.1.x
▝▜█████▛▘  kimi-k2.6 with high effort · API Usage Billing
```

---

## 6. Troubleshooting

| Lỗi | Nguyên nhân | Cách fix |
|-----|-------------|----------|
| `401 Invalid Authentication` | Sai API key hoặc key thuộc endpoint khác | Kiểm tra key tại platform.kimi.ai. Key phải có prefix `sk-kimi-*` và dùng cho Kimi Code API. |
| `403 usage limit` | Hết quota billing cycle | Nâng cấp gói hoặc chờ refresh cycle mới tại https://www.kimi.com/code/console |
| `Auth conflict: Both a token and an API key` | Claude Code đang lưu OAuth token cũ của claude.ai | Dùng `claude --bare` (đã có sẵn trong function `claude-kimi`) |
| `claude-code-proxy not found` | Function cũ còn cache trong shell | `source ~/.zshrc` hoặc mở terminal mới |
| `Command not found: claude` | Claude Code CLI chưa cài | Chạy lại `npm install -g @anthropic-ai/claude-code` |

---

## 7. Security Checklist

- [ ] API key lưu trong `~/.zshrc` hoặc `~/.bashrc` với permission `600`
- [ ] Không commit API key vào Git repo
- [ ] Không log API key vào stdout/script
- [ ] Server S1 chỉ outbound đến `api.kimi.com:443`, không cần inbound từ Kimi
- [ ] Xoay key định kỳ nếu nghi ngờ leak

---

## 8. Handoff Note (EndiorBot Scope)

> Per **Handoff Boundary (LOCKED 2026-04-19)**: EndiorBot scoped to CEO's local MacBook repos only. Remote server execution (SSH, S1 setup, on-call) is **out-of-scope** for EndiorBot and owned by MTClaw / @itadmin.
>
> This document is an **advisory scaffold** produced by EndiorBot for @itadmin execution. Any runtime issues on S1 should be handled by MTClaw's @pm or @devops directly on the target host.
