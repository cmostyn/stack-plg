# Dashboard Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 6-card hardcoded dashboard with a 9-tile dynamic grid; apply global branding changes (logo, nav text, nav centring) across all pages.

**Architecture:** Static HTML/CSS/JS — no build step, no framework. All data pre-fetched into `site/data/*.json` by Node.js scripts; the browser reads JSON files and renders with ECharts. Tile order persisted in localStorage.

**Tech Stack:** HTML5, CSS custom properties, vanilla JS, Apache ECharts 5 (CDN), HTML5 Drag and Drop API, `<dialog>` element.

---

### Task 1: Global branding — logo, nav text, nav centring

**Files:**
- Modify: `site/dashboard.html`
- Modify: `site/crm.html`
- Modify: `site/index.html`
- Modify: `site/style.css`

No automated tests — verify by opening each page in a browser.

- [ ] **Step 1: Update logo text in all three HTML files**

In `site/dashboard.html`, `site/crm.html`, and `site/index.html`, find:
```html
CS Analytics
```
Replace with:
```html
PLG Stack
```
(There is one occurrence per file, inside `.site-logo`.)

- [ ] **Step 2: Update nav link text in all three HTML files**

In all three files, find:
```html
PLG Motion
```
Replace with:
```html
Dashboard
```

- [ ] **Step 3: Centre the nav in style.css**

Find:
```css
.site-header-inner {
  max-width: 1400px;
  margin: 0 auto;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
```
Replace with:
```css
.site-header-inner {
  max-width: 1400px;
  margin: 0 auto;
  height: 56px;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
}
```

Then add after the `.site-header-inner` block:
```css
.site-header-inner .week-pill {
  justify-self: end;
}
```

- [ ] **Step 4: Verify in browser**

Open `site/dashboard.html`, `site/crm.html`, and `site/index.html` in a browser.
Expected:
- Logo reads "PLG Stack" on all pages
- Nav link reads "Dashboard" (active on dashboard.html)
- Nav tabs are visually centred between logo and week-pill

- [ ] **Step 5: Commit**

```bash
git add site/dashboard.html site/crm.html site/index.html site/style.css
git commit -m "feat: rename logo to PLG Stack, nav to Dashboard, centre nav"
```

---

### Task 2: Add createdate to HubSpot fetch

**Files:**
- Modify: `scripts/fetch-hubspot.js`

- [ ] **Step 1: Add createdate to PROPERTIES array**

In `scripts/fetch-hubspot.js`, find:
```js
const PROPERTIES = ['name', 'domain', 'type', 'org_id', 'notes', 'tier', 'welcome_email_sent'];
```
Replace with:
```js
const PROPERTIES = ['name', 'domain', 'type', 'org_id', 'notes', 'tier', 'welcome_email_sent', 'createdate'];
```

- [ ] **Step 2: Expose createdate in company mapping**

In the `companies` mapping inside `main()`, find:
```js
    welcome_email_sent: c.properties.welcome_email_sent === 'true',
    type:               c.properties.type ?? null,
```
Add after `type`:
```js
    createdate:         c.properties.createdate ?? null,
```

- [ ] **Step 3: Run the fetch script to regenerate hubspot.json**

Before running: ensure `.env` has `STACKONE_API_KEY` and `STACKONE_HUBSPOT_ACCOUNT_ID`.

```bash
node scripts/fetch-hubspot.js
```
Expected: `[hubspot] Written to site/data/hubspot.json`

- [ ] **Step 4: Verify output**

```bash
node -e "const d=require('./site/data/hubspot.json'); console.log(d[0].createdate, d.length);"
```
Expected: a date string (e.g. `2024-06-12T10:30:00.000Z`) and a count (~55).

- [ ] **Step 5: Commit**

```bash
git add scripts/fetch-hubspot.js site/data/hubspot.json
git commit -m "feat: add createdate to hubspot fetch and data"
```

---

### Task 3: Dashboard HTML structure and CSS

**Files:**
- Modify: `site/dashboard.html` — replace pulse section with dash grid
- Modify: `site/style.css` — add tile grid + tile card styles

- [ ] **Step 1: Add tile grid CSS to style.css**

Append to `site/style.css`:
```css
/* ============================================================
   Dashboard Tiles
   ============================================================ */

.dash-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

@media (max-width: 1099px) {
  .dash-grid { grid-template-columns: repeat(2, 1fr); }
}

@media (max-width: 599px) {
  .dash-grid { grid-template-columns: 1fr; }
}

.dash-tile {
  background: var(--so-white);
  border: 1px solid var(--so-neutral-10);
  border-radius: var(--so-radius-lg);
  box-shadow: var(--so-shadow-card);
  padding: 20px;
  display: flex;
  flex-direction: column;
  min-height: 180px;
  transition: border-color 0.15s;
  position: relative;
}

.dash-tile--clickable {
  cursor: pointer;
}

.dash-tile--clickable:hover {
  border-color: var(--so-neutral-20);
}

.dash-tile--dragging {
  opacity: 0.4;
}

.dash-tile--drag-over {
  border: 2px dashed var(--so-primary);
}

.dash-tile-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.dash-tile-title {
  font-family: var(--so-font-body);
  font-size: 13px;
  color: var(--so-text-tag);
  line-height: 1.4;
}

.dash-tile-source {
  font-family: var(--so-font-tag);
  font-size: 11px;
  color: var(--so-neutral-40);
  white-space: nowrap;
  flex-shrink: 0;
}

.dash-tile-body {
  display: flex;
  flex-direction: column;
  flex: 1;
}

.dash-tile-value {
  font-family: var(--so-font-heading);
  font-size: 36px;
  font-weight: 400;
  line-height: 1.1;
  letter-spacing: -2px;
  color: var(--so-text-header);
  margin-bottom: 4px;
}

.dash-tile-chart {
  width: 100%;
  flex: 1;
  min-height: 80px;
}

.dash-tile-chart--donut {
  min-height: 140px;
}

.dash-tile-chart--line {
  min-height: 100px;
}

/* ============================================================
   Expand Dialog
   ============================================================ */

.dash-expand {
  border: 1px solid var(--so-neutral-10);
  border-radius: var(--so-radius-lg);
  box-shadow: 0 8px 32px rgba(0,0,0,0.12);
  padding: 28px;
  width: min(640px, 90vw);
  max-height: 80vh;
  overflow: auto;
}

.dash-expand::backdrop {
  background: rgba(0,0,0,0.3);
}

.dash-expand-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
}

.dash-expand-title {
  font-family: var(--so-font-heading);
  font-size: 20px;
  font-weight: 400;
  letter-spacing: -0.5px;
  color: var(--so-text-header);
}

.dash-expand-close {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 20px;
  color: var(--so-text-tag);
  line-height: 1;
  padding: 4px 8px;
  border-radius: var(--so-radius-sm);
  transition: background 0.12s;
}

.dash-expand-close:hover {
  background: var(--so-foreground);
  color: var(--so-text-header);
}

.dash-expand-chart {
  width: 100%;
  height: 280px;
}

.dash-expand-value {
  font-family: var(--so-font-heading);
  font-size: 64px;
  font-weight: 400;
  letter-spacing: -4px;
  color: var(--so-text-header);
  text-align: center;
  padding: 32px 0;
}
```

- [ ] **Step 2: Replace the dashboard page content**

Replace the entire `<main>` section of `site/dashboard.html` and its `<script>` block with the
new 9-tile structure. Remove the `<span class="week-pill">` from the header (it's dashboard-specific
and clutters the centred-nav layout — omit it from dashboard.html only).

New `<main>` content:
```html
  <main class="page-main">
    <div class="dash-grid" id="dashGrid">

      <!-- Tile 1: Total PLG accounts -->
      <div class="dash-tile dash-tile--clickable" data-tile-id="accounts" data-href="http://go/plg-customers" draggable="true">
        <div class="dash-tile-header">
          <span class="dash-tile-title">Total PLG accounts</span>
          <span class="dash-tile-source">HubSpot</span>
        </div>
        <div class="dash-tile-body">
          <div class="dash-tile-value" id="val-accounts">—</div>
          <div class="dash-tile-chart" id="chart-accounts"></div>
        </div>
      </div>

      <!-- Tile 2: New signups last 30 days -->
      <div class="dash-tile" data-tile-id="signups" draggable="true">
        <div class="dash-tile-header">
          <span class="dash-tile-title">New signups last 30 days</span>
          <span class="dash-tile-source">HubSpot</span>
        </div>
        <div class="dash-tile-body">
          <div class="dash-tile-value" id="val-signups">—</div>
          <div class="dash-tile-chart" id="chart-signups"></div>
        </div>
      </div>

      <!-- Tile 3: Open tickets (donut) -->
      <div class="dash-tile" data-tile-id="tickets" draggable="true">
        <div class="dash-tile-header">
          <span class="dash-tile-title">Open tickets</span>
          <span class="dash-tile-source">Pylon</span>
        </div>
        <div class="dash-tile-body">
          <div class="dash-tile-chart dash-tile-chart--donut" id="chart-tickets"></div>
        </div>
      </div>

      <!-- Tile 4: Tickets needing action -->
      <div class="dash-tile dash-tile--clickable" data-tile-id="action" data-href="http://go/plg-issues" draggable="true">
        <div class="dash-tile-header">
          <span class="dash-tile-title">Tickets needing action</span>
          <span class="dash-tile-source">Pylon</span>
        </div>
        <div class="dash-tile-body">
          <div class="dash-tile-value">4</div>
        </div>
      </div>

      <!-- Tile 5: Avg first response -->
      <div class="dash-tile dash-tile--clickable" data-tile-id="frt" data-href="https://app.usepylon.com/analytics/dashboard/109ccc44-4072-44f5-8ccb-04db52c933fd" draggable="true">
        <div class="dash-tile-header">
          <span class="dash-tile-title">Avg first response</span>
          <span class="dash-tile-source">Pylon</span>
        </div>
        <div class="dash-tile-body">
          <div class="dash-tile-value">2.1h</div>
          <div class="dash-tile-chart dash-tile-chart--line" id="chart-frt"></div>
        </div>
      </div>

      <!-- Tile 6: Avg clicks per customer -->
      <div class="dash-tile" data-tile-id="clicks" draggable="true">
        <div class="dash-tile-header">
          <span class="dash-tile-title">Avg clicks per customer</span>
          <span class="dash-tile-source">PostHog</span>
        </div>
        <div class="dash-tile-body">
          <div class="dash-tile-value">—</div>
          <div class="dash-tile-chart dash-tile-chart--line" id="chart-clicks"></div>
        </div>
      </div>

      <!-- Tile 7: Avg linked accounts per customer -->
      <div class="dash-tile" data-tile-id="linked" draggable="true">
        <div class="dash-tile-header">
          <span class="dash-tile-title">Avg linked accounts per customer</span>
          <span class="dash-tile-source">PostHog</span>
        </div>
        <div class="dash-tile-body">
          <div class="dash-tile-value">—</div>
          <div class="dash-tile-chart dash-tile-chart--line" id="chart-linked"></div>
        </div>
      </div>

      <!-- Tile 8: Avg API requests per customer -->
      <div class="dash-tile" data-tile-id="apireqs" draggable="true">
        <div class="dash-tile-header">
          <span class="dash-tile-title">Avg API requests per customer</span>
          <span class="dash-tile-source">PostHog</span>
        </div>
        <div class="dash-tile-body">
          <div class="dash-tile-value">—</div>
          <div class="dash-tile-chart dash-tile-chart--line" id="chart-apireqs"></div>
        </div>
      </div>

      <!-- Tile 9: % customers with API requests -->
      <div class="dash-tile" data-tile-id="pctapi" draggable="true">
        <div class="dash-tile-header">
          <span class="dash-tile-title">% customers with API requests</span>
          <span class="dash-tile-source">PostHog</span>
        </div>
        <div class="dash-tile-body">
          <div class="dash-tile-value">—</div>
        </div>
      </div>

    </div>
  </main>

  <!-- Expand dialog -->
  <dialog class="dash-expand" id="dashExpand">
    <div class="dash-expand-header">
      <span class="dash-expand-title" id="expandTitle"></span>
      <button class="dash-expand-close" id="expandClose" aria-label="Close">×</button>
    </div>
    <div id="expandBody"></div>
  </dialog>
```

Also remove the `<span class="week-pill">Week of 18 March 2026</span>` from the header in
`dashboard.html`.

- [ ] **Step 3: Verify structure in browser**

Open `site/dashboard.html`. Expected:
- 9 tiles visible in a 3-column grid (on wide screen)
- Tiles show `—` values (no data loaded yet)
- Header shows "PLG Stack" logo, "Dashboard" active nav link, nav centred

- [ ] **Step 4: Commit**

```bash
git add site/dashboard.html site/style.css
git commit -m "feat: dashboard tile grid structure and CSS"
```

---

### Task 4: Live data tiles — accounts and signups

**Files:**
- Modify: `site/dashboard.html` — add `<script>` block

- [ ] **Step 1: Add the data + chart script to dashboard.html**

Add before `</body>` in `site/dashboard.html`:
```html
  <script src="https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js"></script>
  <script>
    // ── Helpers ──────────────────────────────────────────────
    function sparkline(el, series, color) {
      const chart = echarts.init(el, null, { renderer: 'canvas' });
      chart.setOption({
        animation: true,
        grid: { top: 0, right: 0, bottom: 0, left: 0, containLabel: false },
        xAxis: { type: 'category', show: false, data: series.map((_,i)=>`W${i+1}`), boundaryGap: false },
        yAxis: {
          type: 'value', show: false,
          min: v => Math.max(0, v.min - (v.max - v.min) * 0.3),
          max: v => v.max + (v.max - v.min) * 0.15,
        },
        series: [{
          type: 'line', data: series, smooth: 0.4, symbol: 'none',
          lineStyle: { color, width: 1.5 },
          areaStyle: { color: { type:'linear', x:0,y:0,x2:0,y2:1, colorStops:[
            { offset:0, color: color+'28' }, { offset:1, color: color+'00' }
          ]}},
        }],
      });
      window.addEventListener('resize', () => chart.resize());
      return chart;
    }

    // ── Load HubSpot data ─────────────────────────────────────
    fetch('./data/hubspot.json')
      .then(r => r.json())
      .then(companies => {
        // Tile 1 — Total accounts
        document.getElementById('val-accounts').textContent = companies.length;
        sparkline(
          document.getElementById('chart-accounts'),
          [45,47,48,49,50,52,52, companies.length], // last point is live
          '#00AF66'
        );

        // Tile 2 — New signups last 30 days
        const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
        const recent = companies.filter(c => c.createdate && new Date(c.createdate).getTime() >= cutoff).length;
        document.getElementById('val-signups').textContent = recent;
        sparkline(
          document.getElementById('chart-signups'),
          [3,5,4,6,5,7,6, recent], // last point is live
          '#00AF66'
        );
      })
      .catch(() => {
        document.getElementById('val-accounts').textContent = '—';
        document.getElementById('val-signups').textContent = '—';
      });
  </script>
```

- [ ] **Step 2: Verify in browser**

Open `site/dashboard.html`. Expected:
- Tile 1 shows a number (~55) with a green sparkline ending at that value
- Tile 2 shows the count of companies created in the last 30 days with a green sparkline
- No console errors

- [ ] **Step 3: Commit**

```bash
git add site/dashboard.html
git commit -m "feat: live account and signup counts from hubspot.json"
```

---

### Task 5: Placeholder charts — tickets donut, FRT line, PostHog lines

**Files:**
- Modify: `site/dashboard.html` — extend `<script>` block

- [ ] **Step 1: Add placeholder chart initialisation**

Inside the `<script>` block, after the `fetch()` block, add the placeholder charts.
These run unconditionally (not inside the fetch callback) since they use hardcoded data:

```js
    // ── Tile 3 — Open tickets donut (Pylon placeholder) ──────
    (function() {
      const chart = echarts.init(document.getElementById('chart-tickets'), null, { renderer: 'canvas' });
      const total = 12;
      chart.setOption({
        animation: true,
        tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
        legend: { show: false },
        graphic: [{
          type: 'text',
          left: 'center', top: 'center',
          style: { text: String(total), font: 'bold 28px Geist, sans-serif', fill: '#222121' },
        }],
        series: [{
          type: 'pie',
          radius: ['50%', '75%'],
          avoidLabelOverlap: false,
          label: { show: false },
          data: [
            { value: 5, name: 'StackOne',    itemStyle: { color: '#96580A' } },
            { value: 4, name: 'Customer',    itemStyle: { color: '#0C58AE' } },
            { value: 3, name: 'Engineering', itemStyle: { color: '#7A7A7A' } },
          ],
        }],
      });
      window.addEventListener('resize', () => chart.resize());
    })();

    // ── Tile 5 — Avg first response line (Pylon placeholder) ─
    sparkline(
      document.getElementById('chart-frt'),
      [3.2, 2.8, 3.1, 2.9, 2.7, 2.5, 2.5, 2.1],
      '#7A7A7A'
    );

    // ── Tiles 6–8 — PostHog lines (placeholder) ──────────────
    sparkline(document.getElementById('chart-clicks'),  [12,14,13,15,14,16,15,17], '#0C58AE');
    sparkline(document.getElementById('chart-linked'),  [1.2,1.4,1.3,1.5,1.4,1.6,1.5,1.7], '#0C58AE');
    sparkline(document.getElementById('chart-apireqs'), [800,950,900,1100,1050,1200,1150,1300], '#0C58AE');
```

- [ ] **Step 2: Verify in browser**

Open `site/dashboard.html`. Expected:
- Tile 3 shows a donut chart (StackOne amber / Customer blue / Engineering grey) with `12` in the centre
- Tile 5 shows `2.1h` and a grey declining line chart
- Tiles 6–8 show `—` and blue rising line charts
- Tile 9 shows `—` (no chart — correct)
- No console errors

- [ ] **Step 3: Commit**

```bash
git add site/dashboard.html
git commit -m "feat: placeholder charts for tickets, FRT, and PostHog tiles"
```

---

### Task 6: Drag to rearrange tiles

**Files:**
- Modify: `site/dashboard.html` — extend `<script>` block

- [ ] **Step 1: Add drag-to-rearrange JS**

Add inside the `<script>` block:
```js
    // ── Drag to rearrange ─────────────────────────────────────
    const STORAGE_KEY = 'plg_tile_order';
    const grid = document.getElementById('dashGrid');

    function saveTileOrder() {
      const ids = [...grid.querySelectorAll('.dash-tile')].map(t => t.dataset.tileId);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
    }

    function applyStoredOrder() {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return;
      try {
        const ids = JSON.parse(stored);
        ids.forEach(id => {
          const tile = grid.querySelector(`[data-tile-id="${id}"]`);
          if (tile) grid.appendChild(tile);
        });
      } catch {}
    }

    let dragSrc = null;

    grid.addEventListener('dragstart', e => {
      const tile = e.target.closest('.dash-tile');
      if (!tile) return;
      dragSrc = tile;
      tile.classList.add('dash-tile--dragging');
    });

    grid.addEventListener('dragend', e => {
      const tile = e.target.closest('.dash-tile');
      if (tile) tile.classList.remove('dash-tile--dragging');
      grid.querySelectorAll('.dash-tile--drag-over').forEach(t => t.classList.remove('dash-tile--drag-over'));
    });

    grid.addEventListener('dragover', e => {
      e.preventDefault();
      const tile = e.target.closest('.dash-tile');
      if (!tile || tile === dragSrc) return;
      grid.querySelectorAll('.dash-tile--drag-over').forEach(t => t.classList.remove('dash-tile--drag-over'));
      tile.classList.add('dash-tile--drag-over');
    });

    grid.addEventListener('drop', e => {
      e.preventDefault();
      const target = e.target.closest('.dash-tile');
      if (!target || !dragSrc || target === dragSrc) return;
      target.classList.remove('dash-tile--drag-over');

      // Swap positions
      const allTiles = [...grid.querySelectorAll('.dash-tile')];
      const srcIdx = allTiles.indexOf(dragSrc);
      const tgtIdx = allTiles.indexOf(target);
      if (srcIdx < tgtIdx) {
        grid.insertBefore(dragSrc, target.nextSibling);
      } else {
        grid.insertBefore(dragSrc, target);
      }
      saveTileOrder();
    });

    // Apply stored order on load (after charts are initialised)
    applyStoredOrder();
```

- [ ] **Step 2: Verify in browser**

Open `site/dashboard.html`. Expected:
- Can drag a tile and drop it onto another — they swap positions
- After reload, order is preserved
- Dragging shows the tile at 40% opacity; drop target shows dashed green border

- [ ] **Step 3: Commit**

```bash
git add site/dashboard.html
git commit -m "feat: drag-to-rearrange tiles with localStorage persistence"
```

---

### Task 7: Click to expand tiles

**Files:**
- Modify: `site/dashboard.html` — extend `<script>` block

- [ ] **Step 1: Add expand dialog JS**

Add inside the `<script>` block:
```js
    // ── Click to expand ───────────────────────────────────────
    const dialog  = document.getElementById('dashExpand');
    const expandTitle = document.getElementById('expandTitle');
    const expandBody  = document.getElementById('expandBody');
    let expandChart   = null;

    function closeDashExpand() {
      dialog.close();
      if (expandChart) { expandChart.dispose(); expandChart = null; }
      expandBody.innerHTML = '';
    }

    document.getElementById('expandClose').addEventListener('click', closeDashExpand);

    dialog.addEventListener('click', e => {
      // Close on backdrop click
      if (e.target === dialog) closeDashExpand();
    });

    // Tile data map: tileId → { title, type, series, color, value }
    const TILE_DATA = {
      accounts: { title: 'Total PLG accounts',               type: 'sparkline', color: '#00AF66' },
      signups:  { title: 'New signups last 30 days',         type: 'sparkline', color: '#00AF66' },
      tickets:  { title: 'Open tickets',                     type: 'donut'                       },
      action:   { title: 'Tickets needing action',           type: 'number',   value: '4'        },
      frt:      { title: 'Avg first response',               type: 'sparkline', color: '#7A7A7A',
                  series: [3.2,2.8,3.1,2.9,2.7,2.5,2.5,2.1]                                     },
      clicks:   { title: 'Avg clicks per customer',          type: 'sparkline', color: '#0C58AE',
                  series: [12,14,13,15,14,16,15,17]                                              },
      linked:   { title: 'Avg linked accounts per customer', type: 'sparkline', color: '#0C58AE',
                  series: [1.2,1.4,1.3,1.5,1.4,1.6,1.5,1.7]                                     },
      apireqs:  { title: 'Avg API requests per customer',    type: 'sparkline', color: '#0C58AE',
                  series: [800,950,900,1100,1050,1200,1150,1300]                                 },
      pctapi:   { title: '% customers with API requests',    type: 'number',   value: '—'        },
    };

    // Store live series for tiles 1 and 2 after fetch resolves
    const liveExpandData = {};

    grid.addEventListener('click', e => {
      // Don't expand if clicking a link inside the tile
      if (e.target.tagName === 'A') return;

      const tile = e.target.closest('.dash-tile');
      if (!tile) return;
      const id = tile.dataset.tileId;

      // Handle clickable tiles that navigate externally
      const href = tile.dataset.href;

      const td = TILE_DATA[id];
      if (!td) return;
      expandTitle.textContent = td.title;
      expandBody.innerHTML = '';

      if (td.type === 'number') {
        const div = document.createElement('div');
        div.className = 'dash-expand-value';
        div.textContent = liveExpandData[id] ?? td.value ?? '—';
        expandBody.appendChild(div);
      } else if (td.type === 'sparkline') {
        const series = liveExpandData[id] ?? td.series ?? [];
        const div = document.createElement('div');
        div.className = 'dash-expand-chart';
        expandBody.appendChild(div);
        expandChart = echarts.init(div, null, { renderer: 'canvas' });
        expandChart.setOption({
          animation: true,
          grid: { top: 8, right: 8, bottom: 24, left: 40, containLabel: false },
          xAxis: { type: 'category', data: series.map((_,i)=>`W${i+1}`), boundaryGap: false,
                   axisLine: { lineStyle: { color: '#E0DEDC' } },
                   axisLabel: { color: '#7A7A7A', fontSize: 11 } },
          yAxis: { type: 'value', axisLine: { show: false }, splitLine: { lineStyle: { color: '#EBE9E7' } },
                   axisLabel: { color: '#7A7A7A', fontSize: 11 } },
          series: [{ type:'line', data: series, smooth:0.4, symbol:'circle', symbolSize:4,
                     lineStyle: { color: td.color, width:2 },
                     itemStyle: { color: td.color },
                     areaStyle: { color: { type:'linear',x:0,y:0,x2:0,y2:1, colorStops:[
                       {offset:0,color:td.color+'28'},{offset:1,color:td.color+'00'}
                     ]}},
                   }],
        });
      } else if (td.type === 'donut') {
        const div = document.createElement('div');
        div.className = 'dash-expand-chart';
        expandBody.appendChild(div);
        expandChart = echarts.init(div, null, { renderer: 'canvas' });
        expandChart.setOption({
          animation: true,
          tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
          legend: { bottom: 0, textStyle: { color: '#4C4B4B', fontSize: 12 } },
          graphic: [{ type:'text', left:'center', top:'center',
            style: { text: '12', font: 'bold 36px Geist, sans-serif', fill:'#222121' } }],
          series: [{ type:'pie', radius:['50%','72%'], avoidLabelOverlap:false,
            label: { show:false },
            data: [
              { value:5, name:'StackOne',    itemStyle:{color:'#96580A'} },
              { value:4, name:'Customer',    itemStyle:{color:'#0C58AE'} },
              { value:3, name:'Engineering', itemStyle:{color:'#7A7A7A'} },
            ],
          }],
        });
      }

      dialog.showModal();
    });
```

Then, inside the `fetch()` `.then()` callback, after setting tile values, add:
```js
        // Store live series for expand dialog
        liveExpandData['accounts'] = [45,47,48,49,50,52,52, companies.length];
        liveExpandData['signups']  = [3,5,4,6,5,7,6, recent];
```

- [ ] **Step 2: Verify in browser**

Click each tile. Expected:
- A modal dialog opens with the tile's title and a larger chart or number
- For tiles 1–2: sparklines show with axes
- For tile 3: donut with legend
- For tiles 4, 9: large number display
- Click outside the dialog or press ESC closes it
- `×` button closes it
- No console errors

- [ ] **Step 3: Commit**

```bash
git add site/dashboard.html
git commit -m "feat: click-to-expand tiles with dialog and larger charts"
```

---

### Task 8: Tile click navigation (external links)

The tiles with `data-href` should open the link in a new tab when clicked, but only if the click
wasn't on a drag-start (to avoid opening links when the user intended to drag).

**Files:**
- Modify: `site/dashboard.html` — update the grid click handler

- [ ] **Step 1: Add navigation to the grid click handler**

The current click handler in Task 7 already reads `tile.dataset.href`. Update it so clicking a
`data-href` tile opens the URL instead of the expand dialog. Replace the `const href = tile.dataset.href;` line and the code that follows it with:

```js
      // Clickable tiles with href → navigate, don't expand
      if (href) {
        window.open(href, '_blank', 'noopener');
        return;
      }
```

(This replaces the `const href = ...` line and the empty line after it — insert the if block
immediately after reading href.)

- [ ] **Step 2: Verify in browser**

- Click tile 1 (Total PLG accounts) → opens `go/plg-customers` in new tab
- Click tile 4 (Tickets needing action) → opens `go/plg-issues` in new tab
- Click tile 5 (Avg first response) → opens Pylon dashboard in new tab
- Click tile 2 (New signups) → opens expand dialog (no href)
- Click tile 3 (Open tickets) → opens expand dialog

- [ ] **Step 3: Commit**

```bash
git add site/dashboard.html
git commit -m "feat: clickable tiles open external links in new tab"
```

---

## Final verification

Before calling this branch ready for review:

1. Open `site/dashboard.html` — all 9 tiles visible, tiles 1 and 2 show real numbers
2. Open `site/crm.html` — logo "PLG Stack", "Dashboard" nav link, "CRM" active
3. Open `site/index.html` — same branding
4. Check responsive layout at 1099px and 599px breakpoints
5. Drag tiles, reload — order preserved
6. Click every tile — navigate or expand as expected
7. No `console.error` output anywhere
