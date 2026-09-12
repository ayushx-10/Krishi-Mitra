/**
 * Yield-Loss Estimation — FAO Irrigation & Drainage Paper 33
 * 
 * Reference:
 *   Doorenbos, J. & Kassam, A.H. (1979). Yield Response to Water.
 *   FAO Irrigation and Drainage Paper 33. Rome: FAO.
 * 
 * Core equation:
 *   (1 - Ya/Ym) = Ky × (1 - ETa/ETc)
 * 
 * Where:
 *   Ya = Actual yield
 *   Ym = Maximum (potential) yield
 *   Ky = Yield response factor (crop & stage specific)
 *   ETa = Actual evapotranspiration (under stress)
 *   ETc = Potential crop evapotranspiration
 */

import { CROPS, GROWTH_STAGES } from './cropDatabase.js';

/**
 * Compute yield-loss percentage from water balance simulation results.
 * 
 * @param {string} cropId - Crop identifier
 * @param {Array} dailyResults - Daily water balance results from runWaterBalance()
 * @returns {{ totalYieldLoss: number, stageBreakdown: Object[], confidenceNote: string }}
 */
export function computeYieldLoss(cropId, dailyResults) {
  const crop = CROPS[cropId];
  if (!crop || !dailyResults || dailyResults.length === 0) {
    return {
      totalYieldLoss: 0,
      stageBreakdown: [],
      confidenceNote: 'Insufficient data for yield-loss estimation.',
    };
  }

  const stages = [
    GROWTH_STAGES.INITIAL,
    GROWTH_STAGES.DEVELOPMENT,
    GROWTH_STAGES.MID_SEASON,
    GROWTH_STAGES.LATE_SEASON,
  ];

  // Group daily results by growth stage
  const stageData = {};
  for (const stage of stages) {
    stageData[stage] = { totalETa: 0, totalETc: 0, stressDays: 0, totalDays: 0 };
  }

  for (const day of dailyResults) {
    const stage = day.growthStage;
    if (stageData[stage]) {
      stageData[stage].totalETa += day.eta;
      stageData[stage].totalETc += day.etc;
      stageData[stage].totalDays++;
      if (day.isStressed) stageData[stage].stressDays++;
    }
  }

  // Compute per-stage yield loss using multiplicative approach
  // Ya/Ym = Π (1 - Ky_i × (1 - ETa_i/ETc_i)) for each stage i
  let yieldRatio = 1.0;
  const stageBreakdown = [];

  for (const stage of stages) {
    const sd = stageData[stage];
    const ky = crop.ky[stage] || 0;

    let etRatio = 1;
    if (sd.totalETc > 0) {
      etRatio = sd.totalETa / sd.totalETc;
    }

    // Clamp ET ratio
    etRatio = Math.max(0, Math.min(1, etRatio));

    const stageYieldReduction = ky * (1 - etRatio);
    const stageYieldFactor = Math.max(0, 1 - stageYieldReduction);

    yieldRatio *= stageYieldFactor;

    stageBreakdown.push({
      stage,
      stageName: formatStageName(stage),
      ky,
      etRatio: Math.round(etRatio * 1000) / 1000,
      yieldReduction: Math.round(stageYieldReduction * 1000) / 10,
      stressDays: sd.stressDays,
      totalDays: sd.totalDays,
      hasFutureData: dailyResults.some(
        (d) => d.growthStage === stage && d.isForecast
      ),
    });
  }

  const totalYieldLoss = Math.round((1 - yieldRatio) * 1000) / 10;

  // Confidence assessment
  const hasForecastStress = stageBreakdown.some(
    (s) => s.hasFutureData && s.stressDays > 0
  );
  const coveredStages = stageBreakdown.filter((s) => s.totalDays > 0).length;

  let confidenceNote = '';
  if (coveredStages < stages.length) {
    confidenceNote +=
      `Only ${coveredStages}/${stages.length} growth stages have data. `;
  }
  if (hasForecastStress) {
    confidenceNote +=
      'Includes projected forecast data — actual conditions may differ. ';
  }
  if (totalYieldLoss === 0) {
    confidenceNote += 'No significant water stress detected in available data.';
  }

  return {
    totalYieldLoss: Math.max(0, Math.min(100, totalYieldLoss)),
    stageBreakdown,
    confidenceNote: confidenceNote || 'Based on observed and forecast weather data.',
    yieldRatio: Math.round(yieldRatio * 1000) / 10,
  };
}

/**
 * Compute projected yield loss if NO irrigation is applied for the next N days.
 * Uses the last daily result as starting point and projects forward with forecast weather.
 * 
 * @param {string} cropId 
 * @param {Array} dailyResults - Full daily results including forecast
 * @returns {{ withIrrigation: number, withoutIrrigation: number, difference: number }}
 */
export function computeProjectedYieldLossComparison(cropId, dailyResults) {
  // Current state yield loss (with whatever irrigation is planned)
  const current = computeYieldLoss(cropId, dailyResults);

  // Simulate "no irrigation" scenario by zeroing out future irrigation
  const noIrrigationResults = dailyResults.map((d) => {
    if (d.isForecast) {
      // Recalculate without irrigation — approximate by increasing stress
      const adjustedKs = Math.max(0, d.ks - (d.irrigation > 0 ? 0.2 : 0));
      return {
        ...d,
        irrigation: 0,
        ks: adjustedKs,
        eta: d.etc * adjustedKs,
        isStressed: adjustedKs < 1,
      };
    }
    return d;
  });

  const projected = computeYieldLoss(cropId, noIrrigationResults);

  return {
    withIrrigation: current.totalYieldLoss,
    withoutIrrigation: projected.totalYieldLoss,
    difference: Math.round((projected.totalYieldLoss - current.totalYieldLoss) * 10) / 10,
  };
}

function formatStageName(stage) {
  const names = {
    initial: 'Initial (Emergence)',
    development: 'Development (Vegetative)',
    mid_season: 'Mid-Season (Reproductive)',
    late_season: 'Late Season (Maturation)',
  };
  return names[stage] || stage;
}
