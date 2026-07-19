-- ──────────────────────────────────────────────────────────────────────────
-- Skywarn Storm Spotters — Spotting Journal Schema
-- Run this in your Supabase SQL Editor (Dashboard → SQL → New Query)
-- ──────────────────────────────────────────────────────────────────────────
-- This creates:
--   1. journal_events table (groups entries by chase day / storm system)
--   2. journal_entries table (individual observations)
--   3. Row Level Security policies (public read, public insert for Phase 1)
--   4. Storage bucket for photos + radar screenshots
-- ──────────────────────────────────────────────────────────────────────────

-- ── 1. journal_events ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.journal_events (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      UUID REFERENCES auth.users(id) ON DELETE SET NULL,  -- null for anonymous (Phase 1)
  title        TEXT NOT NULL,
  description  TEXT,
  is_public    BOOLEAN DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.journal_events IS 'Groups journal entries by chase day or storm system';

-- ── 2. journal_entries ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.journal_entries (
  id                    UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id              UUID REFERENCES public.journal_events(id) ON DELETE CASCADE,
  user_id               UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  lat                   DOUBLE PRECISION,
  lon                   DOUBLE PRECISION,
  location_label        TEXT,
  observed_at           TIMESTAMPTZ DEFAULT now(),
  -- Weather variables (manual or auto-filled from NWS)
  temp_f                FLOAT,
  dewpoint_f            FLOAT,
  wind_dir              INT,           -- degrees from N (0-359)
  wind_speed_kt         FLOAT,
  pressure_hpa          FLOAT,
  sky_conditions        TEXT,
  notes                 TEXT,
  -- Media attachments
  photo_url             TEXT,
  radar_screenshot_url  TEXT,
  -- Metadata
  auto_filled           BOOLEAN DEFAULT false,  -- true if auto-filled from NWS API
  created_at            TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.journal_entries IS 'Individual storm spotting observations';

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_journal_entries_event_id ON public.journal_entries(event_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_observed_at ON public.journal_entries(observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_journal_events_created_at ON public.journal_events(created_at DESC);

-- ── 3. Row Level Security ──────────────────────────────────────────────────
-- Phase 1: public read + public insert (no auth required)
-- Anyone viewing the app can see all journal entries and add new ones.
-- Update/delete is restricted to entries created by the same user (when auth is added later).

ALTER TABLE public.journal_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (idempotent re-run)
DROP POLICY IF EXISTS "Public read on journal_events" ON public.journal_events;
DROP POLICY IF EXISTS "Public insert on journal_events" ON public.journal_events;
DROP POLICY IF EXISTS "Update own journal_events" ON public.journal_events;
DROP POLICY IF EXISTS "Delete own journal_events" ON public.journal_events;

DROP POLICY IF EXISTS "Public read on journal_entries" ON public.journal_entries;
DROP POLICY IF EXISTS "Public insert on journal_entries" ON public.journal_entries;
DROP POLICY IF EXISTS "Update own journal_entries" ON public.journal_entries;
DROP POLICY IF EXISTS "Delete own journal_entries" ON public.journal_entries;

-- journal_events policies
CREATE POLICY "Public read on journal_events"
  ON public.journal_events FOR SELECT
  USING (true);

CREATE POLICY "Public insert on journal_events"
  ON public.journal_events FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Update own journal_events"
  ON public.journal_events FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Delete own journal_events"
  ON public.journal_events FOR DELETE
  USING (user_id = auth.uid());

-- journal_entries policies
CREATE POLICY "Public read on journal_entries"
  ON public.journal_entries FOR SELECT
  USING (true);

CREATE POLICY "Public insert on journal_entries"
  ON public.journal_entries FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Update own journal_entries"
  ON public.journal_entries FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Delete own journal_entries"
  ON public.journal_entries FOR DELETE
  USING (user_id = auth.uid());

-- ── 4. Storage bucket for photos + radar screenshots ──────────────────────
-- Create the bucket (public so images can be loaded via direct URL)
INSERT INTO storage.buckets (id, name, public)
VALUES ('journal-photos', 'journal-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS policies
DROP POLICY IF EXISTS "Public read journal-photos" ON storage.objects;
DROP POLICY IF EXISTS "Public upload journal-photos" ON storage.objects;
DROP POLICY IF EXISTS "Public delete journal-photos" ON storage.objects;

CREATE POLICY "Public read journal-photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'journal-photos');

CREATE POLICY "Public upload journal-photos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'journal-photos');

CREATE POLICY "Public delete journal-photos"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'journal-photos');

-- ── 5. Updated_at trigger ──────────────────────────────────────────────────
-- Auto-update updated_at when journal_events rows are modified
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS journal_events_updated_at ON public.journal_events;
CREATE TRIGGER journal_events_updated_at
  BEFORE UPDATE ON public.journal_events
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ──────────────────────────────────────────────────────────────────────────
-- DONE. After running this, your Supabase project is ready.
--
-- Next: in your app's HTML, set these two constants:
--   SUPABASE_URL = 'https://YOUR_PROJECT_REF.supabase.co'
--   SUPABASE_ANON_KEY = 'YOUR_ANON_KEY'
-- (Find these in Dashboard → Settings → API → "Project URL" and "anon public")
-- ──────────────────────────────────────────────────────────────────────────
