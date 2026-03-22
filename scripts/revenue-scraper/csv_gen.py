"""
Export revenue rows to CSV (for ClickHouse import).
"""
from __future__ import annotations

import csv
import logging
from datetime import date
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# Field name mapping: API → ClickHouse column
FIELD_MAP = {
    "Id":                "bill_id",
    "BookingCode":       "booking_code",
    "BillNumber":        "bill_number",
    "CMSCode":           "cms_code",
    "OTACode":           "ota_code",
    "RoomTypeInfo":      "room_type",
    "RoomInfo":          "room_number",
    "TravellerName":     "traveller_name",
    "IdentityNumber":    "identity_number",
    "Email":             "email",
    "Mobile":            "mobile",
    "Status":            "status",
    "ArrivalDate":       "arrival_date",
    "DepartureDate":     "departure_date",
    "Nights":            "nights",
    "RoomChargePerDay":  "room_charge",
    "ExtraServicePerDay":"extra_service",
    "DiscountAmount":    "discount",
    "TotalAmountPerDay": "total_amount",
    "Cash":              "cash",
    "BankTransfer":      "bank_transfer",
    "CityLedger":        "city_ledger",
    "Credit":            "credit",
    "Debit":             "debit",
    "Balance":           "balance",
    "RoomPriceAVGPerDay":"avg_room_price",
    "CompanyName":       "company_name",
    "SourceName":        "source_name",
    "MarketName":        "market_name",
    "CreatedBy":         "created_by",
    "Module":            "module",
}

HOTEL_ID = 16465  # The Kupid Đà Lạt — đổi nếu cần


def generate_csv(rows: list[dict[str, Any]], output_path: str,
                 from_date: date, to_date: date) -> str:
    """
    Export rows to CSV with ClickHouse-compatible column names.
    Returns the output path.
    """
    if not rows:
        raise ValueError("No data to export")

    ch_columns = ["hotel_id", "scrape_date"] + list(FIELD_MAP.values())
    scrape_date = date.today().isoformat()

    Path(output_path).parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f, quoting=csv.QUOTE_MINIMAL)
        writer.writerow(ch_columns)

        for r in rows:
            row_data = [HOTEL_ID, scrape_date]
            for api_key in FIELD_MAP:
                val = r.get(api_key)
                # Normalize None to empty string for CSV
                if val is None:
                    row_data.append("")
                else:
                    row_data.append(val)
            writer.writerow(row_data)

    logger.info("[csv] Saved %d rows to %s", len(rows), output_path)
    return output_path
