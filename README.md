# Demographic App - Structure Documentation

## Overview

Interactive choropleth map of Contra Costa cities and CDPs visualizing demographic metrics by merging geographic boundaries (GeoJSON) with statistics (CSV).

## Data Update Quickstart

Perform these steps whenever `demographics.csv` is updated.

1. **Update CSV**

Note: Ensure CDTFA_CITY values match the NAMELSAD property in the GeoJSON files.

2. **Regenerate Artifacts**

Run the merge scripts to update the web app data:
```
python merge_cities_demographics.py
python merge_cdp_demographics.py
```

3. **Verify & View**

Optional: Run python verify_merge.py to check for data gaps.

View: Open index.html in a browser.

## Project Architecture

- `demographics.csv` : Source of truth for all stats (Update this only)
- `cities_ccc.geojson` : Static City Boundaries (only update on every Census)
- `cdp_ccc_84.geojson` : Static CDP boundaries (WGS84 projection which is what the app requires) (update only on every Census)
- `*-final.json` : Merged artifacts used by `script.js` (Auto-generated: `cities-final.json`, `cdp-final.json`)