# Garden Planner – Spec

## Objective

Help Norwegian homeowners plan gardens by loading their parcel/aerial view from GeoNorge, letting them sketch and annotate in 2D, and (later) generating AI design proposals and 3D visuals with “nano banana pro” image-generation.

## Phased Plan

- **Phase 0 – Feasibility**: Validate GeoNorge data access (orthophotos/parcels/buildings), address-to-geometry resolution, usage limits; prototype fetch + display of a static map tile for a test address in Norway.
- **Phase 1 – 2D Planner MVP**: Address lookup → fetch base view → canvas with layers (base imagery, user drawings, object palette) → save/load designs.
- **Phase 2 – AI Design Suggestions**: Send bird’s-eye image + user constraints to nano banana pro; return alternates with overlays.
- **Phase 3 – 3D Preview**: Convert 2D plan to simple 3D scene; optional AI-upscaled render.

## User Roles & Flows

- **Visitor**: Enter address → confirm parcel on map → explore sample designs.
- **Authenticated user (later)**: Same as visitor + save/load/share plans; export images.
- **Flow (MVP)**:
  1. Enter Norwegian address → geocode.
  2. Show parcel/aerial base view centered on property (default zoom).
  3. Layers toggle: imagery / parcel outlines / building footprints.
  4. Draw & annotate: freehand, polygons, text labels, drag-drop objects (trees, beds, patio).
  5. Export current plan to PNG/SVG; optional share link (if auth present).

## Functional Requirements (MVP)

- **Address search**: Norway-specific geocoder; autocomplete; error states when not found.
  -(Possible sources: Kartverket/GeoNorge APIs; needs validation of terms/keys.)
- **Base map retrieval**: Orthophoto tiles or static image for confirmed extent; parcel/building overlays where available.
- **Canvas editor**:
  - Pan/zoom; snap-to-grid toggle; configurable units (meters).
  - Shape tools: rectangle, polygon, circle, line; freehand for soft edges.
  - Styling: fill, stroke, opacity, text labels, icons.
  - Object palette: trees (sizes), hedges, flower beds, lawn, paths, patio, water feature, raised beds, greenhouse, compost, lighting points.
  - Layer management: reorder/lock/hide.
  - Undo/redo; multi-select; delete.
- **Saving**: Local-first (IndexedDB) plus backend project save (if auth later).
- **Export**: PNG/SVG snapshot; include scale bar and north arrow.

## AI Touchpoints

- **Image suggestion (Phase 2)**: Send base bird’s-eye image + vector overlays + constraints (style, budget, maintenance level, sun/shade preferences) to nano banana pro; receive N variants + captions.
- **Prompt structure (draft)**:
  - Inputs: base image, vector mask/regions, textual brief, must-keep features.
  - Outputs: up to 3 styled variants; each returns rendered image + list of changes.
- **Safety**: enforce content policy, rate limits, and retry/backoff.

## Data & Integrations (to validate)

- **GeoNorge**: Public map catalog and APIs for Norwegian geographic data (orthophotos, parcel boundaries, building footprints) per [Geonorge](https://www.geonorge.no/).
- Open questions:
  - Best endpoint for address→geometry (geocoder) and parcel polygons.
  - License/attribution requirements; request volume limits.
  - Tile format: WMS/WMTS vs static export; HTTPS and API key needs.
  - Coordinate system; reproject to Web Mercator for web map.
- **AI (nano banana pro)**: assess input size limits, supported masks, cost model, and latency.

## Non-Functional

- Fast map load (<2s after geocode on broadband); smooth canvas interactions at 60fps on mid-tier laptop.
- Works on desktop first; tablet friendly later.
- Accessibility: keyboard for draw/undo, focus states, color-contrast for overlays.
- Observability: client logging for map/AI errors; feature flags for AI integration.
- Privacy: avoid storing addresses unless user saves a project; redact PII from AI prompts.

## Architecture (proposal)

- **Frontend**: SPA in SolidJS with Leaflet for basemap + SVG overlay for drawing; Vite build.
- **Backend (later)**: Supabase (Postgres + Auth + Storage + Edge Functions). Use edge functions to proxy GeoNorge if keys/rate limits apply and to relay nano banana pro calls.
- **Storage**: IndexedDB for local drafts; Supabase tables for projects/layers; Supabase Storage for exported assets.
- **File exports**: Client-rendered PNG/SVG; optional PDF via backend service.

## GeoNorge API Endpoints (Validated)

### Address Geocoding (FREE & OPEN)
- **Base URL**: `https://ws.geonorge.no/adresser/v1`
- **Search**: `/sok?sok={query}&treffPerSide=10&utkoordsys=4326`
- **Reverse**: `/punktsok?lat={lat}&lon={lon}&radius={m}`
- No authentication required

### WMTS Basemap Tiles (FREE & OPEN)
- **Capabilities**: `https://cache.kartverket.no/v1/wmts/1.0.0/WMTSCapabilities.xml`
- **Layers**: `topo`, `topograatone`, `toporaster`
- Supports EPSG:3857 (Web Mercator)

### Cadastre/Parcel WMS (FREE)
- **URL**: `https://wms.geonorge.no/skwms1/wms.matrikkel`
- **Layers**: `eiendomsgrense` (property boundaries), `eiendoms_id` (property IDs)
- Supports EPSG:3857

### Orthophoto (RESTRICTED - requires Norge digitalt partnership)
- **URL**: `https://wms.geonorge.no/skwms1/wms.nib`
- Public viewing only at norgeibilder.no

### Attribution
- Required: "Kartverket" or "© Kartverket"

## Data Model (MVP sketch)

- `Project`: id, userId (nullable), title, address text, centroid (lat/lng), bounds, createdAt, updatedAt.
- `Layer`: id, projectId, type (shape/object/text/image), geometry (GeoJSON), style JSON, zIndex, locked.
- `Asset`: id, projectId, type (renderedImage/aiSuggestion), url, metadata (prompt, model, seed).

## Milestones & Validation

- M0: Fetch and display parcel + orthophoto for a hardcoded Norwegian address; document GeoNorge terms.
- M1: Address search + base map with overlays + basic drawing + local save/export.
- M2: Object palette + better styling + shareable links (if backend).
- M3: AI suggestion pipeline with prompt schema + UX to compare variants.
- M4: 3D preview (extrude footprints, simple vegetation sprites) + AI upscale.

## Risks / Unknowns

- GeoNorge licensing/rate limits; need attribution and possible API key.
- Coordinate system handling; ensure correct reprojection for drawing accuracy.
- AI input constraints; handling large aerial imagery (may need tiling/cropping).
- Performance on large parcels; need level-of-detail and layer pruning.

## Next Steps (for us)

1. ~~Confirm GeoNorge endpoints, auth, and usage terms; prototype address→parcel fetch.~~ ✅ Done
2. ~~Pick frontend stack~~ ✅ SolidJS + Leaflet + Vite
3. Define prompt format and guardrails for nano banana pro; simulate with placeholder.
4. Implement M0 spike; document lessons and API responses.
