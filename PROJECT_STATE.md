# Associate Performance 2.0 - Project Context & Work State

## Overview
**Store**: Walmart Store #1012  
**App Type**: Static Frontend Web Application (Vanilla JS Modules, Modern CSS Design System, HTML5)  
**Database**: Supabase Cloud Instance (`https://papwoytxbwwcljdfqiav.supabase.co`)  
**Repository**: `https://github.com/BugsyMayhem/associate-performance-2.0`  
**Branch**: `main`

---

## What Has Been Completed & Shipped So Far

1. **Cloud & Database Architecture**
   - Direct Supabase REST/JS integration via `src/config/supabaseClient.js`.
   - Table `associate_performance` with multi-page automatic pagination (1000 rows/batch), data parsing, and caching.
   - Table `coaching_notes` supporting 1-on-1 coaching notes persistence with upserting and delete capabilities.
   - Local fallback mechanism if Supabase is offline (`data/compiled_performance.json`).

2. **Core Performance Dashboard (`index.html`, `src/app.js`, `styles.css`)**
   - KPI metrics cards: Total Picks, FTPR %, Pick Rate (PPH), Shift PPH, Utilization %, Pick Hours.
   - Dynamic multi-select week/date filtering and department scoping.
   - Performance trendline charts (Chart.js) and Leaderboards (Speed, FTPR Accuracy, Shifts).
   - Data compilation and export scripts (`scripts/compile_data.py`).

3. **1-on-1 Coaching Studio (`index.html`, `src/app.js`, `src/coaching-mobile.js`)**
   - Multi-week date range selection with automated aggregation across selected periods.
   - Day-by-day interactive KPI timeline charts (FTPR, Pick Rate, Utilization).
   - Coach's AI/Heuristic feedback generators (Strengths, Opportunities, Tailored action plans).
   - Saveable, editable, and deletable 1-on-1 coaching history notes synced to Supabase.
   - Standalone mobile view for team leads on handheld devices (`mobile.html` / `src/coaching-mobile.js`).

4. **Associate Comparison Matrix & Head-to-Head Visuals**
   - Compare up to 3 associates side-by-side with radar charts and differential metric badges.

5. **Pre-Shift Huddle Printable Cards (Module 6)**
   - Pre-shift briefing card generator with shift forecast, shout-outs, peer pairings, and focus areas.
   - Dedicated print stylesheet (`@media print`) engineered to output a clean 1-page printable shift handout.

---

## File Structure & Key Files
- `index.html`: Main dashboard entry point, contains all modals (360 view, comparison matrix, pre-shift huddle, glossary).
- `mobile.html`: Standalone lightweight mobile coaching studio.
- `styles.css`: Dark-mode glassmorphic theme, responsive layouts, and `@media print` rules.
- `src/app.js`: Master application controller, event handlers, chart renderers, and state management.
- `src/config/supabaseClient.js`: Supabase cloud client and API query helpers.
- `src/utils/dataProcessor.js`: Mathematical aggregations, KPI calculations, date window filtering, and peer rankings.
- `src/coaching-mobile.js`: Dedicated standalone logic for mobile coaching.
- `serve.py`: Zero-cache Python HTTP server (`http://127.0.0.1:8086`).

---

## How to Run on Any Machine
```bash
git pull origin main
python serve.py
```
Open: `http://127.0.0.1:8086`
