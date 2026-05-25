"""
Pull ACS Medi-Cal/Medicaid and SNAP/CalFresh data for Contra Costa County places.

Notes:
1. ACS table C27007 reports Medicaid coverage for people, not households.
2. ACS table B22003 reports SNAP/CalFresh at the household level.
3. The corrected Medi-Cal columns multiply ACS-reported individuals by 1.19
   to account for known ACS undercounting.

SETUP:
1. Get a free Census API key at: https://api.census.gov/data/key_signup.html
2. pip install requests
3. python medi-cal-individuals.py YOUR_API_KEY

You can also set the key as an environment variable:
    $env:CENSUS_API_KEY = "your-key"
    python medi-cal-individuals.py

The script outputs: CoCo_MediCal_Individuals_SNAP_Households.csv
"""

import csv
import os
import sys

import requests


API_KEY = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("CENSUS_API_KEY", "")

if not API_KEY:
    print("Usage: python medi-cal-individuals.py YOUR_CENSUS_API_KEY")
    print("Or set CENSUS_API_KEY in your environment.")
    sys.exit(1)


BASE = "https://api.census.gov/data/2023/acs/acs5"
COUNTY_FIPS = "013"
STATE_FIPS = "06"
MEDI_CAL_CORRECTION_FACTOR = 1.19


# --- Medicaid variables (C27007) ---
# C27007_001E = Total civilian noninstitutionalized population
# Male with Medicaid:   004 (Under 19), 007 (19-64), 010 (65+)
# Female with Medicaid: 014 (Under 19), 017 (19-64), 020 (65+)
medicaid_vars = (
    "NAME,C27007_001E,"
    "C27007_004E,C27007_007E,C27007_010E,"
    "C27007_014E,C27007_017E,C27007_020E"
)


# --- SNAP variables (B22003) ---
# B22003_001E = Total households
# B22003_002E = Households receiving Food Stamps/SNAP in past 12 months
snap_vars = "NAME,B22003_001E,B22003_002E"


# Use ucgid with pseudo() to get all places within Contra Costa County.
ucgid = f"pseudo(0500000US{STATE_FIPS}{COUNTY_FIPS}$1600000)"


def fetch(variables):
    url = f"{BASE}?get={variables}&ucgid={ucgid}&key={API_KEY}"
    print(f"Fetching: {url[:120]}...")
    response = requests.get(url, timeout=60)
    response.raise_for_status()

    data = response.json()
    header = data[0]
    rows = data[1:]
    return header, rows


def clean_place_name(name):
    """Convert Census API place names to app-friendly place names."""
    clean_name = name.replace(", California", "").strip()

    for suffix in (" city", " town", " CDP"):
        if clean_name.endswith(suffix):
            clean_name = clean_name[: -len(suffix)]
            break

    return clean_name.strip()


def parse_int(value):
    if value in (None, ""):
        return 0

    try:
        return int(value)
    except (ValueError, TypeError):
        return 0


def format_percent(value):
    return f"{value:.2f}%"


def corrected_medi_cal_count(acs_count):
    return round(acs_count * MEDI_CAL_CORRECTION_FACTOR)


print("Fetching Medicaid/Medi-Cal individual data...")
med_header, med_rows = fetch(medicaid_vars)

print("Fetching SNAP/CalFresh household data...")
snap_header, snap_rows = fetch(snap_vars)


# Build lookup by Census API NAME so the two API responses align exactly.
snap_by_name = {row[0]: row for row in snap_rows}


results = []

for row in med_rows:
    name = row[0]
    total_pop = parse_int(row[1])
    medicaid_individual_values = [parse_int(row[i]) for i in range(2, 8)]

    medicaid_individuals = sum(medicaid_individual_values)
    medicaid_individual_pct = (
        (medicaid_individuals / total_pop * 100) if total_pop > 0 else 0
    )
    corrected_individuals = corrected_medi_cal_count(medicaid_individuals)
    corrected_individual_pct = (
        (corrected_individuals / total_pop * 100) if total_pop > 0 else 0
    )

    snap_row = snap_by_name.get(name)
    if snap_row:
        total_households = parse_int(snap_row[1])
        snap_households = parse_int(snap_row[2])
    else:
        total_households = 0
        snap_households = 0

    snap_household_pct = (
        (snap_households / total_households * 100) if total_households > 0 else 0
    )

    results.append(
        {
            "Place": clean_place_name(name),
            "Total Population": total_pop,
            "ACS Medi-Cal Individuals": medicaid_individuals,
            "ACS Medi-Cal Individual %": format_percent(medicaid_individual_pct),
            "Corrected Medi-Cal Individuals": corrected_individuals,
            "Corrected Medi-Cal Individual %": format_percent(
                corrected_individual_pct
            ),
            "Total Households": total_households,
            "SNAP/CalFresh Households": snap_households,
            "SNAP/CalFresh Household %": format_percent(snap_household_pct),
        }
    )


results.sort(key=lambda x: x["Place"])

print(f"\nFound {len(results)} places in Contra Costa County.\n")
for result in results:
    print(
        f"  {result['Place']}: "
        f"ACS Medi-Cal individuals {result['ACS Medi-Cal Individual %']}, "
        f"corrected {result['Corrected Medi-Cal Individual %']}, "
        f"SNAP households {result['SNAP/CalFresh Household %']}"
    )


outpath = "CoCo_MediCal_Individuals_SNAP_Households.csv"
headers = [
    "Place",
    "Total Population",
    "ACS Medi-Cal Individuals",
    "ACS Medi-Cal Individual %",
    "Corrected Medi-Cal Individuals",
    "Corrected Medi-Cal Individual %",
    "Total Households",
    "SNAP/CalFresh Households",
    "SNAP/CalFresh Household %",
]

with open(outpath, "w", encoding="utf-8", newline="") as csv_file:
    writer = csv.DictWriter(csv_file, fieldnames=headers, lineterminator="\n")
    writer.writeheader()
    writer.writerows(results)


print(f"\nSaved to {outpath}")
print("Source: U.S. Census Bureau, 2019-2023 ACS 5-Year Estimates")
print("Medi-Cal/Medicaid individuals = Table C27007")
print(f"Corrected Medi-Cal individuals = ACS individuals x {MEDI_CAL_CORRECTION_FACTOR}")
print("SNAP/CalFresh households = Table B22003")
