# Changelog

All notable changes to the Skywarn Storm Spotters PWA are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html) for release tags.

App versions correspond to the `CACHE_NAME` in `sw.js` (e.g., `skywarn-us-v97` = v97). Versions before v91 were not explicitly tracked in the app but are reconstructed here from commit history.

**Live Site:** [https://kn-weather.github.io/Skywarn-Storm-Spot-US/](https://kn-weather.github.io/Skywarn-Storm-Spot-US/)

---

## [v97] — 2026-08-09

### Added
- **Wind-validated outflow boundary detection** — Cross-references radar fine-lines against nearby ASOS wind/temp/dewpoint data to confirm which lines are true outflow boundaries. Zero new API calls (uses existing surface obs data). ([`49e18789`](https://github.com/Kn-weather/Skywarn-Storm-Spot-US/commit/49e187890dadfa521cceaf085faf21fbb973a266))
- "Show only wind-confirmed boundaries" checkbox filter
- Validation details in boundary popups (stations checked, wind convergence, temp/dewpoint gradients, match count)
- Visual distinction: wind-confirmed boundaries get bright cyan solid glow, unvalidated get dim dashed

---

## [v96] — 2026-08-09

### Added
- **Time frame selector for radar cell motion arrows** (15/30/60 min dropdown) — matches the warning motion arrows pattern. ([`79bec742`](https://github.com/Kn-weather/Skywarn-Storm-Spot-US/commit/79bec7420d362372859f68877dd005267a805541))
- **Arrowheads on radar cell motion arrows** — solid shaft + arrowhead (was dashed with no head)
- Projected position circles now adapt to selected time frame (e.g., 60 min → +20/+40/+60 min circles)

### Changed
- Default noise filter: 40 → 35
- Default point density: 50% → 1% (straight lines by default)

---

## [v95] — 2026-08-09

### Added
- **Point density slider** (1-100%) for boundary line simplification — budget-based Douglas-Peucker that keeps the most important points first. ([`3246722b`](https://github.com/Kn-weather/Skywarn-Storm-Spot-US/commit/3246722b4fbd70c4e2d9fc60ba3c18d57757a9f1))
  - 1% = straight line (start→end), 100% = all detected points
  - Points added from middle outward as slider increases

---

## [v94] — 2026-08-09

### Fixed
- **Radar boundary noise slider not working** — slider now controls 4 real detection thresholds (was hardcoded). ([`167132e5`](https://github.com/Kn-weather/Skywarn-Storm-Spot-US/commit/167132e5916ec7e55ac744f6511b7efa1c72b2ba))
- **Zig-zag boundary cleanup** — added linearity filter (PCA eigenvalue ratio) + Douglas-Peucker simplification
- Confidence formula fixed (was clustered at 80-100, now spans 0-100 meaningfully)
- `radarScheduleReRender()` now re-runs detection (was just re-filtering cached results)

---

## [v93] — 2026-08-09

### Added
- **Pixel-based blank frame detection** for satellite animation — mirrors the radar pixel analysis pipeline. ([`95b444bc`](https://github.com/Kn-weather/Skywarn-Storm-Spot-US/commit/95b444bc04dee8ba50e10b6b5b5c3a4983750ffb))
- Loop-wide median comparison (handles consecutive blanks + legitimately dark frames like nighttime visible)
- Background analysis of all 24 frames with caching per (layerKey, timeIdx)

---

## [v92] — 2026-08-09

### Fixed
- **Satellite animation flashing on blank frames** — GIBS time gaps caused transparent frames to flash during animation. ([`85daf3b1`](https://github.com/Kn-weather/Skywarn-Storm-Spot-US/commit/85daf3b1bc90ff81ec0815204e8cfcbe785e2551))
- Added tile load/error tracking per layer
- Skip-ahead logic in animation timer (skips frames with >60% tile errors)

---

## [v91] — 2026-08-09

### Major Release — First Tagged Release

This was the first version with a GitHub release tag. See the [v91 release notes](https://github.com/Kn-weather/Skywarn-Storm-Spot-US/releases/tag/v91) for the full feature list.

### Added — Marquee Features
- **Storm-Safe Navigation** — driving routes that avoid active storm cells and warning polygons with predictive avoidance ([`f197221`](https://github.com/Kn-weather/Skywarn-Storm-Spot-US/commit/f197221))
- **Radar Storm Cell Detection** — client-side radar processing pipeline with motion tracking ([`bcea21d`](https://github.com/Kn-weather/Skywarn-Storm-Spot-US/commit/bcea21d), [`f5055f4`](https://github.com/Kn-weather/Skywarn-Storm-Spot-US/commit/f5055f4))
- **Satellite Layers (NASA GIBS)** — GOES-East/West ABI imagery with 24-frame animation ([`0232b27`](https://github.com/Kn-weather/Skywarn-Storm-Spot-US/commit/0232b27))
- **SPC Mesoscale Discussions** — MD polygons with full discussion text ([`5e37be0`](https://github.com/Kn-weather/Skywarn-Storm-Spot-US/commit/5e37be0))
- **Outflow Boundary Detection (ASOS-based)** — detects surface boundaries from observation gradients ([`19db701`](https://github.com/Kn-weather/Skywarn-Storm-Spot-US/commit/19db701))
- **Surface Observations + IDW Gradient Heatmap** ([`828503f`](https://github.com/Kn-weather/Skywarn-Storm-Spot-US/commit/828503f))
- **Warnings Motion Direction + Storm ETA** ([`244e819`](https://github.com/Kn-weather/Skywarn-Storm-Spot-US/commit/244e819))
- **Skew-T / Log-P Soundings** with hodograph ([`b1520ef`](https://github.com/Kn-weather/Skywarn-Storm-Spot-US/commit/b1520ef))
- **Spotting Journal** with Supabase backend ([`2226b8a`](https://github.com/Kn-weather/Skywarn-Storm-Spot-US/commit/2226b8a))
- **Screenshot system** — per-popup screenshots with 3-panel layout ([`b6b3d35`](https://github.com/Kn-weather/Skywarn-Storm-Spot-US/commit/b6b3d35))

### Added — Other Features
- App version display + update notification in Settings ([`6605d77`](https://github.com/Kn-weather/Skywarn-Storm-Spot-US/commit/6605d77))
- SPC tornado/hail/wind probability layers ([`1ca686e`](https://github.com/Kn-weather/Skywarn-Storm-Spot-US/commit/1ca686e))
- Share buttons (Facebook, Discord, native share) ([`2811468`](https://github.com/Kn-weather/Skywarn-Storm-Spot-US/commit/2811468))
- Collapsible Layers panel with persisted state ([`bc18dd7`](https://github.com/Kn-weather/Skywarn-Storm-Spot-US/commit/bc18dd7))
- Delta update for alerts (only add/remove changed) ([`4cf825b`](https://github.com/Kn-weather/Skywarn-Storm-Spot-US/commit/4cf825b))
- dBZ radar legend bar ([`aa7cde9`](https://github.com/Kn-weather/Skywarn-Storm-Spot-US/commit/aa7cde9))
- Google OAuth + Facebook OAuth for journal ([`c924694`](https://github.com/Kn-weather/Skywarn-Storm-Spot-US/commit/c924694), [`e00ac1d`](https://github.com/Kn-weather/Skywarn-Storm-Spot-US/commit/e00ac1d))
- GitHub Actions cron for 24/7 observation collection ([`b8bd6d7`](https://github.com/Kn-weather/Skywarn-Storm-Spot-US/commit/b8bd6d7))
- Supabase Edge Function for observation collection ([`415fce4`](https://github.com/Kn-weather/Skywarn-Storm-Spot-US/commit/415fce4))
- Tornado Tracker Mode ([`bfe5dd6`](https://github.com/Kn-weather/Skywarn-Storm-Spot-US/commit/bfe5dd6))

### Fixed
- MD polygon longitude parsing for ≥ 100°W (conditional +100) ([`6eaf109`](https://github.com/Kn-weather/Skywarn-Storm-Spot-US/commit/6eaf109))
- MD polygon coordinates in Pacific Ocean (v83 fix, [`690790b`](https://github.com/Kn-weather/Skywarn-Storm-Spot-US/commit/690790b))
- MD polygons drawn from expired discussions ([`1cfdbbf`](https://github.com/Kn-weather/Skywarn-Storm-Spot-US/commit/1cfdbbf))
- Alert loading errors — zone geometry crash ([`e5f05a9`](https://github.com/Kn-weather/Skywarn-Storm-Spot-US/commit/e5f05a9))
- Storm ETA popup positioning — drop pin at clicked point ([`ff6a69b`](https://github.com/Kn-weather/Skywarn-Storm-Spot-US/commit/ff6a69b))
- NWS /points API for reverse geocoding (CORS-friendly) ([`2663e4f`](https://github.com/Kn-weather/Skywarn-Storm-Spot-US/commit/2663e4f))
- Radar zoom error: maxNativeZoom 10→7 (RainViewer free tier) ([`f732159`](https://github.com/Kn-weather/Skywarn-Storm-Spot-US/commit/f732159))

---

## [v83] — 2026-08-08

### Fixed
- **MD polygon coordinates in Pacific Ocean** — 8-digit SPC LAT...LON coordinates were getting +100 added to longitude, pushing them to -178° (Pacific). Removed the blanket +100. ([`690790b`](https://github.com/Kn-weather/Skywarn-Storm-Spot-US/commit/690790b))

---

## [v82] — 2026-08-08

### Fixed
- **MD polygons drawn from expired discussions** — when no active MDs existed, the code was rendering polygons from expired discussions. ([`1cfdbbf`](https://github.com/Kn-weather/Skywarn-Storm-Spot-US/commit/1cfdbbf))

---

## [v81] — 2026-08-08

### Fixed
- MD screenshot button used undefined variable

---

## [v77] — 2026-08-08

### Fixed
- **Reverted: state filter removed from alerts URL** — restoring the state filter for NWS alert polygons after it caused performance issues. ([`f0d6be3`](https://github.com/Kn-weather/Skywarn-Storm-Spot-US/commit/f0d6be3))

---

## [v76] — 2026-08-08

### Fixed
- **Error loading alerts — zone geometry crash** — fixed a crash when zone geometry was null or malformed. ([`e5f05a9`](https://github.com/Kn-weather/Skywarn-Storm-Spot-US/commit/e5f05a9))

---

## [v75] — 2026-08-07

### Fixed
- **Storm ETA popup drifted away from pin** — popup now stays anchored to the clicked point during map pan/zoom. ([`92e9e15`](https://github.com/Kn-weather/Skywarn-Storm-Spot-US/commit/92e9e15))

---

## [v72] — 2026-08-07

### Fixed
- **Nearest town lookup spinning forever** — added 5-second timeout on reverse geocode.

---

## [v60] — 2026-08-06

### Fixed
- Storm motion label not rendering

---

## [v59] — 2026-08-06

### Fixed
- Alert polygon click during pick mode

---

## Early Development (Pre-v59)

These versions were not explicitly tracked. The following major features were added during initial development:

### Added — Core App
- Initial commit ([`57cbc27`](https://github.com/Kn-weather/Skywarn-Storm-Spot-US/commit/57cbc27))
- PWA setup: manifest, service worker, offline support ([`bda90bb`](https://github.com/Kn-weather/Skywarn-Storm-Spot-US/commit/bda90bb))
- Live NWS alert polygons with delta updates
- RainViewer radar overlay with 3-layer rolling buffer animation
- CARTO Voyager basemap (light gray for screenshot readability) ([`4916665`](https://github.com/Kn-weather/Skywarn-Storm-Spot-US/commit/4916665))

### Added — Tabs
- **Weather Feeds tab** — SPC PDS, WPC, NHC RSS feeds ([`530405e`](https://github.com/Kn-weather/Skywarn-Storm-Spot-US/commit/530405e), [`b47151f`](https://github.com/Kn-weather/Skywarn-Storm-Spot-US/commit/b47151f))
- **Lightning Map tab** — Blitzortung real-time lightning ([`b9a304d`](https://github.com/Kn-weather/Skywarn-Storm-Spot-US/commit/b9a304d))
- **Spotter Safety tab** — ACES concept from COMET/UCAR ([`8445dd1`](https://github.com/Kn-weather/Skywarn-Storm-Spot-US/commit/8445dd1))
- **Reference Library tab** — 68 SKYWARN meteorological terms ([`ec680d7`](https://github.com/Kn-weather/Skywarn-Storm-Spot-US/commit/ec680d7))
- **mPING Reports** layer (later moved to dedicated tab) ([`831bd39`](https://github.com/Kn-weather/Skywarn-Storm-Spot-US/commit/831bd39))

### Added — SPC Features
- SPC convective outlooks (Day 1-3 categorical)
- SPC tornado/hail/wind probability layers ([`1ca686e`](https://github.com/Kn-weather/Skywarn-Storm-Spot-US/commit/1ca686e))
- Prev/next arrows for overlapping SPC outlook polygons ([`103ccec`](https://github.com/Kn-weather/Skywarn-Storm-Spot-US/commit/103ccec))

### Added — Screenshot System
- Per-alert screenshot button ([`b6b3d35`](https://github.com/Kn-weather/Skywarn-Storm-Spot-US/commit/b6b3d35))
- 3-panel alert screenshot layout ([`155f4a7`](https://github.com/Kn-weather/Skywarn-Storm-Spot-US/commit/155f4a7))
- Screenshot footer branding ([`a49210f`](https://github.com/Kn-weather/Skywarn-Storm-Spot-US/commit/a49210f))
- Share to Facebook/Discord/native share ([`2811468`](https://github.com/Kn-weather/Skywarn-Storm-Spot-US/commit/2811468))

### Added — UI/UX
- Active Alerts legend with counter ([`84dd6c1`](https://github.com/Kn-weather/Skywarn-Storm-Spot-US/commit/84dd6c1))
- Collapsible Layers panel sections ([`bc18dd7`](https://github.com/Kn-weather/Skywarn-Storm-Spot-US/commit/bc18dd7))
- Hard refresh / app update menu option ([`c6dd582`](https://github.com/Kn-weather/Skywarn-Storm-Spot-US/commit/c6dd582))
- Site Settings tab with console log ([`f2d2da5`](https://github.com/Kn-weather/Skywarn-Storm-Spot-US/commit/f2d2da5))
- Alert sounds for Tornado Warning/Watch

---

## Repository Metadata

- **GitHub:** [Kn-weather/Skywarn-Storm-Spot-US](https://github.com/Kn-weather/Skywarn-Storm-Spot-US)
- **Live Site:** [https://kn-weather.github.io/Skywarn-Storm-Spot-US/](https://kn-weather.github.io/Skywarn-Storm-Spot-US/)
- **Releases:** [https://github.com/Kn-weather/Skywarn-Storm-Spot-US/releases](https://github.com/Kn-weather/Skywarn-Storm-Spot-US/releases)
- **Bug Fix Log:** [BUG_FIXES.md](BUG_FIXES.md) — detailed root cause analysis for each fix
- **Planned Features:** [PLANNED_FEATURES.md](PLANNED_FEATURES.md) — roadmap with implementation plans

---

## Changelog Format

- **Added** — new features
- **Changed** — changes to existing functionality
- **Deprecated** — soon-to-be removed features
- **Removed** — now removed features
- **Fixed** — bug fixes
- **Security** — vulnerability fixes

Commit links point to the full diff on GitHub: `https://github.com/Kn-weather/Skywarn-Storm-Spot-US/commit/<sha>`
