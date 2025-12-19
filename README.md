# Demographic App - Structure Documentation

## Overview

This application visualizes demographic data for Contra Costa County, California. It combines geographic boundary data (GeoJSON) with demographic statistics (CSV) to create an interactive choropleth map showing various demographic metrics.

## Application Structure

### Core Components

#### 1. **Data Processing Scripts** (Python)

- **`merge_cdp_demographics.py`**
  - Merges demographic CSV data into CDP (Census Designated Place) GeoJSON features
  - Input: `CDP.geojson` (GeoJSON with CDP boundaries)
  - Output: `cdp_final.json` (GeoJSON with merged demographic data)
  - Matches on `NAMELSAD` property from GeoJSON to `City_Name` or `CDTFA_CITY` from CSV

- **`merge_cities_demographics.py`**
  - Merges demographic CSV data into Cities GeoJSON features
  - Input: `cities_final.json` (GeoJSON with city boundaries)
  - Output: `cities_final.json` (overwrites input file with merged data)
  - Matches on `CDTFA_CITY` property from GeoJSON to `CDTFA_CITY` from CSV

- **`verify_merge.py`**
  - Simple verification script to check if demographic data was successfully merged
  - Reads `cdp_final.json` and reports how many features have demographic data
  - Displays sample matched feature data

#### 2. **Web Application** (HTML/JavaScript)

- **`index.html`**
  - Main HTML file for the interactive map interface
  - Uses Leaflet.js for map rendering
  - Provides dropdown to switch between different demographic metrics

- **`script.js`**
  - JavaScript logic for the interactive map
  - Loads `cities_final.json` and `cdp_final.json`
  - Implements choropleth coloring based on selected metric
  - Handles user interactions (click, hover) to display demographic data
  - Filters features to Contra Costa County area
  - Supports multiple visualization metrics:
    - Foreign Born Percentage
    - Non-White Percentage
    - White Percentage
    - Hispanic Percentage
    - Asian Percentage
    - Black Percentage

### Data Files

#### CSV Files (Demographic Data)

- **`demographics.csv`** ✅ **ACTIVE** - Used by both merge scripts
  - Contains demographic data for 57 cities/places
  - Columns: CDTFA_CITY, Households, Population, Latino, White, Black, Asian, Other, percentages, Foreign Born data
  - This is the **primary data file** used by the application

#### GeoJSON Files (Geographic Boundaries)

**Final/Processed Files (Used by Web App):**
- **`cities_final.json`** ✅ **ACTIVE** - Used by `script.js` and `merge_cities_demographics.py`
  - Contains city boundaries with merged demographic data
  - Loaded by the web application for visualization

- **`cdp_final.json`** ✅ **ACTIVE** - Used by `script.js` and `merge_cdp_demographics.py`
  - Contains CDP (Census Designated Place) boundaries with merged demographic data
  - Loaded by the web application for visualization

**Source/Intermediate Files:**
- **`CaliforniaCities.geojson`** ⚠️ **SOURCE FILE** - Original city boundaries
  - Likely the source file before processing
  - Not directly used by scripts (scripts use `cities_final.json`)

- **`CaliforniaCities_original.geojson`** ⚠️ **BACKUP** - Original city boundaries backup
  - Appears to be a backup of the original data
  - Not referenced in any scripts

- **`CaliforniaCities_export4326.json`** ⚠️ **INTERMEDIATE** - Reprojected city data
  - Likely an intermediate file from coordinate system transformation (EPSG:4326)
  - Not referenced in any scripts

- **`CDP.geojson`** ✅ **ACTIVE** - Source CDP boundaries
  - Contains CDP polygon boundaries with MultiPolygon and Polygon geometries
  - Used by `merge_cdp_demographics.py` as input
  - Contains `NAMELSAD` property for matching with CSV data

### Directory Structure

```
demographic-app/
├── Python Scripts
│   ├── merge_cdp_demographics.py      # Merges demographics into CDP GeoJSON
│   ├── merge_cities_demographics.py   # Merges demographics into Cities GeoJSON
│   └── verify_merge.py                # Verification utility
│
├── Web Application
│   ├── index.html                     # Main HTML interface
│   └── script.js                      # Map visualization logic
│
├── Active Data Files
│   ├── demographics.csv               # Primary demographic data (57 cities)
│   ├── cities_final.json              # Cities GeoJSON with demographics
│   ├── cdp_final.json                 # CDPs GeoJSON with demographics
│   └── CDP.geojson                    # Source CDP boundaries (input for merge script)
│
├── Source/Backup Files (⚠️ Not actively used)
│   ├── CaliforniaCities.geojson       # Source city boundaries
│   ├── CaliforniaCities_original.geojson  # Backup
│   └── CaliforniaCities_export4326.json   # Intermediate reprojection
│
└── Directories
    ├── input/                          # Empty (should contain cdp_shapes.json)
    └── output/                         # Empty (not currently used)
```

## Data Flow

1. **Data Preparation:**
   - Demographic data is prepared in `demographics.csv`
   - Geographic boundaries are prepared as GeoJSON files

2. **Data Merging:**
   - Run `merge_cdp_demographics.py` to merge demographics into CDP boundaries
     - Requires: `CDP.geojson` (GeoJSON file with CDP polygon boundaries)
     - Produces: `cdp_final.json`
   - Run `merge_cities_demographics.py` to merge demographics into city boundaries
     - Requires: `cities_final.json` (must exist first)
     - Produces: `cities_final.json` (overwrites input)

3. **Visualization:**
   - Open `index.html` in a web browser
   - JavaScript loads `cities_final.json` and `cdp_final.json`
   - Map displays choropleth visualization with interactive features

## Files That Can Be Removed (Flagged)

### ⚠️ Consider Archiving (Source/Backup Files):

1. **`CaliforniaCities.geojson`** - Source file, not used by scripts
2. **`CaliforniaCities_original.geojson`** - Backup file
3. **`CaliforniaCities_export4326.json`** - Intermediate processing file

**Note:** Keep these if you need to reprocess data or maintain source files for version control. Otherwise, they can be moved to an `archive/` or `source/` directory.

## Usage

### To Process Data:
```bash
# Merge demographics into CDP boundaries
python merge_cdp_demographics.py

# Merge demographics into city boundaries
python merge_cities_demographics.py

# Verify the merge was successful
python verify_merge.py
```

### To View the Map:
1. Ensure `cities_final.json` and `cdp_final.json` exist
2. Open `index.html` in a web browser
3. Use the dropdown to switch between different demographic metrics
4. Click on any city/area to view detailed demographic information

## Dependencies

- **Python 3** - For data processing scripts
- **Leaflet.js** (via CDN) - For map visualization
- **Web Browser** - To view the interactive map

## Notes

- The application focuses on Contra Costa County, California
- The map is centered on Walnut Creek with a 20-mile radius view
- All demographic data is filtered to Contra Costa County boundaries
- The application supports multiple demographic visualization metrics

