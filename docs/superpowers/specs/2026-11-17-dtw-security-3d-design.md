# DTW Security in 3D — Design

## Intent

A project page on Brenden's personal site that shows, in an interactive 3D model of Detroit Metro Airport (DTW), how security-checkpoint demand rises and falls through the week, and what staffing would keep waits short. It is a portfolio piece for operations and analytics recruiters: it should prove he can take messy public data, apply queueing ideas from Industrial and Operations Engineering, and present a decision clearly. It must be visually striking and interactive, in the site's calm, neutral style.

## Why DTW

Verified 2026-11-17: TSA publishes hourly passenger throughput per airport and checkpoint as weekly PDFs in its FOIA reading room (`https://www.tsa.gov/foia/readingroom`, 41 listing pages, `?page=N` zero-indexed, newest first). The newest file covers 8–14 November 2026. DTW has two terminals (McNamara, Evans) and several checkpoints; Grand Rapids has one checkpoint area and no reliable wait data.

## Goals

- A 3D model of DTW's terminals, concourses, aprons and runways, built from OpenStreetMap outlines, with one column per security checkpoint whose height is passengers per hour.
- A time control (day of week, hour, play/pause) that animates the columns through a typical week built from the most recent 8 weeks of TSA data.
- Selecting a checkpoint opens a panel: its hourly demand chart for the chosen day, a "lanes open" control, and the estimated wait from a simple queue model.
- One headline finding, stated in a sentence above the model and computed from the data (not written by hand).
- A plain section on method, assumptions and what the data cannot show.
- Works on a phone, by keyboard, with reduced motion, and without WebGL or JavaScript (static fallback).
- A card for the project in "Selected work" on the home page.

## Non-goals

- Live wait-time logging from DTW's website (possible later).
- Simulated walking passengers (a later zoom-in view; see plan Task 8, optional).
- Photorealistic tiles, paid APIs, a build step, or any framework.
- Any claim about actual waits. The model estimates; it does not measure.

## Anti-goals

- Busy or loud. The owner rejected an earlier site version as "way too busy" with "disgusting" colour and asked for neutral colour. The 3D view uses the site's off-white, greys and near-black, with the single blue accent (`--accent`) reserved for data.
- Invented facts. Lane counts, service rates and checkpoint positions that are not in a source are labelled as assumptions or estimates on the page.
- Restaurant framing. This project is about operations and analytics.

## Constraints

- Plain HTML, CSS and JavaScript ES modules, hosted on GitHub Pages; no runtime CDN. Three.js is vendored at a pinned version.
- Lives in `projects/dtw-security/` and reuses `css/site.css` tokens and the `.bar` header used by the other case-study pages.
- Page weight: at most 1.2 MB transferred including Three.js; data files at most 200 KB total.
- Data and map credits on the page: TSA FOIA reading room; "© OpenStreetMap contributors" (ODbL).

## Approaches considered

1. **Three.js with extruded OpenStreetMap outlines (chosen).** Full control of the look, so it can match the neutral site; light; no keys. Costs: we project and extrude geometry ourselves.
2. **MapLibre or deck.gl on a basemap.** Faster to a first picture, but brings a basemap style, tile hosting or a key, and a heavier bundle, and it looks like a map product rather than part of this site.
3. **Google photorealistic 3D tiles.** Most impressive at first glance, but needs a paid key, is heavy, and its colour fights the neutral brief.

The owner asked for a 3D interactive display and delegated the how.

## The model (decided)

- **Demand:** for each checkpoint, the mean passengers per hour for each day of week over the 8 most recent weeks. TSA throughput counts people screened, so in hours when a queue existed it understates demand. The page says so.
- **Queue:** a fluid model, hour by hour. `queue_end = max(0, queue_start + arrivals − lanes × rate)`; `wait_minutes = queue_end / (lanes × rate) × 60`.
- **Rate per lane:** a single assumed figure, default 150 passengers per lane per hour, shown on the page as an assumption with its source, and adjustable.
- **Default lanes:** not published, so the default for each checkpoint is the smallest whole number of lanes that keeps every hour's estimated wait at or under 15 minutes on its busiest day. Labelled "estimated".
- **Checkpoint positions:** placed by hand on the terminal outlines from DTW's public terminal maps, labelled approximate.

## Left to the builder

Camera framing and easing, column shape and material, chart styling, exact copy, and the wording of the headline finding, all within the constraints above.

## Unverified at design time

- That OpenStreetMap has usable polygons for both terminals and the concourses (the Overpass API was at capacity when checked). Plan Task 2 verifies this first and has a fallback.
- The exact column layout of the 2026 TSA PDFs and the exact checkpoint names used for DTW. Plan Task 1 records them.
