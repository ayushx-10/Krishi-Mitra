/**
 * Crop Database — FAO-56 & FAO-33 Literature-Grounded Parameters
 * 
 * References:
 *   - Allen, R.G., et al. (1998). FAO Irrigation & Drainage Paper 56 — Crop Evapotranspiration.
 *   - Doorenbos, J. & Kassam, A.H. (1979). FAO Irrigation & Drainage Paper 33 — Yield Response to Water.
 * 
 * Kc values: FAO-56 Table 12 (single crop coefficient approach)
 * Ky values: FAO-33 Table 3 (yield response factors)
 */

export const GROWTH_STAGES = {
  INITIAL: 'initial',
  DEVELOPMENT: 'development',
  MID_SEASON: 'mid_season',
  LATE_SEASON: 'late_season',
};

/**
 * Crop parameter database
 * 
 * Each crop contains:
 * - name: Display name
 * - kc: Crop coefficient by growth stage (FAO-56)
 * - ky: Yield response factor by growth stage (FAO-33)
 * - stageDuration: Duration of each growth stage in days
 * - rootDepth: Root depth range [min, max] in meters by growth stage
 * - depletionFraction: p — fraction of TAW that can be depleted before stress (FAO-56 Table 22)
 * - kyTotal: Total season Ky for cumulative yield-loss calc
 */
export const CROPS = {
  rice: {
    name: 'Rice (Paddy)',
    kc: {
      [GROWTH_STAGES.INITIAL]: 1.05,
      [GROWTH_STAGES.DEVELOPMENT]: 1.10,
      [GROWTH_STAGES.MID_SEASON]: 1.20,
      [GROWTH_STAGES.LATE_SEASON]: 0.90,
    },
    ky: {
      [GROWTH_STAGES.INITIAL]: 0.60,
      [GROWTH_STAGES.DEVELOPMENT]: 1.09,
      [GROWTH_STAGES.MID_SEASON]: 1.32,
      [GROWTH_STAGES.LATE_SEASON]: 0.50,
    },
    kyTotal: 1.25,
    stageDuration: {
      [GROWTH_STAGES.INITIAL]: 30,
      [GROWTH_STAGES.DEVELOPMENT]: 30,
      [GROWTH_STAGES.MID_SEASON]: 60,
      [GROWTH_STAGES.LATE_SEASON]: 30,
    },
    totalDuration: 150,
    rootDepth: {
      [GROWTH_STAGES.INITIAL]: 0.30,
      [GROWTH_STAGES.DEVELOPMENT]: 0.40,
      [GROWTH_STAGES.MID_SEASON]: 0.60,
      [GROWTH_STAGES.LATE_SEASON]: 0.60,
    },
    depletionFraction: 0.20,
    ndviExpected: {
      [GROWTH_STAGES.INITIAL]: 0.25,
      [GROWTH_STAGES.DEVELOPMENT]: 0.50,
      [GROWTH_STAGES.MID_SEASON]: 0.75,
      [GROWTH_STAGES.LATE_SEASON]: 0.45,
    },
  },

  wheat: {
    name: 'Wheat',
    kc: {
      [GROWTH_STAGES.INITIAL]: 0.30,
      [GROWTH_STAGES.DEVELOPMENT]: 0.70,
      [GROWTH_STAGES.MID_SEASON]: 1.15,
      [GROWTH_STAGES.LATE_SEASON]: 0.40,
    },
    ky: {
      [GROWTH_STAGES.INITIAL]: 0.20,
      [GROWTH_STAGES.DEVELOPMENT]: 0.55,
      [GROWTH_STAGES.MID_SEASON]: 0.45,
      [GROWTH_STAGES.LATE_SEASON]: 0.20,
    },
    kyTotal: 1.05,
    stageDuration: {
      [GROWTH_STAGES.INITIAL]: 15,
      [GROWTH_STAGES.DEVELOPMENT]: 25,
      [GROWTH_STAGES.MID_SEASON]: 50,
      [GROWTH_STAGES.LATE_SEASON]: 30,
    },
    totalDuration: 120,
    rootDepth: {
      [GROWTH_STAGES.INITIAL]: 0.30,
      [GROWTH_STAGES.DEVELOPMENT]: 0.60,
      [GROWTH_STAGES.MID_SEASON]: 1.00,
      [GROWTH_STAGES.LATE_SEASON]: 1.00,
    },
    depletionFraction: 0.55,
    ndviExpected: {
      [GROWTH_STAGES.INITIAL]: 0.20,
      [GROWTH_STAGES.DEVELOPMENT]: 0.45,
      [GROWTH_STAGES.MID_SEASON]: 0.80,
      [GROWTH_STAGES.LATE_SEASON]: 0.35,
    },
  },

  maize: {
    name: 'Maize (Corn)',
    kc: {
      [GROWTH_STAGES.INITIAL]: 0.30,
      [GROWTH_STAGES.DEVELOPMENT]: 0.70,
      [GROWTH_STAGES.MID_SEASON]: 1.20,
      [GROWTH_STAGES.LATE_SEASON]: 0.60,
    },
    ky: {
      [GROWTH_STAGES.INITIAL]: 0.40,
      [GROWTH_STAGES.DEVELOPMENT]: 0.40,
      [GROWTH_STAGES.MID_SEASON]: 1.30,
      [GROWTH_STAGES.LATE_SEASON]: 0.50,
    },
    kyTotal: 1.25,
    stageDuration: {
      [GROWTH_STAGES.INITIAL]: 20,
      [GROWTH_STAGES.DEVELOPMENT]: 35,
      [GROWTH_STAGES.MID_SEASON]: 40,
      [GROWTH_STAGES.LATE_SEASON]: 30,
    },
    totalDuration: 125,
    rootDepth: {
      [GROWTH_STAGES.INITIAL]: 0.30,
      [GROWTH_STAGES.DEVELOPMENT]: 0.60,
      [GROWTH_STAGES.MID_SEASON]: 1.00,
      [GROWTH_STAGES.LATE_SEASON]: 1.00,
    },
    depletionFraction: 0.55,
    ndviExpected: {
      [GROWTH_STAGES.INITIAL]: 0.20,
      [GROWTH_STAGES.DEVELOPMENT]: 0.50,
      [GROWTH_STAGES.MID_SEASON]: 0.85,
      [GROWTH_STAGES.LATE_SEASON]: 0.40,
    },
  },

  cotton: {
    name: 'Cotton',
    kc: {
      [GROWTH_STAGES.INITIAL]: 0.35,
      [GROWTH_STAGES.DEVELOPMENT]: 0.70,
      [GROWTH_STAGES.MID_SEASON]: 1.20,
      [GROWTH_STAGES.LATE_SEASON]: 0.70,
    },
    ky: {
      [GROWTH_STAGES.INITIAL]: 0.20,
      [GROWTH_STAGES.DEVELOPMENT]: 0.50,
      [GROWTH_STAGES.MID_SEASON]: 0.45,
      [GROWTH_STAGES.LATE_SEASON]: 0.25,
    },
    kyTotal: 0.85,
    stageDuration: {
      [GROWTH_STAGES.INITIAL]: 30,
      [GROWTH_STAGES.DEVELOPMENT]: 50,
      [GROWTH_STAGES.MID_SEASON]: 55,
      [GROWTH_STAGES.LATE_SEASON]: 45,
    },
    totalDuration: 180,
    rootDepth: {
      [GROWTH_STAGES.INITIAL]: 0.30,
      [GROWTH_STAGES.DEVELOPMENT]: 0.70,
      [GROWTH_STAGES.MID_SEASON]: 1.30,
      [GROWTH_STAGES.LATE_SEASON]: 1.30,
    },
    depletionFraction: 0.65,
    ndviExpected: {
      [GROWTH_STAGES.INITIAL]: 0.18,
      [GROWTH_STAGES.DEVELOPMENT]: 0.45,
      [GROWTH_STAGES.MID_SEASON]: 0.72,
      [GROWTH_STAGES.LATE_SEASON]: 0.38,
    },
  },

  sugarcane: {
    name: 'Sugarcane',
    kc: {
      [GROWTH_STAGES.INITIAL]: 0.40,
      [GROWTH_STAGES.DEVELOPMENT]: 0.80,
      [GROWTH_STAGES.MID_SEASON]: 1.25,
      [GROWTH_STAGES.LATE_SEASON]: 0.75,
    },
    ky: {
      [GROWTH_STAGES.INITIAL]: 0.75,
      [GROWTH_STAGES.DEVELOPMENT]: 0.75,
      [GROWTH_STAGES.MID_SEASON]: 0.50,
      [GROWTH_STAGES.LATE_SEASON]: 0.10,
    },
    kyTotal: 1.20,
    stageDuration: {
      [GROWTH_STAGES.INITIAL]: 35,
      [GROWTH_STAGES.DEVELOPMENT]: 60,
      [GROWTH_STAGES.MID_SEASON]: 190,
      [GROWTH_STAGES.LATE_SEASON]: 75,
    },
    totalDuration: 360,
    rootDepth: {
      [GROWTH_STAGES.INITIAL]: 0.40,
      [GROWTH_STAGES.DEVELOPMENT]: 0.80,
      [GROWTH_STAGES.MID_SEASON]: 1.50,
      [GROWTH_STAGES.LATE_SEASON]: 1.50,
    },
    depletionFraction: 0.65,
    ndviExpected: {
      [GROWTH_STAGES.INITIAL]: 0.22,
      [GROWTH_STAGES.DEVELOPMENT]: 0.55,
      [GROWTH_STAGES.MID_SEASON]: 0.82,
      [GROWTH_STAGES.LATE_SEASON]: 0.50,
    },
  },

  soybean: {
    name: 'Soybean',
    kc: {
      [GROWTH_STAGES.INITIAL]: 0.40,
      [GROWTH_STAGES.DEVELOPMENT]: 0.80,
      [GROWTH_STAGES.MID_SEASON]: 1.15,
      [GROWTH_STAGES.LATE_SEASON]: 0.50,
    },
    ky: {
      [GROWTH_STAGES.INITIAL]: 0.20,
      [GROWTH_STAGES.DEVELOPMENT]: 0.80,
      [GROWTH_STAGES.MID_SEASON]: 1.00,
      [GROWTH_STAGES.LATE_SEASON]: 0.20,
    },
    kyTotal: 1.10,
    stageDuration: {
      [GROWTH_STAGES.INITIAL]: 15,
      [GROWTH_STAGES.DEVELOPMENT]: 25,
      [GROWTH_STAGES.MID_SEASON]: 45,
      [GROWTH_STAGES.LATE_SEASON]: 25,
    },
    totalDuration: 110,
    rootDepth: {
      [GROWTH_STAGES.INITIAL]: 0.20,
      [GROWTH_STAGES.DEVELOPMENT]: 0.40,
      [GROWTH_STAGES.MID_SEASON]: 0.80,
      [GROWTH_STAGES.LATE_SEASON]: 0.80,
    },
    depletionFraction: 0.50,
    ndviExpected: {
      [GROWTH_STAGES.INITIAL]: 0.20,
      [GROWTH_STAGES.DEVELOPMENT]: 0.50,
      [GROWTH_STAGES.MID_SEASON]: 0.82,
      [GROWTH_STAGES.LATE_SEASON]: 0.35,
    },
  },

  groundnut: {
    name: 'Groundnut (Peanut)',
    kc: {
      [GROWTH_STAGES.INITIAL]: 0.40,
      [GROWTH_STAGES.DEVELOPMENT]: 0.75,
      [GROWTH_STAGES.MID_SEASON]: 1.05,
      [GROWTH_STAGES.LATE_SEASON]: 0.60,
    },
    ky: {
      [GROWTH_STAGES.INITIAL]: 0.20,
      [GROWTH_STAGES.DEVELOPMENT]: 0.80,
      [GROWTH_STAGES.MID_SEASON]: 0.60,
      [GROWTH_STAGES.LATE_SEASON]: 0.20,
    },
    kyTotal: 0.70,
    stageDuration: {
      [GROWTH_STAGES.INITIAL]: 25,
      [GROWTH_STAGES.DEVELOPMENT]: 35,
      [GROWTH_STAGES.MID_SEASON]: 35,
      [GROWTH_STAGES.LATE_SEASON]: 25,
    },
    totalDuration: 120,
    rootDepth: {
      [GROWTH_STAGES.INITIAL]: 0.25,
      [GROWTH_STAGES.DEVELOPMENT]: 0.40,
      [GROWTH_STAGES.MID_SEASON]: 0.60,
      [GROWTH_STAGES.LATE_SEASON]: 0.60,
    },
    depletionFraction: 0.50,
    ndviExpected: {
      [GROWTH_STAGES.INITIAL]: 0.20,
      [GROWTH_STAGES.DEVELOPMENT]: 0.48,
      [GROWTH_STAGES.MID_SEASON]: 0.75,
      [GROWTH_STAGES.LATE_SEASON]: 0.38,
    },
  },
};

/**
 * Determine the current growth stage based on planting date and current date.
 * @param {string} cropId - Crop identifier
 * @param {Date} plantingDate - Date when crop was planted
 * @param {Date} currentDate - Current date
 * @returns {{ stage: string, dayInStage: number, daysIntoSeason: number, stageProgress: number }}
 */
export function getCurrentGrowthStage(cropId, plantingDate, currentDate) {
  const crop = CROPS[cropId];
  if (!crop) {
    return {
      stage: GROWTH_STAGES.MID_SEASON,
      dayInStage: 1,
      daysIntoSeason: 1,
      stageProgress: 0.5,
    };
  }

  const daysIntoSeason = Math.floor(
    (currentDate - plantingDate) / (1000 * 60 * 60 * 24)
  );

  if (daysIntoSeason < 0) {
    return {
      stage: GROWTH_STAGES.INITIAL,
      dayInStage: 0,
      daysIntoSeason: 0,
      stageProgress: 0,
    };
  }

  const stages = [
    GROWTH_STAGES.INITIAL,
    GROWTH_STAGES.DEVELOPMENT,
    GROWTH_STAGES.MID_SEASON,
    GROWTH_STAGES.LATE_SEASON,
  ];

  let cumulativeDays = 0;
  for (const stage of stages) {
    const duration = crop.stageDuration[stage];
    if (daysIntoSeason < cumulativeDays + duration) {
      const dayInStage = daysIntoSeason - cumulativeDays;
      return {
        stage,
        dayInStage,
        daysIntoSeason,
        stageProgress: dayInStage / duration,
      };
    }
    cumulativeDays += duration;
  }

  // Past harvest
  return {
    stage: GROWTH_STAGES.LATE_SEASON,
    dayInStage: crop.stageDuration[GROWTH_STAGES.LATE_SEASON],
    daysIntoSeason,
    stageProgress: 1.0,
  };
}

/**
 * Get interpolated Kc for a given day in the season following exact FAO-56 Figure 27.
 * - Initial stage: flat at Kc_ini
 * - Development stage: linear ramp from Kc_ini to Kc_mid
 * - Mid-season stage: flat at Kc_mid
 * - Late-season stage: linear ramp from Kc_mid to Kc_end
 * 
 * @param {string} cropId 
 * @param {number} daysIntoSeason 
 * @returns {number}
 */
export function getKcForDay(cropId, daysIntoSeason) {
  const crop = CROPS[cropId];
  if (!crop) return 1.0;

  const lIni = crop.stageDuration[GROWTH_STAGES.INITIAL];
  const lDev = crop.stageDuration[GROWTH_STAGES.DEVELOPMENT];
  const lMid = crop.stageDuration[GROWTH_STAGES.MID_SEASON];
  const lLate = crop.stageDuration[GROWTH_STAGES.LATE_SEASON];

  const kcIni = crop.kc[GROWTH_STAGES.INITIAL];
  const kcMid = crop.kc[GROWTH_STAGES.MID_SEASON];
  const kcEnd = crop.kc[GROWTH_STAGES.LATE_SEASON];

  if (daysIntoSeason <= lIni) {
    return kcIni;
  } else if (daysIntoSeason <= lIni + lDev) {
    const t = (daysIntoSeason - lIni) / lDev;
    return kcIni + t * (kcMid - kcIni);
  } else if (daysIntoSeason <= lIni + lDev + lMid) {
    return kcMid;
  } else if (daysIntoSeason <= lIni + lDev + lMid + lLate) {
    const t = (daysIntoSeason - (lIni + lDev + lMid)) / lLate;
    return kcMid + t * (kcEnd - kcMid);
  } else {
    return kcEnd;
  }
}

/**
 * Get expected NDVI for a given day in the season (FAO-56 phenological canopy curve).
 * @param {string} cropId 
 * @param {number} daysIntoSeason 
 * @returns {number}
 */
export function getExpectedNDVI(cropId, daysIntoSeason) {
  const crop = CROPS[cropId];
  if (!crop) return 0.5;

  const lIni = crop.stageDuration[GROWTH_STAGES.INITIAL];
  const lDev = crop.stageDuration[GROWTH_STAGES.DEVELOPMENT];
  const lMid = crop.stageDuration[GROWTH_STAGES.MID_SEASON];
  const lLate = crop.stageDuration[GROWTH_STAGES.LATE_SEASON];

  const ndviIni = crop.ndviExpected[GROWTH_STAGES.INITIAL];
  const ndviMid = crop.ndviExpected[GROWTH_STAGES.MID_SEASON];
  const ndviEnd = crop.ndviExpected[GROWTH_STAGES.LATE_SEASON];

  if (daysIntoSeason <= lIni) {
    return ndviIni;
  } else if (daysIntoSeason <= lIni + lDev) {
    const t = (daysIntoSeason - lIni) / lDev;
    return ndviIni + t * (ndviMid - ndviIni);
  } else if (daysIntoSeason <= lIni + lDev + lMid) {
    return ndviMid;
  } else if (daysIntoSeason <= lIni + lDev + lMid + lLate) {
    const t = (daysIntoSeason - (lIni + lDev + lMid)) / lLate;
    return ndviMid + t * (ndviEnd - ndviMid);
  } else {
    return ndviEnd;
  }
}

/**
 * Get root depth for a given day in the season (linear growth from initial to mid).
 * @param {string} cropId 
 * @param {number} daysIntoSeason 
 * @returns {number} Root depth in meters
 */
export function getRootDepthForDay(cropId, daysIntoSeason) {
  const crop = CROPS[cropId];
  if (!crop) return 0.5;

  const initDur = crop.stageDuration[GROWTH_STAGES.INITIAL];
  const devDur = crop.stageDuration[GROWTH_STAGES.DEVELOPMENT];
  const initDepth = crop.rootDepth[GROWTH_STAGES.INITIAL];
  const maxDepth = crop.rootDepth[GROWTH_STAGES.MID_SEASON];

  if (daysIntoSeason <= initDur) return initDepth;
  if (daysIntoSeason >= initDur + devDur) return maxDepth;

  // Linear interpolation during development
  const t = (daysIntoSeason - initDur) / devDur;
  return initDepth + t * (maxDepth - initDepth);
}
