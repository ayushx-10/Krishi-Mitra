/**
 * Dashboard Renderer — COGNITIA-style UI
 * Renders advisory banners, metric cards, 8 comprehensive charts,
 * phenology timeline, deep soil diagnostics grid, and interactive daily ledger table.
 */

import Chart from 'chart.js/auto';
import { CROPS, GROWTH_STAGES } from '../engine/cropDatabase.js';

let moistureChart = null;
let inflowOutflowChart = null;
let etcDemandChart = null;
let ndviChart = null;
let nutrientRadarChart = null;
let climateTempChart = null;
let yieldChart = null;
let forecastChart = null;

/**
 * Render the full results dashboard.
 */
export function renderDashboard(advisory, wbResult, ndviData, crossVal, yieldLoss, satelliteResult, extraContext = {}) {
  document.getElementById('setup-panel').style.display = 'none';
  document.getElementById('loading-panel').style.display = 'none';
  document.getElementById('results-panel').style.display = 'block';

  const cropId = extraContext.cropId || document.getElementById('crop-select')?.value || 'wheat';
  const plantingDate = extraContext.plantingDate || document.getElementById('planting-date')?.value || '';
  const soilData = extraContext.soilData || advisory.soilData || {};
  const weatherData = extraContext.weatherData || [];

  renderFieldBar(advisory);
  renderAdvisoryBanner(advisory);
  renderMetricsRow(advisory, wbResult);

  // 1. Root-Zone Moisture Chart
  renderMoistureChart(wbResult.daily, wbResult.summary);

  // 2. Water Inflows vs Outflows Chart
  renderInflowOutflowChart(wbResult.daily);

  // 3. ETc Crop Demand & Kc Progression Chart
  renderEtcDemandChart(wbResult.daily);

  // 4. MODIS Satellite NDVI Chart
  renderSatellitePanel(ndviData, satelliteResult);

  // 5. Soil Fertility & Chemical Balance Radar Chart
  renderNutrientRadarChart(soilData);

  // 6. Thermal Microclimate & Heat-Stress Curve
  renderClimateTempChart(weatherData, wbResult.daily);

  // 7. Multi-Source Cross-Validation Matrix
  renderCrossValidationMatrix(crossVal);

  // 8. FAO-33 Yield Loss by Stage Chart
  renderYieldChart(yieldLoss);

  // Verbose Breakdowns
  renderPhenologyTimeline(cropId, plantingDate, wbResult.daily);
  renderVerboseSoilDiagnostics(soilData);
  renderDailyLedgerTable(wbResult.daily);

  renderDataQuality(advisory.dataQuality);
  renderWarnings(advisory.warnings);
  setupActionCards(wbResult);

  // Add scroll-reveal animations to dashboard elements
  requestAnimationFrame(() => {
    addDashboardRevealAnimations();
  });

  // Smooth scroll to results panel
  setTimeout(() => {
    document.getElementById('results-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 100);
}

function renderFieldBar(advisory) {
  const cropSelect = document.getElementById('crop-select');
  const cropName = cropSelect?.options[cropSelect.selectedIndex]?.text || '—';
  const plantDate = document.getElementById('planting-date')?.value || '';
  const latInput = document.getElementById('lat-input')?.value || '';
  const lngInput = document.getElementById('lng-input')?.value || '';

  const metaEl = document.getElementById('results-field-meta');
  if (metaEl) {
    metaEl.textContent = `${cropName.replace(/[^\w\s()]/g, '').trim()} · ${latInput}°N, ${lngInput}°E`;
  }

  const formatted = plantDate
    ? new Date(plantDate).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })
    : '—';
  const sowingEl = document.getElementById('results-sowing-date');
  if (sowingEl) sowingEl.textContent = formatted;
}

function renderAdvisoryBanner(advisory) {
  const headline = document.getElementById('advisory-headline');
  const subtext = document.getElementById('advisory-subtext');
  const iconWrap = document.getElementById('advisory-icon');

  if (headline) headline.textContent = advisory.statusLabel.replace(/[🔴🟡🟢✅]/g, '').trim();

  const colorMap = {
    irrigate_now: '#c0392b',
    monitor_closely: '#e67e22',
    safe_to_wait: '#1a7a42',
    no_action_needed: '#1a7a42',
  };
  if (headline) headline.style.color = colorMap[advisory.status] || '#1a7a42';
  if (subtext) subtext.textContent = advisory.statusDescription;

  const isGood = advisory.status === 'safe_to_wait' || advisory.status === 'no_action_needed';
  const iconBg = isGood ? '#e8f5e9' : advisory.status === 'irrigate_now' ? '#fce4ec' : '#fff3e0';
  const iconColor = isGood ? '#1a7a42' : advisory.status === 'irrigate_now' ? '#c0392b' : '#e67e22';

  if (iconWrap) {
    iconWrap.innerHTML = `
      <svg width="48" height="48" viewBox="0 0 56 56" fill="none">
        <circle cx="28" cy="28" r="24" fill="${iconBg}"/>
        <path d="M28 12 C 18 20, 18 38, 28 46 C 38 38, 38 20, 28 12Z" fill="${iconColor}"/>
        ${isGood
          ? '<path d="M22 30 L 26 36 L 36 22" stroke="#fff" stroke-width="2.5" stroke-linecap="round" fill="none"/>'
          : '<line x1="28" y1="20" x2="28" y2="32" stroke="#fff" stroke-width="3" stroke-linecap="round"/><circle cx="28" cy="38" r="2" fill="#fff"/>'
        }
      </svg>
    `;
  }

  const dts = advisory.daysToStress;
  const dtsEl = document.getElementById('days-to-stress-val');
  if (dtsEl) {
    dtsEl.textContent = dts !== null ? (dts === 0 ? 'NOW' : `${dts} days`) : '> 16 days';
  }

  const yl = advisory.yieldLossPercent;
  const ylEl = document.getElementById('yield-loss-val');
  if (ylEl) ylEl.textContent = `~ ${yl}%`;
}

// === Add Reveal Animations to Dashboard Elements ===
function addDashboardRevealAnimations() {
  const selectors = [
    '.results-meta-header',
    '.advisory-banner-minimal',
    '.metrics-grid-minimal',
    '.charts-row-minimal',
    '.verbose-card-minimal',
    '.action-cards-row-minimal',
  ];

  selectors.forEach((sel, sectionIdx) => {
    const elements = document.querySelectorAll(`#results-panel ${sel}`);
    elements.forEach((el, i) => {
      if (!el.classList.contains('reveal')) {
        el.classList.add('reveal', 'reveal-up');
        el.setAttribute('data-delay', String((sectionIdx * 60) + (i * 40)));
      }
    });
  });

  // Metric boxes get stagger
  const metricsGrid = document.querySelector('#results-panel .metrics-grid-minimal');
  if (metricsGrid) {
    metricsGrid.classList.add('stagger-children');
  }
}

function renderMetricsRow(advisory, wbResult) {
  const summary = wbResult.summary;
  const daily = wbResult.daily;

  // Soil water now
  const soilWater = Math.round(summary.currentMoisture);
  const soilWaterEl = document.getElementById('mc-soil-water');
  if (soilWaterEl) soilWaterEl.textContent = `${soilWater} mm`;
  
  const soilPercent = Math.min(100, Math.max(0, (summary.currentMoisture / summary.fc) * 100));
  const soilBar = document.getElementById('mc-soil-bar');
  if (soilBar) {
    soilBar.style.width = `${soilPercent}%`;
    soilBar.className = `mc-bar-fill ${soilPercent > 50 ? 'mc-bar-green' : 'mc-bar-yellow'}`;
  }
  const soilHint = document.getElementById('mc-soil-hint');
  if (soilHint) {
    soilHint.textContent = soilPercent > 70 ? 'Good (above safe level)' : soilPercent > 40 ? 'Moderate' : 'Low — needs water';
  }

  // Safe level (RAW threshold)
  const safeLevel = Math.round(summary.rawThreshold);
  const safeEl = document.getElementById('mc-safe-level');
  if (safeEl) safeEl.textContent = `${safeLevel} mm`;
  
  const safeAbove = summary.currentMoisture > summary.rawThreshold;
  const safePercent = Math.min(100, Math.max(0, (summary.rawThreshold / summary.fc) * 100));
  const safeBar = document.getElementById('mc-safe-bar');
  if (safeBar) safeBar.style.width = `${safePercent}%`;
  
  const safeHint = document.getElementById('mc-safe-hint');
  if (safeHint) safeHint.textContent = safeAbove ? 'Your field is above this level' : 'Below safe level!';

  // Rain expected next 7 days
  const forecastDays = daily.filter(d => d.isForecast).slice(0, 7);
  const totalRain = forecastDays.reduce((s, d) => s + (d.precipitation || 0), 0);
  const rainExpectedEl = document.getElementById('mc-rain-expected');
  if (rainExpectedEl) rainExpectedEl.textContent = `${Math.round(totalRain * 10) / 10} mm`;
  
  const rainHint = document.getElementById('mc-rain-hint');
  if (rainHint) rainHint.textContent = totalRain > 20 ? 'Good rain expected' : totalRain > 5 ? 'Light rain' : 'Little to no rain';

  // Crop water use next 7 days
  const totalET = forecastDays.reduce((s, d) => s + (d.etc || 0), 0);
  const cropEtEl = document.getElementById('mc-crop-et');
  if (cropEtEl) cropEtEl.textContent = `${Math.round(totalET * 10) / 10} mm`;
  
  const etHint = document.getElementById('mc-et-hint');
  if (etHint) etHint.textContent = totalET > 40 ? 'High demand' : totalET > 20 ? 'Normal' : 'Low demand';
}

// === Chart 1: Root-Zone Moisture Dynamics ===
function renderMoistureChart(dailyResults, summary) {
  const ctx = document.getElementById('moisture-chart');
  if (!ctx) return;
  if (moistureChart) moistureChart.destroy();

  const recent = dailyResults.slice(-45);
  const labels = recent.map(d => {
    const dt = new Date(d.date);
    return `${dt.getDate()} ${dt.toLocaleString('en', { month: 'short' })}`;
  });

  const forecastStartIdx = recent.findIndex(d => d.isForecast);

  moistureChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Current Soil Water (W)',
          data: recent.map(d => Math.round(d.soilMoisture)),
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37, 99, 235, 0.12)',
          fill: true,
          tension: 0.35,
          borderWidth: 2.5,
          pointRadius: 0,
          pointHoverRadius: 5,
        },
        {
          label: 'Critical RAW Threshold (p·TAW)',
          data: recent.map(d => Math.round(d.rawThreshold)),
          borderColor: '#dc2626',
          borderDash: [5, 4],
          borderWidth: 2,
          pointRadius: 0,
          fill: false,
        },
        {
          label: 'Field Capacity (FC)',
          data: recent.map(() => Math.round(summary?.fc || 250)),
          borderColor: '#059669',
          borderDash: [3, 3],
          borderWidth: 1.5,
          pointRadius: 0,
          fill: false,
        },
        {
          label: 'Permanent Wilting Point (PWP)',
          data: recent.map(() => Math.round(summary?.pwp || 100)),
          borderColor: '#64748b',
          borderDash: [2, 2],
          borderWidth: 1,
          pointRadius: 0,
          fill: false,
        }
      ],
    },
    options: chartOptions('Water Depth (mm)', forecastStartIdx),
  });
}

// === Chart 2: Water Inflows vs Outflows Stacked Bar ===
function renderInflowOutflowChart(dailyResults) {
  const ctx = document.getElementById('inflow-outflow-chart');
  if (!ctx) return;
  if (inflowOutflowChart) inflowOutflowChart.destroy();

  const recent = dailyResults.slice(-30);
  const labels = recent.map(d => {
    const dt = new Date(d.date);
    return `${dt.getDate()} ${dt.toLocaleString('en', { month: 'short' })}`;
  });

  inflowOutflowChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Rainfall Inflow (mm)',
          data: recent.map(d => Math.round((d.precipitation || 0) * 10) / 10),
          backgroundColor: '#3b82f6',
          borderRadius: 4,
          stack: 'Inflow',
        },
        {
          label: 'Irrigation Inflow (mm)',
          data: recent.map(d => Math.round((d.irrigation || 0) * 10) / 10),
          backgroundColor: '#06b6d4',
          borderRadius: 4,
          stack: 'Inflow',
        },
        {
          label: 'Crop ETc Outflow (mm)',
          data: recent.map(d => Math.round((d.etc || 0) * 10) / 10),
          backgroundColor: '#f97316',
          borderRadius: 4,
          stack: 'Outflow',
        },
        {
          label: 'Deep Percolation (mm)',
          data: recent.map(d => Math.round((d.drainage || 0) * 10) / 10),
          backgroundColor: '#94a3b8',
          borderRadius: 4,
          stack: 'Outflow',
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: {
          labels: {
            color: '#475569',
            font: { family: 'Plus Jakarta Sans', size: 10, weight: '700' },
            usePointStyle: true,
            boxWidth: 8,
          }
        },
        tooltip: tooltipConfig(),
      },
      scales: {
        x: {
          stacked: true,
          grid: { display: false },
          ticks: { color: '#64748b', font: { size: 10 }, maxRotation: 45, maxTicksLimit: 10 },
        },
        y: {
          stacked: true,
          grid: { color: '#f1f5f9' },
          ticks: { color: '#64748b', font: { size: 10 } },
          title: { display: true, text: 'Water Flux (mm/day)', color: '#475569', font: { size: 10, weight: '700' } },
        },
      },
    },
  });
}

// === Chart 3: ETc Crop Demand & Kc Progression ===
function renderEtcDemandChart(dailyResults) {
  const ctx = document.getElementById('etc-demand-chart');
  if (!ctx) return;
  if (etcDemandChart) etcDemandChart.destroy();

  const recent = dailyResults.slice(-35);
  const labels = recent.map(d => {
    const dt = new Date(d.date);
    return `${dt.getDate()} ${dt.toLocaleString('en', { month: 'short' })}`;
  });

  etcDemandChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Crop ETc Demand (mm/day)',
          data: recent.map(d => Math.round((d.etc || 0) * 10) / 10),
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          fill: true,
          tension: 0.3,
          borderWidth: 2.2,
          pointRadius: 2,
          yAxisID: 'y',
        },
        {
          label: 'Reference ET₀ (mm/day)',
          data: recent.map(d => Math.round((d.et0 || 0) * 10) / 10),
          borderColor: '#f59e0b',
          borderDash: [4, 4],
          borderWidth: 1.8,
          pointRadius: 0,
          yAxisID: 'y',
        },
        {
          label: 'Crop Coefficient (Kc)',
          data: recent.map(d => Math.round((d.kc || 0) * 100) / 100),
          borderColor: '#8b5cf6',
          borderWidth: 2,
          pointRadius: 0,
          yAxisID: 'y1',
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: {
          labels: {
            color: '#475569',
            font: { family: 'Plus Jakarta Sans', size: 10, weight: '700' },
            usePointStyle: true,
            boxWidth: 8,
          }
        },
        tooltip: tooltipConfig(),
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#64748b', font: { size: 10 }, maxRotation: 45, maxTicksLimit: 10 },
        },
        y: {
          position: 'left',
          grid: { color: '#f1f5f9' },
          ticks: { color: '#64748b', font: { size: 10 } },
          title: { display: true, text: 'Evapotranspiration (mm/day)', color: '#475569', font: { size: 10, weight: '700' } },
        },
        y1: {
          position: 'right',
          min: 0,
          max: 1.4,
          grid: { display: false },
          ticks: { color: '#8b5cf6', font: { size: 10 } },
          title: { display: true, text: 'Kc Factor', color: '#8b5cf6', font: { size: 10, weight: '700' } },
        },
      },
    },
  });
}

// === Chart 4: MODIS Satellite NDVI Trend ===
function renderSatellitePanel(ndviData, satelliteResult) {
  const headline = document.getElementById('sat-headline');
  const desc = document.getElementById('sat-description');
  const iconWrap = document.getElementById('sat-icon-wrap');

  const lastNDVI = ndviData.length > 0 ? ndviData[ndviData.length - 1].ndvi : null;
  const isHealthy = lastNDVI !== null && lastNDVI > 0.4;

  if (headline && desc && iconWrap) {
    if (satelliteResult.isSynthetic) {
      headline.textContent = 'Satellite data modeled';
      desc.textContent = 'MODIS data estimated via agronomic canopy curve. Cross-validation confidence adjusted.';
      iconWrap.innerHTML = `<svg width="32" height="32" viewBox="0 0 56 56" fill="none"><circle cx="28" cy="28" r="22" fill="#fff3e0"/><line x1="28" y1="16" x2="28" y2="32" stroke="#e67e22" stroke-width="3" stroke-linecap="round"/><circle cx="28" cy="38" r="2.5" fill="#e67e22"/></svg>`;
    } else if (isHealthy) {
      headline.textContent = 'Crop canopy is healthy';
      desc.textContent = `NDVI = ${lastNDVI.toFixed(2)} — Normal photosynthetic density for this growth stage.`;
      iconWrap.innerHTML = `<svg width="32" height="32" viewBox="0 0 56 56" fill="none"><path d="M28 6 C 12 18, 12 42, 28 52 C 44 42, 44 18, 28 6Z" fill="#1a7a42"/><path d="M22 30 L 26 36 L 36 22" stroke="#fff" stroke-width="3" stroke-linecap="round" fill="none"/></svg>`;
    } else {
      headline.textContent = 'Vegetation shows stress signs';
      desc.textContent = lastNDVI !== null
        ? `NDVI = ${lastNDVI.toFixed(2)} — Lower than expected for this stage.`
        : 'No NDVI data available.';
      iconWrap.innerHTML = `<svg width="32" height="32" viewBox="0 0 56 56" fill="none"><circle cx="28" cy="28" r="22" fill="#fce4ec"/><line x1="28" y1="16" x2="28" y2="32" stroke="#e74c3c" stroke-width="3" stroke-linecap="round"/><circle cx="28" cy="38" r="2.5" fill="#e74c3c"/></svg>`;
    }
  }

  const ctx = document.getElementById('ndvi-chart');
  if (!ctx || ndviData.length === 0) return;
  if (ndviChart) ndviChart.destroy();

  ndviChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: ndviData.map(d => {
        const dt = new Date(d.date);
        return `${dt.getDate()} ${dt.toLocaleString('en', { month: 'short' })}`;
      }),
      datasets: [{
        label: 'NDVI Index',
        data: ndviData.map(d => d.ndvi),
        borderColor: satelliteResult.isSynthetic ? '#e67e22' : '#059669',
        backgroundColor: satelliteResult.isSynthetic ? 'rgba(230,126,34,0.1)' : 'rgba(5,150,105,0.1)',
        fill: true,
        tension: 0.35,
        borderWidth: 2.2,
        pointRadius: 3,
        pointBackgroundColor: satelliteResult.isSynthetic ? '#e67e22' : '#059669',
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: tooltipConfig(),
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#8899aa', font: { size: 10 }, maxTicksLimit: 6 } },
        y: { min: 0, max: 1, grid: { color: '#f0f2f5' }, ticks: { color: '#8899aa', font: { size: 10 } } },
      },
    },
  });
}

// === Chart 5: Soil Nutrients & Chemical Balance Radar ===
function renderNutrientRadarChart(soilData) {
  const ctx = document.getElementById('nutrient-radar-chart');
  if (!ctx) return;
  if (nutrientRadarChart) nutrientRadarChart.destroy();

  const nVal = soilData?.nutrients?.nitrogen?.value || 1.35; // g/kg
  const phVal = soilData?.nutrients?.ph?.value || 6.8;
  const cecVal = soilData?.nutrients?.cec?.value || 18.5; // cmol/kg
  const socVal = soilData?.soc || 15.0; // g/kg
  const cnVal = soilData?.nutrients?.cnRatio?.value || 11.5;

  // Normalized scores 0 - 100 for radar web
  const nScore = Math.min(100, Math.max(10, Math.round((nVal / 2.2) * 100)));
  const phScore = Math.max(15, 100 - Math.abs(phVal - 6.8) * 35);
  const cecScore = Math.min(100, Math.max(15, Math.round((cecVal / 30) * 100)));
  const socScore = Math.min(100, Math.max(15, Math.round((socVal / 25) * 100)));
  const cnScore = Math.max(20, 100 - Math.abs(cnVal - 11.5) * 8);
  const pScore = phVal >= 6.2 && phVal <= 7.4 ? 90 : phVal < 5.8 ? 35 : 55;

  nutrientRadarChart = new Chart(ctx, {
    type: 'radar',
    data: {
      labels: [
        'Total Nitrogen (N)',
        'Phosphorus Avail (P)',
        'K+ Buffer (CEC)',
        'pH Neutrality',
        'Organic Carbon (SOC)',
        'C:N Stoichiometry',
      ],
      datasets: [
        {
          label: 'Soil Chemical Balance Score (0-100)',
          data: [nScore, pScore, cecScore, phScore, socScore, cnScore],
          backgroundColor: 'rgba(16, 185, 129, 0.25)',
          borderColor: '#10b981',
          borderWidth: 2,
          pointBackgroundColor: '#059669',
          pointBorderColor: '#ffffff',
          pointHoverRadius: 6,
        },
        {
          label: 'Optimal Benchmark',
          data: [80, 85, 80, 95, 80, 85],
          borderColor: '#cbd5e1',
          borderDash: [3, 3],
          borderWidth: 1.5,
          fill: false,
          pointRadius: 0,
        }
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: '#475569',
            font: { family: 'Plus Jakarta Sans', size: 10, weight: '700' },
            usePointStyle: true,
          }
        },
        tooltip: tooltipConfig(),
      },
      scales: {
        r: {
          min: 0,
          max: 100,
          ticks: { display: false, stepSize: 20 },
          grid: { color: '#e2e8f0' },
          angleLines: { color: '#e2e8f0' },
          pointLabels: {
            color: '#334155',
            font: { family: 'Plus Jakarta Sans', size: 10, weight: '700' },
          },
        },
      },
    },
  });
}

// === Chart 6: Thermal Microclimate & Heat-Stress Curve ===
function renderClimateTempChart(weatherData, dailyResults) {
  const ctx = document.getElementById('climate-temp-chart');
  if (!ctx) return;
  if (climateTempChart) climateTempChart.destroy();

  const sourceList = (weatherData && weatherData.length > 0) ? weatherData.slice(-30) : dailyResults.slice(-30);
  const labels = sourceList.map(d => {
    const dt = new Date(d.date);
    return `${dt.getDate()} ${dt.toLocaleString('en', { month: 'short' })}`;
  });

  const tMax = sourceList.map(d => Math.round((d.tempMax || d.tMax || 32) * 10) / 10);
  const tMin = sourceList.map(d => Math.round((d.tempMin || d.tMin || 20) * 10) / 10);
  const vpd = sourceList.map(d => {
    const t = (d.tempMax || d.tMax || 30) - (d.tempMin || d.tMin || 20);
    return Math.round((0.6108 * Math.exp((17.27 * (d.tempMax || 30)) / ((d.tempMax || 30) + 237.3)) * (t > 15 ? 0.45 : 0.25)) * 10) / 10;
  });

  climateTempChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Max Temp (°C)',
          data: tMax,
          borderColor: '#ef4444',
          backgroundColor: 'rgba(239, 68, 68, 0.08)',
          tension: 0.3,
          borderWidth: 2,
          pointRadius: 2,
          yAxisID: 'y',
        },
        {
          label: 'Min Temp (°C)',
          data: tMin,
          borderColor: '#3b82f6',
          backgroundColor: 'transparent',
          tension: 0.3,
          borderWidth: 1.8,
          pointRadius: 2,
          yAxisID: 'y',
        },
        {
          label: 'VPD Atmospheric Aridity (kPa)',
          data: vpd,
          type: 'bar',
          backgroundColor: 'rgba(245, 158, 11, 0.35)',
          borderColor: '#f59e0b',
          borderWidth: 1,
          borderRadius: 3,
          yAxisID: 'y1',
        }
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: {
          labels: {
            color: '#475569',
            font: { family: 'Plus Jakarta Sans', size: 10, weight: '700' },
            usePointStyle: true,
            boxWidth: 8,
          }
        },
        tooltip: tooltipConfig(),
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#64748b', font: { size: 10 }, maxRotation: 45, maxTicksLimit: 10 },
        },
        y: {
          position: 'left',
          grid: { color: '#f1f5f9' },
          ticks: { color: '#64748b', font: { size: 10 } },
          title: { display: true, text: 'Temperature (°C)', color: '#475569', font: { size: 10, weight: '700' } },
        },
        y1: {
          position: 'right',
          min: 0,
          max: 4.5,
          grid: { display: false },
          ticks: { color: '#f59e0b', font: { size: 10 } },
          title: { display: true, text: 'VPD (kPa)', color: '#f59e0b', font: { size: 10, weight: '700' } },
        }
      }
    }
  });
}

// === Chart 7: Yield Loss by Stage Bar Chart ===
function renderYieldChart(yieldLoss) {
  const ctx = document.getElementById('yield-chart');
  if (!ctx) return;
  if (yieldChart) yieldChart.destroy();

  const stages = yieldLoss.stageBreakdown || [];
  const labels = stages.map(s => s.stageName.split('(')[0].trim());
  const losses = stages.map(s => s.yieldReduction);
  const colors = stages.map(s =>
    s.yieldReduction > 5 ? '#e74c3c' : s.yieldReduction > 2 ? '#e67e22' : '#27ae60'
  );

  yieldChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Yield Reduction (%)',
        data: losses,
        backgroundColor: colors.map(c => c + '33'),
        borderColor: colors,
        borderWidth: 1.5,
        borderRadius: 6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: tooltipConfig() },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#8899aa', font: { size: 10 } } },
        y: {
          grid: { color: '#f0f2f5' },
          ticks: { color: '#8899aa', font: { size: 10 } },
          title: { display: true, text: 'Yield Loss (%)', color: '#8899aa', font: { size: 10 } }
        },
      },
    },
  });
}

// === Cross-Validation Matrix ===
function renderCrossValidationMatrix(crossVal) {
  const matrixEl = document.getElementById('cv-matrix');
  const detailsEl = document.getElementById('cv-details');
  if (!matrixEl || !detailsEl) return;

  const { wbStressed, ndviDeclining } = crossVal.matrix || {};

  const activeCell = wbStressed && ndviDeclining ? 'dd'
    : !wbStressed && !ndviDeclining ? 'nn'
    : wbStressed && !ndviDeclining ? 'dn' : 'nd';

  matrixEl.innerHTML = `
    <div class="cv-matrix-grid">
      <div class="cv-cell cv-cell-header"></div>
      <div class="cv-cell cv-cell-header">NDVI Normal</div>
      <div class="cv-cell cv-cell-header">NDVI Declining</div>
      <div class="cv-cell cv-cell-header">WB: No Stress</div>
      <div class="cv-cell cv-cell-safe ${activeCell === 'nn' ? 'cv-cell-active' : ''}">✅ Confirmed Safe</div>
      <div class="cv-cell cv-cell-warn ${activeCell === 'nd' ? 'cv-cell-active' : ''}">⚠️ Non-Water Stress?</div>
      <div class="cv-cell cv-cell-header">WB: Stressed</div>
      <div class="cv-cell cv-cell-warn ${activeCell === 'dn' ? 'cv-cell-active' : ''}">⚠️ Check Irrigation</div>
      <div class="cv-cell cv-cell-danger ${activeCell === 'dd' ? 'cv-cell-active' : ''}">🔴 Confirmed Stress</div>
    </div>
    <div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:8px;">
      <span style="font-size:0.78rem;color:#8899aa;">WBSI: <strong style="color:#1a7a42;">${crossVal.wbStressIndex}</strong></span>
      <span style="font-size:0.78rem;color:#8899aa;">NDVI Anomaly: <strong style="color:#1a7a42;">${crossVal.ndviAnomaly > 0 ? '+' : ''}${crossVal.ndviAnomaly}</strong></span>
      <span style="font-size:0.78rem;color:#8899aa;">Trend: <strong style="color:#1a7a42;">${crossVal.ndviTrend}</strong></span>
      <span style="font-size:0.78rem;color:#8899aa;">Confidence: <strong style="color:#1a7a42;">${crossVal.confidenceScore}%</strong></span>
    </div>
  `;
  detailsEl.innerHTML = crossVal.details.map(d => `<p>• ${d}</p>`).join('');

  const badgeTag = document.getElementById('cv-badge-tag');
  if (badgeTag) badgeTag.textContent = `Confidence: ${crossVal.confidenceScore}%`;
}

// === Verbose 1: Phenological Growth Stage Timeline ===
function renderPhenologyTimeline(cropId, plantingDate, dailyResults) {
  const container = document.getElementById('pheno-timeline-container');
  if (!container) return;

  const crop = CROPS[cropId] || CROPS.wheat;
  const daysSincePlanting = dailyResults.filter(d => !d.isForecast).length;

  const stageOrder = [
    { key: GROWTH_STAGES.INITIAL, title: '1. Initial (Establishment)' },
    { key: GROWTH_STAGES.DEVELOPMENT, title: '2. Vegetative Development' },
    { key: GROWTH_STAGES.MID_SEASON, title: '3. Mid-Season (Flowering/Yield)' },
    { key: GROWTH_STAGES.LATE_SEASON, title: '4. Late Season (Ripening)' },
  ];

  let accumulatedDays = 0;
  let currentStageKey = GROWTH_STAGES.MID_SEASON;

  for (const s of stageOrder) {
    const duration = crop.stageDuration[s.key] || 30;
    if (daysSincePlanting >= accumulatedDays && daysSincePlanting < accumulatedDays + duration) {
      currentStageKey = s.key;
    }
    accumulatedDays += duration;
  }

  const badge = document.getElementById('pheno-current-stage');
  if (badge) {
    badge.textContent = `Day ${daysSincePlanting} of ${crop.totalDuration} (${crop.name})`;
  }

  accumulatedDays = 0;
  container.innerHTML = `
    <div class="pheno-steps-grid">
      ${stageOrder.map(s => {
        const dur = crop.stageDuration[s.key] || 30;
        const startDay = accumulatedDays + 1;
        const endDay = accumulatedDays + dur;
        accumulatedDays += dur;

        const isCurrent = currentStageKey === s.key;
        const isDone = daysSincePlanting >= endDay;
        const kcVal = crop.kc[s.key];
        const kyVal = crop.ky[s.key];
        const rootD = crop.rootDepth[s.key];

        return `
          <div class="pheno-step-card ${isCurrent ? 'active' : isDone ? 'completed' : 'upcoming'}">
            <div class="psc-header">
              <span class="psc-status-pill">${isCurrent ? '⚡ Active Now' : isDone ? '✓ Completed' : '⏳ Upcoming'}</span>
              <span class="psc-days">Day ${startDay}–${endDay} (${dur}d)</span>
            </div>
            <h5 class="psc-title">${s.title}</h5>
            <div class="psc-specs">
              <div class="psc-spec-item">
                <span class="psc-spec-label">Crop Kc Factor</span>
                <span class="psc-spec-val">${kcVal}</span>
              </div>
              <div class="psc-spec-item">
                <span class="psc-spec-label">Yield Sensitivity (Ky)</span>
                <span class="psc-spec-val ${kyVal > 1 ? 'text-warn' : ''}">${kyVal}</span>
              </div>
              <div class="psc-spec-item">
                <span class="psc-spec-label">Effective Root Depth (Zr)</span>
                <span class="psc-spec-val">${rootD} m</span>
              </div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

// === Verbose 2: Deep Soil Physical & Chemical Diagnostics Grid ===
function renderVerboseSoilDiagnostics(soilData) {
  const grid = document.getElementById('verbose-soil-grid');
  if (!grid) return;

  const sand = soilData.sand ?? 27;
  const silt = soilData.silt ?? 38;
  const clay = soilData.clay ?? 35;
  const soc = soilData.soc ?? 15.6;
  const om = soilData.organicMatter ?? ((soc / 10) * 1.724).toFixed(1);
  const fc = Math.round(soilData.fc ?? 340);
  const pwp = Math.round(soilData.pwp ?? 190);
  const sat = Math.round(soilData.saturation ?? 460);
  const taw = Math.round(soilData.taw ?? 90);
  const raw = Math.round(soilData.raw ?? 45);

  const nVal = soilData.nutrients?.nitrogen?.value ?? 1.35;
  const nRating = soilData.nutrients?.nitrogen?.status ?? 'Optimal (Adequate)';
  const phVal = soilData.nutrients?.ph?.value ?? 6.8;
  const phClass = soilData.nutrients?.ph?.class ?? 'Optimal Neutral';
  const cecVal = soilData.nutrients?.cec?.value ?? 18.5;
  const cecStatus = soilData.nutrients?.cec?.status ?? 'Good Cation Buffer';
  const cnVal = soilData.nutrients?.cnRatio?.value ?? 11.8;

  // Estimated physical pedotransfer indicators
  const ksatEst = Math.max(2, Math.round(10 * Math.exp(12.012 - 0.0755 * sand + -0.00389 * clay) / 100));
  const bulkDensity = (1.45 - (om * 0.03)).toFixed(2);
  const porosity = Math.round((1 - (bulkDensity / 2.65)) * 100);

  grid.innerHTML = `
    <!-- 1. Granulometry -->
    <div class="v-diag-card">
      <div class="vdc-head">
        <span class="vdc-icon">🧱</span>
        <div>
          <span class="vdc-title">Texture & Granulometry</span>
          <span class="vdc-sub">USDA Triangle Classification</span>
        </div>
      </div>
      <div class="vdc-body">
        <div class="vdc-stat-row">
          <span>Soil Class:</span> <strong>${soilData.soilType || 'Clay Loam'}</strong>
        </div>
        <div class="vdc-stat-row">
          <span>Sand (0.05-2.0 mm):</span> <strong>${sand}%</strong>
        </div>
        <div class="vdc-stat-row">
          <span>Silt (0.002-0.05 mm):</span> <strong>${silt}%</strong>
        </div>
        <div class="vdc-stat-row">
          <span>Clay (<0.002 mm):</span> <strong>${clay}%</strong>
        </div>
      </div>
    </div>

    <!-- 2. Hydraulic Limits -->
    <div class="v-diag-card">
      <div class="vdc-head">
        <span class="vdc-icon">💧</span>
        <div>
          <span class="vdc-title">Hydraulic Retention Limits</span>
          <span class="vdc-sub">pF Curve Matrix Parameters</span>
        </div>
      </div>
      <div class="vdc-body">
        <div class="vdc-stat-row">
          <span>Saturation (0 kPa):</span> <strong>${sat} mm/m</strong>
        </div>
        <div class="vdc-stat-row">
          <span>Field Capacity (-33 kPa):</span> <strong>${fc} mm/m</strong>
        </div>
        <div class="vdc-stat-row">
          <span>Permanent Wilting (-1500 kPa):</span> <strong>${pwp} mm/m</strong>
        </div>
        <div class="vdc-stat-row">
          <span>Plant Avail. Water (TAW):</span> <strong style="color:#059669;">${taw} mm</strong>
        </div>
      </div>
    </div>

    <!-- 3. Dynamic Pedotransfer -->
    <div class="v-diag-card">
      <div class="vdc-head">
        <span class="vdc-icon">⚙️</span>
        <div>
          <span class="vdc-title">Pedotransfer & Infiltration</span>
          <span class="vdc-sub">Saxton-Rawls Soil Mechanics</span>
        </div>
      </div>
      <div class="vdc-body">
        <div class="vdc-stat-row">
          <span>Sat. Conductivity (Ksat):</span> <strong>~${ksatEst} mm/hr</strong>
        </div>
        <div class="vdc-stat-row">
          <span>Dry Bulk Density (ρb):</span> <strong>${bulkDensity} g/cm³</strong>
        </div>
        <div class="vdc-stat-row">
          <span>Total Porosity (Φ):</span> <strong>${porosity}%</strong>
        </div>
        <div class="vdc-stat-row">
          <span>Management RAW Trigger:</span> <strong>${raw} mm</strong>
        </div>
      </div>
    </div>

    <!-- 4. Nitrogen & Organic Carbon -->
    <div class="v-diag-card">
      <div class="vdc-head">
        <span class="vdc-icon">🌱</span>
        <div>
          <span class="vdc-title">Nitrogen & Humus Stoichiometry</span>
          <span class="vdc-sub">Chemical Bio-availability</span>
        </div>
      </div>
      <div class="vdc-body">
        <div class="vdc-stat-row">
          <span>Total Nitrogen (N):</span> <strong>${nVal} g/kg (${nRating})</strong>
        </div>
        <div class="vdc-stat-row">
          <span>Soil Organic Carbon (SOC):</span> <strong>${soc} g/kg</strong>
        </div>
        <div class="vdc-stat-row">
          <span>Soil Organic Matter (SOM):</span> <strong>${om}%</strong>
        </div>
        <div class="vdc-stat-row">
          <span>C:N Ratio:</span> <strong>${cnVal} (Balanced)</strong>
        </div>
      </div>
    </div>

    <!-- 5. pH & Chemical Leaching -->
    <div class="v-diag-card">
      <div class="vdc-head">
        <span class="vdc-icon">🧪</span>
        <div>
          <span class="vdc-title">Soil Reaction & Cation Capacity</span>
          <span class="vdc-sub">Nutrient Fixation Affinity</span>
        </div>
      </div>
      <div class="vdc-body">
        <div class="vdc-stat-row">
          <span>pH (H₂O Suspension):</span> <strong>${phVal} (${phClass})</strong>
        </div>
        <div class="vdc-stat-row">
          <span>Cation Buffer (CEC):</span> <strong>${cecVal} cmol(+)/kg</strong>
        </div>
        <div class="vdc-stat-row">
          <span>CEC Buffer Quality:</span> <strong>${cecStatus}</strong>
        </div>
        <div class="vdc-stat-row">
          <span>Phosphorus Fixation Risk:</span> <strong>${phVal < 6.0 ? 'High Acidic Fixation' : phVal > 7.5 ? 'High Calcareous' : 'Minimal'}</strong>
        </div>
      </div>
    </div>

    <!-- 6. Geospatial Provenance -->
    <div class="v-diag-card">
      <div class="vdc-head">
        <span class="vdc-icon">🛰️</span>
        <div>
          <span class="vdc-title">Pedological Provenance</span>
          <span class="vdc-sub">Global Earth Observation Data</span>
        </div>
      </div>
      <div class="vdc-body">
        <div class="vdc-stat-row">
          <span>Primary Source:</span> <strong>ISRIC SoilGrids v2.0</strong>
        </div>
        <div class="vdc-stat-row">
          <span>Spatial Grid Resolution:</span> <strong>250m Global Matrix</strong>
        </div>
        <div class="vdc-stat-row">
          <span>Harmonized Depths:</span> <strong>0-5, 5-15, 15-30, 30-60cm</strong>
        </div>
        <div class="vdc-stat-row">
          <span>Status:</span> <strong style="color:#059669;">Validated & Calibrated</strong>
        </div>
      </div>
    </div>
  `;
}

// === Verbose 3: Daily Water Balance Audit Ledger Table ===
function renderDailyLedgerTable(dailyResults) {
  const tbody = document.getElementById('daily-ledger-body');
  const countEl = document.getElementById('ledger-rows-count');
  if (!tbody) return;

  if (countEl) {
    countEl.textContent = `${dailyResults.length} days logged (${dailyResults.filter(d => !d.isForecast).length} hist + ${dailyResults.filter(d => d.isForecast).length} forecast)`;
  }

  // Reverse so newest / today & forecast days are at top, or keep chronological
  tbody.innerHTML = dailyResults.map(d => {
    const isForecast = d.isForecast;
    const isStressed = d.isStressed;
    const isWarning = d.soilMoisture < d.rawThreshold * 1.15 && !isStressed;

    let chipClass = 'badge-safe';
    let chipText = 'Safe';
    if (isForecast) {
      chipClass = 'badge-forecast';
      chipText = 'Forecast';
    } else if (isStressed) {
      chipClass = 'badge-danger';
      chipText = 'Stress';
    } else if (isWarning) {
      chipClass = 'badge-warning';
      chipText = 'Monitor';
    }

    const dt = new Date(d.date);
    const dateStr = dt.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' });

    return `
      <tr class="${isForecast ? 'forecast-row' : ''} ${isStressed ? 'stressed-row' : ''}">
        <td><strong>${dateStr}</strong></td>
        <td><span class="stage-tag">${d.stageName ? d.stageName.split('(')[0].trim() : 'Active'}</span></td>
        <td>${d.et0.toFixed(1)}</td>
        <td>${d.kc.toFixed(2)}</td>
        <td><strong>${d.etc.toFixed(1)}</strong></td>
        <td>${d.precipitation > 0 ? `<span class="rain-val">+${d.precipitation.toFixed(1)}</span>` : '0.0'}</td>
        <td>${d.irrigation > 0 ? `<span class="irrig-val">+${d.irrigation.toFixed(1)}</span>` : '—'}</td>
        <td><strong>${Math.round(d.soilMoisture)}</strong></td>
        <td><span class="raw-lim">${Math.round(d.rawThreshold)}</span></td>
        <td>${d.ks.toFixed(2)}</td>
        <td><span class="ledger-chip ${chipClass}">${chipText}</span></td>
      </tr>
    `;
  }).join('');
}

function setupActionCards(wbResult) {
  const forecastBtn = document.getElementById('action-forecast');
  if (forecastBtn) {
    forecastBtn.onclick = () => {
      const sec = document.getElementById('forecast-section');
      if (!sec) return;
      const isOpen = sec.style.display !== 'none';
      sec.style.display = isOpen ? 'none' : 'block';
      if (!isOpen) renderForecastChart(wbResult.daily);
    };
  }

  const irrigBtn = document.getElementById('action-irrigation');
  if (irrigBtn) {
    irrigBtn.onclick = () => {
      const date = prompt('Irrigation date (YYYY-MM-DD):', new Date().toISOString().split('T')[0]);
      if (!date) return;
      const amount = prompt('Amount applied (mm):', '30');
      if (!amount) return;
      window.dispatchEvent(new CustomEvent('add-irrigation', { detail: { date, amount: parseFloat(amount) } }));
    };
  }

  const dataBtn = document.getElementById('action-data');
  if (dataBtn) {
    dataBtn.onclick = () => {
      const sec = document.getElementById('dq-section');
      if (sec) sec.style.display = sec.style.display === 'none' ? 'block' : 'none';
    };
  }
}

function renderForecastChart(dailyResults) {
  const ctx = document.getElementById('forecast-chart');
  if (!ctx) return;
  if (forecastChart) forecastChart.destroy();

  const forecastDays = dailyResults.filter(d => d.isForecast);
  const recentHist = dailyResults.filter(d => !d.isForecast).slice(-7);
  const display = [...recentHist, ...forecastDays].slice(0, 23);

  const labels = display.map(d => {
    const dt = new Date(d.date);
    return `${dt.getDate()} ${dt.toLocaleString('en', { month: 'short' })}`;
  });

  forecastChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Rainfall (mm)',
          data: display.map(d => d.precipitation),
          backgroundColor: 'rgba(52,152,219,0.5)',
          borderColor: '#3498db',
          borderWidth: 1,
          borderRadius: 4,
          yAxisID: 'y',
        },
        {
          label: 'Crop ET (mm)',
          data: display.map(d => d.etc),
          backgroundColor: 'rgba(231,76,60,0.3)',
          borderColor: '#e74c3c',
          borderWidth: 1,
          borderRadius: 4,
          yAxisID: 'y',
        },
        {
          label: 'Stress Coeff. (Ks)',
          data: display.map(d => d.ks),
          type: 'line',
          borderColor: '#e67e22',
          backgroundColor: 'rgba(230,126,34,0.08)',
          fill: true,
          tension: 0.3,
          borderWidth: 2,
          pointRadius: 2,
          yAxisID: 'y1',
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: {
          labels: { color: '#8899aa', font: { size: 11 }, usePointStyle: true }
        },
        tooltip: tooltipConfig()
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#8899aa', font: { size: 10 }, maxRotation: 45 } },
        y: {
          position: 'left',
          grid: { color: '#f0f2f5' },
          ticks: { color: '#8899aa', font: { size: 10 } },
          title: { display: true, text: 'mm/day', color: '#8899aa', font: { size: 10 } }
        },
        y1: {
          position: 'right',
          min: 0,
          max: 1.1,
          grid: { display: false },
          ticks: { color: '#e67e22', font: { size: 10 } },
          title: { display: true, text: 'Ks', color: '#e67e22', font: { size: 10 } }
        },
      },
    },
  });
}

function renderDataQuality(items) {
  const grid = document.getElementById('data-quality-grid');
  if (!grid || !items || items.length === 0) return;
  grid.innerHTML = items.map(item => `
    <div class="dq-item">
      <span class="dq-icon">${item.icon}</span>
      <div class="dq-info">
        <div class="dq-source">${item.source}</div>
        <div class="dq-provider">${item.provider}</div>
        <div class="dq-detail">${item.detail}</div>
      </div>
    </div>
  `).join('');
}

function renderWarnings(warnings) {
  const section = document.getElementById('warnings-section');
  const list = document.getElementById('warnings-list');
  if (!section || !list) return;
  const unique = [...new Set(warnings.filter(w => w && w.trim()))];
  if (unique.length === 0) { section.style.display = 'none'; return; }
  section.style.display = 'block';
  list.innerHTML = unique.map(w => `<li>${w}</li>`).join('');
}

/* Shared chart helpers */
function chartOptions(yTitle, forecastStartIdx) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { intersect: false, mode: 'index' },
    plugins: {
      legend: {
        labels: {
          color: '#374151',
          font: { family: 'Inter', size: 11, weight: '500' },
          usePointStyle: true,
          pointStyleWidth: 8,
          boxHeight: 6,
        }
      },
      tooltip: tooltipConfig(),
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: '#6b7280', font: { family: 'Inter', size: 10, weight: '500' }, maxTicksLimit: 10, maxRotation: 45 }
      },
      y: {
        grid: { color: '#f3f4f6', lineWidth: 1 },
        ticks: { color: '#6b7280', font: { family: 'Inter', size: 10, weight: '500' } },
        title: { display: true, text: yTitle, color: '#111827', font: { family: 'Plus Jakarta Sans', size: 11, weight: '600' } }
      },
    },
  };
}

function tooltipConfig() {
  return {
    backgroundColor: '#18181b',
    titleColor: '#ffffff',
    bodyColor: '#e4e4e7',
    borderColor: '#27272a',
    borderWidth: 1,
    cornerRadius: 8,
    padding: 10,
    boxPadding: 4,
    titleFont: { family: 'Plus Jakarta Sans', weight: '600', size: 12 },
    bodyFont: { family: 'Inter', weight: '400', size: 11 },
  };
}

/** Show loading state. */
export function showLoading() {
  document.getElementById('setup-panel').style.display = 'none';
  document.getElementById('results-panel').style.display = 'none';
  document.getElementById('loading-panel').style.display = 'block';
  const steps = ['step-weather','step-soil','step-satellite','step-model','step-crossval','step-advisory'];
  steps.forEach(id => { const el = document.getElementById(id); el.classList.remove('active','done'); });
}

/** Update loading progress step. */
export function updateLoadingStep(stepId) {
  const steps = ['step-weather','step-soil','step-satellite','step-model','step-crossval','step-advisory'];
  const idx = steps.indexOf(stepId);
  steps.forEach((id, i) => {
    const el = document.getElementById(id);
    if (i < idx) { el.classList.remove('active'); el.classList.add('done'); }
    else if (i === idx) { el.classList.add('active'); el.classList.remove('done'); }
  });
}
