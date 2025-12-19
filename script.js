// Register Chart.js datalabels plugin if available
if (typeof ChartDataLabels !== 'undefined') {
    Chart.register(ChartDataLabels);
}

// Initialize map centered on Walnut Creek with 20-25 mile radius view
const walnutCreekCenter = [37.9061, -122.0649];
const map = L.map('map', {
    center: walnutCreekCenter,
    zoom: 8,
    zoomControl: false, // Disable default zoom controls (we'll add custom positioned ones)
    scrollWheelZoom: true, // Enable mouse wheel zoom
    doubleClickZoom: true, // Enable double-click zoom
    boxZoom: true, // Enable box zoom (shift+drag)
    keyboard: true // Enable keyboard navigation
}).setView(walnutCreekCenter, 8); // Set initial center and zoom

setTimeout(() => {
    map.setZoom(12);
}, 500);

// Add zoom controls at bottom-left to avoid conflicts with legend (bottom-right) and details pane (right)
L.control.zoom({
    position: 'bottomleft'
}).addTo(map);

// Add base tile layer with 50% opacity
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    opacity: 0.5
}).addTo(map);

// Calculate bounds for 22.5-mile radius around Walnut Creek (middle of 20-25 mile range)
// 22.5 miles = 36.21 km
// At latitude 37.9: 1° latitude ≈ 111 km, 1° longitude ≈ 88.6 km
const radiusMiles = 22.5;
const radiusKm = radiusMiles * 1.60934; // Convert miles to km
const radiusLat = radiusKm / 111; // approximately 0.33 degrees
const radiusLng = radiusKm / (111 * Math.cos(walnutCreekCenter[0] * Math.PI / 180)); // longitude varies by latitude

// Wait for map to be ready, then fit bounds to 22.5-mile radius
// Using maxZoom option to ensure we get a closer view (zoomed in)
map.whenReady(function() {
    const bounds = L.latLngBounds(
        [walnutCreekCenter[0] - radiusLat, walnutCreekCenter[1] - radiusLng], // Southwest corner
        [walnutCreekCenter[0] + radiusLat, walnutCreekCenter[1] + radiusLng]  // Northeast corner
    );
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
});

// Store layer references for re-styling
let cityLayer = null;
let cdpLayer = null;
let selectedLayer = null;
let currentMetric = 'white_percent';
let currentBreaks = [0, 0, 0, 0, 0, 0, 0]; // Store current breaks for legend (7 steps)
let legendControl = null; // Legend control reference
let pieChart = null; // Pie chart instance
let cityLabelLayer = null; // Leaflet layer group for city labels
let cdpLabelLayer = null; // Leaflet layer group for CDP labels
const MIN_ZOOM_FOR_LABELS = 12; // Minimum zoom level to show city labels

// 7-step multi-hue sequential color scale (yellow for low, current color for high)
const colorScale = {
    foreign_born: ['#fff9c4', '#fff59d', '#ffeb3b', '#d4e157', '#aed581', '#81c784', '#4caf50'],  // Yellow to green
    race: ['#fff9c4', '#fff59d', '#ffeb3b', '#c5e1a5', '#a5d6a7', '#66bb6a', '#1b5e20'],  // Yellow to dark green
    white_percent: ['#fff9c4', '#fff59d', '#ffeb3b', '#90caf9', '#64b5f6', '#42a5f5', '#08519c'],  // Yellow to dark blue
    hispanic_percent: ['#fff9c4', '#fff59d', '#ffeb3b', '#ffcc80', '#ff8a65', '#ff5722', '#a50f15'],  // Yellow to dark red
    asian_percent: ['#fff9c4', '#fff59d', '#ffeb3b', '#e1bee7', '#ce93d8', '#ba68c8', '#805ad5'],  // Yellow to purple
    black_percent: ['#fff9c4', '#fff59d', '#ffeb3b', '#ffe082', '#ffb74d', '#ff9800', '#e6550d']  // Yellow to orange
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
        return [0, 0, 0, 0, 0, 0, 0];
    }
    
    const min = values[0];
    const max = values[values.length - 1];
    
    // Use quantile breaks (7 steps)
    const breaks = [
        min,
        values[Math.floor(values.length * (1/7))],
        values[Math.floor(values.length * (2/7))],
        values[Math.floor(values.length * (3/7))],
        values[Math.floor(values.length * (4/7))],
        values[Math.floor(values.length * (5/7))],
        values[Math.floor(values.length * (6/7))],
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
    if (value <= breaks[5]) return colors[4];
    if (value <= breaks[6]) return colors[5];
    return colors[6];
}

// Style function for choropleth
function styleFeature(feature, breaks, colors) {
    const value = getFeatureValue(feature);
    return {
        fillColor: getColor(value, breaks, colors),
        fillOpacity: 0.7,
        color: '#555',
        weight: 2,
        opacity: 0.9
    };
}

// Highlight selected feature
function highlightFeature(e) {
    const layer = e.target;
    
    // Reset previous selection
    if (selectedLayer) {
        selectedLayer.setStyle({
            fillOpacity: 0.7,
            color: '#555',
            weight: 2
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
        color: '#555',
        weight: 2
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
    
    // Calculate race percentages
    const latinoPercent = totalPop > 0 ? (latino / totalPop) * 100 : 0;
    const whitePercent = totalPop > 0 ? (white / totalPop) * 100 : 0;
    const blackPercent = totalPop > 0 ? (black / totalPop) * 100 : 0;
    const asianPercent = totalPop > 0 ? (asian / totalPop) * 100 : 0;
    const otherPercent = totalPop > 0 ? (other / totalPop) * 100 : 0;
    
    // Format numbers
    function formatNumber(num) {
        if (num === null || num === undefined || isNaN(num)) return 'N/A';
        return num.toLocaleString();
    }
    
    function formatPercent(num) {
        if (num === null || num === undefined || isNaN(num)) return 'N/A';
        return Math.round(num) + '%';
    }
    
    // Update the panel title with city name
    const panelTitle = panel.querySelector('h2');
    if (panelTitle) {
        panelTitle.textContent = name;
    }
    
    // Build HTML
    let html = `
        <div class="data-item">
            <div class="data-label">Total Population:</div>
            <div class="data-value">${formatNumber(totalPop)}</div>
        </div>
        
        <div id="pie-chart-container-inline" style="display: block; margin-top: 15px; margin-bottom: 15px; height: 250px; position: relative;">
            <canvas id="pie-chart-inline"></canvas>
        </div>
        
        <div class="data-item">
            <div class="data-label">Foreign Born Population:</div>
            <div class="progress-bar-container">
                <div class="progress-bar" style="width: ${foreignBornPercent || 0}%;">
                    ${foreignBornPercent != null && foreignBornPercent >= 5 ? formatPercent(foreignBornPercent) : ''}
                </div>
            </div>
        </div>
    `;
    
    // Destroy existing pie chart before replacing HTML
    if (pieChart) {
        pieChart.destroy();
        pieChart = null;
    }
    
    content.innerHTML = html;
    
    panel.style.display = 'block';
    
    // Update pie chart (use setTimeout to ensure DOM is updated)
    setTimeout(() => {
        updatePieChart(latinoPercent, whitePercent, blackPercent, asianPercent, otherPercent);
    }, 10);
}

// Update or create pie chart with race demographics
function updatePieChart(latinoPercent, whitePercent, blackPercent, asianPercent, otherPercent) {
    const ctx = document.getElementById('pie-chart-inline');
    if (!ctx) return;
    
    // Use colors from map color scales (darkest shade from each scale)
    const data = [
        { label: 'White', value: Math.round(whitePercent), color: '#08519c' },      // Darkest blue from white_percent scale
        { label: 'Latino', value: Math.round(latinoPercent), color: '#a50f15' },      // Darkest red from hispanic_percent scale
        { label: 'Black', value: Math.round(blackPercent), color: '#e6550d' },       // Darkest orange from black_percent scale
        { label: 'Asian', value: Math.round(asianPercent), color: '#805ad5' },       // Darkest purple from asian_percent scale
        { label: 'Other', value: Math.round(otherPercent), color: '#969696' }        // Medium gray (neutral)
    ];
    
    // Filter out zero values
    const filteredData = data.filter(item => item.value > 0);
    
    if (pieChart) {
        // Update existing chart
        pieChart.data.labels = filteredData.map(item => item.label);
        pieChart.data.datasets[0].data = filteredData.map(item => item.value);
        pieChart.data.datasets[0].backgroundColor = filteredData.map(item => item.color);
        // Ensure datalabels plugin is configured
        if (pieChart.options.plugins.datalabels) {
            pieChart.options.plugins.datalabels.display = true;
        }
        pieChart.update();
    } else {
        // Create new chart
        pieChart = new Chart(ctx, {
            type: 'pie',
            data: {
                labels: filteredData.map(item => item.label),
                datasets: [{
                    data: filteredData.map(item => item.value),
                    backgroundColor: filteredData.map(item => item.color),
                    borderColor: '#fff',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false  // Hide legend since labels are on slices
                    },
                    tooltip: {
                        enabled: false  // Disable tooltips on hover
                    },
                    datalabels: {
                        display: true,  // Always show labels
                        color: '#fff',
                        font: {
                            weight: 'bold',
                            size: 12
                        },
                        formatter: function(value, context) {
                            const label = context.chart.data.labels[context.dataIndex];
                            // Always show both label and percentage
                            return label + '\n' + value + '%';
                        },
                        textAlign: 'center',
                        anchor: 'center',
                        padding: 6,
                        clip: false  // Don't clip labels that extend beyond slice
                    }
                }
            }
        });
    }
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

// Calculate centroid of a polygon feature
function calculateCentroid(feature) {
    if (!feature || !feature.geometry || !feature.geometry.coordinates) {
        return null;
    }
    
    const geometry = feature.geometry;
    let allCoords = [];
    
    if (geometry.type === 'Polygon') {
        // Use the first ring (exterior ring) of the polygon
        allCoords = geometry.coordinates[0];
    } else if (geometry.type === 'MultiPolygon') {
        // Find the largest polygon in the MultiPolygon
        let largestPolygon = null;
        let maxArea = 0;
        
        for (let polygon of geometry.coordinates) {
            const ring = polygon[0];
            // Simple area approximation (not exact, but good enough for finding largest)
            let area = 0;
            for (let i = 0; i < ring.length - 1; i++) {
                area += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
            }
            area = Math.abs(area);
            
            if (area > maxArea) {
                maxArea = area;
                largestPolygon = ring;
            }
        }
        
        if (largestPolygon) {
            allCoords = largestPolygon;
        } else {
            // Fallback: use first polygon's first ring
            allCoords = geometry.coordinates[0][0];
        }
    } else {
        return null;
    }
    
    if (allCoords.length === 0) {
        return null;
    }
    
    // Calculate arithmetic mean of coordinates
    let sumLat = 0;
    let sumLng = 0;
    let count = 0;
    
    // Skip last coordinate if it's duplicate of first (closed ring)
    const coordsToUse = allCoords.length > 0 && 
                       allCoords[0][0] === allCoords[allCoords.length - 1][0] &&
                       allCoords[0][1] === allCoords[allCoords.length - 1][1]
                       ? allCoords.slice(0, -1) : allCoords;
    
    for (let coord of coordsToUse) {
        sumLng += coord[0]; // longitude
        sumLat += coord[1]; // latitude
        count++;
    }
    
    if (count === 0) {
        return null;
    }
    
    return [sumLat / count, sumLng / count]; // Return as [lat, lng]
}

// Create label layer for features
function createLabelLayer(features, isCity) {
    const labelGroup = L.layerGroup();
    
    for (let feature of features) {
        const centroid = calculateCentroid(feature);
        if (!centroid) {
            continue;
        }
        
        // Get label text: CDTFA_CITY for cities, NAMELSAD for CDPs
        const labelText = isCity 
            ? (feature.properties.CDTFA_CITY || '')
            : (feature.properties.NAMELSAD || '');
        
        if (!labelText) {
            continue;
        }
        
        // Create marker with divIcon for styled label
        // Estimate width: ~8px per character, add padding (12px total)
        // Height: font-size (12px) + padding (8px total) = ~20px
        const estimatedWidth = labelText.length * 8 + 12;
        const estimatedHeight = 20;
        
        const labelMarker = L.marker(centroid, {
            icon: L.divIcon({
                className: 'city-label',
                html: labelText,
                iconSize: [estimatedWidth, estimatedHeight],
                iconAnchor: [estimatedWidth / 2, estimatedHeight / 2] // Center the label on the centroid
            }),
            interactive: false, // Labels don't need to be clickable
            keyboard: false
        });
        
        labelGroup.addLayer(labelMarker);
    }
    
    return labelGroup;
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
                            weight: 3
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
        return Math.round(num) + '%';
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

// Helper function to check if a feature has demographic data
function hasDemographicData(feature) {
    if (!feature || !feature.properties) {
        return false;
    }
    
    const props = feature.properties;
    // Check if Population exists and is a valid number
    const population = props.Population;
    
    if (population === null || population === undefined) {
        return false;
    }
    
    // Convert to number if it's a string
    const popNum = typeof population === 'string' 
        ? parseFloat(population.replace(/,/g, '')) 
        : parseFloat(population);
    
    // Return true if population is a valid positive number
    return !isNaN(popNum) && popNum > 0;
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
    if (cityLabelLayer) {
        map.removeLayer(cityLabelLayer);
    }
    if (cdpLabelLayer) {
        map.removeLayer(cdpLabelLayer);
    }
    selectedLayer = null;
    
    // Filter to only include features with demographic data
    let filteredCityFeatures = [];
    if (cityData && cityData.type === 'Feature') {
        if (hasDemographicData(cityData)) {
            filteredCityFeatures.push(cityData);
        }
    } else if (cityData && cityData.type === 'FeatureCollection') {
        filteredCityFeatures = cityData.features.filter(hasDemographicData);
    }
    
    let filteredCdpFeatures = [];
    if (cdpData && cdpData.type === 'Feature') {
        if (hasDemographicData(cdpData)) {
            filteredCdpFeatures.push(cdpData);
        }
    } else if (cdpData && cdpData.type === 'FeatureCollection') {
        filteredCdpFeatures = cdpData.features.filter(hasDemographicData);
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
    
    // Create label layers (added after polygon layers for higher z-index)
    // Labels are created but visibility controlled by zoom level
    if (filteredCityFeatures.length > 0) {
        cityLabelLayer = createLabelLayer(filteredCityFeatures, true);
        updateLabelVisibility();
        console.log('City label layer created');
    }
    
    if (filteredCdpFeatures.length > 0) {
        cdpLabelLayer = createLabelLayer(filteredCdpFeatures, false);
        updateLabelVisibility();
        console.log('CDP label layer created');
    }
    
    // Map bounds are already set to Walnut Creek 50-mile radius view
    // No need to override with feature bounds
    if (!cityLayer && !cdpLayer) {
        console.error('No layers created!');
    }
}

// Update label visibility based on zoom level
function updateLabelVisibility() {
    const currentZoom = map.getZoom();
    const shouldShowLabels = currentZoom >= MIN_ZOOM_FOR_LABELS;
    
    if (cityLabelLayer) {
        if (shouldShowLabels && !map.hasLayer(cityLabelLayer)) {
            cityLabelLayer.addTo(map);
        } else if (!shouldShowLabels && map.hasLayer(cityLabelLayer)) {
            map.removeLayer(cityLabelLayer);
        }
    }
    
    if (cdpLabelLayer) {
        if (shouldShowLabels && !map.hasLayer(cdpLabelLayer)) {
            cdpLabelLayer.addTo(map);
        } else if (!shouldShowLabels && map.hasLayer(cdpLabelLayer)) {
            map.removeLayer(cdpLabelLayer);
        }
    }
}

// Listen to zoom events to show/hide labels
map.on('zoomend', function() {
    updateLabelVisibility();
});

// Handle metric switching
document.getElementById('metric-select').addEventListener('change', function(e) {
    currentMetric = e.target.value;
    loadLayers();
    
    // Clear data panel if a feature was selected
    if (selectedLayer) {
        selectedLayer = null;
        document.getElementById('data-panel').style.display = 'none';
        // Reset pie chart when panel is hidden
        if (pieChart) {
            pieChart.destroy();
            pieChart = null;
        }
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

