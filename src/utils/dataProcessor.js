/**
 * Associate Performance 2.0 - Data Processing & Analytics Engine
 */

export function classifyQuadrant(pickRate, ftpr) {
  const isFast = pickRate >= 80.0;
  const isAccurate = ftpr >= 0.94;

  if (isFast && isAccurate) {
    return {
      id: 'pacesetter',
      name: 'Pacesetters',
      badgeClass: 'badge-pacesetter',
      cardClass: 'pacesetter',
      color: '#10B981',
      description: 'High Speed & High Accuracy'
    };
  } else if (isFast && !isAccurate) {
    return {
      id: 'speed-demon',
      name: 'Speed Demons',
      badgeClass: 'badge-speed-demon',
      cardClass: 'speed-demon',
      color: '#3B82F6',
      description: 'High Speed, Quality Coaching Needed'
    };
  } else if (!isFast && isAccurate) {
    return {
      id: 'quality-champion',
      name: 'Quality Champions',
      badgeClass: 'badge-quality-champion',
      cardClass: 'quality-champion',
      color: '#8B5CF6',
      description: 'High Accuracy, Pace Coaching Needed'
    };
  } else {
    return {
      id: 'opportunity',
      name: 'Opportunity Zone',
      badgeClass: 'badge-opportunity',
      cardClass: 'opportunity',
      color: '#F43F5E',
      description: 'Speed & Accuracy Training Required'
    };
  }
}

export function classifyUtilization(utilizationRate) {
  if (utilizationRate >= 70.0) {
    return {
      tier: 'primary',
      label: 'Primary Picker',
      badgeClass: 'badge-util-primary',
      color: '#10B981'
    };
  } else if (utilizationRate >= 40.0) {
    return {
      tier: 'hybrid',
      label: 'Multi-Role',
      badgeClass: 'badge-util-hybrid',
      color: '#F59E0B'
    };
  } else {
    return {
      tier: 'auxiliary',
      label: 'Auxiliary Support',
      badgeClass: 'badge-util-auxiliary',
      color: '#3B82F6'
    };
  }
}

/**
 * Parse various date formats (M/D/YY, MM/DD/YYYY, YYYY-MM-DD) into a standard 'YYYY-MM-DD' ISO string.
 */
export function parseDateToISO(dayStr) {
  if (!dayStr || typeof dayStr !== 'string') return null;
  const clean = dayStr.trim();
  if (!clean || clean.toLowerCase() === 'total') return null;

  // Format: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    return clean;
  }

  // Format: M/D/YY or MM/DD/YYYY
  const parts = clean.split('/');
  if (parts.length === 3) {
    const month = parseInt(parts[0], 10);
    const day = parseInt(parts[1], 10);
    let year = parseInt(parts[2], 10);
    if (year < 100) year += 2000;
    
    if (!isNaN(month) && !isNaN(day) && !isNaN(year)) {
      const mm = String(month).padStart(2, '0');
      const dd = String(day).padStart(2, '0');
      return `${year}-${mm}-${dd}`;
    }
  }

  // Fallback Date parser
  const parsed = new Date(clean);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  return null;
}

/**
 * Discovers the earliest and latest dates available in the dataset.
 */
export function getDatasetDateBounds(dataset) {
  let minIso = null;
  let maxIso = null;
  const datesSet = new Set();

  dataset.forEach(row => {
    if (row.isTotal || !row.day) return;
    const iso = parseDateToISO(row.day);
    if (iso) {
      datesSet.add(iso);
      if (!minIso || iso < minIso) minIso = iso;
      if (!maxIso || iso > maxIso) maxIso = iso;
    }
  });

  const sortedDates = Array.from(datesSet).sort();

  return {
    minDate: minIso || '2026-05-23',
    maxDate: maxIso || '2026-08-07',
    totalDays: sortedDates.length,
    allDates: sortedDates
  };
}

export function filterDataset(dataset, { week = 'all', startWeek = null, endWeek = null, startDate = null, endDate = null, search = '', quadrant = 'all', utilTier = 'all', scheduledOnly = true } = {}) {
  let filtered = dataset.filter(row => !row.isTotal);

  // Only enforce scheduled-only filter when schedule data has actually been imported.
  // Check if any row in the filtered scope has shiftHours populated — if none do, skip the filter
  // so the dashboard doesn't go blank when no schedule has been uploaded yet.
  if (scheduledOnly) {
    const hasScheduleData = filtered.some(row => row.shiftHours !== null && row.shiftHours !== undefined && row.shiftHours > 0);
    if (hasScheduleData) {
      filtered = filtered.filter(row => row.shiftHours !== null && row.shiftHours !== undefined && row.shiftHours > 0);
    }
  }

  // Filter by Week Range / Multi-Week
  if (startWeek !== null || endWeek !== null) {
    const sWk = (startWeek !== null && startWeek !== 'all' && startWeek !== '') ? parseInt(startWeek, 10) : -Infinity;
    const eWk = (endWeek !== null && endWeek !== 'all' && endWeek !== '') ? parseInt(endWeek, 10) : Infinity;
    filtered = filtered.filter(row => row.week >= sWk && row.week <= eWk);
  } else if (Array.isArray(week)) {
    const wkSet = new Set(week.map(w => parseInt(w, 10)));
    filtered = filtered.filter(row => wkSet.has(row.week));
  } else if (week !== 'all' && week !== '' && week !== undefined && week !== null) {
    const wkNum = parseInt(week, 10);
    if (!isNaN(wkNum)) {
      filtered = filtered.filter(row => row.week === wkNum);
    }
  }

  // Filter by Custom Date Range (Start Date & End Date)
  if (startDate || endDate) {
    filtered = filtered.filter(row => {
      if (!row.day) return false;
      const iso = parseDateToISO(row.day);
      if (!iso) return false;
      if (startDate && iso < startDate) return false;
      if (endDate && iso > endDate) return false;
      return true;
    });
  }

  // Filter by Search Query (Associate name or store)
  if (search && search.trim()) {
    const q = search.toLowerCase().trim();
    filtered = filtered.filter(row => 
      (row.associate && row.associate.toLowerCase().includes(q)) ||
      (row.store && row.store.toString().includes(q))
    );
  }

  // Filter by Quadrant
  if (quadrant && quadrant !== 'all') {
    filtered = filtered.filter(row => {
      const ftpr = row.ftpExpected > 0 ? (row.ftpActual / row.ftpExpected) : (row.ftpr || 0);
      const pickRate = row.pickHours > 0 ? (row.ftpExpected / row.pickHours) : (row.pickRate || 0);
      const q = classifyQuadrant(pickRate, ftpr);
      return q.id === quadrant;
    });
  }

  // Filter by Utilization Tier
  if (utilTier && utilTier !== 'all') {
    filtered = filtered.filter(row => {
      const util = row.shiftHours > 0 ? ((row.pickHours / row.shiftHours) * 100) : 0;
      const u = classifyUtilization(util);
      return u.tier === utilTier;
    });
  }

  return filtered;
}

export function getAvailableWeeks(dataset) {
  const weeks = new Set();
  dataset.forEach(row => {
    if (row.week) weeks.add(row.week);
  });
  return Array.from(weeks).sort((a, b) => a - b);
}

export function getStoreKPIs(rows) {
  if (!rows || rows.length === 0) {
    return {
      totalExpected: 0,
      totalActual: 0,
      ftpr: 0,
      pickHours: 0,
      pickRate: 0,
      totalPickedReq: 0,
      substitutions: 0,
      nilPicks: 0,
      activePickers: 0,
      shiftHours: 0,
      shiftPPH: 0,
      utilization: 0,
      nonPickHours: 0
    };
  }

  let totalExp = 0;
  let totalAct = 0;
  let totalHours = 0;
  let totalReq = 0;
  let totalSub = 0;
  let totalNil = 0;
  let totalShiftHours = 0;
  let hasScheduleData = false;

  const associates = new Set();

  rows.forEach(r => {
    totalExp += r.ftpExpected || 0;
    totalAct += r.ftpActual || 0;
    totalHours += r.pickHours || 0;
    totalReq += r.pickedAsReq || 0;
    totalSub += r.substitutions || 0;
    totalNil += r.nilPicks || 0;
    if (r.shiftHours) {
      totalShiftHours += r.shiftHours;
      hasScheduleData = true;
    }
    if (r.associate) associates.add(r.associate);
  });

  const ftpr = totalExp > 0 ? totalAct / totalExp : 0;
  const pickRate = totalHours > 0 ? totalExp / totalHours : 0;
  
  const totalPicked = totalReq + totalSub;
  const shiftPPH = totalShiftHours > 0 ? totalPicked / totalShiftHours : 0;
  const utilization = totalShiftHours > 0 ? (totalHours / totalShiftHours) * 100 : 0;
  const nonPickHours = Math.max(0, totalShiftHours - totalHours);

  return {
    totalExpected: totalExp,
    totalActual: totalAct,
    ftpr: ftpr,
    ftprPct: (ftpr * 100).toFixed(2),
    pickHours: totalHours,
    pickRate: pickRate.toFixed(2),
    totalPickedReq: totalReq,
    substitutions: totalSub,
    subPct: totalExp > 0 ? ((totalSub / totalExp) * 100).toFixed(2) : '0.00',
    nilPicks: totalNil,
    nilPct: totalExp > 0 ? ((totalNil / totalExp) * 100).toFixed(2) : '0.00',
    activePickers: associates.size,
    hasScheduleData: hasScheduleData,
    shiftHours: totalShiftHours,
    shiftPPH: shiftPPH.toFixed(2),
    utilization: utilization.toFixed(1),
    nonPickHours: nonPickHours.toFixed(1)
  };
}

export function getDailyTrends(dataset) {
  const dayMap = {};

  dataset.forEach(row => {
    if (row.isTotal || !row.day) return;
    const iso = row.iso_date || parseDateToISO(row.day);
    if (!iso) return;

    if (!dayMap[iso]) {
      // Determine day name (e.g., Sat, Sun, Mon)
      let dayName = '';
      try {
        const dt = new Date(iso + 'T00:00:00');
        dayName = dt.toLocaleDateString('en-US', { weekday: 'short' });
      } catch (e) {}

      dayMap[iso] = {
        isoDate: iso,
        dateStr: row.day,
        dayName: dayName,
        label: dayName ? `${dayName} (${row.day})` : row.day,
        exp: 0,
        act: 0,
        hours: 0,
        sub: 0,
        nil: 0,
        req: 0,
        shiftHours: 0,
        associates: new Set()
      };
    }

    dayMap[iso].exp += row.ftpExpected || 0;
    dayMap[iso].act += row.ftpActual || 0;
    dayMap[iso].hours += row.pickHours || 0;
    dayMap[iso].sub += row.substitutions || 0;
    dayMap[iso].nil += row.nilPicks || 0;
    dayMap[iso].req += row.pickedAsReq || 0;
    if (row.shiftHours) dayMap[iso].shiftHours += row.shiftHours;
    if (row.associate) dayMap[iso].associates.add(row.associate);
  });

  const sortedDates = Object.keys(dayMap).sort();

  return sortedDates.map(iso => {
    const d = dayMap[iso];
    const ftpr = d.exp > 0 ? (d.act / d.exp) * 100 : 0;
    const pickRate = d.hours > 0 ? d.exp / d.hours : 0;
    const totalPicked = d.req + d.sub;
    const shiftPPH = d.shiftHours > 0 ? totalPicked / d.shiftHours : 0;
    const utilization = d.shiftHours > 0 ? (d.hours / d.shiftHours) * 100 : 0;

    return {
      isoDate: d.isoDate,
      dateStr: d.dateStr,
      dayName: d.dayName,
      label: d.label,
      expected: d.exp,
      actual: d.act,
      ftpr: parseFloat(ftpr.toFixed(2)),
      hours: parseFloat(d.hours.toFixed(1)),
      pickRate: parseFloat(pickRate.toFixed(2)),
      shiftPPH: parseFloat(shiftPPH.toFixed(2)),
      shiftHours: parseFloat(d.shiftHours.toFixed(1)),
      utilization: parseFloat(utilization.toFixed(1)),
      substitutions: d.sub,
      nilPicks: d.nil,
      pickers: d.associates.size
    };
  });
}

export function getWeeklyTrends(dataset) {
  const weeksMap = {};

  dataset.forEach(row => {
    if (row.isTotal) return;
    const wk = row.week;
    if (!weeksMap[wk]) {
      weeksMap[wk] = {
        week: wk,
        exp: 0,
        act: 0,
        hours: 0,
        sub: 0,
        nil: 0,
        req: 0,
        shiftHours: 0,
        associates: new Set()
      };
    }
    weeksMap[wk].exp += row.ftpExpected || 0;
    weeksMap[wk].act += row.ftpActual || 0;
    weeksMap[wk].hours += row.pickHours || 0;
    weeksMap[wk].sub += row.substitutions || 0;
    weeksMap[wk].nil += row.nilPicks || 0;
    weeksMap[wk].req += row.pickedAsReq || 0;
    if (row.shiftHours) weeksMap[wk].shiftHours += row.shiftHours;
    if (row.associate) weeksMap[wk].associates.add(row.associate);
  });

  const sortedWks = Object.keys(weeksMap).map(Number).sort((a, b) => a - b);

  return sortedWks.map(wk => {
    const d = weeksMap[wk];
    const ftpr = d.exp > 0 ? (d.act / d.exp) * 100 : 0;
    const pickRate = d.hours > 0 ? d.exp / d.hours : 0;
    const totalPicked = d.req + d.sub;
    const shiftPPH = d.shiftHours > 0 ? totalPicked / d.shiftHours : 0;
    const utilization = d.shiftHours > 0 ? (d.hours / d.shiftHours) * 100 : 0;

    return {
      week: `Wk ${wk}`,
      weekNum: wk,
      expected: d.exp,
      actual: d.act,
      ftpr: parseFloat(ftpr.toFixed(2)),
      hours: parseFloat(d.hours.toFixed(1)),
      pickRate: parseFloat(pickRate.toFixed(2)),
      shiftPPH: parseFloat(shiftPPH.toFixed(2)),
      shiftHours: parseFloat(d.shiftHours.toFixed(1)),
      utilization: parseFloat(utilization.toFixed(1)),
      substitutions: d.sub,
      nilPicks: d.nil,
      pickers: d.associates.size
    };
  });
}

export function getAssociateAggregates(rows) {
  const assocMap = {};

  rows.forEach(r => {
    if (!r.associate) return;
    const name = r.associate;
    if (!assocMap[name]) {
      assocMap[name] = {
        name: name,
        ftpExpected: 0,
        ftpActual: 0,
        pickHours: 0,
        pickedAsReq: 0,
        substitutions: 0,
        nilPicks: 0,
        shiftHours: 0,
        daysCount: 0,
        weeksSet: new Set()
      };
    }
    assocMap[name].ftpExpected += r.ftpExpected || 0;
    assocMap[name].ftpActual += r.ftpActual || 0;
    assocMap[name].pickHours += r.pickHours || 0;
    assocMap[name].pickedAsReq += r.pickedAsReq || 0;
    assocMap[name].substitutions += r.substitutions || 0;
    assocMap[name].nilPicks += r.nilPicks || 0;
    if (r.shiftHours) assocMap[name].shiftHours += r.shiftHours;
    assocMap[name].daysCount += 1;
    if (r.week) assocMap[name].weeksSet.add(r.week);
  });

  return Object.values(assocMap).map(a => {
    const ftpr = a.ftpExpected > 0 ? a.ftpActual / a.ftpExpected : 0;
    const pickRate = a.pickHours > 0 ? a.ftpExpected / a.pickHours : 0;
    const quad = classifyQuadrant(pickRate, ftpr);

    const totalPicked = a.pickedAsReq + a.substitutions;
    const shiftPPH = a.shiftHours > 0 ? totalPicked / a.shiftHours : 0;
    const utilization = a.shiftHours > 0 ? (a.pickHours / a.shiftHours) * 100 : 0;
    const nonPickHours = Math.max(0, a.shiftHours - a.pickHours);
    const utilTier = classifyUtilization(utilization);

    return {
      ...a,
      totalPicked: totalPicked,
      ftpr: ftpr,
      ftprPct: (ftpr * 100).toFixed(2),
      pickRate: parseFloat(pickRate.toFixed(2)),
      shiftPPH: parseFloat(shiftPPH.toFixed(2)),
      utilization: parseFloat(utilization.toFixed(1)),
      nonPickHours: parseFloat(nonPickHours.toFixed(1)),
      utilTier: utilTier,
      weeksActive: a.weeksSet.size,
      quadrant: quad
    };
  });
}

export function getDayOfWeekHeatmap(dataset) {
  const dayOrder = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const dayStats = {};
  dayOrder.forEach(d => {
    dayStats[d] = { exp: 0, hours: 0, count: 0, shiftHours: 0 };
  });

  const availableWeeks = getAvailableWeeks(dataset);
  const matrix = {};
  availableWeeks.forEach(w => {
    matrix[w] = {};
    dayOrder.forEach(d => {
      matrix[w][d] = { exp: 0, hours: 0, shiftHours: 0 };
    });
  });

  dataset.forEach(row => {
    if (row.isTotal || !row.day) return;
    try {
      const parts = row.day.split('/');
      if (parts.length === 3) {
        const year = parseInt(parts[2], 10) < 100 ? parseInt(parts[2], 10) + 2000 : parseInt(parts[2], 10);
        const dt = new Date(year, parseInt(parts[0], 10) - 1, parseInt(parts[1], 10));
        const dayName = dt.toLocaleDateString('en-US', { weekday: 'long' });
        if (dayStats[dayName]) {
          dayStats[dayName].exp += row.ftpExpected || 0;
          dayStats[dayName].hours += row.pickHours || 0;
          if (row.shiftHours) dayStats[dayName].shiftHours += row.shiftHours;
          dayStats[dayName].count += 1;

          if (matrix[row.week] && matrix[row.week][dayName]) {
            matrix[row.week][dayName].exp += row.ftpExpected || 0;
            matrix[row.week][dayName].hours += row.pickHours || 0;
            if (row.shiftHours) matrix[row.week][dayName].shiftHours += row.shiftHours;
          }
        }
      }
    } catch (e) {}
  });

  const daysSummary = dayOrder.map(d => {
    const st = dayStats[d];
    const avgPickRate = st.hours > 0 ? st.exp / st.hours : 0;
    const avgShiftPPH = st.shiftHours > 0 ? st.exp / st.shiftHours : 0;
    return {
      day: d,
      shortDay: d.substring(0, 3).toUpperCase(),
      totalExpected: st.exp,
      totalHours: parseFloat(st.hours.toFixed(1)),
      avgPickRate: parseFloat(avgPickRate.toFixed(1)),
      avgShiftPPH: parseFloat(avgShiftPPH.toFixed(1))
    };
  });

  return {
    days: daysSummary,
    matrix: matrix,
    weeks: availableWeeks
  };
}

export function getPickSpeedDistribution(associates, useShiftPPH = false) {
  const buckets = {
    '< 50 i/h': 0,
    '50 – 69 i/h': 0,
    '70 – 89 i/h': 0,
    '90 – 109 i/h': 0,
    '110+ i/h': 0
  };

  associates.forEach(a => {
    const pr = useShiftPPH ? a.shiftPPH : a.pickRate;
    if (pr < 50) buckets['< 50 i/h']++;
    else if (pr < 70) buckets['50 – 69 i/h']++;
    else if (pr < 90) buckets['70 – 89 i/h']++;
    else if (pr < 110) buckets['90 – 109 i/h']++;
    else buckets['110+ i/h']++;
  });

  return buckets;
}

export function getFTPRDistribution(associates) {
  const buckets = {
    '< 90%': 0,
    '90% – 92.9%': 0,
    '93% – 94.9%': 0,
    '95% – 96.9%': 0,
    '97%+': 0
  };

  associates.forEach(a => {
    const ftpr = parseFloat(a.ftprPct);
    if (ftpr < 90) buckets['< 90%']++;
    else if (ftpr < 93) buckets['90% – 92.9%']++;
    else if (ftpr < 95) buckets['93% – 94.9%']++;
    else if (ftpr < 97) buckets['95% – 96.9%']++;
    else buckets['97%+']++;
  });

  return buckets;
}

export function parsePDFScheduleText(pdfText) {
  /**
   * Client-side parser for PDF schedule text lines.
   * Extracts name and shift window (e.g. 5:00 AM - 2:00 PM).
   */
  const scheduleMap = {};
  const t_regex = /(\d{1,2}(?::\d{2})?\s*(?:am|pm))\s*-\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm))/gi;
  const lines = pdfText.split('\n');

  lines.forEach(line => {
    const match = t_regex.exec(line);
    if (match) {
      let namePart = line.split(match[1])[0].trim();
      namePart = namePart.replace(/\(M\)/gi, '').replace(/[^a-zA-Z\s]/g, '').trim();

      if (namePart.length > 2) {
        const normName = namePart.toUpperCase();

        // Calculate shift length in hours
        const parseTimeStr = (tStr) => {
          const clean = tStr.trim().toLowerCase();
          const isPm = clean.includes('pm');
          const parts = clean.replace(/(am|pm)/g, '').trim().split(':');
          let hours = parseInt(parts[0], 10);
          const mins = parts[1] ? parseInt(parts[1], 10) : 0;
          if (isPm && hours < 12) hours += 12;
          if (!isPm && hours === 12) hours = 0;
          return hours + (mins / 60.0);
        };

        const st = parseTimeStr(match[1]);
        const en = parseTimeStr(match[2]);
        let rawDur = en < st ? (en + 24 - st) : (en - st);
        let netHours = rawDur >= 6.0 ? (rawDur - 1.0) : (rawDur > 5.0 ? rawDur - 0.5 : rawDur);
        netHours = Math.max(0.5, netHours);

        scheduleMap[normName] = {
          shiftStr: `${match[1]} - ${match[2]}`,
          rawDuration: parseFloat(rawDur.toFixed(2)),
          shiftHours: parseFloat(netHours.toFixed(2))
        };
      }
    }
  });

  return scheduleMap;
}

export function getAssociate360(dataset, name, { startDate = null, endDate = null } = {}) {
  let assocRows = dataset.filter(r => !r.isTotal && r.associate === name);
  if (assocRows.length === 0) return null;

  if (startDate || endDate) {
    assocRows = assocRows.filter(r => {
      if (!r.day) return false;
      const iso = parseDateToISO(r.day);
      if (!iso) return false;
      if (startDate && iso < startDate) return false;
      if (endDate && iso > endDate) return false;
      return true;
    });
    if (assocRows.length === 0) return null;
  }

  const agg = getAssociateAggregates(assocRows)[0];

  const weekMap = {};
  assocRows.forEach(r => {
    const wk = r.week;
    if (!weekMap[wk]) {
      weekMap[wk] = { week: `Wk ${wk}`, exp: 0, act: 0, hours: 0, req: 0, sub: 0, shiftHours: 0 };
    }
    weekMap[wk].exp += r.ftpExpected || 0;
    weekMap[wk].act += r.ftpActual || 0;
    weekMap[wk].hours += r.pickHours || 0;
    weekMap[wk].req += r.pickedAsReq || 0;
    weekMap[wk].sub += r.substitutions || 0;
    if (r.shiftHours) weekMap[wk].shiftHours += r.shiftHours;
  });

  const weeklyTrend = Object.keys(weekMap).map(Number).sort((a, b) => a - b).map(wk => {
    const d = weekMap[wk];
    const ftpr = d.exp > 0 ? (d.act / d.exp) * 100 : 0;
    const rate = d.hours > 0 ? d.exp / d.hours : 0;
    const totalPicked = d.req + d.sub;
    const shiftPPH = d.shiftHours > 0 ? totalPicked / d.shiftHours : 0;
    const utilization = d.shiftHours > 0 ? (d.hours / d.shiftHours) * 100 : 0;

    return {
      week: d.week,
      ftpr: parseFloat(ftpr.toFixed(2)),
      pickRate: parseFloat(rate.toFixed(1)),
      shiftPPH: parseFloat(shiftPPH.toFixed(1)),
      utilization: parseFloat(utilization.toFixed(1)),
      volume: d.exp
    };
  });

  const coaching = [];
  const strengths = [];

  if (agg.pickRate >= 100) {
    strengths.push('⚡ Exceptional active picking speed (100+ items/hr)');
  } else if (agg.pickRate >= 80) {
    strengths.push('🚀 Strong active picking pace (meets store benchmark of 80 i/h)');
  } else {
    coaching.push('⏱️ Focus on path optimization to increase active pick speed above 80 items/hr');
  }

  if (agg.shiftHours > 0) {
    if (agg.utilization >= 70) {
      strengths.push(`🎯 High picker utilization (${agg.utilization}% of shift spent actively picking)`);
    } else if (agg.utilization < 50) {
      coaching.push(`📊 Low picking utilization (${agg.utilization}%). Check time spent staging/dispensing or idle between walks.`);
    }
  }

  if (agg.ftpr >= 0.95) {
    strengths.push('🎯 Elite first-time accuracy (95%+ FTPR)');
  } else if (agg.ftpr >= 0.93) {
    strengths.push('✅ Solid first-time pick accuracy');
  } else {
    coaching.push('🔍 Verify shelf locations and check top-stock before subbing or nil-picking');
  }

  if (agg.nilPicks > agg.substitutions * 0.8) {
    coaching.push('⚠️ High Nil-Pick ratio. Encourage offering valid substitutions when shelf is empty.');
  }

  const dailyShifts = assocRows.map(r => {
    const totalPicked = (r.pickedAsReq || 0) + (r.substitutions || 0);
    const shiftPPH = r.shiftHours > 0 ? (totalPicked / r.shiftHours) : 0;
    const util = r.shiftHours > 0 ? ((r.pickHours / r.shiftHours) * 100) : 0;
    const nonPick = Math.max(0, (r.shiftHours || 0) - (r.pickHours || 0));

    return {
      date: r.day,
      week: r.week,
      shiftHours: r.shiftHours ? r.shiftHours.toFixed(1) : '--',
      pickHours: r.pickHours ? r.pickHours.toFixed(1) : '--',
      pickRate: r.pickRate ? r.pickRate.toFixed(1) : '--',
      shiftPPH: shiftPPH > 0 ? shiftPPH.toFixed(1) : '--',
      utilization: r.shiftHours > 0 ? `${util.toFixed(1)}%` : '--%',
      nonPickHours: r.shiftHours > 0 ? nonPick.toFixed(1) : '--',
      ftpr: (r.ftpr * 100).toFixed(1) + '%',
      totalPicked: totalPicked.toLocaleString()
    };
  });

  return {
    ...agg,
    dailyLogs: assocRows,
    dailyShifts: dailyShifts,
    weeklyTrend: weeklyTrend,
    strengths: strengths,
    coaching: coaching
  };
}

/**
 * Generates custom, comprehensive data-driven feedback and performance evaluation
 * for any associate over a custom date range window.
 */
export function generateCustomDataFeedback({ dataset, associateName, startDate, endDate }) {
  if (!dataset || dataset.length === 0 || !associateName) return null;

  // 1. Current Period Data for Selected Associate
  const currentPeriodRows = filterDataset(dataset, {
    startDate: startDate || null,
    endDate: endDate || null
  }).filter(r => r.associate === associateName);

  if (currentPeriodRows.length === 0) {
    return {
      hasData: false,
      associate: associateName,
      startDate,
      endDate,
      message: `No fulfillment records found for ${associateName} between ${startDate || 'earliest'} and ${endDate || 'latest'}.`
    };
  }

  // 2. Compute Associate Period Metrics
  const currentAgg = getAssociateAggregates(currentPeriodRows)[0];

  // 3. Store Baseline for the Same Date Window
  const storePeriodRows = filterDataset(dataset, {
    startDate: startDate || null,
    endDate: endDate || null
  });
  const storeKPIs = getStoreKPIs(storePeriodRows);

  // 4. Prior Period Trend Comparison (equal duration immediately before startDate)
  let priorAgg = null;
  let hasPriorPeriod = false;

  if (startDate && endDate) {
    try {
      const sDate = new Date(startDate + 'T00:00:00');
      const eDate = new Date(endDate + 'T00:00:00');
      const diffMs = eDate.getTime() - sDate.getTime();
      const diffDays = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)));

      const priorEnd = new Date(sDate.getTime() - (24 * 60 * 60 * 1000));
      const priorStart = new Date(priorEnd.getTime() - ((diffDays - 1) * 24 * 60 * 60 * 1000));

      const priorStartIso = priorStart.toISOString().split('T')[0];
      const priorEndIso = priorEnd.toISOString().split('T')[0];

      const priorRows = filterDataset(dataset, {
        startDate: priorStartIso,
        endDate: priorEndIso
      }).filter(r => r.associate === associateName);

      if (priorRows.length > 0) {
        priorAgg = getAssociateAggregates(priorRows)[0];
        hasPriorPeriod = true;
      }
    } catch (e) {
      console.warn('Prior period calculation error:', e);
    }
  }

  // 5. Calculate Deltas
  const deltas = {
    hasPrior: hasPriorPeriod,
    speedDelta: priorAgg ? (currentAgg.pickRate - priorAgg.pickRate).toFixed(1) : null,
    ftprDelta: priorAgg ? (parseFloat(currentAgg.ftprPct) - parseFloat(priorAgg.ftprPct)).toFixed(1) : null,
    pphDelta: (priorAgg && currentAgg.shiftPPH > 0 && priorAgg.shiftPPH > 0) ? (currentAgg.shiftPPH - priorAgg.shiftPPH).toFixed(1) : null,
    utilDelta: (priorAgg && currentAgg.shiftHours > 0 && priorAgg.shiftHours > 0) ? (currentAgg.utilization - priorAgg.utilization).toFixed(1) : null
  };

  // 6. Synthesize Wins / Strengths
  const strengths = [];
  if (currentAgg.pickRate >= 100) {
    strengths.push(`⚡ High Velocity Picker: Averaging ${currentAgg.pickRate} items/hr (Top Store Tier, Benchmark is 80.0 i/h).`);
  } else if (currentAgg.pickRate >= 80) {
    strengths.push(`🚀 Met Store Speed Benchmark: Consistent active pace of ${currentAgg.pickRate} items/hr.`);
  }

  if (currentAgg.ftpr >= 0.95) {
    strengths.push(`🎯 Elite Accuracy Champion: Achieved ${currentAgg.ftprPct}% FTPR (exceeds store 94.0% benchmark).`);
  } else if (currentAgg.ftpr >= 0.935) {
    strengths.push(`✅ Solid Accuracy: Maintained ${currentAgg.ftprPct}% FTPR during this period.`);
  }

  if (currentAgg.shiftHours > 0 && currentAgg.utilization >= 70) {
    strengths.push(`⏱️ High Shift Utilization: Spent ${currentAgg.utilization}% of total shift hours actively picking (${currentAgg.pickHours.toFixed(1)} of ${currentAgg.shiftHours.toFixed(1)} hrs).`);
  }

  if (currentAgg.shiftHours > 0 && currentAgg.shiftPPH >= 65) {
    strengths.push(`📈 Strong Shift Productivity: Generated ${currentAgg.shiftPPH} picks per worked shift hour.`);
  }

  if (deltas.hasPrior && parseFloat(deltas.speedDelta) > 0) {
    strengths.push(`📈 Positive Pace Velocity: Pick speed improved by +${deltas.speedDelta} items/hr compared to the previous period.`);
  }
  if (deltas.hasPrior && parseFloat(deltas.ftprDelta) > 0) {
    strengths.push(`📈 Accuracy Growth: FTPR increased by +${deltas.ftprDelta}% vs prior period.`);
  }

  if (strengths.length === 0) {
    strengths.push(`📦 Reliable Fulfillment Contributor: Successfully picked ${currentAgg.totalPicked.toLocaleString()} items across ${currentAgg.daysCount} active shifts.`);
  }

  // 7. Synthesize Coaching Points & Focus Areas
  const coachingPoints = [];
  if (currentAgg.pickRate < 75) {
    const paceGap = (80 - currentAgg.pickRate).toFixed(1);
    coachingPoints.push(`⏱️ Active Pick Speed: Currently averaging ${currentAgg.pickRate} i/h (${paceGap} i/h below the 80.0 store benchmark). Review cart staging, path routing, and multi-bagging techniques.`);
  } else if (currentAgg.pickRate < 80) {
    coachingPoints.push(`⏱️ Pace Calibration: Active pace is ${currentAgg.pickRate} i/h. Closing the minor 80 i/h gap will elevate associate to Pacesetter tier.`);
  }

  if (currentAgg.ftpr < 0.93) {
    const ftprGap = (94.0 - parseFloat(currentAgg.ftprPct)).toFixed(1);
    coachingPoints.push(`🔍 Item Accuracy & Shelf Validation: Period FTPR of ${currentAgg.ftprPct}% is ${ftprGap}% below target (94.0%). Encourage checking adjacent mod locations and top-stock before recording nil-picks.`);
  }

  if (currentAgg.nilPicks > 0 && currentAgg.substitutions > 0 && currentAgg.nilPicks > currentAgg.substitutions * 0.9) {
    coachingPoints.push(`⚠️ Substitution Conversion: Logged ${currentAgg.nilPicks} nil-picks vs ${currentAgg.substitutions} substitutions. Coach on suggesting customer-approved substitutes to minimize order cancellation.`);
  }

  if (currentAgg.shiftHours > 0 && currentAgg.utilization < 55) {
    coachingPoints.push(`📊 Non-Pick Dwell Time: Associate logged ${currentAgg.nonPickHours} non-pick hours (${currentAgg.utilization}% utilization). Investigate transition delays between pick walks and cart staging.`);
  }

  if (deltas.hasPrior && parseFloat(deltas.ftprDelta) < -1.5) {
    coachingPoints.push(`📉 Accuracy Dip Notice: First-Time Pick Rate declined by ${deltas.ftprDelta}% compared to previous period.`);
  }

  if (coachingPoints.length === 0) {
    coachingPoints.push(`🌟 Maintain Excellence: Continue delivering role-model speed and precision; consider mentoring emerging pickers.`);
  }

  // 8. Generate 1-on-1 Script
  const dateSpanStr = (startDate && endDate) ? `${startDate} to ${endDate}` : 'the selected evaluation period';
  const scriptGreeting = `Hi ${associateName.split(' ')[0]}, let's review your performance data for ${dateSpanStr}.`;
  
  let scriptWins = `First, I want to recognize your achievements: you picked a total of ${currentAgg.totalPicked.toLocaleString()} items across ${currentAgg.daysCount} shifts.`;
  if (currentAgg.pickRate >= 80) {
    scriptWins += ` Your active picking speed was strong at ${currentAgg.pickRate} items/hr.`;
  }
  if (currentAgg.ftpr >= 0.94) {
    scriptWins += ` Your accuracy was outstanding with a ${currentAgg.ftprPct}% First Time Pick Rate.`;
  }

  let scriptFocus = '';
  if (currentAgg.pickRate < 80 && currentAgg.ftpr < 0.94) {
    scriptFocus = `Our key coaching priorities for this upcoming week are boosting our picking pace towards our 80 items/hr target while taking an extra moment to verify top-stock and endcaps before pressing item not found.`;
  } else if (currentAgg.pickRate < 80) {
    scriptFocus = `Your accuracy is in great shape, so our primary focus is quickening our pick walk transitions to push your pace over 80 items/hr.`;
  } else if (currentAgg.ftpr < 0.94) {
    scriptFocus = `Your picking pace is great! Let's dial in on first-time item locations to get your FTPR up past 94.0%.`;
  } else {
    scriptFocus = `You are performing at our Pacesetter benchmark! Let's keep this momentum rolling and look for opportunities to share your best practices with teammates.`;
  }

  const scriptCommitment = `What support or cart prep adjustments would help you hit our target milestones over the next evaluation cycle?`;

  const feedbackScript = `${scriptGreeting}\n\n• WINS: ${scriptWins}\n\n• FOCUS AREA: ${scriptFocus}\n\n• CLOSING: ${scriptCommitment}`;

  // 9. SMART Goals
  const smartGoals = [
    {
      title: 'Active Picking Speed Target',
      target: `${Math.max(80.0, Math.ceil(currentAgg.pickRate + 2.0))} items/hr`,
      current: `${currentAgg.pickRate} i/h`,
      benchmark: '80.0 i/h'
    },
    {
      title: 'First-Time Pick Accuracy (FTPR)',
      target: `${Math.max(94.0, (parseFloat(currentAgg.ftprPct) + 1.0)).toFixed(1)}%`,
      current: `${currentAgg.ftprPct}%`,
      benchmark: '94.0%'
    },
    {
      title: 'Shift Picker Utilization',
      target: currentAgg.shiftHours > 0 ? `${Math.max(70.0, Math.ceil(currentAgg.utilization + 3.0))}%` : '70.0%+',
      current: currentAgg.shiftHours > 0 ? `${currentAgg.utilization}%` : '--',
      benchmark: '70.0%'
    }
  ];

  // 10. Daily Shift breakdown for the date window
  const dailyShifts = currentPeriodRows.map(r => {
    const totalPicked = (r.pickedAsReq || 0) + (r.substitutions || 0);
    const shiftPPH = r.shiftHours > 0 ? (totalPicked / r.shiftHours) : 0;
    const util = r.shiftHours > 0 ? ((r.pickHours / r.shiftHours) * 100) : 0;
    const nonPick = Math.max(0, (r.shiftHours || 0) - (r.pickHours || 0));

    return {
      date: r.day,
      week: r.week,
      shiftHours: r.shiftHours ? r.shiftHours.toFixed(1) : '--',
      pickHours: r.pickHours ? r.pickHours.toFixed(1) : '--',
      pickRate: r.pickRate ? r.pickRate.toFixed(1) : '--',
      shiftPPH: shiftPPH > 0 ? shiftPPH.toFixed(1) : '--',
      utilization: r.shiftHours > 0 ? `${util.toFixed(1)}%` : '--%',
      nonPickHours: r.shiftHours > 0 ? nonPick.toFixed(1) : '--',
      ftpr: ((r.ftpr || 0) * 100).toFixed(1) + '%',
      substitutions: r.substitutions || 0,
      nilPicks: r.nilPicks || 0,
      totalPicked: totalPicked.toLocaleString()
    };
  });

  // 11. Compute Weekly Trend & Daily Trend for the selected date window
  const weekMap = {};
  currentPeriodRows.forEach(r => {
    const wk = r.week;
    if (!weekMap[wk]) {
      weekMap[wk] = { week: `Wk ${wk}`, weekNum: wk, exp: 0, act: 0, hours: 0, req: 0, sub: 0, shiftHours: 0 };
    }
    weekMap[wk].exp += r.ftpExpected || 0;
    weekMap[wk].act += r.ftpActual || 0;
    weekMap[wk].hours += r.pickHours || 0;
    weekMap[wk].req += r.pickedAsReq || 0;
    weekMap[wk].sub += r.substitutions || 0;
    if (r.shiftHours) weekMap[wk].shiftHours += r.shiftHours;
  });

  const weeklyTrend = Object.keys(weekMap).map(Number).sort((a, b) => a - b).map(wk => {
    const d = weekMap[wk];
    const ftpr = d.exp > 0 ? (d.act / d.exp) * 100 : 0;
    const rate = d.hours > 0 ? d.exp / d.hours : 0;
    const totalPicked = d.req + d.sub;
    const shiftPPH = d.shiftHours > 0 ? totalPicked / d.shiftHours : 0;
    const utilization = d.shiftHours > 0 ? (d.hours / d.shiftHours) * 100 : 0;

    return {
      label: d.week,
      week: d.week,
      ftpr: parseFloat(ftpr.toFixed(2)),
      pickRate: parseFloat(rate.toFixed(1)),
      shiftPPH: parseFloat(shiftPPH.toFixed(1)),
      utilization: parseFloat(utilization.toFixed(1)),
      volume: d.exp
    };
  });

  const dailyTrend = currentPeriodRows.map(r => {
    const totalPicked = (r.pickedAsReq || 0) + (r.substitutions || 0);
    const shiftPPH = r.shiftHours > 0 ? (totalPicked / r.shiftHours) : 0;
    const ftpr = r.ftpExpected > 0 ? ((r.ftpActual / r.ftpExpected) * 100) : (r.ftpr ? r.ftpr * 100 : 0);
    const rate = r.pickHours > 0 ? (r.ftpExpected / r.pickHours) : (r.pickRate || 0);
    const util = r.shiftHours > 0 ? ((r.pickHours / r.shiftHours) * 100) : 0;
    const nonPick = Math.max(0, (r.shiftHours || 0) - (r.pickHours || 0));

    return {
      label: r.day,
      date: r.day,
      isoDate: parseDateToISO(r.day),
      ftpr: parseFloat(ftpr.toFixed(2)),
      pickRate: parseFloat(rate.toFixed(1)),
      shiftPPH: parseFloat(shiftPPH.toFixed(1)),
      utilization: parseFloat(util.toFixed(1)),
      shiftHours: r.shiftHours ? parseFloat(r.shiftHours.toFixed(1)) : 0,
      pickHours: r.pickHours ? parseFloat(r.pickHours.toFixed(1)) : 0,
      nonPickHours: parseFloat(nonPick.toFixed(1)),
      volume: r.ftpExpected || totalPicked,
      totalPicked: totalPicked,
      substitutions: r.substitutions || 0,
      nilPicks: r.nilPicks || 0
    };
  }).filter(d => d.isoDate).sort((a, b) => a.isoDate.localeCompare(b.isoDate));

  return {
    hasData: true,
    associate: associateName,
    startDate: startDate || 'All Dates',
    endDate: endDate || 'All Dates',
    metrics: currentAgg,
    storeBenchmark: storeKPIs,
    deltas: deltas,
    strengths: strengths,
    coachingPoints: coachingPoints,
    feedbackScript: feedbackScript,
    smartGoals: smartGoals,
    dailyShifts: dailyShifts,
    weeklyTrend: weeklyTrend,
    dailyTrend: dailyTrend
  };
}
