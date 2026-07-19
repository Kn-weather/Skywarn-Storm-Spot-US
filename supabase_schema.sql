-- ──────────────────────────────────────────────────────────────────────────
-- Skywarn Storm Spotters — Spotting Journal Schema (v2 — with Auth)
-- Run this in your Supabase SQL Editor (Dashboard → SQL → New Query)
--
-- This is a fresh re-creation of the schema. If you already ran v1,
-- this version is safe to re-run — it uses IF NOT EXISTS / DROP IF EXISTS
-- for idempotency. The RLS policies are updated to require auth for
-- insert/update/delete (read stays public).
-- ──────────────────────────────────────────────────────────────────────────

-- ── 1. journal_events ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.journal_events (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE,
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
  user_id               UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  lat                   DOUBLE PRECISION,
  lon                   DOUBLE PRECISION,
  location_label        TEXT,
  observed_at           TIMESTAMPTZ DEFAULT now(),
  -- Weather variables (manual or auto-filled from NWS)
  temp_f                FLOAT,
  dewpoint_f            FLOAT,
  wind_dir              INT,
  wind_speed_kt         FLOAT,
  pressure_hpa          FLOAT,
  sky_conditions        TEXT,
  notes                 TEXT,
  -- Media attachments
  photo_url             TEXT,
  radar_screenshot_url  TEXT,
  -- Metadata
  auto_filled           BOOLEAN DEFAULT false,
  created_at            TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.journal_entries IS 'Individual storm spotting observations';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_journal_entries_event_id ON public.journal_entries(event_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_observed_at ON public.journal_entries(observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_journal_entries_user_id ON public.journal_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_journal_events_created_at ON public.journal_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_journal_events_user_id ON public.journal_events(user_id);

-- ── 3. Row Level Security (auth-aware) ────────────────────────────────────
-- Read: public (anyone can view all events + entries — community sharing)
-- Insert: must be authenticated (user_id auto-set to auth.uid())
-- Update/Delete: only the owner (user_id = auth.uid())

ALTER TABLE public.journal_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
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

CREATE POLICY "Authenticated insert on journal_events"
  ON public.journal_events FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND user_id = auth.uid());

CREATE POLICY "Update own journal_events"
  ON public.journal_events FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Delete own journal_events"
  ON public.journal_events FOR DELETE
  USING (user_id = auth.uid());

-- journal_entries policies
CREATE POLICY "Public read on journal_entries"
  ON public.journal_entries FOR SELECT
  USING (true);

CREATE POLICY "Authenticated insert on journal_entries"
  ON public.journal_entries FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND user_id = auth.uid());

CREATE POLICY "Update own journal_entries"
  ON public.journal_entries FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Delete own journal_entries"
  ON public.journal_entries FOR DELETE
  USING (user_id = auth.uid());

-- ── 4. Storage bucket for photos + radar screenshots ──────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('journal-photos', 'journal-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS policies
DROP POLICY IF EXISTS "Public read journal-photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated upload journal-photos" ON storage.objects;
DROP POLICY IF EXISTS "Update own journal-photos" ON storage.objects;
DROP POLICY IF EXISTS "Delete own journal-photos" ON storage.objects;

CREATE POLICY "Public read journal-photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'journal-photos');

CREATE POLICY "Authenticated upload journal-photos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'journal-photos' AND auth.uid() IS NOT NULL);

CREATE POLICY "Update own journal-photos"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'journal-photos' AND owner = auth.uid());

CREATE POLICY "Delete own journal-photos"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'journal-photos' AND owner = auth.uid());

-- ── 5. Updated_at trigger ──────────────────────────────────────────────────
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

-- ── 6. Auto-populate user_id on insert (helper trigger) ────────────────────
-- This ensures user_id is always set to auth.uid() on insert, even if the
-- client forgets to set it. Defense in depth.
CREATE OR REPLACE FUNCTION public.set_user_id_on_insert()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.user_id IS NULL THEN
    NEW.user_id = auth.uid();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS journal_events_set_user_id ON public.journal_events;
CREATE TRIGGER journal_events_set_user_id
  BEFORE INSERT ON public.journal_events
  FOR EACH ROW
  EXECUTE FUNCTION public.set_user_id_on_insert();

DROP TRIGGER IF EXISTS journal_entries_set_user_id ON public.journal_entries;
CREATE TRIGGER journal_entries_set_user_id
  BEFORE INSERT ON public.journal_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.set_user_id_on_insert();

-- ──────────────────────────────────────────────────────────────────────────
-- DONE. After running this:
--   - Anonymous users can READ all events + entries (community sharing)
--   - Only authenticated users can CREATE/EDIT/DELETE their own data
--   - Storage uploads require auth
--
-- To enable magic-link auth in your app:
--   Supabase Dashboard → Authentication → Providers → Email → Enable
--   (Make sure "Confirm email" is OFF for dev, ON for production)
-- ──────────────────────────────────────────────────────────────────────────
