"""
Revenue scraper for ezcloudhotel.com PMS.

Strategy (in order):
1. Direct API call (fastest, most reliable) — uses saved session cookies
2. Playwright + API interception (fallback if direct API fails)
3. DOM table extraction (last resort)
"""
from __future__ import annotations

import logging
from datetime import date, timedelta
from typing import Any

logger = logging.getLogger(__name__)

PMS_URL = "https://pms.ezcloudhotel.com/#/reports/revenue-detail"


def _resolve_dates(period: str) -> tuple[date, date]:
    """Resolve period string to (from_date, to_date)."""
    today = date.today()

    if period == "yesterday":
        d = today - timedelta(days=1)
        return d, d

    if period == "week":
        # Last 7 days ending yesterday
        end = today - timedelta(days=1)
        start = end - timedelta(days=6)
        return start, end

    if period == "month":
        start = today.replace(day=1)
        return start, today

    if period.startswith("range:"):
        # "range:01/03-15/03" (DD/MM, current year)
        raw = period[len("range:"):]
        parts = raw.split("-")
        if len(parts) == 2:
            def parse_ddmm(s: str) -> date:
                d_part, m_part = s.strip().split("/")
                return date(today.year, int(m_part), int(d_part))
            return parse_ddmm(parts[0]), parse_ddmm(parts[1])

    # default: yesterday
    d = today - timedelta(days=1)
    return d, d


def scrape(period: str, cookies: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Scrape revenue detail data for the given period using browser cookies.
    Falls back to Playwright if needed.
    Returns list of row dicts.
    """
    from_date, to_date = _resolve_dates(period)
    logger.info("[scraper] period=%s from=%s to=%s", period, from_date, to_date)

    # Convert Playwright-style cookie list to session dict format
    session = {"cookies": cookies}
    return _scrape_via_api(from_date, to_date, session)


def scrape_with_session(period: str, session: dict) -> list[dict[str, Any]]:
    """Scrape using saved Playwright storage_state."""
    from_date, to_date = _resolve_dates(period)
    logger.info("[scraper] period=%s from=%s to=%s", period, from_date, to_date)
    return _scrape_via_api(from_date, to_date, session)


def _scrape_via_api(from_date: date, to_date: date, session: dict) -> list[dict[str, Any]]:
    """
    Primary strategy: call the REST API directly with session cookies.
    Falls back to Playwright browser automation if the API call fails.
    """
    try:
        from api_client import fetch_revenue_data
        rows = fetch_revenue_data(from_date, to_date, session)
        if rows:
            logger.info("[scraper] Got %d rows via direct API", len(rows))
            return rows
        logger.warning("[scraper] API returned 0 rows, falling back to Playwright")
    except Exception as e:
        logger.warning("[scraper] Direct API failed: %s — falling back to Playwright", e)

    # Fallback: Playwright browser automation
    return _scrape_via_playwright(from_date, to_date, session)


def _scrape_via_playwright(from_date: date, to_date: date, session: dict) -> list[dict[str, Any]]:
    """Fallback: Playwright headless browser with API response interception."""
    import json
    import tempfile
    from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout

    # Write session to temp file
    with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
        json.dump(session, f)
        session_path = f.name

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(
                storage_state=session_path,
                viewport={"width": 1440, "height": 900},
                locale="vi-VN",
            )
            page = context.new_page()

            # Intercept API responses
            api_data: list[dict[str, Any]] = []

            def handle_response(response) -> None:
                url = response.url
                if "revenue" in url.lower() or "report" in url.lower():
                    try:
                        body = response.json()
                        if isinstance(body, (list, dict)):
                            api_data.append({"url": url, "data": body})
                            logger.info("[scraper] Intercepted API: %s", url[:80])
                    except Exception:
                        pass

            page.on("response", handle_response)

            logger.info("[scraper] Navigating to %s", PMS_URL)
            page.goto(PMS_URL, wait_until="networkidle", timeout=30000)

            if "login" in page.url.lower():
                browser.close()
                raise RuntimeError("Session expired. Run: python main.py --setup")

            # Set date filters using the correct class-based selector
            _set_date_filters(page, from_date, to_date)
            page.wait_for_timeout(3000)

            # Prefer intercepted API data
            if api_data:
                rows = _parse_api_data(api_data)
                if rows:
                    logger.info("[scraper] Got %d rows from intercepted API", len(rows))
                    browser.close()
                    return rows

            # Last resort: DOM table
            rows = _extract_dom_table(page)
            logger.info("[scraper] Got %d rows from DOM", len(rows))
            browser.close()
            return rows
    finally:
        import os
        try:
            os.unlink(session_path)
        except OSError:
            pass


def _set_date_filters(page, from_date: date, to_date: date) -> None:
    """Set date range inputs using the correct class-based selectors."""
    from_str = from_date.strftime("%d/%m/%Y")
    to_str = to_date.strftime("%d/%m/%Y")

    try:
        # Primary: use class 'datetime-shift' (confirmed by debug_page.py)
        date_inputs = page.query_selector_all("input.datetime-shift")
        if len(date_inputs) >= 2:
            date_inputs[0].click(click_count=3)
            date_inputs[0].fill(from_str)
            date_inputs[0].press("Tab")
            page.wait_for_timeout(300)
            date_inputs[1].click(click_count=3)
            date_inputs[1].fill(to_str)
            date_inputs[1].press("Tab")
            page.wait_for_timeout(500)
            logger.info("[scraper] Set date range via .datetime-shift: %s → %s", from_str, to_str)

            # Click search/filter button
            search_btn = page.query_selector(
                "button:has-text('Tìm'), button:has-text('Search'), "
                "button:has-text('Lọc'), button:has-text('Xem'), "
                "button[type='submit']"
            )
            if search_btn:
                search_btn.click()
                page.wait_for_timeout(1500)
            return

        # Fallback: try other common selectors
        date_inputs = page.query_selector_all(
            "input[type='text'][placeholder*='date'], "
            "input[type='text'][placeholder*='ngày'], "
            ".el-date-editor input"
        )
        if len(date_inputs) >= 2:
            date_inputs[0].click(click_count=3)
            date_inputs[0].type(from_str)
            date_inputs[0].press("Enter")
            page.wait_for_timeout(300)
            date_inputs[1].click(click_count=3)
            date_inputs[1].type(to_str)
            date_inputs[1].press("Enter")
            page.wait_for_timeout(500)
            logger.info("[scraper] Set date range via fallback: %s → %s", from_str, to_str)
        else:
            logger.warning("[scraper] Could not find date inputs (found %d)", len(date_inputs))
    except Exception as e:
        logger.warning("[scraper] Date filter failed: %s", e)


def _parse_api_data(api_data: list[dict]) -> list[dict[str, Any]]:
    """Parse intercepted API response data into flat row list."""
    rows = []
    for item in api_data:
        data = item["data"]
        if isinstance(data, list):
            rows.extend(data)
        elif isinstance(data, dict):
            for key in ("data", "items", "rows", "result", "records", "list", "Data"):
                if key in data and isinstance(data[key], list):
                    rows.extend(data[key])
                    break
    return rows


def _extract_dom_table(page) -> list[dict[str, Any]]:
    """Extract table data from DOM (last resort)."""
    rows = []
    try:
        headers = page.eval_on_selector_all(
            "table thead th, .el-table__header th",
            "els => els.map(e => e.innerText.trim())"
        )
        if not headers:
            headers = []

        data_rows = page.eval_on_selector_all(
            "table tbody tr, .el-table__body tr",
            "rows => rows.map(r => Array.from(r.querySelectorAll('td')).map(c => c.innerText.trim()))"
        )

        for cells in data_rows:
            if not any(cells):
                continue
            if headers:
                row = {headers[i]: cells[i] if i < len(cells) else "" for i in range(len(headers))}
            else:
                row = {f"col_{i}": v for i, v in enumerate(cells)}
            rows.append(row)

    except Exception as e:
        logger.error("[scraper] DOM extraction failed: %s", e)

    return rows
