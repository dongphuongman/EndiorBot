"""
Auth module: extract Chrome cookies for ezcloudhotel.com
OR use saved Playwright storage_state.json
"""
from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

SESSION_FILE = Path.home() / ".endiorbot" / "pms-session.json"
PMS_DOMAIN = "ezcloudhotel.com"


def load_cookies_from_chrome() -> list[dict[str, Any]]:
    """Extract cookies from running Chrome via browser_cookie3."""
    try:
        import browser_cookie3
        jar = browser_cookie3.chrome(domain_name=PMS_DOMAIN)
        cookies = []
        for c in jar:
            cookies.append({
                "name": c.name,
                "value": c.value,
                "domain": c.domain,
                "path": c.path,
                "secure": bool(c.secure),
                "httpOnly": False,
                "sameSite": "Lax",
            })
        logger.info("[auth] Loaded %d cookies from Chrome for %s", len(cookies), PMS_DOMAIN)
        return cookies
    except Exception as e:
        logger.warning("[auth] browser_cookie3 failed: %s", e)
        return []


def load_session_file() -> dict[str, Any] | None:
    """Load saved Playwright storage_state.json if it exists."""
    if SESSION_FILE.exists():
        try:
            data = json.loads(SESSION_FILE.read_text())
            logger.info("[auth] Loaded session from %s", SESSION_FILE)
            return data
        except Exception as e:
            logger.warning("[auth] Failed to load session file: %s", e)
    return None


def save_session(storage_state: dict[str, Any]) -> None:
    """Save Playwright storage_state to disk for reuse."""
    SESSION_FILE.parent.mkdir(parents=True, exist_ok=True)
    SESSION_FILE.write_text(json.dumps(storage_state, indent=2))
    logger.info("[auth] Session saved to %s", SESSION_FILE)


def run_interactive_setup() -> None:
    """Open a browser for the user to log in, then save the session."""
    from playwright.sync_api import sync_playwright

    print(f"[setup] Opening browser — please log in to {PMS_DOMAIN}")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context = browser.new_context()
        page = context.new_page()
        page.goto(f"https://pms.{PMS_DOMAIN}/")
        print("[setup] Log in and press Enter here when done...")
        input()
        storage = context.storage_state()
        save_session(storage)
        browser.close()
    print(f"[setup] Session saved to {SESSION_FILE}")
