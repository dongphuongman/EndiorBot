"""
Debug script: inspect revenue-detail page structure.
- Captures ALL network requests
- Takes screenshot
- Dumps date input selectors
- Dumps table HTML
Run: python3 debug_page.py
"""
from __future__ import annotations
import json
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from auth import load_cookies_from_chrome, load_session_file, SESSION_FILE
from playwright.sync_api import sync_playwright

PMS_URL = "https://pms.ezcloudhotel.com/#/reports/revenue-detail"

def main():
    session = load_session_file()
    cookies = load_cookies_from_chrome() if not session else []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)  # visible để xem page

        ctx_opts = {}
        if session:
            # Write session to temp file
            import tempfile
            with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
                json.dump(session, f)
                ctx_opts["storage_state"] = f.name

        context = browser.new_context(**ctx_opts)
        if cookies:
            context.add_cookies(cookies)

        page = context.new_page()

        # Capture ALL API responses
        api_calls = []
        def handle_response(response):
            url = response.url
            content_type = response.headers.get("content-type", "")
            if "json" in content_type and "telegram" not in url and "google" not in url:
                try:
                    body = response.json()
                    api_calls.append({"url": url, "status": response.status, "size": len(str(body))})
                    print(f"  [API] {response.status} {url[:100]} ({len(str(body))} bytes)")
                except Exception:
                    pass

        page.on("response", handle_response)

        print(f"[debug] Navigating to {PMS_URL}")
        page.goto(PMS_URL, wait_until="networkidle", timeout=30000)

        # Screenshot
        page.screenshot(path="/tmp/pms_revenue_page.png", full_page=True)
        print("[debug] Screenshot: /tmp/pms_revenue_page.png")

        # Find ALL input elements
        inputs = page.eval_on_selector_all("input", """els => els.map(e => ({
            type: e.type,
            placeholder: e.placeholder,
            name: e.name,
            class: e.className.slice(0, 60),
            value: e.value.slice(0, 30),
            visible: e.offsetParent !== null
        }))""")
        print(f"\n[debug] Found {len(inputs)} inputs:")
        for i in inputs:
            print(f"  {i}")

        # Find date pickers specifically
        date_pickers = page.query_selector_all("[class*='date'], [class*='picker'], [class*='calendar']")
        print(f"\n[debug] Date picker elements: {len(date_pickers)}")
        for dp in date_pickers[:5]:
            print(f"  tag={dp.evaluate('e=>e.tagName')} class={dp.get_attribute('class')}")

        # Find table structure
        tables = page.query_selector_all("table, [class*='table']")
        print(f"\n[debug] Tables found: {len(tables)}")
        for t in tables[:3]:
            html = t.evaluate("e => e.outerHTML.slice(0, 500)")
            print(f"  {html}")
            print("  ---")

        # Find the date filter section
        filter_section = page.query_selector("[class*='filter'], [class*='search'], [class*='query']")
        if filter_section:
            html = filter_section.evaluate("e => e.outerHTML.slice(0, 800)")
            print(f"\n[debug] Filter section:\n{html}")

        print(f"\n[debug] Total API calls intercepted: {len(api_calls)}")
        for c in api_calls:
            print(f"  {c['status']} {c['url'][:100]} ({c['size']} bytes)")

        print("\n[debug] Waiting 5s for you to inspect... press Ctrl+C to stop")
        page.wait_for_timeout(5000)

        browser.close()

if __name__ == "__main__":
    main()
