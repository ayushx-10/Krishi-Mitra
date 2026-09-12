/**
 * Main Application Controller — COGNITIA
 * 
 * Orchestrates data fetching, physics model execution, cross-validation,
 * OpenStreetMap Overpass field detection, interactive land plotting,
 * live ISRIC SoilGrids classification, reverse geocoding, and UI rendering.
 */

import './style.css';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Engine modules
import { CROPS, getCurrentGrowthStage } from './engine/cropDatabase.js';
import { getSoilFromLookup } from './engine/soilCharacteristics.js';
import { runWaterBalance } from './engine/waterBalance.js';
import { computeYieldLoss } from './engine/yieldLoss.js';
import { runCrossValidation } from './engine/crossValidation.js';
import { generateAdvisory } from './engine/advisoryGenerator.js';

// Data fetchers
import { fetchWeatherData } from './data/weatherFetcher.js';
import { fetchSoilData } from './data/soilFetcher.js';
import { fetchSatelliteData } from './data/satelliteFetcher.js';
import { fetchOSMFields } from './data/osmFieldFetcher.js';

// Neon Serverless Postgres DB Store
import { saveFieldToAccount, getSavedFields, deleteSavedField, initNeonSchema } from './data/neonFieldStore.js';

// UI
import { renderDashboard, showLoading, updateLoadingStep } from './ui/dashboard.js';

// === Fix Leaflet marker icon ===
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// === State ===
let map = null;
let marker = null;
let selectedLat = 30.55;
let selectedLng = 76.45;
let selectedLocationName = 'Fatehgarh Sahib / Patiala, Punjab, India';
let irrigationEvents = [];
let isAnalyzing = false;

// Land Polygon & OSM Fields State
let drawMode = 'select'; // 'select' | 'polygon'
let polygonPoints = [];
let activePolygon = null;
let polygonMarkers = [];
let activePolyline = null;
let rubberbandLine = null;
let editHandles = [];
let fieldArea = null; // { hectares, acres, sqMeters }
let osmFieldsLayerGroup = null;
let isDetectingFields = false;

// Geocode cache
const geocodeCache = new Map();
let currentSoilData = null;

// === Initialize ===
function init() {
  initScrollReveal();
  initShowcaseSlider();
  initMap();
  initMapTools();
  initDrawToolbar();
  initSearch();
  initPresets();
  initForm();
  initDisclaimer();
  initNeonIntegration();

  // Default planting date: ~90 days ago
  const defaultPlanting = new Date();
  defaultPlanting.setDate(defaultPlanting.getDate() - 90);
  document.getElementById('planting-date').value = defaultPlanting.toISOString().split('T')[0];

  updateGrowthStage();
  updateFieldInfo();
  updateLocation(selectedLat, selectedLng);

  // Listen for irrigation events from dashboard action card
  window.addEventListener('add-irrigation', (e) => {
    if (e.detail) {
      irrigationEvents.push(e.detail);
      renderIrrigationList();
    }
  });

  // Hide loading screen
  setTimeout(() => {
    document.getElementById('loading-screen')?.classList.add('hidden');
  }, 600);
}

// === Scroll Reveal Animation System (IntersectionObserver) ===
function initScrollReveal() {
  const revealElements = document.querySelectorAll('.reveal');
  if (!revealElements.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const el = entry.target;
        const delay = parseInt(el.getAttribute('data-delay') || '0', 10);
        setTimeout(() => {
          el.classList.add('revealed');
        }, delay);
        observer.unobserve(el);
      }
    });
  }, {
    threshold: 0.12,
    rootMargin: '0px 0px -40px 0px',
  });

  revealElements.forEach(el => observer.observe(el));

  // Also observe dynamically injected dashboard elements
  const mutationObserver = new MutationObserver((mutations) => {
    mutations.forEach(mutation => {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType !== 1) return;
        const reveals = node.querySelectorAll ? node.querySelectorAll('.reveal:not(.revealed)') : [];
        reveals.forEach(el => observer.observe(el));
        if (node.classList && node.classList.contains('reveal') && !node.classList.contains('revealed')) {
          observer.observe(node);
        }
      });
    });
  });

  mutationObserver.observe(document.body, { childList: true, subtree: true });
}

// === Showcase Slider Controller ===
function initShowcaseSlider() {
  const cards = document.querySelectorAll('.showcase-card');
  const dots = document.querySelectorAll('.pag-dot');
  const prevBtn = document.getElementById('slider-prev-btn');
  const nextBtn = document.getElementById('slider-next-btn');
  const wrapper = document.getElementById('showcase-slides-wrapper');
  if (!cards.length) return;

  let currentSlide = 0;
  const totalSlides = cards.length;
  let autoTimer = null;

  function updateSlider(index) {
    currentSlide = (index + totalSlides) % totalSlides;
    cards.forEach((c, i) => {
      c.classList.remove('active', 'prev', 'next');
      if (i === currentSlide) {
        c.classList.add('active');
      } else if (i === (currentSlide - 1 + totalSlides) % totalSlides) {
        c.classList.add('prev');
      } else if (i === (currentSlide + 1) % totalSlides) {
        c.classList.add('next');
      }
    });

    dots.forEach((d, i) => {
      d.classList.toggle('active', i === currentSlide);
    });
  }

  function startAuto() {
    stopAuto();
    autoTimer = setInterval(() => {
      updateSlider(currentSlide + 1);
    }, 6000);
  }

  function stopAuto() {
    if (autoTimer) clearInterval(autoTimer);
  }

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      updateSlider(currentSlide - 1);
      startAuto();
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      updateSlider(currentSlide + 1);
      startAuto();
    });
  }

  dots.forEach(dot => {
    dot.addEventListener('click', () => {
      const idx = parseInt(dot.getAttribute('data-index') || '0', 10);
      updateSlider(idx);
      startAuto();
    });
  });

  if (wrapper) {
    wrapper.addEventListener('mouseenter', stopAuto);
    wrapper.addEventListener('mouseleave', startAuto);
  }

  updateSlider(0);
  startAuto();
}

// === Map Initialization with Google Hybrid Satellite & Multi-Layers ===
function initMap() {
  map = L.map('map', {
    zoomControl: false,
    attributionControl: false,
    doubleClickZoom: false, // Prevent zoom on double-click so farmer can double-click to finish plot!
  }).setView([selectedLat, selectedLng], 13);

  // Layer group for auto-detected OSM farmland polygons
  osmFieldsLayerGroup = L.layerGroup().addTo(map);

  // 1. Google Satellite Hybrid (Ultra sharp worldwide satellite + labels)
  const googleHybrid = L.tileLayer(
    'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
    { maxZoom: 20 }
  );

  // 2. Esri World Imagery (Satellite Base)
  const esriSat = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    { maxZoom: 19 }
  );

  // 3. CartoDB Labels Overlay
  const labelsOverlay = L.tileLayer(
    'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png',
    { maxZoom: 19, subdomains: 'abcd' }
  );
  const esriHybridLayer = L.layerGroup([esriSat, labelsOverlay]);

  // 4. CartoDB Voyager (Agro vector)
  const voyagerLayer = L.tileLayer(
    'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    { maxZoom: 19, subdomains: 'abcd' }
  );

  // 5. OpenStreetMap Standard
  const osmLayer = L.tileLayer(
    'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    { maxZoom: 19 }
  );

  // 6. OpenTopoMap (Terrain relief)
  const topoLayer = L.tileLayer(
    'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    { maxZoom: 17 }
  );

  // Default to Google Hybrid Satellite for maximum clarity
  googleHybrid.addTo(map);

  // Layer control
  L.control.layers(
    {
      '🛰️ Google Hybrid': googleHybrid,
      '🛰️ Esri Satellite': esriHybridLayer,
      '🌿 Clean Agro Map': voyagerLayer,
      '🗺️ Street Map': osmLayer,
      '⛰️ Topo Relief': topoLayer,
    },
    {
      '🌾 Detected OSM Fields': osmFieldsLayerGroup,
    },
    { position: 'bottomright' }
  ).addTo(map);

  // Zoom control
  L.control.zoom({ position: 'bottomright' }).addTo(map);

  // Add initial marker
  marker = L.marker([selectedLat, selectedLng], { draggable: true }).addTo(map);
  marker.bindPopup(createPopup());

  // Map click handler
  map.on('click', (e) => {
    if (drawMode === 'polygon') {
      addPolygonPoint(e.latlng);
    } else {
      updateLocation(e.latlng.lat, e.latlng.lng);
    }
  });

  // Double-click on map to finish polygon
  map.on('dblclick', (e) => {
    if (drawMode === 'polygon' && polygonPoints.length >= 3) {
      finalizePolygon();
    }
  });

  // Mousemove for rubberband guideline while drawing
  map.on('mousemove', (e) => {
    if (drawMode === 'polygon' && polygonPoints.length > 0) {
      const lastPt = polygonPoints[polygonPoints.length - 1];
      if (!rubberbandLine) {
        rubberbandLine = L.polyline([lastPt, e.latlng], {
          color: '#10b981',
          weight: 2,
          dashArray: '4, 6',
          opacity: 0.8,
        }).addTo(map);
      } else {
        rubberbandLine.setLatLngs([lastPt, e.latlng]);
      }
    }
  });

  // Marker drag
  marker.on('dragend', () => {
    const pos = marker.getLatLng();
    updateLocation(pos.lat, pos.lng);
  });

  // Go to coords button
  document.getElementById('go-to-coords')?.addEventListener('click', () => {
    const lat = parseFloat(document.getElementById('lat-input').value);
    const lng = parseFloat(document.getElementById('lng-input').value);
    if (!isNaN(lat) && !isNaN(lng)) {
      updateLocation(lat, lng);
      map.flyTo([lat, lng], 13, { duration: 1 });
    }
  });

  // Locate button (geolocation)
  document.getElementById('locate-btn')?.addEventListener('click', () => {
    if (navigator.geolocation) {
      document.getElementById('loc-name-text').textContent = 'Acquiring GPS coordinates...';
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          updateLocation(pos.coords.latitude, pos.coords.longitude);
          map.flyTo([pos.coords.latitude, pos.coords.longitude], 15, { duration: 1.2 });
        },
        () => alert('Could not get GPS location. Please search village name or enter coordinates.')
      );
    }
  });
}

// === Map Tools & OSM Overpass Auto-Detection ===
function initMapTools() {
  const btnCursor = document.getElementById('tool-cursor');
  const btnDetectFields = document.getElementById('tool-detect-fields');
  const btnPolygon = document.getElementById('tool-polygon');
  const btnDelete = document.getElementById('tool-delete');
  const btnFullscreen = document.getElementById('tool-fullscreen');
  const fullscreenLabel = document.getElementById('fullscreen-label');
  const mainLayout = document.querySelector('.main-layout');

  btnCursor?.addEventListener('click', () => {
    setDrawMode('select');
  });

  btnDetectFields?.addEventListener('click', () => {
    detectOSMFields();
  });

  btnPolygon?.addEventListener('click', () => {
    setDrawMode('polygon');
  });

  btnDelete?.addEventListener('click', () => {
    clearPolygon();
    clearOSMFields();
    setDrawMode('select');
  });

  btnFullscreen?.addEventListener('click', () => {
    mainLayout.classList.toggle('expanded-map');
    const isExpanded = mainLayout.classList.contains('expanded-map');
    if (fullscreenLabel) fullscreenLabel.textContent = isExpanded ? 'Collapse' : 'Expand';
    btnFullscreen.classList.toggle('active', isExpanded);
    setTimeout(() => {
      map.invalidateSize();
    }, 360);
  });
}

// === Draw Floating Toolbar Actions (Finish, Undo, Cancel) ===
function initDrawToolbar() {
  const btnFinish = document.getElementById('draw-btn-finish');
  const btnUndo = document.getElementById('draw-btn-undo');
  const btnCancel = document.getElementById('draw-btn-cancel');

  btnFinish?.addEventListener('click', () => {
    if (polygonPoints.length >= 3) finalizePolygon();
  });

  btnUndo?.addEventListener('click', () => {
    undoLastPoint();
  });

  btnCancel?.addEventListener('click', () => {
    clearPolygonDrawing();
    setDrawMode('select');
  });
}

// === Detect Fields via OpenStreetMap Overpass API ===
async function detectOSMFields() {
  if (isDetectingFields) return;
  isDetectingFields = true;

  const btnDetect = document.getElementById('tool-detect-fields');
  const originalHtml = btnDetect.innerHTML;
  btnDetect.innerHTML = `<span class="spin-icon">⏳</span><span>Fetching OSM...</span>`;
  btnDetect.disabled = true;

  const instructionBadge = document.getElementById('draw-instruction-badge');
  if (instructionBadge) {
    instructionBadge.classList.remove('hidden');
    instructionBadge.innerHTML = `<span>🛰️ Querying OpenStreetMap Overpass for agricultural field boundaries...</span>`;
  }

  try {
    const fields = await fetchOSMFields(selectedLat, selectedLng, 3000);
    clearOSMFields();

    if (fields.length > 0) {
      for (const field of fields) {
        const poly = L.polygon(field.latlngs, {
          color: '#059669',
          weight: 2.5,
          fillColor: '#10b981',
          fillOpacity: 0.25,
          dashArray: '4, 4',
        });

        poly.bindTooltip(`
          <div style="font-family:Inter,sans-serif;font-size:0.82rem;">
            <strong>${field.name}</strong><br/>
            ${field.area.acres} Acres (${field.area.hectares} Ha)
          </div>
        `, { sticky: true });

        // On click: select this OSM field!
        poly.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          selectOSMField(field, poly);
        });

        osmFieldsLayerGroup.addLayer(poly);
      }

      if (instructionBadge) {
        instructionBadge.innerHTML = `<span>✅ Found ${fields.length} OpenStreetMap agricultural parcels! Click any parcel on the map.</span>`;
        setTimeout(() => instructionBadge.classList.add('hidden'), 5000);
      }

      // Auto-select the first parcel closest to current center
      if (fields[0]) {
        const firstLayer = osmFieldsLayerGroup.getLayers()[0];
        if (firstLayer) selectOSMField(fields[0], firstLayer);
      }
    } else {
      alert('No pre-mapped farmland polygons found around this specific town or urban point. Move pin to agricultural fields or use the "Draw Plot" tool to outline your boundary.');
      if (instructionBadge) instructionBadge.classList.add('hidden');
    }
  } catch (err) {
    console.warn('Overpass field detection failed:', err);
    alert('Could not retrieve OpenStreetMap fields. Please use the Draw Plot tool to trace your boundary.');
    if (instructionBadge) instructionBadge.classList.add('hidden');
  } finally {
    isDetectingFields = false;
    btnDetect.innerHTML = originalHtml;
    btnDetect.disabled = false;
  }
}

function selectOSMField(field, layer) {
  osmFieldsLayerGroup.eachLayer(l => {
    l.setStyle({ color: '#059669', fillColor: '#10b981', fillOpacity: 0.3, weight: 2.5, dashArray: '4, 4' });
  });

  // Highlight selected circular field
  layer.setStyle({ color: '#047857', fillColor: '#34d399', fillOpacity: 0.55, weight: 4, dashArray: null });

  fieldArea = field.area;
  polygonPoints = field.latlngs;
  activePolygon = layer;

  updateLocation(field.centroid.lat, field.centroid.lng, field.name);
  map.flyTo([field.centroid.lat, field.centroid.lng], 15, { duration: 0.8 });

  if (field.crop) {
    const cropSelect = document.getElementById('crop-select');
    if (cropSelect && cropSelect.value !== field.crop) {
      cropSelect.value = field.crop;
      updateGrowthStage();
    }
  }

  const areaBadge = document.getElementById('map-area-badge');
  const areaVal = document.getElementById('map-area-val');
  if (areaBadge && areaVal) {
    areaBadge.classList.remove('hidden');
    areaVal.textContent = `${field.area.acres} Acres (${field.area.hectares} Ha)`;
  }

  layer.bindPopup(`
    <div style="font-family:Inter,sans-serif;padding:6px;min-width:170px;">
      <strong style="color:#065f46;font-size:0.95rem;">🌾 ${field.name}</strong>
      <div style="font-size:0.85rem;margin-top:4px;color:#1e293b;">
        Area: <strong>${field.area.acres} Acres</strong> (${field.area.hectares} Ha)
      </div>
      <div style="font-size:0.75rem;color:#059669;margin-top:2px;">
        Source: ${field.source}
      </div>
    </div>
  `).openPopup();

  updateFieldInfo();
  showToast(`🌾 Selected "${field.name}" (${field.area.acres} Acres)`, 'info');
}

function clearOSMFields() {
  if (osmFieldsLayerGroup) {
    osmFieldsLayerGroup.clearLayers();
  }
}

function setDrawMode(mode) {
  drawMode = mode;
  const btnCursor = document.getElementById('tool-cursor');
  const btnPolygon = document.getElementById('tool-polygon');
  const instructionBadge = document.getElementById('draw-instruction-badge');
  const drawToolbar = document.getElementById('draw-floating-toolbar');

  btnCursor?.classList.toggle('active', mode === 'select');
  btnPolygon?.classList.toggle('active', mode === 'polygon');

  if (mode === 'polygon') {
    map.getContainer().style.cursor = 'crosshair';
    instructionBadge?.classList.remove('hidden');
    instructionBadge.innerHTML = `<span>✏️ Click corners on the map to outline field. Double-click or click Finish when done.</span>`;
    drawToolbar?.classList.remove('hidden');
    updateDrawToolbar();
    if (polygonPoints.length === 0) {
      clearPolygonDrawing();
    }
  } else {
    map.getContainer().style.cursor = '';
    instructionBadge?.classList.add('hidden');
    drawToolbar?.classList.add('hidden');
    removeRubberband();
  }
}

function updateDrawToolbar() {
  const btnFinish = document.getElementById('draw-btn-finish');
  const btnUndo = document.getElementById('draw-btn-undo');

  if (btnFinish) {
    btnFinish.disabled = polygonPoints.length < 3;
    btnFinish.innerHTML = `<span>✓ Finish Plot (${polygonPoints.length} points)</span>`;
  }
  if (btnUndo) {
    btnUndo.disabled = polygonPoints.length === 0;
  }
}

function addPolygonPoint(latlng) {
  polygonPoints.push(latlng);
  const isFirst = polygonPoints.length === 1;

  const dotIcon = L.divIcon({
    className: `polygon-vertex-dot ${isFirst ? 'start-vertex-target' : ''}`,
    html: `<div style="width:14px;height:14px;background:#fff;border:3px solid #10b981;border-radius:50%;box-shadow:0 0 8px rgba(0,0,0,0.5);"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });

  const vertexMarker = L.marker(latlng, { icon: dotIcon, zIndexOffset: 1000 }).addTo(map);
  
  if (isFirst) {
    vertexMarker.bindTooltip('🎯 Click here or double-click to close polygon', { permanent: false, direction: 'top' });
    vertexMarker.on('click', (e) => {
      L.DomEvent.stopPropagation(e);
      if (polygonPoints.length >= 3) finalizePolygon();
    });
  }

  polygonMarkers.push(vertexMarker);

  if (!activePolyline) {
    activePolyline = L.polyline(polygonPoints, {
      color: '#10b981',
      weight: 3.5,
      dashArray: '6, 6',
    }).addTo(map);
  } else {
    activePolyline.setLatLngs(polygonPoints);
  }

  updateDrawToolbar();
}

function undoLastPoint() {
  if (polygonPoints.length === 0) return;

  polygonPoints.pop();
  const lastMarker = polygonMarkers.pop();
  if (lastMarker) map.removeLayer(lastMarker);

  if (activePolyline) {
    if (polygonPoints.length > 0) {
      activePolyline.setLatLngs(polygonPoints);
    } else {
      map.removeLayer(activePolyline);
      activePolyline = null;
    }
  }

  updateDrawToolbar();
}

function removeRubberband() {
  if (rubberbandLine) {
    map.removeLayer(rubberbandLine);
    rubberbandLine = null;
  }
}

function finalizePolygon() {
  if (polygonPoints.length < 3) return;

  removeRubberband();

  if (activePolygon && !osmFieldsLayerGroup.hasLayer(activePolygon)) {
    map.removeLayer(activePolygon);
  }
  clearPolygonDrawing();
  clearEditHandles();

  activePolygon = L.polygon(polygonPoints, {
    color: '#059669',
    weight: 3.5,
    fillColor: '#10b981',
    fillOpacity: 0.35,
  }).addTo(map);

  fieldArea = calculatePolygonArea(polygonPoints);

  // Setup draggable handles on each corner for fine-tuning
  createEditableHandles(polygonPoints);

  let sumLat = 0, sumLng = 0;
  for (const pt of polygonPoints) {
    sumLat += pt.lat;
    sumLng += pt.lng;
  }
  const centroidLat = sumLat / polygonPoints.length;
  const centroidLng = sumLng / polygonPoints.length;

  updateLocation(centroidLat, centroidLng);

  // Update floating area badge on map
  const areaBadge = document.getElementById('map-area-badge');
  const areaVal = document.getElementById('map-area-val');
  if (areaBadge && areaVal) {
    areaBadge.classList.remove('hidden');
    areaVal.textContent = `${fieldArea.acres} Acres (${fieldArea.hectares} Ha)`;
  }

  activePolygon.bindPopup(`
    <div style="font-family:Inter,sans-serif;padding:6px;min-width:170px;">
      <strong style="color:#065f46;font-size:0.95rem;">🌾 Plotted Field Boundary</strong>
      <div style="font-size:0.85rem;margin-top:4px;color:#1e293b;">
        Area: <strong>${fieldArea.acres} Acres</strong> (${fieldArea.hectares} Ha)
      </div>
      <div style="font-size:0.75rem;color:#059669;margin-top:2px;">
        💡 Drag corner handles anytime to adjust boundary.
      </div>
    </div>
  `).openPopup();

  setDrawMode('select');
  updateFieldInfo();
}

function createEditableHandles(pts) {
  clearEditHandles();

  pts.forEach((pt, idx) => {
    const handleIcon = L.divIcon({
      className: 'polygon-handle-dot',
      html: `<div style="width:12px;height:12px;background:#ffffff;border:2.5px solid #059669;border-radius:50%;cursor:move;box-shadow:0 0 6px rgba(0,0,0,0.4);"></div>`,
      iconSize: [12, 12],
      iconAnchor: [6, 6],
    });

    const handle = L.marker(pt, { icon: handleIcon, draggable: true, zIndexOffset: 800 }).addTo(map);

    handle.on('drag', () => {
      const newPos = handle.getLatLng();
      polygonPoints[idx] = newPos;
      if (activePolygon) activePolygon.setLatLngs(polygonPoints);

      fieldArea = calculatePolygonArea(polygonPoints);
      const areaVal = document.getElementById('map-area-val');
      if (areaVal) areaVal.textContent = `${fieldArea.acres} Acres (${fieldArea.hectares} Ha)`;
      updateFieldInfo();
    });

    handle.on('dragend', () => {
      let sumLat = 0, sumLng = 0;
      for (const p of polygonPoints) {
        sumLat += p.lat;
        sumLng += p.lng;
      }
      updateLocation(sumLat / polygonPoints.length, sumLng / polygonPoints.length);
    });

    editHandles.push(handle);
  });
}

function clearEditHandles() {
  for (const h of editHandles) map.removeLayer(h);
  editHandles = [];
}

function clearPolygonDrawing() {
  for (const m of polygonMarkers) map.removeLayer(m);
  polygonMarkers = [];
  if (activePolyline) {
    map.removeLayer(activePolyline);
    activePolyline = null;
  }
  removeRubberband();
}

function clearPolygon() {
  clearPolygonDrawing();
  clearEditHandles();
  if (activePolygon && !osmFieldsLayerGroup.hasLayer(activePolygon)) {
    map.removeLayer(activePolygon);
    activePolygon = null;
  }
  polygonPoints = [];
  fieldArea = null;
  
  const areaBadge = document.getElementById('map-area-badge');
  if (areaBadge) areaBadge.classList.add('hidden');

  updateFieldInfo();
}

function calculatePolygonArea(latlngs) {
  const radius = 6378137;
  let area = 0;

  if (latlngs.length > 2) {
    for (let i = 0; i < latlngs.length; i++) {
      const p1 = latlngs[i];
      const p2 = latlngs[(i + 1) % latlngs.length];
      const dLng = (p2.lng - p1.lng) * (Math.PI / 180);
      const lat1 = p1.lat * (Math.PI / 180);
      const lat2 = p2.lat * (Math.PI / 180);
      area += dLng * (2 + Math.sin(lat1) + Math.sin(lat2));
    }
    area = Math.abs((area * radius * radius) / 2);
  }

  const hectares = Math.round((area / 10000) * 100) / 100;
  const acres = Math.round((area / 4046.86) * 100) / 100;

  return { sqMeters: Math.round(area), hectares, acres };
}

// === Reverse Geocoding ===
async function reverseGeocode(lat, lng) {
  const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  if (geocodeCache.has(key)) {
    return geocodeCache.get(key);
  }

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat.toFixed(4)}&lon=${lng.toFixed(4)}&zoom=14&addressdetails=1`;
    const resp = await fetch(url, { headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(6000) });
    if (resp.ok) {
      const data = await resp.json();
      if (data && data.address) {
        const addr = data.address;
        const village = addr.village || addr.suburb || addr.town || addr.city || addr.hamlet || addr.county || '';
        const state = addr.state || addr.region || '';
        const country = addr.country || '';

        const parts = [village, state, country].filter(p => p.length > 0);
        const name = parts.length > 0 ? parts.join(', ') : data.display_name.split(',').slice(0, 3).join(',');
        geocodeCache.set(key, name);
        return name;
      }
    }
  } catch (err) {
    console.warn('Reverse geocoding error:', err.message);
  }

  return `${lat.toFixed(4)}°N, ${lng.toFixed(4)}°E`;
}

// === Location Search with Smooth FlyTo ===
function initSearch() {
  const searchInput = document.getElementById('search-input');
  if (!searchInput) return;

  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      performSearch(searchInput.value);
    }
  });
}

async function performSearch(query) {
  if (!query || query.trim().length < 2) return;
  const locBadge = document.getElementById('loc-name-text');
  if (locBadge) locBadge.textContent = `Searching "${query}"...`;

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&addressdetails=1`;
    const resp = await fetch(url, { headers: { 'Accept': 'application/json' } });
    const data = await resp.json();
    if (data && data.length > 0) {
      const lat = parseFloat(data[0].lat);
      const lon = parseFloat(data[0].lon);
      selectedLocationName = data[0].display_name.split(',').slice(0, 3).join(', ');
      updateLocation(lat, lon, selectedLocationName);
      map.flyTo([lat, lon], 14, { duration: 1.2 });
    } else {
      alert(`Could not find "${query}". Please try another town, village, or district name.`);
      if (locBadge) locBadge.textContent = selectedLocationName;
    }
  } catch (err) {
    console.warn('Geocoding search failed:', err.message);
  }
}

// === Quick Demo Presets ===
function initPresets() {
  const presetPills = document.querySelectorAll('.preset-pill');
  presetPills.forEach(pill => {
    pill.addEventListener('click', () => {
      presetPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');

      const lat = parseFloat(pill.dataset.lat);
      const lng = parseFloat(pill.dataset.lng);
      const crop = pill.dataset.crop;
      const name = pill.dataset.name;

      if (crop) {
        document.getElementById('crop-select').value = crop;
        updateGrowthStage();
      }

      selectedLocationName = name;
      updateLocation(lat, lng, name);
      map.flyTo([lat, lng], 13, { duration: 1.2 });
    });
  });
}

async function updateLocation(lat, lng, explicitName = null) {
  selectedLat = Math.round(lat * 10000) / 10000;
  selectedLng = Math.round(lng * 10000) / 10000;

  const latInput = document.getElementById('lat-input');
  const lngInput = document.getElementById('lng-input');
  if (latInput) latInput.value = selectedLat;
  if (lngInput) lngInput.value = selectedLng;

  if (marker) {
    marker.setLatLng([selectedLat, selectedLng]);
    marker.setPopupContent(createPopup());
  } else {
    marker = L.marker([selectedLat, selectedLng], { draggable: true }).addTo(map);
    marker.on('dragend', () => {
      const pos = marker.getLatLng();
      updateLocation(pos.lat, pos.lng);
    });
  }

  const locBadge = document.getElementById('loc-name-text');
  if (explicitName) {
    selectedLocationName = explicitName;
    if (locBadge) locBadge.textContent = explicitName;
    if (marker) marker.setPopupContent(createPopup());
    updateFieldInfo();
  } else {
    if (locBadge) locBadge.textContent = 'Detecting location name...';
    reverseGeocode(selectedLat, selectedLng).then(name => {
      selectedLocationName = name;
      if (locBadge) locBadge.textContent = name;
      if (marker) marker.setPopupContent(createPopup());
      updateFieldInfo();
    });
  }

  // Update Live SoilGrids Profile
  updateSoilProfile(selectedLat, selectedLng);
  updateFieldInfo();
}

async function updateSoilProfile(lat, lng) {
  const soilSelect = document.getElementById('soil-select');
  const soilOverride = soilSelect ? soilSelect.value : 'auto';

  const badge = document.getElementById('soil-type-badge');
  if (badge) badge.textContent = 'Fetching Soil...';

  try {
    let soil;
    if (soilOverride !== 'auto') {
      soil = getSoilFromLookup(soilOverride);
      soil.source = `User-selected: ${soil.soilType}`;
    } else {
      soil = await fetchSoilData(lat, lng, 0.6, 0.5);
    }
    currentSoilData = soil;

    // Render Soil Profile Card
    if (badge) badge.textContent = `🌾 ${soil.soilType}`;
    
    const sourceTag = document.getElementById('soil-source-tag');
    if (sourceTag) sourceTag.textContent = soil.source;

    const sandBar = document.getElementById('st-sand-bar');
    const siltBar = document.getElementById('st-silt-bar');
    const clayBar = document.getElementById('st-clay-bar');

    if (sandBar) sandBar.style.width = `${soil.sand}%`;
    if (siltBar) siltBar.style.width = `${soil.silt}%`;
    if (clayBar) clayBar.style.width = `${soil.clay}%`;

    const sandVal = document.getElementById('st-sand-val');
    const siltVal = document.getElementById('st-silt-val');
    const clayVal = document.getElementById('st-clay-val');
    const socVal = document.getElementById('st-soc-val');

    if (sandVal) sandVal.textContent = `${soil.sand}%`;
    if (siltVal) siltVal.textContent = `${soil.silt}%`;
    if (clayVal) clayVal.textContent = `${soil.clay}%`;
    if (socVal) socVal.textContent = `${soil.organicMatter ? (soil.organicMatter / 1.724 * 10).toFixed(1) : '15.0'} g/kg`;

    const fcVal = document.getElementById('smm-fc');
    const pwpVal = document.getElementById('smm-pwp');
    const tawVal = document.getElementById('smm-taw');
    const rawVal = document.getElementById('smm-raw');

    if (fcVal) fcVal.textContent = `${Math.round(soil.fc * 1000)} mm/m (${Math.round(soil.fc * 100)}%)`;
    if (pwpVal) pwpVal.textContent = `${Math.round(soil.pwp * 1000)} mm/m (${Math.round(soil.pwp * 100)}%)`;
    if (tawVal) tawVal.textContent = `${soil.taw} mm`;
    if (rawVal) rawVal.textContent = `${soil.raw} mm`;

    // --- Render Soil Nutrients & Chemical Fertility Card ---
    if (soil.nutrients) {
      const nut = soil.nutrients;
      
      const overallBadge = document.getElementById('sn-overall-badge');
      if (overallBadge) {
        overallBadge.textContent = nut.phClass;
        overallBadge.style.color = nut.phBadgeColor;
      }

      // 1. Nitrogen
      const nVal = document.getElementById('sn-n-val');
      const nBadge = document.getElementById('sn-n-badge');
      const nBar = document.getElementById('sn-n-bar');
      if (nVal) nVal.textContent = `${nut.totalN} g/kg`;
      if (nBadge) {
        nBadge.textContent = nut.nStatus;
        nBadge.style.color = nut.nColor;
      }
      if (nBar) nBar.style.width = `${Math.min(100, Math.max(15, (nut.totalN / 2.5) * 100))}%`;

      // 2. pH
      const phVal = document.getElementById('sn-ph-val');
      const phBadge = document.getElementById('sn-ph-badge');
      const phBar = document.getElementById('sn-ph-bar');
      if (phVal) phVal.textContent = `${nut.ph} pH`;
      if (phBadge) {
        phBadge.textContent = `${nut.phClass} (${nut.ph})`;
        phBadge.style.color = nut.phBadgeColor;
      }
      if (phBar) phBar.style.width = `${Math.min(100, Math.max(15, (nut.ph / 10) * 100))}%`;

      // 3. CEC
      const cecVal = document.getElementById('sn-cec-val');
      const cecBadge = document.getElementById('sn-cec-badge');
      const cecBar = document.getElementById('sn-cec-bar');
      if (cecVal) cecVal.textContent = `${nut.cec} cmol/kg`;
      if (cecBadge) {
        cecBadge.textContent = nut.cecStatus;
        cecBadge.style.color = nut.cecColor;
      }
      if (cecBar) cecBar.style.width = `${Math.min(100, Math.max(15, (nut.cec / 30) * 100))}%`;

      // 4. C:N Ratio
      const cnVal = document.getElementById('sn-cn-val');
      const cnBadge = document.getElementById('sn-cn-badge');
      const cnBar = document.getElementById('sn-cn-bar');
      if (cnVal) cnVal.textContent = `${nut.cnRatio}`;
      if (cnBadge) {
        cnBadge.textContent = nut.cnRatio > 15 ? 'Slow Release' : nut.cnRatio < 10 ? 'Fast Release' : 'Balanced';
      }
      if (cnBar) cnBar.style.width = `${Math.min(100, Math.max(15, (nut.cnRatio / 20) * 100))}%`;

      // 5. Guidance
      const pText = document.getElementById('sn-p-text');
      const kText = document.getElementById('sn-k-text');
      const customAdvice = document.getElementById('sn-custom-advice');

      if (pText) pText.textContent = nut.pAvailability;
      if (kText) kText.textContent = nut.kRetention;
      if (customAdvice) customAdvice.textContent = nut.advice.join(' ');
    }

  } catch (err) {
    console.warn('Soil update failed:', err);
    if (badge) badge.textContent = 'Loam (Default)';
  }
}

function createPopup() {
  const areaText = fieldArea ? `<div style="color:#059669;font-weight:700;margin-top:2px;">Plot Size: ${fieldArea.acres} Acres</div>` : '';
  return `<div style="font-family:Inter,sans-serif;min-width:160px;">
    <div style="font-weight:700;color:#065f46;margin-bottom:2px;">📍 ${selectedLocationName}</div>
    <div style="font-size:0.8rem;color:#475569;">
      ${selectedLat}°N, ${selectedLng}°E
    </div>
    ${areaText}
  </div>`;
}

// === Form ===
function initForm() {
  document.getElementById('crop-select')?.addEventListener('change', () => {
    updateGrowthStage();
    updateFieldInfo();
  });
  document.getElementById('planting-date')?.addEventListener('change', () => {
    updateGrowthStage();
    updateFieldInfo();
  });
  document.getElementById('soil-select')?.addEventListener('change', () => {
    updateSoilProfile(selectedLat, selectedLng);
  });
  document.getElementById('add-irrigation')?.addEventListener('click', addIrrigationEvent);
  document.getElementById('analyze-btn')?.addEventListener('click', runAnalysis);
}

function updateGrowthStage() {
  const cropId = document.getElementById('crop-select').value;
  const plantingStr = document.getElementById('planting-date').value;

  if (!plantingStr) {
    document.getElementById('growth-stage-display').textContent = '—';
    return;
  }

  const plantingDate = new Date(plantingStr);
  const now = new Date();
  const stage = getCurrentGrowthStage(cropId, plantingDate, now);
  const crop = CROPS[cropId];

  const stageLabels = {
    initial: '🌱 Initial (Emergence)',
    development: '🌿 Development',
    mid_season: '🌾 Mid-Season',
    late_season: '🍂 Late Season',
  };

  const totalDuration = crop ? crop.totalDuration : 120;
  document.getElementById('growth-stage-display').textContent =
    `${stageLabels[stage.stage] || stage.stage} — Day ${stage.daysIntoSeason}/${totalDuration}`;
}

function updateFieldInfo() {
  const cropSelect = document.getElementById('crop-select');
  if (!cropSelect) return;
  const cropName = cropSelect.options[cropSelect.selectedIndex]?.text.replace(/[^\w\s()]/g, '').trim() || 'Wheat';
  const plantingStr = document.getElementById('planting-date')?.value;

  const cropLabel = document.getElementById('field-crop-label');
  if (cropLabel) cropLabel.textContent = cropName;

  const areaLabel = document.getElementById('field-area-label');
  if (areaLabel) areaLabel.textContent = fieldArea ? `${fieldArea.acres} Acres (${fieldArea.hectares} Ha)` : 'Standard Plot';

  const locLabel = document.getElementById('field-location-label');
  if (locLabel) {
    locLabel.textContent = selectedLocationName ? `${selectedLocationName} (${selectedLat}°N, ${selectedLng}°E)` : `${selectedLat}°N, ${selectedLng}°E`;
  }

  if (plantingStr) {
    const formatted = new Date(plantingStr).toLocaleDateString('en-IN', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
    const sowingDisplay = document.getElementById('sowing-date-display');
    if (sowingDisplay) sowingDisplay.textContent = formatted;
  }
}

function addIrrigationEvent() {
  const date = prompt('Irrigation date (YYYY-MM-DD):', new Date().toISOString().split('T')[0]);
  if (!date) return;
  const amount = prompt('Amount applied (mm):', '30');
  if (!amount || isNaN(amount)) return;

  irrigationEvents.push({ date, amount: parseFloat(amount) });
  renderIrrigationList();
}

function renderIrrigationList() {
  const list = document.getElementById('irrigation-list');
  if (!list) return;
  if (irrigationEvents.length === 0) {
    list.innerHTML = '<span class="irr-empty">No irrigation records added yet</span>';
    return;
  }
  list.innerHTML = irrigationEvents.map((e, i) => `
    <div class="irrigation-item">
      <span class="irr-date">${e.date}</span>
      <span class="irr-amount">${e.amount} mm</span>
      <button class="irr-remove" data-idx="${i}">×</button>
    </div>
  `).join('');

  list.querySelectorAll('.irr-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      irrigationEvents.splice(parseInt(btn.dataset.idx), 1);
      renderIrrigationList();
    });
  });
}

// === Disclaimer ===
function initDisclaimer() {
  const dismissed = localStorage.getItem('cognitia-disclaimer');
  if (!dismissed) {
    const modal = document.getElementById('disclaimer-modal');
    if (modal) modal.style.display = 'flex';
  }
  document.getElementById('disclaimer-accept')?.addEventListener('click', () => {
    const modal = document.getElementById('disclaimer-modal');
    if (modal) modal.style.display = 'none';
    localStorage.setItem('cognitia-disclaimer', 'true');
  });
}

// === Neon DB & Saved Fields Integration ===
function initNeonIntegration() {
  // Initialize Neon PostgreSQL table schema if connected
  initNeonSchema().catch(() => {});

  // Open Save Field Modal
  document.getElementById('save-field-btn')?.addEventListener('click', openSaveFieldModal);

  // Close Save Modal
  document.getElementById('close-save-modal')?.addEventListener('click', closeSaveFieldModal);
  document.getElementById('cancel-save-field')?.addEventListener('click', closeSaveFieldModal);

  // Confirm Save Field to Neon DB
  document.getElementById('confirm-save-field')?.addEventListener('click', handleConfirmSaveField);

  // Open My Fields Modal (from desktop top nav & mobile bottom nav)
  document.getElementById('nav-my-fields')?.addEventListener('click', (e) => {
    e.preventDefault();
    openMyFieldsModal();
  });
  document.getElementById('bnav-my-fields')?.addEventListener('click', (e) => {
    e.preventDefault();
    openMyFieldsModal();
  });

  // Close My Fields Modal
  document.getElementById('close-my-fields-modal')?.addEventListener('click', closeMyFieldsModal);

  // Draw New Plot from My Fields modal
  document.getElementById('btn-draw-new-plot')?.addEventListener('click', () => {
    closeMyFieldsModal();
    setDrawMode('polygon');
    showToast('✏️ Click on the satellite map to outline your field.', 'info');
  });
}

function openSaveFieldModal() {
  const modal = document.getElementById('save-field-modal');
  if (!modal) return;

  const cropSelect = document.getElementById('crop-select');
  const cropVal = cropSelect ? cropSelect.value : 'wheat';
  const plantingVal = document.getElementById('planting-date')?.value || new Date().toISOString().split('T')[0];
  const areaVal = fieldArea ? fieldArea.acres : 2.5;
  const soilVal = currentSoilData ? currentSoilData.soilType : 'Clay Loam';

  const defaultName = selectedLocationName
    ? `${selectedLocationName.split(',')[0]} Farm Plot`
    : `Field (${selectedLat.toFixed(2)}, ${selectedLng.toFixed(2)})`;

  const nameInput = document.getElementById('save-field-name');
  if (nameInput) nameInput.value = defaultName;

  const saveCropSelect = document.getElementById('save-crop-select');
  if (saveCropSelect) saveCropSelect.value = cropVal;

  const savePlantingInput = document.getElementById('save-planting-date');
  if (savePlantingInput) savePlantingInput.value = plantingVal;

  const saveAreaInput = document.getElementById('save-area-acres');
  if (saveAreaInput) saveAreaInput.value = areaVal;

  const saveSoilInput = document.getElementById('save-soil-type');
  if (saveSoilInput) saveSoilInput.value = soilVal;

  const saveCoordsInput = document.getElementById('save-coords-display');
  if (saveCoordsInput) saveCoordsInput.value = `${selectedLat}°N, ${selectedLng}°E`;

  modal.style.display = 'flex';
}

function closeSaveFieldModal() {
  const modal = document.getElementById('save-field-modal');
  if (modal) modal.style.display = 'none';
}

async function handleConfirmSaveField() {
  const confirmBtn = document.getElementById('confirm-save-field');
  const origText = confirmBtn ? confirmBtn.innerHTML : '';
  if (confirmBtn) {
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = '<span>⚡ Saving to Neon DB...</span>';
  }

  try {
    const name = document.getElementById('save-field-name')?.value || 'My Agricultural Plot';
    const crop = document.getElementById('save-crop-select')?.value || 'wheat';
    const plantingDate = document.getElementById('save-planting-date')?.value || new Date().toISOString().split('T')[0];
    const areaAcres = parseFloat(document.getElementById('save-area-acres')?.value) || (fieldArea ? fieldArea.acres : 2.5);
    const soilType = document.getElementById('save-soil-type')?.value || (currentSoilData ? currentSoilData.soilType : 'Clay Loam');

    const record = {
      id: `field_${Date.now()}`,
      name,
      crop,
      plantingDate,
      latitude: selectedLat,
      longitude: selectedLng,
      areaAcres,
      soilType,
      geometry: polygonPoints.length > 0 ? polygonPoints : null,
    };

    const saved = await saveFieldToAccount(record);
    closeSaveFieldModal();

    // Update current field label
    const fieldNameEl = document.querySelector('.field-name');
    if (fieldNameEl) {
      fieldNameEl.innerHTML = `${name} <button class="edit-icon" title="Rename">✏️</button>`;
    }

    showToast(`✅ "${name}" saved to Neon PostgreSQL Database! ⚡`, 'success');
  } catch (err) {
    console.error('Save field error:', err);
    showToast(`Error saving field: ${err.message}`, 'error');
  } finally {
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.innerHTML = origText;
    }
  }
}

async function openMyFieldsModal() {
  const modal = document.getElementById('my-fields-modal');
  if (!modal) return;
  modal.style.display = 'flex';

  const listContainer = document.getElementById('saved-fields-list');
  const countBadge = document.getElementById('saved-fields-count');
  if (listContainer) {
    listContainer.innerHTML = '<div style="text-align:center;padding:24px;color:#64748b;">⏳ Querying Neon Serverless PostgreSQL...</div>';
  }

  try {
    const fields = await getSavedFields();
    if (countBadge) {
      countBadge.textContent = `${fields.length} saved parcel${fields.length === 1 ? '' : 's'}`;
    }
    renderSavedFieldsList(fields);
  } catch (err) {
    console.error('Failed to get saved fields:', err);
    if (listContainer) {
      listContainer.innerHTML = `<div class="empty-fields-state">Failed to load saved fields: ${err.message}</div>`;
    }
  }
}

function closeMyFieldsModal() {
  const modal = document.getElementById('my-fields-modal');
  if (modal) modal.style.display = 'none';
}

function renderSavedFieldsList(fields) {
  const container = document.getElementById('saved-fields-list');
  if (!container) return;

  if (!fields || fields.length === 0) {
    container.innerHTML = `
      <div class="empty-fields-state">
        <div class="empty-fields-icon">🌾</div>
        <div style="font-weight:700;font-size:1rem;color:#1e293b;">No saved fields found</div>
        <p style="font-size:0.85rem;margin-top:4px;">Trace a boundary or pick an OSM parcel and click "Save Field".</p>
      </div>
    `;
    return;
  }

  const cropIcons = {
    wheat: '🌾', rice: '🌾', maize: '🌽', cotton: '🏵️',
    sugarcane: '🎋', soybean: '🫘', groundnut: '🥜',
  };

  container.innerHTML = fields.map(f => {
    const icon = cropIcons[f.crop] || '🌱';
    return `
      <div class="saved-field-card" data-id="${f.id}">
        <div class="sfc-main">
          <div class="sfc-header">
            <span class="sfc-title">${f.name}</span>
            <span class="sfc-crop-badge">${icon} ${f.crop}</span>
          </div>
          <div class="sfc-meta">
            <span>📐 <strong>${f.areaAcres || '—'} Acres</strong></span> ·
            <span>🧪 <strong>${f.soilType || 'SoilGrids'}</strong></span> ·
            <span>📅 Sown: ${f.plantingDate || '—'}</span>
          </div>
          <div class="sfc-coords">
            📍 ${Number(f.latitude).toFixed(4)}°N, ${Number(f.longitude).toFixed(4)}°E
          </div>
        </div>
        <div class="sfc-actions">
          <button class="sfc-btn-load" data-id="${f.id}">📍 Load & Analyze</button>
          <button class="sfc-btn-delete" data-id="${f.id}" title="Delete field">🗑️</button>
        </div>
      </div>
    `;
  }).join('');

  // Attach action listeners
  container.querySelectorAll('.sfc-btn-load').forEach(btn => {
    btn.addEventListener('click', () => {
      const fieldId = btn.dataset.id;
      const target = fields.find(f => f.id === fieldId);
      if (target) loadFieldToMap(target);
    });
  });

  container.querySelectorAll('.sfc-btn-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      const fieldId = btn.dataset.id;
      const target = fields.find(f => f.id === fieldId);
      if (confirm(`Are you sure you want to delete "${target?.name || 'this field'}"?`)) {
        await deleteSavedField(fieldId);
        showToast(`🗑️ Removed "${target?.name || 'field'}" from account.`, 'info');
        openMyFieldsModal(); // Refresh modal
      }
    });
  });
}

function loadFieldToMap(field) {
  closeMyFieldsModal();

  // 1. Update form inputs
  const cropSelect = document.getElementById('crop-select');
  if (cropSelect && field.crop) cropSelect.value = field.crop;

  const plantingInput = document.getElementById('planting-date');
  if (plantingInput && field.plantingDate) plantingInput.value = field.plantingDate;

  updateGrowthStage();

  // 2. Set field area
  fieldArea = {
    acres: field.areaAcres,
    hectares: Math.round((field.areaAcres * 0.404686) * 100) / 100,
    sqMeters: Math.round(field.areaAcres * 4046.86),
  };

  // 3. Clear previous polygon
  clearPolygon();
  clearOSMFields();

  // 4. If geometry exists, render polygon
  if (field.geometry && Array.isArray(field.geometry) && field.geometry.length > 2) {
    polygonPoints = field.geometry;
    activePolygon = L.polygon(polygonPoints, {
      color: '#059669',
      weight: 3.5,
      fillColor: '#10b981',
      fillOpacity: 0.35,
    }).addTo(map);

    createEditableHandles(polygonPoints);
  }

  // 5. Update location and fly
  selectedLocationName = field.name;
  updateLocation(field.latitude, field.longitude, field.name);
  map.flyTo([field.latitude, field.longitude], 15, { duration: 1.2 });

  // 6. Update field header name
  const fieldNameEl = document.querySelector('.field-name');
  if (fieldNameEl) {
    fieldNameEl.innerHTML = `${field.name} <button class="edit-icon" title="Rename">✏️</button>`;
  }

  showToast(`🌾 Loaded "${field.name}" onto map!`, 'success');
}

function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast-notification toast-${type}`;
  toast.innerHTML = `<span>${message}</span>`;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 350);
  }, 3800);
}

// === Analysis Pipeline ===
async function runAnalysis() {
  if (isAnalyzing) return;
  isAnalyzing = true;

  const analyzeBtn = document.getElementById('analyze-btn');
  if (analyzeBtn) {
    analyzeBtn.disabled = true;
    analyzeBtn.textContent = 'Analyzing...';
  }

  showLoading();

  try {
    const cropId = document.getElementById('crop-select').value;
    const plantingStr = document.getElementById('planting-date').value;
    const crop = CROPS[cropId];
    const today = new Date();

    if (!plantingStr) {
      alert('Please set a sowing/planting date.');
      resetButton();
      return;
    }

    const plantingDate = new Date(plantingStr);

    // Step 1: Weather (Open-Meteo Real API)
    updateLoadingStep('step-weather');
    const weatherResult = await fetchWeatherData(selectedLat, selectedLng, plantingStr, 7);
    await delay(250);

    // Step 2: Soil (ISRIC SoilGrids Real API)
    updateLoadingStep('step-soil');
    let soilData = currentSoilData;
    if (!soilData) {
      soilData = await fetchSoilData(selectedLat, selectedLng, 0.6, crop.depletionFraction);
    }
    await delay(250);

    // Step 3: Satellite (MODIS Vegetation Signal)
    updateLoadingStep('step-satellite');
    const endDate = today.toISOString().split('T')[0];
    const satelliteResult = await fetchSatelliteData(
      selectedLat, selectedLng, plantingStr, endDate, cropId, plantingDate
    );
    await delay(250);

    // Step 4: Physics Water Balance (FAO-56)
    updateLoadingStep('step-model');
    const wbResult = runWaterBalance({
      cropId, plantingDate,
      weatherData: weatherResult.data,
      irrigationEvents,
      fc: soilData.fc, pwp: soilData.pwp, saturation: soilData.saturation,
      depletionFraction: crop.depletionFraction,
      initialMoistureFraction: 0.85,
    });
    await delay(200);

    // Step 5: Cross-Validation
    updateLoadingStep('step-crossval');
    const crossVal = runCrossValidation({
      dailyResults: wbResult.daily,
      ndviData: satelliteResult.ndvi,
      cropId, plantingDate,
      isSyntheticNDVI: satelliteResult.isSynthetic,
    });
    await delay(200);

    // Step 6: Advisory & Yield Loss (FAO-33)
    updateLoadingStep('step-advisory');
    const yieldLoss = computeYieldLoss(cropId, wbResult.daily);
    const advisory = generateAdvisory({
      wbSummary: wbResult.summary,
      crossValidation: crossVal,
      yieldLoss, soilData, weatherResult, satelliteResult,
    });
    await delay(250);

    // Render Full Dashboard
    renderDashboard(advisory, wbResult, satelliteResult.ndvi, crossVal, yieldLoss, satelliteResult, {
      soilData,
      cropId,
      plantingDate,
      weatherData: weatherResult.data,
    });

  } catch (err) {
    console.error('Analysis failed:', err);
    alert('Analysis failed: ' + err.message);
    document.getElementById('loading-panel').style.display = 'none';
    document.getElementById('setup-panel').style.display = 'block';
  } finally {
    resetButton();
  }
}

function resetButton() {
  isAnalyzing = false;
  const btn = document.getElementById('analyze-btn');
  if (btn) {
    btn.disabled = false;
    btn.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
      Analyze Water Stress
    `;
  }
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// === Start ===
document.addEventListener('DOMContentLoaded', init);
