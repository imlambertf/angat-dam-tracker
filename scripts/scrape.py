#!/usr/bin/env python3
"""
Pulls the latest Angat Dam reservoir water level reading from PAGASA's
public Flood Information page and appends it to data/angat.json.

PAGASA does not publish a JSON/API endpoint for this data, so this script
parses the numbers out of the rendered dam status table on
https://pagasa.dost.gov.ph/flood using a pattern match anchored on the
word "Angat". PAGASA has kept this table's column order (Obs Time, RWL,
24-hr deviation, NHWL, deviation from NHWL, Rule Curve, deviation from
Rule Curve) stable for years, but if they redesign the page this regex
will need to be updated -- the script fails loudly (non-zero exit, no
file write) rather than silently writing garbage.
"""

import json
import re
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path
from urllib.request import Request, urlopen

URL = "https://pagasa.dost.gov.ph/flood"
DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "angat.json"
MAX_HISTORY = 500
PH_TZ = timezone(timedelta(hours=8))

# Matches: Angat <time> [optional "Aug-12" date label] <RWL> <hr> <amount>
# <NHWL> <dev from NHWL> <rule curve> <dev from rule curve>
# The date label's position relative to the time varies slightly with how
# PAGASA's template renders rowspans, so it's captured optionally in two
# possible slots rather than assumed to be in exactly one place.
ROW_PATTERN = re.compile(
    r"Angat\s+(\d{1,2}:\d{2}\s*[APap][Mm])\s+"
    r"(?:([A-Z][a-z]{2}-\d{2})\s+)?"
    r"(\d{2,3}\.\d{2})\s+"
    r"(\d{1,2})\s+"
    r"(-?\d{1,2}\.\d{2})\s+"
    r"(\d{2,3}\.\d{2})\s+"
    r"(-?\d{1,3}\.\d{2})\s+"
    r"(\d{2,3}\.\d{2})\s+"
    r"(-?\d{1,3}\.\d{2})"
)

# Fallback: a date label like "Aug-12" appearing shortly after the row,
# used only if the inline slot above didn't catch it.
DATE_PATTERN = re.compile(r"\b([A-Z][a-z]{2}-\d{2})\b")


def fetch_html(url: str) -> str:
    req = Request(url, headers={"User-Agent": "angat-dam-tracker/1.0 (+github pages)"})
    with urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8", errors="replace")


def strip_tags(html: str) -> str:
    # Cheap tag stripper: good enough since we only need the visible text
    # to run the regex against, and the table has no nested markup that
    # would matter for our fields.
    text = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", html, flags=re.S | re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"&nbsp;", " ", text)
    text = re.sub(r"[ \t]+", " ", text)
    return text


def parse_angat_row(text: str):
    match = ROW_PATTERN.search(text)
    if not match:
        raise ValueError("Could not find an Angat dam data row on the page")

    obs_time, inline_date, rwl, hr, amount, nhwl, dev_nhwl, rule_curve, dev_rule_curve = match.groups()

    month_day = inline_date
    if not month_day:
        # Fallback: look a little further past the matched row for a date label.
        tail = text[match.end(): match.end() + 60]
        date_match = DATE_PATTERN.search(tail)
        month_day = date_match.group(1) if date_match else None

    year = datetime.now(PH_TZ).year
    if month_day:
        obs_date = datetime.strptime(f"{month_day}-{year}", "%b-%d-%Y").date()
    else:
        obs_date = datetime.now(PH_TZ).date()

    return {
        "date": obs_date.isoformat(),
        "observationTime": obs_time.upper().replace("  ", " "),
        "rwl": float(rwl),
        "deviation24hr": float(amount),
        "nhwl": float(nhwl),
        "deviationFromNhwl": float(dev_nhwl),
        "ruleCurve": float(rule_curve),
        "deviationFromRuleCurve": float(dev_rule_curve),
    }


def load_existing(path: Path) -> dict:
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return {"source": f"PAGASA Dam Water Level Update ({URL})", "history": []}


def main() -> int:
    try:
        html = fetch_html(URL)
        text = strip_tags(html)
        reading = parse_angat_row(text)
    except Exception as exc:  # noqa: BLE001 - want a single clear failure path
        print(f"[scrape.py] FAILED to get a fresh Angat reading: {exc}", file=sys.stderr)
        return 1

    data = load_existing(DATA_PATH)
    data["source"] = f"PAGASA Dam Water Level Update ({URL})"
    data["lastUpdated"] = datetime.now(PH_TZ).isoformat(timespec="seconds")
    data["current"] = reading

    history = data.get("history", [])
    already_logged = any(
        h.get("date") == reading["date"] and h.get("time") == reading["observationTime"]
        for h in history
    )
    if not already_logged:
        history.append({
            "date": reading["date"],
            "time": reading["observationTime"],
            "rwl": reading["rwl"],
            "ruleCurve": reading["ruleCurve"],
        })
        history = history[-MAX_HISTORY:]
    data["history"] = history

    DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
    DATA_PATH.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    print(f"[scrape.py] Updated {DATA_PATH} -> RWL {reading['rwl']} m as of {reading['date']} {reading['observationTime']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
