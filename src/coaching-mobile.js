/**
 * Associate Performance 2.0 - Standalone Mobile 1-on-1 Coaching Studio Controller
 * Mobile-First floor coaching tool for Team Leads & Coaches
 */

import { 
  filterDataset, 
  getAssociateAggregates, 
  getDatasetDateBounds,
  generateCustomDataFeedback
} from './utils/dataProcessor.js';

import {
  fetchPerformanceFromSupabase,
  saveCoachingNoteToSupabase,
  fetchCoachingNoteFromSupabase
} from './config/supabaseClient.js';

// Application State
let activeDataset = [];
let datasetBounds = { minDate: '2026-05-23', maxDate: '2026-08-07', totalDays: 77 };
let allAssociates = [];
let currentQuadrantFilter = 'all';
let currentSearchQuery = '';

let selectedAssociate = '';
let selectedStartDate = null;
let selectedEndDate = null;
let selectedPreset = 'all';
let currentFeedbackData = null;

// Chart Instance
let chartMobileTrend = null;

document.addEventListener('DOMContentLoaded', async () => {
  setupUIEventListeners();
  await loadPerformanceData();
  initMobileApp();
});

/**
 * Load Performance Dataset from Supabase Cloud or Local Fallback
 */
async function loadPerformanceData() {
  const cloudStatusText = document.getElementById('mobileCloudStatusText');
  const cloudStatusBadge = document.getElementById('mobileCloudStatusBadge');

  try {
    if (cloudStatusText) cloudStatusText.textContent = 'Connecting...';
    const cloudData = await fetchPerformanceFromSupabase();
    if (cloudData && cloudData.length > 0) {
      activeDataset = cloudData;
      if (cloudStatusText) cloudStatusText.textContent = `Cloud Synced (${cloudData.length.toLocaleString()} rows)`;
      if (cloudStatusBadge) {
        cloudStatusBadge.classList.remove('status-local', 'status-error');
        cloudStatusBadge.classList.add('status-cloud');
      }
    } else {
      throw new Error('Supabase returned empty data, falling back');
    }
  } catch (err) {
    console.warn('Supabase load failed, loading local fallback:', err);
    try {
      const res = await fetch('./src/data/initialData.json');
      activeDataset = await res.json();
      if (cloudStatusText) cloudStatusText.textContent = `Local Cache (${activeDataset.length.toLocaleString()} rows)`;
      if (cloudStatusBadge) {
        cloudStatusBadge.classList.remove('status-cloud', 'status-error');
        cloudStatusBadge.classList.add('status-local');
      }
    } catch (localErr) {
      console.error('Failed to load local dataset:', localErr);
      if (cloudStatusText) cloudStatusText.textContent = 'Data Load Error';
      if (cloudStatusBadge) {
        cloudStatusBadge.classList.remove('status-cloud', 'status-local');
        cloudStatusBadge.classList.add('status-error');
      }
    }
  }
}

/**
 * Initialize Mobile App
 */
function initMobileApp() {
  datasetBounds = getDatasetDateBounds(activeDataset);
  
  // Extract unique active associates
  allAssociates = getAssociateAggregates(activeDataset.filter(r => !r.isTotal));
  allAssociates.sort((a, b) => a.name.localeCompare(b.name));

  // Initialize date bounds
  selectedStartDate = datasetBounds.minDate;
  selectedEndDate = datasetBounds.maxDate;

  const inputStart = document.getElementById('mStartDate');
  const inputEnd = document.getElementById('mEndDate');
  if (inputStart) {
    inputStart.min = datasetBounds.minDate;
    inputStart.max = datasetBounds.maxDate;
    inputStart.value = datasetBounds.minDate;
  }
  if (inputEnd) {
    inputEnd.min = datasetBounds.minDate;
    inputEnd.max = datasetBounds.maxDate;
    inputEnd.value = datasetBounds.maxDate;
  }

  // Populate Associate List & Select
  renderAssociateSelector();

  // Check URL parameters for pre-selected associate
  const urlParams = new URLSearchParams(window.location.search);
  const paramAssoc = urlParams.get('associate');
  if (paramAssoc) {
    const match = allAssociates.find(a => a.name.toLowerCase() === paramAssoc.toLowerCase());
    if (match) {
      selectAssociate(match.name);
    }
  }

  // Lucide Icons
  if (window.lucide) window.lucide.createIcons();
}

/**
 * Setup Event Listeners
 */
function setupUIEventListeners() {
  // Associate Select dropdown
  const selectEl = document.getElementById('mAssociateSelect');
  if (selectEl) {
    selectEl.addEventListener('change', (e) => {
      selectAssociate(e.target.value);
    });
  }

  // Associate Search Input
  const searchInput = document.getElementById('mAssociateSearch');
  const clearSearchBtn = document.getElementById('btnClearSearch');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      currentSearchQuery = e.target.value.trim().toLowerCase();
      if (clearSearchBtn) {
        clearSearchBtn.style.display = currentSearchQuery ? 'flex' : 'none';
      }
      renderAssociateSelector();
    });
  }
  if (clearSearchBtn) {
    clearSearchBtn.addEventListener('click', () => {
      if (searchInput) {
        searchInput.value = '';
        currentSearchQuery = '';
        clearSearchBtn.style.display = 'none';
        renderAssociateSelector();
        searchInput.focus();
      }
    });
  }

  // Quadrant Filter Pills
  document.querySelectorAll('.m-quad-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.m-quad-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      currentQuadrantFilter = pill.dataset.quad;
      renderAssociateSelector();
    });
  });

  // Preset Date Chips
  document.querySelectorAll('.m-preset-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.m-preset-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      selectedPreset = chip.dataset.preset;

      const customRow = document.getElementById('mCustomDateRow');
      if (selectedPreset === 'custom') {
        if (customRow) customRow.style.display = 'flex';
        return;
      } else {
        if (customRow) customRow.style.display = 'none';
      }

      const { startIso, endIso } = computePresetDates(selectedPreset);
      selectedStartDate = startIso;
      selectedEndDate = endIso;

      const inputStart = document.getElementById('mStartDate');
      const inputEnd = document.getElementById('mEndDate');
      if (inputStart) inputStart.value = startIso;
      if (inputEnd) inputEnd.value = endIso;

      renderMobileFeedback();
    });
  });

  // Custom Date inputs
  const inputStart = document.getElementById('mStartDate');
  const inputEnd = document.getElementById('mEndDate');
  if (inputStart) {
    inputStart.addEventListener('change', (e) => {
      selectedStartDate = e.target.value;
      renderMobileFeedback();
    });
  }
  if (inputEnd) {
    inputEnd.addEventListener('change', (e) => {
      selectedEndDate = e.target.value;
      renderMobileFeedback();
    });
  }

  // Accordion Section Headers
  document.querySelectorAll('.m-accordion-header').forEach(header => {
    header.addEventListener('click', () => {
      const item = header.closest('.m-accordion-item');
      if (item) {
        item.classList.toggle('open');
        if (window.lucide) window.lucide.createIcons();
      }
    });
  });

  // Copy Script Buttons
  const btnCopyScriptHeader = document.getElementById('btnCopyScriptHeader');
  const btnCopyScriptInline = document.getElementById('btnCopyScriptInline');
  const btnStickyCopyScript = document.getElementById('btnStickyCopyScript');

  if (btnCopyScriptHeader) btnCopyScriptHeader.addEventListener('click', handleCopyScript);
  if (btnCopyScriptInline) btnCopyScriptInline.addEventListener('click', handleCopyScript);
  if (btnStickyCopyScript) btnStickyCopyScript.addEventListener('click', handleCopyScript);

  // Save Notes Buttons
  const btnSaveNotes = document.getElementById('btnSaveManagerNotes');
  const btnStickySaveNotes = document.getElementById('btnStickySaveNotes');
  if (btnSaveNotes) btnSaveNotes.addEventListener('click', handleSaveNotes);
  if (btnStickySaveNotes) btnStickySaveNotes.addEventListener('click', handleSaveNotes);

  // Quick Note Tags
  document.querySelectorAll('.m-quick-tag').forEach(tag => {
    tag.addEventListener('click', () => {
      const textarea = document.getElementById('mManagerNotes');
      if (!textarea) return;
      const textToAppend = tag.dataset.text || tag.textContent.trim();
      if (textarea.value.trim().length > 0) {
        textarea.value += `\n• ${textToAppend}`;
      } else {
        textarea.value = `• ${textToAppend}`;
      }
      textarea.focus();
      showToast('Added note snippet', 'info');
    });
  });

  // Print Report Button
  const btnPrint = document.getElementById('btnPrintReport');
  if (btnPrint) {
    btnPrint.addEventListener('click', () => window.print());
  }

  // Theme Toggle (if needed)
  const btnToggleTheme = document.getElementById('btnToggleTheme');
  if (btnToggleTheme) {
    btnToggleTheme.addEventListener('click', () => {
      const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
      const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', nextTheme);
      localStorage.setItem('ap2_theme', nextTheme);
    });
  }

  // Load saved theme
  const savedTheme = localStorage.getItem('ap2_theme');
  if (savedTheme) {
    document.documentElement.setAttribute('data-theme', savedTheme);
  }
}

/**
 * Filter & Populate Associate Dropdown and Quick Selection
 */
function renderAssociateSelector() {
  const select = document.getElementById('mAssociateSelect');
  const countBadge = document.getElementById('mFilteredCountBadge');
  if (!select) return;

  // Filter associates
  const filtered = allAssociates.filter(a => {
    const matchesSearch = !currentSearchQuery || a.name.toLowerCase().includes(currentSearchQuery);
    const matchesQuad = currentQuadrantFilter === 'all' || 
      a.quadrant.id === currentQuadrantFilter ||
      a.quadrant.id.startsWith(currentQuadrantFilter) ||
      currentQuadrantFilter.startsWith(a.quadrant.id);
    return matchesSearch && matchesQuad;
  });

  if (countBadge) {
    countBadge.textContent = `${filtered.length} of ${allAssociates.length}`;
  }

  let html = '<option value="">👤 Choose an Associate to Coach...</option>';
  filtered.forEach(a => {
    const isSelected = a.name === selectedAssociate ? 'selected' : '';
    html += `<option value="${a.name}" ${isSelected}>${a.name} • ${a.quadrant.name} (${a.pickRate} i/h, ${a.ftprPct}%)</option>`;
  });

  select.innerHTML = html;
  if (selectedAssociate && filtered.some(a => a.name === selectedAssociate)) {
    select.value = selectedAssociate;
  }
}

/**
 * Select an Associate & Trigger Rendering
 */
function selectAssociate(name) {
  selectedAssociate = name;
  const select = document.getElementById('mAssociateSelect');
  if (select && select.value !== name) {
    select.value = name;
  }

  // Update URL without full refresh for easy link sharing / bookmarks
  if (name) {
    const newUrl = new URL(window.location);
    newUrl.searchParams.set('associate', name);
    window.history.replaceState({}, '', newUrl);
  }

  renderMobileFeedback();
}

/**
 * Calculate Date Windows for Presets
 */
function computePresetDates(preset) {
  const maxD = new Date(datasetBounds.maxDate + 'T00:00:00');
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

  return {
    startIso: startD.toISOString().split('T')[0],
    endIso: maxD.toISOString().split('T')[0]
  };
}

/**
 * Render Complete Mobile 1-on-1 Feedback Studio
 */
function renderMobileFeedback() {
  const emptyState = document.getElementById('mEmptyState');
  const content = document.getElementById('mFeedbackContent');
  const stickyBar = document.getElementById('mStickyActionBar');

  if (!selectedAssociate) {
    if (emptyState) emptyState.style.display = 'block';
    if (content) content.style.display = 'none';
    if (stickyBar) stickyBar.style.display = 'none';
    return;
  }

  currentFeedbackData = generateCustomDataFeedback({
    dataset: activeDataset,
    associateName: selectedAssociate,
    startDate: selectedStartDate,
    endDate: selectedEndDate
  });

  if (!currentFeedbackData || !currentFeedbackData.hasData) {
    if (emptyState) {
      emptyState.style.display = 'block';
      emptyState.innerHTML = `
        <div class="m-empty-icon" style="background: rgba(244, 63, 94, 0.15); color: var(--accent-rose);">
          <i data-lucide="alert-circle"></i>
        </div>
        <h3 style="font-size: 1.15rem; font-weight: 700; margin-bottom: 0.5rem;">No Records Found</h3>
        <p style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.5;">
          ${currentFeedbackData ? currentFeedbackData.message : 'No data available for the selected parameters.'}
        </p>
      `;
      if (window.lucide) window.lucide.createIcons();
    }
    if (content) content.style.display = 'none';
    if (stickyBar) stickyBar.style.display = 'none';
    return;
  }

  if (emptyState) emptyState.style.display = 'none';
  if (content) content.style.display = 'block';
  if (stickyBar) stickyBar.style.display = 'flex';

  const m = currentFeedbackData.metrics;
  const d = currentFeedbackData.deltas;

  // 1. Profile Banner
  const initials = selectedAssociate.split(' ').map(n => n[0]).join('').substring(0, 2);
  const avatarEl = document.getElementById('mAvatar');
  const nameEl = document.getElementById('mAssocName');
  const quadBadge = document.getElementById('mQuadBadge');
  const utilBadge = document.getElementById('mUtilBadge');
  const summaryEl = document.getElementById('mPeriodSummary');

  if (avatarEl) avatarEl.textContent = initials;
  if (nameEl) nameEl.textContent = selectedAssociate;

  if (quadBadge) {
    quadBadge.className = `badge ${m.quadrant.badgeClass}`;
    quadBadge.textContent = m.quadrant.name;
  }
  if (utilBadge) {
    utilBadge.className = `badge ${m.utilTier.badgeClass}`;
    utilBadge.textContent = m.utilTier.label;
  }

  const dateSpanStr = (selectedStartDate && selectedEndDate) 
    ? `${selectedStartDate} to ${selectedEndDate}` 
    : 'Full Season';
  if (summaryEl) {
    summaryEl.textContent = `${m.daysCount} active shifts logged (${dateSpanStr})`;
  }

  // 2. Mobile KPIs Grid
  document.getElementById('mPickRate').textContent = `${m.pickRate} i/h`;
  document.getElementById('mFTPR').textContent = `${m.ftprPct}%`;
  document.getElementById('mShiftPPH').textContent = m.shiftPPH > 0 ? `${m.shiftPPH} PPH` : '--';
  document.getElementById('mShiftHoursSub').textContent = m.shiftHours > 0 ? `${m.shiftHours.toFixed(1)} shift hrs` : 'No schedule data';
  document.getElementById('mUtilization').textContent = m.shiftHours > 0 ? `${m.utilization}%` : '--%';
  document.getElementById('mNonPickSub').textContent = m.shiftHours > 0 ? `${m.nonPickHours} non-pick hrs` : 'Active vs worked';
  document.getElementById('mTotalPicked').textContent = m.totalPicked.toLocaleString();
  document.getElementById('mShiftsCountSub').textContent = `${m.daysCount} shifts in range`;
  document.getElementById('mSubNil').textContent = `${m.substitutions.toLocaleString()} / ${m.nilPicks.toLocaleString()}`;
  document.getElementById('mSubNilPct').textContent = `${((m.substitutions / (m.ftpExpected || 1)) * 100).toFixed(1)}% Subs | ${((m.nilPicks / (m.ftpExpected || 1)) * 100).toFixed(1)}% Nil`;

  // Delta Badges
  renderMobileDeltaBadge('mDeltaSpeed', d.speedDelta, ' i/h');
  renderMobileDeltaBadge('mDeltaFTPR', d.ftprDelta, '%');
  renderMobileDeltaBadge('mDeltaPPH', d.pphDelta, ' PPH');
  renderMobileDeltaBadge('mDeltaUtil', d.utilDelta, '%');

  // 3. Mobile Performance Trend Chart
  renderMobileTrendChart();

  // 4. Wins & Strengths List
  const strengthsEl = document.getElementById('mStrengthsList');
  if (strengthsEl) {
    strengthsEl.innerHTML = currentFeedbackData.strengths.map(s => `
      <li class="m-coaching-item item-win">
        <div class="m-coaching-bullet win-bullet"><i data-lucide="check"></i></div>
        <div class="m-coaching-text">${s}</div>
      </li>
    `).join('');
  }

  // 5. Targeted Coaching Opportunities
  const coachingEl = document.getElementById('mCoachingList');
  if (coachingEl) {
    coachingEl.innerHTML = currentFeedbackData.coachingPoints.map(c => `
      <li class="m-coaching-item item-opp">
        <div class="m-coaching-bullet opp-bullet"><i data-lucide="target"></i></div>
        <div class="m-coaching-text">${c}</div>
      </li>
    `).join('');
  }

  // 6. 1-on-1 Script
  const scriptEl = document.getElementById('mScriptContent');
  if (scriptEl) {
    scriptEl.textContent = currentFeedbackData.feedbackScript;
  }

  // 7. SMART Goals
  const goalsGrid = document.getElementById('mGoalsGrid');
  if (goalsGrid) {
    goalsGrid.innerHTML = currentFeedbackData.smartGoals.map(g => `
      <div class="m-goal-card">
        <div class="m-goal-header">
          <span class="m-goal-title">${g.title}</span>
          <span class="m-goal-target-badge">${g.target}</span>
        </div>
        <div class="m-goal-subtext">Current: <strong>${g.current}</strong> &bull; Store Target: <strong>${g.benchmark}</strong></div>
      </div>
    `).join('');
  }

  // 8. Manager Notes (Local + Cloud async)
  loadManagerNotes();

  // 9. Daily Shift Log Cards
  renderMobileShiftCards();

  if (window.lucide) window.lucide.createIcons();
}

/**
 * Render Trend Line Chart for Mobile
 */
function renderMobileTrendChart() {
  const ctx = document.getElementById('mChartTrend');
  if (!ctx) return;

  if (chartMobileTrend) {
    chartMobileTrend.destroy();
  }

  const hasMultipleWeeks = currentFeedbackData.weeklyTrend && currentFeedbackData.weeklyTrend.length >= 2;
  const trendData = (hasMultipleWeeks ? currentFeedbackData.weeklyTrend : currentFeedbackData.dailyTrend) || [];

  const trendLabel = document.getElementById('mTrendPointsCount');
  if (trendLabel) {
    trendLabel.textContent = hasMultipleWeeks 
      ? `${trendData.length} Fiscal Weeks` 
      : `${trendData.length} Daily Shifts`;
  }

  const labels = trendData.map(t => t.label || t.week || t.date);
  const speedData = trendData.map(t => t.pickRate);
  const pphData = trendData.map(t => (t.shiftPPH && t.shiftPPH > 0) ? t.shiftPPH : null);
  const ftprData = trendData.map(t => t.ftpr);

  chartMobileTrend = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Active Speed',
          data: speedData,
          borderColor: '#3B82F6',
          backgroundColor: 'rgba(59, 130, 246, 0.12)',
          fill: true,
          borderWidth: 2.5,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: '#3B82F6',
          tension: 0.3
        },
        {
          label: 'FTPR %',
          data: ftprData,
          borderColor: '#8B5CF6',
          backgroundColor: 'rgba(139, 92, 246, 0.08)',
          fill: false,
          borderWidth: 2.5,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: '#8B5CF6',
          tension: 0.3
        },
        {
          label: 'Shift PPH',
          data: pphData,
          borderColor: '#10B981',
          borderDash: [4, 4],
          backgroundColor: 'transparent',
          borderWidth: 2,
          pointRadius: 3.5,
          pointHoverRadius: 6,
          pointBackgroundColor: '#10B981',
          tension: 0.3
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      scales: {
        x: { 
          ticks: { 
            color: '#94A3B8', 
            font: { family: 'Plus Jakarta Sans', size: 10 },
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 6
          }, 
          grid: { color: 'rgba(255,255,255,0.04)' } 
        },
        y: { 
          ticks: { color: '#94A3B8', font: { family: 'Plus Jakarta Sans', size: 10 } }, 
          grid: { color: 'rgba(255,255,255,0.04)' },
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
            font: { family: 'Plus Jakarta Sans', size: 11, weight: '600' },
            boxWidth: 14,
            boxHeight: 2,
            padding: 8
          }
        },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          titleColor: '#F8FAFC',
          bodyColor: '#94A3B8',
          borderColor: 'rgba(255, 255, 255, 0.1)',
          borderWidth: 1,
          padding: 8,
          callbacks: {
            label: (ctx) => {
              const val = ctx.raw;
              if (val === null || val === undefined) return `${ctx.dataset.label}: N/A`;
              if (ctx.dataset.label.includes('FTPR')) return `FTPR: ${val}%`;
              if (ctx.dataset.label.includes('PPH')) return `Shift PPH: ${val}`;
              return `Active Speed: ${val} i/h`;
            }
          }
        }
      }
    }
  });
}

/**
 * Load Notes from LocalStorage and Supabase Cloud
 */
function loadManagerNotes() {
  const notesTextarea = document.getElementById('mManagerNotes');
  if (!notesTextarea) return;

  const key = `ap2_notes_${selectedAssociate}_${selectedStartDate}_${selectedEndDate}`;
  const cachedNote = localStorage.getItem(key) || '';
  notesTextarea.value = cachedNote;

  // Cloud sync async
  fetchCoachingNoteFromSupabase({
    associateName: selectedAssociate,
    startDate: selectedStartDate,
    endDate: selectedEndDate
  }).then(cloudNote => {
    if (cloudNote !== null && cloudNote !== undefined && cloudNote !== cachedNote) {
      notesTextarea.value = cloudNote;
      localStorage.setItem(key, cloudNote);
    }
  });
}

/**
 * Handle Saving Manager Coaching Notes
 */
async function handleSaveNotes() {
  if (!selectedAssociate) return;
  const textarea = document.getElementById('mManagerNotes');
  if (!textarea) return;

  const noteText = textarea.value;
  const key = `ap2_notes_${selectedAssociate}_${selectedStartDate}_${selectedEndDate}`;
  localStorage.setItem(key, noteText);

  showToast('Saving to Supabase Cloud...', 'info');

  const isCloudSaved = await saveCoachingNoteToSupabase({
    associateName: selectedAssociate,
    startDate: selectedStartDate,
    endDate: selectedEndDate,
    notesText: noteText
  });

  if (isCloudSaved) {
    showToast('✓ Saved to Supabase Cloud & Local Cache', 'success');
  } else {
    showToast('✓ Saved to Local Cache', 'success');
  }
}

/**
 * Handle 1-Tap Copy Script
 */
async function handleCopyScript() {
  if (!currentFeedbackData || !currentFeedbackData.feedbackScript) {
    showToast('No coaching script to copy', 'error');
    return;
  }

  const script = currentFeedbackData.feedbackScript;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(script);
    } else {
      const tempArea = document.createElement('textarea');
      tempArea.value = script;
      tempArea.style.position = 'fixed';
      tempArea.style.left = '-9999px';
      document.body.appendChild(tempArea);
      tempArea.select();
      document.execCommand('copy');
      document.body.removeChild(tempArea);
    }
    showToast('✓ 1-on-1 Script Copied to Clipboard!', 'success');
  } catch (err) {
    console.error('Clipboard copy error:', err);
    showToast('Failed to copy script to clipboard', 'error');
  }
}

/**
 * Render Delta Badges
 */
function renderMobileDeltaBadge(elId, val, unit = '') {
  const el = document.getElementById(elId);
  if (!el) return;

  if (val === null || val === undefined) {
    el.className = 'm-delta-badge delta-neutral';
    el.textContent = 'Prior: N/A';
    return;
  }

  const num = parseFloat(val);
  if (num > 0) {
    el.className = 'm-delta-badge delta-up';
    el.textContent = `+${val}${unit}`;
  } else if (num < 0) {
    el.className = 'm-delta-badge delta-down';
    el.textContent = `${val}${unit}`;
  } else {
    el.className = 'm-delta-badge delta-neutral';
    el.textContent = `0.0${unit}`;
  }
}

/**
 * Render Daily Shift Cards / List
 */
function renderMobileShiftCards() {
  const container = document.getElementById('mShiftCardsContainer');
  const countBadge = document.getElementById('mShiftsCountHeader');
  if (!container) return;

  const shifts = currentFeedbackData.dailyShifts || [];
  if (countBadge) countBadge.textContent = `${shifts.length} Shifts`;

  if (shifts.length === 0) {
    container.innerHTML = `<div style="text-align: center; color: var(--text-dim); padding: 1.5rem; font-size: 0.85rem;">No individual shift logs in this window.</div>`;
    return;
  }

  container.innerHTML = shifts.map(s => `
    <div class="m-shift-card">
      <div class="m-shift-card-top">
        <span class="m-shift-date">${s.date} (Wk ${s.week})</span>
        <span class="m-shift-items"><strong>${s.totalPicked}</strong> items</span>
      </div>
      <div class="m-shift-metrics-row">
        <div class="m-shift-metric">
          <span class="m-sm-label">Speed</span>
          <span class="m-sm-val" style="color: var(--accent-blue);">${s.pickRate}</span>
        </div>
        <div class="m-shift-metric">
          <span class="m-sm-label">FTPR</span>
          <span class="m-sm-val" style="color: ${parseFloat(s.ftpr) >= 94 ? 'var(--accent-emerald)' : 'var(--text-main)'};">${s.ftpr}</span>
        </div>
        <div class="m-shift-metric">
          <span class="m-sm-label">Shift PPH</span>
          <span class="m-sm-val" style="color: ${s.shiftPPH !== '--' ? 'var(--accent-emerald)' : 'var(--text-dim)'};">${s.shiftPPH}</span>
        </div>
        <div class="m-shift-metric">
          <span class="m-sm-label">Subs / Nil</span>
          <span class="m-sm-val" style="color: ${s.nilPicks > 0 ? 'var(--accent-rose)' : 'var(--text-muted)'};">${s.substitutions}/${s.nilPicks}</span>
        </div>
      </div>
    </div>
  `).join('');
}

/**
 * Toast Notification Banner
 */
let toastTimeout = null;
function showToast(message, type = 'info') {
  let toast = document.getElementById('mToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'mToast';
    toast.className = 'm-toast';
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.className = `m-toast m-toast-${type} show`;

  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.remove('show');
  }, 2800);
}
