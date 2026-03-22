"""
Direct API client for ezcloudhotel PMS revenue statistics.
Calls POST /api/statistics/get-revenue-detail-statistics with session cookies.
"""
from __future__ import annotations

import json
import logging
from datetime import date, timedelta, datetime, timezone
from typing import Any

logger = logging.getLogger(__name__)

API_BASE = "https://pms.ezcloudhotel.com"
REVENUE_ENDPOINT = f"{API_BASE}/api/statistics/get-revenue-detail-statistics"
CONFIG_ENDPOINT = f"{API_BASE}/api/statistics/get-revenue-detail-config?reportCode=REPORT_REVENUE_DETA"

# Vietnam timezone = UTC+7
TZ_OFFSET_HOURS = 7
PAGE_SIZE = 200  # fetch up to 200 rows per request (max supported)


def _to_utc_iso(local_date: date, end_of_day: bool = False) -> str:
    """
    Convert local Vietnam date to UTC ISO string for API.
    Vietnam is UTC+7, so:
      - Start of day local = previous day at 17:00 UTC
      - End of day local (23:59) = same day at 16:59 UTC
    """
    if end_of_day:
        # 23:59 Vietnam = 16:59 UTC same day
        utc_dt = datetime(local_date.year, local_date.month, local_date.day,
                          23 - TZ_OFFSET_HOURS, 59, 0, tzinfo=timezone.utc)
    else:
        # 00:00 Vietnam = 17:00 UTC previous day
        prev_day = local_date - timedelta(days=1)
        utc_dt = datetime(prev_day.year, prev_day.month, prev_day.day,
                          17, 0, 0, tzinfo=timezone.utc)
    return utc_dt.strftime("%Y-%m-%dT%H:%M:%S.000Z")


def _build_payload(from_date: date, to_date: date, page: int = 1, start_index: int = 0) -> dict:
    """Build the POST body for the statistics API."""
    return {
        "IncludeTaxFee": True,
        "RevenueRoomCheckOut": True,
        "FromDate": _to_utc_iso(from_date, end_of_day=False),
        "ToDate": _to_utc_iso(to_date, end_of_day=True),
        "BillNumberFilter": "",
        "CMSCodeFilter": "",
        "OTACodeFilter": "",
        "BooKingStatusSelectInclude": True,
        "BookingStatus": None,
        "RoomTypesSelectInclude": True,
        "RoomTypes": None,
        "CompaniesSelectInclude": True,
        "Companies": None,
        "SourcesSelectInclude": True,
        "Sources": None,
        "MarketsSelectInclude": True,
        "Markets": None,
        "ModuleIdSelectInclude": True,
        "ModuleId": None,
        "Language": "vn",
        "PageSize": PAGE_SIZE,
        "StartIndex": start_index,
        "OrderBy": "DepartureDate",
        "Ascending": True,
        "MinorUnit": "0",
        "MoneyName": "VND",
        "GroupBy": "Module",
        "take": PAGE_SIZE,
        "skip": start_index,
        "page": page,
        "pageSize": PAGE_SIZE,
        "sort": [{"field": "DepartureDate", "dir": "asc"}],
        "aggregate": [
            {"field": "RoomChargePerDay", "aggregate": "sum"},
            {"field": "ExtraServicePerDay", "aggregate": "sum"},
            {"field": "DiscountAmount", "aggregate": "sum"},
            {"field": "TotalAmountPerDay", "aggregate": "sum"},
            {"field": "Cash", "aggregate": "sum"},
            {"field": "Balance", "aggregate": "sum"},
            {"field": "BankTransfer", "aggregate": "sum"},
            {"field": "CityLedger", "aggregate": "sum"},
            {"field": "Credit", "aggregate": "sum"},
            {"field": "Debit", "aggregate": "sum"},
            {"field": "Nights", "aggregate": "sum"},
        ],
    }


def _extract_auth(session: dict) -> tuple[dict[str, str], str | None]:
    """
    Extract cookies and Bearer token from Playwright storage_state.
    Returns (cookies_dict, access_token_or_None).
    """
    import json as _json

    cookies: dict[str, str] = {}
    for c in session.get("cookies", []):
        if "ezcloudhotel" in c.get("domain", ""):
            cookies[c["name"]] = c["value"]

    # Extract Bearer token from localStorage.ezIdData
    access_token: str | None = None
    for origin in session.get("origins", []):
        for entry in origin.get("localStorage", []):
            if entry.get("name") == "ezIdData":
                try:
                    data = _json.loads(entry["value"])
                    access_token = data.get("access_token")
                except Exception:
                    pass
                break

    return cookies, access_token


def fetch_revenue_data(from_date: date, to_date: date, session: dict) -> list[dict[str, Any]]:
    """
    Fetch all revenue data from the API for the given date range.
    Uses saved session cookies + Bearer token for authentication.
    Returns list of row dicts.
    """
    import requests

    cookies, access_token = _extract_auth(session)
    if not access_token and not cookies:
        raise RuntimeError("No auth credentials in session. Run: python3 main.py --setup")

    logger.info("[api] Fetching revenue %s → %s", from_date, to_date)
    logger.info("[api] FromDate UTC: %s", _to_utc_iso(from_date, end_of_day=False))
    logger.info("[api] ToDate UTC: %s", _to_utc_iso(to_date, end_of_day=True))
    if access_token:
        logger.info("[api] Using Bearer token: %s...", access_token[:20])
    else:
        logger.info("[api] No Bearer token found, using cookies only")

    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Referer": "https://pms.ezcloudhotel.com/",
        "Origin": "https://pms.ezcloudhotel.com",
    }
    if access_token:
        headers["Authorization"] = f"Bearer {access_token}"

    session_obj = requests.Session()
    session_obj.headers.update(headers)
    for name, value in cookies.items():
        session_obj.cookies.set(name, value, domain="pms.ezcloudhotel.com")

    all_rows: list[dict[str, Any]] = []
    page = 1
    start_index = 0

    while True:
        payload = _build_payload(from_date, to_date, page=page, start_index=start_index)
        logger.info("[api] POST page=%d skip=%d", page, start_index)

        resp = session_obj.post(REVENUE_ENDPOINT, json=payload, timeout=30)
        logger.info("[api] Response: %d (%d bytes)", resp.status_code, len(resp.content))

        if resp.status_code == 401 or resp.status_code == 403:
            raise RuntimeError(
                f"Authentication failed ({resp.status_code}). "
                "Session expired. Run: python3 main.py --setup"
            )

        resp.raise_for_status()

        body = resp.json()
        rows, total = _parse_response(body)
        all_rows.extend(rows)

        logger.info("[api] Got %d rows (total reported: %s, fetched so far: %d)",
                    len(rows), total, len(all_rows))

        # Pagination: stop if we have all rows or got nothing
        if not rows:
            break
        if total is not None and len(all_rows) >= total:
            break
        if len(rows) < PAGE_SIZE:
            # Got fewer than a full page → last page
            break

        # Next page
        page += 1
        start_index += PAGE_SIZE

    logger.info("[api] Total rows fetched: %d", len(all_rows))
    return all_rows


def _parse_response(body: Any) -> tuple[list[dict], int | None]:
    """
    Parse API response body into (rows, total_count).
    Handles multiple response shapes.
    """
    if isinstance(body, list):
        return body, len(body)

    if isinstance(body, dict):
        # EzCloud PMS shape: {"ReportRevenueDetailModel": [...], "TotalRecords": N, "sumtotal": {...}}
        for data_key in ("ReportRevenueDetailModel", "data", "items", "rows", "result", "records", "list", "Data"):
            if data_key in body and isinstance(body[data_key], list):
                rows = body[data_key]
                total = (body.get("TotalRecords") or body.get("total") or
                         body.get("Total") or body.get("totalCount") or None)
                if total is not None:
                    total = int(total)
                return rows, total

        # Shape: {"success": true, "result": {"data": [...], "total": N}}
        for wrapper_key in ("result", "Result", "payload", "response"):
            if wrapper_key in body and isinstance(body[wrapper_key], dict):
                inner = body[wrapper_key]
                for data_key in ("ReportRevenueDetailModel", "data", "items", "rows", "list"):
                    if data_key in inner and isinstance(inner[data_key], list):
                        rows = inner[data_key]
                        total = (inner.get("TotalRecords") or inner.get("total") or
                                 inner.get("totalCount") or None)
                        if total is not None:
                            total = int(total)
                        return rows, total

    return [], None


def test_connection(session: dict) -> bool:
    """Quick test: can we reach the API with the saved session?"""
    import requests as req
    cookies, access_token = _extract_auth(session)
    headers = {}
    if access_token:
        headers["Authorization"] = f"Bearer {access_token}"
    resp = req.get(CONFIG_ENDPOINT, cookies=cookies, headers=headers, timeout=10)
    logger.info("[api] Config endpoint: %d", resp.status_code)
    return resp.status_code == 200
