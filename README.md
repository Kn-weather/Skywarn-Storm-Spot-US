# Skywarn Storm Spotters & Chasers United States

A comprehensive weather monitoring PWA for storm spotters and chasers, featuring live NWS alert polygons, SPC outlooks, radar animation, soundings, surface observations, and a spotting journal with Supabase backend.

**Live Site:** [https://kn-weather.github.io/Skywarn-Storm-Spot-US/](https://kn-weather.github.io/Skywarn-Storm-Spot-US/)

## Features

### Polygon Map (Main Tab)
- **Live NWS Alert Polygons** — Tornado Warnings, Severe Thunderstorm Warnings, Watches, Advisories with delta updates (only adds/removes changed alerts)
- **SPC Convective Outlooks** — Day 1-3 categorical + tornado/hail/wind probability layers
- **Radar Overlay** — RainViewer API with 3-layer rolling buffer for smooth animation, play/pause/step controls, dBZ legend
- **Surface Observations** — NWS ASOS station data with 9 weather variables (temp, dewpoint, wind, pressure, visibility, RH, precip), color-coded markers, and IDW gradient heatmap overlay with NWS-standard color ramps
- **Observation Animation** — Play through stored observation snapshots (Supabase-backed) with speed control, pin + gradient animation
- **Sounding Station Pins** — 68 NWS upper-air sites with click-to-view skew-T popups
- **Tornado Tracker Mode** — Auto-zoom to newly issued Tornado Warnings (Settings)
- **Screenshots** — Three-panel alert screenshots, live map screenshots, sounding collage screenshots with Skywarn branding
- **Share** — Facebook, Discord, native Web Share API
- **Collapsible Layers Panel** — All layer sections collapsible with persisted state
- **Collapsible Alert Legend** — Active alerts grouped by category (Warnings/Watches/Advisories)

### Soundings Tab
- **Skew-T / Log-P Diagram** — Full NWS/NOAA-standard rendering with canvas clipping
  - Isobars (log-P, 1000 hPa bottom → 100 hPa top)
  - Isotherms (skewed SW to NE, labeled at bottom, 0°C highlighted)
  - Dry adiabats (solid, SE to NW, correct θ formula)
  - Moist adiabats (curved, every 10°C)
  - Mixing ratio lines (dashed, 1/2/5/10/20 g/kg)
  - Temperature trace (color-coded by altitude: red/orange/yellow/cyan)
  - Dewpoint trace (green)
  - Parcel ascent with LCL/LFC/EL markers
  - Wind barbs at standard pressure levels
  - Height scale (km AGL) on right side
- **Hodograph** — Color-coded by altitude, Bunkers right-mover storm motion, range rings
- **Derived Parameters** — CAPE, CIN, LI, Showalter, K Index, Total Totals, PW, bulk shear (0-1/0-3/0-6 km), SRH (0-1/0-3 km), key level winds
- **Legend & Instructions** — Collapsible panel with how-to-read guide
- **TwisterData Integration** — Embedded forecast sounding map for arbitrary points
- **Screenshot** — Collage: data panel left, skew-T top-right, hodograph bottom-right, branding footer
- **Standalone Page** — `soundings.html` can be used independently on any website

### Spotting Journal Tab
- **Observation Diary** — Track weather observations across multiple chase days/events
- **Manual Entry** — Temp, dewpoint, wind, pressure, sky conditions, notes
- **NWS Auto-fill** — Geolocation → NWS /points API → nearest ASOS station → auto-fill weather data
- **Location Options** — Browser GPS, place name lookup (OpenStreetMap Nominatim), click-on-map, manual lat/lon
- **Photo Upload** — Sky/feature photos stored in Supabase Storage
- **Radar Screenshots** — Capture current map view and attach to journal entries
- **Alert Screenshot → Journal** — "+ Journal" button in screenshot preview modal
- **Time-Series Graph** — Canvas chart for temp/dewpoint/pressure/wind over time
- **Mini-Map** — Entry locations with popups
- **Edit/Delete** — Owner-only (requires authentication)
- **Multi-User** — Supabase Auth with Google OAuth, Facebook OAuth (pending verification), and magic link

### Weatherfront Tab
- Embedded Weatherfront interactive dashboard

### StormCams Tab
- Storm camera network (placeholder)

### Weather Feeds Tab
- SPC PDS feed, WPC feed, NHC feed with images

### Lightning Map Tab
- Blitzortung real-time lightning map (embedded)

### Spotter Safety Tab
- ACES concept (Awareness, Communication, Escape Routes, Safe Zones)
- Core safety guidelines from COMET/UCAR

### Reference Library Tab
- SKYWARN meteorological terms, cloud types, radar terms, severe weather, hydrology, winter weather, reporting criteria
- Beaufort Wind Scale video
- Category tabs with search, diagram placeholders

### Site Settings Tab
- User Account (Google/Facebook OAuth, magic link, sign out)
- Tornado Tracker Mode toggle
- Alert sounds (Tornado Warning/Watch)
- Update log / console
- Hard refresh / app update

## Technology Stack

| Component | Technology |
|-----------|-----------|
| Frontend | Single HTML file (~12,000+ lines), vanilla JavaScript |
| Map | Leaflet.js 1.9.4 with CARTO Voyager basemap |
| Radar | RainViewer API with 3-layer rolling buffer |
| Alerts | NWS API (api.weather.gov) with CORS proxy fallback |
| Soundings | Iowa Environmental Mesonet (Iowa State University) RAOB JSON API |
| SPC Outlooks | spc.noaa.gov GeoJSON API |
| Observations | NWS ASOS stations via api.weather.gov |
| Backend | Supabase (PostgreSQL, Auth, Storage, Realtime) |
| Auth | Supabase Auth (Google OAuth, Facebook OAuth, magic link) |
| PWA | manifest.json, service worker (network-first HTML, cache-first static) |
| Screenshots | html2canvas with canvas-based compositing |
| Data Collection | GitHub Actions cron (every 30 min) + client-side snapshots |

## PWA Support

- Installable on iOS/Android/desktop
- Service worker with network-first HTML strategy
- Offline-capable (cached assets, offline fallback page)
- Safe-area insets for notched devices
- Cache versioning for seamless updates

## Database Schema

### journal_events
Groups journal entries by chase day or storm system.

### journal_entries
Individual storm spotting observations with weather variables, photos, and radar screenshots.

### obs_snapshots
Surface observation snapshots for animated gradient playback. Auto-cleaned after 24 hours.

**SQL files:**
- `supabase_schema.sql` — Journal tables + RLS + storage bucket
- `obs_snapshots_schema.sql` — Observation snapshots table + RLS + cleanup function
- `obs_cron_schedule.sql` — pg_cron schedule for Edge Function (optional)

## GitHub Actions (24/7 Data Collection)

- `.github/workflows/collect-obs.yml` — Runs every 30 minutes
- `scripts/collect-obs.mjs` — Fetches NWS observations for all CONUS states, stores to Supabase
- Requires repository secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`
- Can also be triggered manually from the Actions tab

## Standalone Files

- `soundings.html` — Self-contained skew-T soundings page (no app dependencies)
- `supabase/functions/collect-obs/index.ts` — Supabase Edge Function for observation collection (optional alternative to GitHub Actions)

## Setup

### For Users
Just visit the [live site](https://kn-weather.github.io/Skywarn-Storm-Spot-US/). No installation required — it's a PWA that can be installed to your home screen.

### For Developers

1. Clone the repo
2. Open `index.html` in a browser (or serve with any static server)
3. For journal/auth features, configure Supabase:
   - Run `supabase_schema.sql` and `obs_snapshots_schema.sql` in your Supabase SQL editor
   - Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` in the JavaScript (search for "USER CONFIG")
   - Enable Email + Google providers in Supabase Dashboard → Authentication → Providers
4. For 24/7 observation collection:
   - Add `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` as repository secrets (GitHub Settings → Secrets → Actions)
   - The workflow runs automatically every 30 minutes

## Data Sources

- [NWS API](https://www.weather.gov/documentation/services-web-api) — Alerts, observations, station data
- [Iowa Environmental Mesonet](https://mesonet.agron.iastate.edu/) — RAOB soundings
- [SPC](https://www.spc.noaa.gov/) — Convective outlooks
- [RainViewer](https://www.rainviewer.com/) — Radar tiles
- [CARTO](https://carto.com/) — Basemap tiles
- [OpenStreetMap Nominatim](https://nominatim.openstreetmap.org/) — Geocoding
- [TwisterData](http://www.twisterdata.com/) — Forecast soundings (embedded)

## References

- [NOAA JetStream — Skew-T Log-P Diagrams](https://www.noaa.gov/jetstream/upperair/skew-t-log-p-diagrams)
- [NWS ZHU Training — Skew-T Parameters](https://www.weather.gov/source/zhu/ZHU_Training_Page/convective_parameters/skewt/skewtinfo.html)
- [COMET/UCAR — Role of the SKYWARN Spotter](https://www.comet.ucar.edu/)

## License

Weather data is provided by NOAA/NWS (public domain). Application code is proprietary.

## Repository

- **GitHub:** [Kn-weather/Skywarn-Storm-Spot-US](https://github.com/Kn-weather/Skywarn-Storm-Spot-US)
- **Live Site:** [https://kn-weather.github.io/Skywarn-Storm-Spot-US/](https://kn-weather.github.io/Skywarn-Storm-Spot-US/)
- **Standalone Soundings:** [https://kn-weather.github.io/Skywarn-Storm-Spot-US/soundings.html](https://kn-weather.github.io/Skywarn-Storm-Spot-US/soundings.html)
