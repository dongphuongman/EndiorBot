#!/usr/bin/env bash
# Install GitHub Copilot CLI (latest release) to ~/.local/bin
# Supports: Linux x64/arm64, Darwin (macOS) x64/arm64
set -e

BIN_DIR="${HOME}/.local/bin"
mkdir -p "$BIN_DIR"

# Detect platform
case "$(uname -s)" in
  Linux)
    case "$(uname -m)" in
      x86_64|amd64) ASSET_PATTERN="*linux-x64*";;
      aarch64|arm64) ASSET_PATTERN="*linux-arm64*";;
      *) echo "Unsupported arch: $(uname -m)"; exit 1;;
    esac
    ;;
  Darwin)
    case "$(uname -m)" in
      x86_64) ASSET_PATTERN="*darwin-x64*";;
      arm64) ASSET_PATTERN="*darwin-arm64*";;
      *) echo "Unsupported arch: $(uname -m)"; exit 1;;
    esac
    ;;
  *)
    echo "Unsupported OS: $(uname -s)"; exit 1
    ;;
esac

echo "Platform: $(uname -s)-$(uname -m) → pattern: $ASSET_PATTERN"

# Download latest release
REPO="github/copilot-cli"
TAG=$(gh release view --repo "$REPO" --json tagName -q '.tagName')
echo "Latest release: $TAG"

DOWNLOAD_DIR=$(mktemp -d)
trap "rm -rf $DOWNLOAD_DIR" EXIT

gh release download --repo "$REPO" --pattern "$ASSET_PATTERN" --dir "$DOWNLOAD_DIR"

# Find the tarball (skip .zip/.msi)
TARBALL=$(find "$DOWNLOAD_DIR" -name "*.tar.gz" -type f | head -1)
if [ -z "$TARBALL" ]; then
  echo "No .tar.gz asset found."; exit 1
fi

# Extract (copilot binary is at top level)
tar -xzf "$TARBALL" -C "$DOWNLOAD_DIR"
BINARY=$(find "$DOWNLOAD_DIR" -maxdepth 1 -type f -name "copilot" 2>/dev/null | head -1)
if [ -z "$BINARY" ]; then
  # Some releases have a subdir
  BINARY=$(find "$DOWNLOAD_DIR" -type f -name "copilot" 2>/dev/null | head -1)
fi
if [ -z "$BINARY" ] || [ ! -f "$BINARY" ]; then
  echo "Binary 'copilot' not found in archive."; exit 1
fi

install -m 0755 "$BINARY" "$BIN_DIR/copilot"
echo "Installed: $BIN_DIR/copilot"

# Ensure PATH
if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
  echo "Add to your shell profile: export PATH=\"\$HOME/.local/bin:\$PATH\""
fi

# Test
"$BIN_DIR/copilot" --help
echo "Done. Run: $BIN_DIR/copilot --help"
