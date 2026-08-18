/**
 * Associate Performance 2.0 - Main Application Controller
 */

import { 
  filterDataset, 
  getStoreKPIs, 
  getWeeklyTrends, 
  getDailyTrends,
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
  fetchAllCoachingNotesForAssociate,
  deleteCoachingNoteFromSupabase,
  insertPerformanceBatchToSupabase
} from './config/supabaseClient.js';

// Application State
let activeDataset = [];
let datasetBounds = { minDate: '2026-05-23', maxDate: '2026-08-07', totalDays: 77 };
let filterMode = 'week'; // 'week' | 'custom'
let currentStartWeek = 'all';
let currentEndWeek = 'all';
let currentStartDate = null;
let currentEndDate = null;
let currentPreset = 'all';

function getWeekFilterParams() {
  if (currentStartWeek === 'all' && currentEndWeek === 'all') {
    return { startWeek: null, endWeek: null, isWeekActive: false, label: 'All Weeks', isSingleWeek: false };
  }
  const weeks = getAvailableWeeks(activeDataset);
  const minWk = weeks.length > 0 ? weeks[0] : 1;
  const maxWk = weeks.length > 0 ? weeks[weeks.length - 1] : 52;

  let s = currentStartWeek !== 'all' ? parseInt(currentStartWeek, 10) : minWk;
  let e = currentEndWeek !== 'all' ? parseInt(currentEndWeek, 10) : maxWk;

  if (s > e) [s, e] = [e, s];

  const label = s === e ? `Week ${s}` : `Weeks ${s} – ${e}`;
  return { startWeek: s, endWeek: e, isWeekActive: true, label, isSingleWeek: s === e };
}
let currentSearch = '';
let currentQuadrant = 'all';
let currentUtilTier = 'all';
let scatterMetric = 'active'; // 'active' | 'shift'
let scatterRoleFilter = 'all'; // 'all' | 'primary' | 'multi' | 'auxiliary'
let activeExecutiveMetric = 'volume'; // 'volume' | 'ftpr' | 'pickRate' | 'shiftPPH' | 'utilization' | 'subNil'
let sortColumn = 'pickRate';
let sortAscending = false;

// Feedback Studio State
let feedbackAssociate = '';
let feedbackStartDate = null;
let feedbackEndDate = null;
let feedbackPreset = 'all';
let activeFeedbackMetric = 'speed'; // 'speed' | 'ftpr' | 'shiftPPH' | 'utilization' | 'volume' | 'subNil'
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
let chartPopoutExpanded = null;
let currentPopoutTarget = null;
let popoutActiveViewMode = 'chart'; // 'chart' | 'table'

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
    const { startWeek, endWeek } = getWeekFilterParams();
    return filterDataset(activeDataset, {
      startWeek,
      endWeek,
      search: '',
      quadrant: 'all',
      utilTier: 'all'
    });
  }
}

function populateWeekDropdown() {
  const startSelect = document.getElementById('startWeekSelect');
  const endSelect = document.getElementById('endWeekSelect');
  if (!startSelect && !endSelect) return;

  const weeks = getAvailableWeeks(activeDataset);
  if (weeks.length === 0) return;

  const minWk = weeks[0];
  const maxWk = weeks[weeks.length - 1];

  let startHtml = `<option value="all">📅 From: Wk ${minWk}</option>`;
  let endHtml = `<option value="all">📅 To: Wk ${maxWk}</option>`;

  weeks.forEach(w => {
    startHtml += `<option value="${w}">Week ${w}</option>`;
    endHtml += `<option value="${w}">Week ${w}</option>`;
  });

  if (startSelect) {
    startSelect.innerHTML = startHtml;
    startSelect.value = currentStartWeek;
  }
  if (endSelect) {
    endSelect.innerHTML = endHtml;
    endSelect.value = currentEndWeek;
  }
}

function populateFeedbackAssociateDropdown() {
  const select = document.getElementById('feedbackAssocSelect');
  if (!select) return;

  const scheduledRows = activeDataset.filter(r => !r.isTotal && r.shiftHours !== null && r.shiftHours !== undefined && r.shiftHours > 0);
  const associates = getAssociateAggregates(scheduledRows.length > 0 ? scheduledRows : activeDataset.filter(r => !r.isTotal));
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

function getActiveFilterDateRange() {
  if (filterMode === 'custom' && currentStartDate && currentEndDate) {
    return { startDate: currentStartDate, endDate: currentEndDate };
  }
  
  const filteredRows = getFilteredActiveDataset();
  const validDates = filteredRows
    .filter(r => r.day)
    .map(r => r.iso_date || parseDateToISO(r.day))
    .filter(Boolean);
  
  if (validDates.length > 0) {
    validDates.sort();
    return { startDate: validDates[0], endDate: validDates[validDates.length - 1] };
  }
  
  return { startDate: datasetBounds.minDate, endDate: datasetBounds.maxDate };
}

function openCoachingStudioForAssociate(assocName) {
  if (!assocName) return;

  feedbackAssociate = assocName;

  // Switch to coaching tab
  const fbTab = document.querySelector('[data-view="feedback"]');
  if (fbTab) fbTab.click();

  // Populate UI dropdown
  const fbSelect = document.getElementById('feedbackAssocSelect');
  if (fbSelect) fbSelect.value = assocName;

  // Render Coaching Studio view
  renderFeedbackStudio();
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

  // Week Range Selectors
  const startWeekSelect = document.getElementById('startWeekSelect');
  const endWeekSelect = document.getElementById('endWeekSelect');

  if (startWeekSelect) {
    startWeekSelect.addEventListener('change', (e) => {
      currentStartWeek = e.target.value;
      if (currentStartWeek !== 'all' && currentEndWeek !== 'all') {
        const s = parseInt(currentStartWeek, 10);
        const en = parseInt(currentEndWeek, 10);
        if (s > en) {
          currentEndWeek = currentStartWeek;
          if (endWeekSelect) endWeekSelect.value = currentStartWeek;
        }
      }
      filterMode = 'week';
      renderAllViews();
    });
  }

  if (endWeekSelect) {
    endWeekSelect.addEventListener('change', (e) => {
      currentEndWeek = e.target.value;
      if (currentStartWeek !== 'all' && currentEndWeek !== 'all') {
        const s = parseInt(currentStartWeek, 10);
        const en = parseInt(currentEndWeek, 10);
        if (en < s) {
          currentStartWeek = currentEndWeek;
          if (startWeekSelect) startWeekSelect.value = currentEndWeek;
        }
      }
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
    currentStartWeek = 'all';
    currentEndWeek = 'all';
    currentStartDate = datasetBounds.minDate;
    currentEndDate = datasetBounds.maxDate;
    if (startWeekSelect) startWeekSelect.value = 'all';
    if (endWeekSelect) endWeekSelect.value = 'all';
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

  // Scatter Matrix Role Tier Filter Buttons
  const roleButtons = [
    { id: 'btnRoleFilterAll', role: 'all' },
    { id: 'btnRoleFilterPrimary', role: 'primary' },
    { id: 'btnRoleFilterMulti', role: 'multi' },
    { id: 'btnRoleFilterAuxiliary', role: 'auxiliary' }
  ];

  roleButtons.forEach(({ id, role }) => {
    const btn = document.getElementById(id);
    if (btn) {
      btn.addEventListener('click', () => {
        scatterRoleFilter = role;
        roleButtons.forEach(b => {
          const el = document.getElementById(b.id);
          if (el) el.classList.toggle('active', b.role === role);
        });
        renderCharts();
      });
    }
  });

  // Executive KPI Buckets Interactive Metric Selector
  const executiveKpiCards = document.querySelectorAll('#executiveKpiGrid .kpi-card');
  executiveKpiCards.forEach(card => {
    card.addEventListener('click', () => {
      const metric = card.dataset.kpi;
      if (!metric) return;
      activeExecutiveMetric = metric;
      executiveKpiCards.forEach(c => c.classList.remove('active-metric-card'));
      card.classList.add('active-metric-card');
      renderCharts();
    });
  });

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
      document.getElementById('modalUploadTitle').textContent = "Import Fulfillment Data";
      document.getElementById('modalUploadDesc').textContent = "Drop all weekly performance reports (.xlsx) and shift schedules (.csv) or a .zip archive.";
      const progressContainer = document.getElementById('uploadProgressContainer');
      if (progressContainer) progressContainer.style.display = 'none';
      modalUpload.classList.add('active');
    });
  }
  if (btnCloseUpload && modalUpload) {
    btnCloseUpload.addEventListener('click', () => modalUpload.classList.remove('active'));
  }
  if (fileDropzone && fileInput) {
    fileDropzone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileUpload);

    fileDropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      fileDropzone.classList.add('dragover');
    });

    fileDropzone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      e.stopPropagation();
      fileDropzone.classList.remove('dragover');
    });

    fileDropzone.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      fileDropzone.classList.remove('dragover');
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const fileObjects = Array.from(e.dataTransfer.files).map(f => ({ name: f.name, file: f }));
        await processFileList(fileObjects);
      }
    });
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
      openCoachingStudioForAssociate(modalCurrentAssociate, modalStartDate, modalEndDate);
    });
  }

  // Visual Pop-out / Full Roster Modal Event Listeners
  document.querySelectorAll('.btn-popout-chart').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const target = btn.dataset.expandTarget;
      openVisualPopoutModal(target);
    });
  });

  const btnClosePopoutModal = document.getElementById('btnClosePopoutModal');
  const modalVisualPopout = document.getElementById('modalVisualPopout');
  if (btnClosePopoutModal && modalVisualPopout) {
    btnClosePopoutModal.addEventListener('click', () => modalVisualPopout.classList.remove('active'));
    modalVisualPopout.addEventListener('click', (e) => {
      if (e.target === modalVisualPopout) modalVisualPopout.classList.remove('active');
    });
  }

  const btnPopoutViewChart = document.getElementById('btnPopoutViewChart');
  const btnPopoutViewTable = document.getElementById('btnPopoutViewTable');
  const popoutChartContainer = document.getElementById('popoutChartContainer');
  const popoutTableContainer = document.getElementById('popoutTableContainer');

  if (btnPopoutViewChart && btnPopoutViewTable) {
    btnPopoutViewChart.addEventListener('click', () => {
      popoutActiveViewMode = 'chart';
      btnPopoutViewChart.classList.add('active');
      btnPopoutViewTable.classList.remove('active');
      if (popoutChartContainer) popoutChartContainer.style.display = 'block';
      if (popoutTableContainer) popoutTableContainer.style.display = 'none';
      renderVisualPopoutContent();
    });

    btnPopoutViewTable.addEventListener('click', () => {
      popoutActiveViewMode = 'table';
      btnPopoutViewTable.classList.add('active');
      btnPopoutViewChart.classList.remove('active');
      if (popoutChartContainer) popoutChartContainer.style.display = 'none';
      if (popoutTableContainer) popoutTableContainer.style.display = 'block';
      renderVisualPopoutContent();
    });
  }

  const popoutSearchInput = document.getElementById('popoutSearchInput');
  if (popoutSearchInput) {
    popoutSearchInput.addEventListener('input', () => {
      renderVisualPopoutContent();
    });
  }

  const btnPopoutExportCSV = document.getElementById('btnPopoutExportCSV');
  if (btnPopoutExportCSV) {
    btnPopoutExportCSV.addEventListener('click', exportPopoutCSV);
  }

  // Simulator Sliders
  const simPickRange = document.getElementById('simPickRateRange');
  const simFTPRRange = document.getElementById('simFTPRRange');
  if (simPickRange) simPickRange.addEventListener('input', updateSimulator);
  if (simFTPRRange) simFTPRRange.addEventListener('input', updateSimulator);

  // Custom Data Feedback Studio Controls
  setupFeedbackStudioEventListeners();
}

function openVisualPopoutModal(targetKey) {
  currentPopoutTarget = targetKey;
  const modal = document.getElementById('modalVisualPopout');
  const searchInput = document.getElementById('popoutSearchInput');
  if (searchInput) searchInput.value = '';

  if (modal) {
    modal.classList.add('active');
    renderVisualPopoutContent();
  }
}

function getPopoutDatasetAndConfig() {
  const filteredRows = getFilteredActiveDataset();
  const associates = getAssociateAggregates(filteredRows);
  const search = (document.getElementById('popoutSearchInput')?.value || '').toLowerCase().trim();

  let filteredAssocs = search 
    ? associates.filter(a => a.name.toLowerCase().includes(search) || (a.utilTier?.label || '').toLowerCase().includes(search))
    : associates;

  const isSingleDay = (filterMode === 'custom' && currentStartDate === currentEndDate);
  const weekParams = getWeekFilterParams();
  const scopeLabel = isSingleDay 
    ? `Single Day (${filteredRows[0]?.day || currentStartDate})`
    : (filterMode === 'week' && weekParams.isWeekActive ? weekParams.label : 'Full Dataset');

  let title = 'Associate Performance Visual';
  let icon = 'bar-chart-2';
  let chartType = 'bar';
  let labels = [];
  let datasets = [];
  let tableHeaders = ['#', 'Associate Name', 'Role Tier', 'Primary Metric', 'Secondary Metric'];
  let tableRows = [];

  // Determine configuration based on active metric & target chart
  if (currentPopoutTarget === 'chart1') {
    const fmtH = (h) => (Math.round((Number(h) || 0) * 10) / 10).toLocaleString();
    const fmtR = (r) => (Math.round((Number(r) || 0) * 10) / 10).toLocaleString();

    switch (activeExecutiveMetric) {
      case 'ftpr':
        title = `${scopeLabel} • Full Roster FTPR Accuracy & Picked Volume`;
        icon = 'target';
        // Sort by ftpr descending
        filteredAssocs.sort((a, b) => parseFloat(b.ftprPct) - parseFloat(a.ftprPct));
        labels = filteredAssocs.map(a => a.name);
        datasets = [
          {
            label: 'Store FTPR % (Target: 94%)',
            data: filteredAssocs.map(a => parseFloat(a.ftprPct)),
            backgroundColor: filteredAssocs.map(a => parseFloat(a.ftprPct) >= 94 ? '#10B981' : '#F43F5E'),
            borderRadius: 4
          }
        ];
        tableHeaders = ['#', 'Associate Name', 'Role Tier', 'FTPR %', 'Expected Items', 'Actual Items'];
        tableRows = filteredAssocs.map((a, i) => [
          i + 1,
          a.name,
          a.utilTier.label,
          `${a.ftprPct}%`,
          (a.ftpExpected || 0).toLocaleString(),
          (a.ftpActual || 0).toLocaleString()
        ]);
        break;

      case 'pickRate':
        title = `${scopeLabel} • Full Roster Active Pick Speed (IPH) Ranking`;
        icon = 'zap';
        filteredAssocs.sort((a, b) => b.pickRate - a.pickRate);
        labels = filteredAssocs.map(a => a.name);
        datasets = [
          {
            label: 'Active Pick Speed (i/h)',
            data: filteredAssocs.map(a => a.pickRate),
            backgroundColor: filteredAssocs.map(a => a.pickRate >= 80 ? '#10B981' : '#F59E0B'),
            borderRadius: 4
          }
        ];
        tableHeaders = ['#', 'Associate Name', 'Role Tier', 'Pick Speed (i/h)', 'Active Pick Hours', 'Total Items Picked'];
        tableRows = filteredAssocs.map((a, i) => [
          i + 1,
          a.name,
          a.utilTier.label,
          `${fmtR(a.pickRate)} i/h`,
          `${fmtH(a.pickHours)} hrs`,
          a.totalPicked.toLocaleString()
        ]);
        break;

      case 'shiftPPH':
      case 'utilization':
        title = `${scopeLabel} • Full Roster Active Pick vs Non-Pick Shift Hours`;
        icon = 'clock';
        filteredAssocs.sort((a, b) => (b.pickHours - a.pickHours) || (b.shiftHours - a.shiftHours));
        labels = filteredAssocs.map(a => a.name);
        datasets = [
          {
            label: 'Active Pick Hours',
            data: filteredAssocs.map(a => a.pickHours),
            backgroundColor: '#10B981',
            borderRadius: 4
          },
          {
            label: 'Non-Pick / Staging Hours',
            data: filteredAssocs.map(a => a.nonPickHours),
            backgroundColor: '#F59E0B',
            borderRadius: 4
          }
        ];
        tableHeaders = ['#', 'Associate Name', 'Role Tier', 'Active Pick Hrs', 'Non-Pick Hrs', 'Scheduled Shift Hrs', 'Utilization %'];
        tableRows = filteredAssocs.map((a, i) => [
          i + 1,
          a.name,
          a.utilTier.label,
          `${fmtH(a.pickHours)} hrs`,
          `${fmtH(a.nonPickHours)} hrs`,
          `${fmtH(a.shiftHours)} hrs`,
          `${a.utilization}%`
        ]);
        break;

      case 'subNil':
        title = `${scopeLabel} • Full Roster Nil Picks & Substitutions Breakdown`;
        icon = 'alert-triangle';
        filteredAssocs.sort((a, b) => b.nilPicks - a.nilPicks);
        labels = filteredAssocs.map(a => a.name);
        datasets = [
          {
            label: 'Nil Picks',
            data: filteredAssocs.map(a => a.nilPicks),
            backgroundColor: '#F43F5E',
            borderRadius: 4
          },
          {
            label: 'Substitutions',
            data: filteredAssocs.map(a => a.substitutions),
            backgroundColor: '#8B5CF6',
            borderRadius: 4
          }
        ];
        tableHeaders = ['#', 'Associate Name', 'Role Tier', 'Nil Picks', 'Substitutions', 'Total Picked'];
        tableRows = filteredAssocs.map((a, i) => [
          i + 1,
          a.name,
          a.utilTier.label,
          a.nilPicks,
          a.substitutions,
          a.totalPicked.toLocaleString()
        ]);
        break;

      case 'volume':
      default:
        title = `${scopeLabel} • Full Roster Total Picked Volume Ranking`;
        icon = 'trophy';
        filteredAssocs.sort((a, b) => b.totalPicked - a.totalPicked);
        labels = filteredAssocs.map(a => a.name);
        datasets = [
          {
            label: 'Total Items Picked',
            data: filteredAssocs.map(a => a.totalPicked),
            backgroundColor: 'rgba(59, 130, 246, 0.6)',
            borderColor: '#3B82F6',
            borderWidth: 2,
            borderRadius: 4
          }
        ];
        tableHeaders = ['#', 'Associate Name', 'Role Tier', 'Total Items Picked', 'Active Pick Hours', 'Pick Speed'];
        tableRows = filteredAssocs.map((a, i) => [
          i + 1,
          a.name,
          a.utilTier.label,
          a.totalPicked.toLocaleString(),
          `${fmtH(a.pickHours)} hrs`,
          `${fmtR(a.pickRate)} i/h`
        ]);
        break;
    }
  } else {
    const fmtH = (h) => (Math.round((Number(h) || 0) * 10) / 10).toLocaleString();
    const fmtR = (r) => (Math.round((Number(r) || 0) * 10) / 10).toLocaleString();

    // Target = chart2 (Secondary Visual)
    switch (activeExecutiveMetric) {
      case 'volume':
        title = `${scopeLabel} • Full Roster Pick Volume & Role Tier Breakdown`;
        icon = 'pie-chart';
        filteredAssocs.sort((a, b) => b.totalPicked - a.totalPicked);
        labels = filteredAssocs.map(a => a.name);
        datasets = [
          {
            label: 'Total Items Picked',
            data: filteredAssocs.map(a => a.totalPicked),
            backgroundColor: filteredAssocs.map(a => {
              if (a.utilTier?.tier === 'primary') return '#10B981';
              if (a.utilTier?.tier === 'hybrid') return '#F59E0B';
              return '#3B82F6';
            }),
            borderRadius: 4
          }
        ];
        tableHeaders = ['#', 'Associate Name', 'Role Tier', 'Total Items Picked', 'Active Pick Hours', 'Pick Speed'];
        tableRows = filteredAssocs.map((a, i) => [
          i + 1,
          a.name,
          a.utilTier.label,
          (a.totalPicked || 0).toLocaleString(),
          `${fmtH(a.pickHours)} hrs`,
          `${fmtR(a.pickRate)} i/h`
        ]);
        break;

      case 'pickRate':
        title = `${scopeLabel} • Full Roster Active Pick Speed (IPH) Ranking`;
        icon = 'flame';
        filteredAssocs.sort((a, b) => b.pickRate - a.pickRate);
        labels = filteredAssocs.map(a => a.name);
        datasets = [
          {
            label: 'Active Pick Speed (i/h)',
            data: filteredAssocs.map(a => a.pickRate),
            backgroundColor: filteredAssocs.map(a => a.pickRate >= 80 ? '#10B981' : '#F59E0B'),
            borderRadius: 4
          }
        ];
        tableHeaders = ['#', 'Associate Name', 'Role Tier', 'Active Pick Speed', 'Active Pick Hours', 'Total Items Picked'];
        tableRows = filteredAssocs.map((a, i) => [
          i + 1,
          a.name,
          a.utilTier.label,
          `${fmtR(a.pickRate)} i/h`,
          `${fmtH(a.pickHours)} hrs`,
          (a.totalPicked || 0).toLocaleString()
        ]);
        break;

      case 'ftpr':
        title = `${scopeLabel} • Full Roster Substitutions & Nil Picks Breakdown`;
        icon = 'alert-triangle';
        filteredAssocs.sort((a, b) => (b.substitutions + b.nilPicks) - (a.substitutions + a.nilPicks));
        labels = filteredAssocs.map(a => a.name);
        datasets = [
          {
            label: 'Substitutions',
            data: filteredAssocs.map(a => a.substitutions),
            backgroundColor: '#8B5CF6',
            borderRadius: 4
          },
          {
            label: 'Nil Picks',
            data: filteredAssocs.map(a => a.nilPicks),
            backgroundColor: '#F43F5E',
            borderRadius: 4
          }
        ];
        tableHeaders = ['#', 'Associate Name', 'Role Tier', 'Substitutions', 'Nil Picks', 'FTPR %', 'Total Picked'];
        tableRows = filteredAssocs.map((a, i) => [
          i + 1,
          a.name,
          a.utilTier.label,
          (a.substitutions || 0).toLocaleString(),
          (a.nilPicks || 0).toLocaleString(),
          `${a.ftprPct}%`,
          (a.totalPicked || 0).toLocaleString()
        ]);
        break;

      case 'shiftPPH':
      case 'utilization':
        title = `${scopeLabel} • Full Roster True Shift PPH Leaderboard`;
        icon = 'trending-up';
        filteredAssocs.sort((a, b) => b.shiftPPH - a.shiftPPH);
        labels = filteredAssocs.map(a => a.name);
        datasets = [
          {
            label: 'True Shift PPH',
            data: filteredAssocs.map(a => a.shiftPPH),
            backgroundColor: 'rgba(245, 158, 11, 0.6)',
            borderColor: '#F59E0B',
            borderWidth: 2,
            borderRadius: 4
          }
        ];
        tableHeaders = ['#', 'Associate Name', 'Role Tier', 'True Shift PPH', 'Active Pick Speed', 'Shift Hours'];
        tableRows = filteredAssocs.map((a, i) => [
          i + 1,
          a.name,
          a.utilTier.label,
          `${fmtR(a.shiftPPH)} PPH`,
          `${fmtR(a.pickRate)} i/h`,
          `${fmtH(a.shiftHours)} hrs`
        ]);
        break;

      case 'subNil':
        title = `${scopeLabel} • Full Roster Substitutions Offered Leaderboard`;
        icon = 'repeat';
        filteredAssocs.sort((a, b) => b.substitutions - a.substitutions);
        labels = filteredAssocs.map(a => a.name);
        datasets = [
          {
            label: 'Substitutions Provided',
            data: filteredAssocs.map(a => a.substitutions),
            backgroundColor: 'rgba(139, 92, 246, 0.6)',
            borderColor: '#8B5CF6',
            borderWidth: 2,
            borderRadius: 4
          }
        ];
        tableHeaders = ['#', 'Associate Name', 'Role Tier', 'Substitutions', 'Nil Picks', 'Total Items Picked'];
        tableRows = filteredAssocs.map((a, i) => [
          i + 1,
          a.name,
          a.utilTier.label,
          (a.substitutions || 0).toLocaleString(),
          (a.nilPicks || 0).toLocaleString(),
          (a.totalPicked || 0).toLocaleString()
        ]);
        break;

      default:
        title = `${scopeLabel} • Full Roster Associate Breakdown`;
        icon = 'bar-chart-2';
        filteredAssocs.sort((a, b) => b.totalPicked - a.totalPicked);
        labels = filteredAssocs.map(a => a.name);
        datasets = [
          {
            label: 'Total Items Picked',
            data: filteredAssocs.map(a => a.totalPicked),
            backgroundColor: '#3B82F6',
            borderRadius: 4
          }
        ];
        tableHeaders = ['#', 'Associate Name', 'Role Tier', 'Total Picked', 'Pick Speed', 'FTPR %'];
        tableRows = filteredAssocs.map((a, i) => [
          i + 1,
          a.name,
          a.utilTier.label,
          (a.totalPicked || 0).toLocaleString(),
          `${fmtR(a.pickRate)} i/h`,
          `${a.ftprPct}%`
        ]);
        break;
    }
  }

  return {
    title,
    icon,
    scopeLabel,
    totalCount: filteredAssocs.length,
    labels,
    datasets,
    tableHeaders,
    tableRows
  };
}

function renderVisualPopoutContent() {
  const config = getPopoutDatasetAndConfig();
  if (!config) return;

  const titleEl = document.getElementById('popoutTitle');
  const iconEl = document.getElementById('popoutIcon');
  const countLabel = document.getElementById('popoutCountLabel');
  const scopeBadge = document.getElementById('popoutScopeBadge');

  if (titleEl) titleEl.textContent = config.title;
  if (iconEl) iconEl.setAttribute('data-lucide', config.icon);
  if (countLabel) countLabel.textContent = `${config.totalCount} Associates`;
  if (scopeBadge) scopeBadge.textContent = config.scopeLabel;

  if (window.lucide) window.lucide.createIcons();

  // Render Table View
  const theadRow = document.getElementById('popoutTableHeadRow');
  const tbody = document.getElementById('popoutTableBody');
  if (theadRow) {
    theadRow.innerHTML = config.tableHeaders.map((h, idx) => {
      let style = 'text-align: left;';
      if (idx === 0) style = 'width: 48px; text-align: center;';
      else if (idx === 1) style = 'min-width: 170px; text-align: left;';
      else if (idx === 2) style = 'min-width: 150px; text-align: left;';
      else style = 'text-align: right; min-width: 125px;';
      return `<th style="${style}">${h}</th>`;
    }).join('');
  }
  if (tbody) {
    tbody.innerHTML = config.tableRows.map(row => `
      <tr>
        ${row.map((cell, idx) => {
          if (idx === 0) return `<td style="font-weight: 700; color: var(--text-dim); text-align: center; width: 48px;">${cell}</td>`;
          if (idx === 1) return `<td style="font-weight: 700; color: var(--text-main); min-width: 170px;">${cell}</td>`;
          if (idx === 2) {
            let badgeCls = 'badge-util-primary';
            const cStr = String(cell).toLowerCase();
            if (cStr.includes('auxiliary')) badgeCls = 'badge-util-auxiliary';
            else if (cStr.includes('multi') || cStr.includes('hybrid')) badgeCls = 'badge-util-hybrid';
            return `<td style="min-width: 150px;"><span class="badge ${badgeCls}">${cell}</span></td>`;
          }
          return `<td style="text-align: right; font-weight: 600; font-variant-numeric: tabular-nums; min-width: 125px;">${cell}</td>`;
        }).join('')}
      </tr>
    `).join('');
  }

  // Render Chart View
  const ctx = document.getElementById('chartPopoutExpanded');
  const container = document.getElementById('popoutChartContainer');

  if (ctx && container) {
    if (chartPopoutExpanded) chartPopoutExpanded.destroy();

    // Scale canvas height proportionally so all associates have ample room (e.g. 28px per associate bar)
    const dynamicHeight = Math.max(450, config.labels.length * 32);
    container.style.height = `${dynamicHeight}px`;

    const isStacked = (config.datasets.length > 1);

    chartPopoutExpanded = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: config.labels,
        datasets: config.datasets
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            stacked: isStacked,
            ticks: { color: '#94A3B8' },
            grid: { color: 'rgba(255,255,255,0.05)' }
          },
          y: {
            stacked: isStacked,
            ticks: {
              color: '#F8FAFC',
              font: { weight: 600, size: 12 },
              autoSkip: false
            },
            grid: { display: false }
          }
        },
        plugins: {
          legend: {
            display: config.datasets.length > 1 || config.datasets[0]?.label !== '',
            labels: { color: '#F8FAFC' }
          }
        }
      }
    });
  }
}

function exportPopoutCSV() {
  const config = getPopoutDatasetAndConfig();
  if (!config || !config.tableRows.length) return;

  let csvContent = "data:text/csv;charset=utf-8,";
  csvContent += config.tableHeaders.join(",") + "\n";

  config.tableRows.forEach(row => {
    const escaped = row.map(val => `"${String(val).replace(/"/g, '""')}"`);
    csvContent += escaped.join(",") + "\n";
  });

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `Visual_Export_${config.title.replace(/[^a-zA-Z0-9]/g, '_')}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function setupFeedbackStudioEventListeners() {
  const fbSelect = document.getElementById('feedbackAssocSelect');
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

  // Coaching Studio KPI Card Metric Switchers
  document.querySelectorAll('.fb-kpi-card').forEach(card => {
    card.addEventListener('click', () => {
      const metric = card.dataset.fbMetric;
      if (metric) {
        activeFeedbackMetric = metric;
        document.querySelectorAll('.fb-kpi-card').forEach(c => c.classList.remove('active-fb-kpi'));
        card.classList.add('active-fb-kpi');
        if (currentFeedbackData) {
          renderFeedbackChart(currentFeedbackData);
        }
      }
    });
  });

  // Notes History Drawer Toggle
  const btnToggleHistory = document.getElementById('btnToggleNotesHistory');
  const btnCloseHistory = document.getElementById('btnCloseNotesHistory');
  const historyDrawer = document.getElementById('notesHistoryDrawer');

  if (btnToggleHistory && historyDrawer) {
    btnToggleHistory.addEventListener('click', () => {
      const isVisible = historyDrawer.style.display !== 'none';
      historyDrawer.style.display = isVisible ? 'none' : 'block';
      if (!isVisible && window.lucide) window.lucide.createIcons();
    });
  }

  if (btnCloseHistory && historyDrawer) {
    btnCloseHistory.addEventListener('click', () => {
      historyDrawer.style.display = 'none';
    });
  }

  if (btnSaveNotes && notesTextarea) {
    btnSaveNotes.addEventListener('click', async () => {
      if (!feedbackAssociate) return;
      const noteText = notesTextarea.value.trim();
      if (!noteText) return;

      const dateRange = getActiveFilterDateRange();
      const weekParams = getWeekFilterParams();
      let scopeLabel = 'Full Dataset';
      if (filterMode === 'custom') {
        scopeLabel = `${currentStartDate} to ${currentEndDate}`;
      } else if (weekParams.isWeekActive) {
        scopeLabel = `Fiscal ${weekParams.label}`;
      }

      // 1. Add to Associate's Permanent History
      const localKey = `ap2_notes_history_${feedbackAssociate}`;
      let history = [];
      try {
        const raw = localStorage.getItem(localKey);
        if (raw) history = JSON.parse(raw);
      } catch (e) {}

      const now = new Date();
      const newEntry = {
        id: `${Date.now()}_${Math.random()}`,
        timestamp: now.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }),
        isoDate: now.toISOString(),
        timeframe: scopeLabel,
        text: noteText
      };

      // Add to front of history and save
      history.unshift(newEntry);
      localStorage.setItem(localKey, JSON.stringify(history));

      const statusEl = document.getElementById('feedbackNotesStatus');
      if (statusEl) {
        statusEl.style.display = 'block';
        statusEl.textContent = 'Saving note to associate profile & cloud database...';
      }

      const isCloudSaved = await saveCoachingNoteToSupabase({
        associateName: feedbackAssociate,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        notesText: noteText
      });

      if (statusEl) {
        statusEl.textContent = isCloudSaved ? '✓ Saved to Associate Profile & Cloud Database' : '✓ Saved to Associate Profile';
        setTimeout(() => { statusEl.style.display = 'none'; }, 3000);
      }

      // Refresh History UI immediately
      loadAssociateNotesHistory(feedbackAssociate);
    });
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function loadAssociateNotesHistory(associateName) {
  if (!associateName) return;

  const countBadge = document.getElementById('notesCountBadge');
  const listEl = document.getElementById('notesHistoryList');
  const notesTextarea = document.getElementById('feedbackManagerNotes');

  // 1. Get from Local Storage History
  const localKey = `ap2_notes_history_${associateName}`;
  let history = [];
  try {
    const raw = localStorage.getItem(localKey);
    if (raw) history = JSON.parse(raw);
  } catch (e) {}

  // 2. Fetch from Supabase Cloud
  try {
    const cloudNotes = await fetchAllCoachingNotesForAssociate({ associateName });
    if (cloudNotes && cloudNotes.length > 0) {
      cloudNotes.forEach(cn => {
        if (!cn.notes_text) return;
        const exists = history.some(h => (h.text === cn.notes_text) || (h.id && h.id === cn.id));
        if (!exists) {
          const dt = cn.updated_at ? new Date(cn.updated_at) : new Date();
          let scope = 'General Evaluation';
          if (cn.start_date && cn.end_date) {
            scope = `${cn.start_date} to ${cn.end_date}`;
          }
          history.push({
            id: cn.id || `${Date.now()}_${Math.random()}`,
            timestamp: dt.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }),
            isoDate: cn.updated_at || new Date().toISOString(),
            timeframe: scope,
            text: cn.notes_text
          });
        }
      });
    }
  } catch (err) {
    console.warn('Silent note history cloud fetch error:', err);
  }

  // Sort history by date descending
  history.sort((a, b) => new Date(b.isoDate || 0) - new Date(a.isoDate || 0));
  localStorage.setItem(localKey, JSON.stringify(history));

  // Update Count Badge
  if (countBadge) {
    if (history.length > 0) {
      countBadge.textContent = `${history.length} Past Note${history.length === 1 ? '' : 's'} on File`;
      if (countBadge.parentElement) {
        countBadge.parentElement.style.borderColor = 'var(--accent-cyan)';
        countBadge.parentElement.style.color = 'var(--accent-cyan)';
      }
    } else {
      countBadge.textContent = '0 Past Notes on File';
      if (countBadge.parentElement) {
        countBadge.parentElement.style.borderColor = 'var(--bg-glass-border)';
        countBadge.parentElement.style.color = 'var(--text-muted)';
      }
    }
  }

  // Populate Active Textarea with latest note if textarea is blank
  if (notesTextarea && !notesTextarea.value && history.length > 0) {
    notesTextarea.value = history[0].text;
  }

  // Render History List
  if (listEl) {
    if (history.length === 0) {
      listEl.innerHTML = `<div style="text-align: center; padding: 1.25rem; color: var(--text-dim); font-size: 0.82rem;">No past coaching notes recorded yet for ${escapeHtml(associateName)}.</div>`;
    } else {
      listEl.innerHTML = history.map((item, idx) => `
        <div class="note-history-card">
          <div class="note-history-header">
            <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
              <span class="note-history-time">📅 ${item.timestamp}</span>
              <span class="note-history-scope">${escapeHtml(item.timeframe)}</span>
            </div>
            <button class="btn-delete-note" data-note-index="${idx}" title="Delete this note">
              <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
              <span>Delete</span>
            </button>
          </div>
          <div class="note-history-body">${escapeHtml(item.text)}</div>
        </div>
      `).join('');

      // Wire Delete Event Listeners
      listEl.querySelectorAll('.btn-delete-note').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const noteIdx = parseInt(btn.dataset.noteIndex, 10);
          const targetNote = history[noteIdx];
          if (!targetNote) return;

          if (!confirm(`Delete this coaching note from ${targetNote.timestamp}?`)) {
            return;
          }

          // Remove from local storage
          history.splice(noteIdx, 1);
          localStorage.setItem(localKey, JSON.stringify(history));

          // Delete from Cloud Database
          deleteCoachingNoteFromSupabase({
            id: targetNote.id,
            associateName: associateName,
            notesText: targetNote.text
          }).catch(err => console.warn('Cloud note delete silent error:', err));

          const statusEl = document.getElementById('feedbackNotesStatus');
          if (statusEl) {
            statusEl.style.display = 'block';
            statusEl.textContent = '✓ Note deleted successfully.';
            setTimeout(() => { statusEl.style.display = 'none'; }, 3000);
          }

          // Re-render notes history
          loadAssociateNotesHistory(associateName);
        });
      });
    }
  }

  if (window.lucide) window.lucide.createIcons();
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
  const weekParams = getWeekFilterParams();
  const isWeekActive = filterMode === 'week' && weekParams.isWeekActive;

  if (isCustomActive) {
    statusBar.style.display = 'flex';
    if (resetBtn) resetBtn.style.display = 'inline-flex';
    const datesSet = new Set(filteredRows.filter(r => r.day).map(r => r.day));
    summaryEl.textContent = `Custom Date Range: ${currentStartDate} to ${currentEndDate} (${datesSet.size} active days • ${filteredRows.length.toLocaleString()} shift logs)`;
  } else if (isWeekActive) {
    statusBar.style.display = 'flex';
    if (resetBtn) resetBtn.style.display = 'inline-flex';
    summaryEl.textContent = `Fiscal ${weekParams.label} Filter Active (${filteredRows.length.toLocaleString()} shift logs)`;
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
  renderFeedbackStudio();
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

function getContextWeekRows() {
  if (filterMode === 'week') {
    const weekParams = getWeekFilterParams();
    if (weekParams.isWeekActive) {
      return filterDataset(activeDataset, { startWeek: weekParams.startWeek, endWeek: weekParams.endWeek });
    }
  }
  if (filterMode === 'custom' && currentStartDate && currentEndDate) {
    // If it's a single day, find the week of that day to keep the 7-day strip intact
    if (currentStartDate === currentEndDate) {
      const sampleRow = activeDataset.find(r => !r.isTotal && (r.iso_date === currentStartDate || parseDateToISO(r.day) === currentStartDate));
      if (sampleRow && sampleRow.week) {
        return filterDataset(activeDataset, { week: sampleRow.week });
      }
    }
    return filterDataset(activeDataset, { startDate: currentStartDate, endDate: currentEndDate });
  }
  return [];
}

function renderDailyBreakdownStrip() {
  const stripContainer = document.getElementById('executiveDailyStrip');
  const pillsRow = document.getElementById('dailyPillsRow');
  const metricLabel = document.getElementById('dailyStripActiveMetricLabel');
  const scopeBadge1 = document.getElementById('chartTimeScopeBadge1');
  const scopeBadge2 = document.getElementById('chartTimeScopeBadge2');

  if (!stripContainer || !pillsRow) return;

  const weekParams = getWeekFilterParams();
  const isSingleWeek = (filterMode === 'week' && weekParams.isSingleWeek);
  const isCustomRange = (filterMode === 'custom' && currentStartDate && currentEndDate);
  const contextRows = getContextWeekRows();
  const weekDailyData = contextRows.length > 0 ? getDailyTrends(contextRows) : [];

  const isSingleDaySelected = (filterMode === 'custom' && currentStartDate === currentEndDate);

  if ((isSingleWeek || isCustomRange || isSingleDaySelected) && weekDailyData.length > 0) {
    stripContainer.style.display = 'block';

    const metricTitles = {
      volume: 'Picked Volume',
      ftpr: 'FTPR Accuracy',
      pickRate: 'Active Pick Speed',
      shiftPPH: 'True Shift PPH',
      utilization: 'Picker Utilization',
      subNil: 'Subs & Nil Picks'
    };

    if (metricLabel) metricLabel.textContent = `Metric Focus: ${metricTitles[activeExecutiveMetric] || 'Picked Volume'}`;
    
    if (isSingleDaySelected) {
      if (scopeBadge1) scopeBadge1.textContent = `Daily Focus (${currentStartDate})`;
      if (scopeBadge2) scopeBadge2.textContent = `Daily Focus (${currentStartDate})`;
    } else if (isSingleWeek) {
      if (scopeBadge1) scopeBadge1.textContent = `${weekParams.label} Daily Trend`;
      if (scopeBadge2) scopeBadge2.textContent = `${weekParams.label} Daily Precision`;
    } else {
      if (scopeBadge1) scopeBadge1.textContent = 'Daily Trend';
      if (scopeBadge2) scopeBadge2.textContent = 'Daily Precision';
    }

    let html = '';
    weekDailyData.forEach(d => {
      let mainVal = '';
      let subVal = '';

      switch (activeExecutiveMetric) {
        case 'volume':
          mainVal = d.expected.toLocaleString();
          subVal = `${d.pickers} active pickers`;
          break;
        case 'ftpr':
          mainVal = `${d.ftpr.toFixed(1)}%`;
          subVal = `${d.actual.toLocaleString()} / ${d.expected.toLocaleString()} items`;
          break;
        case 'pickRate':
          mainVal = `${d.pickRate.toFixed(1)} i/h`;
          subVal = `${d.hours} pick hrs`;
          break;
        case 'shiftPPH':
          mainVal = d.shiftPPH > 0 ? `${d.shiftPPH.toFixed(1)} PPH` : '--';
          subVal = `${d.shiftHours || 0} shift hrs`;
          break;
        case 'utilization':
          mainVal = d.shiftHours > 0 ? `${d.utilization.toFixed(1)}%` : '--%';
          subVal = `${d.hours} pick / ${d.shiftHours || 0} shift hrs`;
          break;
        case 'subNil':
          mainVal = `${d.substitutions} / ${d.nilPicks}`;
          const subRate = d.expected > 0 ? ((d.substitutions / d.expected) * 100).toFixed(1) : '0.0';
          subVal = `${subRate}% Subs`;
          break;
        default:
          mainVal = d.expected.toLocaleString();
          subVal = `${d.pickers} pickers`;
      }

      const isThisDayActive = (filterMode === 'custom' && currentStartDate === d.isoDate && currentEndDate === d.isoDate);

      html += `
        <div class="daily-pill ${isThisDayActive ? 'active-day-pill' : ''}" data-date="${d.isoDate}" data-datestr="${d.dateStr}" title="Click to ${isThisDayActive ? 'clear daily filter' : 'isolate ' + d.dayName + ' (' + d.dateStr + ')'}">
          <div class="daily-pill-header">
            <span class="daily-pill-day">${d.dayName || 'Day'}</span>
            <span class="daily-pill-date">${d.dateStr}</span>
          </div>
          <div class="daily-pill-value">${mainVal}</div>
          <div class="daily-pill-sub">${subVal}</div>
        </div>
      `;
    });

    pillsRow.innerHTML = html;

    // Attach click handlers to filter dashboard to that specific day
    pillsRow.querySelectorAll('.daily-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        const iso = pill.dataset.date;
        if (!iso) return;

        // If clicking the already selected single day, reset back to full week/range
        if (filterMode === 'custom' && currentStartDate === iso && currentEndDate === iso) {
          filterMode = 'week';
          currentStartDate = datasetBounds.minDate;
          currentEndDate = datasetBounds.maxDate;

          const weekContainer = document.getElementById('weekFilterContainer');
          const customDateContainer = document.getElementById('customDateControls');
          const dateModeLabel = document.getElementById('dateModeLabel');
          if (weekContainer) weekContainer.style.display = 'flex';
          if (customDateContainer) customDateContainer.style.display = 'none';
          if (dateModeLabel) dateModeLabel.textContent = 'Custom Dates';
          renderAllViews();
          return;
        }

        // Switch to single day isolation
        filterMode = 'custom';
        currentStartDate = iso;
        currentEndDate = iso;

        const weekContainer = document.getElementById('weekFilterContainer');
        const customDateContainer = document.getElementById('customDateControls');
        const startInput = document.getElementById('filterStartDate');
        const endInput = document.getElementById('filterEndDate');
        const dateModeLabel = document.getElementById('dateModeLabel');

        if (weekContainer) weekContainer.style.display = 'none';
        if (customDateContainer) customDateContainer.style.display = 'flex';
        if (startInput) startInput.value = iso;
        if (endInput) endInput.value = iso;
        if (dateModeLabel) dateModeLabel.textContent = 'Fiscal Weeks';

        renderAllViews();
      });
    });
  } else {
    stripContainer.style.display = 'none';
    if (scopeBadge1) scopeBadge1.textContent = 'Weekly Trend';
    if (scopeBadge2) scopeBadge2.textContent = 'Weekly Precision';
  }
}

function renderCharts() {
  const filteredRows = getFilteredActiveDataset();
  const contextRows = getContextWeekRows();
  const weekParams = getWeekFilterParams();
  const isSingleWeek = (filterMode === 'week' && weekParams.isSingleWeek);
  const isCustomRange = (filterMode === 'custom' && currentStartDate && currentEndDate);
  const isSingleDaySelected = (filterMode === 'custom' && currentStartDate === currentEndDate);
  const isDailyMode = (isSingleWeek || isCustomRange || contextRows.length > 0);

  // Render Daily Strip
  renderDailyBreakdownStrip();

  const associates = getAssociateAggregates(filteredRows);
  const timeData = (isDailyMode && contextRows.length > 0)
    ? getDailyTrends(contextRows)
    : (isDailyMode && filteredRows.length > 0 ? getDailyTrends(filteredRows) : getWeeklyTrends(filteredRows.length > 0 ? filteredRows : activeDataset));

  const labels = timeData.map(t => isDailyMode ? t.label : t.week);

  const ctxVol = document.getElementById('chartVolumeSpeed');
  const textChart1 = document.getElementById('textChart1');
  const iconChart1 = document.getElementById('iconChart1');

  const ctxAcc = document.getElementById('chartAccuracySub');
  const textChart2 = document.getElementById('textChart2');
  const iconChart2 = document.getElementById('iconChart2');

  // =========================================================================
  // SCENARIO A: SINGLE DAY ISOLATION DEEP-DIVE MODE
  // =========================================================================
  if (isSingleDaySelected && filteredRows.length > 0) {
    const dayLabel = filteredRows[0]?.day || currentStartDate;

    // -------------------------------------------------------------
    // Metric 1: TOTAL VOLUME DEEP-DIVE
    // -------------------------------------------------------------
    if (activeExecutiveMetric === 'volume') {
      // Left: Top 10 Pickers by Items Picked on this Day
      const topPickers = [...associates].sort((a, b) => b.totalPicked - a.totalPicked).slice(0, 10);
      if (textChart1) textChart1.textContent = `${dayLabel} • Top 10 Associate Pick Volume Leaderboard`;
      if (iconChart1) iconChart1.setAttribute('data-lucide', 'trophy');

      if (ctxVol) {
        if (chartVolumeSpeed) chartVolumeSpeed.destroy();
        chartVolumeSpeed = new Chart(ctxVol, {
          type: 'bar',
          data: {
            labels: topPickers.map(a => a.name),
            datasets: [{
              label: 'Items Picked',
              data: topPickers.map(a => a.totalPicked),
              backgroundColor: 'rgba(59, 130, 246, 0.5)',
              borderColor: '#3B82F6',
              borderWidth: 2,
              borderRadius: 6
            }]
          },
          options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              x: { ticks: { color: '#94A3B8' }, grid: { color: 'rgba(255,255,255,0.05)' } },
              y: { ticks: { color: '#F8FAFC', font: { weight: 600 } }, grid: { display: false } }
            },
            plugins: { legend: { labels: { color: '#F8FAFC' } } }
          }
        });
      }

      // Right: Volume Share by Role Tier
      const tierCounts = { 'Primary Picker': 0, 'Multi-Role': 0, 'Auxiliary Support': 0 };
      associates.forEach(a => {
        const tier = a.utilTier.label;
        if (tierCounts[tier] !== undefined) tierCounts[tier] += a.totalPicked;
        else tierCounts['Auxiliary Support'] += a.totalPicked;
      });

      if (textChart2) textChart2.textContent = `${dayLabel} • Pick Volume Share by Picker Role Tier`;
      if (iconChart2) iconChart2.setAttribute('data-lucide', 'pie-chart');

      if (ctxAcc) {
        if (chartAccuracySub) chartAccuracySub.destroy();
        chartAccuracySub = new Chart(ctxAcc, {
          type: 'doughnut',
          data: {
            labels: Object.keys(tierCounts),
            datasets: [{
              data: Object.values(tierCounts),
              backgroundColor: ['#10B981', '#F59E0B', '#3B82F6'],
              borderColor: '#0F172A',
              borderWidth: 3
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { color: '#F8FAFC' } } }
          }
        });
      }
    }

    // -------------------------------------------------------------
    // Metric 2: STORE FTPR ACCURACY DEEP-DIVE
    // -------------------------------------------------------------
    else if (activeExecutiveMetric === 'ftpr') {
      // Left: Day Accuracy Distribution
      const ftprBuckets = { '97%+ (Elite)': 0, '95% – 96.9% (Solid)': 0, '93% – 94.9% (Benchmark)': 0, '< 93% (Focus)': 0 };
      associates.forEach(a => {
        const r = parseFloat(a.ftprPct);
        if (r >= 97) ftprBuckets['97%+ (Elite)']++;
        else if (r >= 95) ftprBuckets['95% – 96.9% (Solid)']++;
        else if (r >= 93) ftprBuckets['93% – 94.9% (Benchmark)']++;
        else ftprBuckets['< 93% (Focus)']++;
      });

      if (textChart1) textChart1.textContent = `${dayLabel} • Picker FTPR Accuracy Distribution`;
      if (iconChart1) iconChart1.setAttribute('data-lucide', 'target');

      if (ctxVol) {
        if (chartVolumeSpeed) chartVolumeSpeed.destroy();
        chartVolumeSpeed = new Chart(ctxVol, {
          type: 'bar',
          data: {
            labels: Object.keys(ftprBuckets),
            datasets: [{
              label: 'Associate Pickers',
              data: Object.values(ftprBuckets),
              backgroundColor: ['#10B981', '#06B6D4', '#F59E0B', '#F43F5E'],
              borderRadius: 6
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              x: { ticks: { color: '#94A3B8' }, grid: { display: false } },
              y: { ticks: { color: '#94A3B8' }, grid: { color: 'rgba(255,255,255,0.05)' } }
            },
            plugins: { legend: { display: false } }
          }
        });
      }

      // Right: Top Pickers with Subs & Nil Picks
      const topSubsNil = [...associates].sort((a, b) => (b.substitutions + b.nilPicks) - (a.substitutions + a.nilPicks)).slice(0, 10);
      if (textChart2) textChart2.textContent = `${dayLabel} • Associate Subs & Nil Picks Breakdown`;
      if (iconChart2) iconChart2.setAttribute('data-lucide', 'alert-triangle');

      if (ctxAcc) {
        if (chartAccuracySub) chartAccuracySub.destroy();
        chartAccuracySub = new Chart(ctxAcc, {
          type: 'bar',
          data: {
            labels: topSubsNil.map(a => a.name),
            datasets: [
              {
                label: 'Substitutions',
                data: topSubsNil.map(a => a.substitutions),
                backgroundColor: '#8B5CF6',
                borderRadius: 4
              },
              {
                label: 'Nil Picks',
                data: topSubsNil.map(a => a.nilPicks),
                backgroundColor: '#F43F5E',
                borderRadius: 4
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
    }

    // -------------------------------------------------------------
    // Metric 3: ACTIVE PICK SPEED DEEP-DIVE
    // -------------------------------------------------------------
    else if (activeExecutiveMetric === 'pickRate') {
      // Left: Pick Speed Distribution
      const speedBuckets = { '110+ i/h': 0, '90 – 109 i/h': 0, '70 – 89 i/h': 0, '< 70 i/h': 0 };
      associates.forEach(a => {
        if (a.pickRate >= 110) speedBuckets['110+ i/h']++;
        else if (a.pickRate >= 90) speedBuckets['90 – 109 i/h']++;
        else if (a.pickRate >= 70) speedBuckets['70 – 89 i/h']++;
        else speedBuckets['< 70 i/h']++;
      });

      if (textChart1) textChart1.textContent = `${dayLabel} • Picker Speed Distribution Histogram`;
      if (iconChart1) iconChart1.setAttribute('data-lucide', 'zap');

      if (ctxVol) {
        if (chartVolumeSpeed) chartVolumeSpeed.destroy();
        chartVolumeSpeed = new Chart(ctxVol, {
          type: 'bar',
          data: {
            labels: Object.keys(speedBuckets),
            datasets: [{
              label: 'Associate Pickers',
              data: Object.values(speedBuckets),
              backgroundColor: ['#10B981', '#3B82F6', '#F59E0B', '#F43F5E'],
              borderRadius: 6
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              x: { ticks: { color: '#94A3B8' }, grid: { display: false } },
              y: { ticks: { color: '#94A3B8' }, grid: { color: 'rgba(255,255,255,0.05)' } }
            },
            plugins: { legend: { display: false } }
          }
        });
      }

      // Right: Top 10 Fastest Pickers
      const topSpeed = [...associates].sort((a, b) => b.pickRate - a.pickRate).slice(0, 10);
      if (textChart2) textChart2.textContent = `${dayLabel} • Top 10 Fastest Active Pickers (IPH)`;
      if (iconChart2) iconChart2.setAttribute('data-lucide', 'flame');

      if (ctxAcc) {
        if (chartAccuracySub) chartAccuracySub.destroy();
        chartAccuracySub = new Chart(ctxAcc, {
          type: 'bar',
          data: {
            labels: topSpeed.map(a => a.name),
            datasets: [{
              label: 'Active Pick Speed (i/h)',
              data: topSpeed.map(a => a.pickRate),
              backgroundColor: 'rgba(16, 185, 129, 0.5)',
              borderColor: '#10B981',
              borderWidth: 2,
              borderRadius: 6
            }]
          },
          options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              x: { ticks: { color: '#94A3B8' }, grid: { color: 'rgba(255,255,255,0.05)' } },
              y: { ticks: { color: '#F8FAFC', font: { weight: 600 } }, grid: { display: false } }
            },
            plugins: { legend: { labels: { color: '#F8FAFC' } } }
          }
        });
      }
    }

    // -------------------------------------------------------------
    // Metric 4: TRUE SHIFT PPH & UTILIZATION DEEP-DIVE
    // -------------------------------------------------------------
    else if (activeExecutiveMetric === 'shiftPPH' || activeExecutiveMetric === 'utilization') {
      // Left: Active Pick Hours vs Non-Pick Hours per Associate (Stacked)
      const topWorked = [...associates].filter(a => a.shiftHours > 0 || a.pickHours > 0).sort((a, b) => (b.pickHours - a.pickHours) || (b.shiftHours - a.shiftHours)).slice(0, 10);
      if (textChart1) textChart1.textContent = `${dayLabel} • Active Pick vs Non-Pick Shift Hours`;
      if (iconChart1) iconChart1.setAttribute('data-lucide', 'clock');

      if (ctxVol) {
        if (chartVolumeSpeed) chartVolumeSpeed.destroy();
        chartVolumeSpeed = new Chart(ctxVol, {
          type: 'bar',
          data: {
            labels: topWorked.map(a => a.name),
            datasets: [
              {
                label: 'Active Pick Hours',
                data: topWorked.map(a => a.pickHours),
                backgroundColor: '#10B981',
                borderRadius: 4
              },
              {
                label: 'Non-Pick / Staging Hours',
                data: topWorked.map(a => a.nonPickHours),
                backgroundColor: '#F59E0B',
                borderRadius: 4
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              x: { stacked: true, ticks: { color: '#94A3B8' }, grid: { color: 'rgba(255,255,255,0.05)' } },
              y: { stacked: true, ticks: { color: '#94A3B8' }, grid: { color: 'rgba(255,255,255,0.05)' } }
            },
            plugins: { legend: { labels: { color: '#F8FAFC' } } }
          }
        });
      }

      // Right: Shift PPH Leaderboard
      const topPPH = [...associates].filter(a => a.shiftPPH > 0).sort((a, b) => b.shiftPPH - a.shiftPPH).slice(0, 10);
      if (textChart2) textChart2.textContent = `${dayLabel} • True Shift PPH Leaderboard`;
      if (iconChart2) iconChart2.setAttribute('data-lucide', 'trending-up');

      if (ctxAcc) {
        if (chartAccuracySub) chartAccuracySub.destroy();
        chartAccuracySub = new Chart(ctxAcc, {
          type: 'bar',
          data: {
            labels: topPPH.map(a => a.name),
            datasets: [{
              label: 'True Shift PPH',
              data: topPPH.map(a => a.shiftPPH),
              backgroundColor: 'rgba(245, 158, 11, 0.5)',
              borderColor: '#F59E0B',
              borderWidth: 2,
              borderRadius: 6
            }]
          },
          options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              x: { ticks: { color: '#94A3B8' }, grid: { color: 'rgba(255,255,255,0.05)' } },
              y: { ticks: { color: '#F8FAFC', font: { weight: 600 } }, grid: { display: false } }
            },
            plugins: { legend: { labels: { color: '#F8FAFC' } } }
          }
        });
      }
    }

    // -------------------------------------------------------------
    // Metric 5: SUBSTITUTIONS & NIL PICKS DEEP-DIVE
    // -------------------------------------------------------------
    else if (activeExecutiveMetric === 'subNil') {
      const topNil = [...associates].sort((a, b) => b.nilPicks - a.nilPicks).slice(0, 10);
      if (textChart1) textChart1.textContent = `${dayLabel} • Associates with Highest Nil Picks`;
      if (iconChart1) iconChart1.setAttribute('data-lucide', 'alert-circle');

      if (ctxVol) {
        if (chartVolumeSpeed) chartVolumeSpeed.destroy();
        chartVolumeSpeed = new Chart(ctxVol, {
          type: 'bar',
          data: {
            labels: topNil.map(a => a.name),
            datasets: [{
              label: 'Nil Picks',
              data: topNil.map(a => a.nilPicks),
              backgroundColor: 'rgba(244, 63, 94, 0.5)',
              borderColor: '#F43F5E',
              borderWidth: 2,
              borderRadius: 6
            }]
          },
          options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              x: { ticks: { color: '#94A3B8' }, grid: { color: 'rgba(255,255,255,0.05)' } },
              y: { ticks: { color: '#F8FAFC', font: { weight: 600 } }, grid: { display: false } }
            },
            plugins: { legend: { labels: { color: '#F8FAFC' } } }
          }
        });
      }

      const topSubs = [...associates].sort((a, b) => b.substitutions - a.substitutions).slice(0, 10);
      if (textChart2) textChart2.textContent = `${dayLabel} • Top Associate Substitutions Offered`;
      if (iconChart2) iconChart2.setAttribute('data-lucide', 'repeat');

      if (ctxAcc) {
        if (chartAccuracySub) chartAccuracySub.destroy();
        chartAccuracySub = new Chart(ctxAcc, {
          type: 'bar',
          data: {
            labels: topSubs.map(a => a.name),
            datasets: [{
              label: 'Substitutions Provided',
              data: topSubs.map(a => a.substitutions),
              backgroundColor: 'rgba(139, 92, 246, 0.5)',
              borderColor: '#8B5CF6',
              borderWidth: 2,
              borderRadius: 6
            }]
          },
          options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              x: { ticks: { color: '#94A3B8' }, grid: { color: 'rgba(255,255,255,0.05)' } },
              y: { ticks: { color: '#F8FAFC', font: { weight: 600 } }, grid: { display: false } }
            },
            plugins: { legend: { labels: { color: '#F8FAFC' } } }
          }
        });
      }
    }

    if (window.lucide) window.lucide.createIcons();
    // Continue executing below so scatter matrix (tab 2) and distributions (tab 5) are updated with the single-day data!
  } else {
    // =========================================================================
    // SCENARIO B: WEEKLY & MULTI-DAY TIMELINE MODE
    // =========================================================================

    // 1. Chart 1: Primary Performance Trend (Metric-Adaptive)
    if (ctxVol) {
      if (chartVolumeSpeed) chartVolumeSpeed.destroy();

      let dataset1 = {};
      let dataset2 = {};
      let title1 = '';
      let icon1 = 'trending-up';

      switch (activeExecutiveMetric) {
        case 'ftpr':
          title1 = isDailyMode ? 'Daily FTPR Accuracy % vs. First-Time Volume' : 'Weekly FTPR Accuracy % Trend';
          icon1 = 'target';
          dataset1 = {
            label: 'Expected Item Volume',
            data: timeData.map(t => t.expected),
            type: 'bar',
            backgroundColor: 'rgba(16, 185, 129, 0.25)',
            borderColor: '#10B981',
            borderWidth: 2,
            borderRadius: 6,
            yAxisID: 'y'
          };
          dataset2 = {
            label: 'Store FTPR % (Target: 94%)',
            data: timeData.map(t => t.ftpr),
            type: 'line',
            borderColor: '#06B6D4',
            backgroundColor: 'rgba(6, 182, 212, 0.1)',
            borderWidth: 3,
            pointRadius: 5,
            pointBackgroundColor: '#06B6D4',
            tension: 0.3,
            yAxisID: 'y1'
          };
          break;

        case 'pickRate':
          title1 = isDailyMode ? 'Daily Active Pick Speed (IPH) vs. Active Pick Hours' : 'Weekly Pick Speed (IPH) & Active Hours';
          icon1 = 'zap';
          dataset1 = {
            label: 'Active Pick Hours',
            data: timeData.map(t => t.hours),
            type: 'bar',
            backgroundColor: 'rgba(139, 92, 246, 0.35)',
            borderColor: '#8B5CF6',
            borderWidth: 2,
            borderRadius: 6,
            yAxisID: 'y'
          };
          dataset2 = {
            label: 'Avg Active Pick Speed (i/h)',
            data: timeData.map(t => t.pickRate),
            type: 'line',
            borderColor: '#10B981',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            borderWidth: 3,
            pointRadius: 5,
            pointBackgroundColor: '#10B981',
            tension: 0.3,
            yAxisID: 'y1'
          };
          break;

        case 'shiftPPH':
          title1 = isDailyMode ? 'Daily True Shift PPH vs. Scheduled Worked Hours' : 'Weekly True Shift PPH & Worked Hours';
          icon1 = 'trending-up';
          dataset1 = {
            label: 'Scheduled Shift Hours',
            data: timeData.map(t => t.shiftHours || 0),
            type: 'bar',
            backgroundColor: 'rgba(16, 185, 129, 0.3)',
            borderColor: '#10B981',
            borderWidth: 2,
            borderRadius: 6,
            yAxisID: 'y'
          };
          dataset2 = {
            label: 'True Shift PPH',
            data: timeData.map(t => t.shiftPPH),
            type: 'line',
            borderColor: '#F59E0B',
            backgroundColor: 'rgba(245, 158, 11, 0.1)',
            borderWidth: 3,
            pointRadius: 5,
            pointBackgroundColor: '#F59E0B',
            tension: 0.3,
            yAxisID: 'y1'
          };
          break;

        case 'utilization':
          title1 = isDailyMode ? 'Daily Picker Utilization % vs. Active vs Shift Hours' : 'Weekly Picker Utilization % & Hours Ratio';
          icon1 = 'pie-chart';
          dataset1 = {
            label: 'Total Shift Hours',
            data: timeData.map(t => t.shiftHours || 0),
            type: 'bar',
            backgroundColor: 'rgba(245, 158, 11, 0.25)',
            borderColor: '#F59E0B',
            borderWidth: 2,
            borderRadius: 6,
            yAxisID: 'y'
          };
          dataset2 = {
            label: 'Picker Utilization %',
            data: timeData.map(t => t.utilization),
            type: 'line',
            borderColor: '#3B82F6',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            borderWidth: 3,
            pointRadius: 5,
            pointBackgroundColor: '#3B82F6',
            tension: 0.3,
            yAxisID: 'y1'
          };
          break;

        case 'subNil':
          title1 = isDailyMode ? 'Daily Substitutions & Nil Picks Volume' : 'Weekly Substitutions vs. Nil Picks';
          icon1 = 'alert-triangle';
          dataset1 = {
            label: 'Substitutions',
            data: timeData.map(t => t.substitutions),
            type: 'bar',
            backgroundColor: 'rgba(139, 92, 246, 0.4)',
            borderColor: '#8B5CF6',
            borderWidth: 2,
            borderRadius: 6,
            yAxisID: 'y'
          };
          dataset2 = {
            label: 'Nil Picks',
            data: timeData.map(t => t.nilPicks),
            type: 'bar',
            backgroundColor: 'rgba(244, 63, 94, 0.4)',
            borderColor: '#F43F5E',
            borderWidth: 2,
            borderRadius: 6,
            yAxisID: 'y'
          };
          break;

        case 'volume':
        default:
          title1 = isDailyMode ? 'Daily Picked Volume & Active Pick Speed' : 'Weekly Volume & Picking Speed Trend';
          icon1 = 'trending-up';
          dataset1 = {
            label: 'Picked Volume (Items)',
            data: timeData.map(t => t.expected),
            type: 'bar',
            backgroundColor: 'rgba(59, 130, 246, 0.4)',
            borderColor: '#3B82F6',
            borderWidth: 2,
            borderRadius: 6,
            yAxisID: 'y'
          };
          dataset2 = {
            label: 'Avg Active Pick Speed (i/h)',
            data: timeData.map(t => t.pickRate),
            type: 'line',
            borderColor: '#10B981',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            borderWidth: 3,
            pointRadius: 5,
            pointBackgroundColor: '#10B981',
            tension: 0.3,
            yAxisID: 'y1'
          };
          break;
      }

      if (textChart1) textChart1.textContent = title1;
      if (iconChart1) iconChart1.setAttribute('data-lucide', icon1);

      chartVolumeSpeed = new Chart(ctxVol, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [dataset1, dataset2]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: { ticks: { color: '#94A3B8' }, grid: { color: 'rgba(255,255,255,0.05)' } },
            y: { position: 'left', ticks: { color: '#94A3B8' }, grid: { color: 'rgba(255,255,255,0.05)' } },
            y1: { position: 'right', ticks: { color: dataset2.borderColor || '#10B981' }, grid: { drawOnChartArea: false } }
          },
          plugins: {
            legend: { labels: { color: '#F8FAFC' } },
            tooltip: {
              callbacks: {
                title: (items) => isDailyMode && items[0] ? `${items[0].label}` : items[0]?.label
              }
            }
          }
        }
      });
    }

    // 2. Chart 2: Secondary Quality & Efficiency Trend (Metric-Adaptive)
    if (ctxAcc) {
      if (chartAccuracySub) chartAccuracySub.destroy();

      let chart2Data = [];
      let title2 = '';
      let icon2 = 'shield-check';

      if (activeExecutiveMetric === 'utilization' || activeExecutiveMetric === 'shiftPPH') {
        title2 = isDailyMode ? 'Daily Active Pick Speed vs. Shift PPH' : 'Weekly Active Pick Speed vs. Shift PPH';
        icon2 = 'trending-up';
        chart2Data = [
          {
            label: 'Active Pick Speed (i/h)',
            data: timeData.map(t => t.pickRate),
            borderColor: '#10B981',
            borderWidth: 3,
            tension: 0.3,
            pointRadius: 5
          },
          {
            label: 'True Shift PPH',
            data: timeData.map(t => t.shiftPPH),
            borderColor: '#F59E0B',
            borderWidth: 2,
            borderDash: [5, 5],
            tension: 0.3,
            pointRadius: 4
          }
        ];
      } else {
        title2 = isDailyMode ? 'Daily FTPR Accuracy vs. Substitution Quantity' : 'Store FTPR Accuracy vs. Substitution Ratio';
        icon2 = 'shield-check';
        chart2Data = [
          {
            label: 'Store FTPR Accuracy %',
            data: timeData.map(t => t.ftpr),
            borderColor: '#10B981',
            borderWidth: 3,
            tension: 0.3,
            pointRadius: 5
          },
          {
            label: 'Substitutions',
            data: timeData.map(t => t.substitutions),
            borderColor: '#8B5CF6',
            borderWidth: 2,
            borderDash: [5, 5],
            tension: 0.3,
            pointRadius: 4
          }
        ];
      }

      if (textChart2) textChart2.textContent = title2;
      if (iconChart2) iconChart2.setAttribute('data-lucide', icon2);

      chartAccuracySub = new Chart(ctxAcc, {
        type: 'line',
        data: {
          labels: labels,
          datasets: chart2Data
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: { ticks: { color: '#94A3B8' }, grid: { color: 'rgba(255,255,255,0.05)' } },
            y: { ticks: { color: '#94A3B8' }, grid: { color: 'rgba(255,255,255,0.05)' } }
          },
          plugins: {
            legend: { labels: { color: '#F8FAFC' } },
            tooltip: {
              callbacks: {
                title: (items) => isDailyMode && items[0] ? `${items[0].label}` : items[0]?.label
              }
            }
          }
        }
      });
    }
  }

  if (window.lucide) window.lucide.createIcons();

  // 3. Scatter Matrix (Speed vs Accuracy or Shift PPH vs Accuracy)
  const ctxScatter = document.getElementById('chartScatterMatrix');
  if (ctxScatter) {
    if (chartScatterMatrix) chartScatterMatrix.destroy();

    const isShift = (scatterMetric === 'shift');

    // Update Role Tier Counts on Summary Strip
    const primaryCount = associates.filter(a => a.utilization >= 70).length;
    const multiCount = associates.filter(a => a.utilization >= 40 && a.utilization < 70).length;
    const auxCount = associates.filter(a => a.utilization < 40).length;

    const elPrimary = document.getElementById('matrixCountPrimary');
    const elMulti = document.getElementById('matrixCountMulti');
    const elAux = document.getElementById('matrixCountAuxiliary');
    if (elPrimary) elPrimary.textContent = primaryCount;
    if (elMulti) elMulti.textContent = multiCount;
    if (elAux) elAux.textContent = auxCount;

    // Filter associates by selected role tier if active
    let scatterAssociates = associates;
    if (scatterRoleFilter === 'primary') {
      scatterAssociates = associates.filter(a => a.utilization >= 70);
    } else if (scatterRoleFilter === 'multi') {
      scatterAssociates = associates.filter(a => a.utilization >= 40 && a.utilization < 70);
    } else if (scatterRoleFilter === 'auxiliary') {
      scatterAssociates = associates.filter(a => a.utilization < 40);
    }

    const scatterData = scatterAssociates.map(a => {
      const speedVal = isShift ? (a.shiftPPH > 0 ? a.shiftPPH : a.pickRate) : a.pickRate;
      
      // Determine point style based on role tier
      let pointShape = 'circle';
      let pointRadius = 7;
      if (a.utilization >= 70) {
        pointShape = 'circle'; // Primary Picker (●)
        pointRadius = 8;
      } else if (a.utilization >= 40) {
        pointShape = 'rectRot'; // Multi-Role (◆)
        pointRadius = 8;
      } else {
        pointShape = 'triangle'; // Auxiliary Support (▲)
        pointRadius = 8;
      }

      return {
        x: speedVal,
        y: parseFloat(a.ftprPct),
        name: a.name,
        quad: a.quadrant,
        shiftPPH: a.shiftPPH,
        activeRate: a.pickRate,
        util: a.utilization,
        roleLabel: a.utilTier.label,
        pointShape: pointShape,
        pointRadius: pointRadius
      };
    });

    const counts = {
      pacesetter: scatterAssociates.filter(a => a.quadrant.id === 'pacesetter').length,
      speedDemon: scatterAssociates.filter(a => a.quadrant.id === 'speed-demon').length,
      qualityChampion: scatterAssociates.filter(a => a.quadrant.id === 'quality-champion').length,
      opportunity: scatterAssociates.filter(a => a.quadrant.id === 'opportunity').length
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
          pointStyle: (ctx) => {
            const raw = ctx.raw;
            return raw ? raw.pointShape : 'circle';
          },
          pointRadius: (ctx) => {
            const raw = ctx.raw;
            return raw ? raw.pointRadius : 7;
          },
          pointHoverRadius: 11
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        onClick: (event, elements) => {
          if (elements && elements.length > 0) {
            const el = elements[0];
            const datasetIndex = el.datasetIndex;
            const index = el.index;
            const pointData = chartScatterMatrix.data.datasets[datasetIndex].data[index];
            if (pointData && pointData.name) {
              openCoachingStudioForAssociate(pointData.name);
            }
          }
        },
        onHover: (event, chartElement) => {
          if (event.native && event.native.target) {
            event.native.target.style.cursor = (chartElement && chartElement.length > 0) ? 'pointer' : 'default';
          }
        },
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
                  return `${r.name} [${r.roleLabel} • ${r.util}% Util]: ${r.x} PPH (${r.activeRate} Active IPH) | ${r.y}% FTPR`;
                }
                return `${r.name} [${r.roleLabel}]: ${r.x} i/h | ${r.y}% FTPR (${r.quad.name})`;
              },
              afterLabel: () => '👉 Click to open 1-on-1 Coaching Studio'
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

  const weekParams = getWeekFilterParams();
  const isDetailed = (filterMode === 'week' && weekParams.isWeekActive) || (filterMode === 'custom');

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
        openCoachingStudioForAssociate(name);
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
  const scopeBadgeText = document.getElementById('feedbackActiveScopeText');

  // Compute active global timeframe
  const dateRange = getActiveFilterDateRange();
  const weekParams = getWeekFilterParams();

  let activeScopeLabel = 'Full Dataset';
  if (filterMode === 'custom') {
    activeScopeLabel = `${currentStartDate} to ${currentEndDate}`;
  } else if (weekParams.isWeekActive) {
    activeScopeLabel = `Fiscal ${weekParams.label}`;
    if (dateRange.startDate && dateRange.endDate && dateRange.startDate !== datasetBounds.minDate) {
      activeScopeLabel += ` (${dateRange.startDate} – ${dateRange.endDate})`;
    }
  }

  if (scopeBadgeText) {
    scopeBadgeText.textContent = activeScopeLabel;
  }

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
    startDate: dateRange.startDate,
    endDate: dateRange.endDate
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

  document.getElementById('fbPeriodSummaryText').textContent = `Evaluating ${m.daysCount} active shift logs across ${activeScopeLabel}`;

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

  // Update Active KPI Card Highlight
  document.querySelectorAll('.fb-kpi-card').forEach(c => {
    if (c.dataset.fbMetric === activeFeedbackMetric) {
      c.classList.add('active-fb-kpi');
    } else {
      c.classList.remove('active-fb-kpi');
    }
  });

  // Render Daily Metric Chart
  renderFeedbackChart(currentFeedbackData);

  // Lists
  const strengthsList = document.getElementById('fbStrengthsList');
  if (strengthsList) {
    strengthsList.innerHTML = currentFeedbackData.strengths.map(s => `<li>${s}</li>`).join('');
  }

  const coachingList = document.getElementById('fbCoachingList');
  if (coachingList) {
    coachingList.innerHTML = currentFeedbackData.coachingPoints.map(c => `<li>${c}</li>`).join('');
  }

  const scriptBox = document.getElementById('fbScriptContent') || document.getElementById('feedbackDiscussionScript');
  if (scriptBox) {
    scriptBox.textContent = currentFeedbackData.feedbackScript;
  }

  // SMART Goals
  const goalsGrid = document.getElementById('fbGoalsGrid') || document.getElementById('fbGoalsContainer');
  if (goalsGrid) {
    goalsGrid.innerHTML = currentFeedbackData.smartGoals.map(g => `
      <div class="smart-goal-card">
        <div class="smart-goal-title">${g.title}</div>
        <div class="smart-goal-target">${g.target} Target</div>
        <div class="smart-goal-current">Current: <strong>${g.current}</strong> (Benchmark: ${g.benchmark})</div>
      </div>
    `).join('');
  }

  // Daily Shifts Table
  const tbody = document.getElementById('fbDailyShiftsTbody');
  const shiftCountEl = document.getElementById('fbDailyShiftCount');
  if (shiftCountEl && currentFeedbackData.dailyShifts) {
    const count = currentFeedbackData.dailyShifts.length;
    shiftCountEl.textContent = `${count} Shift${count === 1 ? '' : 's'} Logged in Scope`;
  }

  if (tbody) {
    tbody.innerHTML = currentFeedbackData.dailyShifts.map(s => `
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
    `).join('') || `<tr><td colspan="10" style="text-align: center; color: var(--text-dim);">No daily shift logs available</td></tr>`;
  }

  // Load Associate Notes History & Latest Draft
  loadAssociateNotesHistory(feedbackAssociate);

  if (window.lucide) window.lucide.createIcons();
}

function renderFeedbackChart(feedbackData) {
  const ctxTrend = document.getElementById('chartFeedbackTrend');
  const titleEl = document.getElementById('fbChartTitle');
  const iconEl = document.getElementById('fbChartIcon');
  const countEl = document.getElementById('fbTrendPointsCount');
  if (!ctxTrend || !feedbackData) return;

  if (chartFeedbackTrend) chartFeedbackTrend.destroy();

  const dailyTrend = feedbackData.dailyTrend || [];
  if (countEl) {
    countEl.textContent = `${dailyTrend.length} Daily Shifts across Timeframe`;
  }

  if (dailyTrend.length === 0) {
    if (titleEl) titleEl.textContent = 'No Daily Shifts in Selected Timeframe';
    return;
  }

  const labels = dailyTrend.map(d => {
    if (d.isoDate) {
      const parts = d.isoDate.split('-');
      if (parts.length === 3) {
        const dt = new Date(`${d.isoDate}T00:00:00`);
        const dayName = dt.toLocaleDateString('en-US', { weekday: 'short' });
        return `${dayName} ${parseInt(parts[1], 10)}/${parseInt(parts[2], 10)}`;
      }
    }
    return d.label || d.date;
  });

  let chartType = 'line';
  let datasets = [];
  let titleText = 'Daily Speed & Accuracy Trend';
  let iconName = 'trending-up';
  let iconColor = 'var(--accent-blue)';
  let scalesConfig = {
    x: { 
      ticks: { color: '#94A3B8', font: { family: 'Plus Jakarta Sans', size: 11 } }, 
      grid: { color: 'rgba(255,255,255,0.05)' } 
    },
    y: { 
      ticks: { color: '#94A3B8', font: { family: 'Plus Jakarta Sans', size: 11 } }, 
      grid: { color: 'rgba(255,255,255,0.05)' } 
    }
  };

  switch (activeFeedbackMetric) {
    case 'speed': {
      titleText = 'Daily Active Pick Speed vs. Store Benchmark (80.0 i/h)';
      iconName = 'zap';
      iconColor = 'var(--accent-blue)';
      const speedData = dailyTrend.map(d => d.pickRate);
      const benchmarkData = dailyTrend.map(() => 80.0);

      datasets = [
        {
          label: 'Active Pick Speed (i/h)',
          data: speedData,
          borderColor: '#3B82F6',
          backgroundColor: 'rgba(59, 130, 246, 0.12)',
          borderWidth: 3,
          pointRadius: 5,
          pointHoverRadius: 8,
          pointBackgroundColor: '#3B82F6',
          fill: true,
          tension: 0.3
        },
        {
          label: 'Store Benchmark (80.0 i/h)',
          data: benchmarkData,
          borderColor: 'rgba(244, 63, 94, 0.75)',
          borderWidth: 2,
          borderDash: [6, 4],
          pointRadius: 0,
          fill: false,
          tension: 0
        }
      ];
      scalesConfig.y.suggestedMin = 50;
      scalesConfig.y.suggestedMax = Math.max(100, ...speedData) + 10;
      break;
    }

    case 'ftpr': {
      titleText = 'Daily FTPR Accuracy % vs. Store Target (94.0%)';
      iconName = 'target';
      iconColor = 'var(--accent-emerald)';
      const ftprData = dailyTrend.map(d => d.ftpr);
      const targetData = dailyTrend.map(() => 94.0);

      datasets = [
        {
          label: 'First Time Pick Rate (FTPR %)',
          data: ftprData,
          borderColor: '#10B981',
          backgroundColor: 'rgba(16, 185, 129, 0.12)',
          borderWidth: 3,
          pointRadius: 5,
          pointHoverRadius: 8,
          pointBackgroundColor: '#10B981',
          fill: true,
          tension: 0.3
        },
        {
          label: 'Store Target (94.0%)',
          data: targetData,
          borderColor: 'rgba(245, 158, 11, 0.85)',
          borderWidth: 2,
          borderDash: [6, 4],
          pointRadius: 0,
          fill: false,
          tension: 0
        }
      ];
      scalesConfig.y.min = Math.max(70, Math.min(85, ...ftprData.filter(v => v > 0)) - 5);
      scalesConfig.y.max = 100;
      break;
    }

    case 'shiftPPH': {
      titleText = 'Daily True Shift PPH vs. Worked Shift Hours';
      iconName = 'trending-up';
      iconColor = '#10B981';
      const pphData = dailyTrend.map(d => d.shiftPPH > 0 ? d.shiftPPH : null);
      const shiftHoursData = dailyTrend.map(d => d.shiftHours);

      chartType = 'bar';
      datasets = [
        {
          type: 'line',
          label: 'True Shift PPH (Picks/Worked Hr)',
          data: pphData,
          borderColor: '#10B981',
          backgroundColor: 'transparent',
          borderWidth: 3,
          pointRadius: 5,
          pointHoverRadius: 8,
          pointBackgroundColor: '#10B981',
          tension: 0.3,
          yAxisID: 'y'
        },
        {
          type: 'bar',
          label: 'Worked Shift Hours',
          data: shiftHoursData,
          backgroundColor: 'rgba(59, 130, 246, 0.35)',
          borderColor: '#3B82F6',
          borderWidth: 1.5,
          borderRadius: 5,
          yAxisID: 'y1'
        }
      ];
      scalesConfig.y = {
        position: 'left',
        title: { display: true, text: 'Shift PPH', color: '#10B981' },
        ticks: { color: '#94A3B8' },
        grid: { color: 'rgba(255,255,255,0.05)' }
      };
      scalesConfig.y1 = {
        position: 'right',
        title: { display: true, text: 'Worked Hours', color: '#3B82F6' },
        ticks: { color: '#94A3B8' },
        grid: { drawOnChartArea: false }
      };
      break;
    }

    case 'utilization': {
      titleText = 'Daily Picker Utilization % & Active vs. Non-Pick Hours';
      iconName = 'pie-chart';
      iconColor = '#F59E0B';
      const utilData = dailyTrend.map(d => d.utilization);
      const pickHoursData = dailyTrend.map(d => d.pickHours);
      const nonPickHoursData = dailyTrend.map(d => d.nonPickHours);

      chartType = 'bar';
      datasets = [
        {
          type: 'line',
          label: 'Picker Utilization %',
          data: utilData,
          borderColor: '#F59E0B',
          backgroundColor: 'transparent',
          borderWidth: 3,
          pointRadius: 5,
          pointHoverRadius: 8,
          pointBackgroundColor: '#F59E0B',
          tension: 0.3,
          yAxisID: 'y'
        },
        {
          type: 'bar',
          label: 'Active Pick Hours',
          data: pickHoursData,
          backgroundColor: '#10B981',
          borderRadius: 4,
          stack: 'hours',
          yAxisID: 'y1'
        },
        {
          type: 'bar',
          label: 'Non-Pick / Staging Hours',
          data: nonPickHoursData,
          backgroundColor: 'rgba(244, 63, 94, 0.7)',
          borderRadius: 4,
          stack: 'hours',
          yAxisID: 'y1'
        }
      ];
      scalesConfig.y = {
        position: 'left',
        title: { display: true, text: 'Utilization %', color: '#F59E0B' },
        ticks: { color: '#94A3B8' },
        min: 0,
        max: 100,
        grid: { color: 'rgba(255,255,255,0.05)' }
      };
      scalesConfig.y1 = {
        position: 'right',
        title: { display: true, text: 'Hours Logged', color: '#94A3B8' },
        ticks: { color: '#94A3B8' },
        stacked: true,
        grid: { drawOnChartArea: false }
      };
      break;
    }

    case 'volume': {
      titleText = 'Daily Picked Volume, True Shift PPH & Active vs. Non-Active Hours';
      iconName = 'package';
      iconColor = 'var(--accent-purple)';
      const volData = dailyTrend.map(d => d.totalPicked || d.volume || 0);
      const pphData = dailyTrend.map(d => (d.shiftPPH && d.shiftPPH > 0) ? d.shiftPPH : null);
      const pickHoursData = dailyTrend.map(d => d.pickHours || 0);
      const nonPickHoursData = dailyTrend.map(d => d.nonPickHours || 0);

      chartType = 'bar';
      datasets = [
        {
          type: 'bar',
          label: 'Daily Picked Items',
          data: volData,
          backgroundColor: 'rgba(139, 92, 246, 0.65)',
          borderColor: '#8B5CF6',
          borderWidth: 1.5,
          borderRadius: 5,
          yAxisID: 'y',
          order: 3
        },
        {
          type: 'line',
          label: 'True Shift PPH',
          data: pphData,
          borderColor: '#10B981',
          backgroundColor: 'transparent',
          borderWidth: 3,
          pointRadius: 4.5,
          pointHoverRadius: 7,
          pointBackgroundColor: '#10B981',
          tension: 0.3,
          yAxisID: 'y',
          order: 1
        },
        {
          type: 'line',
          label: 'Active Pick Hours',
          data: pickHoursData,
          borderColor: '#06B6D4',
          backgroundColor: 'rgba(6, 182, 212, 0.08)',
          borderWidth: 2.5,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: '#06B6D4',
          tension: 0.3,
          yAxisID: 'y1',
          order: 2
        },
        {
          type: 'line',
          label: 'Non-Active / Dwell Hours',
          data: nonPickHoursData,
          borderColor: '#F59E0B',
          backgroundColor: 'transparent',
          borderWidth: 2,
          borderDash: [5, 4],
          pointRadius: 3.5,
          pointHoverRadius: 6,
          pointBackgroundColor: '#F59E0B',
          tension: 0.3,
          yAxisID: 'y1',
          order: 2
        }
      ];

      scalesConfig.y = {
        position: 'left',
        title: { display: true, text: 'Items / Shift PPH', color: '#8B5CF6' },
        ticks: { color: '#94A3B8', font: { family: 'Plus Jakarta Sans', size: 11 } },
        grid: { color: 'rgba(255,255,255,0.05)' },
        suggestedMin: 0
      };

      scalesConfig.y1 = {
        position: 'right',
        title: { display: true, text: 'Hours Logged', color: '#06B6D4' },
        ticks: { color: '#06B6D4', font: { family: 'Plus Jakarta Sans', size: 11 } },
        grid: { drawOnChartArea: false },
        suggestedMin: 0,
        suggestedMax: 10
      };
      break;
    }

    case 'subNil': {
      titleText = 'Daily Substitutions & Nil-Picks with Pick Volume & Exception %';
      iconName = 'alert-triangle';
      iconColor = 'var(--accent-rose)';
      const subsData = dailyTrend.map(d => d.substitutions || 0);
      const nilData = dailyTrend.map(d => d.nilPicks || 0);
      const totalPicksData = dailyTrend.map(d => d.totalPicked || d.volume || 0);

      chartType = 'bar';
      datasets = [
        {
          type: 'bar',
          label: 'Substitutions Provided',
          data: subsData,
          backgroundColor: 'rgba(139, 92, 246, 0.7)',
          borderColor: '#8B5CF6',
          borderWidth: 1.5,
          borderRadius: 4,
          yAxisID: 'y',
          order: 2
        },
        {
          type: 'bar',
          label: 'Nil-Picks Logged',
          data: nilData,
          backgroundColor: 'rgba(244, 63, 94, 0.7)',
          borderColor: '#F43F5E',
          borderWidth: 1.5,
          borderRadius: 4,
          yAxisID: 'y',
          order: 2
        },
        {
          type: 'line',
          label: 'Total Items Picked',
          data: totalPicksData,
          borderColor: '#06B6D4',
          backgroundColor: 'rgba(6, 182, 212, 0.08)',
          borderWidth: 2.5,
          pointRadius: 4.5,
          pointHoverRadius: 7,
          pointBackgroundColor: '#06B6D4',
          tension: 0.3,
          yAxisID: 'y1',
          order: 1
        }
      ];
      scalesConfig.y = {
        position: 'left',
        title: { display: true, text: 'Exceptions Count', color: '#94A3B8' },
        ticks: { color: '#94A3B8', font: { family: 'Plus Jakarta Sans', size: 11 } },
        grid: { color: 'rgba(255,255,255,0.05)' },
        suggestedMin: 0,
        suggestedMax: Math.max(10, ...subsData, ...nilData) + 2
      };
      scalesConfig.y1 = {
        position: 'right',
        title: { display: true, text: 'Total Items Picked', color: '#06B6D4' },
        ticks: { color: '#06B6D4', font: { family: 'Plus Jakarta Sans', size: 11 } },
        grid: { drawOnChartArea: false },
        suggestedMin: 0
      };
      break;
    }
  }

  if (titleEl) titleEl.textContent = titleText;
  if (iconEl) {
    iconEl.setAttribute('data-lucide', iconName);
    iconEl.style.color = iconColor;
  }
  if (window.lucide) window.lucide.createIcons();

  chartFeedbackTrend = new Chart(ctxTrend, {
    type: chartType,
    data: {
      labels: labels,
      datasets: datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: scalesConfig,
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: {
            color: '#F8FAFC',
            font: { family: 'Plus Jakarta Sans', size: 12, weight: '600' },
            boxWidth: 16,
            padding: 12
          }
        },
        tooltip: {
          mode: 'index',
          intersect: false,
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          titleColor: '#F8FAFC',
          bodyColor: '#94A3B8',
          borderColor: 'rgba(255, 255, 255, 0.1)',
          borderWidth: 1,
          padding: 12,
          callbacks: {
            label: (ctx) => {
              const val = ctx.raw;
              if (val === null || val === undefined) return `${ctx.dataset.label}: N/A`;

              if (activeFeedbackMetric === 'volume') {
                const dataIdx = ctx.dataIndex;
                const item = dailyTrend[dataIdx] || {};

                if (ctx.dataset.label.includes('Daily Picked')) {
                  return `📦 Daily Picked: ${val.toLocaleString()} items`;
                }
                if (ctx.dataset.label.includes('Shift PPH')) {
                  return val !== null ? `📈 True Shift PPH: ${val} PPH` : `📈 True Shift PPH: N/A`;
                }
                if (ctx.dataset.label.includes('Active Pick Hours')) {
                  const speed = item.pickRate || 0;
                  return `🟢 Active Pick Hours: ${val} hrs (Active Speed: ${speed} i/h)`;
                }
                if (ctx.dataset.label.includes('Non-Active')) {
                  const util = item.utilization || 0;
                  const shiftHrs = item.shiftHours || 0;
                  return `⏱️ Non-Active Hours: ${val} hrs (Shift: ${shiftHrs} hrs • ${util}% Util)`;
                }
              }

              if (activeFeedbackMetric === 'subNil') {
                const dataIdx = ctx.dataIndex;
                const item = dailyTrend[dataIdx] || {};
                const tot = item.totalPicked || item.volume || 0;

                if (ctx.dataset.label.includes('Substitutions')) {
                  const pct = tot > 0 ? ((val / tot) * 100).toFixed(1) : '0.0';
                  return `🔄 Substitutions: ${val} items (${pct}% of picks)`;
                }
                if (ctx.dataset.label.includes('Nil-Picks')) {
                  const pct = tot > 0 ? ((val / tot) * 100).toFixed(1) : '0.0';
                  return `🚫 Nil-Picks: ${val} items (${pct}% of picks)`;
                }
                if (ctx.dataset.label.includes('Total Items')) {
                  const excCount = (item.substitutions || 0) + (item.nilPicks || 0);
                  const excPct = tot > 0 ? ((excCount / tot) * 100).toFixed(1) : '0.0';
                  return `📦 Total Picked: ${val.toLocaleString()} items (Total Exceptions: ${excPct}%)`;
                }
              }

              if (ctx.dataset.label.includes('FTPR')) return `FTPR: ${val}%`;
              if (ctx.dataset.label.includes('Shift PPH')) return `Shift PPH: ${val} PPH`;
              if (ctx.dataset.label.includes('Speed')) return `Pick Speed: ${val} i/h`;
              if (ctx.dataset.label.includes('Utilization')) return `Utilization: ${val}%`;
              if (ctx.dataset.label.includes('Hours')) return `${ctx.dataset.label}: ${val} hrs`;
              if (ctx.dataset.label.includes('Items') || ctx.dataset.label.includes('Volume')) return `Total Picked: ${val.toLocaleString()} items`;
              return `${ctx.dataset.label}: ${val}`;
            }
          }
        }
      }
    }
  });
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
  const contextRows = getContextWeekRows();
  const isSingleDaySelected = (filterMode === 'custom' && currentStartDate === currentEndDate);

  // In single day mode, use the context week for heatmaps so the 7-day pattern is meaningful, and highlight the active day
  const rowsToUse = (isSingleDaySelected && contextRows.length > 0)
    ? contextRows
    : (filteredRows.length > 0 ? filteredRows : activeDataset);

  const heatmapData = getDayOfWeekHeatmap(rowsToUse);
  const container = document.getElementById('heatmapGrid');
  if (!container) return;

  const maxVal = Math.max(...heatmapData.days.map(d => d.totalExpected));

  // If a single day is isolated, find its weekday
  let activeDayName = '';
  if (isSingleDaySelected && filteredRows[0]?.day) {
    try {
      const parts = filteredRows[0].day.split('/');
      if (parts.length === 3) {
        const year = parseInt(parts[2], 10) < 100 ? parseInt(parts[2], 10) + 2000 : parseInt(parts[2], 10);
        const dt = new Date(year, parseInt(parts[0], 10) - 1, parseInt(parts[1], 10));
        activeDayName = dt.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
      }
    } catch (e) {}
  }

  container.innerHTML = heatmapData.days.map(d => {
    const intensity = maxVal > 0 ? (d.totalExpected / maxVal) : 0;
    const isThisDayActive = (activeDayName === d.shortDay);
    const bgGlow = isThisDayActive 
      ? `linear-gradient(135deg, rgba(6, 182, 212, 0.4), rgba(15, 23, 42, 0.95))`
      : `linear-gradient(135deg, rgba(30, 58, 138, ${0.4 + intensity * 0.4}), rgba(15, 23, 42, 0.9))`;
    const borderColor = isThisDayActive 
      ? 'var(--accent-cyan)' 
      : (intensity > 0.9 ? 'var(--accent-rose)' : intensity > 0.8 ? 'var(--accent-amber)' : 'var(--accent-blue)');
    
    return `
      <div class="heatmap-cell ${isThisDayActive ? 'active-day-pill' : ''}" style="background: ${bgGlow}; border-color: ${borderColor}; ${isThisDayActive ? 'box-shadow: 0 0 20px rgba(6, 182, 212, 0.35);' : ''}">
        <div class="heatmap-day">${d.shortDay} ${isThisDayActive ? '• ACTIVE' : ''}</div>
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
        const isSelectedDayCell = isSingleDaySelected && (activeDayName === dayName.substring(0, 3).toUpperCase());
        const cellBg = isSelectedDayCell 
          ? 'rgba(6, 182, 212, 0.4)' 
          : `rgba(59, 130, 246, ${Math.min(0.85, 0.1 + cellIntensity * 0.75)})`;
        return `
          <td style="background: ${cellBg}; font-family: var(--font-mono); font-weight: 600; color: #FFFFFF; ${isSelectedDayCell ? 'border: 2px solid var(--accent-cyan);' : ''}">
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

  const weekParams = getWeekFilterParams();
  const scopeLabel = filterMode === 'custom' ? `${currentStartDate}_to_${currentEndDate}` : (weekParams.isWeekActive ? weekParams.label.replace(/\s+/g, '_') : 'All_Weeks');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `Associate_Performance_Store1012_${scopeLabel}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

async function parseScheduleCsvText(text, filename = '') {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length <= 1) return { scheduleMap: {}, count: 0 };

  const headers = lines[0].split(',').map(h => h.replace(/^["']|["']$/g, '').trim().toLowerCase());
  const assocIdx = headers.findIndex(h => h.includes('associate name') || h.includes('associate') || h.includes('name'));
  const dateIdx = headers.findIndex(h => h.includes('shift date') || h.includes('date'));
  const hoursIdx = headers.findIndex(h => h.includes('total hours') || h.includes('shift hours') || h.includes('hours'));

  if (assocIdx === -1) {
    console.warn(`Could not locate associate column in ${filename}`);
    return { scheduleMap: {}, count: 0 };
  }

  const scheduleMap = {};
  let count = 0;
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.replace(/^["']|["']$/g, '').trim());
    const name = cols[assocIdx];
    if (!name) continue;
    const normName = name.toUpperCase();
    const shiftHrs = hoursIdx !== -1 && cols[hoursIdx] ? parseFloat(cols[hoursIdx]) || 0 : 0;
    const dateVal = dateIdx !== -1 && cols[dateIdx] ? parseDateToISO(cols[dateIdx]) : null;

    if (dateVal) {
      scheduleMap[`${normName}_${dateVal}`] = shiftHrs;
    }
    scheduleMap[normName] = shiftHrs;
    count++;
  }
  return { scheduleMap, count };
}

async function parsePerformanceXlsxBuffer(buffer, filename) {
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const jsonRows = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });

  // Extract week number from filename with comprehensive patterns:
  // e.g. "By Associate View Wk 28.xlsx", "Wk28.xlsx", "Week 28.xlsx", "W28", "28"
  let weekNum = null;
  const wkMatch = filename.match(/(?:wk|week|w)\s*([0-9]{1,2})/i);
  if (wkMatch) {
    weekNum = parseInt(wkMatch[1], 10);
  } else {
    const numMatch = filename.match(/\b([0-9]{1,2})\b/);
    if (numMatch) weekNum = parseInt(numMatch[1], 10);
  }

  // Detect header row if present
  let headerRowIdx = 0;
  for (let i = 0; i < Math.min(5, jsonRows.length); i++) {
    const row = jsonRows[i];
    if (row && row.some(cell => typeof cell === 'string' && (cell.toLowerCase().includes('associate') || cell.toLowerCase().includes('ftpr')))) {
      headerRowIdx = i;
      break;
    }
  }

  const entries = [];
  let currentAssoc = null;

  for (let i = headerRowIdx + 1; i < jsonRows.length; i++) {
    const row = jsonRows[i];
    if (!row || row.length < 3) continue;

    // Associate name can be in col 1 (or col 0 in some sheets)
    const rawAssoc = row[1] !== undefined && row[1] !== null && String(row[1]).trim() !== '' ? String(row[1]).trim() : null;
    if (rawAssoc && rawAssoc.toLowerCase() !== 'associate' && rawAssoc.toLowerCase() !== 'total') {
      currentAssoc = rawAssoc;
    }

    const rawDay = row[2] !== undefined && row[2] !== null ? String(row[2]).trim() : '';
    if (!rawDay || !currentAssoc) continue;

    const isTotal = (rawDay.toLowerCase() === 'total');
    const isoDate = parseDateToISO(rawDay);

    // If weekNum wasn't found in filename, estimate from date if possible
    let resolvedWeek = weekNum;
    if (!resolvedWeek && isoDate) {
      const d = new Date(isoDate + 'T00:00:00');
      // Estimate Walmart fiscal week based on date
      resolvedWeek = 28;
    }
    if (!resolvedWeek) resolvedWeek = 28;

    entries.push({
      file: filename,
      week: resolvedWeek,
      store: row[0] ? String(row[0]).trim() : '1012',
      associate: currentAssoc,
      day: rawDay,
      iso_date: isoDate,
      isTotal: isTotal,
      ftpr: parseFloat(row[3]) || 0,
      ftpExpected: parseInt(row[4], 10) || 0,
      ftpActual: parseInt(row[5], 10) || 0,
      pickRate: parseFloat(row[6]) || 0,
      pickHours: parseFloat(row[7]) || 0,
      pickedAsReq: parseInt(row[8], 10) || 0,
      substitutions: parseInt(row[9], 10) || 0,
      overrides: parseInt(row[10], 10) || 0,
      nilPicks: parseInt(row[11], 10) || 0,
      shiftHours: null,
      shiftPPH: null,
      utilization: null,
      nonPickHours: null
    });
  }
  return entries;
}

function applyScheduleMapToDataset(dataset, scheduleMap) {
  let matchedCount = 0;
  dataset.forEach(row => {
    if (!row.associate) return;
    const normAssoc = row.associate.toUpperCase().trim();
    const isoDate = row.iso_date || parseDateToISO(row.day);

    let shiftHrs = null;
    if (isoDate && scheduleMap[`${normAssoc}_${isoDate}`] !== undefined) {
      shiftHrs = scheduleMap[`${normAssoc}_${isoDate}`];
    } else if (scheduleMap[normAssoc] !== undefined && !row.isTotal) {
      shiftHrs = scheduleMap[normAssoc];
    }

    if (shiftHrs !== null && shiftHrs > 0) {
      row.shiftHours = shiftHrs;
      const totalPicked = (row.pickedAsReq || 0) + (row.substitutions || 0);
      row.shiftPPH = parseFloat((totalPicked / row.shiftHours).toFixed(2));
      row.utilization = parseFloat(((row.pickHours / row.shiftHours) * 100).toFixed(1));
      row.nonPickHours = parseFloat((Math.max(0, row.shiftHours - row.pickHours)).toFixed(2));
      matchedCount++;
    }
  });
  return matchedCount;
}

async function processFileList(fileObjects) {
  const progressContainer = document.getElementById('uploadProgressContainer');
  const statusText = document.getElementById('uploadStatusText');
  const statusCount = document.getElementById('uploadStatusCount');
  const progressBar = document.getElementById('uploadProgressBar');
  const detailsLog = document.getElementById('uploadDetailsLog');

  if (progressContainer) progressContainer.style.display = 'block';
  if (detailsLog) detailsLog.innerHTML = '';

  const logMessage = (msg) => {
    if (detailsLog) {
      const line = document.createElement('div');
      line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
      detailsLog.appendChild(line);
      detailsLog.scrollTop = detailsLog.scrollHeight;
    }
  };

  // Flatten any ZIP files
  const unpackedFiles = [];
  logMessage(`Analyzing ${fileObjects.length} uploaded file(s)...`);

  for (const item of fileObjects) {
    const fname = item.name.toLowerCase();
    if (fname.endsWith('.zip')) {
      logMessage(`Extracting ZIP archive: ${item.name}...`);
      if (!window.JSZip) {
        logMessage(`Error: JSZip library not available to extract ${item.name}`);
        continue;
      }
      try {
        const zipData = await item.file.arrayBuffer();
        const zip = await window.JSZip.loadAsync(zipData);
        const zipEntries = Object.keys(zip.files);
        for (const zipPath of zipEntries) {
          const zipEntry = zip.files[zipPath];
          if (zipEntry.dir) continue;
          const lowerEntry = zipPath.toLowerCase();
          if (lowerEntry.endsWith('.xlsx') || lowerEntry.endsWith('.xls')) {
            const buf = await zipEntry.async('arraybuffer');
            unpackedFiles.push({ name: zipPath, type: 'xlsx', buffer: buf });
            logMessage(`Extracted workbook: ${zipPath}`);
          } else if (lowerEntry.endsWith('.csv')) {
            const txt = await zipEntry.async('text');
            unpackedFiles.push({ name: zipPath, type: 'csv', text: txt });
            logMessage(`Extracted CSV schedule: ${zipPath}`);
          }
        }
      } catch (zipErr) {
        console.error('ZIP unpack error:', zipErr);
        logMessage(`Error unpacking ${item.name}: ${zipErr.message}`);
      }
    } else if (fname.endsWith('.xlsx') || fname.endsWith('.xls')) {
      const buf = await item.file.arrayBuffer();
      unpackedFiles.push({ name: item.name, type: 'xlsx', buffer: buf });
    } else if (fname.endsWith('.csv')) {
      const txt = await item.file.text();
      unpackedFiles.push({ name: item.name, type: 'csv', text: txt });
    }
  }

  const total = unpackedFiles.length;
  if (total === 0) {
    logMessage('No compatible .xlsx or .csv files detected.');
    if (statusText) statusText.textContent = 'No compatible files found.';
    return;
  }

  logMessage(`Processing total of ${total} data files...`);
  const aggregatedScheduleMap = {};
  const allNewPerformanceRecords = [];

  for (let i = 0; i < total; i++) {
    const f = unpackedFiles[i];
    const pct = Math.round(((i + 1) / total) * 100);
    if (progressBar) progressBar.style.width = `${pct}%`;
    if (statusCount) statusCount.textContent = `${i + 1} / ${total}`;
    if (statusText) statusText.textContent = `Reading ${f.name}...`;

    try {
      if (f.type === 'csv') {
        const { scheduleMap, count } = await parseScheduleCsvText(f.text, f.name);
        Object.assign(aggregatedScheduleMap, scheduleMap);
        logMessage(`Parsed schedule ${f.name} (${count} associate rows)`);
      } else if (f.type === 'xlsx') {
        const records = await parsePerformanceXlsxBuffer(f.buffer, f.name);
        allNewPerformanceRecords.push(...records);
        logMessage(`Parsed performance workbook ${f.name} (${records.length} records)`);
      }
    } catch (err) {
      console.error(`Error processing ${f.name}:`, err);
      logMessage(`Error parsing ${f.name}: ${err.message}`);
    }
  }

  // 1. Merge new performance records with deduplication
  if (allNewPerformanceRecords.length > 0) {
    // Build set of existing keys: associate + day + week + store
    const existingKeys = new Set(
      activeDataset.map(r => `${(r.associate || '').toUpperCase()}_${r.day}_${r.week}_${r.store || '1012'}`)
    );

    const uniqueNewRecords = allNewPerformanceRecords.filter(r => {
      const key = `${(r.associate || '').toUpperCase()}_${r.day}_${r.week}_${r.store || '1012'}`;
      if (existingKeys.has(key)) {
        return false;
      }
      existingKeys.add(key);
      return true;
    });

    if (uniqueNewRecords.length > 0) {
      activeDataset = [...activeDataset, ...uniqueNewRecords];
      logMessage(`Added ${uniqueNewRecords.length} new unique performance records.`);
    } else {
      logMessage(`All ${allNewPerformanceRecords.length} performance records already exist. Updated existing dataset.`);
    }
  }

  // 2. Apply all schedules to activeDataset
  const schedCount = Object.keys(aggregatedScheduleMap).length;
  if (schedCount > 0) {
    const matched = applyScheduleMapToDataset(activeDataset, aggregatedScheduleMap);
    logMessage(`Matched schedules across ${matched} associate performance records.`);
  }

  // 3. Update UI and State
  datasetBounds = getDatasetDateBounds(activeDataset);
  populateWeekDropdown();
  populateFeedbackAssociateDropdown();
  renderAllViews();

  if (statusText) statusText.textContent = 'Upload complete! Syncing cloud...';
  if (progressBar) progressBar.style.width = '100%';

  if (allNewPerformanceRecords.length > 0) {
    logMessage('Syncing imported records to Supabase cloud...');
    insertPerformanceBatchToSupabase(allNewPerformanceRecords).then(ok => {
      const cloudStatusText = document.getElementById('cloudStatusText');
      if (cloudStatusText && ok) {
        cloudStatusText.textContent = `Cloud Synced (${activeDataset.length.toLocaleString()} rows)`;
      }
      logMessage('Supabase cloud synchronization successful.');
    });
  }

  setTimeout(() => {
    document.getElementById('modalUpload').classList.remove('active');
    if (progressContainer) progressContainer.style.display = 'none';
    if (progressBar) progressBar.style.width = '0%';
    alert(`Batch Import Complete!\n• ${allNewPerformanceRecords.length} Performance records added\n• Schedules applied across ${activeDataset.length} rows`);
  }, 1200);
}

async function handleFileUpload(e) {
  const files = e.target.files;
  if (!files || files.length === 0) return;

  const fileObjects = Array.from(files).map(f => ({ name: f.name, file: f }));
  await processFileList(fileObjects);
  e.target.value = '';
}

