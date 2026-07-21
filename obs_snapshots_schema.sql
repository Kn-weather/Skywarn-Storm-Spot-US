-- ──────────────────────────────────────────────────────────────────────────
-- Skywarn Storm Spotters — Observation Snapshots Schema
-- Run this in your Supabase SQL Editor (Dashboard → SQL → New Query)
-- Stores observation snapshots every 5 minutes for animated gradient playback.
-- Auto-cleanup keeps storage small (~11 MB/day).
-- ──────────────────────────────────────────────────────────────────────────

-- ── 1. obs_snapshots table ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.obs_snapshots (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  station_id        TEXT NOT NULL,
  state             TEXT,
  lat               DOUBLE PRECISION,
  lon               DOUBLE PRECISION,
  temp_c            FLOAT,
  dewpoint_c        FLOAT,
  wind_dir          INT,
  wind_speed_kmh    FLOAT,
  wind_gust_kmh     FLOAT,
  pressure_pa       FLOAT,
  visibility_m      FLOAT,
  relative_humidity FLOAT,
  precip_mm         FLOAT,
  text_description  TEXT,
  observed_at       TIMESTAMPTZ NOT NULL,
  created_at        TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.obs_snapshots IS 'Surface observation snapshots for animated gradient playback';

-- Indexes for fast time-range + state queries
CREATE INDEX IF NOT EXISTS idx_obs_snapshots_time ON public.obs_snapshots(observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_obs_snapshots_state_time ON public.obs_snapshots(state, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_obs_snapshots_station_time ON public.obs_snapshots(station_id, observed_at DESC);

-- ── 2. Row Level Security ──────────────────────────────────────────────────
-- Public read (anyone can view animation)
-- Authenticated insert (logged-in users contribute snapshots)
-- No update/delete (snapshots are immutable)

ALTER TABLE public.obs_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read on obs_snapshots" ON public.obs_snapshots;
DROP POLICY IF EXISTS "Authenticated insert on obs_snapshots" ON public.obs_snapshots;
DROP POLICY IF EXISTS "Delete old obs_snapshots" ON public.obs_snapshots;

CREATE POLICY "Public read on obs_snapshots"
  ON public.obs_snapshots FOR SELECT
  USING (true);

CREATE POLICY "Authenticated insert on obs_snapshots"
  ON public.obs_snapshots FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Allow anyone (including anon) to delete old snapshots for auto-cleanup.
-- This is safe because the delete function only removes rows older than 24h.
CREATE POLICY "Delete old obs_snapshots"
  ON public.obs_snapshots FOR DELETE
  USING (observed_at < now() - interval '24 hours');

-- ── 3. Auto-cleanup function ──────────────────────────────────────────────
-- Deletes snapshots older than 24 hours. Can be called from the client
-- periodically, or set up as a Supabase cron job (pg_cron extension).
CREATE OR REPLACE FUNCTION public.cleanup_old_obs_snapshots()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.obs_snapshots WHERE observed_at < now() - interval '24 hours';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ──────────────────────────────────────────────────────────────────────────
-- DONE. After running this:
--   - Authenticated users can INSERT observation snapshots
--   - Anyone can SELECT (read) snapshots for animation playback
--   - Old snapshots auto-deleted after 24 hours
--   - Estimated storage: ~11 MB/day (200 stations × 288 snapshots × 200 bytes)
-- ──────────────────────────────────────────────────────────────────────────
