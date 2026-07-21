// ═══════════════════════════════════════════════════════════════════════
// Skywarn Storm Spotters — Observation Collection Edge Function
// Runs on a cron schedule (every 5 minutes) to fetch NWS observations
// for all CONUS states and store them to the obs_snapshots table.
//
// This runs SERVER-SIDE in Supabase Edge Functions (Deno runtime),
// so there are no CORS issues and no client-side rate limiting.
// It runs 24/7 regardless of whether anyone has the app open.
//
// Deploy via Supabase CLI:
//   supabase functions deploy collect-obs --no-verify-jwt
//
// Schedule via SQL (see obs_cron_schedule.sql):
//   SELECT cron.schedule('obs-collection', '*/5 * * * *', ...);
// ═══════════════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const NWS_USER_AGENT = "Skywarn-Storm-Spotters/1.0 (weather@kn-weather)";
const NWS_BASE = "https://api.weather.gov";

// CONUS state codes
const CONUS_STATES = [
  "AL","AZ","AR","CA","CO","CT","DE","FL","GA","ID","IL","IN","IA","KS","KY",
  "LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY",
  "NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA",
  "WV","WI","WY","DC"
];

// Batch helper — runs promises in batches of N
async function batch<T, R>(
  items: T[],
  batchSize: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batchItems = items.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(batchItems.map(fn));
    for (const r of batchResults) {
      if (r.status === "fulfilled") results.push(r.value);
    }
  }
  return results;
}

// Fetch all ASOS stations for CONUS
async function fetchAllStations(): Promise<{id: string; lat: number; lon: number; state: string}[]> {
  const allStations: {id: string; lat: number; lon: number; state: string}[] = [];

  // Fetch stations for all states in parallel (47 concurrent requests)
  const stationResults = await Promise.allSettled(
    CONUS_STATES.map(async (state) => {
      const resp = await fetch(`${NWS_BASE}/stations?state=${state}&limit=200`, {
        headers: {
          "User-Agent": NWS_USER_AGENT,
          "Accept": "application/json",
        },
      });
      if (!resp.ok) return [];
      const data = await resp.json();
      return (data.features || []).map((f: any) => ({
        id: f.properties.stationIdentifier,
        lat: f.geometry.coordinates[1],
        lon: f.geometry.coordinates[0],
        state,
      }));
    })
  );

  for (const r of stationResults) {
    if (r.status === "fulfilled") {
      allStations.push(...r.value);
    }
  }

  // Deduplicate by station ID
  const seen = new Set<string>();
  const unique = allStations.filter((s) => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });

  return unique;
}

// Fetch latest observation for a single station
async function fetchObservation(
  stationId: string
): Promise<{stationId: string; obs: any} | null> {
  try {
    const resp = await fetch(`${NWS_BASE}/stations/${stationId}/observations/latest`, {
      headers: {
        "User-Agent": NWS_USER_AGENT,
        "Accept": "application/json",
      },
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    if (!data.properties) return null;
    return { stationId, obs: data.properties };
  } catch {
    return null;
  }
}

Deno.serve(async (_req: Request) => {
  console.log("[collect-obs] Starting observation collection...");

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Step 1: Fetch all stations
  console.log("[collect-obs] Fetching station list...");
  const stations = await fetchAllStations();
  console.log(`[collect-obs] Found ${stations.length} stations`);

  if (stations.length === 0) {
    return new Response(JSON.stringify({ error: "No stations found" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Step 2: Fetch observations in batches of 50
  console.log("[collect-obs] Fetching observations (batch size: 50)...");
  const nowISO = new Date().toISOString();
  const obsResults: {stationId: string; obs: any}[] = [];

  await batch(stations, 50, async (st) => {
    const result = await fetchObservation(st.id);
    if (result) obsResults.push(result);
    return result;
  });

  console.log(`[collect-obs] Got ${obsResults.length} observations`);

  // Step 3: Build rows for batch insert
  const rows = obsResults.map((r) => {
    const station = stations.find((s) => s.id === r.stationId);
    const o = r.obs;
    return {
      station_id: r.stationId,
      state: station?.state || null,
      lat: station?.lat || null,
      lon: station?.lon || null,
      temp_c: o.temperature?.value ?? null,
      dewpoint_c: o.dewpoint?.value ?? null,
      wind_dir: o.windDirection?.value != null ? Math.round(o.windDirection.value) : null,
      wind_speed_kmh: o.windSpeed?.value ?? null,
      wind_gust_kmh: o.windGust?.value ?? null,
      pressure_pa: o.barometricPressure?.value ?? o.seaLevelPressure?.value ?? null,
      visibility_m: o.visibility?.value ?? null,
      relative_humidity: o.relativeHumidity?.value ?? null,
      precip_mm: o.precipitationLastHour?.value ?? null,
      text_description: o.textDescription || null,
      observed_at: nowISO,
    };
  });

  // Step 4: Batch insert to Supabase (split into chunks of 500 to avoid payload limits)
  console.log("[collect-obs] Inserting to Supabase...");
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await supabase.from("obs_snapshots").insert(chunk);
    if (error) {
      console.error("[collect-obs] Insert error:", error.message);
    } else {
      inserted += chunk.length;
    }
  }

  // Step 5: Clean up old snapshots (>24 hours)
  const { error: cleanupError } = await supabase.rpc("cleanup_old_obs_snapshots");
  if (cleanupError) {
    console.warn("[collect-obs] Cleanup error (non-fatal):", cleanupError.message);
  }

  console.log(`[collect-obs] Done. Inserted ${inserted} snapshots.`);

  return new Response(
    JSON.stringify({
      success: true,
      stations: stations.length,
      observations: obsResults.length,
      inserted,
      timestamp: nowISO,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
});
