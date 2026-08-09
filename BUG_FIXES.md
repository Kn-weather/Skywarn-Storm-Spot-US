# Bug Fix Log — Skywarn Storm Spotters PWA

This file documents all significant bugs found and fixed during development.

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
