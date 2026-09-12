/**
 * Cross-Validation Module — Two-Source Stress Verification
 * 
 * Performs genuine independent cross-validation between:
 * 1. Physics-based water-balance stress predictions (WBSI)
 * 2. Satellite-derived vegetation health signals (NDVI anomaly)
 * 
 * This is NOT a fusion/averaging approach — it's a true two-source check
 * that flags agreement/disagreement between independent data sources.
 */

import { getExpectedNDVI } from './cropDatabase.js';

/**
 * Cross-validation agreement categories.
 */
export const AGREEMENT = {
  CONFIRMED_SAFE: 'confirmed_safe',
  CONFIRMED_STRESS: 'confirmed_stress',
  WB_STRESS_ONLY: 'wb_stress_only',
  NDVI_DECLINE_ONLY: 'ndvi_decline_only',
  INSUFFICIENT_DATA: 'insufficient_data',
};

/**
 * Run cross-validation between water balance and satellite data.
 * 
 * @param {Object} params
 * @param {Array} params.dailyResults - Water balance daily results
 * @param {Array} params.ndviData - Satellite NDVI observations
 * @param {string} params.cropId - Crop identifier
 * @param {Date} params.plantingDate - Planting date
 * @param {boolean} params.isSyntheticNDVI - Whether NDVI is model-simulated
 * @returns {CrossValidationResult}
 */
export function runCrossValidation({
  dailyResults,
  ndviData,
  cropId,
  plantingDate,
  isSyntheticNDVI,
}) {
  const result = {
    agreement: AGREEMENT.INSUFFICIENT_DATA,
    confidenceScore: 0,
    confidenceLevel: 'LOW',
    wbStressIndex: 0,
    ndviAnomaly: 0,
    ndviTrend: 'unknown',
    details: [],
    warnings: [],
    matrix: null,
  };

  if (!dailyResults || dailyResults.length === 0) {
    result.warnings.push('No water balance data available.');
    return result;
  }

  // === Source 1: Water Balance Stress Index ===
  const recentDays = dailyResults.slice(-14); // Last 14 days
  const avgWBSI =
    recentDays.reduce((s, d) => s + d.wbsi, 0) / recentDays.length;
  const recentStressDays = recentDays.filter((d) => d.isStressed).length;

  result.wbStressIndex = Math.round(avgWBSI * 100) / 100;

  const wbStressed = avgWBSI > 0.3 || recentStressDays > 3;

  // === Source 2: NDVI Anomaly ===
  let ndviDeclining = false;
  let ndviAnomalyValue = 0;

  if (ndviData && ndviData.length >= 2) {
    // Compare most recent observations to expected
    const recentNDVI = ndviData.slice(-3);
    const planting = new Date(plantingDate);

    let totalAnomaly = 0;
    let count = 0;

    for (const obs of recentNDVI) {
      const obsDate = new Date(obs.date);
      const daysIntoSeason = Math.floor(
        (obsDate - planting) / (1000 * 60 * 60 * 24)
      );

      if (daysIntoSeason > 0) {
        const expected = getExpectedNDVI(cropId, daysIntoSeason);
        const anomaly = (obs.ndvi - expected) / Math.max(0.1, expected);
        totalAnomaly += anomaly;
        count++;
      }
    }

    ndviAnomalyValue = count > 0 ? totalAnomaly / count : 0;
    result.ndviAnomaly = Math.round(ndviAnomalyValue * 100) / 100;

    // Check trend (is NDVI declining over recent observations?)
    if (recentNDVI.length >= 2) {
      const first = recentNDVI[0].ndvi;
      const last = recentNDVI[recentNDVI.length - 1].ndvi;
      const trendSlope = last - first;

      if (trendSlope < -0.05) {
        result.ndviTrend = 'declining';
        ndviDeclining = true;
      } else if (trendSlope > 0.05) {
        result.ndviTrend = 'improving';
      } else {
        result.ndviTrend = 'stable';
      }
    }

    // NDVI anomaly < -15% → declining
    if (ndviAnomalyValue < -0.15) {
      ndviDeclining = true;
    }
  } else {
    result.warnings.push('Insufficient NDVI data for trend analysis.');
  }

  // === Cross-Validation Agreement Matrix ===
  if (wbStressed && ndviDeclining) {
    result.agreement = AGREEMENT.CONFIRMED_STRESS;
    result.details.push(
      'Both water balance model AND satellite vegetation signals indicate stress.',
      'High confidence in water stress assessment.'
    );
  } else if (!wbStressed && !ndviDeclining) {
    result.agreement = AGREEMENT.CONFIRMED_SAFE;
    result.details.push(
      'Both water balance model AND satellite signals show healthy conditions.',
      'Crop water status appears adequate.'
    );
  } else if (wbStressed && !ndviDeclining) {
    result.agreement = AGREEMENT.WB_STRESS_ONLY;
    result.details.push(
      'Water balance model predicts stress, but satellite NDVI shows normal vegetation.',
      'Possible explanations: recent irrigation not recorded, deep root water access,',
      'or stress has not yet manifested in canopy (lag effect).',
      'Recommendation: Verify irrigation records and monitor closely.'
    );
  } else if (!wbStressed && ndviDeclining) {
    result.agreement = AGREEMENT.NDVI_DECLINE_ONLY;
    result.details.push(
      'Satellite NDVI declining, but water balance model shows adequate moisture.',
      'Possible non-water causes: pest/disease, nutrient deficiency, mechanical damage.',
      'Recommendation: Field inspection advised — stress may not be water-related.'
    );
  }

  // === Confidence Score (0-100) ===
  let confidence = 50; // Base

  // Data quality bonuses
  if (dailyResults.length >= 30) confidence += 10;
  if (dailyResults.length >= 60) confidence += 5;
  if (ndviData && ndviData.length >= 3) confidence += 10;
  if (ndviData && ndviData.length >= 6) confidence += 5;

  // Agreement bonus
  if (
    result.agreement === AGREEMENT.CONFIRMED_SAFE ||
    result.agreement === AGREEMENT.CONFIRMED_STRESS
  ) {
    confidence += 15; // Sources agree → higher confidence
  }

  // Synthetic data penalty
  if (isSyntheticNDVI) {
    confidence -= 25;
    result.warnings.push(
      'NDVI data is model-simulated, not satellite-observed.',
      'Cross-validation is significantly less reliable.'
    );
  }

  // Disagreement penalty
  if (
    result.agreement === AGREEMENT.WB_STRESS_ONLY ||
    result.agreement === AGREEMENT.NDVI_DECLINE_ONLY
  ) {
    confidence -= 10;
    result.warnings.push(
      'Data sources disagree — recommendation has reduced confidence.'
    );
  }

  confidence = Math.max(5, Math.min(95, confidence));
  result.confidenceScore = confidence;

  if (confidence >= 70) {
    result.confidenceLevel = 'HIGH';
  } else if (confidence >= 40) {
    result.confidenceLevel = 'MEDIUM';
  } else {
    result.confidenceLevel = 'LOW';
  }

  // Build matrix for display
  result.matrix = {
    wbStressed,
    ndviDeclining,
    ndviObservations: ndviData ? ndviData.length : 0,
    wbDataDays: dailyResults.length,
    isSyntheticNDVI,
  };

  return result;
}
