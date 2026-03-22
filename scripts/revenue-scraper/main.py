"""
Revenue Scraper CLI — EndiorBot
Usage:
  python main.py --period yesterday --output /tmp/revenue.xlsx
  python main.py --period week
  python main.py --period month
  python main.py --from 2026-03-01 --to 2026-03-15

  # Export CSV + sync to NQH server for MTClaw ClickHouse import:
  python main.py --period yesterday --format csv --sync
  python main.py --period month --format csv --sync

  python main.py --setup          # one-time: login and save session
  python main.py --test-auth      # verify cookie extraction

On success: prints output file path to stdout and exits 0.
On error:   prints error to stderr and exits 1.
"""
from __future__ import annotations

import argparse
import logging
import sys
from datetime import date, datetime
from pathlib import Path

# Setup logging to stderr only (stdout = file path output)
logging.basicConfig(
    stream=sys.stderr,
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)


def _default_output(period: str, fmt: str) -> str:
    today = date.today().isoformat()
    safe = period.replace(":", "-").replace("/", "")
    ext = "csv" if fmt == "csv" else "xlsx"
    return f"/tmp/revenue_{safe}_{today}.{ext}"


def main() -> None:
    parser = argparse.ArgumentParser(description="EzCloud Hotel Revenue Scraper")
    parser.add_argument("--period", default="yesterday",
                        choices=["yesterday", "week", "month"],
                        help="Reporting period")
    parser.add_argument("--from", dest="from_date", metavar="YYYY-MM-DD",
                        help="Custom from date (overrides --period)")
    parser.add_argument("--to", dest="to_date", metavar="YYYY-MM-DD",
                        help="Custom to date (overrides --period)")
    parser.add_argument("--output", help="Output file path")
    parser.add_argument("--format", dest="fmt", default="xlsx",
                        choices=["xlsx", "csv"],
                        help="Output format: xlsx (Telegram) hoặc csv (ClickHouse sync)")
    parser.add_argument("--sync", action="store_true",
                        help="SCP file lên NQH server sau khi export (chỉ dùng với --format csv)")
    parser.add_argument("--setup", action="store_true",
                        help="Run interactive browser setup (save session)")
    parser.add_argument("--test-auth", action="store_true",
                        help="Test Chrome cookie extraction only")
    args = parser.parse_args()

    # ── Setup mode ──
    if args.setup:
        from auth import run_interactive_setup
        run_interactive_setup()
        return

    # ── Resolve period ──
    if args.from_date and args.to_date:
        period = f"range:{datetime.strptime(args.from_date, '%Y-%m-%d').strftime('%d/%m')}-{datetime.strptime(args.to_date, '%Y-%m-%d').strftime('%d/%m')}"
    else:
        period = args.period

    output_path = args.output or _default_output(period, args.fmt)

    # ── Auth ──
    from auth import load_cookies_from_chrome, load_session_file

    cookies: list[dict] = []
    session = load_session_file()

    if args.test_auth:
        cookies = load_cookies_from_chrome()
        print(f"Chrome cookies for ezcloudhotel.com: {len(cookies)}", file=sys.stderr)
        if session:
            print(f"Saved session found: {session.get('cookies', [])}", file=sys.stderr)
        sys.exit(0 if cookies or session else 1)

    if not session:
        cookies = load_cookies_from_chrome()
        if not cookies:
            print(
                "ERROR: No auth session found. Run: python main.py --setup",
                file=sys.stderr
            )
            sys.exit(1)

    # ── Scrape ──
    from scraper import scrape, scrape_with_session
    try:
        if session:
            rows = scrape_with_session(period, session)
        else:
            rows = scrape(period, cookies)
    except RuntimeError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)

    if not rows:
        print("ERROR: No revenue data found for this period", file=sys.stderr)
        sys.exit(1)

    logger.info("Scraped %d rows for period=%s", len(rows), period)

    # ── Resolve dates for output ──
    from scraper import _resolve_dates
    if args.from_date and args.to_date:
        from_date = datetime.strptime(args.from_date, "%Y-%m-%d").date()
        to_date = datetime.strptime(args.to_date, "%Y-%m-%d").date()
    else:
        from_date, to_date = _resolve_dates(period)

    # ── Generate output ──
    if args.fmt == "csv":
        from csv_gen import generate_csv
        result_path = generate_csv(rows, output_path, from_date, to_date)
    else:
        from excel_gen import generate
        result_path = generate(rows, output_path, period, from_date, to_date)

    # ── Sync to NQH server (optional) ──
    if args.sync:
        if args.fmt != "csv":
            logger.warning("[sync] --sync chỉ áp dụng cho --format csv, bỏ qua")
        else:
            from sync_server import sync_file, ensure_remote_dir
            ensure_remote_dir()
            ok = sync_file(result_path)
            if not ok:
                print("ERROR: SCP sync thất bại", file=sys.stderr)
                sys.exit(1)
            logger.info("[sync] File đã gửi lên server thành công")

    # ── Print path to stdout (for caller) ──
    print(result_path)


if __name__ == "__main__":
    main()
