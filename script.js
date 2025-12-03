// Initialize map centered on Walnut Creek with 20-mile radius view
const walnutCreekCenter = [37.9061, -122.0649];
const map = L.map('map', {
    center: walnutCreekCenter,
    zoom: 11,
    zoomControl: true, // Enable zoom controls (+/- buttons)
    scrollWheelZoom: true, // Enable mouse wheel zoom
    doubleClickZoom: true, // Enable double-click zoom
    boxZoom: true, // Enable box zoom (shift+drag)
    keyboard: true // Enable keyboard navigation
}).setView(walnutCreekCenter, 11); // Set initial center and zoom

// Add base tile layer
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
}).addTo(map);

// Calculate bounds for 20-mile radius around Walnut Creek
// 20 miles = 32.1868 km
// At latitude 37.9: 1° latitude ≈ 111 km, 1° longitude ≈ 88.6 km
const radiusMiles = 20;
const radiusKm = radiusMiles * 1.60934; // Convert miles to km
const radiusLat = radiusKm / 111; // approximately 0.29 degrees
const radiusLng = radiusKm / (111 * Math.cos(walnutCreekCenter[0] * Math.PI / 180)); // longitude varies by latitude

// Wait for map to be ready, then fit bounds to 20-mile radius
map.whenReady(function() {
    const bounds = L.latLngBounds(
        [walnutCreekCenter[0] - radiusLat, walnutCreekCenter[1] - radiusLng], // Southwest corner
        [walnutCreekCenter[0] + radiusLat, walnutCreekCenter[1] + radiusLng]  // Northeast corner
    );
    map.fitBounds(bounds, { padding: [50, 50] });
});

// Store layer references for re-styling
let cityLayer = null;
let cdpLayer = null;
let selectedLayer = null;
let currentMetric = 'foreign_born';
let currentBreaks = [0, 0, 0, 0, 0]; // Store current breaks for legend
let legendControl = null; // Legend control reference

// 5-step color scale (darker colors for higher values)
const colorScale = {
    foreign_born: ['#fee5d9', '#fcae91', '#fb6a4a', '#de2d26', '#a50f15'],
    race: ['#e0f3db', '#b8e6b8', '#7bc77e', '#2e7d32', '#1b5e20'],
    white_percent: ['#deebf7', '#9ecae1', '#6baed6', '#3182bd', '#08519c'],
    hispanic_percent: ['#fee5d9', '#fcae91', '#fb6a4a', '#de2d26', '#a50f15'],
    asian_percent: ['#f2e5ff', '#d4b3ff', '#b794f6', '#9f7aea', '#805ad5'],
    black_percent: ['#e8e8e8', '#bdbdbd', '#969696', '#636363', '#252525']
};

// Get value for a feature based on current metric (returns percentage)
function getFeatureValue(feature) {
    const props = feature.properties;
    
    // Get total population for percentage calculations
    const totalPop = parseFloat(String(props.Population || 0).replace(/,/g, '')) || 0;
    
    if (currentMetric === 'foreign_born') {
        // Use the existing "Foreign Born (%)" from the data
        let value = props['Foreign Born (%)'];
        
        // Parse the value if it's a string (handle %, commas, etc.)
        if (typeof value === 'string') {
            value = parseFloat(value.replace(/%/g, '').replace(/,/g, '')) || null;
        }
        
        return value !== null && !isNaN(value) ? value : 0;
    } else if (currentMetric === 'race') {
        // Calculate non-white percentage: (non-white / total population) * 100
        const latino = parseFloat(String(props.Latino || 0).replace(/,/g, '')) || 0;
        const black = parseFloat(String(props.Black || 0).replace(/,/g, '')) || 0;
        const asian = parseFloat(String(props.Asian || 0).replace(/,/g, '')) || 0;
        const other = parseFloat(String(props[' Other '] || 0).replace(/,/g, '')) || 0;
        const nonWhite = latino + black + asian + other;
        
        // Calculate percentage
        if (totalPop > 0) {
            return (nonWhite / totalPop) * 100;
        }
        return 0;
    } else if (currentMetric === 'white_percent') {
        // Calculate white percentage: (white / total population) * 100
        const white = parseFloat(String(props.White || 0).replace(/,/g, '')) || 0;
        
        if (totalPop > 0) {
            return (white / totalPop) * 100;
        }
        return 0;
    } else if (currentMetric === 'hispanic_percent') {
        // Calculate Hispanic/Latino percentage: (Latino / total population) * 100
        const latino = parseFloat(String(props.Latino || 0).replace(/,/g, '')) || 0;
        
        if (totalPop > 0) {
            return (latino / totalPop) * 100;
        }
        return 0;
    } else if (currentMetric === 'asian_percent') {
        // Calculate Asian percentage: (Asian / total population) * 100
        const asian = parseFloat(String(props.Asian || 0).replace(/,/g, '')) || 0;
        
        if (totalPop > 0) {
            return (asian / totalPop) * 100;
        }
        return 0;
    } else if (currentMetric === 'black_percent') {
        // Calculate Black percentage: (Black / total population) * 100
        const black = parseFloat(String(props.Black || 0).replace(/,/g, '')) || 0;
        
        if (totalPop > 0) {
            return (black / totalPop) * 100;
        }
        return 0;
    }
    return 0;
}

// Calculate breaks for choropleth classification
function calculateBreaks(features) {
    const values = features
        .map(f => getFeatureValue(f))
        .filter(v => v !== null && v !== undefined && !isNaN(v) && v > 0)
        .sort((a, b) => a - b);
    
    // Debug: log first few feature properties
    if (features.length > 0) {
        const sampleFeature = features[0];
        const sampleValue = getFeatureValue(sampleFeature);
        console.log(`Sample feature (${currentMetric}):`, sampleFeature.properties.CDTFA_CITY || sampleFeature.properties.NAMELSAD);
        console.log(`Sample percentage value: ${sampleValue.toFixed(1)}%`);
    }
    
    console.log(`Found ${values.length} non-zero percentage values out of ${features.length} features`);
    if (values.length > 0) {
        console.log(`Percentage range: ${values[0].toFixed(1)}% to ${values[values.length - 1].toFixed(1)}%`);
    }
    
    if (values.length === 0) {
        console.warn('No valid values found for coloring! All features will be gray.');
        return [0, 0, 0, 0, 0];
    }
    
    const min = values[0];
    const max = values[values.length - 1];
    
    // Use quantile breaks (5 steps)
    const breaks = [
        min,
        values[Math.floor(values.length * 0.2)],
        values[Math.floor(values.length * 0.4)],
        values[Math.floor(values.length * 0.6)],
        values[Math.floor(values.length * 0.8)],
        max
    ];
    
    console.log('Color breaks:', breaks);
    return breaks;
}

// Get color for a value based on breaks
function getColor(value, breaks, colors) {
    if (value === null || value === undefined || isNaN(value) || value === 0) {
        return '#f0f0f0'; // Light gray for null/zero values
    }
    
    if (value <= breaks[1]) return colors[0];
    if (value <= breaks[2]) return colors[1];
    if (value <= breaks[3]) return colors[2];
    if (value <= breaks[4]) return colors[3];
    return colors[4];
}

// Style function for choropleth
function styleFeature(feature, breaks, colors) {
    const value = getFeatureValue(feature);
    return {
        fillColor: getColor(value, breaks, colors),
        fillOpacity: 0.7,
        color: '#888',
        weight: 1,
        opacity: 0.8
    };
}

// Highlight selected feature
function highlightFeature(e) {
    const layer = e.target;
    
    // Reset previous selection
    if (selectedLayer) {
        selectedLayer.setStyle({
            fillOpacity: 0.7,
            color: '#888',
            weight: 1
        });
    }
    
    // Highlight current selection
    layer.setStyle({
        fillOpacity: 0.9,
        color: '#ff0000',
        weight: 4
    });
    
    selectedLayer = layer;
    
    // Populate data panel
    populateDataPanel(layer.feature);
}

// Reset highlight
function resetHighlight(e) {
    // Don't reset if this is the selected layer
    if (e.target === selectedLayer) return;
    
    e.target.setStyle({
        fillOpacity: 0.7,
        color: '#888',
        weight: 1
    });
}

// Populate data panel with feature data
function populateDataPanel(feature) {
    const panel = document.getElementById('data-panel');
    const content = document.getElementById('panel-content');
    const props = feature.properties;
    
    // Get city/place name - use CDTFA_CITY for cities, NAMELSAD for CDPs
    const name = props.CDTFA_CITY || props.NAMELSAD || 'Unknown';
    
    // Get foreign born data - prioritize 'Foreign' and 'Foreign_Born' over 'Foreign Born - Total Pop'
    let foreignBorn = props['Foreign'] || props['Foreign_Born'] || props['Foreign Born - Total Pop'];
    // Parse if it's a string
    if (typeof foreignBorn === 'string') {
        foreignBorn = parseFloat(foreignBorn.replace(/,/g, '')) || 0;
    }
    
    // Get and parse percentage
    let foreignBornPercent = props['Foreign Born (%)'];
    if (typeof foreignBornPercent === 'string') {
        foreignBornPercent = parseFloat(foreignBornPercent.replace(/%/g, '').replace(/,/g, '')) || null;
    }
    
    // Get total population for percentage calculations
    let totalPop = props.Population || 0;
    if (typeof totalPop === 'string') {
        totalPop = parseFloat(totalPop.replace(/,/g, '')) || 0;
    }
    
    // Get race data - parse if strings
    let latino = props.Latino || 0;
    let white = props.White || 0;
    let black = props.Black || 0;
    let asian = props.Asian || 0;
    let other = props[' Other '] || 0; // Note: property has spaces
    
    // Parse if they're strings
    if (typeof latino === 'string') latino = parseFloat(latino.replace(/,/g, '')) || 0;
    if (typeof white === 'string') white = parseFloat(white.replace(/,/g, '')) || 0;
    if (typeof black === 'string') black = parseFloat(black.replace(/,/g, '')) || 0;
    if (typeof asian === 'string') asian = parseFloat(asian.replace(/,/g, '')) || 0;
    if (typeof other === 'string') other = parseFloat(other.replace(/,/g, '')) || 0;
    
    // Calculate non-white population and percentage
    const nonWhite = latino + black + asian + other;
    const nonWhitePercent = totalPop > 0 ? (nonWhite / totalPop) * 100 : 0;
    
    // Format numbers
    function formatNumber(num) {
        if (num === null || num === undefined || isNaN(num)) return 'N/A';
        return num.toLocaleString();
    }
    
    function formatPercent(num) {
        if (num === null || num === undefined || isNaN(num)) return 'N/A';
        return num.toFixed(1) + '%';
    }
    
    // Build HTML
    let html = `
        <div class="data-item">
            <div class="data-label">City/Place Name:</div>
            <div class="data-value">${name}</div>
        </div>
        
        <div class="data-item">
            <div class="data-label">Total Population:</div>
            <div class="data-value">${formatNumber(totalPop)}</div>
        </div>
        
        <div class="data-item">
            <div class="data-label">Foreign Born Population:</div>
            <div class="data-value">${formatNumber(foreignBorn)} (${formatPercent(foreignBornPercent)})</div>
        </div>
        
        <div class="data-item">
            <div class="data-label">Non-White Population:</div>
            <div class="data-value">${formatNumber(nonWhite)} (${formatPercent(nonWhitePercent)})</div>
        </div>
        
        <div class="data-item race-data">
            <div class="data-label">Race Data:</div>
            <div class="race-item">
                <span>Latino:</span>
                <span>${formatNumber(latino)}</span>
            </div>
            <div class="race-item">
                <span>White:</span>
                <span>${formatNumber(white)}</span>
            </div>
            <div class="race-item">
                <span>Black:</span>
                <span>${formatNumber(black)}</span>
            </div>
            <div class="race-item">
                <span>Asian:</span>
                <span>${formatNumber(asian)}</span>
            </div>
            <div class="race-item">
                <span>Other:</span>
                <span>${formatNumber(other)}</span>
            </div>
        </div>
    `;
    
    content.innerHTML = html;
    panel.style.display = 'block';
}

// Filter features to Contra Costa County (approximate bounding box)
function isInContraCostaCounty(feature) {
    // Contra Costa County approximate bounds: 
    // Longitude: -122.5 to -121.5, Latitude: 37.7 to 38.1
    if (!feature || !feature.geometry || !feature.geometry.coordinates) {
        return false;
    }
    
    const coords = feature.geometry.coordinates;
    
    // Handle different geometry types
    let allCoords = [];
    if (feature.geometry.type === 'Polygon') {
        allCoords = coords[0]; // First ring of polygon
    } else if (feature.geometry.type === 'MultiPolygon') {
        allCoords = coords[0][0]; // First ring of first polygon
    }
    
    if (allCoords.length === 0) {
        return false;
    }
    
    // Check if any coordinate is in Contra Costa County bounds
    for (let coord of allCoords) {
        const lon = coord[0];
        const lat = coord[1];
        if (lon >= -122.5 && lon <= -121.5 && lat >= 37.7 && lat <= 38.1) {
            return true;
        }
    }
    return false;
}

// Collect all features from both datasets, filtered to Contra Costa County
function getAllFeatures() {
    let features = [];
    
    // Add cityData features (filtered)
    if (cityData.type === 'Feature') {
        if (isInContraCostaCounty(cityData)) {
            features.push(cityData);
        }
    } else if (cityData.type === 'FeatureCollection') {
        features = features.concat(cityData.features.filter(isInContraCostaCounty));
    }
    
    // Add cdpData features (filtered)
    if (cdpData.type === 'Feature') {
        if (isInContraCostaCounty(cdpData)) {
            features.push(cdpData);
        }
    } else if (cdpData.type === 'FeatureCollection') {
        features = features.concat(cdpData.features.filter(isInContraCostaCounty));
    }
    
    return features;
}

// Create layer from GeoJSON data
function createLayer(geoJsonData, breaks, colors) {
    // Create GeoJSON layer
    const layer = L.geoJSON(geoJsonData, {
        style: function(feature) {
            return styleFeature(feature, breaks, colors);
        },
        onEachFeature: function(feature, layer) {
            layer.on({
                click: highlightFeature,
                mouseover: function(e) {
                    if (e.target !== selectedLayer) {
                        e.target.setStyle({
                            fillOpacity: 0.85,
                            weight: 2
                        });
                    }
                },
                mouseout: resetHighlight
            });
        }
    });
    
    return layer;
}

// Format number for display
function formatNumber(num) {
    if (num === null || num === undefined || isNaN(num)) return 'N/A';
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
    }
    return Math.round(num).toLocaleString();
}

// Create or update legend
function updateLegend(breaks, colors) {
    // Remove existing legend if it exists
    if (legendControl) {
        map.removeControl(legendControl);
    }
    
    // Determine metric label
    let metricLabel;
    switch(currentMetric) {
        case 'foreign_born':
            metricLabel = 'Foreign Born Percentage';
            break;
        case 'race':
            metricLabel = 'Non-White Percentage';
            break;
        case 'white_percent':
            metricLabel = 'White Percentage';
            break;
        case 'hispanic_percent':
            metricLabel = 'Hispanic Percentage';
            break;
        case 'asian_percent':
            metricLabel = 'Asian Percentage';
            break;
        case 'black_percent':
            metricLabel = 'Black Percentage';
            break;
        default:
            metricLabel = 'Percentage';
    }
    
    // Create legend HTML
    let legendHTML = `<div class="legend">
        <h4>${metricLabel}</h4>`;
    
    // Format percentage for legend
    function formatPercentForLegend(num) {
        if (num === null || num === undefined || isNaN(num)) return 'N/A';
        return num.toFixed(1) + '%';
    }
    
    // Create legend items for each color step (breaks has 6 values: min, 20th, 40th, 60th, 80th, max)
    // We have 5 colors, so we create 5 ranges
    for (let i = colors.length - 1; i >= 0; i--) {
        const minValue = breaks[i];
        const maxValue = breaks[i + 1];
        
        // Format the range label as percentage
        let rangeLabel;
        if (i === colors.length - 1) {
            // Highest range: show "X%+"
            rangeLabel = formatPercentForLegend(minValue).replace('%', '%+');
        } else {
            // Other ranges: show "X% - Y%"
            rangeLabel = formatPercentForLegend(minValue) + ' - ' + formatPercentForLegend(maxValue);
        }
        
        legendHTML += `
        <div class="legend-item">
            <span class="legend-color" style="background-color: ${colors[i]};"></span>
            <span class="legend-label">${rangeLabel}</span>
        </div>`;
    }
    
    // Add "No data" entry
    legendHTML += `
        <div class="legend-item">
            <span class="legend-color" style="background-color: #f0f0f0;"></span>
            <span class="legend-label">No data</span>
        </div>
    </div>`;
    
    // Create and add legend control
    legendControl = L.control({ position: 'bottomright' });
    legendControl.onAdd = function() {
        const div = L.DomUtil.create('div', 'legend-control');
        div.innerHTML = legendHTML;
        return div;
    };
    legendControl.addTo(map);
}

// Load and render GeoJSON layers
function loadLayers() {
    console.log('loadLayers called');
    console.log('cityData:', cityData ? (cityData.type || 'unknown') : 'undefined');
    console.log('cdpData:', cdpData ? (cdpData.type || 'unknown') : 'undefined');
    
    // Remove existing layers
    if (cityLayer) {
        map.removeLayer(cityLayer);
    }
    if (cdpLayer) {
        map.removeLayer(cdpLayer);
    }
    selectedLayer = null;
    
    // Filter to Contra Costa County
    // TEMPORARILY: Show all features to debug, then we'll filter
    let filteredCityFeatures = [];
    if (cityData && cityData.type === 'Feature') {
        // Temporarily show all to debug
        filteredCityFeatures.push(cityData);
        // if (isInContraCostaCounty(cityData)) {
        //     filteredCityFeatures.push(cityData);
        // }
    } else if (cityData && cityData.type === 'FeatureCollection') {
        // Temporarily show all to debug
        filteredCityFeatures = cityData.features;
        // filteredCityFeatures = cityData.features.filter(isInContraCostaCounty);
    }
    
    let filteredCdpFeatures = [];
    if (cdpData && cdpData.type === 'Feature') {
        // Temporarily show all to debug
        filteredCdpFeatures.push(cdpData);
        // if (isInContraCostaCounty(cdpData)) {
        //     filteredCdpFeatures.push(cdpData);
        // }
    } else if (cdpData && cdpData.type === 'FeatureCollection') {
        // Temporarily show all to debug
        filteredCdpFeatures = cdpData.features;
        // filteredCdpFeatures = cdpData.features.filter(isInContraCostaCounty);
    }
    
    // Get all filtered features and calculate breaks once for consistent coloring
    const allFeatures = filteredCityFeatures.concat(filteredCdpFeatures);
    console.log(`Loaded ${allFeatures.length} features (${filteredCityFeatures.length} cities, ${filteredCdpFeatures.length} CDPs)`);
    
    if (allFeatures.length === 0) {
        console.warn('No features found in Contra Costa County!');
        console.log('Checking first few CDP features...');
        if (cdpData && cdpData.type === 'FeatureCollection' && cdpData.features.length > 0) {
            const firstFeature = cdpData.features[0];
            console.log('First CDP feature:', firstFeature.properties.NAMELSAD || 'unnamed');
            if (firstFeature.geometry && firstFeature.geometry.coordinates) {
                const coords = firstFeature.geometry.coordinates;
                let sampleCoords = [];
                if (firstFeature.geometry.type === 'Polygon') {
                    sampleCoords = coords[0].slice(0, 3);
                } else if (firstFeature.geometry.type === 'MultiPolygon') {
                    sampleCoords = coords[0][0].slice(0, 3);
                }
                console.log('Sample coordinates:', sampleCoords);
            }
        }
        return;
    }
    
    const breaks = calculateBreaks(allFeatures);
    const colors = colorScale[currentMetric];
    
    // Store breaks globally for legend
    currentBreaks = breaks;
    
    // Update legend
    updateLegend(breaks, colors);
    
    // Create city layer
    let cityGeoJson = {
        type: 'FeatureCollection',
        features: filteredCityFeatures
    };
    if (filteredCityFeatures.length > 0) {
        console.log('Creating city layer with', filteredCityFeatures.length, 'features');
        cityLayer = createLayer(cityGeoJson, breaks, colors);
        cityLayer.addTo(map);
        console.log('City layer added to map');
    }
    
    // Create CDP layer
    let cdpGeoJson = {
        type: 'FeatureCollection',
        features: filteredCdpFeatures
    };
    if (filteredCdpFeatures.length > 0) {
        console.log('Creating CDP layer with', filteredCdpFeatures.length, 'features');
        cdpLayer = createLayer(cdpGeoJson, breaks, colors);
        cdpLayer.addTo(map);
        console.log('CDP layer added to map');
    }
    
    // Map bounds are already set to Walnut Creek 50-mile radius view
    // No need to override with feature bounds
    if (!cityLayer && !cdpLayer) {
        console.error('No layers created!');
    }
}

// Handle metric switching
document.getElementById('metric-select').addEventListener('change', function(e) {
    currentMetric = e.target.value;
    loadLayers();
    
    // Clear data panel if a feature was selected
    if (selectedLayer) {
        selectedLayer = null;
        document.getElementById('data-panel').style.display = 'none';
    }
});

// Global variables to store loaded data
let cityData = null;
let cdpData = null;

// Load JSON data files
async function loadData() {
    try {
        console.log('Loading JSON data files...');
        
        // Load both JSON files in parallel
        const [citiesResponse, cdpResponse] = await Promise.all([
            fetch('cities_final.json'),
            fetch('cdp_final.json')
        ]);
        
        if (!citiesResponse.ok) {
            throw new Error(`Failed to load cities_final.json: ${citiesResponse.status}`);
        }
        if (!cdpResponse.ok) {
            throw new Error(`Failed to load cdp_final.json: ${cdpResponse.status}`);
        }
        
        cityData = await citiesResponse.json();
        cdpData = await cdpResponse.json();
        
        console.log('Data loaded successfully!');
        console.log(`  cities_final.json: ${cityData.type}, ${cityData.features?.length || 0} features`);
        console.log(`  cdp_final.json: ${cdpData.type}, ${cdpData.features?.length || 0} features`);
        
        // Initialize map with loaded data
        loadLayers();
        
    } catch (error) {
        console.error('Error loading data:', error);
        alert('Failed to load map data. Please check the console for details.');
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadData);
} else {
    loadData();
}

