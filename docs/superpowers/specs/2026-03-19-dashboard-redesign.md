# Dashboard Redesign — Design Spec
Date: 2026-03-19

## Overview

Redesign the main dashboard from six hardcoded stat cards to nine live/placeholder tiles with
drag-to-rearrange and click-to-expand. Apply global branding changes (logo rename, nav rename,
centred nav) across all pages.

---

## Files changed

| File | Change |
|---|---|
| `site/style.css` | Nav centring, tile grid, donut, line chart, drag/expand styles |
| `site/dashboard.html` | Full page rewrite — 9-tile grid, live data loading, drag + expand JS |
| `site/crm.html` | Logo text, nav link text |
| `site/index.html` | Logo text, nav link text |
| `scripts/fetch-hubspot.js` | Add `createdate` to PROPERTIES |

---

## Global changes (all pages)

### Logo rename
`CS Analytics` → `PLG Stack` in the `.site-logo` anchor on every page.

### Nav rename
The "PLG Motion" nav link becomes "Dashboard" on every page.

### Nav centring
Currently `.site-header-inner` uses `display: flex; justify-content: space-between`.
Change to CSS grid so the nav is always centred:

```css
.site-header-inner {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
}
```

Logo sits in column 1 (left-aligned), `.site-nav` in column 2 (centred), `.week-pill` in column 3
(`justify-self: end`). The `.week-pill` is removed from `dashboard.html` but stays on other pages —
the grid handles this gracefully (empty third column).

---

## Data changes

### fetch-hubspot.js
Add `'createdate'` to the `PROPERTIES` array. This adds a `createdate` field to each company
object in `hubspot.json`, allowing client-side computation of new signups in the last 30 days.

No other changes to the fetch script.

---

## Dashboard — 9-tile grid

### Layout
```
┌───────────────┬───────────────┬───────────────┐
│  1. Accounts  │  2. Signups   │  3. Tickets   │
│               │               │    (donut)    │
├───────────────┼───────────────┼───────────────┤
│ 4. Needs      │  5. Avg FRT   │  6. Clicks    │
│    action     │   (line)      │   (line)      │
├───────────────┼───────────────┼───────────────┤
│ 7. Linked     │  8. API reqs  │  9. % API     │
│    accounts   │   (line)      │               │
│   (line)      │               │               │
└───────────────┴───────────────┴───────────────┘
```

Responsive breakpoints:
- `≥ 1100px`: 3 columns
- `600–1099px`: 2 columns
- `< 600px`: 1 column

Min tile height: `180px`. Tiles with charts expand to fit.

### Tile HTML structure
```html
<div class="dash-tile" data-tile-id="accounts" draggable="true">
  <div class="dash-tile-header">
    <span class="dash-tile-title">Total PLG accounts</span>
    <span class="dash-tile-source">HubSpot</span>
  </div>
  <div class="dash-tile-body">
    <!-- number, sparkline div, or chart div here -->
  </div>
</div>
```

Each tile has a unique `data-tile-id`. The tile is clickable if it has a `data-href` attribute.

---

## Tile definitions

### Tile 1 — Total PLG accounts
- **Source**: `hubspot.json` (live)
- **Display**: large number (`hubspot.json.length`) + placeholder sparkline (hardcoded 8-week
  series, same style as existing stat cards)
- **Click**: opens `go/plg-customers` in new tab
- **Chart**: ECharts sparkline, brand green (`--so-primary`)

### Tile 2 — New signups last 30 days
- **Source**: `hubspot.json` (live — requires `createdate`)
- **Display**: count of companies where `createdate >= today − 30 days`
- **Click**: none
- **Chart**: ECharts sparkline (hardcoded 8-week series), brand green

### Tile 3 — Open tickets
- **Source**: Pylon (placeholder)
- **Display**: ECharts donut chart with total in centre
- **Categories** (placeholder values): StackOne (5), Customer (4), Engineering (3) — amber / blue / grey
  using brand tokens: `--so-orange-dark`, `--so-blue-dark`, `--so-text-tag`
- **Click**: none
- **Placeholder badge**: none — the chart renders with hardcoded data; the `dash-tile-source`
  label reads "Pylon" with a "Coming soon" indicator next to it

### Tile 4 — Tickets needing action
- **Source**: Pylon (placeholder)
- **Display**: large number (hardcoded: `4`) — same stat-card style
- **Click**: opens `go/plg-issues` in new tab
- **Chart**: none

### Tile 5 — Avg first response
- **Source**: Pylon (placeholder)
- **Display**: value `2.1h` + ECharts week-on-week line (8-point hardcoded series)
- **Click**: opens `https://app.usepylon.com/analytics/dashboard/109ccc44-4072-44f5-8ccb-04db52c933fd`
  in new tab
- **Chart**: ECharts line, `--so-text-tag` colour

### Tile 6 — Avg clicks per customer
- **Source**: PostHog (placeholder)
- **Display**: value `—` + ECharts line (8-point hardcoded series)
- **Chart**: ECharts line, `--so-blue-dark`

### Tile 7 — Avg linked accounts per customer
- **Source**: PostHog (placeholder)
- **Display**: value `—` + ECharts line (8-point hardcoded series)
- **Chart**: ECharts line, `--so-blue-dark`

### Tile 8 — Avg API requests per customer
- **Source**: PostHog (placeholder)
- **Display**: value `—` + ECharts line (8-point hardcoded series)
- **Chart**: ECharts line, `--so-blue-dark`

### Tile 9 — % customers with API requests
- **Source**: PostHog (placeholder)
- **Display**: large number `—`
- **Click**: none
- **Chart**: none

Tiles 6–9 with placeholder source show `(PostHog)` in `.dash-tile-source` — no extra badge
needed; `—` makes the placeholder state self-evident.

---

## Drag to rearrange

- Each `.dash-tile` has `draggable="true"`.
- Events: `dragstart`, `dragover` (prevent default), `drop`.
- On `dragover`: add `.dash-tile--drag-over` to the target tile (CSS: dashed border).
- On `drop`: swap the two tiles in the DOM; save order to localStorage as
  `plg_tile_order` = JSON array of `data-tile-id` values.
- On page load: read `plg_tile_order` from localStorage; if present, reorder tiles in the
  grid to match stored order.
- Touch devices: drag is disabled (no polyfill). Tiles render in default order.

---

## Click to expand

- Clicking a tile (anywhere except links inside it) opens a `<dialog class="dash-expand">`.
- The dialog shows:
  - Tile title (heading)
  - A larger ECharts instance of the tile's chart, or the number if no chart
  - A close button (`×`)
- Click outside the dialog (on `::backdrop`) closes it.
- `ESC` closes it (native `<dialog>` behaviour).
- Tiles 4 and 9 (number-only tiles): the expand shows the number large and nothing else.

---

## Styles

New CSS classes in `style.css`:

- `.dash-grid` — 3-col grid, responsive, `gap: 12px`
- `.dash-tile` — card style matching `.stat-card` (white bg, border, radius-lg, shadow)
- `.dash-tile--dragging` — reduced opacity (0.4) while dragging
- `.dash-tile--drag-over` — dashed brand green border (`--so-primary`)
- `.dash-tile-header` — flex row, title left / source right
- `.dash-tile-title` — body font 14px, `--so-text-header`
- `.dash-tile-source` — tag font 12px, `--so-text-tag`
- `.dash-tile-body` — flex column, padding
- `.dash-tile-value` — heading font 36px, letter-spacing -2px (same as `.stat-value`)
- `.dash-tile-chart` — fixed height `80px` for sparklines; `160px` for line/donut tiles
- `.dash-tile-clickable` — `cursor: pointer` + hover border colour change
- `.dash-expand` — `<dialog>` modal: centred, max-width 640px, white bg, radius-lg, shadow
- `.dash-expand-close` — `×` button, top-right corner

---

## Out of scope

- Live Pylon ticket data
- Live PostHog data
- CRM enhancements (separate spec)
- Useful Links tab (separate spec)
- Tile resize
- Export / CSV
