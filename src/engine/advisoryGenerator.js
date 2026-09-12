/**
 * Advisory Generator — Actionable Farmer-Facing Recommendations
 * 
 * Synthesizes water balance, cross-validation, and yield-loss results
 * into clear, actionable advisories with honest confidence flagging.
 */

import { AGREEMENT } from './crossValidation.js';

/**
 * Advisory status levels.
 */
export const ADVISORY_STATUS = {
  IRRIGATE_NOW: 'irrigate_now',
  MONITOR_CLOSELY: 'monitor_closely',
  SAFE_TO_WAIT: 'safe_to_wait',
  NO_ACTION_NEEDED: 'no_action_needed',
  PAST_HARVEST: 'past_harvest',
};

/**
 * Generate actionable advisory from analysis results.
 * 
 * @param {Object} params
 * @param {Object} params.wbSummary - Water balance simulation summary
 * @param {Object} params.crossValidation - Cross-validation result
 * @param {Object} params.yieldLoss - Yield-loss estimation
 * @param {Object} params.soilData - Soil data with source info
 * @param {Object} params.weatherResult - Weather data with warnings
 * @param {Object} params.satelliteResult - Satellite data with warnings
 * @returns {Advisory}
 */
export function generateAdvisory({
  wbSummary,
  crossValidation,
  yieldLoss,
  soilData,
  weatherResult,
  satelliteResult,
}) {
  const advisory = {
    status: ADVISORY_STATUS.NO_ACTION_NEEDED,
    statusLabel: '',
    statusDescription: '',
    statusColor: '',
    irrigationAdvice: '',
    irrigationDepth: 0,
    yieldLossPercent: 0,
    daysToStress: null,
    confidence: 'MEDIUM',
    confidenceScore: 50,
    dataQuality: [],
    warnings: [],
    disclaimers: [],
    timestamp: new Date().toISOString(),
  };

  // === Determine Status ===
  const isStressed = wbSummary.isCurrentlyStressed;
  const wbsi = wbSummary.currentWBSI;
  const daysToStress = wbSummary.daysToStress;
  const cvAgreement = crossValidation.agreement;

  if (isStressed && cvAgreement === AGREEMENT.CONFIRMED_STRESS) {
    advisory.status = ADVISORY_STATUS.IRRIGATE_NOW;
    advisory.statusLabel = '🔴 IRRIGATE NOW';
    advisory.statusDescription =
      'Both soil water balance and satellite data confirm water stress. Immediate irrigation is recommended to prevent yield loss.';
    advisory.statusColor = '#ef4444';
  } else if (isStressed || wbsi > 0.4) {
    advisory.status = ADVISORY_STATUS.IRRIGATE_NOW;
    advisory.statusLabel = '🔴 IRRIGATE NOW';
    advisory.statusDescription =
      'Soil moisture has dropped below the readily available water threshold. Crop is experiencing water stress.';
    advisory.statusColor = '#ef4444';
  } else if (daysToStress !== null && daysToStress <= 3) {
    advisory.status = ADVISORY_STATUS.MONITOR_CLOSELY;
    advisory.statusLabel = '🟡 MONITOR CLOSELY';
    advisory.statusDescription =
      `Stress onset projected within ${daysToStress} day${daysToStress !== 1 ? 's' : ''}. Plan irrigation soon if no rainfall is expected.`;
    advisory.statusColor = '#f59e0b';
  } else if (daysToStress !== null && daysToStress <= 7) {
    advisory.status = ADVISORY_STATUS.SAFE_TO_WAIT;
    advisory.statusLabel = '🟢 SAFE TO WAIT';
    advisory.statusDescription =
      `Soil moisture is adequate. Stress not expected for ~${daysToStress} days based on current forecast.`;
    advisory.statusColor = '#10b981';
  } else {
    advisory.status = ADVISORY_STATUS.NO_ACTION_NEEDED;
    advisory.statusLabel = '✅ NO ACTION NEEDED';
    advisory.statusDescription =
      'Soil moisture is well above stress thresholds. No irrigation needed at this time.';
    advisory.statusColor = '#06b6d4';
  }

  // === Handle NDVI-only decline (non-water stress) ===
  if (cvAgreement === AGREEMENT.NDVI_DECLINE_ONLY) {
    advisory.warnings.push(
      '⚠️ Satellite data shows vegetation decline, but soil moisture appears adequate. ' +
        'Possible pest, disease, or nutrient stress — field inspection recommended.'
    );
  }

  // === Handle WB-only stress (possible unrecorded irrigation) ===
  if (cvAgreement === AGREEMENT.WB_STRESS_ONLY) {
    advisory.warnings.push(
      '⚠️ Water balance predicts stress, but satellite vegetation looks healthy. ' +
        'Please verify: has the plot been irrigated recently? If so, add irrigation records for better accuracy.'
    );
  }

  // === Irrigation recommendation ===
  advisory.irrigationDepth = wbSummary.irrigationNeeded;
  if (advisory.irrigationDepth > 0) {
    const grossDrip = Math.round((advisory.irrigationDepth / 0.90) * 10) / 10;
    const grossFlood = Math.round((advisory.irrigationDepth / 0.65) * 10) / 10;
    advisory.irrigationAdvice =
      `Net root-zone deficit: ${advisory.irrigationDepth} mm. Recommended gross application: ~${grossDrip} mm (Drip @ 90% eff.) or ~${grossFlood} mm (Surface/Flood @ 65% eff.) to restore field capacity.`;
  } else {
    advisory.irrigationAdvice = 'No irrigation needed — root-zone soil moisture is at or above field capacity.';
  }

  // === Yield loss ===
  advisory.yieldLossPercent = yieldLoss.totalYieldLoss;
  advisory.daysToStress = daysToStress;

  // === Confidence ===
  advisory.confidenceScore = crossValidation.confidenceScore;
  advisory.confidence = crossValidation.confidenceLevel;

  // === Data Quality Tracking ===
  advisory.dataQuality = buildDataQuality(
    soilData,
    weatherResult,
    satelliteResult,
    crossValidation
  );

  // === Collect all warnings ===
  if (weatherResult.warnings) {
    advisory.warnings.push(...weatherResult.warnings);
  }
  if (soilData.warnings) {
    advisory.warnings.push(...soilData.warnings);
  }
  if (satelliteResult.warnings) {
    advisory.warnings.push(...satelliteResult.warnings);
  }
  if (crossValidation.warnings) {
    advisory.warnings.push(...crossValidation.warnings);
  }
  if (yieldLoss.confidenceNote) {
    advisory.warnings.push(yieldLoss.confidenceNote);
  }

  // === Mandatory Disclaimers ===
  advisory.disclaimers = [
    'This tool provides screening-level advisory estimates based on public weather, soil, and satellite data.',
    'It is NOT a substitute for field-level agronomic assessment or professional consultation.',
    'Recommendations should be validated against on-ground conditions before taking action.',
    'Data accuracy varies by location, season, and data source availability.',
    'Yield-loss estimates are indicative and based on FAO generalized crop response models.',
  ];

  return advisory;
}

/**
 * Build data quality summary for transparency.
 */
function buildDataQuality(soilData, weatherResult, satelliteResult, crossValidation) {
  const items = [];

  // Weather
  items.push({
    source: 'Weather Data',
    provider: weatherResult.source || 'Open-Meteo',
    status: weatherResult.warnings?.length > 0 ? 'partial' : 'good',
    icon: weatherResult.warnings?.length > 0 ? '⚠️' : '✅',
    detail: weatherResult.warnings?.length > 0
      ? 'Some data from fallback sources'
      : 'Historical + 16-day forecast available',
  });

  // Soil
  items.push({
    source: 'Soil Data',
    provider: soilData.source || 'ISRIC SoilGrids',
    status: soilData.isLookup ? 'fallback' : 'good',
    icon: soilData.isLookup ? '⚠️' : '✅',
    detail: soilData.isLookup
      ? 'Using lookup table — select soil type for better accuracy'
      : `${soilData.soilType} (Sand: ${soilData.sand}%, Clay: ${soilData.clay}%)`,
  });

  // Satellite
  items.push({
    source: 'Satellite (NDVI)',
    provider: satelliteResult.source || 'MODIS TESViS',
    status: satelliteResult.isSynthetic ? 'simulated' : 'good',
    icon: satelliteResult.isSynthetic ? '🔴' : '✅',
    detail: satelliteResult.isSynthetic
      ? 'SIMULATED — Satellite data unavailable, using crop model estimates'
      : `${satelliteResult.ndvi?.length || 0} observations from MODIS MOD13Q1`,
  });

  // Cross-Validation
  items.push({
    source: 'Cross-Validation',
    provider: 'Two-Source Check',
    status: crossValidation.confidenceLevel === 'HIGH' ? 'good' : crossValidation.confidenceLevel === 'MEDIUM' ? 'partial' : 'low',
    icon: crossValidation.confidenceLevel === 'HIGH' ? '✅' : crossValidation.confidenceLevel === 'MEDIUM' ? '⚠️' : '🔴',
    detail: `Confidence: ${crossValidation.confidenceScore}% — ${formatAgreement(crossValidation.agreement)}`,
  });

  return items;
}

function formatAgreement(agreement) {
  const labels = {
    [AGREEMENT.CONFIRMED_SAFE]: 'Sources agree — no stress',
    [AGREEMENT.CONFIRMED_STRESS]: 'Sources agree — stress confirmed',
    [AGREEMENT.WB_STRESS_ONLY]: 'Sources disagree — WB stress, NDVI normal',
    [AGREEMENT.NDVI_DECLINE_ONLY]: 'Sources disagree — NDVI declining, WB normal',
    [AGREEMENT.INSUFFICIENT_DATA]: 'Insufficient data for cross-validation',
  };
  return labels[agreement] || 'Unknown';
}
