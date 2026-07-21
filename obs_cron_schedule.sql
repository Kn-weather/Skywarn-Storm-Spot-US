-- ═══════════════════════════════════════════════════════════════════════
-- Skywarn Storm Spotters — Observation Collection Cron Schedule
-- Run this in your Supabase SQL Editor AFTER deploying the Edge Function.
--
-- This schedules the collect-obs Edge Function to run every 5 minutes,
-- 24/7, regardless of whether anyone has the app open. It fetches NWS
-- observations for all CONUS states and stores them to obs_snapshots.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. Enable required extensions ──────────────────────────────────────────
-- pg_cron: for scheduling
-- pg_net: for making HTTP requests from SQL
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ── 2. Set up the cron schedule ────────────────────────────────────────────
-- Runs every 5 minutes, calls the Edge Function via HTTP POST.
-- The Edge Function handles:
--   1. Fetching all ASOS stations for CONUS
--   2. Fetching latest observation for each station (batched)
--   3. Storing to obs_snapshots table
--   4. Cleaning up old snapshots (>24h)

-- Drop existing schedule if re-running
SELECT cron.unschedule('obs-collection');

-- Schedule the Edge Function to run every 5 minutes
SELECT cron.schedule(
  'obs-collection',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://pwfxpiwumicddfeqhiia.supabase.co/functions/v1/collect-obs',
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- ── 3. Verify the schedule ─────────────────────────────────────────────────
-- View all scheduled jobs
SELECT jobid, schedule, jobname, active FROM cron.job;

-- ──────────────────────────────────────────────────────────────────────────
-- To UNSCHEDULE (stop the cron job):
--   SELECT cron.unschedule('obs-collection');
--
-- To check recent cron job runs:
--   SELECT * FROM cron.job_run_details
--   WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'obs-collection')
--   ORDER BY start_time DESC
--   LIMIT 10;
-- ──────────────────────────────────────────────────────────────────────────
