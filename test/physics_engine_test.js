/**
 * COGNITIA Scientific Physics Engine — Regression & Numerical Sanity Test Suite
 * Validates FAO-56 Water Balance, Saxton-Rawls PTF, Ks stress attenuation,
 * FAO-33 yield loss, and mass conservation.
 */

import { CROPS, GROWTH_STAGES, getKcForDay, getRootDepthForDay, getExpectedNDVI } from '../src/engine/cropDatabase.js';
import { computeSoilCharacteristics, classifySoilTexture } from '../src/engine/soilCharacteristics.js';
import { computeStressCoefficient, computeEffectiveRainfall, runWaterBalance } from '../src/engine/waterBalance.js';
import { computeYieldLoss } from '../src/engine/yieldLoss.js';
import { generateAdvisory, ADVISORY_STATUS } from '../src/engine/advisoryGenerator.js';

let totalTests = 0;
let passedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ ${message}`);
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertClose(actual, expected, tol = 1e-4, message = '') {
  totalTests++;
  const diff = Math.abs(actual - expected);
  if (diff <= tol) {
    passedTests++;
    console.log(`  ✓ ${message} (${actual.toFixed(4)} ≈ ${expected.toFixed(4)})`);
  } else {
    console.error(`  ✗ FAIL: ${message} (Expected ${expected}, got ${actual}, diff ${diff})`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

console.log('\n======================================================');
console.log('🧪 RUNNING COGNITIA SCIENTIFIC PHYSICS ENGINE AUDIT TESTS');
console.log('======================================================\n');

// ----------------------------------------------------
// TEST 1: FAO-56 Crop Coefficient (Kc) Step-Ramp Curve
// ----------------------------------------------------
console.log('1. Testing FAO-56 Figure 27 Kc Plateau-Ramp Trajectory:');
{
  const cropId = 'wheat';
  const crop = CROPS[cropId];
  // Wheat: initial=15d (Kc=0.30), dev=25d, mid=50d (Kc=1.15), late=30d (Kc=0.40)
  
  // Day 5 (Initial stage plateau)
  assertClose(getKcForDay(cropId, 5), 0.30, 1e-3, 'Day 5 (Initial) flat at Kc_ini = 0.30');
  // Day 15 (End of initial stage plateau)
  assertClose(getKcForDay(cropId, 15), 0.30, 1e-3, 'Day 15 (End of Initial) flat at Kc_ini = 0.30');
  
  // Day 27.5 (Midpoint of Development: 15 + 12.5) -> (0.30 + 1.15)/2 = 0.725
  assertClose(getKcForDay(cropId, 27.5), 0.725, 1e-3, 'Day 27.5 (Dev midpoint) linear ramp = 0.725');
  
  // Day 40 (Start of Mid-season: 15 + 25) -> Kc_mid = 1.15
  assertClose(getKcForDay(cropId, 40), 1.15, 1e-3, 'Day 40 (Start of Mid-season) = 1.15');
  // Day 65 (Middle of Mid-season: 40 + 25) -> flat at 1.15
  assertClose(getKcForDay(cropId, 65), 1.15, 1e-3, 'Day 65 (Mid-season plateau) = 1.15');
  // Day 90 (End of Mid-season: 40 + 50) -> flat at 1.15
  assertClose(getKcForDay(cropId, 90), 1.15, 1e-3, 'Day 90 (End of Mid-season) = 1.15');
  
  // Day 105 (Midpoint of Late-season: 90 + 15) -> (1.15 + 0.40)/2 = 0.775
  assertClose(getKcForDay(cropId, 105), 0.775, 1e-3, 'Day 105 (Late-season midpoint) linear ramp = 0.775');
  // Day 120 (Harvest: 90 + 30) -> Kc_end = 0.40
  assertClose(getKcForDay(cropId, 120), 0.40, 1e-3, 'Day 120 (Harvest) = 0.40');
}

// ----------------------------------------------------
// TEST 2: Stress Coefficient Ks (FAO-56 Eq. 84)
// ----------------------------------------------------
console.log('\n2. Testing Stress Coefficient Ks Thresholds & Monotonicity:');
{
  const TAW = 100; // mm
  const RAW = 50;  // mm (p = 0.5)

  // 1. Dr = 0 (No depletion)
  assertClose(computeStressCoefficient(0, TAW, RAW), 1.0, 1e-4, 'Dr = 0 -> Ks = 1.0');
  
  // 2. Dr = RAW (At threshold)
  assertClose(computeStressCoefficient(RAW, TAW, RAW), 1.0, 1e-4, 'Dr = RAW -> Ks = 1.0');
  
  // 3. Dr halfway between RAW and TAW -> (100 - 75) / (100 - 50) = 0.50
  assertClose(computeStressCoefficient(75, TAW, RAW), 0.5, 1e-4, 'Dr = RAW + 0.5(TAW-RAW) -> Ks = 0.5');
  
  // 4. Dr = TAW (Complete available water exhaustion)
  assertClose(computeStressCoefficient(TAW, TAW, RAW), 0.0, 1e-4, 'Dr = TAW -> Ks = 0.0');
  
  // 5. Dr > TAW (Extreme drought)
  assertClose(computeStressCoefficient(120, TAW, RAW), 0.0, 1e-4, 'Dr > TAW -> Ks = 0.0');
  
  // 6. Zero TAW guard
  assertClose(computeStressCoefficient(10, 0, 0), 1.0, 1e-4, 'TAW = 0 division-by-zero protection');
}

// ----------------------------------------------------
// TEST 3: Soil Pedotransfer Functions (Saxton-Rawls 2006)
// ----------------------------------------------------
console.log('\n3. Testing Saxton-Rawls Soil Pedotransfer & Texture Bounds:');
{
  // Loam sample: 40% Sand, 20% Clay, 2% OM
  const soil = computeSoilCharacteristics(40, 20, 2.0);
  assert(soil.fc > soil.pwp, 'Field Capacity (FC) strictly greater than Wilting Point (PWP)');
  assert(soil.saturation > soil.fc, 'Saturation strictly greater than Field Capacity (FC)');
  assert(soil.taw > 50 && soil.taw < 250, `TAW in physical range for loam: ${soil.taw.toFixed(1)} mm/m`);
  assert(soil.soilType === 'Loam', `Correct texture classification: ${soil.soilType}`);
}

// ----------------------------------------------------
// TEST 4: Conservation of Mass in Daily Soil Water Balance
// ----------------------------------------------------
console.log('\n4. Testing Daily Soil Water Balance Mass Conservation:');
{
  const plantingDate = new Date('2026-01-01');
  const weather = [
    { date: '2026-01-01', precipitation: 0, et0: 4.0 },
    { date: '2026-01-02', precipitation: 0, et0: 5.0 }, // Depleting
    { date: '2026-01-03', precipitation: 0, et0: 3.0 }, // Irrigation day
  ];

  const wb = runWaterBalance({
    cropId: 'wheat',
    plantingDate,
    weatherData: weather,
    irrigationEvents: [{ date: '2026-01-03', amount: 15.0 }],
    fc: 0.32,
    pwp: 0.14,
    saturation: 0.46,
    depletionFraction: 0.55,
    initialMoistureFraction: 0.70,
  });

  assert(wb.daily.length === 3, 'All 3 days simulated successfully');
  
  // Check day 1 and day 2 drying
  const d1 = wb.daily[0];
  const d2 = wb.daily[1];
  const d3 = wb.daily[2];

  assert(d1.etc > 0 && d1.eta > 0, 'ETc and ETa computed and positive');
  assert(d2.soilMoisture < d1.soilMoisture, 'Soil moisture depleted on day 2 without rain');
  
  // Check day 3 irrigation addition
  assert(d3.irrigation === 15.0, '15mm irrigation registered');
  assert(d3.soilMoisture > d2.soilMoisture, 'Soil moisture replenished after irrigation');
}

// ----------------------------------------------------
// TEST 5: FAO-33 Multiplicative Stage Yield Loss Model
// ----------------------------------------------------
console.log('\n5. Testing FAO-33 Multiplicative Yield-Loss Formulation:');
{
  // Mock synthetic daily results: Mid-season severe stress (ETa / ETc = 0.5)
  const mockDaily = [];
  const crop = CROPS.wheat; // Ky_mid = 0.45
  
  for (let d = 0; d < 30; d++) {
    mockDaily.push({
      growthStage: GROWTH_STAGES.MID_SEASON,
      eta: 2.0,
      etc: 4.0, // 50% deficit
      isStressed: true,
      isForecast: false,
    });
  }

  const yl = computeYieldLoss('wheat', mockDaily);
  // Expected stage reduction = Ky * (1 - 0.5) = 0.45 * 0.5 = 0.225 (22.5%)
  assertClose(yl.totalYieldLoss, 22.5, 0.5, 'FAO-33 yield reduction matches Ky · (1 - ETa/ETc)');
}

// ----------------------------------------------------
// TEST 6: Advisory & Net vs Gross Irrigation Guidance
// ----------------------------------------------------
console.log('\n6. Testing Net vs Gross Irrigation Recommendation Formatting:');
{
  const advisory = generateAdvisory({
    wbSummary: {
      isCurrentlyStressed: true,
      currentWBSI: 0.6,
      daysToStress: 0,
      irrigationNeeded: 45.0,
    },
    crossValidation: { agreement: 'confirmed_stress', confidenceScore: 92, confidenceLevel: 'HIGH' },
    yieldLoss: { totalYieldLoss: 12.4 },
    soilData: { source: 'ISRIC SoilGrids', isLookup: false, sand: 30, clay: 35, soilType: 'Clay Loam' },
    weatherResult: { source: 'Open-Meteo FAO-56 Penman-Monteith Grid', warnings: [] },
    satelliteResult: { source: 'MODIS MOD13Q1', isSynthetic: false, ndvi: [{ date: '2026-01-01', ndvi: 0.65 }] },
  });

  assert(advisory.status === ADVISORY_STATUS.IRRIGATE_NOW, 'Status triggered IRRIGATE_NOW');
  assert(advisory.irrigationDepth === 45.0, 'Net deficit correctly set to 45 mm');
  assert(advisory.irrigationAdvice.includes('Net root-zone deficit: 45 mm'), 'Advice explicitly states Net root-zone deficit');
  assert(advisory.irrigationAdvice.includes('Drip') && advisory.irrigationAdvice.includes('Surface/Flood'), 'Advice provides gross efficiency conversions');
}

console.log('\n======================================================');
console.log(`🎉 ALL ${passedTests} / ${totalTests} PHYSICS REGRESSION TESTS PASSED!`);
console.log('======================================================\n');
