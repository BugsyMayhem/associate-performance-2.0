-- =========================================================
-- Associate Performance 2.0 - Supabase Schema Setup
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor)
-- =========================================================

-- 1. Table: associate_performance
CREATE TABLE IF NOT EXISTS public.associate_performance (
    id BIGSERIAL PRIMARY KEY,
    store TEXT DEFAULT '1012',
    week INTEGER NOT NULL,
    associate TEXT NOT NULL,
    day TEXT,
    iso_date DATE,
    is_total BOOLEAN DEFAULT FALSE,
    ftpr NUMERIC DEFAULT 0,
    ftp_expected INTEGER DEFAULT 0,
    ftp_actual INTEGER DEFAULT 0,
    pick_rate NUMERIC DEFAULT 0,
    pick_hours NUMERIC DEFAULT 0,
    picked_as_req INTEGER DEFAULT 0,
    substitutions INTEGER DEFAULT 0,
    overrides INTEGER DEFAULT 0,
    nil_picks INTEGER DEFAULT 0,
    shift_hours NUMERIC,
    shift_pph NUMERIC,
    utilization NUMERIC,
    non_pick_hours NUMERIC,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS for associate_performance
ALTER TABLE public.associate_performance ENABLE ROW LEVEL SECURITY;

-- Allow public access (read & insert/update for dashboard)
DROP POLICY IF EXISTS "Allow public select associate_performance" ON public.associate_performance;
CREATE POLICY "Allow public select associate_performance" 
ON public.associate_performance FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public insert associate_performance" ON public.associate_performance;
CREATE POLICY "Allow public insert associate_performance" 
ON public.associate_performance FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update associate_performance" ON public.associate_performance;
CREATE POLICY "Allow public update associate_performance" 
ON public.associate_performance FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow public delete associate_performance" ON public.associate_performance;
CREATE POLICY "Allow public delete associate_performance" 
ON public.associate_performance FOR DELETE USING (true);

-- Indexes for lightning fast queries
CREATE INDEX IF NOT EXISTS idx_assoc_perf_week ON public.associate_performance(week);
CREATE INDEX IF NOT EXISTS idx_assoc_perf_associate ON public.associate_performance(associate);
CREATE INDEX IF NOT EXISTS idx_assoc_perf_iso_date ON public.associate_performance(iso_date);


-- 2. Table: coaching_notes
CREATE TABLE IF NOT EXISTS public.coaching_notes (
    id BIGSERIAL PRIMARY KEY,
    associate_name TEXT NOT NULL,
    start_date TEXT DEFAULT '',
    end_date TEXT DEFAULT '',
    notes_text TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT coaching_notes_conflict UNIQUE (associate_name, start_date, end_date)
);

-- Enable RLS for coaching_notes
ALTER TABLE public.coaching_notes ENABLE ROW LEVEL SECURITY;

-- Allow public access for coaching notes
DROP POLICY IF EXISTS "Allow public select coaching_notes" ON public.coaching_notes;
CREATE POLICY "Allow public select coaching_notes" 
ON public.coaching_notes FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public insert coaching_notes" ON public.coaching_notes;
CREATE POLICY "Allow public insert coaching_notes" 
ON public.coaching_notes FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update coaching_notes" ON public.coaching_notes;
CREATE POLICY "Allow public update coaching_notes" 
ON public.coaching_notes FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow public delete coaching_notes" ON public.coaching_notes;
CREATE POLICY "Allow public delete coaching_notes" 
ON public.coaching_notes FOR DELETE USING (true);
