/**
 * Root-Zone Soil Water Balance Model
 * 
 * Reference:
 *   Allen, R.G., et al. (1998). FAO Irrigation & Drainage Paper 56 — Crop Evapotranspiration.
 *   Chapter 8: ETc under soil water stress conditions.
 * 
 * Daily water balance:
 *   θ(t) = θ(t-1) + P_eff(t) + I(t) - ETc(t) × Ks(t) - D(t)
 * 
 * Where:
 *   θ    = root-zone soil water content (mm)
 *   P_eff = effective rainfall
 *   I    = irrigation applied
 *   ETc  = crop evapotranspiration = ET₀ × Kc
 *   Ks   = stress coefficient (1 when θ > FC-RAW, linear reduction below)
 *   D    = deep drainage (θ exceeds FC)
 */

import { getKcForDay, getRootDepthForDay, CROPS } from './cropDatabase.js';
import { computeRAW } from './soilCharacteristics.js';

/**
 * Compute effective rainfall using USDA SCS method.
 * Accounts for runoff and deep percolation.
 * 
 * @param {number} rainfall - Daily rainfall (mm)
 * @param {number} currentMoisture - Current soil moisture (mm)
 * @param {number} fc - Field capacity in mm
 * @returns {number} Effective rainfall (mm)
 */
export function computeEffectiveRainfall(rainfall, currentMoisture, fc) {
  if (rainfall <= 0) return 0;

  // USDA SCS simplified method
  // For daily computation: effective = rainfall × factor
  // Factor decreases as soil fills toward FC
  const soilDeficit = Math.max(0, fc - currentMoisture);

  // Can't absorb more than the deficit
  let effective;
  if (rainfall <= 20) {
    // Light rain — high efficiency
    effective = rainfall * 0.85;
  } else if (rainfall <= 50) {
    // Moderate rain
    effective = rainfall * 0.75 - 2.5;
  } else {
    // Heavy rain — significant runoff
    effective = rainfall * 0.60 - 5.0;
  }

  effective = Math.max(0, effective);
  // Cannot exceed soil deficit (rest is runoff/drainage)
  return Math.min(effective, soilDeficit + 5); // +5mm buffer for immediate drainage
}

/**
 * Compute stress coefficient Ks (FAO-56 eq. 84).
 * Ks = 1 when depletion ≤ RAW (no stress)
 * Ks reduces linearly from 1 to 0 when depletion goes from RAW to TAW
 * 
 * @param {number} depletion - Current root zone depletion (mm) = FC(mm) - θ(mm)
 * @param {number} taw - Total Available Water (mm)
 * @param {number} raw - Readily Available Water (mm)
 * @returns {number} Stress coefficient (0-1)
 */
export function computeStressCoefficient(depletion, taw, raw) {
  if (taw <= 0) return 1;
  if (depletion <= raw) return 1;
  if (depletion >= taw) return 0;

  // Linear reduction (FAO-56 eq. 84)
  return (taw - depletion) / (taw - raw);
}

/**
 * Run daily water balance simulation.
 * 
 * @param {Object} params
 * @param {string} params.cropId - Crop identifier
 * @param {Date} params.plantingDate - Planting date
 * @param {{ date: string, precipitation: number, et0: number }[]} params.weatherData - Daily weather
 * @param {{ date: string, amount: number }[]} params.irrigationEvents - Irrigation records
 * @param {number} params.fc - Field capacity (m³/m³)
 * @param {number} params.pwp - Permanent wilting point (m³/m³)
 * @param {number} params.saturation - Saturation (m³/m³)
 * @param {number} params.depletionFraction - Crop depletion fraction p
 * @param {number} [params.initialMoistureFraction] - Starting moisture as fraction of FC (0-1), default 0.8
 * @returns {{ daily: DailyResult[], summary: SimulationSummary }}
 */
export function runWaterBalance(params) {
  const {
    cropId,
    plantingDate,
    weatherData,
    irrigationEvents = [],
    fc,
    pwp,
    saturation,
    depletionFraction,
    initialMoistureFraction = 0.8,
  } = params;

  const crop = CROPS[cropId];
  if (!crop || !weatherData || weatherData.length === 0) {
    return { daily: [], summary: createEmptySummary() };
  }

  // Create irrigation lookup (date string → amount mm)
  const irrigationMap = {};
  for (const event of irrigationEvents) {
    irrigationMap[event.date] = (irrigationMap[event.date] || 0) + event.amount;
  }

  const daily = [];
  let totalStressDays = 0;
  let totalETa = 0;
  let totalETc = 0;
  let cumulativeYieldImpact = {};

  for (let i = 0; i < weatherData.length; i++) {
    const w = weatherData[i];
    const currentDate = new Date(w.date);
    const daysIntoSeason = Math.floor(
      (currentDate - plantingDate) / (1000 * 60 * 60 * 24)
    );

    // Skip if before planting
    if (daysIntoSeason < 0) continue;

    // Get dynamic crop parameters for this day
    const rootDepth = getRootDepthForDay(cropId, daysIntoSeason);
    const kc = getKcForDay(cropId, daysIntoSeason);

    // Convert volumetric to mm for current root depth
    const fcMm = fc * rootDepth * 1000;
    const pwpMm = pwp * rootDepth * 1000;
    const satMm = saturation * rootDepth * 1000;
    const taw = fcMm - pwpMm;
    const raw = computeRAW(taw, depletionFraction);

    // Initialize soil moisture
    let theta;
    if (i === 0 || daily.length === 0) {
      theta = pwpMm + (fcMm - pwpMm) * initialMoistureFraction;
    } else {
      // Scale previous day's moisture to new root depth
      const prevResult = daily[daily.length - 1];
      const prevFraction =
        (prevResult.soilMoisture - prevResult.pwpMm) /
        Math.max(0.01, prevResult.fcMm - prevResult.pwpMm);
      theta = pwpMm + (fcMm - pwpMm) * Math.min(1, Math.max(0, prevFraction));
    }

    // Effective rainfall
    const pEff = computeEffectiveRainfall(w.precipitation || 0, theta, fcMm);

    // Irrigation
    const irrigation = irrigationMap[w.date] || 0;

    // Add water inputs
    theta += pEff + irrigation;

    // Deep drainage (excess above field capacity)
    let drainage = 0;
    if (theta > fcMm) {
      drainage = theta - fcMm;
      theta = fcMm;
    }

    // Compute depletion and stress
    const depletion = fcMm - theta;
    const ks = computeStressCoefficient(depletion, taw, raw);

    // Crop ET
    const etc = (w.et0 || 4.0) * kc;
    const eta = etc * ks; // Actual ET under stress

    // Remove ET from soil
    theta -= eta;
    theta = Math.max(pwpMm * 0.5, theta); // Don't go below half PWP (physical limit)

    // Track stress
    const isStressed = ks < 1.0;
    if (isStressed) totalStressDays++;
    totalETa += eta;
    totalETc += etc;

    // Water Balance Stress Index (0=no stress, 1=severe)
    const wbsi = 1 - Math.max(0, Math.min(1, (theta - pwpMm) / Math.max(0.01, fcMm - pwpMm)));

    // Determine current growth stage for tracking
    const stageInfo = getGrowthStageSimple(crop, daysIntoSeason);

    daily.push({
      date: w.date,
      daysIntoSeason,
      soilMoisture: theta,
      fcMm,
      pwpMm,
      satMm,
      taw,
      raw,
      rawThreshold: fcMm - raw, // θ below this = stress onset
      depletion: fcMm - theta,
      ks,
      kc,
      et0: w.et0 || 4.0,
      etc,
      eta,
      precipitation: w.precipitation || 0,
      effectiveRainfall: pEff,
      irrigation,
      drainage,
      rootDepth,
      wbsi,
      isStressed,
      growthStage: stageInfo.stage,
      isForecast: w.isForecast || false,
    });
  }

  // Compute summary
  const summary = computeSummary(daily, totalStressDays, totalETa, totalETc);

  return { daily, summary };
}

/**
 * Simple growth stage determination.
 */
function getGrowthStageSimple(crop, daysIntoSeason) {
  let cumDays = 0;
  const stages = ['initial', 'development', 'mid_season', 'late_season'];
  for (const stage of stages) {
    cumDays += crop.stageDuration[stage];
    if (daysIntoSeason < cumDays) return { stage };
  }
  return { stage: 'late_season' };
}

/**
 * Compute simulation summary.
 */
function computeSummary(daily, totalStressDays, totalETa, totalETc) {
  if (daily.length === 0) return createEmptySummary();

  const latest = daily[daily.length - 1];
  const etRatio = totalETc > 0 ? totalETa / totalETc : 1;

  // Find days until stress onset (forward projection)
  let daysToStress = null;
  const forecastDays = daily.filter((d) => d.isForecast);
  for (let i = 0; i < forecastDays.length; i++) {
    if (forecastDays[i].isStressed && !forecastDays[i > 0 ? i - 1 : 0].isStressed) {
      daysToStress = i;
      break;
    }
  }

  // If currently stressed, daysToStress = 0
  if (latest.isStressed) daysToStress = 0;

  // Recommended irrigation depth (mm) to bring to FC
  const irrigationNeeded = Math.max(0, latest.fcMm - latest.soilMoisture);

  return {
    currentMoisture: latest.soilMoisture,
    currentWBSI: latest.wbsi,
    currentKs: latest.ks,
    currentStage: latest.growthStage,
    isCurrentlyStressed: latest.isStressed,
    totalStressDays,
    seasonETRatio: etRatio,
    daysToStress,
    irrigationNeeded: Math.round(irrigationNeeded * 10) / 10,
    fc: latest.fcMm,
    pwp: latest.pwpMm,
    rawThreshold: latest.rawThreshold,
    totalDays: daily.length,
  };
}

function createEmptySummary() {
  return {
    currentMoisture: 0,
    currentWBSI: 0,
    currentKs: 1,
    currentStage: 'unknown',
    isCurrentlyStressed: false,
    totalStressDays: 0,
    seasonETRatio: 1,
    daysToStress: null,
    irrigationNeeded: 0,
    fc: 0,
    pwp: 0,
    rawThreshold: 0,
    totalDays: 0,
  };
}
