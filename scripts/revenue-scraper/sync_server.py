"""
Sync revenue CSV files to NQH AI server via SCP.
Usage (standalone):
  python sync_server.py /tmp/revenue_yesterday_2026-03-17.csv

Or called from main.py with --sync flag.

Remote path: dttai@nqh-ai:/home/nqh/shared/models/apps/clickhouse/ezcloudhotel/
MTClaw agent reads from that directory and imports to ClickHouse DWH.
"""
from __future__ import annotations

import logging
import os
import subprocess
import sys
from pathlib import Path

logger = logging.getLogger(__name__)

# Override via env var if needed
REMOTE_HOST = os.getenv("NQH_SERVER", "nqh-internal.example")
REMOTE_USER = os.getenv("NQH_USER", "dttai")
REMOTE_DIR = os.getenv(
    "NQH_CLICKHOUSE_DIR",
    "/home/nqh/shared/models/apps/clickhouse/ezcloudhotel"
)
SSH_KEY = os.getenv("NQH_SSH_KEY", "")  # path to identity file, empty = use default


FALLBACK_HOST = os.getenv("NQH_SERVER_FALLBACK", "nqh-ai")  # via cloudflared


def _scp(local: Path, host: str, key: str = "") -> bool:
    """Run a single SCP command. Returns True on success."""
    remote = f"{REMOTE_USER}@{host}:{REMOTE_DIR}/{local.name}"
    cmd = ["scp"]
    if key:
        cmd += ["-i", key]
    cmd += ["-o", "StrictHostKeyChecking=no", "-o", "ConnectTimeout=15", str(local), remote]
    logger.info("[sync] SCP %s → %s", local.name, remote)
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        if result.returncode == 0:
            logger.info("[sync] Upload OK: %s", local.name)
            return True
        logger.warning("[sync] SCP to %s failed (exit %d): %s", host, result.returncode, result.stderr.strip())
        return False
    except subprocess.TimeoutExpired:
        logger.warning("[sync] SCP to %s timeout", host)
        return False


def sync_file(local_path: str) -> bool:
    """
    SCP a local file to NQH server.
    Primary: nqh-internal.example — Fallback: nqh-ai (cloudflared).
    Returns True on success.
    """
    local = Path(local_path)
    if not local.exists():
        logger.error("[sync] File not found: %s", local_path)
        return False

    # Primary
    if _scp(local, REMOTE_HOST, SSH_KEY):
        return True

    # Fallback
    logger.info("[sync] Thử fallback %s...", FALLBACK_HOST)
    return _scp(local, FALLBACK_HOST, SSH_KEY)


def ensure_remote_dir() -> bool:
    """Tạo remote directory nếu chưa tồn tại."""
    ssh_cmd = ["ssh"]
    if SSH_KEY:
        ssh_cmd += ["-i", SSH_KEY]
    ssh_cmd += [
        "-o", "StrictHostKeyChecking=no",
        f"{REMOTE_USER}@{REMOTE_HOST}",
        f"mkdir -p {REMOTE_DIR}"
    ]
    try:
        result = subprocess.run(ssh_cmd, capture_output=True, text=True, timeout=15)
        return result.returncode == 0
    except Exception as e:
        logger.warning("[sync] Could not ensure remote dir: %s", e)
        return False


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    if len(sys.argv) < 2:
        print("Usage: python sync_server.py <file_path>", file=sys.stderr)
        sys.exit(1)
    ok = sync_file(sys.argv[1])
    sys.exit(0 if ok else 1)
