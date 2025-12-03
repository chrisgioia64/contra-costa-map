#!/usr/bin/env python3
"""
Script to merge demographic data from CSV into Cities GeoJSON features.
Matches GeoJSON CDTFA_CITY property to CSV CDTFA_CITY column.
Fixes the 'Foreign Born - Total Pop' mapping to use 'Foreign' column instead.
"""

import json
import csv
import sys
from pathlib import Path

def load_geojson(filepath):
    """Load GeoJSON file."""
    print(f"Loading GeoJSON from {filepath}...")
    with open(filepath, 'r', encoding='utf-8') as f:
        data = json.load(f)
    print(f"Loaded {len(data.get('features', []))} features")
    return data

def load_csv(filepath):
    """Load CSV file and return as dictionary keyed by city name."""
    print(f"Loading CSV from {filepath}...")
    demographics = {}
    
    with open(filepath, 'r', encoding='utf-8-sig') as f:  # utf-8-sig handles BOM
        reader = csv.DictReader(f)
        
        # Get column names (only remove BOM, preserve spaces)
        original_columns = list(reader.fieldnames)
        cleaned_columns = [col.lstrip('\ufeff') if col.startswith('\ufeff') else col for col in original_columns]
        
        # Print all column headers with indices
        print("\n" + "="*60)
        print("ALL CSV COLUMN HEADERS:")
        print("="*60)
        for i, col in enumerate(cleaned_columns):
            print(f"  [{i:2d}] {repr(col)}")
        print("="*60 + "\n")
        
        # Check for duplicate column names
        column_counts = {}
        for col in cleaned_columns:
            column_counts[col] = column_counts.get(col, 0) + 1
        
        duplicates = {col: count for col, count in column_counts.items() if count > 1}
        if duplicates:
            print("WARNING: Found duplicate column names:")
            for col, count in duplicates.items():
                print(f"  '{col}' appears {count} times")
            print()
        
        # Try to find the city name column
        city_column = None
        if 'CDTFA_CITY' in cleaned_columns:
            city_column = 'CDTFA_CITY'
            city_column_idx = cleaned_columns.index('CDTFA_CITY')
            city_column_original = original_columns[city_column_idx]
            print("Using 'CDTFA_CITY' column for matching")
        elif 'City_Name' in cleaned_columns:
            city_column = 'City_Name'
            city_column_idx = cleaned_columns.index('City_Name')
            city_column_original = original_columns[city_column_idx]
            print("Using 'City_Name' column for matching")
        else:
            raise ValueError(f"Could not find 'CDTFA_CITY' or 'City_Name' column in CSV. Available columns: {cleaned_columns}")
        
        # Find the Foreign Born column - use 'Foreign' column (index 15) specifically
        foreign_born_column = None
        foreign_born_idx = None
        foreign_born_original = None
        
        if 'Foreign' in cleaned_columns:
            # Check if there are multiple 'Foreign' columns
            foreign_indices = [i for i, col in enumerate(cleaned_columns) if col == 'Foreign']
            if len(foreign_indices) > 1:
                print(f"WARNING: Found {len(foreign_indices)} columns named 'Foreign' at indices: {foreign_indices}")
                print(f"  Using the one at index {foreign_indices[0]} (first occurrence)")
                foreign_born_idx = foreign_indices[0]
            else:
                foreign_born_idx = cleaned_columns.index('Foreign')
            
            foreign_born_column = 'Foreign'
            foreign_born_original = original_columns[foreign_born_idx]
            print(f"Found 'Foreign' column at index {foreign_born_idx} - this will be mapped to 'Foreign_Born' property")
            print(f"  Original column name: {repr(foreign_born_original)}")
        else:
            print("WARNING: Could not find 'Foreign' column in CSV")
            print("  Available columns that might contain foreign born data:")
            for i, col in enumerate(cleaned_columns):
                if 'foreign' in col.lower() or 'born' in col.lower():
                    print(f"    [{i}] {repr(col)}")
        
        # Check for multiple 'Total' or 'Estimate' columns
        total_columns = [i for i, col in enumerate(cleaned_columns) if 'Total' in col]
        estimate_columns = [i for i, col in enumerate(cleaned_columns) if 'Estimate' in col]
        
        if total_columns:
            print(f"\nFound {len(total_columns)} column(s) containing 'Total':")
            for idx in total_columns:
                print(f"  [{idx}] {repr(cleaned_columns[idx])}")
        
        if estimate_columns:
            print(f"\nFound {len(estimate_columns)} column(s) containing 'Estimate':")
            for idx in estimate_columns:
                print(f"  [{idx}] {repr(cleaned_columns[idx])}")
        
        print()
        
        for row in reader:
            # Use original column name to access the row
            city_name = row[city_column_original].strip() if city_column_original in row else ''
            if city_name:
                # Store all columns from the row (using cleaned column names as keys)
                clean_row = {}
                for i, orig_col in enumerate(original_columns):
                    clean_col = cleaned_columns[i]
                    clean_row[clean_col] = row[orig_col]
                
                # Special mapping: Map 'Foreign' column to 'Foreign_Born' property
                # Also update 'Foreign Born - Total Pop' to use the correct foreign born value
                if foreign_born_column and foreign_born_column in clean_row:
                    foreign_value = clean_row[foreign_born_column]
                    clean_row['Foreign_Born'] = foreign_value
                    # Update 'Foreign Born - Total Pop' to use the correct foreign born count
                    clean_row['Foreign Born - Total Pop'] = foreign_value
                
                demographics[city_name] = clean_row
    
    print(f"\nLoaded {len(demographics)} demographic records")
    return demographics

def convert_value(value):
    """Convert CSV string values to appropriate types (int, float, or keep as string)."""
    if value is None or value == '':
        return None
    
    # Remove quotes and whitespace
    value = str(value).strip().strip('"').strip("'")
    
    if value == '' or value.lower() == 'null':
        return None
    
    # Try to convert to number
    try:
        # Remove commas and percentage signs
        clean_value = value.replace(',', '').replace('%', '')
        if '.' in clean_value:
            return float(clean_value)
        else:
            return int(clean_value)
    except ValueError:
        # Keep as string if not a number
        return value

def merge_demographics(geojson_data, demographics_dict):
    """Merge demographic data into GeoJSON features."""
    features = geojson_data.get('features', [])
    matched_count = 0
    unmatched_count = 0
    unmatched_names = []
    
    print("\nMerging demographic data...")
    
    for feature in features:
        props = feature.get('properties', {})
        city_name = props.get('CDTFA_CITY', '').strip()
        
        if city_name in demographics_dict:
            # Found a match - inject all CSV columns into properties
            demo_data = demographics_dict[city_name]
            
            for key, value in demo_data.items():
                # Skip the city name column itself (already in CDTFA_CITY)
                if key not in ['City_Name', 'CDTFA_CITY']:
                    # Convert and add the value
                    converted_value = convert_value(value)
                    props[key] = converted_value
            
            matched_count += 1
        else:
            # No match found - set demographic fields to null/0
            unmatched_count += 1
            unmatched_names.append(city_name)
            
            # Set common demographic fields to null if they don't exist
            demo_fields = ['Households', 'Population', 'Latino', 'White', 'Black', 'Asian', 
                          ' Other ', 'Latino Percent', 'White Percent', 'Black Percent', 
                          'Asian Percent', 'Other Percent', 'Foreign Born - Total Pop', 
                          'Native', 'Foreign', 'Foreign Born (%)', 'Foreign_Born']
            for field in demo_fields:
                if field not in props:
                    props[field] = None
    
    print(f"\nMatching results:")
    print(f"  Matched: {matched_count}")
    print(f"  Unmatched: {unmatched_count}")
    
    if unmatched_count > 0 and unmatched_count <= 20:
        print(f"\nUnmatched city names (first 20):")
        for name in unmatched_names[:20]:
            print(f"    - {name}")
    elif unmatched_count > 20:
        print(f"\nUnmatched city names (showing first 20 of {unmatched_count}):")
        for name in unmatched_names[:20]:
            print(f"    - {name}")
    
    return geojson_data

def main():
    # File paths
    geojson_path = Path('cities_final.json')
    csv_path = Path('demographics.csv')
    output_path = Path('cities_final.json')  # Overwrite the same file
    
    # Check if input files exist
    if not geojson_path.exists():
        print(f"Error: GeoJSON file not found: {geojson_path}")
        sys.exit(1)
    
    if not csv_path.exists():
        print(f"Error: CSV file not found: {csv_path}")
        sys.exit(1)
    
    try:
        # Load data
        geojson_data = load_geojson(geojson_path)
        demographics_dict = load_csv(csv_path)
        
        # Merge data
        merged_data = merge_demographics(geojson_data, demographics_dict)
        
        # Save result
        print(f"\nSaving merged data to {output_path}...")
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(merged_data, f, indent=2, ensure_ascii=False)
        
        print(f"Successfully saved {output_path}")
        print(f"  Total features: {len(merged_data.get('features', []))}")
        
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == '__main__':
    main()

