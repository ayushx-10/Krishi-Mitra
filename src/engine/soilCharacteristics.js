/**
 * Soil Water Characteristics — Pedotransfer Functions
 * 
 * Reference:
 *   Saxton, K.E. & Rawls, W.J. (2006). Soil Water Characteristic Estimates by
 *   Texture and Organic Matter for Hydrologic Solutions. Soil Sci. Soc. Am. J. 70:1569-1578.
 * 
 * Provides Field Capacity (FC), Permanent Wilting Point (PWP), and saturation
 * from soil texture (sand, clay, organic matter %).
 */

/**
 * Lookup table for manual soil-type fallback
 * Values in volumetric water content (m³/m³)
 */
export const SOIL_TYPE_LOOKUP = {
  sand: {
    name: 'Sand',
    sand: 90, clay: 5, om: 1.0,
    fc: 0.10, pwp: 0.05, saturation: 0.40,
    ksat: 210, // mm/day saturated hydraulic conductivity
  },
  loamy_sand: {
    name: 'Loamy Sand',
    sand: 80, clay: 8, om: 1.5,
    fc: 0.14, pwp: 0.06, saturation: 0.42,
    ksat: 150,
  },
  sandy_loam: {
    name: 'Sandy Loam',
    sand: 65, clay: 12, om: 2.0,
    fc: 0.20, pwp: 0.09, saturation: 0.44,
    ksat: 80,
  },
  loam: {
    name: 'Loam',
    sand: 42, clay: 20, om: 2.5,
    fc: 0.27, pwp: 0.12, saturation: 0.46,
    ksat: 40,
  },
  silt_loam: {
    name: 'Silt Loam',
    sand: 20, clay: 15, om: 2.5,
    fc: 0.33, pwp: 0.13, saturation: 0.48,
    ksat: 30,
  },
  clay_loam: {
    name: 'Clay Loam',
    sand: 30, clay: 35, om: 2.0,
    fc: 0.36, pwp: 0.20, saturation: 0.48,
    ksat: 15,
  },
  silty_clay: {
    name: 'Silty Clay',
    sand: 8, clay: 45, om: 2.0,
    fc: 0.38, pwp: 0.25, saturation: 0.50,
    ksat: 8,
  },
  clay: {
    name: 'Clay',
    sand: 20, clay: 55, om: 2.0,
    fc: 0.40, pwp: 0.27, saturation: 0.52,
    ksat: 5,
  },
};

/**
 * Compute soil water characteristics using simplified Saxton-Rawls pedotransfer.
 * 
 * @param {number} sandPct - Sand content (%)
 * @param {number} clayPct - Clay content (%)
 * @param {number} omPct - Organic matter content (%), default 2.0
 * @returns {{ fc: number, pwp: number, saturation: number, taw: number, soilType: string }}
 *   fc, pwp, saturation in volumetric (m³/m³); taw in mm per m root depth
 */
export function computeSoilCharacteristics(sandPct, clayPct, omPct = 2.0) {
  const S = sandPct / 100;
  const C = clayPct / 100;
  const OM = omPct / 100;

  // Saxton-Rawls (2006) — simplified regression equations
  // Moisture at 33 kPa (Field Capacity)
  const fc33t =
    -0.251 * S +
    0.195 * C +
    0.011 * OM +
    0.006 * (S * OM) -
    0.027 * (C * OM) +
    0.452 * (S * C) +
    0.299;

  const fc = fc33t + (1.283 * fc33t * fc33t - 0.374 * fc33t - 0.015);

  // Moisture at 1500 kPa (Permanent Wilting Point)
  const pwp1500t =
    -0.024 * S +
    0.487 * C +
    0.006 * OM +
    0.005 * (S * OM) -
    0.013 * (C * OM) +
    0.068 * (S * C) +
    0.031;

  const pwp = pwp1500t + (0.14 * pwp1500t - 0.02);

  // Saturation
  const satS =
    0.078 + 0.278 * fc + 0.034 * C + 0.022 * OM - 0.018 * (S * OM) -
    0.027 * (C * OM) - 0.584 * (S * C) + 0.078;

  const saturation = fc + satS - 0.097 * S + 0.043;

  // Clamp to reasonable bounds
  const fcClamped = Math.max(0.05, Math.min(0.55, fc));
  const pwpClamped = Math.max(0.02, Math.min(0.35, pwp));
  const satClamped = Math.max(fcClamped + 0.01, Math.min(0.60, saturation));

  // Total Available Water per meter of root depth (mm/m)
  const taw = (fcClamped - pwpClamped) * 1000;

  // Classify soil type
  const soilType = classifySoilTexture(sandPct, clayPct);

  return {
    fc: fcClamped,
    pwp: pwpClamped,
    saturation: satClamped,
    taw,
    soilType,
  };
}

/**
 * USDA soil texture classification from sand and clay percentages.
 * Simplified triangle classification.
 * @param {number} sand - Sand %
 * @param {number} clay - Clay %
 * @returns {string}
 */
export function classifySoilTexture(sand, clay) {
  const silt = 100 - sand - clay;

  if (clay >= 40) {
    if (silt >= 40) return 'Silty Clay';
    if (sand >= 45) return 'Sandy Clay';
    return 'Clay';
  }
  if (clay >= 27) {
    if (sand >= 20 && sand <= 45) return 'Clay Loam';
    if (sand < 20) return 'Silty Clay Loam';
    return 'Sandy Clay Loam';
  }
  if (clay >= 12) {
    if (silt >= 50) return 'Silt Loam';
    return 'Loam';
  }
  if (sand >= 85) return 'Sand';
  if (sand >= 70) return 'Loamy Sand';
  if (silt >= 80) return 'Silt';
  return 'Sandy Loam';
}

/**
 * Compute soil characteristics from a lookup table soil type.
 * Used as fallback when SoilGrids API is unavailable.
 * @param {string} soilTypeKey - Key from SOIL_TYPE_LOOKUP
 * @param {number} rootDepth - Current root depth in meters
 * @returns {{ fc: number, pwp: number, saturation: number, taw: number, raw: number, soilType: string, isLookup: boolean }}
 */
export function getSoilFromLookup(soilTypeKey, rootDepth = 0.6) {
  const soil = SOIL_TYPE_LOOKUP[soilTypeKey] || SOIL_TYPE_LOOKUP.loam;
  const taw = (soil.fc - soil.pwp) * rootDepth * 1000; // mm

  return {
    fc: soil.fc,
    pwp: soil.pwp,
    saturation: soil.saturation,
    taw,
    raw: taw * 0.5, // Default depletion fraction
    soilType: soil.name,
    isLookup: true,
  };
}

/**
 * Compute Readily Available Water.
 * @param {number} taw - Total Available Water (mm)
 * @param {number} depletionFraction - p value from crop database
 * @returns {number} RAW in mm
 */
export function computeRAW(taw, depletionFraction) {
  return taw * depletionFraction;
}
