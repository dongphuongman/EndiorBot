"""
Debug script: capture the exact POST body for get-revenue-detail-statistics API.
- Intercepts all requests and responses
- Triggers a date change to capture query params
- Saves full request/response to /tmp/api_capture.json
Run: python3 debug_api.py
"""
from __future__ import annotations
import json
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from auth import load_session_file
from playwright.sync_api import sync_playwright
import tempfile

PMS_URL = "https://pms.ezcloudhotel.com/#/reports/revenue-detail"
TARGET_API = "get-revenue-detail-statistics"

def main():
    session = load_session_file()
    if not session:
        print("ERROR: No session found. Run: python3 main.py --setup", file=sys.stderr)
        sys.exit(1)

    captured = []  # request+response pairs

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)

        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
            json.dump(session, f)
            session_path = f.name

        context = browser.new_context(storage_state=session_path)
        page = context.new_page()

        # Intercept both request and response
        def handle_request(request):
            if TARGET_API in request.url:
                try:
                    post_data = request.post_data
                    post_json = request.post_data_json
                    entry = {
                        "type": "request",
                        "url": request.url,
                        "method": request.method,
                        "headers": dict(request.headers),
                        "post_data": post_data,
                        "post_json": post_json,
                    }
                    captured.append(entry)
                    print(f"\n[REQUEST] {request.method} {request.url}")
                    print(f"  POST data: {post_data}")
                    print(f"  POST JSON: {json.dumps(post_json, indent=2, ensure_ascii=False) if post_json else 'N/A'}")
                except Exception as e:
                    print(f"  [request capture error] {e}")

        def handle_response(response):
            if TARGET_API in response.url:
                try:
                    body = response.json()
                    entry = {
                        "type": "response",
                        "url": response.url,
                        "status": response.status,
                        "body": body,
                    }
                    captured.append(entry)
                    print(f"\n[RESPONSE] {response.status} {response.url}")
                    print(f"  Body (first 1000 chars): {json.dumps(body, ensure_ascii=False)[:1000]}")
                    print(f"  Type: {type(body).__name__}")
                    if isinstance(body, dict):
                        print(f"  Keys: {list(body.keys())}")
                    elif isinstance(body, list):
                        print(f"  List length: {len(body)}")
                        if body:
                            print(f"  First item keys: {list(body[0].keys()) if isinstance(body[0], dict) else 'not a dict'}")
                except Exception as e:
                    print(f"  [response capture error] {e}")

        page.on("request", handle_request)
        page.on("response", handle_response)

        print(f"[debug] Navigating to {PMS_URL}")
        page.goto(PMS_URL, wait_until="networkidle", timeout=30000)
        print(f"[debug] Page loaded: {page.url}")

        if "login" in page.url.lower():
            print("ERROR: Session expired. Run: python3 main.py --setup", file=sys.stderr)
            browser.close()
            sys.exit(1)

        # Check ALL cookies currently active
        cookies = context.cookies()
        print(f"\n[debug] Active cookies ({len(cookies)}):")
        for c in cookies:
            if "ezcloud" in c.get("domain", ""):
                print(f"  {c['name']}={c['value'][:30]}... domain={c['domain']}")

        # Print all inputs
        inputs = page.eval_on_selector_all("input", """els => els.map(e => ({
            type: e.type, name: e.name, class: e.className.slice(0,60),
            value: e.value.slice(0,30), visible: e.offsetParent !== null
        }))""")
        print(f"\n[debug] Inputs ({len(inputs)}):")
        for i in inputs:
            if i.get("visible"):
                print(f"  {i}")

        # Try to change dates to trigger a new API call
        # Date inputs use class 'datetime-shift'
        date_inputs = page.query_selector_all("input.datetime-shift")
        print(f"\n[debug] datetime-shift inputs: {len(date_inputs)}")

        if len(date_inputs) >= 1:
            print("[debug] Attempting to change date to 16/03/2026 to trigger API call...")
            # Click the first date input and change value
            di = date_inputs[0]
            di.triple_click()
            di.fill("16/03/2026")
            di.press("Tab")
            page.wait_for_timeout(1000)

            if len(date_inputs) >= 2:
                di2 = date_inputs[1]
                di2.triple_click()
                di2.fill("16/03/2026")
                di2.press("Tab")
                page.wait_for_timeout(1000)

            # Look for search/apply button
            btns = page.query_selector_all("button")
            print(f"\n[debug] Buttons found: {len(btns)}")
            for btn in btns[:10]:
                txt = btn.inner_text().strip()
                if txt:
                    print(f"  '{txt}' visible={btn.is_visible()}")

            # Click search button
            search_btn = page.query_selector(
                "button:has-text('Tìm'), button:has-text('Search'), "
                "button:has-text('Lọc'), button:has-text('Xem'), "
                "button[type='submit']"
            )
            if search_btn:
                print(f"\n[debug] Clicking search button: '{search_btn.inner_text().strip()}'")
                search_btn.click()
                page.wait_for_timeout(3000)
            else:
                print("[debug] No search button found, waiting for auto-trigger...")
                page.wait_for_timeout(3000)

        # Save full capture
        out_path = "/tmp/api_capture.json"
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(captured, f, indent=2, ensure_ascii=False)
        print(f"\n[debug] Saved {len(captured)} captured items to {out_path}")

        # Summary
        requests = [c for c in captured if c["type"] == "request"]
        responses = [c for c in captured if c["type"] == "response"]
        print(f"  Requests to {TARGET_API}: {len(requests)}")
        print(f"  Responses from {TARGET_API}: {len(responses)}")

        if requests:
            print(f"\n=== FIRST REQUEST POST BODY ===")
            print(json.dumps(requests[0].get("post_json") or requests[0].get("post_data"), indent=2, ensure_ascii=False))

        if responses:
            print(f"\n=== FIRST RESPONSE BODY STRUCTURE ===")
            body = responses[0]["body"]
            print(f"Type: {type(body).__name__}")
            if isinstance(body, dict):
                print(f"Keys: {list(body.keys())}")
                for k, v in body.items():
                    if isinstance(v, list):
                        print(f"  {k}: list of {len(v)} items")
                        if v and isinstance(v[0], dict):
                            print(f"    First item keys: {list(v[0].keys())}")
                            print(f"    First item: {json.dumps(v[0], ensure_ascii=False)[:300]}")
                    else:
                        print(f"  {k}: {str(v)[:100]}")
            elif isinstance(body, list):
                print(f"Length: {len(body)}")
                if body and isinstance(body[0], dict):
                    print(f"First item keys: {list(body[0].keys())}")
                    print(f"First item: {json.dumps(body[0], ensure_ascii=False)[:300]}")

        print("\n[debug] Waiting 10s... check /tmp/api_capture.json")
        page.wait_for_timeout(10000)
        browser.close()


if __name__ == "__main__":
    main()
