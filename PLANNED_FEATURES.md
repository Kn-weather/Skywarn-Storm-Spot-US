# Planned Features — Skywarn Storm Spotters PWA

This document tracks upcoming features, enhancements, and architectural improvements. It consolidates the roadmap from the README with detailed implementation plans for major features.

**Last updated:** Aug 9, 2026 (v97)

---

## Table of Contents

- [Currently In Progress](#currently-in-progress)
- [Short-Term Planned Features](#short-term-planned-features)
- [Medium-Term Planned Features](#medium-term-planned-features)
- [Long-Term Vision](#long-term-vision)
- [Detailed Feature Plans](#detailed-feature-plans)
  - [Outflow Boundary Tracking with Kalman Filters](#outflow-boundary-tracking-with-kalman-filters)
  - [MRMS + HRRR Backend Validation Service](#mrms--hrrr-backend-validation-service)
  - [Real-Time Lightning Layer Enhancement](#real-time-lightning-layer-enhancement)
  - [Push Notifications for Tornado Warnings](#push-notifications-for-tornado-warnings)
  - [Offline Map Tiles for Field Use](#offline-map-tiles-for-field-use)
  - [AI-Assisted Storm Feature Detection](#ai-assisted-storm-feature-detection)

---

## Currently In Progress

- 🔄 **StormCams network integration** — Currently a placeholder tab; needs camera feed integration
- 🔄 **Facebook OAuth verification** — Pending Facebook app review for OAuth provider
- 🔄 **Performance optimization for radar pixel decoding** — Canvas `getImageData` is CPU-intensive on mobile; optimization welcome
- 🔄 **Mobile PWA testing across devices** — iOS Safari PWA quirks need thorough testing

---

## Short-Term Planned Features

- 🔲 **Real-time lightning layer** — Blitzortung integration improvement (currently embedded iframe, move to native layer)
- 🔲 **Watch polygon visualization** — NWS watch areas as distinct overlay
- 🔲 **Model data integration** — HRRR, NAM, GFS model output for forecast comparison
- 🔲 **Push notifications for Tornado Warnings** — Web Push API integration
- 🔲 **Offline map tiles for field use** — Cache basemap tiles for offline operation
- 🔲 **Storm reporting submission to NWS** — In-app submission to NWS spotter reports
- 🔲 **Chase log export** — Export journal entries as PDF or CSV
- 🔲 **Multi-language support** — i18n for non-English users

---

## Medium-Term Planned Features

- 🔲 **Outflow boundary tracking with Kalman filters** — See [detailed plan](#outflow-boundary-tracking-with-kalman-filters)
- 🔲 **MRMS + HRRR backend validation service** — See [detailed plan](#mrms--hrrr-backend-validation-service)
- 🔲 **Boundary motion projection** — Once boundaries are tracked, project +15/+30/+60 min positions (like storm cells)
- 🔲 **Watch + Warning combo view** — Unified severe weather outlook combining SPC watches and NWS warnings
- 🔲 **Enhanced hodograph interactions** — Clickable height markers, storm-relative wind profiles
- 🔲 **Surface observation time-series** — Animated playback of observation changes over the last 6 hours

---

## Long-Term Vision

- 🔲 **Community-driven storm camera network** — User-submitted camera feeds integrated into the StormCams tab
- 🔲 **AI-assisted storm feature detection** — Machine learning on satellite/radar imagery for automated feature identification (shelf clouds, wall clouds, hook echoes)
- 🔲 **Integration with amateur radio spotter networks** — APRS integration for real-time spotter positions
- 🔲 **Training module for new spotters** — Interactive lessons within the app

---

## Detailed Feature Plans

### Outflow Boundary Tracking with Kalman Filters

**Status:** Planned (post-v97)
**Priority:** Medium
**Estimated effort:** 3 phases, ~4-5 days total

#### Background

The current outflow boundary detection (v94-v97) processes each radar frame independently:
- **v94:** Noise slider controls detection thresholds + Douglas-Peucker simplification
- **v95:** Point density slider controls polyline point count
- **v97:** Wind validation cross-references ASOS data to confirm boundaries

There is no link between "boundary in frame N" and "boundary in frame N+1." Each detection starts from scratch, causing:
- Boundaries to flicker between frames (detection noise)
- No motion estimation (can't project arrival times)
- No stable IDs for tracking

#### Why Kalman Filters

Ramer-Douglas-Peucker (RDP) solves a **spatial** problem: "which points matter most for the shape?" It's the right tool for single-frame simplification.

Kalman filters solve a **temporal** problem: "given noisy measurements over time, what's the true state?" They're the right tool for tracking evolving features across frames.

#### Implementation Phases

**Phase 1: Frame-to-Frame Boundary Matching (No Kalman, ~1 day)**

Before adding Kalman complexity, add simple boundary matching across frames — mirroring the existing storm cell tracking pattern (`radarTrackStormMotion`):
- When new boundaries are detected, match each to the nearest boundary from the previous frame (by centroid distance + orientation similarity)
- Assign a stable ID to each tracked boundary
- Show motion arrows on tracked boundaries (like storm cells)
- Track boundary age (how many frames it's persisted)

This gets 80% of the tracking benefit with 20% of the complexity.

**Phase 2: Kalman Smoothing on Tracked Boundaries (~2 days)**

Once boundaries have stable IDs across frames, add a Kalman filter per boundary:
- **State vector:** `[centroidLat, centroidLon, bearing, length, velocityLat, velocityLon]`
- **Prediction:** next frame's position based on velocity
- **Update:** incorporate new detection (weighted by detection confidence)
- **Smoothing:** apply Kalman-corrected centroid to the polyline points

Benefits:
- Eliminates frame-to-frame jitter (boundaries that wiggle slightly between detections)
- Fills gaps when a boundary is briefly missed in one frame
- Provides velocity estimate for motion projection

**Phase 3: Boundary Motion Projection (~1 day)**

Use the Kalman velocity estimate to project +15/+30/+60 min positions — exactly like the storm cell motion arrows:
- Draw motion arrows on tracked boundaries (copying the warning motion arrow pattern)
- Show "gust front arriving at your location in ~25 min" warnings
- Predict convergence with storm cells (boundary meets storm = new development likely)

#### Why Not Add It Now

1. **RDP + wind validation (v97) is working and tested** — single-frame detection is already clean
2. **Kalman tracking requires state management** — frame-to-frame matching, prediction matrices, measurement noise covariance tuning, data association logic
3. **The existing storm cell tracking pattern is a proven template** — better to follow that than build new architecture

#### Files That Will Be Modified

- `index.html`:
  - New: `radarTrackBoundaries(currentBoundaries, prevBoundaries)` — frame-to-frame matching
  - New: `radarBoundaryKalman` state object per tracked boundary
  - Modified: `radarRenderBoundaries()` — render tracked boundaries with stable IDs + motion arrows
  - New: `radarProjectBoundary(boundary, minutes)` — motion projection
- `sw.js`: Cache version bump

---

### MRMS + HRRR Backend Validation Service

**Status:** Planned (future, when backend infrastructure is desired)
**Priority:** Low (current client-side wind validation is sufficient)
**Estimated effort:** ~5-7 days

#### Background

The current wind validation (v97) uses ASOS station data to confirm radar fine-lines. This works well but has limitations:
- ASOS stations are ~30-50 miles apart — can't detect fine-scale wind features
- ASOS updates every ~5 minutes — may miss rapid boundary evolution
- No model-data validation (only observations)

A backend service could ingest high-resolution model data (HRRR 3km) and multi-radar data (MRMS) for denser, more frequent validation.

#### Proposed Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  GitHub Actions  │────▶│  Processing      │────▶│   Supabase      │
│  (every 10 min)  │     │  (Node.js/Python)│     │   PostgreSQL    │
│                  │     │                  │     │                 │
│  Fetch MRMS SHSR │     │  Parse GRIB2     │     │  obs_boundaries │
│  Fetch HRRR U/V  │     │  Detect lines    │     │  table          │
│                  │     │  Validate winds  │     │                 │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                                                          │
                                                          ▼
                                                ┌─────────────────┐
                                                │   PWA Client    │
                                                │   (polls every  │
                                                │    2-5 min)     │
                                                └─────────────────┘
```

#### Data Sources

- **MRMS Seamless Hybrid Scan Reflectivity (SHSR)** — NOAA AWS S3, CONUS ~3500×7000 grid, updated every 2 min
- **HRRR 10m wind fields (U/V components)** — NOAA AWS S3, 3km resolution, updated hourly
- **Processing:** Node.js with `grib2js` library, or AWS Lambda with Python + cfgrib

#### Why It's Low Priority

1. **The PWA architecture is a feature, not a limitation** — documented in the README. Adding a backend dependency for boundaries contradicts the "works when nothing else does" mission.
2. **MRMS data is huge** — processing it server-side adds latency and cost that client-side cross-validation avoids.
3. **GitHub Actions 30-min cadence** is too slow for outflow boundaries, which evolve in 5-10 minute timescales. The client-side approach updates with every radar frame (5 min).
4. **Current client-side validation is already meteorologically sound** — wind convergence + temp/dewpoint gradients are the standard outflow boundary signatures.

#### When to Reconsider

- If ASOS station density proves insufficient in rural areas
- If users need boundary detection in data-sparse regions (mountains, plains)
- If higher-resolution validation becomes critical for safety decisions

---

### Real-Time Lightning Layer Enhancement

**Status:** Planned
**Priority:** Medium

#### Current State

The Lightning Map tab embeds Blitzortung's live map via iframe. This works but:
- No integration with the main polygon map
- Can't layer lightning on top of alerts/radar
- Limited customization (colors, time window)

#### Proposed Enhancement

- Native Blitzortung WebSocket integration (was previously implemented, removed due to mobile connection issues — see commit `02dc734`)
- Lightning strike markers as Leaflet layer on the main map
- Time-window filter (last 5/15/30 min)
- Color-coded by age (red = recent, yellow = older)
- Strike density heatmap option

#### Implementation Notes

- Previous WebSocket approach had mobile reliability issues — consider HTTP polling fallback
- Blitzortung data requires authentication for some endpoints
- Strike data is high-frequency — needs efficient rendering (canvas-based, not DOM markers)

---

### Push Notifications for Tornado Warnings

**Status:** Planned
**Priority:** High (safety-critical)

#### Proposed Implementation

- Web Push API integration (requires service worker update)
- User opt-in for Tornado Warning notifications
- Geofenced notifications (only alert if user's location intersects warning polygon)
- Supabase integration for notification subscription management
- Background sync for offline notification queue

#### Technical Requirements

- VAPID key pair generation
- Service worker push event handler
- Notification permission flow
- Geofencing logic (turf.js polygon intersection)
- Subscription management UI in Settings

---

### Offline Map Tiles for Field Use

**Status:** Planned
**Priority:** Medium (field-use critical)

#### Current State

Basemap tiles (CARTO Voyager) are loaded on-demand from the network. In rural areas with poor connectivity, the basemap disappears when offline.

#### Proposed Implementation

- Service worker cache for basemap tiles within the current viewport
- User-configurable cache size (50-500 MB)
- Pre-cache by state/region (download before a chase)
- Cache eviction by age + size
- Offline indicator in the UI

#### Technical Considerations

- Service worker `fetch` event interception for tile requests
- Cache Storage API for tile persistence
- Storage quota management (browsers limit cache size)
- Map tile indexing for efficient lookup

---

### AI-Assisted Storm Feature Detection

**Status:** Long-term vision
**Priority:** Low (research phase)

#### Proposed Features

- **Hook echo detection** — ML model on radar reflectivity to identify supercell hook echoes
- **Wall cloud / shelf cloud identification** — Computer vision on user-submitted photos
- **MESO detection** — Automated mesocyclone detection from velocity data
- **Storm classification** — Supercell vs. multicell vs. squall line based on reflectivity structure

#### Technical Considerations

- TensorFlow.js for client-side inference (preserves PWA architecture)
- Pre-trained models hosted on GitHub Releases
- Model update mechanism (download new models without app update)
- Privacy: user-submitted photos processed locally, not uploaded

---

## Contributing to Planned Features

If you'd like to work on any of these features:

1. Check the [existing issues](https://github.com/Kn-weather/Skywarn-Storm-Spot-US/issues) to see if it's already being discussed
2. Open a new issue with the feature name and your proposed approach
3. Reference this document (`PLANNED_FEATURES.md`) in your issue
4. Follow the [Contributing guidelines](README.md#contributing) in the README

For complex features (Kalman tracking, MRMS backend, AI detection), please open a discussion issue before starting implementation — we want to align on architecture before code is written.

---

## Change Log

| Date | Change |
|------|--------|
| Aug 9, 2026 | Initial document created — consolidated README roadmap + added Kalman boundary tracking plan + MRMS backend plan |
