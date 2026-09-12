/**
 * Weather Data Fetcher — Open-Meteo API Integration
 * 
 * Uses the free Open-Meteo API (no key required) for:
 * - Historical weather data (using past_days on Forecast API or Archive API)
 * - 7-to-16 day forecast (forecast API)
 * 
 * Provides: precipitation_sum, et0_fao_evapotranspiration (Penman-Monteith)
 */

const FORECAST_BASE = 'https://api.open-meteo.com/v1/forecast';
const ARCHIVE_BASE = 'https://archive-api.open-meteo.com/v1/archive';

/**
 * Fetch weather data for a location — combines historical + forecast.
 * 
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {string} startDate - Historical start (YYYY-MM-DD)
 * @param {number} forecastDays - Number of forecast days (default 7, max 16)
 * @returns {Promise<{ data: WeatherDay[], source: string, warnings: string[] }>}
 */
export async function fetchWeatherData(lat, lng, startDate, forecastDays = 7) {
  const warnings = [];
  const start = new Date(startDate);
  const today = new Date();
  const daysAgo = Math.max(0, Math.ceil((today - start) / (1000 * 60 * 60 * 24)));

  // If planting date is within past 90 days, Open-Meteo's forecast endpoint can fetch
  // both past historical days and future forecast days in one fast, reliable call!
  if (daysAgo <= 90) {
    try {
      const pastDaysToFetch = Math.min(92, Math.max(0, daysAgo + 1));
      const params = new URLSearchParams({
        latitude: lat.toFixed(4),
        longitude: lng.toFixed(4),
        daily: 'precipitation_sum,et0_fao_evapotranspiration,temperature_2m_max,temperature_2m_min',
        past_days: String(pastDaysToFetch),
        forecast_days: String(forecastDays),
        timezone: 'auto',
      });

      const resp = await fetch(`${FORECAST_BASE}?${params}`, {
        signal: AbortSignal.timeout(10000),
      });

      if (resp.ok) {
        const json = await resp.json();
        const fullData = parseOpenMeteoDaily(json);
        const filtered = fullData.filter(d => d.date >= startDate);

        if (filtered.length > 0) {
          return {
            data: filtered,
            source: 'Open-Meteo High-Resolution (Direct Live API)',
            warnings,
          };
        }
      }
    } catch (err) {
      console.warn('Fast forecast endpoint failed, attempting separate archive fetch:', err.message);
    }
  }

  // Fallback / Longer duration: Fetch Archive + Forecast separately
  let historicalData = [];
  let forecastData = [];

  try {
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const endDate = yesterday.toISOString().split('T')[0];

    if (startDate < endDate) {
      historicalData = await fetchHistorical(lat, lng, startDate, endDate);
    }
  } catch (err) {
    console.warn('Historical weather fetch failed:', err.message);
    warnings.push('Historical weather data estimated from regional agro-climate normals.');
    historicalData = generateClimateFallback(lat, startDate);
  }

  try {
    forecastData = await fetchForecast(lat, lng, forecastDays);
  } catch (err) {
    console.warn('Forecast fetch failed:', err.message);
    warnings.push('Weather forecast unavailable — using persistence estimation.');
    forecastData = generateForecastFallback(historicalData, forecastDays);
  }

  // Merge, removing duplicates (prefer historical for overlapping dates)
  const dateMap = new Map();
  for (const d of historicalData) {
    dateMap.set(d.date, { ...d, isForecast: false });
  }
  for (const d of forecastData) {
    if (!dateMap.has(d.date)) {
      dateMap.set(d.date, { ...d, isForecast: true });
    }
  }

  const data = Array.from(dateMap.values())
    .filter(d => d.date >= startDate)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  return {
    data,
    source: 'Open-Meteo FAO-56 Penman-Monteith Grid (open-meteo.com)',
    warnings,
  };
}

/**
 * Fetch historical weather from Open-Meteo Archive API.
 */
async function fetchHistorical(lat, lng, startDate, endDate) {
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lng.toFixed(4),
    start_date: startDate,
    end_date: endDate,
    daily: 'precipitation_sum,et0_fao_evapotranspiration',
    timezone: 'auto',
  });

  const resp = await fetch(`${ARCHIVE_BASE}?${params}`, {
    signal: AbortSignal.timeout(10000),
  });
  if (!resp.ok) throw new Error(`Archive API ${resp.status}`);

  const json = await resp.json();
  return parseOpenMeteoDaily(json);
}

/**
 * Fetch forecast weather from Open-Meteo Forecast API.
 */
async function fetchForecast(lat, lng, forecastDays) {
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lng.toFixed(4),
    daily: 'precipitation_sum,et0_fao_evapotranspiration',
    forecast_days: String(forecastDays),
    timezone: 'auto',
  });

  const resp = await fetch(`${FORECAST_BASE}?${params}`, {
    signal: AbortSignal.timeout(10000),
  });
  if (!resp.ok) throw new Error(`Forecast API ${resp.status}`);

  const json = await resp.json();
  return parseOpenMeteoDaily(json);
}

/**
 * Parse Open-Meteo daily JSON response.
 */
function parseOpenMeteoDaily(json) {
  if (!json?.daily?.time) return [];

  const todayStr = new Date().toISOString().split('T')[0];

  return json.daily.time.map((date, i) => ({
    date,
    precipitation: Math.round((json.daily.precipitation_sum?.[i] ?? 0) * 10) / 10,
    et0: Math.round((json.daily.et0_fao_evapotranspiration?.[i] ?? 4.0) * 10) / 10,
    tempMax: json.daily.temperature_2m_max?.[i] ?? null,
    tempMin: json.daily.temperature_2m_min?.[i] ?? null,
    isForecast: date > todayStr,
  }));
}

/**
 * Fallback: generate climate-based estimates when historical API fails.
 */
function generateClimateFallback(lat, startDate) {
  const data = [];
  const start = new Date(startDate);
  const today = new Date();

  const monthlyPrecip = getClimateNormals(lat);

  let current = new Date(start);
  while (current < today) {
    const month = current.getMonth();
    const dayOfYear = Math.floor((current - new Date(current.getFullYear(), 0, 0)) / 1000 / 60 / 60 / 24);
    const dailyPrecip = monthlyPrecip[month] / 30;
    const et0 = estimateET0Hargreaves(lat, dayOfYear);

    const precipVariation = 0.7 + Math.random() * 0.6;
    const et0Variation = 0.90 + Math.random() * 0.2;

    data.push({
      date: current.toISOString().split('T')[0],
      precipitation: Math.round(dailyPrecip * precipVariation * 10) / 10,
      et0: Math.round(et0 * et0Variation * 10) / 10,
      tempMax: Math.round(29 + Math.sin(dayOfYear / 58) * 6 + (Math.random() * 2 - 1)),
      tempMin: Math.round(18 + Math.sin(dayOfYear / 58) * 5 + (Math.random() * 2 - 1)),
      isForecast: false,
    });

    current.setDate(current.getDate() + 1);
  }

  return data;
}

/**
 * Fallback: generate forecast based on recent historical average.
 */
function generateForecastFallback(historicalData, forecastDays) {
  const recent = historicalData.slice(-7);
  const avgEt0 = recent.length > 0
    ? recent.reduce((sum, d) => sum + d.et0, 0) / recent.length
    : 4.5;

  const data = [];
  const today = new Date();

  for (let i = 1; i <= forecastDays; i++) {
    const fDate = new Date(today);
    fDate.setDate(fDate.getDate() + i);

    data.push({
      date: fDate.toISOString().split('T')[0],
      precipitation: 0,
      et0: Math.round(avgEt0 * 10) / 10,
      tempMax: 31,
      tempMin: 20,
      isForecast: true,
    });
  }

  return data;
}

function getClimateNormals(lat) {
  const absLat = Math.abs(lat);
  if (absLat < 15) {
    return [30, 40, 60, 90, 150, 200, 250, 220, 180, 120, 60, 40];
  } else if (absLat < 30) {
    return [15, 20, 25, 30, 50, 120, 220, 200, 130, 40, 15, 10];
  } else {
    return [40, 35, 45, 50, 60, 65, 70, 65, 55, 50, 45, 40];
  }
}

/**
 * FAO-56 Eq. 52 Extraterrestrial Radiation Ra approximation (Hargreaves-Samani).
 * @param {number} lat - Latitude in degrees
 * @param {number} J - Day of year (1-365)
 * @returns {number} Estimated daily ET0 in mm/day
 */
function estimateET0Hargreaves(lat, J) {
  const phi = (lat * Math.PI) / 180;
  const dr = 1 + 0.033 * Math.cos((2 * Math.PI * J) / 365);
  const delta = 0.409 * Math.sin(((2 * Math.PI * J) / 365) - 1.39);
  const tanTan = -Math.tan(phi) * Math.tan(delta);
  const omegaS = Math.acos(Math.max(-1, Math.min(1, tanTan)));

  // Extraterrestrial radiation Ra in MJ/m2/day (FAO-56 Eq. 21)
  const Gsc = 0.0820; // Solar constant MJ/m2/min
  const Ra = (24 * 60 / Math.PI) * Gsc * dr * (
    omegaS * Math.sin(phi) * Math.sin(delta) +
    Math.cos(phi) * Math.cos(delta) * Math.sin(omegaS)
  );

  // Convert Ra to equivalent evaporation depth in mm/day (divide by lambda = 2.45 MJ/kg)
  const Ra_mm = Ra / 2.45;
  // Standard temperature index estimate (Tmean ~ 24°C, deltaT ~ 12°C)
  const et0 = 0.0023 * (24 + 17.8) * Math.sqrt(12) * Ra_mm;
  return Math.max(1.0, Math.min(9.5, et0));
}
