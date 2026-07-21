// ═══════════════════════════════════════════════════════════════════════
// NWS Observation Collector — runs via GitHub Actions every 30 minutes
// Fetches latest observations for all CONUS ASOS stations and stores
// them to Supabase obs_snapshots table for animation playback.
//
// This runs in GitHub's cloud infrastructure — nothing local needed.
// ═══════════════════════════════════════════════════════════════════════

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY environment variables');
  process.exit(1);
}

const NWS_BASE = 'https://api.weather.gov';
const NWS_HEADERS = {
  'User-Agent': 'Skywarn-Storm-Spotters/1.0 (github.com/Kn-weather/Skywarn-Storm-Spot-US)',
  'Accept': 'application/json',
};

const CONUS_STATES = [
  'AL','AZ','AR','CA','CO','CT','DE','FL','GA','ID','IL','IN','IA','KS','KY',
  'LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY',
  'NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA',
  'WV','WI','WY','DC'
];

// Batch helper — runs promises in controlled batches
async function batch(items, batchSize, fn) {
  const results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const chunk = items.slice(i, i + batchSize);
    const settled = await Promise.allSettled(chunk.map(fn));
    for (const r of settled) {
      if (r.status === 'fulfilled' && r.value) results.push(r.value);
    }
    // Small delay between batches to be nice to the NWS API
    if (i + batchSize < items.length) {
      await new Promise(r => setTimeout(r, 200));
    }
  }
  return results;
}

async function fetchAllStations() {
  console.log('Fetching station list for all CONUS states...');
  const allStations = [];
  
  const results = await Promise.allSettled(
    CONUS_STATES.map(async (state) => {
      const resp = await fetch(`${NWS_BASE}/stations?state=${state}&limit=200`, { headers: NWS_HEADERS });
      if (!resp.ok) return [];
      const data = await resp.json();
      return (data.features || []).map(f => ({
        id: f.properties.stationIdentifier,
        lat: f.geometry.coordinates[1],
        lon: f.geometry.coordinates[0],
        state,
      }));
    })
  );
  
  for (const r of results) {
    if (r.status === 'fulfilled') allStations.push(...r.value);
  }
  
  // Deduplicate
  const seen = new Set();
  const unique = allStations.filter(s => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });
  
  console.log(`Found ${unique.length} unique stations`);
  return unique;
}

async function fetchObservation(stationId) {
  try {
    const resp = await fetch(`${NWS_BASE}/stations/${stationId}/observations/latest`, { headers: NWS_HEADERS });
    if (!resp.ok) return null;
    const data = await resp.json();
    if (!data.properties) return null;
    return { stationId, obs: data.properties };
  } catch {
    return null;
  }
}

async function main() {
  console.log('=== NWS Observation Collection Started ===');
  const startTime = Date.now();
  
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  
  // Step 1: Fetch all stations
  const stations = await fetchAllStations();
  if (stations.length === 0) {
    console.error('No stations found — aborting');
    process.exit(1);
  }
  
  // Step 2: Fetch observations in batches of 50
  console.log(`Fetching observations for ${stations.length} stations (batch size: 50)...`);
  const obsResults = await batch(stations, 50, (st) => fetchObservation(st.id));
  console.log(`Got ${obsResults.length} observations`);
  
  // Step 3: Build rows
  const nowISO = new Date().toISOString();
  const rows = obsResults.map(r => {
    const station = stations.find(s => s.id === r.stationId);
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
  
  // Step 4: Batch insert (chunks of 500)
  console.log('Inserting to Supabase...');
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await supabase.from('obs_snapshots').insert(chunk);
    if (error) {
      console.error(`Insert error (chunk ${i}):`, error.message);
    } else {
      inserted += chunk.length;
    }
  }
  
  // Step 5: Cleanup old snapshots
  const { error: cleanupError } = await supabase.rpc('cleanup_old_obs_snapshots');
  if (cleanupError) {
    console.warn('Cleanup error (non-fatal):', cleanupError.message);
  } else {
    console.log('Old snapshots cleaned up');
  }
  
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`=== Done in ${elapsed}s. Inserted ${inserted} snapshots at ${nowISO} ===`);
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
