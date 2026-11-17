# DTW Security in 3D Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A project page on Brenden's site with an interactive 3D model of Detroit Metro Airport whose checkpoint columns animate through a typical week of TSA passenger data, plus a lanes-versus-wait queue model.

**Architecture:** An offline Python pipeline turns TSA's weekly PDFs and OpenStreetMap outlines into two small static files. The page is plain ES modules: a pure queue model, a Three.js scene, an SVG chart and a small controller that wires them to the controls. No build step, no runtime network calls beyond the page's own files.

**Tech Stack:** Python 3.12 with `pdfplumber`, `requests`, `pytest` (pipeline only); Three.js, vendored and pinned; vanilla JS ES modules; `node --test` for JS unit tests; existing `css/site.css` tokens.

**Spec:** `docs/superpowers/specs/2026-11-17-dtw-security-3d-design.md`

## Who does what (owner's instruction)

Run the main session on Opus. It orchestrates, owns Tasks 5, 6 and 9 (the 3D scene, the page design and the final look), and reviews every subagent result. Delegate, setting `model` on each Agent call:

| Task | Agent | Model |
|---|---|---|
| 1 inspect PDFs, list links, checkpoint names | `scout` | haiku |
| 2 fetch map outlines | `implementer` | sonnet |
| 3 parse and build data | `implementer` | sonnet |
| 4 queue model | `implementer` | sonnet |
| 7 chart | `implementer` | sonnet |
| 10 link check, weight check | `scout` | haiku |

## Global Constraints

- The site lives at the top level of the repository (it was moved out of the old redesign folder on 2026-11-17). Page folder: `projects/dtw-security/`. Work on a new branch off `main`; pushing `main` publishes the live site.
- Plain HTML, CSS, JS ES modules. No framework, no build step, no runtime CDN. Three.js vendored at one pinned version in `projects/dtw-security/vendor/`.
- Colours only from `css/site.css` tokens: `--bg #f5f5f3`, `--surface #ebebe8`, `--ink #141414`, `--muted #5c5c58`, `--accent #1f3a8a` (data only). No gradients, no glow, no other hues.
- Page weight at most 1.2 MB transferred; `data/` at most 200 KB.
- Nothing invented: lane counts, service rate and checkpoint positions are labelled "assumption", "estimated" or "approximate" on the page.
- Credits on the page: "Passenger counts: TSA FOIA reading room" and "Map data © OpenStreetMap contributors".
- Works at 390px and 1440px wide, by keyboard, under `prefers-reduced-motion: reduce`, and without WebGL or JS.
- Commits: only if Brenden has said to commit. If not, skip each commit step and leave the work uncommitted. 
- Downloaded PDFs go in `tools/dtw-security/cache/` (git-ignored), never in ``.

## Review Focus

- A TSA week is missing or a PDF fails to parse: the build uses the weeks it has, prints which were skipped, and fails only under 4 usable weeks. (Task 3)
- A checkpoint has zero passengers for whole hours (closed overnight): columns sit flat and the wait is 0, never `NaN` or `Infinity`. (Task 4)
- The visitor sets lanes to the minimum while demand is high: the queue carries into later hours and the wait is capped for display at "60+ min". (Tasks 4, 6)
- WebGL is unavailable or the context is lost: the static fallback picture and the data table show, and the controls and chart still work. (Task 5)
- A phone in landscape or a 320px-wide screen: no horizontal scroll, and the canvas never traps page scrolling. (Task 6)

---

## File structure

| File | Responsibility |
|---|---|
| `tools/dtw-security/fetch_pdfs.py` | Find and download the newest TSA weekly PDFs |
| `tools/dtw-security/parse_throughput.py` | PDF rows → records for one airport |
| `tools/dtw-security/build_data.py` | Records → `throughput.json` |
| `tools/dtw-security/fetch_osm.py` | OpenStreetMap → `airport.geojson` |
| `tools/dtw-security/checkpoints.json` | Hand-made: TSA checkpoint name → label, terminal, lon, lat |
| `tools/dtw-security/NOTES.md` | What Task 1 found (PDF columns, names, sources) |
| `tools/dtw-security/tests/` | pytest for the parser and builder |
| `projects/dtw-security/index.html` | The page |
| `projects/dtw-security/dtw.css` | Page-only styles |
| `projects/dtw-security/js/queue.js` | Pure queue model |
| `projects/dtw-security/js/scene.js` | Three.js scene |
| `projects/dtw-security/js/chart.js` | SVG hourly chart |
| `projects/dtw-security/js/main.js` | State and wiring |
| `projects/dtw-security/data/throughput.json`, `airport.geojson` | Built data |
| `projects/dtw-security/vendor/three.module.min.js` | Pinned Three.js |
| `tests/dtw-security/queue.test.mjs` | `node --test` for the queue model |

---

### Task 1: Find out what the data really looks like (scout, haiku)

**Files:**
- Create: `tools/dtw-security/NOTES.md`

**Produces:** facts Tasks 3 and 6 depend on.

- [ ] **Step 1:** Open `https://www.tsa.gov/foia/readingroom?page=0` and `?page=1`. Record the PDF URLs for the 8 newest "TSA Throughput" weekly files. File names are not regular (one is `tsa-total-throughput-data-october-11-2026-to-october-17-2026.pdf`), so copy the links, never construct them.
- [ ] **Step 2:** Download the newest PDF to `tools/dtw-security/cache/`. With `pdfplumber`, print page 1's text and `extract_table()` result. Record in NOTES.md: the column names in order, the date and hour formats, how pages repeat headers, and 10 example rows where the airport is `DTW`.
- [ ] **Step 3:** List every distinct checkpoint name for DTW in that file with its weekly passenger total. Record them verbatim.
- [ ] **Step 4:** Find one published figure for passengers screened per lane per hour (TSA, GAO, or an airport planning document). Record the number, the document and the URL. If none is found, say so; the page will then call 150 "an assumption".
- [ ] **Step 5:** Verify: NOTES.md has all four sections with real values, no placeholders.

### Task 2: Airport outlines (implementer, sonnet)

**Files:**
- Create: `tools/dtw-security/fetch_osm.py`, `projects/dtw-security/data/airport.geojson`

**Produces:** `airport.geojson`, a FeatureCollection in WGS84. Every feature has `properties.kind` in `"terminal" | "concourse" | "apron" | "runway" | "taxiway"` and, for terminals and concourses, `properties.name` and `properties.height` (metres). Polygons for all kinds except taxiways (LineString).

- [ ] **Step 1:** Write `fetch_osm.py`. Query Overpass for `aeroway` in `terminal|runway|taxiway|apron` and `building` ways inside bbox `42.19,-83.40,42.24,-83.32`. Try `https://overpass-api.de/api/interpreter`, then `https://overpass.kumi.systems/api/interpreter`, with backoff of 5, 15 and 45 seconds. Send a generic `User-Agent`.
- [ ] **Step 2:** Classify: `aeroway=terminal` named McNamara or Evans (or "North Terminal") → `terminal`; other `aeroway=terminal` or attached buildings → `concourse`. Runways arrive as lines: buffer to a polygon using the `width` tag, default 45 m. Height: `height` tag, else `building:levels × 4`, else 12 for terminals and 8 for concourses.
- [ ] **Step 3:** Simplify with Douglas-Peucker at 2 m tolerance, round coordinates to 6 decimals, write the file.
- [ ] **Step 4:** Verify: `python3 tools/dtw-security/fetch_osm.py` prints counts per kind with at least 2 terminals and 4 runways, and the file is under 120 KB.
- [ ] **Step 5 (fallback, only if terminals are missing):** stop and report to the main session. The main session then traces the two terminals and their concourses by hand from OpenStreetMap's rendered map into the same format and marks the page "outlines simplified".
- [ ] **Step 6:** Commit (see Global Constraints).

### Task 3: TSA PDFs → `throughput.json` (implementer, sonnet)

**Files:**
- Create: `tools/dtw-security/fetch_pdfs.py`, `parse_throughput.py`, `build_data.py`, `checkpoints.json`, `tests/test_parse.py`, `tests/test_build.py`, `tests/fixtures/sample_page.txt`
- Create: `projects/dtw-security/data/throughput.json`
- Modify: `.gitignore` (add `tools/dtw-security/cache/`)

**Consumes:** NOTES.md from Task 1.

**Produces:**
- `parse_rows(lines: list[str], airport: str) -> list[Record]` where `Record = {"date": "YYYY-MM-DD", "hour": int 0–23, "checkpoint": str, "passengers": int}`.
- `build_profile(records: list[Record]) -> dict[str, list[list[float]]]`: checkpoint name → 7 lists (index 0 = Sunday) of 24 mean passengers per hour, rounded to 1 decimal. An hour with no row on a date counts as 0 for that date.
- `throughput.json`:

```json
{
  "generated": "YYYY-MM-DD",
  "weeks": ["YYYY-MM-DD", "..."],
  "ratePerLane": 150,
  "rateSource": {"label": "…", "url": "…"},
  "checkpoints": [
    {"id": "kebab-case", "tsaName": "verbatim", "label": "McNamara main", "terminal": "McNamara", "lon": -83.0, "lat": 42.0}
  ],
  "profile": {"<id>": [[24 numbers], "… 7 days"]},
  "headline": {"checkpointId": "…", "day": 1, "hour": 5, "passengers": 0.0}
}
```

`weeks` holds each week's start date. `headline` is the single busiest checkpoint-day-hour cell.

- [ ] **Step 1: Failing parser test.** Copy 30 real lines from the cached PDF text, including a repeated page header and rows for two airports, into `tests/fixtures/sample_page.txt`.

```python
def test_parse_rows_keeps_only_dtw_and_skips_headers():
    lines = open(FIXTURE).read().splitlines()
    rows = parse_rows(lines, "DTW")
    assert rows, "expected DTW rows"
    assert all(set(r) == {"date", "hour", "checkpoint", "passengers"} for r in rows)
    assert all(0 <= r["hour"] <= 23 and r["passengers"] >= 0 for r in rows)
    assert rows[0] == EXPECTED_FIRST_ROW  # typed by hand from the fixture

def test_parse_rows_handles_thousands_separators():
    assert parse_rows([LINE_WITH_1_234], "DTW")[0]["passengers"] == 1234
```

- [ ] **Step 2:** Run `pytest tools/dtw-security/tests -q`; expect failure (no `parse_rows`).
- [ ] **Step 3:** Implement `parse_rows` in `parse_throughput.py` for the column layout recorded in NOTES.md.
- [ ] **Step 4: Failing builder tests.**

```python
def test_profile_averages_by_weekday_and_fills_missing_hours_with_zero():
    recs = [
        {"date": "2026-11-08", "hour": 5, "checkpoint": "A", "passengers": 100},  # Sunday
        {"date": "2026-11-15", "hour": 5, "checkpoint": "A", "passengers": 300},  # Sunday
        {"date": "2026-11-08", "hour": 6, "checkpoint": "A", "passengers": 50},   # only one of two Sundays
    ]
    p = build_profile(recs)
    assert p["A"][0][5] == 200.0
    assert p["A"][0][6] == 25.0
    assert p["A"][1] == [0.0] * 24

def test_build_fails_under_four_weeks(tmp_path):
    with pytest.raises(SystemExit):
        build(weeks_available=3, out=tmp_path / "t.json")
```

- [ ] **Step 5:** Implement `build_profile` and `build` in `build_data.py`. `build` reads every PDF in the cache, prints one line per week (`ok` or `skipped: <reason>`), and exits non-zero under 4 usable weeks.
- [ ] **Step 6:** Implement `fetch_pdfs.py`: read listing pages `?page=0..2`, take the 8 newest links whose title contains "Throughput", download any not already cached, with a 2-second pause between requests.
- [ ] **Step 7:** Write `checkpoints.json`: one entry per DTW checkpoint name from NOTES.md with `label`, `terminal`, and `lon`/`lat` placed on the terminal outline from DTW's public terminal maps. Add `"approximate": true` to each.
- [ ] **Step 8:** Run `python3 tools/dtw-security/fetch_pdfs.py && python3 tools/dtw-security/build_data.py`. Verify: tests pass; `throughput.json` is under 80 KB; every checkpoint in `profile` has a `checkpoints` entry; the printed weekly DTW total for the newest week matches the sum of that week's rows.
- [ ] **Step 9:** Commit.

### Task 4: Queue model (implementer, sonnet)

**Files:**
- Create: `projects/dtw-security/js/queue.js`, `tests/dtw-security/queue.test.mjs`

**Produces:**
- `simulateDay(arrivals: number[], lanes: number, ratePerLane: number) -> {queue: number[], waitMin: number[], served: number[]}`. Arrays match `arrivals` in length. `lanes` is clamped to at least 1.
- `lanesFor(arrivals: number[], ratePerLane: number, maxWaitMin: number) -> number`: the smallest whole lane count for which every hour's `waitMin` is at most `maxWaitMin`.
- `WAIT_CAP_MIN = 60`.

- [ ] **Step 1: Failing tests.**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { simulateDay, lanesFor } from '../../projects/dtw-security/js/queue.js';

test('queue carries over between hours', () => {
  const r = simulateDay([100, 300, 100], 1, 150);
  assert.deepEqual(r.queue, [0, 150, 100]);
  assert.deepEqual(r.waitMin, [0, 60, 40]);
  assert.deepEqual(r.served, [100, 150, 150]);
});
test('no demand gives zeros, never NaN', () => {
  const r = simulateDay([0, 0], 3, 150);
  assert.deepEqual(r.waitMin, [0, 0]);
});
test('lanes below 1 are treated as 1', () => {
  assert.deepEqual(simulateDay([100], 0, 150), simulateDay([100], 1, 150));
});
test('lanesFor finds the smallest count that meets the target', () => {
  assert.equal(lanesFor([100, 300, 100], 150, 15), 2);
  assert.equal(lanesFor([0, 0], 150, 15), 1);
});
```

- [ ] **Step 2:** Run `node --test tests/dtw-security/`; expect failure.
- [ ] **Step 3:** Implement with the spec's formulas: `queue_end = max(0, queue_start + arrivals − lanes × rate)`, `waitMin = queue_end / (lanes × rate) × 60`, `served = arrivals + queue_start − queue_end`.
- [ ] **Step 4:** Run the tests; expect 4 passing.
- [ ] **Step 5:** Commit.

### Task 5: The 3D scene (main session, Opus)

**Files:**
- Create: `projects/dtw-security/js/scene.js`, `projects/dtw-security/vendor/three.module.min.js`

**Consumes:** `airport.geojson` (Task 2), `checkpoints` from `throughput.json` (Task 3).

**Produces:**
- `createScene(canvas: HTMLCanvasElement, opts: {airport: GeoJSON, checkpoints: Checkpoint[], reducedMotion: boolean}) -> Scene | null`. Returns `null` when WebGL cannot start.
- `Scene.setValues(values: Record<string, number>)`: checkpoint id → 0..1, column height eases to the new value (jumps when `reducedMotion`).
- `Scene.select(id: string | null)`, `Scene.onPick(cb: (id: string | null) => void)`, `Scene.resize()`, `Scene.dispose()`.

- [ ] **Step 1:** Vendor the current stable Three.js ES module build; record its version in a comment at the top of `scene.js`. Check the file is under 750 KB.
- [ ] **Step 2:** Project lon/lat to metres with a local equirectangular projection centred on `42.2124, -83.3534`. Build: a ground plane in `--bg`; aprons and runways as flat shapes in `--surface` and a slightly darker grey; terminals and concourses extruded to `properties.height × 3` (exaggerated so they read from above) in off-white with soft ambient plus one directional light; no textures.
- [ ] **Step 3:** One column per checkpoint at its position: a square prism in `--accent`, height `value × 400 m`, with a small text label sprite. The selected column is `--ink`; others stay `--accent`.
- [ ] **Step 4:** Camera: perspective, looking at the terminal area from the south-east at about 45°. Orbit by drag, zoom by pinch or ctrl-wheel only, so plain scrolling and one-finger vertical swipes scroll the page. Clamp zoom and tilt so the airport never leaves the frame.
- [ ] **Step 5:** Picking by raycast on click or tap; `Escape` clears the selection. Render on demand (only when something changed) to keep phones cool.
- [ ] **Step 6:** Handle `webglcontextlost` by calling the pick callback with `null` and dispatching a `scene-lost` event on the canvas so the page can show the fallback.
- [ ] **Step 7:** Verify in the browser at 1440 and 390 wide with a temporary test page: both terminals and all runways visible, columns respond to `setValues`, page scroll is not trapped, 55+ frames per second while orbiting on desktop.
- [ ] **Step 8:** Commit.

### Task 6: The page and its controls (main session, Opus)

**Files:**
- Create: `projects/dtw-security/index.html`, `dtw.css`, `js/main.js`, `assets/dtw-security-fallback.jpg`

**Consumes:** `createScene` (Task 5), `simulateDay`, `lanesFor`, `WAIT_CAP_MIN` (Task 4), `renderChart` (Task 7), `throughput.json`.

- [ ] **Step 1:** Page structure, top to bottom: the shared `.bar` header copied from `projects/order-check/index.html`; an `h1` "Security at Detroit Metro, hour by hour"; one headline sentence filled from `throughput.json.headline` (for example "The busiest hour of the week is Monday at 5 a.m. at McNamara main: about N passengers"); the stage; method and limits; credits; the shared case-study footer.
- [ ] **Step 2:** The stage: the canvas (height `min(70svh, 44rem)` on desktop, `55svh` on phones) with the controls beneath it, never floating over it:
  - seven day buttons as a radio group, Sunday to Saturday;
  - an hour slider `0–23` with the time shown as "5 a.m.";
  - a Play/Pause button that steps one hour every 700 ms and wraps at the week's end. It does not autoplay, and it is hidden under reduced motion.
- [ ] **Step 3:** The checkpoint panel (beside the canvas on desktop, below it on phones). With nothing selected it lists every checkpoint with its passengers this hour, as buttons, so selection never depends on 3D picking. With one selected: the hourly chart for the chosen day, a "Lanes open" stepper from 1 to 12 starting at `lanesFor(busiestDay, ratePerLane, 15)` labelled "estimated", and the estimated wait this hour, shown as "60+ min" at or above `WAIT_CAP_MIN`.
- [ ] **Step 4:** State lives in `main.js`: `{day, hour, selectedId, lanes: {id: n}}`. One `update()` function pushes state to the scene, panel and chart. Values sent to `setValues` are passengers this hour divided by the week's maximum across all checkpoints.
- [ ] **Step 5:** Fallbacks: the stage starts as a static picture (`dtw-security-fallback.jpg`, a screenshot of the finished scene) with a data table of each checkpoint's busiest hour. `main.js` swaps in the canvas only when `createScene` returns a scene, and swaps back on `scene-lost`.
- [ ] **Step 6:** "Method and limits" copy, in plain sentences: where the counts come from and which weeks; that counts are people screened, so busy hours understate demand; the rate per lane and its source or "assumption"; that lane defaults are estimated and positions approximate; that waits are estimates, not measurements.
- [ ] **Step 7:** Accessibility: every control is a native element with a label; the hour slider has `aria-valuetext`; the wait readout is `aria-live="polite"`; visible focus; tap targets at least 44 px.
- [ ] **Step 8:** Verify in the Browser pane at 1440, 768, 390 and 320 wide: no horizontal scroll, controls work by keyboard alone, the page scrolls with a finger on the canvas, reduced motion hides Play and stops easing, and with JavaScript off the picture and table show.
- [ ] **Step 9:** Commit.

### Task 7: Hourly chart (implementer, sonnet)

**Files:**
- Create: `projects/dtw-security/js/chart.js`

**Produces:** `renderChart(svg: SVGSVGElement, data: {arrivals: number[24], capacity: number, hour: number})`. Idempotent: calling it again redraws in place.

- [ ] **Step 1:** Draw 24 bars of arrivals in `--muted`, the current hour's bar in `--accent`, a horizontal capacity line in `--ink` labelled "capacity with N lanes", and the hours where arrivals exceed capacity shaded in `--surface`. X labels at 12 a.m., 6 a.m., noon, 6 p.m. Y axis with three ticks.
- [ ] **Step 2:** Set `role="img"` and an `aria-label` that states the peak hour and whether demand exceeds capacity.
- [ ] **Step 3:** Verify: a temporary HTML page calling `renderChart` with `arrivals` of 24 ascending numbers and `capacity` 12 shows bars 13–23 shaded and one accent bar; resizing the container keeps it sharp (use `viewBox`).
- [ ] **Step 4:** Commit.

### Task 8 (optional, only if Brenden asks): passenger dots

Zoom into the selected checkpoint and show simulated travellers queuing at the hourly rates from `simulateDay`. Not part of this plan's done state. Write a short plan of its own before starting.

### Task 9: Home page card and visual pass (main session, Opus)

**Files:**
- Modify: `index.html` (Selected work), `css/site.css` only if a new rule is unavoidable
- Create: `assets/dtw-security-card.jpg`

- [ ] **Step 1:** Add the project as the first `article.project` in Selected work, using the existing markup pattern: a screenshot of the scene at its most striking hour as the shot, title "Security at Detroit Metro", meta "Personal project · 2026", two sentences (what it shows; the finding), tags "TSA data · Queue model · Three.js", link "Open the 3D model".
- [ ] **Step 2:** Add the page to both existing case-study footers' "Next project" chain so the three pages link in a loop.
- [ ] **Step 3:** Look at the page in the Browser pane at 1440 and 390 and fix what looks unfinished: spacing against the other case-study pages, type sizes from the site scale, column proportions, label collisions.
- [ ] **Step 4:** Commit.

### Task 10: Final checks (scout, haiku; then main session)

- [ ] **Step 1 (scout):** With the preview server running, request every link and asset on the new page and the home page; report any non-200. Report transferred bytes for the new page (limit 1.2 MB) and the size of `data/` (limit 200 KB).
- [ ] **Step 2 (scout):** Run `pytest tools/dtw-security/tests -q` and `node --test tests/dtw-security/`; report the output.
- [ ] **Step 3 (main):** Check each Review Focus line by hand and each Global Constraint. Confirm the two credits are on the page and every assumption is labelled.
- [ ] **Step 4 (main):** Tell Brenden what was built, what is estimated or approximate, and which checkpoint positions he should confirm from his own knowledge of the airport.
