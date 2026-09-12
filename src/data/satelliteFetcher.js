/**
 * Satellite Data Fetcher — ORNL DAAC TESViS (MODIS) REST API
 * 
 * Fetches NDVI data from MODIS satellite products via the TESViS web service.
 * Product: MOD13Q1 (16-day 250m NDVI)
 * 
 * API: https://modis.ornl.gov/rst/api/v1/
 * No API key required.
 * 
 * Falls back to synthetic crop-based NDVI curves when API is unavailable.
 */

import { getExpectedNDVI } from '../engine/cropDatabase.js';

const TESVIS_BASE = 'https://modis.ornl.gov/rst/api/v1';

/**
 * Fetch NDVI time series from MODIS TESViS API.
 * 
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @param {string} cropId - Crop identifier (for fallback)
 * @param {Date} plantingDate - Planting date (for fallback)
 * @returns {Promise<SatelliteResult>}
 */
export async function fetchSatelliteData(lat, lng, startDate, endDate, cropId, plantingDate) {
  try {
    const ndviData = await fetchMODISNDVI(lat, lng, startDate, endDate);

    if (ndviData.length > 0) {
      return {
        ndvi: ndviData,
        source: 'MODIS MOD13Q1 via ORNL DAAC TESViS',
        isSynthetic: false,
        warnings: [],
        productInfo: 'MOD13Q1 — 16-day 250m Vegetation Index (NDVI)',
      };
    }

    throw new Error('No NDVI data returned');
  } catch (err) {
    console.warn('MODIS TESViS API failed:', err.message);
    return generateSyntheticNDVI(cropId, plantingDate, startDate, endDate);
  }
}

/**
 * Fetch MODIS NDVI from TESViS REST API.
 */
async function fetchMODISNDVI(lat, lng, startDate, endDate) {
  // Convert dates to MODIS day-of-year format (AYYYYDDD)
  const modisStart = dateToModisFormat(startDate);
  const modisEnd = dateToModisFormat(endDate);

  const url = `${TESVIS_BASE}/MOD13Q1/subset?` +
    `latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}` +
    `&band=250m_16_days_NDVI` +
    `&startDate=${modisStart}&endDate=${modisEnd}` +
    `&kmAboveBelow=0&kmLeftRight=0`;

  const resp = await fetch(url, {
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(30000), // 30s timeout (MODIS can be slow)
  });

  if (!resp.ok) throw new Error(`TESViS API ${resp.status}`);

  const json = await resp.json();
  return parseTESViSResponse(json);
}

/**
 * Parse TESViS NDVI response.
 */
function parseTESViSResponse(json) {
  const results = [];

  if (json.subset) {
    for (const entry of json.subset) {
      const date = modisToISODate(entry.calendar_date || entry.modis_date);
      const ndviRaw = entry.data?.[0]; // Center pixel

      if (date && ndviRaw != null) {
        // MODIS NDVI is scaled by 10000
        const ndvi = ndviRaw / 10000;

        // Filter out cloud/water/invalid pixels (NDVI < -0.1 or > 1.0)
        if (ndvi >= -0.1 && ndvi <= 1.0) {
          results.push({
            date,
            ndvi: Math.round(ndvi * 1000) / 1000,
            quality: ndvi > 0.1 ? 'good' : 'suspect',
          });
        }
      }
    }
  }

  return results;
}

/**
 * Generate synthetic NDVI curve based on crop growth stage model.
 * Explicitly flagged as synthetic data.
 */
function generateSyntheticNDVI(cropId, plantingDate, startDate, endDate) {
  const data = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  const planting = new Date(plantingDate);

  // Generate 16-day interval NDVI (matching MODIS temporal resolution)
  let current = new Date(start);
  while (current <= end) {
    const daysIntoSeason = Math.floor(
      (current - planting) / (1000 * 60 * 60 * 24)
    );

    if (daysIntoSeason >= 0) {
      const expectedNDVI = getExpectedNDVI(cropId, daysIntoSeason);

      // Add small random variation (±5%)
      const variation = 0.95 + Math.random() * 0.10;
      const ndvi = Math.round(expectedNDVI * variation * 1000) / 1000;

      data.push({
        date: current.toISOString().split('T')[0],
        ndvi: Math.max(0.05, Math.min(0.95, ndvi)),
        quality: 'synthetic',
      });
    }

    // 16-day step (MODIS temporal resolution)
    current.setDate(current.getDate() + 16);
  }

  return {
    ndvi: data,
    source: 'Synthetic (crop model-based)',
    isSynthetic: true,
    warnings: [
      '⚠️ SIMULATED DATA: Satellite data unavailable.',
      'NDVI values are model-estimated, not observed.',
      'Cross-validation reliability is significantly reduced.',
    ],
    productInfo: 'Synthetic NDVI based on FAO crop growth model',
  };
}

/**
 * Convert YYYY-MM-DD to MODIS date format (AYYYYDDD).
 */
function dateToModisFormat(dateStr) {
  const d = new Date(dateStr);
  const year = d.getFullYear();
  const startOfYear = new Date(year, 0, 1);
  const dayOfYear = Math.floor((d - startOfYear) / (1000 * 60 * 60 * 24)) + 1;
  return `A${year}${String(dayOfYear).padStart(3, '0')}`;
}

/**
 * Convert MODIS date or calendar date to ISO format.
 */
function modisToISODate(dateStr) {
  if (!dateStr) return null;

  // If already in ISO format
  if (dateStr.includes('-')) return dateStr.split('T')[0];

  // MODIS format: AYYYYDDD
  if (dateStr.startsWith('A')) {
    const year = parseInt(dateStr.substring(1, 5));
    const doy = parseInt(dateStr.substring(5));
    const d = new Date(year, 0, doy);
    return d.toISOString().split('T')[0];
  }

  return dateStr;
}
