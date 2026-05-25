#!/usr/bin/env python3
"""
Merge ACS Medi-Cal/SNAP columns into demographics.csv.

This script reads:
  - CoCo_MediCal_Individuals_SNAP_Households.csv
  - demographics.csv

It appends/updates only these ACS columns in demographics.csv:
  - ACS Medi-Cal Individual %
  - Corrected Medi-Cal Individual %
  - SNAP/CalFresh Household %

The existing demographics.csv columns are preserved. The script also writes a
Markdown report listing matched rows and any unmatched places between files.
"""

import csv
import re
import sys
from pathlib import Path


ACS_CSV = Path("CoCo_MediCal_Individuals_SNAP_Households.csv")
DEMOGRAPHICS_CSV = Path("demographics.csv")
REPORT_PATH = Path("merge-acs-data-report.md")

PLACE_COLUMN = "Place"
CITY_COLUMN = "CDTFA_CITY"
ACS_COLUMNS = [
    "ACS Medi-Cal Individual %",
    "Corrected Medi-Cal Individual %",
    "SNAP/CalFresh Household %",
]


def normalize_place_name(value):
    """Normalize app and Census place names for matching."""
    name = str(value or "").strip()
    name = re.sub(r"\s+", " ", name)
    name = name.replace(", California", "")

    # Some Census place names arrive as "Bayview CDP (Contra Costa County)".
    name = re.sub(r"\s+CDP\s+\([^)]*\)$", "", name, flags=re.IGNORECASE)

    for suffix in (" city", " town", " CDP"):
        if name.lower().endswith(suffix.lower()):
            name = name[: -len(suffix)]
            break

    return re.sub(r"\s+", " ", name).strip().casefold()


def is_demographics_place_row(row):
    """Ignore blank/footer rows that are present at the bottom of demographics.csv."""
    city = str(row.get(CITY_COLUMN, "") or "").strip()
    if not city:
        return False

    if city.lower().startswith("u.s. census bureau"):
        return False

    # Place rows have at least one of these core data fields populated.
    return bool(str(row.get("Population", "") or "").strip()) or bool(
        str(row.get("Households", "") or "").strip()
    )


def read_acs_rows(path):
    with path.open("r", encoding="utf-8-sig", newline="") as csv_file:
        reader = csv.DictReader(csv_file)
        if not reader.fieldnames:
            raise ValueError(f"{path} has no header row")

        required = [PLACE_COLUMN, *ACS_COLUMNS]
        missing = [column for column in required if column not in reader.fieldnames]
        if missing:
            raise ValueError(
                f"{path} is missing required columns: {', '.join(missing)}"
            )

        rows_by_place = {}
        duplicates = []

        for row_number, row in enumerate(reader, start=2):
            place = row.get(PLACE_COLUMN, "")
            key = normalize_place_name(place)
            if not key:
                continue

            if key in rows_by_place:
                duplicates.append(place)

            rows_by_place[key] = {
                "row_number": row_number,
                "place": place,
                "values": {column: row.get(column, "") for column in ACS_COLUMNS},
            }

    return rows_by_place, duplicates


def read_demographics_rows(path):
    with path.open("r", encoding="utf-8-sig", newline="") as csv_file:
        reader = csv.DictReader(csv_file)
        if not reader.fieldnames:
            raise ValueError(f"{path} has no header row")

        if CITY_COLUMN not in reader.fieldnames:
            raise ValueError(f"{path} is missing required column: {CITY_COLUMN}")

        return reader.fieldnames, list(reader)


def write_demographics_rows(path, fieldnames, rows):
    with path.open("w", encoding="utf-8", newline="") as csv_file:
        writer = csv.DictWriter(csv_file, fieldnames=fieldnames, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def write_report(
    matched,
    unmatched_demographics,
    unmatched_acs,
    non_place_rows,
    duplicate_acs_places,
):
    lines = [
        "# ACS Data Merge Report",
        "",
        f"- Source ACS CSV: `{ACS_CSV}`",
        f"- Target demographics CSV: `{DEMOGRAPHICS_CSV}`",
        f"- Columns added/updated: {', '.join(f'`{column}`' for column in ACS_COLUMNS)}",
        "",
        "## Summary",
        "",
        f"- Matched demographics places: {len(matched)}",
        f"- Unmatched demographics places: {len(unmatched_demographics)}",
        f"- Unmatched ACS places: {len(unmatched_acs)}",
        f"- Non-place rows ignored in demographics.csv: {len(non_place_rows)}",
        f"- Duplicate ACS place names: {len(duplicate_acs_places)}",
        "",
    ]

    if duplicate_acs_places:
        lines.extend(["## Duplicate ACS Places", ""])
        for place in duplicate_acs_places:
            lines.append(f"- `{place}`")
        lines.append("")

    if unmatched_demographics:
        lines.extend(["## Unmatched Demographics Places", ""])
        for item in unmatched_demographics:
            lines.append(f"- Row {item['row_number']}: `{item['place']}`")
        lines.append("")

    if unmatched_acs:
        lines.extend(["## Unmatched ACS Places", ""])
        for item in unmatched_acs:
            lines.append(f"- Row {item['row_number']}: `{item['place']}`")
        lines.append("")

    lines.extend(
        [
            "## Matched Rows",
            "",
            "| demographics.csv row | ACS CSV row | demographics place | ACS place | ACS Medi-Cal Individual % | Corrected Medi-Cal Individual % | SNAP/CalFresh Household % |",
            "|---:|---:|---|---|---:|---:|---:|",
        ]
    )

    for item in matched:
        values = item["values"]
        lines.append(
            f"| {item['demographics_row_number']} | {item['acs_row_number']} | "
            f"`{item['demographics_place']}` | `{item['acs_place']}` | "
            f"{values['ACS Medi-Cal Individual %']} | "
            f"{values['Corrected Medi-Cal Individual %']} | "
            f"{values['SNAP/CalFresh Household %']} |"
        )

    lines.append("")
    REPORT_PATH.write_text("\n".join(lines), encoding="utf-8")


def main():
    if not ACS_CSV.exists():
        raise FileNotFoundError(f"Missing source CSV: {ACS_CSV}")

    if not DEMOGRAPHICS_CSV.exists():
        raise FileNotFoundError(f"Missing target CSV: {DEMOGRAPHICS_CSV}")

    acs_by_place, duplicate_acs_places = read_acs_rows(ACS_CSV)
    if duplicate_acs_places:
        print("Warning: duplicate normalized ACS place names found.")
        print("The last duplicate row for each name will be used.")

    fieldnames, demographics_rows = read_demographics_rows(DEMOGRAPHICS_CSV)
    for column in ACS_COLUMNS:
        if column not in fieldnames:
            fieldnames.append(column)

    matched = []
    unmatched_demographics = []
    non_place_rows = []
    used_acs_keys = set()

    for row_number, row in enumerate(demographics_rows, start=2):
        if not is_demographics_place_row(row):
            non_place_rows.append(row_number)
            continue

        place = row.get(CITY_COLUMN, "")
        key = normalize_place_name(place)
        acs_row = acs_by_place.get(key)

        if not acs_row:
            unmatched_demographics.append({"row_number": row_number, "place": place})
            continue

        for column in ACS_COLUMNS:
            row[column] = acs_row["values"][column]

        used_acs_keys.add(key)
        matched.append(
            {
                "demographics_row_number": row_number,
                "acs_row_number": acs_row["row_number"],
                "demographics_place": place,
                "acs_place": acs_row["place"],
                "values": acs_row["values"],
            }
        )

    unmatched_acs = [
        {"row_number": row["row_number"], "place": row["place"]}
        for key, row in sorted(acs_by_place.items(), key=lambda item: item[1]["place"])
        if key not in used_acs_keys
    ]

    write_demographics_rows(DEMOGRAPHICS_CSV, fieldnames, demographics_rows)
    write_report(
        matched,
        unmatched_demographics,
        unmatched_acs,
        non_place_rows,
        duplicate_acs_places,
    )

    print(f"Matched demographics places: {len(matched)}")
    print(f"Unmatched demographics places: {len(unmatched_demographics)}")
    print(f"Unmatched ACS places: {len(unmatched_acs)}")
    print(f"Report written to: {REPORT_PATH}")

    if unmatched_demographics or unmatched_acs:
        print("\nReview unmatched places in the report before relying on the merge.")
        return 1

    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:
        print(f"Error: {exc}", file=sys.stderr)
        sys.exit(1)
