# Bug Fix Log — Skywarn Storm Spotters PWA

This file documents all significant bugs found and fixed during development.

---

## v94 — Radar Boundary Noise Slider Not Working + Zig-Zag Cleanup

**Date:** Aug 9, 2026
**Severity:** High (slider appeared non-functional, boundaries were a zig-zag mess)

### Root Cause
Three bugs combined to make the noise slider appear non-functional:

1. **Hardcoded detection thresholds** — `radarDetectBoundaries()` used hardcoded `GRAD_THRESHOLD=8` and `MIN_BOUNDARY_PIXELS=15` that never changed with the slider.

2. **Confidence formula clustered at 80-100** — `confidence = min(100, avgGrad*5 + linearity*50)`. Since `avgGrad` is typically 8-30 (because GRAD_THRESHOLD=8), `avgGrad*5` = 40-150. So confidence was almost always 80-100 (capped). The slider (0-90) filtered by confidence, but almost everything passed even at slider=90.

3. **`radarScheduleReRender()` didn't re-detect** — It only re-filtered cached boundaries from `radarLastBoundaries` instead of re-running `radarDetectBoundaries()` with new thresholds.

4. **No linearity filter** — Short/non-linear clusters (zig-zags) were rendered because there was no `MIN_LINEARITY` threshold.

5. **Poor polyline simplification** — Just "take every Nth pixel" (`step = floor(pixels.length/20)`) instead of proper Douglas-Peucker smoothing.

### Fix
**Slider now controls real detection thresholds:**
- `GRAD_THRESHOLD`: 8 (slider=0) → 28 (slider=90) dBZ gradient
- `MIN_BOUNDARY_PIXELS`: 10 (slider=0) → 80 (slider=90) pixels
- `MIN_LINEARITY`: 0.0 (slider=0) → 0.65 (slider=90) — filters zig-zag clusters
- `MIN_LENGTH_KM`: 2 (slider=0) → 30 (slider=90) km

**`radarScheduleReRender()` now re-runs `radarDetectBoundaries()`** with the new slider thresholds (not just re-filtering cached results), so the slider actually changes detection sensitivity in real-time.

**Added Douglas-Peucker simplification** (`radarDouglasPeucker` + `radarPerpDistance`) to smooth out zig-zags. Tolerance scales with slider: 0.005° (slider=0) → 0.020° (slider=90), approximately 0.3-1.5 km.

**Fixed confidence formula** to span 0-100 meaningfully:
- `avgGrad*2` (0-60) + `linearity*30` (0-30) + `lengthScore*10` (0-10)
- No longer clustered at 80-100

### Slider Behavior (0-90)
- **0** = most sensitive: lowest thresholds, most boundaries (including noise/zig-zags)
- **40** (default) = balanced: moderate filtering
- **90** = least sensitive: only strong, long, highly-linear boundaries

### Files Changed
- `nws_us_alert_map.html`:
  - `radarDetectBoundaries()`: reads slider, maps to 4 thresholds, adds linearity filter, uses Douglas-Peucker, fixed confidence formula
  - New: `radarDouglasPeucker()` — recursive polyline simplification
  - New: `radarPerpDistance()` — geographic perpendicular distance
  - `radarScheduleReRender()`: now re-runs detection (not just re-filter)
- `sw.js`: Bumped CACHE_NAME to `v94`

---

## v93 — Pixel-Based Blank Frame Detection for Satellite Animation

**Date:** Aug 9, 2026
**Severity:** Medium (visual glitch during satellite animation playback)
**Builds on:** v92 (which added tile error tracking)

### Root Cause
The v92 fix (tile error tracking) only caught frames where tiles returned 404. However, GIBS sometimes serves "blank-looking" tiles that load successfully (HTTP 200) but contain no actual imagery — transparent, uniformly black, or near-uniform fill. These slipped past the error tracker and still caused flashing during animation.

### Fix
Added pixel-based blank detection that mirrors the radar pixel analysis pipeline. The system now uses **two complementary methods**:

1. **Pixel analysis (primary)** — Fetches 4 sample tiles per frame from CONUS center, decodes via canvas `getImageData` (64×64 downsampled, every 4th pixel sampled), and computes a content score:
   - **Non-transparent ratio**: fraction of pixels with alpha > 10
   - **Color variance factor**: 0.5–1.0 based on RGB variance among non-transparent pixels (catches uniform black/gray fill)
   - Final score = non-transparent ratio × variance factor

2. **Loop-relative comparison** — Computes the median content score across all analyzed frames. A frame is "blank" if:
   - Its score is <30% of the loop median (relative threshold), OR
   - Its score is <0.05 (absolute threshold — essentially empty)
   
   This handles edge cases like nighttime visible imagery where ALL frames are dark — the median is low, but no frame is "blank" relative to its peers.

3. **Tile error tracking (fallback)** — The v92 method (>60% tile errors) still runs as a fallback for frames that haven't been pixel-analyzed yet.

### Implementation Details

- **Background analysis**: When a satellite layer activates, all 24 frames are analyzed sequentially with 200ms delays between tile fetches (polite to GIBS). Results cached in `satContentScores[key][timeIdx]`.
- **Cache invalidation**: On 10-minute auto-refresh, the cache for the active key is cleared and re-analyzed (frame timestamps changed).
- **Teardown**: `satStopBackgroundAnalysis()` called on layer teardown to cancel any running analysis.
- **Skip logic**: `satFindNextValidFrame()` checks both pixel analysis cache and live tile error stats to decide whether to skip a frame.

### Why Loop-Wide Comparison Matters
A single-frame analysis can't distinguish "blank" from "legitimately dark" (e.g., nighttime visible, clear-sky IR). By comparing each frame against the loop's median, we only skip frames that deviate significantly from the baseline — not frames that are uniformly dark across the entire loop.

### Thresholds (Tunable)
In `satIsLayerBlank()` and `satFindNextValidFrame()`:
- `0.3` — relative threshold (frame score / median < 0.3 = blank)
- `0.05` — absolute threshold (score < 0.05 = definitely blank)
- `0.6` — tile error fallback (>60% errors = blank)
- `4` — minimum tiles for error-based judgment
- `3` — minimum analyzed frames for median computation

### Files Changed
- `nws_us_alert_map.html`: Added `satAnalyzeFramePixels()`, `satGetContentScore()`, `satIsLayerBlank()` (enhanced), `satComputeLoopMedianScore()`, `satStartBackgroundAnalysis()`, `satStopBackgroundAnalysis()`, `satFindNextValidFrame()` (enhanced). Modified `satActivateLayer()`, `satTeardown()`, and auto-refresh to manage background analysis.
- `sw.js`: Bumped CACHE_NAME to `v93` (triggers PWA update).

---

## v92 — Satellite Animation Flashing on Blank Frames

**Date:** Aug 9, 2026
**Severity:** Medium (visual glitch during satellite animation playback)

### Root Cause
The satellite animation generates 24 theoretical frame times (every 10 min for 4 hours), but NASA GIBS doesn't always have imagery for every timestamp — during satellite scan gaps, maintenance windows, or processing delays, some timestamps return 404 for all tiles. The existing `errorTileUrl: transparentPng` handled 404s gracefully (showing transparent instead of broken-image icons), but the 3-layer rolling buffer would still swap to these "blank" frames during animation, causing visible flashing as the map showed transparent tiles for 500ms before advancing.

### Fix
Added tile load/error tracking to each satellite layer and blank frame skipping during animation:

1. **Tile stats tracking** (`satCreateLayer`): Each layer now has `_satStats = {loaded, errored}` that counts `tileload` and `tileerror` events.
2. **Blank detection** (`satIsLayerBlank`): A frame is "blank" if >60% of tiles errored AND at least 4 tiles were requested (enough data to judge).
3. **Skip-ahead logic** (`satFindNextValidFrame`): During animation, checks if the preloaded next frame is blank and skips ahead to the next valid frame. Wraps around the timeline and returns the start index if all frames are blank (prevents infinite loop).
4. **Animation timer** (`satTogglePlay`): Now calls `satFindNextValidFrame` instead of blindly advancing by 1.
5. **Manual stepping** (`satStep`): Forward steps also skip blanks; backward steps do not (user explicitly stepped back).

### Threshold Rationale
- **>60% error rate**: Catches frames where most tiles failed, but tolerates edge tiles 404ing (areas outside the satellite disk).
- **Minimum 4 tiles**: Prevents false positives when only 1-2 tiles have been requested (not enough data to judge).
- These values can be tuned in `satIsLayerBlank()` if needed.

### Files Changed
- `nws_us_alert_map.html`: Added `_satStats` tracking to `satCreateLayer`, new `satIsLayerBlank()` and `satFindNextValidFrame()` functions, modified `satTogglePlay()` and `satStep()` to skip blanks.
- `sw.js`: Bumped CACHE_NAME to `v92` (triggers PWA update).

---

## v83 — MD Polygon Coordinates in Pacific Ocean

**Date:** Aug 8, 2026
**Commit:** `690790b`
**Severity:** High (MD polygons rendered in wrong location)

### Root Cause
For 8-digit SPC LAT...LON coordinates (format `DDMMDDMM`), the code was adding +100 to the longitude degrees:
```js
// BUG: +100 pushes longitude to -178° (Pacific Ocean)
lonDeg = parseInt(p.substring(4,6)) + 100;
```

The +100 was intended for 9-digit coordinates where the leading "1" in the 5-digit longitude indicates 100°+ west. But for 8-digit coordinates where the longitude is < 100° (no leading "1"), the +100 pushed them to the Pacific Ocean.

### Example
MD 1862 coordinates `39217785`:
- Bug: lat=39.35, lon=-(77+100+85/60) = **-178.42** → Pacific Ocean near Hawaii
- Fix: lat=39.35, lon=-(77+85/60) = **-78.42** → Virginia/Maryland (correct)

### Fix
Removed the `+100` from the 8-digit coordinate parsing in `mdParsePage()`.

### Note
This fix was incomplete — it fixed longitudes < 100°W but broke longitudes >= 100°W (see v91 below). The SPC 8-digit format drops the leading "1" for >= 100°W longitudes, which requires conditional +100 (fixed in v91).

---

## v91 — MD Polygon Longitude for >= 100°W (Conditional +100)

**Date:** Aug 9, 2026
**Commit:** `6eaf109`
**Severity:** High (MD polygons in central US rendered in Atlantic Ocean)

### Root Cause
The v83 fix removed `+100` entirely from 8-digit coordinates. But the SPC format drops the leading "1" from longitudes >= 100°W in 8-digit format, making them look like 4-digit values. Without conditional `+100`, coordinates in the central US (ND, SD, etc. at ~-100 to -104°) were rendered at -1 to -2° (Atlantic Ocean near Africa).

### How It Differs from v83
| Version | +100 Applied To | < 100°W (e.g., Virginia) | >= 100°W (e.g., North Dakota) |
|---------|----------------|--------------------------|-------------------------------|
| Original (pre-v83) | ALL 8-digit | ❌ Pushed to Pacific (-178°) | ❌ Pushed to Pacific (-198°) |
| v83 fix | NONE | ✅ Correct (-78°) | ❌ Atlantic Ocean (-1°) |
| v91 fix | Only when lon < 10° | ✅ Correct (-78°) | ✅ Correct (-101°) |

### The SPC 8-digit Format
The SPC uses 9-digit coordinates (DDMM + DDDMM) where the 5-digit longitude starts with "1" for >= 100°W. In 8-digit format, the leading "1" is **dropped** for >= 100°W longitudes:
- `45389890` → lat=4538, lon=9890 → 98+90/60 = 99.5° → **≥ 10° → no add** → -99.5° (western ND)
- `45610075` → lat=4561, lon=0075 → 00+75/60 = 1.25° → **< 10° → add 100** → -101.25° (central ND)

### Fix
After parsing the 8-digit longitude, if the result is < 10° (Atlantic Ocean), add 100:
```js
if (lon < 10) lon += 100;  // Leading "1" was dropped for >= 100°W
```

### Verified
- MD 1872 (North Dakota): all coordinates in -99 to -102 range ✅
- MD 1862 (Virginia): all coordinates in -75 to -78 range (no add needed) ✅

---

## v82 — MD Polygons Drawn from Expired Discussions

**Date:** Aug 8, 2026
**Commit:** `1cfdbbf`
**Severity:** High (expired MDs drawn as active)

### Root Cause
The SPC MD index page always contains links to recent expired MD pages, even when "No Mesoscale Discussions are currently in effect" is displayed. The code was checking:
```js
if(resp.indexOf('No Mesoscale Discussions')>=0 && mdLinks.length===0)
```

This condition was FALSE when `mdLinks.length > 0` (it found links to expired MDs). The code proceeded to fetch and draw the expired MD.

### Fix
Changed the condition to check for "No Mesoscale Discussions" FIRST, regardless of link count:
```js
if(resp.indexOf('No Mesoscale Discussions')>=0){
  mdLayer.clearLayers();
  if(st)st.textContent='No active MDs';
  return;
}
```

---

## v81 — MD Screenshot Button Used Undefined Variable

**Date:** Aug 8, 2026
**Commit:** `6915feb`
**Severity:** High (crashed entire mdFetch function)

### Root Cause
The screenshot button in the MD popup HTML referenced the `center` variable before it was defined. The popup HTML was built at line 16198, but `center` was only computed at line 16214. This caused a `ReferenceError: center is not defined` that crashed the entire `mdFetch()` function — no MD polygons could render.

### Fix
Moved the `center` computation (`L.latLngBounds + getCenter`) to BEFORE the popup HTML construction, and removed the duplicate definition below.

---

## v77 — Reverted: State Filter Removed from Alerts URL

**Date:** Aug 8, 2026
**Commit:** `f0d6be3`
**Severity:** High (alerts failed to load nationwide)

### Root Cause
Removed the state filter (`?area=STATE`) from the NWS alerts URL to show alerts nationwide. This caused the app to always fetch 200+ nationwide alerts requiring 815 unique UGC zone geometry lookups — overwhelming the NWS API rate limit and crashing with "Error loading alerts".

### Fix
Reverted: restored the state filter for the alerts URL. When a state is selected, only that state's alerts are fetched (small payload, fast). When no state is selected, nationwide alerts are fetched with try-catch around zone geometry resolution.

---

## v76 — Error Loading Alerts (Zone Geometry Crash)

**Date:** Aug 8, 2026
**Commit:** `e5f05a9`
**Severity:** High ("Error loading alerts" on nationwide fetch)

### Root Cause
After removing the state filter, 200+ nationwide alerts required 815 unique UGC zone geometry lookups. The NWS API rate-limited these lookups, causing failures. The zone geometry resolution was NOT wrapped in try-catch, so any failure crashed the entire `fAlertMap()` function.

### Fix
1. Wrapped zone geometry resolution in try-catch (failures are logged, not crashed)
2. Reduced concurrency from 8 to 6 concurrent requests
3. Filtered out test messages from the NWS API response

---

## v75 — Storm ETA Popup Drifted Away from Pin

**Date:** Aug 7, 2026
**Commit:** `92e9e15`
**Severity:** Medium (popup not anchored to clicked point)

### Root Cause
The previous approach (modifying `transform: translate3d()` directly) was overwritten by Leaflet's `_updatePosition` on map move/zoom events, causing the popup to drift away from the pin.

### Fix
Used Leaflet's built-in `offset` option instead of overriding `_updatePosition`:
```js
popup.options.offset = [0, height + 6];
popup.update();
```
Leaflet handles ALL positioning consistently (pan, zoom, animation) using the offset.

---

## v72 — Nearest Town Lookup Spinning Forever

**Date:** Aug 7, 2026
**Commit:** (multiple attempts)

### Root Cause
Nominatim (OpenStreetMap reverse geocoding) does not send CORS headers. The CORS proxy fallbacks (allorigins.win, corsproxy.io) were broken or paid. The spinner never stopped.

### Fix Attempts
1. v65: Routed through fP() CORS proxy — failed (proxies broken)
2. v66: Used NWS /points API instead — partially worked but slow/unreliable
3. v67+: NWS /points API with 5-second timeout via fP() — current approach

### Current Status
NWS /points API is used for reverse geocoding (returns nearest city + state). Has proper CORS headers. 5-second timeout with "unavailable" fallback.

---

## v60 — Storm Motion Label Not Rendering

**Date:** Aug 7, 2026
**Commit:** `ab60db2`
**Severity:** Medium (labels never appeared)

### Root Cause
The label marker code had a syntax error: `[midLat,midLon]` was referencing undefined variables (the marker line had a typo). The JS validated because `midLat`/`midLon` were treated as undefined variable references (valid JS), but at runtime it threw a ReferenceError.

### Fix
Changed `[midLat,midLon]` to `[origin.lat,origin.lon]` and moved the label from the midpoint to the origin (beginning of arrow).

---

## v59 — Pre-existing: Alert Polygon Click During Pick Mode

**Date:** Aug 7, 2026
**Severity:** Low (annoying UX)

### Root Cause
When using the Storm-Safe Navigation pick-on-map feature, clicking on an alert polygon opened the alert popup instead of setting the nav point.

### Fix
Added `navPickMode` check to the alert polygon click handler:
```js
if(typeof navPickMode!=='undefined'&&navPickMode)return;
```

---

## Known Issues (Not Yet Fixed)

1. **NWS API rate limiting on nationwide zone geometry** — When no state is selected, fetching 800+ zone geometries can be slow (10-30s). Mitigated by try-catch + caching.

2. **Radar dBZ color lookup accuracy** — The approximate alpha-based estimation for semi-transparent (edge) pixels may produce some false gradients. Mitigated by confidence threshold and noise filter slider.

3. **Storm ETA reverse geocode** — NWS /points API can be slow (2-5s). 5-second timeout with "unavailable" fallback.

4. **CORS proxies unreliable** — allorigins.win is frequently down, corsproxy.io requires payment. Direct fetch works for CORS-enabled APIs (NWS, SPC, RainViewer). Nominatim-based lookups (journal, nav destination) may fail.
