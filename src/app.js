/**
 * Associate Performance 2.0 - Main Application Controller
 */

import { 
  filterDataset, 
  getStoreKPIs, 
  getWeeklyTrends, 
  getAssociateAggregates, 
  getDayOfWeekHeatmap, 
  getPickSpeedDistribution, 
  getFTPRDistribution, 
  getAssociate360, 
  classifyQuadrant, 
  getAvailableWeeks, 
  parsePDFScheduleText, 
  classifyUtilization,
  parseDateToISO,
  getDatasetDateBounds,
  generateCustomDataFeedback
} from './utils/dataProcessor.js';

import {
  fetchPerformanceFromSupabase,
  saveCoachingNoteToSupabase,
  fetchCoachingNoteFromSupabase,
  insertPerformanceBatchToSupabase
} from './config/supabaseClient.js';

// Application State
let activeDataset = [];
let datasetBounds = { minDate: '2026-05-23', maxDate: '2026-08-07', totalDays: 77 };
let filterMode = 'week'; // 'week' | 'custom'
let currentWeek = 'all';
let currentStartDate = null;
let currentEndDate = null;
let currentPreset = 'all';
let currentSearch = '';
let currentQuadrant = 'all';
let currentUtilTier = 'all';
let scatterMetric = 'active'; // 'active' | 'shift'
let sortColumn = 'pickRate';
let sortAscending = false;

// Feedback Studio State
let feedbackAssociate = '';
let feedbackStartDate = null;
let feedbackEndDate = null;
let feedbackPreset = 'all';
let currentFeedbackData = null;

// Modal Associate 360 State
let modalCurrentAssociate = '';
let modalStartDate = null;
let modalEndDate = null;

// Chart Instances
let chartVolumeSpeed = null;
let chartAccuracySub = null;
let chartScatterMatrix = null;
let chartPickRateDist = null;
let chartFTPRDist = null;
let chartModalTrend = null;
let chartFeedbackTrend = null;

document.addEventListener('DOMContentLoaded', async () => {
  const cloudStatusText = document.getElementById('cloudStatusText');
  const cloudStatusBadge = document.getElementById('cloudStatusBadge');

  try {
    // Attempt to load from Supabase PostgreSQL Database first
    const cloudData = await fetchPerformanceFromSupabase();
    if (cloudData && cloudData.length > 0) {
      activeDataset = cloudData;
      if (cloudStatusText) cloudStatusText.textContent = `Cloud Synced (${cloudData.length.toLocaleString()} rows)`;
    } else {
      throw new Error("No data from cloud, loading local JSON fallback");
    }
  } catch (err) {
    console.warn('Supabase fetch failed, loading local fallback dataset:', err);
    try {
      const res = await fetch('./src/data/initialData.json');
      activeDataset = await res.json();
      if (cloudStatusText) cloudStatusText.textContent = `Local Fallback (${activeDataset.length.toLocaleString()} rows)`;
      if (cloudStatusBadge) {
        cloudStatusBadge.style.background = 'rgba(245, 158, 11, 0.15)';
        cloudStatusBadge.style.color = '#F59E0B';
        cloudStatusBadge.style.borderColor = 'rgba(245, 158, 11, 0.3)';
      }
    } catch (localErr) {
      console.error('Failed to load initial dataset:', localErr);
    }
  }

  initApp();
});

function initApp() {
  datasetBounds = getDatasetDateBounds(activeDataset);
  
  // Set default filter dates from dataset bounds
  currentStartDate = datasetBounds.minDate;
  currentEndDate = datasetBounds.maxDate;
  feedbackStartDate = datasetBounds.minDate;
  feedbackEndDate = datasetBounds.maxDate;

  // Initialize global date inputs
  const startInput = document.getElementById('filterStartDate');
  const endInput = document.getElementById('filterEndDate');
  if (startInput) {
    startInput.min = datasetBounds.minDate;
    startInput.max = datasetBounds.maxDate;
    startInput.value = datasetBounds.minDate;
  }
  if (endInput) {
    endInput.min = datasetBounds.minDate;
    endInput.max = datasetBounds.maxDate;
    endInput.value = datasetBounds.maxDate;
  }

  // Initialize feedback date inputs
  const fbStart = document.getElementById('feedbackStartDate');
  const fbEnd = document.getElementById('feedbackEndDate');
  if (fbStart) {
    fbStart.min = datasetBounds.minDate;
    fbStart.max = datasetBounds.maxDate;
    fbStart.value = datasetBounds.minDate;
  }
  if (fbEnd) {
    fbEnd.min = datasetBounds.minDate;
    fbEnd.max = datasetBounds.maxDate;
    fbEnd.value = datasetBounds.maxDate;
  }

  if (window.lucide) window.lucide.createIcons();

  populateWeekDropdown();
  populateFeedbackAssociateDropdown();
  setupEventListeners();
  renderAllViews();
}

function getFilteredActiveDataset() {
  if (filterMode === 'custom') {
    return filterDataset(activeDataset, {
      startDate: currentStartDate,
      endDate: currentEndDate,
      search: '',
      quadrant: 'all',
      utilTier: 'all'
    });
  } else {
    return filterDataset(activeDataset, {
      week: currentWeek,
      search: '',
      quadrant: 'all',
      utilTier: 'all'
    });
  }
}

function populateWeekDropdown() {
  const weekSelect = document.getElementById('weekSelect');
  if (!weekSelect) return;

  const weeks = getAvailableWeeks(activeDataset);
  if (weeks.length === 0) return;

  const minWk = weeks[0];
  const maxWk = weeks[weeks.length - 1];

  let html = `<option value="all">📅 All Weeks (Wk ${minWk} – ${maxWk})</option>`;
  weeks.forEach(w => {
    html += `<option value="${w}">Week ${w}</option>`;
  });

  weekSelect.innerHTML = html;
  weekSelect.value = currentWeek;
}

function populateFeedbackAssociateDropdown() {
  const select = document.getElementById('feedbackAssocSelect');
  if (!select) return;

  const associates = getAssociateAggregates(activeDataset.filter(r => !r.isTotal));
  associates.sort((a, b) => a.name.localeCompare(b.name));

  let html = '<option value="">👤 Select an associate to review...</option>';
  associates.forEach(a => {
    html += `<option value="${a.name}">${a.name} (${a.quadrant.name})</option>`;
  });

  select.innerHTML = html;
  if (feedbackAssociate) select.value = feedbackAssociate;
}

function computePresetDates(preset, baseMaxDate) {
  const maxD = baseMaxDate ? new Date(baseMaxDate + 'T00:00:00') : new Date(datasetBounds.maxDate + 'T00:00:00');
  let startD = new Date(datasetBounds.minDate + 'T00:00:00');

  if (preset === '7d') {
    startD = new Date(maxD.getTime() - (6 * 24 * 60 * 60 * 1000));
  } else if (preset === '14d') {
    startD = new Date(maxD.getTime() - (13 * 24 * 60 * 60 * 1000));
  } else if (preset === '30d') {
    startD = new Date(maxD.getTime() - (29 * 24 * 60 * 60 * 1000));
  } else if (preset === 'all') {
    startD = new Date(datasetBounds.minDate + 'T00:00:00');
  }

  const minBound = new Date(datasetBounds.minDate + 'T00:00:00');
  if (startD < minBound) startD = minBound;

  const startIso = startD.toISOString().split('T')[0];
  const maxIso = maxD.toISOString().split('T')[0];

  return { startIso, endIso: maxIso };
}

function setupEventListeners() {
  // Tab Navigation
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.view-section').forEach(s => s.classList.remove('active'));

      const targetView = btn.dataset.view;
      btn.classList.add('active');
      const viewEl = document.getElementById(`view${capitalize(targetView)}`);
      if (viewEl) viewEl.classList.add('active');

      if (targetView === 'feedback') {
        renderFeedbackStudio();
      } else {
        setTimeout(() => {
          renderCharts();
        }, 50);
      }
    });
  });

  // Week Selector
  const weekSelect = document.getElementById('weekSelect');
  if (weekSelect) {
    weekSelect.addEventListener('change', (e) => {
      currentWeek = e.target.value;
      filterMode = 'week';
      renderAllViews();
    });
  }

  // Filter Mode Toggle (Week vs Custom Date Range)
  const btnToggleDateMode = document.getElementById('btnToggleDateMode');
  const weekContainer = document.getElementById('weekFilterContainer');
  const customDateContainer = document.getElementById('customDateControls');
  const dateModeLabel = document.getElementById('dateModeLabel');
  const dateModeIcon = document.getElementById('dateModeIcon');

  if (btnToggleDateMode) {
    btnToggleDateMode.addEventListener('click', () => {
      if (filterMode === 'week') {
        filterMode = 'custom';
        if (weekContainer) weekContainer.style.display = 'none';
        if (customDateContainer) customDateContainer.style.display = 'flex';
        if (dateModeLabel) dateModeLabel.textContent = 'Fiscal Weeks';
        if (dateModeIcon) dateModeIcon.setAttribute('data-lucide', 'calendar');
      } else {
        filterMode = 'week';
        if (weekContainer) weekContainer.style.display = 'flex';
        if (customDateContainer) customDateContainer.style.display = 'none';
        if (dateModeLabel) dateModeLabel.textContent = 'Date Range';
        if (dateModeIcon) dateModeIcon.setAttribute('data-lucide', 'calendar-range');
      }
      if (window.lucide) window.lucide.createIcons();
      renderAllViews();
    });
  }

  // Global Date Inputs
  const startInput = document.getElementById('filterStartDate');
  const endInput = document.getElementById('filterEndDate');
  const presetSelect = document.getElementById('presetDateSelect');

  if (startInput) {
    startInput.addEventListener('change', (e) => {
      currentStartDate = e.target.value;
      if (presetSelect) presetSelect.value = 'custom';
      renderAllViews();
    });
  }

  if (endInput) {
    endInput.addEventListener('change', (e) => {
      currentEndDate = e.target.value;
      if (presetSelect) presetSelect.value = 'custom';
      renderAllViews();
    });
  }

  if (presetSelect) {
    presetSelect.addEventListener('change', (e) => {
      const p = e.target.value;
      if (p !== 'custom') {
        const { startIso, endIso } = computePresetDates(p);
        currentStartDate = startIso;
        currentEndDate = endIso;
        if (startInput) startInput.value = startIso;
        if (endInput) endInput.value = endIso;
        renderAllViews();
      }
    });
  }

  // Reset / Clear Filter Buttons
  const btnResetGlobal = document.getElementById('btnResetGlobalFilter');
  const btnClearBanner = document.getElementById('btnClearFilterBanner');

  const resetAllFilters = () => {
    filterMode = 'week';
    currentWeek = 'all';
    currentStartDate = datasetBounds.minDate;
    currentEndDate = datasetBounds.maxDate;
    if (weekSelect) weekSelect.value = 'all';
    if (startInput) startInput.value = datasetBounds.minDate;
    if (endInput) endInput.value = datasetBounds.maxDate;
    if (presetSelect) presetSelect.value = 'all';
    if (weekContainer) weekContainer.style.display = 'flex';
    if (customDateContainer) customDateContainer.style.display = 'none';
    if (dateModeLabel) dateModeLabel.textContent = 'Date Range';
    if (dateModeIcon) dateModeIcon.setAttribute('data-lucide', 'calendar-range');
    if (window.lucide) window.lucide.createIcons();
    renderAllViews();
  };

  if (btnResetGlobal) btnResetGlobal.addEventListener('click', resetAllFilters);
  if (btnClearBanner) btnClearBanner.addEventListener('click', resetAllFilters);

  // Roster Search
  const rosterSearch = document.getElementById('rosterSearch');
  if (rosterSearch) {
    rosterSearch.addEventListener('input', (e) => {
      currentSearch = e.target.value;
      renderRosterTable();
    });
  }

  // Roster Quadrant Filter
  const rosterQuadFilter = document.getElementById('rosterQuadrantFilter');
  if (rosterQuadFilter) {
    rosterQuadFilter.addEventListener('change', (e) => {
      currentQuadrant = e.target.value;
      renderRosterTable();
    });
  }

  // Roster Utilization Tier Filter
  const rosterUtilFilter = document.getElementById('rosterUtilFilter');
  if (rosterUtilFilter) {
    rosterUtilFilter.addEventListener('change', (e) => {
      currentUtilTier = e.target.value;
      renderRosterTable();
    });
  }

  // Scatter Matrix Toggle Buttons (Active Speed vs Shift PPH)
  const btnToggleActive = document.getElementById('btnToggleActiveSpeed');
  const btnToggleShift = document.getElementById('btnToggleShiftPPH');
  if (btnToggleActive && btnToggleShift) {
    btnToggleActive.addEventListener('click', () => {
      scatterMetric = 'active';
      btnToggleActive.classList.add('active');
      btnToggleShift.classList.remove('active');
      renderCharts();
    });
    btnToggleShift.addEventListener('click', () => {
      scatterMetric = 'shift';
      btnToggleShift.classList.add('active');
      btnToggleActive.classList.remove('active');
      renderCharts();
    });
  }

  // Quadrant Cards Quick Filter
  document.querySelectorAll('.quadrant-card').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.id.replace('filterQuad', '').toLowerCase();
      const quadMap = {
        'pacesetter': 'pacesetter',
        'speeddemon': 'speed-demon',
        'qualitychampion': 'quality-champion',
        'opportunity': 'opportunity'
      };
      const quadId = quadMap[id] || 'all';
      currentQuadrant = currentQuadrant === quadId ? 'all' : quadId;

      const rosterTab = document.querySelector('[data-view="roster"]');
      if (rosterTab) rosterTab.click();
      if (rosterQuadFilter) rosterQuadFilter.value = currentQuadrant;
      renderRosterTable();
    });
  });

  // Table Header Sort
  document.querySelectorAll('#rosterTable th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.sort;
      if (sortColumn === col) {
        sortAscending = !sortAscending;
      } else {
        sortColumn = col;
        sortAscending = false;
      }
      renderRosterTable();
    });
  });

  // Export CSV
  const btnExportCSV = document.getElementById('btnExportCSV');
  if (btnExportCSV) {
    btnExportCSV.addEventListener('click', exportRosterCSV);
  }

  // Theme Toggle
  const btnTheme = document.getElementById('btnThemeToggle');
  if (btnTheme) {
    btnTheme.addEventListener('click', () => {
      const html = document.documentElement;
      const cur = html.getAttribute('data-theme');
      const next = cur === 'light' ? 'dark' : 'light';
      html.setAttribute('data-theme', next);
      const icon = document.getElementById('themeIcon');
      if (icon) icon.setAttribute('data-lucide', next === 'light' ? 'sun' : 'moon');
      if (window.lucide) window.lucide.createIcons();
    });
  }

  // File Upload Modals
  const btnOpenUpload = document.getElementById('btnOpenUpload');
  const btnCloseUpload = document.getElementById('btnCloseUpload');
  const modalUpload = document.getElementById('modalUpload');
  const fileDropzone = document.getElementById('fileDropzone');
  const fileInput = document.getElementById('fileInput');

  if (btnOpenUpload && modalUpload) {
    btnOpenUpload.addEventListener('click', () => {
      document.getElementById('modalUploadTitle').textContent = "Import Fulfillment Data File";
      document.getElementById('modalUploadDesc').textContent = "Upload weekly associate performance reports (.xlsx) or daily shift schedules (.csv / .xlsx).";
      modalUpload.classList.add('active');
    });
  }
  if (btnCloseUpload && modalUpload) {
    btnCloseUpload.addEventListener('click', () => modalUpload.classList.remove('active'));
  }
  if (fileDropzone && fileInput) {
    fileDropzone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileUpload);
  }

  // Metric Guide Modal
  const btnOpenGlossary = document.getElementById('btnOpenGlossary');
  const btnCloseGlossary = document.getElementById('btnCloseGlossary');
  const modalGlossary = document.getElementById('modalGlossary');

  if (btnOpenGlossary && modalGlossary) {
    btnOpenGlossary.addEventListener('click', () => modalGlossary.classList.add('active'));
  }
  if (btnCloseGlossary && modalGlossary) {
    btnCloseGlossary.addEventListener('click', () => modalGlossary.classList.remove('active'));
  }

  // Modal 360 Close & Handlers
  const btnClose360 = document.getElementById('btnClose360');
  const modal360 = document.getElementById('modalAssociate360');
  if (btnClose360 && modal360) {
    btnClose360.addEventListener('click', () => modal360.classList.remove('active'));
  }

  const modalStartInput = document.getElementById('modalStartDate');
  const modalEndInput = document.getElementById('modalEndDate');
  const modalPreset = document.getElementById('modalPresetSelect');

  if (modalStartInput) {
    modalStartInput.addEventListener('change', (e) => {
      modalStartDate = e.target.value;
      if (modalPreset) modalPreset.value = 'custom';
      renderModalAssociate360Content();
    });
  }
  if (modalEndInput) {
    modalEndInput.addEventListener('change', (e) => {
      modalEndDate = e.target.value;
      if (modalPreset) modalPreset.value = 'custom';
      renderModalAssociate360Content();
    });
  }
  if (modalPreset) {
    modalPreset.addEventListener('change', (e) => {
      const p = e.target.value;
      if (p !== 'custom') {
        const { startIso, endIso } = computePresetDates(p);
        modalStartDate = startIso;
        modalEndDate = endIso;
        if (modalStartInput) modalStartInput.value = startIso;
        if (modalEndInput) modalEndInput.value = endIso;
        renderModalAssociate360Content();
      }
    });
  }

  const btnModalOpenFeedback = document.getElementById('btnModalOpenFeedbackStudio');
  if (btnModalOpenFeedback) {
    btnModalOpenFeedback.addEventListener('click', () => {
      if (modal360) modal360.classList.remove('active');
      feedbackAssociate = modalCurrentAssociate;
      feedbackStartDate = modalStartDate || datasetBounds.minDate;
      feedbackEndDate = modalEndDate || datasetBounds.maxDate;

      const fbTab = document.querySelector('[data-view="feedback"]');
      if (fbTab) fbTab.click();

      const fbSelect = document.getElementById('feedbackAssocSelect');
      if (fbSelect) fbSelect.value = feedbackAssociate;
      const fbS = document.getElementById('feedbackStartDate');
      const fbE = document.getElementById('feedbackEndDate');
      if (fbS) fbS.value = feedbackStartDate;
      if (fbE) fbE.value = feedbackEndDate;

      renderFeedbackStudio();
    });
  }

  // Simulator Sliders
  const simPickRange = document.getElementById('simPickRateRange');
  const simFTPRRange = document.getElementById('simFTPRRange');
  if (simPickRange) simPickRange.addEventListener('input', updateSimulator);
  if (simFTPRRange) simFTPRRange.addEventListener('input', updateSimulator);

  // Custom Data Feedback Studio Controls
  setupFeedbackStudioEventListeners();
}

function setupFeedbackStudioEventListeners() {
  const fbSelect = document.getElementById('feedbackAssocSelect');
  const fbStart = document.getElementById('feedbackStartDate');
  const fbEnd = document.getElementById('feedbackEndDate');
  const btnSyncGlobal = document.getElementById('btnApplyFeedbackRangeToGlobal');
  const btnCopyScript = document.getElementById('btnCopyFeedbackScript');
  const btnCopyScriptInline = document.getElementById('btnCopyScriptInline');
  const btnPrintReport = document.getElementById('btnPrintFeedbackReport');
  const btnSaveNotes = document.getElementById('btnSaveManagerNotes');
  const notesTextarea = document.getElementById('feedbackManagerNotes');

  if (fbSelect) {
    fbSelect.addEventListener('change', (e) => {
      feedbackAssociate = e.target.value;
      renderFeedbackStudio();
    });
  }

  if (fbStart) {
    fbStart.addEventListener('change', (e) => {
      feedbackStartDate = e.target.value;
      document.querySelectorAll('.preset-chips-group .preset-chip').forEach(c => c.classList.remove('active'));
      renderFeedbackStudio();
    });
  }

  if (fbEnd) {
    fbEnd.addEventListener('change', (e) => {
      feedbackEndDate = e.target.value;
      document.querySelectorAll('.preset-chips-group .preset-chip').forEach(c => c.classList.remove('active'));
      renderFeedbackStudio();
    });
  }

  document.querySelectorAll('.preset-chips-group .preset-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.preset-chips-group .preset-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      const p = chip.dataset.fpreset;
      const { startIso, endIso } = computePresetDates(p);
      feedbackStartDate = startIso;
      feedbackEndDate = endIso;
      if (fbStart) fbStart.value = startIso;
      if (fbEnd) fbEnd.value = endIso;
      renderFeedbackStudio();
    });
  });

  if (btnSyncGlobal) {
    btnSyncGlobal.addEventListener('click', () => {
      if (!feedbackStartDate || !feedbackEndDate) return;
      filterMode = 'custom';
      currentStartDate = feedbackStartDate;
      currentEndDate = feedbackEndDate;

      const weekContainer = document.getElementById('weekFilterContainer');
      const customDateContainer = document.getElementById('customDateControls');
      const startInput = document.getElementById('filterStartDate');
      const endInput = document.getElementById('filterEndDate');
      const dateModeLabel = document.getElementById('dateModeLabel');
      const dateModeIcon = document.getElementById('dateModeIcon');

      if (weekContainer) weekContainer.style.display = 'none';
      if (customDateContainer) customDateContainer.style.display = 'flex';
      if (startInput) startInput.value = currentStartDate;
      if (endInput) endInput.value = currentEndDate;
      if (dateModeLabel) dateModeLabel.textContent = 'Fiscal Weeks';
      if (dateModeIcon) dateModeIcon.setAttribute('data-lucide', 'calendar');
      if (window.lucide) window.lucide.createIcons();

      renderAllViews();

      const execTab = document.querySelector('[data-view="executive"]');
      if (execTab) execTab.click();
    });
  }

  const copyScriptHandler = () => {
    if (!currentFeedbackData || !currentFeedbackData.feedbackScript) return;
    navigator.clipboard.writeText(currentFeedbackData.feedbackScript).then(() => {
      if (btnCopyScript) {
        const orig = btnCopyScript.innerHTML;
        btnCopyScript.innerHTML = `<i data-lucide="check"></i><span>Copied!</span>`;
        if (window.lucide) window.lucide.createIcons();
        setTimeout(() => { btnCopyScript.innerHTML = orig; if (window.lucide) window.lucide.createIcons(); }, 2000);
      }
      if (btnCopyScriptInline) {
        const orig = btnCopyScriptInline.innerHTML;
        btnCopyScriptInline.innerHTML = `<i data-lucide="check"></i> Copied!`;
        if (window.lucide) window.lucide.createIcons();
        setTimeout(() => { btnCopyScriptInline.innerHTML = orig; if (window.lucide) window.lucide.createIcons(); }, 2000);
      }
    }).catch(err => {
      console.error('Clipboard copy failed:', err);
    });
  };

  if (btnCopyScript) btnCopyScript.addEventListener('click', copyScriptHandler);
  if (btnCopyScriptInline) btnCopyScriptInline.addEventListener('click', copyScriptHandler);

  if (btnPrintReport) {
    btnPrintReport.addEventListener('click', () => {
      window.print();
    });
  }

  if (btnSaveNotes && notesTextarea) {
    btnSaveNotes.addEventListener('click', async () => {
      if (!feedbackAssociate) return;
      const key = `ap2_notes_${feedbackAssociate}_${feedbackStartDate}_${feedbackEndDate}`;
      localStorage.setItem(key, notesTextarea.value);
      
      const statusEl = document.getElementById('feedbackNotesStatus');
      if (statusEl) {
        statusEl.style.display = 'block';
        statusEl.textContent = 'Saving to cloud database...';
      }

      const isCloudSaved = await saveCoachingNoteToSupabase({
        associateName: feedbackAssociate,
        startDate: feedbackStartDate,
        endDate: feedbackEndDate,
        notesText: notesTextarea.value
      });

      if (statusEl) {
        statusEl.textContent = isCloudSaved ? '✓ Saved to Supabase Cloud & Local Cache' : '✓ Saved to Local Cache';
        setTimeout(() => { statusEl.style.display = 'none'; }, 3000);
      }
    });
  }
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function updateFilterStatusBar(filteredRows) {
  const statusBar = document.getElementById('activeFilterStatusBar');
  const summaryEl = document.getElementById('activeFilterSummary');
  const resetBtn = document.getElementById('btnResetGlobalFilter');

  if (!statusBar || !summaryEl) return;

  const isCustomActive = filterMode === 'custom' && (currentStartDate !== datasetBounds.minDate || currentEndDate !== datasetBounds.maxDate);
  const isWeekActive = filterMode === 'week' && currentWeek !== 'all';

  if (isCustomActive) {
    statusBar.style.display = 'flex';
    if (resetBtn) resetBtn.style.display = 'inline-flex';
    const datesSet = new Set(filteredRows.filter(r => r.day).map(r => r.day));
    summaryEl.textContent = `Custom Date Range: ${currentStartDate} to ${currentEndDate} (${datesSet.size} active days • ${filteredRows.length.toLocaleString()} shift logs)`;
  } else if (isWeekActive) {
    statusBar.style.display = 'flex';
    if (resetBtn) resetBtn.style.display = 'inline-flex';
    summaryEl.textContent = `Fiscal Week ${currentWeek} Filter Active (${filteredRows.length.toLocaleString()} shift logs)`;
  } else {
    statusBar.style.display = 'none';
    if (resetBtn) resetBtn.style.display = 'none';
  }
}

function renderAllViews() {
  const filtered = getFilteredActiveDataset();

  updateFilterStatusBar(filtered);
  renderKPIs(filtered);
  renderCharts();
  renderRosterTable();
  renderHeatmap();
  updateSimulator();
}

function renderKPIs(rows) {
  const kpis = getStoreKPIs(rows);

  document.getElementById('kpiTotalVolume').textContent = kpis.totalExpected.toLocaleString();
  document.getElementById('kpiFTPR').textContent = `${kpis.ftprPct}%`;
  document.getElementById('kpiPickRate').textContent = `${kpis.pickRate} i/h`;

  const kpiShiftPPH = document.getElementById('kpiShiftPPH');
  const kpiShiftSub = document.getElementById('kpiShiftPPHSub');
  const kpiUtil = document.getElementById('kpiUtilization');
  const kpiUtilSub = document.getElementById('kpiUtilizationSub');

  if (kpis.hasScheduleData || parseFloat(kpis.shiftPPH) > 0) {
    if (kpiShiftPPH) kpiShiftPPH.textContent = `${kpis.shiftPPH} PPH`;
    if (kpiShiftSub) kpiShiftSub.textContent = `Based on ${kpis.shiftHours.toFixed(0)} shift hrs`;
    if (kpiUtil) kpiUtil.textContent = `${kpis.utilization}%`;
    if (kpiUtilSub) kpiUtilSub.textContent = `${kpis.nonPickHours} non-pick hrs`;
  } else {
    if (kpiShiftPPH) kpiShiftPPH.textContent = `--`;
    if (kpiShiftSub) kpiShiftSub.textContent = `Import Excel/CSV schedule to calculate`;
    if (kpiUtil) kpiUtil.textContent = `--%`;
    if (kpiUtilSub) kpiUtilSub.textContent = `Active vs Worked hours`;
  }

  document.getElementById('kpiSubNil').textContent = `${kpis.substitutions.toLocaleString()} / ${kpis.nilPicks.toLocaleString()}`;
  document.getElementById('kpiSubNilPct').textContent = `${kpis.subPct}% Subs | ${kpis.nilPct}% Nil`;
}

function renderCharts() {
  const filteredRows = getFilteredActiveDataset();
  const trends = getWeeklyTrends(filteredRows.length > 0 ? filteredRows : activeDataset);
  const associates = getAssociateAggregates(filteredRows);

  // 1. Chart Volume & Speed
  const ctxVol = document.getElementById('chartVolumeSpeed');
  if (ctxVol) {
    if (chartVolumeSpeed) chartVolumeSpeed.destroy();
    chartVolumeSpeed = new Chart(ctxVol, {
      type: 'bar',
      data: {
        labels: trends.map(t => t.week),
        datasets: [
          {
            label: 'Picked Volume (Items)',
            data: trends.map(t => t.expected),
            backgroundColor: 'rgba(59, 130, 246, 0.4)',
            borderColor: '#3B82F6',
            borderWidth: 2,
            borderRadius: 6,
            yAxisID: 'y'
          },
          {
            label: 'Avg Active Pick Speed (i/h)',
            data: trends.map(t => t.pickRate),
            type: 'line',
            borderColor: '#10B981',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            borderWidth: 3,
            pointRadius: 5,
            pointBackgroundColor: '#10B981',
            tension: 0.3,
            yAxisID: 'y1'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { ticks: { color: '#94A3B8' }, grid: { color: 'rgba(255,255,255,0.05)' } },
          y: { position: 'left', ticks: { color: '#94A3B8' }, grid: { color: 'rgba(255,255,255,0.05)' } },
          y1: { position: 'right', ticks: { color: '#10B981' }, grid: { drawOnChartArea: false } }
        },
        plugins: { legend: { labels: { color: '#F8FAFC' } } }
      }
    });
  }

  // 2. Chart Accuracy & Subs
  const ctxAcc = document.getElementById('chartAccuracySub');
  if (ctxAcc) {
    if (chartAccuracySub) chartAccuracySub.destroy();
    chartAccuracySub = new Chart(ctxAcc, {
      type: 'line',
      data: {
        labels: trends.map(t => t.week),
        datasets: [
          {
            label: 'Store FTPR Accuracy %',
            data: trends.map(t => t.ftpr),
            borderColor: '#10B981',
            borderWidth: 3,
            tension: 0.3,
            pointRadius: 5
          },
          {
            label: 'Substitutions',
            data: trends.map(t => t.substitutions),
            borderColor: '#8B5CF6',
            borderWidth: 2,
            borderDash: [5, 5],
            tension: 0.3,
            pointRadius: 4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { ticks: { color: '#94A3B8' }, grid: { color: 'rgba(255,255,255,0.05)' } },
          y: { ticks: { color: '#94A3B8' }, grid: { color: 'rgba(255,255,255,0.05)' } }
        },
        plugins: { legend: { labels: { color: '#F8FAFC' } } }
      }
    });
  }

  // 3. Scatter Matrix (Speed vs Accuracy or Shift PPH vs Accuracy)
  const ctxScatter = document.getElementById('chartScatterMatrix');
  if (ctxScatter) {
    if (chartScatterMatrix) chartScatterMatrix.destroy();

    const isShift = (scatterMetric === 'shift');

    const scatterData = associates.map(a => {
      const speedVal = isShift ? (a.shiftPPH > 0 ? a.shiftPPH : a.pickRate) : a.pickRate;
      return {
        x: speedVal,
        y: parseFloat(a.ftprPct),
        name: a.name,
        quad: a.quadrant,
        shiftPPH: a.shiftPPH,
        activeRate: a.pickRate,
        util: a.utilization
      };
    });

    const counts = {
      pacesetter: associates.filter(a => a.quadrant.id === 'pacesetter').length,
      speedDemon: associates.filter(a => a.quadrant.id === 'speed-demon').length,
      qualityChampion: associates.filter(a => a.quadrant.id === 'quality-champion').length,
      opportunity: associates.filter(a => a.quadrant.id === 'opportunity').length
    };

    const countPacesetters = document.getElementById('countPacesetters');
    const countSpeedDemons = document.getElementById('countSpeedDemons');
    const countQualityChampions = document.getElementById('countQualityChampions');
    const countOpportunity = document.getElementById('countOpportunity');

    if (countPacesetters) countPacesetters.textContent = counts.pacesetter;
    if (countSpeedDemons) countSpeedDemons.textContent = counts.speedDemon;
    if (countQualityChampions) countQualityChampions.textContent = counts.qualityChampion;
    if (countOpportunity) countOpportunity.textContent = counts.opportunity;

    chartScatterMatrix = new Chart(ctxScatter, {
      type: 'scatter',
      data: {
        datasets: [{
          label: 'Associates',
          data: scatterData,
          backgroundColor: (ctx) => {
            const raw = ctx.raw;
            return raw ? raw.quad.color : '#3B82F6';
          },
          pointRadius: 6,
          pointHoverRadius: 9
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            title: { 
              display: true, 
              text: isShift ? 'True Shift PPH (Picks / Worked Hour)' : 'Active Pick Rate (Items / Hour)', 
              color: '#94A3B8' 
            },
            ticks: { color: '#94A3B8' },
            grid: { color: 'rgba(255,255,255,0.05)' }
          },
          y: {
            title: { display: true, text: 'First Time Pick Rate % (FTPR)', color: '#94A3B8' },
            ticks: { color: '#94A3B8' },
            grid: { color: 'rgba(255,255,255,0.05)' },
            min: 80,
            max: 100
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const r = ctx.raw;
                if (r.shiftPPH > 0) {
                  return `${r.name}: ${r.x} PPH (${r.activeRate} Active IPH) | ${r.y}% FTPR | ${r.util}% Util`;
                }
                return `${r.name}: ${r.x} i/h | ${r.y}% FTPR (${r.quad.name})`;
              }
            }
          }
        }
      }
    });
  }

  // 4. Pick Speed Distribution Chart
  const ctxSpeedDist = document.getElementById('chartPickRateDist');
  if (ctxSpeedDist) {
    if (chartPickRateDist) chartPickRateDist.destroy();
    const speedDist = getPickSpeedDistribution(associates, scatterMetric === 'shift');
    chartPickRateDist = new Chart(ctxSpeedDist, {
      type: 'bar',
      data: {
        labels: Object.keys(speedDist),
        datasets: [{
          label: 'Number of Pickers',
          data: Object.values(speedDist),
          backgroundColor: ['#F43F5E', '#F59E0B', '#3B82F6', '#8B5CF6', '#10B981'],
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { ticks: { color: '#94A3B8' }, grid: { color: 'rgba(255,255,255,0.05)' } },
          y: { ticks: { color: '#94A3B8' }, grid: { color: 'rgba(255,255,255,0.05)' } }
        },
        plugins: { legend: { display: false } }
      }
    });
  }

  // 5. FTPR Accuracy Distribution Chart
  const ctxFTPRDist = document.getElementById('chartFTPRDist');
  if (ctxFTPRDist) {
    if (chartFTPRDist) chartFTPRDist.destroy();
    const ftprDist = getFTPRDistribution(associates);
    chartFTPRDist = new Chart(ctxFTPRDist, {
      type: 'bar',
      data: {
        labels: Object.keys(ftprDist),
        datasets: [{
          label: 'Number of Pickers',
          data: Object.values(ftprDist),
          backgroundColor: ['#F43F5E', '#F59E0B', '#8B5CF6', '#3B82F6', '#10B981'],
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { ticks: { color: '#94A3B8' }, grid: { color: 'rgba(255,255,255,0.05)' } },
          y: { ticks: { color: '#94A3B8' }, grid: { color: 'rgba(255,255,255,0.05)' } }
        },
        plugins: { legend: { display: false } }
      }
    });
  }
}

function renderRosterTable() {
  const filteredRows = getFilteredActiveDataset();
  let associates = getAssociateAggregates(filteredRows);

  if (currentSearch.trim()) {
    const q = currentSearch.toLowerCase().trim();
    associates = associates.filter(a => a.name.toLowerCase().includes(q));
  }

  if (currentQuadrant !== 'all') {
    associates = associates.filter(a => a.quadrant.id === currentQuadrant);
  }

  if (currentUtilTier !== 'all') {
    associates = associates.filter(a => a.utilTier.tier === currentUtilTier);
  }

  associates.sort((a, b) => {
    let valA = a[sortColumn];
    let valB = b[sortColumn];

    if (sortColumn === 'quadrant') {
      valA = a.quadrant.name;
      valB = b.quadrant.name;
    } else if (sortColumn === 'utilTier') {
      valA = a.utilTier.label;
      valB = b.utilTier.label;
    }

    if (valA < valB) return sortAscending ? -1 : 1;
    if (valA > valB) return sortAscending ? 1 : -1;
    return 0;
  });

  const tbody = document.getElementById('rosterTbody');
  if (!tbody) return;

  const isDetailed = (filterMode === 'week' && currentWeek !== 'all') || (filterMode === 'custom');

  let html = '';
  associates.forEach((a, idx) => {
    const rowId = `daily-row-${idx}`;
    const assocDailyRows = filteredRows.filter(r => r.associate === a.name);

    html += `
      <tr data-associate="${a.name}" class="${isDetailed ? 'roster-row-expandable' : ''}" data-target="${rowId}">
        <td style="font-weight: 700;">
          ${isDetailed ? `<i data-lucide="chevron-right" class="expand-icon" style="vertical-align: middle; margin-right: 4px; width: 14px; height: 14px; transition: transform 0.2s;"></i>` : ''}
          ${a.name}
        </td>
        <td><span class="badge ${a.quadrant.badgeClass}">${a.quadrant.name}</span></td>
        <td><span class="badge ${a.utilTier.badgeClass}">${a.utilTier.label}</span></td>
        <td style="font-family: var(--font-mono); font-weight: 600;">${a.pickRate}</td>
        <td style="font-family: var(--font-mono); font-weight: 700; color: ${a.shiftPPH > 0 ? 'var(--accent-emerald)' : 'var(--text-dim)'};">
          ${a.shiftPPH > 0 ? `${a.shiftPPH} PPH` : '--'}
        </td>
        <td style="font-family: var(--font-mono); font-weight: 600; color: ${a.utilization >= 70 ? 'var(--accent-emerald)' : (a.utilization >= 40 ? 'var(--accent-amber)' : 'var(--accent-blue)')};">
          ${a.shiftHours > 0 ? `${a.utilization}%` : '--%'}
        </td>
        <td>${a.shiftHours > 0 ? `${a.nonPickHours} hrs` : '--'}</td>
        <td style="font-family: var(--font-mono); font-weight: 600; color: ${a.ftpr >= 0.94 ? 'var(--accent-emerald)' : 'var(--text-main)'};">${a.ftprPct}%</td>
        <td>${a.totalPicked.toLocaleString()}</td>
        <td style="white-space: nowrap;">
          <button class="btn btn-secondary btn-sm btn-view-360" data-name="${a.name}" style="padding: 0.35rem 0.65rem; font-size: 0.75rem; margin-right: 4px;">
            <i data-lucide="eye"></i> 360°
          </button>
          <button class="btn btn-primary btn-sm btn-open-feedback" data-name="${a.name}" style="padding: 0.35rem 0.65rem; font-size: 0.75rem;">
            <i data-lucide="message-square-quote"></i> Feedback
          </button>
        </td>
      </tr>
    `;

    if (isDetailed) {
      assocDailyRows.forEach(dr => {
        const drTotal = (dr.pickedAsReq || 0) + (dr.substitutions || 0);
        const drPPH = dr.shiftHours > 0 ? (drTotal / dr.shiftHours).toFixed(1) : '--';
        const drUtil = dr.shiftHours > 0 ? `${((dr.pickHours / dr.shiftHours) * 100).toFixed(1)}%` : '--%';
        const drFtpr = ((dr.ftpr || 0) * 100).toFixed(1) + '%';
        const drNonPick = dr.shiftHours ? (Math.max(0, dr.shiftHours - dr.pickHours)).toFixed(1) + ' hrs' : '--';

        html += `
          <tr class="${rowId}" style="display: none; background: rgba(15, 23, 42, 0.6); font-size: 0.78rem; border-left: 3px solid var(--accent-cyan);">
            <td style="padding-left: 1.75rem; font-weight: 600; color: var(--accent-cyan);">${dr.day}</td>
            <td><span style="font-size: 0.7rem; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.05em; background: rgba(255,255,255,0.05); padding: 2px 6px; border-radius: 4px;">Daily Log</span></td>
            <td></td>
            <td style="font-family: var(--font-mono); font-weight: 600;">${dr.pickRate ? dr.pickRate.toFixed(1) : '--'}</td>
            <td style="font-family: var(--font-mono); font-weight: 700; color: ${drPPH !== '--' ? 'var(--accent-emerald)' : 'var(--text-dim)'};">${drPPH !== '--' ? `${drPPH} PPH` : '--'}</td>
            <td style="font-family: var(--font-mono); font-weight: 600;">${drUtil}</td>
            <td style="font-family: var(--font-mono);">${drNonPick}</td>
            <td style="font-family: var(--font-mono); font-weight: 600;">${drFtpr}</td>
            <td style="font-family: var(--font-mono); font-weight: 600;">${drTotal.toLocaleString()}</td>
            <td></td>
          </tr>
        `;
      });
    }
  });

  tbody.innerHTML = html;
  if (window.lucide) window.lucide.createIcons();

  // Attach event handlers
  document.querySelectorAll('.btn-view-360').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const name = btn.dataset.name;
      if (name) openAssociate360Modal(name);
    });
  });

  document.querySelectorAll('.btn-open-feedback').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const name = btn.dataset.name;
      if (name) {
        feedbackAssociate = name;
        const fbTab = document.querySelector('[data-view="feedback"]');
        if (fbTab) fbTab.click();
        const fbSelect = document.getElementById('feedbackAssocSelect');
        if (fbSelect) fbSelect.value = name;
        renderFeedbackStudio();
      }
    });
  });

  if (isDetailed) {
    document.querySelectorAll('.roster-row-expandable').forEach(row => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        const targetClass = row.dataset.target;
        const subRows = document.querySelectorAll(`.${targetClass}`);
        const icon = row.querySelector('.expand-icon');
        
        let isOpening = false;
        subRows.forEach(sr => {
          if (sr.style.display === 'none') {
            sr.style.display = 'table-row';
            isOpening = true;
          } else {
            sr.style.display = 'none';
          }
        });

        if (icon) {
          icon.style.transform = isOpening ? 'rotate(90deg)' : 'rotate(0deg)';
        }
      });
    });
  }
}

function openAssociate360Modal(name) {
  modalCurrentAssociate = name;
  modalStartDate = currentStartDate || datasetBounds.minDate;
  modalEndDate = currentEndDate || datasetBounds.maxDate;

  const modalStartInput = document.getElementById('modalStartDate');
  const modalEndInput = document.getElementById('modalEndDate');
  const modalPreset = document.getElementById('modalPresetSelect');

  if (modalStartInput) modalStartInput.value = modalStartDate;
  if (modalEndInput) modalEndInput.value = modalEndDate;
  if (modalPreset) modalPreset.value = 'all';

  renderModalAssociate360Content();

  const modal = document.getElementById('modalAssociate360');
  if (modal) modal.classList.add('active');
}

function renderModalAssociate360Content() {
  if (!modalCurrentAssociate) return;
  const data = getAssociate360(activeDataset, modalCurrentAssociate, {
    startDate: modalStartDate,
    endDate: modalEndDate
  });

  if (!data) return;

  const initials = modalCurrentAssociate.split(' ').map(n => n[0]).join('').substring(0, 2);
  const avatar = document.getElementById('modalAvatar');
  const nameEl = document.getElementById('modalAssocName');
  if (avatar) avatar.textContent = initials;
  if (nameEl) nameEl.textContent = data.name;

  const badgesEl = document.getElementById('modalBadges');
  if (badgesEl) {
    badgesEl.innerHTML = `
      <span class="badge ${data.quadrant.badgeClass}">${data.quadrant.name}</span>
      <span class="badge ${data.utilTier.badgeClass}">${data.utilTier.label}</span>
      <span class="badge" style="background: rgba(255,255,255,0.08); color: var(--text-muted);">${data.weeksActive} Active Weeks</span>
    `;
  }

  document.getElementById('modalPickRate').textContent = `${data.pickRate} i/h`;
  document.getElementById('modalShiftPPH').textContent = data.shiftPPH > 0 ? `${data.shiftPPH} PPH` : '--';
  document.getElementById('modalUtilization').textContent = data.shiftHours > 0 ? `${data.utilization}%` : '--%';
  document.getElementById('modalNonPickHours').textContent = data.shiftHours > 0 ? `${data.nonPickHours} hrs` : '--';
  document.getElementById('modalFTPR').textContent = `${data.ftprPct}%`;
  document.getElementById('modalTotalPicked').textContent = data.totalPicked.toLocaleString();

  document.getElementById('modalStrengths').innerHTML = data.strengths.map(s => `<li style="margin-bottom: 0.4rem;">${s}</li>`).join('') || '<li>Standard fulfillment execution</li>';
  document.getElementById('modalCoaching').innerHTML = data.coaching.map(c => `<li style="margin-bottom: 0.4rem;">${c}</li>`).join('') || '<li>Maintain current pace & accuracy excellence</li>';

  const ctxModal = document.getElementById('chartModalTrend');
  if (ctxModal) {
    if (chartModalTrend) chartModalTrend.destroy();
    chartModalTrend = new Chart(ctxModal, {
      type: 'line',
      data: {
        labels: data.weeklyTrend.map(t => t.week),
        datasets: [
          {
            label: 'Active Speed (i/h)',
            data: data.weeklyTrend.map(t => t.pickRate),
            borderColor: '#3B82F6',
            borderWidth: 2,
            tension: 0.3
          },
          {
            label: 'Shift PPH',
            data: data.weeklyTrend.map(t => t.shiftPPH),
            borderColor: '#10B981',
            borderWidth: 2,
            borderDash: [4, 4],
            tension: 0.3
          },
          {
            label: 'FTPR %',
            data: data.weeklyTrend.map(t => t.ftpr),
            borderColor: '#8B5CF6',
            borderWidth: 2,
            tension: 0.3
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { ticks: { color: '#94A3B8' } },
          y: { ticks: { color: '#94A3B8' } }
        }
      }
    });
  }

  // Render Daily Shift Table in Modal
  const dailyTbody = document.getElementById('modalDailyShiftsTbody');
  const countEl = document.getElementById('modalDailyShiftCount');
  if (dailyTbody) {
    if (countEl) countEl.textContent = `${data.dailyShifts.length} Daily Shifts in Scope`;

    dailyTbody.innerHTML = data.dailyShifts.map(s => `
      <tr>
        <td style="font-weight: 700; color: var(--accent-blue);">${s.date}</td>
        <td>Wk ${s.week}</td>
        <td style="font-family: var(--font-mono);">${s.shiftHours} hrs</td>
        <td style="font-family: var(--font-mono);">${s.pickHours} hrs</td>
        <td style="font-family: var(--font-mono); font-weight: 600;">${s.pickRate}</td>
        <td style="font-family: var(--font-mono); font-weight: 700; color: ${s.shiftPPH !== '--' ? 'var(--accent-emerald)' : 'var(--text-dim)'};">${s.shiftPPH} PPH</td>
        <td style="font-family: var(--font-mono); font-weight: 600; color: ${parseFloat(s.utilization) >= 70 ? 'var(--accent-emerald)' : (parseFloat(s.utilization) >= 40 ? 'var(--accent-amber)' : 'var(--accent-blue)')};">${s.utilization}</td>
        <td style="font-family: var(--font-mono);">${s.nonPickHours} hrs</td>
        <td style="font-family: var(--font-mono); font-weight: 600; color: ${parseFloat(s.ftpr) >= 94 ? 'var(--accent-emerald)' : 'var(--text-main)'};">${s.ftpr}</td>
        <td style="font-family: var(--font-mono); font-weight: 700;">${s.totalPicked}</td>
      </tr>
    `).join('') || `<tr><td colspan="10" style="text-align: center; color: var(--text-dim);">No daily shift logs available for this date window</td></tr>`;
  }
}

function renderFeedbackStudio() {
  const emptyState = document.getElementById('feedbackEmptyState');
  const contentContainer = document.getElementById('feedbackContentContainer');
  const btnMobile = document.getElementById('btnOpenMobileCoaching');

  if (btnMobile) {
    btnMobile.href = feedbackAssociate 
      ? `coaching.html?associate=${encodeURIComponent(feedbackAssociate)}` 
      : 'coaching.html';
  }

  if (!feedbackAssociate) {
    if (emptyState) emptyState.style.display = 'block';
    if (contentContainer) contentContainer.style.display = 'none';
    return;
  }

  currentFeedbackData = generateCustomDataFeedback({
    dataset: activeDataset,
    associateName: feedbackAssociate,
    startDate: feedbackStartDate,
    endDate: feedbackEndDate
  });

  if (!currentFeedbackData || !currentFeedbackData.hasData) {
    if (emptyState) {
      emptyState.style.display = 'block';
      emptyState.innerHTML = `
        <div style="width: 56px; height: 56px; border-radius: 50%; background: rgba(244, 63, 94, 0.15); color: var(--accent-rose); display: flex; align-items: center; justify-content: center; margin: 0 auto 1rem; font-size: 1.5rem;">
          <i data-lucide="alert-circle"></i>
        </div>
        <h3 style="font-size: 1.2rem; font-weight: 700; margin-bottom: 0.5rem;">No Records Found</h3>
        <p style="font-size: 0.85rem; color: var(--text-muted); max-width: 460px; margin: 0 auto;">
          ${currentFeedbackData ? currentFeedbackData.message : 'No data available for the selected parameters.'}
        </p>
      `;
      if (window.lucide) window.lucide.createIcons();
    }
    if (contentContainer) contentContainer.style.display = 'none';
    return;
  }

  if (emptyState) emptyState.style.display = 'none';
  if (contentContainer) contentContainer.style.display = 'block';

  const m = currentFeedbackData.metrics;
  const d = currentFeedbackData.deltas;

  // Banner
  const initials = feedbackAssociate.split(' ').map(n => n[0]).join('').substring(0, 2);
  document.getElementById('fbAvatar').textContent = initials;
  document.getElementById('fbAssocName').textContent = feedbackAssociate;
  
  const quadBadge = document.getElementById('fbQuadrantBadge');
  quadBadge.className = `badge ${m.quadrant.badgeClass}`;
  quadBadge.textContent = m.quadrant.name;

  const roleBadge = document.getElementById('fbRoleBadge');
  roleBadge.className = `badge ${m.utilTier.badgeClass}`;
  roleBadge.textContent = m.utilTier.label;

  const dateSpanStr = (feedbackStartDate && feedbackEndDate) ? `${feedbackStartDate} to ${feedbackEndDate}` : 'Full Dataset';
  document.getElementById('fbPeriodSummaryText').textContent = `Evaluating ${m.daysCount} active shift logs across ${dateSpanStr}`;

  // KPIs
  document.getElementById('fbPickRate').textContent = `${m.pickRate} i/h`;
  document.getElementById('fbFTPR').textContent = `${m.ftprPct}%`;
  document.getElementById('fbShiftPPH').textContent = m.shiftPPH > 0 ? `${m.shiftPPH} PPH` : '--';
  document.getElementById('fbShiftHoursSub').textContent = m.shiftHours > 0 ? `${m.shiftHours.toFixed(1)} worked shift hrs` : 'Import schedule to calculate';
  document.getElementById('fbUtilization').textContent = m.shiftHours > 0 ? `${m.utilization}%` : '--%';
  document.getElementById('fbNonPickSub').textContent = m.shiftHours > 0 ? `${m.nonPickHours} non-pick hrs` : 'Active vs worked hours';
  document.getElementById('fbTotalPicked').textContent = m.totalPicked.toLocaleString();
  document.getElementById('fbShiftsCountSub').textContent = `${m.daysCount} shifts logged in range`;
  document.getElementById('fbSubNil').textContent = `${m.substitutions.toLocaleString()} / ${m.nilPicks.toLocaleString()}`;
  document.getElementById('fbSubNilPct').textContent = `${((m.substitutions / (m.ftpExpected || 1)) * 100).toFixed(1)}% Subs | ${((m.nilPicks / (m.ftpExpected || 1)) * 100).toFixed(1)}% Nil`;

  // Delta Badges
  renderDeltaBadge('fbDeltaSpeed', d.speedDelta, ' i/h');
  renderDeltaBadge('fbDeltaFTPR', d.ftprDelta, '%');
  renderDeltaBadge('fbDeltaPPH', d.pphDelta, ' PPH');
  renderDeltaBadge('fbDeltaUtil', d.utilDelta, '%');

  // Performance Trend Chart (Weekly Speed & Accuracy Trend)
  const ctxTrend = document.getElementById('chartFeedbackTrend');
  if (ctxTrend) {
    if (chartFeedbackTrend) chartFeedbackTrend.destroy();

    const hasMultipleWeeks = currentFeedbackData.weeklyTrend && currentFeedbackData.weeklyTrend.length >= 2;
    const trendData = (hasMultipleWeeks ? currentFeedbackData.weeklyTrend : currentFeedbackData.dailyTrend) || [];
    
    const countEl = document.getElementById('fbTrendPointsCount');
    if (countEl) {
      countEl.textContent = hasMultipleWeeks 
        ? `${trendData.length} Fiscal Weeks across Scope` 
        : `${trendData.length} Daily Shifts across Scope`;
    }

    const labels = trendData.map(t => t.label || t.week || t.date);
    const speedData = trendData.map(t => t.pickRate);
    const pphData = trendData.map(t => (t.shiftPPH && t.shiftPPH > 0) ? t.shiftPPH : null);
    const ftprData = trendData.map(t => t.ftpr);

    chartFeedbackTrend = new Chart(ctxTrend, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Active Speed (i/h)',
            data: speedData,
            borderColor: '#3B82F6',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            borderWidth: 2.5,
            pointRadius: 4.5,
            pointHoverRadius: 7,
            pointBackgroundColor: '#3B82F6',
            tension: 0.3
          },
          {
            label: 'Shift PPH',
            data: pphData,
            borderColor: '#10B981',
            backgroundColor: 'transparent',
            borderWidth: 2,
            borderDash: [5, 5],
            pointRadius: 4.5,
            pointHoverRadius: 7,
            pointBackgroundColor: '#10B981',
            tension: 0.3
          },
          {
            label: 'FTPR %',
            data: ftprData,
            borderColor: '#8B5CF6',
            backgroundColor: 'rgba(139, 92, 246, 0.08)',
            borderWidth: 2.5,
            pointRadius: 4.5,
            pointHoverRadius: 7,
            pointBackgroundColor: '#8B5CF6',
            tension: 0.3
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { 
            ticks: { color: '#94A3B8', font: { family: 'Plus Jakarta Sans', size: 11 } }, 
            grid: { color: 'rgba(255,255,255,0.05)' } 
          },
          y: { 
            ticks: { color: '#94A3B8', font: { family: 'Plus Jakarta Sans', size: 11 } }, 
            grid: { color: 'rgba(255,255,255,0.05)' },
            suggestedMin: 40,
            suggestedMax: 100
          }
        },
        plugins: {
          legend: {
            display: true,
            position: 'top',
            labels: {
              color: '#F8FAFC',
              font: { family: 'Plus Jakarta Sans', size: 12, weight: '600' },
              usePointStyle: false,
              boxWidth: 24,
              boxHeight: 2,
              padding: 15
            }
          },
          tooltip: {
            backgroundColor: 'rgba(15, 23, 42, 0.95)',
            titleColor: '#F8FAFC',
            bodyColor: '#94A3B8',
            borderColor: 'rgba(255, 255, 255, 0.1)',
            borderWidth: 1,
            padding: 10,
            callbacks: {
              label: (ctx) => {
                const val = ctx.raw;
                if (val === null || val === undefined) return `${ctx.dataset.label}: N/A`;
                if (ctx.dataset.label.includes('FTPR')) return `FTPR: ${val}%`;
                if (ctx.dataset.label.includes('Shift')) return `Shift PPH: ${val} PPH`;
                return `Active Speed: ${val} i/h`;
              }
            }
          }
        }
      }
    });
  }

  // Lists
  document.getElementById('fbStrengthsList').innerHTML = currentFeedbackData.strengths.map(s => `<li>${s}</li>`).join('');
  document.getElementById('fbCoachingList').innerHTML = currentFeedbackData.coachingPoints.map(c => `<li>${c}</li>`).join('');

  // Script
  document.getElementById('fbScriptContent').textContent = currentFeedbackData.feedbackScript;

  // SMART Goals
  const goalsGrid = document.getElementById('fbGoalsGrid');
  if (goalsGrid) {
    goalsGrid.innerHTML = currentFeedbackData.smartGoals.map(g => `
      <div class="smart-goal-card">
        <div class="smart-goal-title">${g.title}</div>
        <div class="smart-goal-target">${g.target}</div>
        <div class="smart-goal-current">Current: <strong>${g.current}</strong> (Store: ${g.benchmark})</div>
      </div>
    `).join('');
  }

  // Load Saved Notes (Local cache immediate, Cloud fetch async)
  const notesTextarea = document.getElementById('feedbackManagerNotes');
  if (notesTextarea) {
    const key = `ap2_notes_${feedbackAssociate}_${feedbackStartDate}_${feedbackEndDate}`;
    const cachedNote = localStorage.getItem(key) || '';
    notesTextarea.value = cachedNote;

    fetchCoachingNoteFromSupabase({
      associateName: feedbackAssociate,
      startDate: feedbackStartDate,
      endDate: feedbackEndDate
    }).then(cloudNote => {
      if (cloudNote !== null && cloudNote !== undefined && cloudNote !== cachedNote) {
        notesTextarea.value = cloudNote;
        localStorage.setItem(key, cloudNote);
      }
    });
  }

  // Daily Shifts Table
  const fbDailyTbody = document.getElementById('fbDailyShiftsTbody');
  const countEl = document.getElementById('fbDailyShiftCount');
  if (fbDailyTbody) {
    if (countEl) countEl.textContent = `${currentFeedbackData.dailyShifts.length} Shifts in Scope`;

    fbDailyTbody.innerHTML = currentFeedbackData.dailyShifts.map(s => `
      <tr>
        <td style="font-weight: 700; color: var(--accent-cyan);">${s.date}</td>
        <td>Wk ${s.week}</td>
        <td style="font-family: var(--font-mono);">${s.shiftHours} hrs</td>
        <td style="font-family: var(--font-mono);">${s.pickHours} hrs</td>
        <td style="font-family: var(--font-mono); font-weight: 600;">${s.pickRate}</td>
        <td style="font-family: var(--font-mono); font-weight: 700; color: ${s.shiftPPH !== '--' ? 'var(--accent-emerald)' : 'var(--text-dim)'};">${s.shiftPPH} PPH</td>
        <td style="font-family: var(--font-mono); font-weight: 600; color: ${parseFloat(s.utilization) >= 70 ? 'var(--accent-emerald)' : (parseFloat(s.utilization) >= 40 ? 'var(--accent-amber)' : 'var(--accent-blue)')};">${s.utilization}</td>
        <td style="font-family: var(--font-mono);">${s.nonPickHours}</td>
        <td style="font-family: var(--font-mono); font-weight: 600; color: ${parseFloat(s.ftpr) >= 94 ? 'var(--accent-emerald)' : 'var(--text-main)'};">${s.ftpr}</td>
        <td style="font-family: var(--font-mono);">${s.substitutions} / ${s.nilPicks}</td>
        <td style="font-family: var(--font-mono); font-weight: 700;">${s.totalPicked}</td>
      </tr>
    `).join('') || `<tr><td colspan="11" style="text-align: center; color: var(--text-dim);">No shift logs available</td></tr>`;
  }

  if (window.lucide) window.lucide.createIcons();
}

function renderDeltaBadge(elId, val, unit = '') {
  const el = document.getElementById(elId);
  if (!el) return;

  if (val === null || val === undefined) {
    el.className = 'delta-badge delta-neutral';
    el.textContent = 'Prior: N/A';
    return;
  }

  const num = parseFloat(val);
  if (num > 0) {
    el.className = 'delta-badge delta-up';
    el.textContent = `+${val}${unit} vs Prior`;
  } else if (num < 0) {
    el.className = 'delta-badge delta-down';
    el.textContent = `${val}${unit} vs Prior`;
  } else {
    el.className = 'delta-badge delta-neutral';
    el.textContent = `0.0${unit} vs Prior`;
  }
}

function renderHeatmap() {
  const filteredRows = getFilteredActiveDataset();
  const heatmapData = getDayOfWeekHeatmap(filteredRows.length > 0 ? filteredRows : activeDataset);
  const container = document.getElementById('heatmapGrid');
  if (!container) return;

  const maxVal = Math.max(...heatmapData.days.map(d => d.totalExpected));

  container.innerHTML = heatmapData.days.map(d => {
    const intensity = maxVal > 0 ? (d.totalExpected / maxVal) : 0;
    const bgGlow = `linear-gradient(135deg, rgba(30, 58, 138, ${0.4 + intensity * 0.4}), rgba(15, 23, 42, 0.9))`;
    const borderColor = intensity > 0.9 ? 'var(--accent-rose)' : intensity > 0.8 ? 'var(--accent-amber)' : 'var(--accent-blue)';
    
    return `
      <div class="heatmap-cell" style="background: ${bgGlow}; border-color: ${borderColor};">
        <div class="heatmap-day">${d.shortDay}</div>
        <div class="heatmap-val" style="font-weight: 800; font-size: 1.6rem;">${(d.totalExpected / 1000).toFixed(1)}k</div>
        <div style="font-size: 0.8rem; font-weight: 600; color: #F8FAFC; margin-top: 0.3rem;">
          ${d.totalHours.toLocaleString()} hrs | ${d.avgPickRate} i/h
        </div>
      </div>
    `;
  }).join('');

  const matrixTbody = document.getElementById('heatmapMatrixTbody');
  if (matrixTbody) {
    const daysList = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    
    matrixTbody.innerHTML = heatmapData.weeks.map(wk => {
      let weekTotal = 0;
      const dayCells = daysList.map(dayName => {
        const val = heatmapData.matrix[wk] && heatmapData.matrix[wk][dayName] ? heatmapData.matrix[wk][dayName].exp : 0;
        weekTotal += val;
        const cellIntensity = val / 13000;
        const cellBg = `rgba(59, 130, 246, ${Math.min(0.85, 0.1 + cellIntensity * 0.75)})`;
        return `
          <td style="background: ${cellBg}; font-family: var(--font-mono); font-weight: 600; color: #FFFFFF;">
            ${val.toLocaleString()}
          </td>
        `;
      }).join('');

      return `
        <tr>
          <td style="text-align: left; font-weight: 700; color: var(--accent-blue);">Fiscal Wk ${wk}</td>
          ${dayCells}
          <td style="font-family: var(--font-mono); font-weight: 800; color: var(--accent-emerald);">
            ${weekTotal.toLocaleString()}
          </td>
        </tr>
      `;
    }).join('');
  }
}

function updateSimulator() {
  const pickRange = document.getElementById('simPickRateRange');
  const ftprRange = document.getElementById('simFTPRRange');
  if (!pickRange || !ftprRange) return;

  const targetPickRate = parseFloat(pickRange.value);
  const targetFTPR = parseFloat(ftprRange.value);

  document.getElementById('simPickRateVal').textContent = `${targetPickRate.toFixed(1)} items/hr`;
  document.getElementById('simFTPRVal').textContent = `${targetFTPR.toFixed(1)}%`;

  const filtered = getFilteredActiveDataset();
  const kpis = getStoreKPIs(filtered);

  document.getElementById('simBaseSpeed').textContent = `${kpis.pickRate} i/h`;
  document.getElementById('simBaseFTPR').textContent = `${kpis.ftprPct}%`;

  const currentHours = kpis.pickHours;
  const totalVolume = kpis.totalExpected;

  const projectedHours = targetPickRate > 0 ? (totalVolume / targetPickRate) : currentHours;
  const hoursSaved = Math.max(0, currentHours - projectedHours);

  const targetFTPRDec = targetFTPR / 100;
  const currentFTPRDec = kpis.ftpr;

  const nilReductionRatio = Math.max(0, targetFTPRDec - currentFTPRDec);
  const nilPicksReduced = Math.round(totalVolume * nilReductionRatio);

  document.getElementById('simHoursSaved').textContent = `+${hoursSaved.toFixed(1)} hrs`;
  document.getElementById('simNilReduced').textContent = `-${nilPicksReduced.toLocaleString()} items`;
  document.getElementById('simFullTimeAssocs').textContent = (hoursSaved / 40.0).toFixed(1);
}

function exportRosterCSV() {
  const filteredRows = getFilteredActiveDataset();
  const associates = getAssociateAggregates(filteredRows);

  let csvContent = "data:text/csv;charset=utf-8,";
  csvContent += "Associate Name,Quadrant,Role Tier,Active Pick Speed (i/h),Shift PPH,Utilization %,Non-Pick Hours,FTPR %,Total Picked\n";

  associates.forEach(a => {
    csvContent += `"${a.name}","${a.quadrant.name}","${a.utilTier.label}",${a.pickRate},${a.shiftPPH},${a.utilization},${a.nonPickHours},${a.ftprPct},${a.totalPicked}\n`;
  });

  const scopeLabel = filterMode === 'custom' ? `${currentStartDate}_to_${currentEndDate}` : `Wk_${currentWeek}`;
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `Associate_Performance_Store1012_${scopeLabel}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

async function handleFileUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  const fname = file.name.toLowerCase();

  if (fname.endsWith('.csv')) {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target.result;
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        if (lines.length <= 1) return;

        const headers = lines[0].split(',').map(h => h.replace(/^["']|["']$/g, '').trim().toLowerCase());
        const assocIdx = headers.findIndex(h => h.includes('associate name') || h.includes('associate') || h.includes('name'));
        const hoursIdx = headers.findIndex(h => h.includes('total hours') || h.includes('shift hours') || h.includes('hours'));

        if (assocIdx === -1) {
          alert("Could not locate associate name column in CSV schedule.");
          return;
        }

        const scheduleMap = {};
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(',').map(c => c.replace(/^["']|["']$/g, '').trim());
          const name = cols[assocIdx];
          if (!name) continue;
          const shiftHrs = hoursIdx !== -1 && cols[hoursIdx] ? parseFloat(cols[hoursIdx]) || 0 : 0;
          scheduleMap[name.toUpperCase()] = shiftHrs;
        }

        let matchedCount = 0;
        activeDataset.forEach(row => {
          if (!row.associate) return;
          const normAssoc = row.associate.toUpperCase().trim();
          const shiftHrs = scheduleMap[normAssoc];

          if (shiftHrs && shiftHrs > 0) {
            row.shiftHours = shiftHrs;
            const totalPicked = (row.pickedAsReq || 0) + (row.substitutions || 0);
            row.shiftPPH = parseFloat((totalPicked / row.shiftHours).toFixed(2));
            row.utilization = parseFloat(((row.pickHours / row.shiftHours) * 100).toFixed(1));
            row.nonPickHours = parseFloat((Math.max(0, row.shiftHours - row.pickHours)).toFixed(2));
            matchedCount++;
          }
        });

        document.getElementById('modalUpload').classList.remove('active');
        alert(`Parsed CSV Schedule! Matched ${matchedCount} associate performance records.`);
        renderAllViews();
      } catch (err) {
        console.error(err);
        alert("Error reading CSV schedule file.");
      }
    };
    reader.readAsText(file);
  } else if (fname.endsWith('.xlsx') || fname.endsWith('.xls')) {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonRows = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });

        let weekNum = 22;
        const match = file.name.match(/Wk\s*(\d+)/i);
        if (match) weekNum = parseInt(match[1], 10);

        const newEntries = [];
        let currentAssoc = null;

        for (let i = 1; i < jsonRows.length; i++) {
          const row = jsonRows[i];
          if (!row || row.length < 3) continue;

          if (row[1]) currentAssoc = row[1].toString().trim();
          const dayPick = row[2] ? row[2].toString().trim() : '';

          if (!dayPick || !currentAssoc) continue;
          const isTotal = (dayPick.toLowerCase() === 'total');

          newEntries.push({
            file: file.name,
            week: weekNum,
            store: row[0] || '1012',
            associate: currentAssoc,
            day: dayPick,
            isTotal: isTotal,
            ftpr: parseFloat(row[3] || 0),
            ftpExpected: parseInt(row[4] || 0),
            ftpActual: parseInt(row[5] || 0),
            pickRate: parseFloat(row[6] || 0),
            pickHours: parseFloat(row[7] || 0),
            pickedAsReq: parseInt(row[8] || 0),
            substitutions: parseInt(row[9] || 0),
            overrides: parseInt(row[10] || 0),
            nilPicks: parseInt(row[11] || 0)
          });
        }

        if (newEntries.length > 0) {
          activeDataset = [...activeDataset, ...newEntries];
          datasetBounds = getDatasetDateBounds(activeDataset);
          populateWeekDropdown();
          populateFeedbackAssociateDropdown();
          document.getElementById('modalUpload').classList.remove('active');
          alert(`Successfully imported ${newEntries.length} records from ${file.name}! Syncing to Supabase cloud...`);
          
          insertPerformanceBatchToSupabase(newEntries).then(ok => {
            const cloudStatusText = document.getElementById('cloudStatusText');
            if (cloudStatusText && ok) {
              cloudStatusText.textContent = `Cloud Synced (${activeDataset.length.toLocaleString()} rows)`;
            }
          });

          renderAllViews();
        }
      } catch (err) {
        console.error(err);
        alert("Error parsing XLSX file. Please ensure it follows the standard associate view format.");
      }
    };
    reader.readAsArrayBuffer(file);
  }
}
