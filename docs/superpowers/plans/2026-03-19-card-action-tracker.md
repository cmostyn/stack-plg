# Card & Action Tracker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a customer card popup to the CRM table and a Cloudflare-backed CS action tracker per customer.

**Architecture:** A Cloudflare Worker + D1 database stores CS actions. On page load, all actions are fetched once and stored in `actionsMap` (keyed by HubSpot ID). The CRM table name cell gets a ⊞ button to open a two-column card modal; the CS actions column shows open-action pills and an inline "+ Add" popover. The existing Fireflies script is updated to fetch per-transcript action items and store them per call (not per company).

**Tech Stack:** Vanilla JS, HTML, CSS — no framework or build step. Cloudflare Worker (ES modules), D1 (SQLite). `wrangler` CLI for Worker deployment.

---

## File Map

| File | Status | Purpose |
|------|--------|---------|
| `worker/wrangler.toml` | Create | Worker config + D1 binding |
| `worker/schema.sql` | Create | D1 table definition |
| `worker/index.js` | Create | 4-endpoint CRUD Worker |
| `scripts/fetch-fireflies.js` | Modify | Add per-transcript action item fetch |
| `site/data/fireflies.json` | Regenerate | New shape: one entry per call with `action_items` |
| `site/style.css` | Modify | Append card modal + action item CSS (after line 1214) |
| `site/crm.html` | Modify | State, init, CELLS, card modal, CRUD, popover |

---

## Task 1: Worker scaffold

**Files:**
- Create: `worker/wrangler.toml`
- Create: `worker/schema.sql`

Prerequisites: `wrangler` CLI must be installed (`npm install -g wrangler`) and you must be logged in (`wrangler login`).

- [ ] **Step 1: Create worker/ directory**

```bash
mkdir -p /Users/mostyn/Documents/stack-plg/worker
```

- [ ] **Step 2: Create wrangler.toml**

Create `worker/wrangler.toml` with this content (leave `database_id` as the placeholder — it gets filled in step 4):

```toml
name = "stack-plg-actions"
main = "index.js"
compatibility_date = "2024-01-01"

[[d1_databases]]
binding = "DB"
database_name = "stack-plg-actions"
database_id = "REPLACE_AFTER_CREATE"
```

- [ ] **Step 3: Create schema.sql**

Create `worker/schema.sql`:

```sql
CREATE TABLE IF NOT EXISTS cs_actions (
  id          TEXT PRIMARY KEY,
  hubspot_id  TEXT NOT NULL,
  name        TEXT NOT NULL,
  priority    TEXT NOT NULL CHECK(priority IN ('high', 'med', 'low')),
  done        INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);
```

- [ ] **Step 4: Create the D1 database**

Run from `worker/`:
```bash
cd /Users/mostyn/Documents/stack-plg/worker
wrangler d1 create stack-plg-actions
```

This prints output like:
```
✅ Successfully created DB 'stack-plg-actions'
[[d1_databases]]
binding = "DB"
database_name = "stack-plg-actions"
database_id = "abc123-real-id-here"
```

Copy the `database_id` value and replace `REPLACE_AFTER_CREATE` in `wrangler.toml`.

- [ ] **Step 5: Apply schema locally**

```bash
wrangler d1 execute stack-plg-actions --local --file=schema.sql
```

Expected: `🌀 Executing on local database...` with no errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/mostyn/Documents/stack-plg
git add worker/wrangler.toml worker/schema.sql
git commit -m "feat: add cloudflare worker scaffold for cs actions"
```

---

## Task 2: Worker CRUD endpoints

**Files:**
- Create: `worker/index.js`

- [ ] **Step 1: Create worker/index.js**

```js
export default {
  async fetch(request, env) {
    const url      = new URL(request.url);
    const pathname = url.pathname;

    const corsHeaders = {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const json = (data, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    try {
      // GET /actions
      if (request.method === 'GET' && pathname === '/actions') {
        const { results } = await env.DB
          .prepare('SELECT * FROM cs_actions ORDER BY created_at DESC')
          .all();
        return json(results);
      }

      // POST /actions
      if (request.method === 'POST' && pathname === '/actions') {
        const body = await request.json();
        const { hubspot_id, name, priority } = body ?? {};
        if (!hubspot_id || !name || !priority) {
          return json({ error: 'Missing required fields: hubspot_id, name, priority' }, 400);
        }
        const id         = crypto.randomUUID();
        const created_at = new Date().toISOString();
        await env.DB
          .prepare('INSERT INTO cs_actions (id, hubspot_id, name, priority, done, created_at) VALUES (?, ?, ?, ?, 0, ?)')
          .bind(id, String(hubspot_id), name, priority, created_at)
          .run();
        return json({ id, hubspot_id: String(hubspot_id), name, priority, done: 0, created_at }, 201);
      }

      // PATCH /actions/:id
      const idMatch = pathname.match(/^\/actions\/([^/]+)$/);
      if (request.method === 'PATCH' && idMatch) {
        const id   = idMatch[1];
        const body = await request.json();
        const sets = [];
        const vals = [];
        if ('name'     in body) { sets.push('name = ?');     vals.push(body.name); }
        if ('priority' in body) { sets.push('priority = ?'); vals.push(body.priority); }
        if ('done'     in body) { sets.push('done = ?');     vals.push(body.done ? 1 : 0); }
        if (sets.length === 0) return json({ error: 'No fields to update' }, 400);
        vals.push(id);
        await env.DB
          .prepare(`UPDATE cs_actions SET ${sets.join(', ')} WHERE id = ?`)
          .bind(...vals)
          .run();
        const { results } = await env.DB
          .prepare('SELECT * FROM cs_actions WHERE id = ?')
          .bind(id)
          .all();
        if (!results.length) return json({ error: 'Not found' }, 404);
        return json(results[0]);
      }

      // DELETE /actions/:id
      if (request.method === 'DELETE' && idMatch) {
        const id = idMatch[1];
        await env.DB
          .prepare('DELETE FROM cs_actions WHERE id = ?')
          .bind(id)
          .run();
        return new Response(null, { status: 204, headers: corsHeaders });
      }

      return json({ error: 'Not found' }, 404);
    } catch (e) {
      return json({ error: e.message }, 500);
    }
  },
};
```

- [ ] **Step 2: Start local dev server**

```bash
cd /Users/mostyn/Documents/stack-plg/worker
wrangler dev
```

Expected: `⎔ Starting local server... Listening on http://localhost:8787`

Leave this running in a separate terminal tab.

- [ ] **Step 3: Smoke test GET (empty)**

```bash
curl http://localhost:8787/actions
```

Expected: `[]`

- [ ] **Step 4: Smoke test POST**

```bash
curl -X POST http://localhost:8787/actions \
  -H 'Content-Type: application/json' \
  -d '{"hubspot_id":"12345","name":"Send proposal","priority":"high"}'
```

Expected: JSON with `id`, `hubspot_id`, `name`, `priority: "high"`, `done: 0`, `created_at`.

- [ ] **Step 5: Smoke test GET (with data)**

```bash
curl http://localhost:8787/actions
```

Expected: array with the one action you just created.

- [ ] **Step 6: Smoke test PATCH (mark done)**

Use the `id` from step 4:
```bash
curl -X PATCH http://localhost:8787/actions/<id> \
  -H 'Content-Type: application/json' \
  -d '{"done":1}'
```

Expected: action JSON with `done: 1`.

- [ ] **Step 7: Smoke test DELETE**

```bash
curl -X DELETE http://localhost:8787/actions/<id>
```

Expected: 204 No Content (empty response body).

- [ ] **Step 8: Verify GET is empty again**

```bash
curl http://localhost:8787/actions
```

Expected: `[]`

- [ ] **Step 9: Stop wrangler dev (Ctrl+C) and commit**

```bash
cd /Users/mostyn/Documents/stack-plg
git add worker/index.js
git commit -m "feat: worker crud endpoints for cs actions"
```

---

## Task 3: Deploy Worker and set WORKER_URL

**Files:**
- Modify: `site/crm.html` (add WORKER_URL constant)

- [ ] **Step 1: Apply schema to remote D1**

```bash
cd /Users/mostyn/Documents/stack-plg/worker
wrangler d1 execute stack-plg-actions --file=schema.sql
```

Expected: `🌀 Executing on remote database...` with no errors.

- [ ] **Step 2: Deploy the Worker**

```bash
wrangler deploy
```

Expected output includes a line like:
```
Published stack-plg-actions (1.23 sec)
  https://stack-plg-actions.<your-account>.workers.dev
```

Note the Worker URL.

- [ ] **Step 3: Smoke test deployed Worker**

```bash
curl https://stack-plg-actions.<your-account>.workers.dev/actions
```

Expected: `[]`

- [ ] **Step 4: Add WORKER_URL constant to crm.html**

In `site/crm.html`, find the `<script>` tag that starts with `// --- Constants ---` (around line 51). Add the `WORKER_URL` constant as the very first line inside the script block:

```js
// --- Constants ---
const WORKER_URL = 'https://stack-plg-actions.<your-account>.workers.dev';
```

Replace `<your-account>` with your actual Cloudflare account subdomain from the deployed URL.

- [ ] **Step 5: Commit**

```bash
cd /Users/mostyn/Documents/stack-plg
git add site/crm.html
git commit -m "feat: deploy worker and set worker url"
```

---

## Task 4: Fireflies data enrichment

**Files:**
- Modify: `scripts/fetch-fireflies.js`
- Regenerate: `site/data/fireflies.json`

The current script keeps only the most recent call per domain. The new version keeps all calls, each with an `action_items` array fetched via `fireflies_get_transcript`.

- [ ] **Step 1: Replace the main() function in fetch-fireflies.js**

The current `main()` function starts at line 47 and ends at line 76. Replace the entire function:

```js
async function main() {
  const fromDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  console.log(`[fireflies] Fetching transcripts from ${fromDate}...`);

  const data = await rpc('fireflies_list_transcripts', {
    body: { variables: { fromDate, limit: 50 } },
    query: {},
  });

  const transcripts = data?.data ?? [];
  console.log(`[fireflies] Found ${transcripts.length} transcripts`);

  // Only fetch detail for transcripts that have external participants
  const externalTranscripts = transcripts.filter(t => externalDomains(t).length > 0);
  console.log(`[fireflies] Fetching action items for ${externalTranscripts.length} external transcripts...`);

  const output = [];
  for (const t of externalTranscripts) {
    let actionItems = [];
    try {
      const detail = await rpc('fireflies_get_transcript', {
        body: { variables: { transcriptId: t.id } },
        query: {},
      });
      // action_items is an array of strings on the transcript object
      actionItems = detail?.data?.action_items ?? [];
    } catch (e) {
      console.warn(`[fireflies] Could not fetch detail for ${t.id}: ${e.message}`);
    }

    const domains = externalDomains(t);
    for (const domain of domains) {
      output.push({
        domain,
        title:        t.title,
        date:         t.dateString,   // ISO 8601 string — used for lexicographic sort
        action_items: actionItems,
      });
    }
  }

  // Sort most-recent first so the card shows calls in chronological order
  output.sort((a, b) => b.date.localeCompare(a.date));

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(output, null, 2) + '\n');
  console.log(`[fireflies] Written ${output.length} entries to ${OUT_FILE}`);

  writeStatus('fireflies', 'ok', { transcripts: transcripts.length, entries: output.length });
}
```

- [ ] **Step 2: Run the script**

```bash
cd /Users/mostyn/Documents/stack-plg
node scripts/fetch-fireflies.js
```

Expected output:
```
[fireflies] Fetching transcripts from ...
[fireflies] Found N transcripts
[fireflies] Fetching action items for M external transcripts...
[fireflies] Written X entries to .../site/data/fireflies.json
```

- [ ] **Step 3: Verify the output shape**

Open `site/data/fireflies.json`. Confirm:
- It is an array (not an object)
- Each entry has `domain`, `title`, `date`, `action_items` (array of strings)
- Multiple entries can share the same `domain` (one per call)
- Entries are sorted newest date first

Example of valid output:
```json
[
  {
    "domain": "acme.com",
    "title": "Acme Corp — onboarding check",
    "date": "2026-03-14T10:00:00Z",
    "action_items": ["Send Salesforce docs", "Follow up Q2 pricing"]
  }
]
```

If `action_items` is always empty, the field name from the API might differ. Check the raw `detail` object by adding a temporary `console.log(JSON.stringify(detail?.data, null, 2))` and re-running — look for the field that contains the action items and update the assignment accordingly.

- [ ] **Step 4: Commit**

```bash
git add scripts/fetch-fireflies.js site/data/fireflies.json
git commit -m "feat: enrich fireflies data with per-transcript action items"
```

---

## Task 5: CSS for card, actions, and popover

**Files:**
- Modify: `site/style.css` (append after line 1214)

- [ ] **Step 1: Append the new CSS to style.css**

Add the following after the final line of `site/style.css` (currently line 1214):

```css

/* ============================================================
   Customer card modal
   ============================================================ */

/* Overlay backdrop */
.card-overlay {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  z-index: 200;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.card-overlay--open { display: flex; }

/* Modal container */
.card-modal {
  background: #fff;
  border: 1px solid var(--so-neutral-10);
  border-radius: 16px;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.14);
  width: 100%;
  max-width: 720px;
  max-height: calc(100vh - 48px);
  overflow-y: auto;
}

/* Header */
.card-modal-header {
  padding: 18px 20px 14px;
  border-bottom: 1px solid var(--so-neutral-5);
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  position: sticky;
  top: 0;
  background: #fff;
  z-index: 1;
}
.card-modal-company { font-size: 18px; font-weight: 500; color: var(--so-text-header); letter-spacing: -0.4px; }
.card-modal-domain  { font-size: 12px; color: var(--so-neutral-40); margin-top: 2px; }
.card-hs-link       { color: var(--so-green-dark); text-decoration: none; }
.card-hs-link:hover { text-decoration: underline; }
.card-modal-close   {
  background: none; border: none; cursor: pointer;
  color: var(--so-neutral-40); font-size: 20px; line-height: 1;
  padding: 2px 6px; border-radius: 6px;
}
.card-modal-close:hover { background: var(--so-foreground); color: var(--so-text-header); }

/* Two-column body */
.card-modal-body { display: grid; grid-template-columns: 1fr 1fr; }
.card-modal-left  { padding: 18px 20px; border-right: 1px solid var(--so-neutral-5); }
.card-modal-right { padding: 18px 20px; }

/* Section labels and field rows */
.card-section-label {
  font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em;
  color: var(--so-neutral-40); margin-bottom: 12px;
}
.field-row      { margin-bottom: 14px; }
.field-label    {
  font-size: 11px; color: var(--so-neutral-40);
  text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 3px;
}
.field-value     { font-size: 13px; color: var(--so-text-header); }
.field-email a   { font-size: 12px; color: var(--so-green-dark); text-decoration: none; }
.field-email a:hover { text-decoration: underline; }
.field-notes     { font-size: 13px; color: var(--so-text-body); line-height: 1.5; }
.field-date-rel  { font-size: 13px; color: var(--so-text-header); }
.field-date-abs  { font-size: 11px; color: var(--so-neutral-40); margin-top: 1px; }
.section-divider { height: 1px; background: var(--so-neutral-5); margin: 14px 0; }

/* Fireflies call items */
.ff-item            { padding: 8px 0; border-bottom: 1px solid var(--so-neutral-5); }
.ff-item:last-child { border-bottom: none; }
.ff-call   { font-size: 12px; color: var(--so-text-tag); margin-bottom: 4px; }
.ff-action { font-size: 13px; color: var(--so-text-header); display: flex; gap: 6px; align-items: flex-start; }
.ff-dot    { width: 5px; height: 5px; background: var(--so-neutral-20); border-radius: 50%; margin-top: 5px; flex-shrink: 0; }
.ff-empty  { font-size: 13px; color: var(--so-neutral-40); font-style: italic; }

/* CS actions list in card */
.actions-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.add-btn        {
  background: var(--so-foreground); border: none; border-radius: 6px;
  color: var(--so-text-body); font-size: 12px; padding: 4px 10px;
  cursor: pointer; display: flex; align-items: center; gap: 4px;
}
.add-btn:hover { background: var(--so-neutral-5); }

.action-item            { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--so-neutral-5); }
.action-item:last-child { border-bottom: none; }
.action-check      {
  width: 16px; height: 16px; border: 1.5px solid var(--so-neutral-20);
  border-radius: 4px; flex-shrink: 0; cursor: pointer; background: none;
  padding: 0;
}
.action-check.done { background: var(--so-primary); border-color: var(--so-primary); }
.action-name       { flex: 1; font-size: 13px; color: var(--so-text-header); }
.action-name.done  { text-decoration: line-through; color: var(--so-neutral-40); }
.action-delete     {
  background: none; border: none; cursor: pointer;
  color: var(--so-neutral-40); font-size: 14px; padding: 2px;
  opacity: 0; transition: opacity 0.1s;
}
.action-item:hover .action-delete { opacity: 1; }

.priority-badge { font-size: 10px; font-weight: 500; padding: 2px 6px; border-radius: 4px; white-space: nowrap; }
.priority-high  { background: #FDEAEA; color: var(--so-red-dark); }
.priority-med   { background: #FEF3E2; color: var(--so-orange-dark); }
.priority-low   { background: var(--so-neutral-5); color: var(--so-text-tag); }

/* Inline add form inside the card */
.card-add-form       { display: flex; gap: 6px; align-items: center; margin-bottom: 12px; flex-wrap: wrap; }
.card-action-input   {
  flex: 1; min-width: 120px; font-size: 13px; padding: 5px 8px;
  border: 1px solid var(--so-neutral-10); border-radius: 6px; color: var(--so-text-header);
}
.card-action-input:focus   { outline: none; border-color: var(--so-primary); }
.card-action-select        {
  font-size: 12px; padding: 5px 6px;
  border: 1px solid var(--so-neutral-10); border-radius: 6px; color: var(--so-text-body);
}
.card-action-save   {
  background: var(--so-primary); color: #fff; border: none;
  border-radius: 6px; font-size: 12px; padding: 5px 10px; cursor: pointer;
}
.card-action-save:hover   { background: var(--so-green-dark); }
.card-action-cancel {
  background: none; border: none; color: var(--so-neutral-40);
  font-size: 12px; padding: 5px; cursor: pointer;
}
.card-action-cancel:hover { color: var(--so-text-header); }

/* ── CRM table: name cell open button ── */
.crm-name-cell   { display: flex; align-items: center; gap: 6px; }
.card-open-btn   {
  background: none; border: none; cursor: pointer;
  color: var(--so-green-dark); font-size: 14px; padding: 2px;
  flex-shrink: 0; line-height: 1;
}
.card-open-btn:hover { color: var(--so-primary); }

/* ── CRM table: CS actions column ── */
.actions-cell    { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.action-pill     { font-size: 11px; padding: 2px 8px; border-radius: 20px; white-space: nowrap; }
.action-pill.high { background: #FDEAEA; color: var(--so-red-dark); }
.action-pill.med  { background: #FEF3E2; color: var(--so-orange-dark); }
.action-pill.low  { background: var(--so-neutral-5); color: var(--so-text-tag); }
.add-action-btn  {
  background: none; border: 1px dashed var(--so-neutral-20);
  border-radius: 6px; color: var(--so-neutral-40);
  font-size: 12px; padding: 2px 8px; cursor: pointer; white-space: nowrap;
}
.add-action-btn:hover { border-color: var(--so-green-dark); color: var(--so-green-dark); }

/* ── Inline add popover (table row quick-add) ── */
.inline-add-popover {
  display: none;
  position: fixed;
  background: #fff;
  border: 1px solid var(--so-neutral-10);
  border-radius: 10px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  padding: 12px;
  z-index: 300;
  gap: 6px;
  align-items: center;
  min-width: 280px;
}
.inline-add-popover--open { display: flex; flex-wrap: wrap; }
.inline-action-name {
  flex: 1; min-width: 120px; font-size: 13px; padding: 5px 8px;
  border: 1px solid var(--so-neutral-10); border-radius: 6px; color: var(--so-text-header);
}
.inline-action-name:focus  { outline: none; border-color: var(--so-primary); }
.inline-action-priority    {
  font-size: 12px; padding: 5px 6px;
  border: 1px solid var(--so-neutral-10); border-radius: 6px; color: var(--so-text-body);
}
.inline-action-save {
  background: var(--so-primary); color: #fff; border: none;
  border-radius: 6px; font-size: 12px; padding: 5px 10px; cursor: pointer;
}
.inline-action-save:hover  { background: var(--so-green-dark); }
```

- [ ] **Step 2: Preview**

Open `site/crm.html` in a browser (via `npx serve site` or similar). The page should look unchanged — no new CSS is visible yet because the new classes aren't used anywhere yet.

- [ ] **Step 3: Commit**

```bash
git add site/style.css
git commit -m "feat: add css for card modal, action items, and inline popover"
```

---

## Task 6: CRM state, init update, and CS actions cell

**Files:**
- Modify: `site/crm.html`

This task updates the JavaScript constants, state variables, the `Promise.all` initialisation block, and the `CELLS.cs_actions` function.

- [ ] **Step 1: Add new state variables**

In `site/crm.html`, find the `// --- State ---` block (around line 137):

```js
// --- State ---
let allRows      = [];
let posthogMap   = new Map();
let firefliesMap = new Map();
let pylonMap     = new Map(); // hubspot_id → pylon account
```

Replace it with:

```js
// --- State ---
let allRows             = [];
let posthogMap          = new Map();
let firefliesMap        = new Map();  // domain → most-recent call (for Last call column)
let firefliesActionsMap = new Map();  // domain → all calls sorted desc (for card)
let pylonMap            = new Map();  // hubspot_id → pylon account
let actionsMap          = new Map();  // hubspot_id (string) → action[]
let openCardId          = null;       // hubspot_id of the open card, or null
```

- [ ] **Step 2: Update CELLS.cs_actions**

Find the existing `cs_actions` entry in the `CELLS` object (around line 128):

```js
cs_actions:    () => PLACEHOLDER_CELL,
```

Replace it with:

```js
cs_actions: company => {
  const actions = actionsMap.get(String(company.hubspot_id ?? '')) ?? [];
  const open    = actions.filter(a => !a.done);
  const pills   = open.slice(0, 2).map(a =>
    `<span class="action-pill ${escHtml(a.priority)}">${escHtml(a.name)}</span>`
  ).join('');
  const hid = escHtml(String(company.hubspot_id ?? ''));
  return `<td>
    <div class="actions-cell">
      ${pills}
      <button class="add-action-btn" data-hubspot-id="${hid}">+ Add</button>
    </div>
  </td>`;
},
```

- [ ] **Step 3: Update CELLS.name to add the card-open button**

Find the existing `name` entry in `CELLS` (around line 76):

```js
name: company => {
  const display = company.name ?? company.hubspot_id;
  const href    = safeHref(company.hubspot_url);
  return `<td><a href="${href}" target="_blank" rel="noopener">${escHtml(display)}</a></td>`;
},
```

Replace it with:

```js
name: company => {
  const display = company.name ?? company.hubspot_id;
  const href    = safeHref(company.hubspot_url);
  const hid     = escHtml(String(company.hubspot_id ?? ''));
  const badge   = typeBadge(company.type);
  return `<td class="crm-name-cell">
    <button class="card-open-btn" data-hubspot-id="${hid}" aria-label="Open card">⊞</button>
    <a href="${href}" target="_blank" rel="noopener">${escHtml(display)}</a>${badge}
  </td>`;
},
```

- [ ] **Step 4: Update the Promise.all init block**

Find the `Promise.all` block (around line 320):

```js
Promise.all([
  fetch('./data/hubspot.json').then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }),
  fetch('./data/posthog.json').then(r => r.ok ? r.json() : []).catch(() => []),
  fetch('./data/fireflies.json').then(r => r.ok ? r.json() : []).catch(() => []),
  fetch('./data/pylon.json').then(r => r.ok ? r.json() : []).catch(() => []),
]).then(([hubspot, posthog, fireflies, pylon]) => {
  posthogMap   = new Map(posthog.map(r => [normName(r.org_name), r]));
  firefliesMap = new Map(fireflies.map(r => [r.domain, r]));
  pylonMap     = new Map(pylon.map(r => [String(r.hubspot_id), r]));
  allRows = hubspot;
  render();
})
```

Replace with:

```js
Promise.all([
  fetch('./data/hubspot.json').then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }),
  fetch('./data/posthog.json').then(r => r.ok ? r.json() : []).catch(() => []),
  fetch('./data/fireflies.json').then(r => r.ok ? r.json() : []).catch(() => []),
  fetch('./data/pylon.json').then(r => r.ok ? r.json() : []).catch(() => []),
  fetch(`${WORKER_URL}/actions`).then(r => r.ok ? r.json() : []).catch(() => []),
]).then(([hubspot, posthog, fireflies, pylon, actions]) => {
  posthogMap = new Map(posthog.map(r => [normName(r.org_name), r]));
  pylonMap   = new Map(pylon.map(r => [String(r.hubspot_id), r]));

  // firefliesMap: domain → most-recent call (used by Last call column)
  firefliesMap = new Map();
  for (const entry of fireflies) {
    if (!firefliesMap.has(entry.domain) || entry.date > firefliesMap.get(entry.domain).date) {
      firefliesMap.set(entry.domain, entry);
    }
  }

  // firefliesActionsMap: domain → all calls sorted most-recent first (used by card)
  firefliesActionsMap = new Map();
  for (const entry of fireflies) {
    if (!firefliesActionsMap.has(entry.domain)) firefliesActionsMap.set(entry.domain, []);
    firefliesActionsMap.get(entry.domain).push(entry);
  }
  for (const [, calls] of firefliesActionsMap) {
    calls.sort((a, b) => b.date.localeCompare(a.date));
  }

  // actionsMap: hubspot_id (string) → action[]
  actionsMap = new Map();
  for (const action of actions) {
    if (!actionsMap.has(action.hubspot_id)) actionsMap.set(action.hubspot_id, []);
    actionsMap.get(action.hubspot_id).push(action);
  }

  allRows = hubspot;
  render();
}).catch(() => {
  document.getElementById('crm-table-wrap').outerHTML =
    '<p class="crm-error">Customer data couldn\'t be loaded. Try refreshing.</p>';
});
```

- [ ] **Step 5: Add overlay div to the HTML body**

In `site/crm.html`, find the closing `</main>` tag (around line 48) and add the overlay div right after it, before `</body>`:

```html
  </main>

  <div id="card-overlay" class="card-overlay"></div>
  <div id="inline-add-popover" class="inline-add-popover"></div>
```

- [ ] **Step 6: Preview**

Open `site/crm.html` in a browser. The CRM table should load normally. Each company name should now have a ⊞ button on the left (styled in green). The CS actions column should show "+ Add" buttons (dashed border) on every row. Clicking ⊞ or "+ Add" does nothing yet — that comes in the next tasks.

- [ ] **Step 7: Commit**

```bash
git add site/crm.html
git commit -m "feat: crm state, init, cs-actions cell, and name cell card button"
```

---

## Task 7: Card modal — render and open/close

**Files:**
- Modify: `site/crm.html` (add card helper functions and event delegation for open/close)

- [ ] **Step 1: Add card render helpers**

In `site/crm.html`, find `// --- Render ---` (around line 265) and add the following block immediately before it:

```js
// --- Card modal ---

function renderCardLeft(company, c, gmailUrl, calls) {
  const rel = relativeTime(company.last_contact);
  const abs = company.last_contact
    ? new Date(company.last_contact).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;

  const ffHtml = calls.length === 0
    ? '<p class="ff-empty">No calls on record.</p>'
    : calls.map(call => {
        const callDate = new Date(call.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
        const items = call.action_items ?? [];
        const itemsHtml = items.length === 0
          ? '<div class="ff-empty">No action items.</div>'
          : items.map(item => `<div class="ff-action"><span class="ff-dot"></span>${escHtml(item)}</div>`).join('');
        return `<div class="ff-item">
          <div class="ff-call">${escHtml(call.title)} · ${escHtml(callDate)}</div>
          ${itemsHtml}
        </div>`;
      }).join('');

  return `
    <div class="card-section-label">Customer details</div>
    ${c ? `
      <div class="field-row">
        <div class="field-label">Primary contact</div>
        <div class="field-value">${escHtml(c.name ?? '')}</div>
        ${gmailUrl
          ? `<div class="field-email"><a href="${escHtml(gmailUrl)}" target="_blank" rel="noopener">${escHtml(c.email)}</a></div>`
          : ''}
      </div>
    ` : ''}
    ${rel ? `
      <div class="field-row">
        <div class="field-label">Last contact</div>
        <div class="field-date-rel">${escHtml(rel)}</div>
        <div class="field-date-abs">${escHtml(abs ?? '')}</div>
      </div>
    ` : ''}
    ${company.notes ? `
      <div class="field-row">
        <div class="field-label">Notes</div>
        <div class="field-notes">${escHtml(company.notes)}</div>
      </div>
    ` : ''}
    <div class="section-divider"></div>
    <div class="card-section-label">Fireflies actions</div>
    ${ffHtml}
  `;
}

function renderCardRight(actions) {
  const open = actions.filter(a => !a.done);
  const done = actions.filter(a =>  a.done);
  const all  = [...open, ...done];

  const listHtml = all.length === 0
    ? '<p class="ff-empty">No actions yet — add one above.</p>'
    : all.map(action => `
        <div class="action-item">
          <button class="action-check ${action.done ? 'done' : ''}" data-action-id="${escHtml(action.id)}" data-hubspot-id="${escHtml(action.hubspot_id)}"></button>
          <div class="action-name ${action.done ? 'done' : ''}">${escHtml(action.name)}</div>
          <span class="priority-badge priority-${escHtml(action.priority)}">${escHtml(action.priority.charAt(0).toUpperCase() + action.priority.slice(1))}</span>
          <button class="action-delete" data-action-id="${escHtml(action.id)}" data-hubspot-id="${escHtml(action.hubspot_id)}" aria-label="Delete">✕</button>
        </div>
      `).join('');

  return `
    <div class="actions-header">
      <div class="card-section-label" style="margin-bottom:0">CS actions</div>
      <button class="add-btn" id="card-add-btn">＋ Add</button>
    </div>
    <div id="card-add-form" class="card-add-form" style="display:none">
      <input type="text" id="card-action-name" class="card-action-input" placeholder="Action name…" maxlength="200">
      <select id="card-action-priority" class="card-action-select">
        <option value="high">High</option>
        <option value="med" selected>Med</option>
        <option value="low">Low</option>
      </select>
      <button class="card-action-save" id="card-action-save">Add</button>
      <button class="card-action-cancel" id="card-action-cancel">Cancel</button>
    </div>
    ${listHtml}
  `;
}

function rerenderCardActions() {
  const right = document.querySelector('.card-modal-right');
  if (!right || !openCardId) return;
  const actions = actionsMap.get(openCardId) ?? [];
  right.innerHTML = renderCardRight(actions);
}

function openCard(company) {
  closeInlinePopover();
  const c       = isContactObj(company.contact) ? company.contact : null;
  const gmailUrl = c?.email
    ? `https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(c.email)}`
    : null;
  const calls   = firefliesActionsMap.get(company.domain) ?? [];
  const actions = actionsMap.get(String(company.hubspot_id ?? '')) ?? [];

  openCardId = String(company.hubspot_id ?? '');

  const overlay = document.getElementById('card-overlay');
  overlay.innerHTML = `
    <div class="card-modal" id="card-modal">
      <div class="card-modal-header">
        <div>
          <div class="card-modal-company">${escHtml(company.name ?? company.hubspot_id)}</div>
          <div class="card-modal-domain">${escHtml(company.domain ?? '')}${
            company.hubspot_url
              ? ` · <a href="${safeHref(company.hubspot_url)}" target="_blank" rel="noopener" class="card-hs-link">HubSpot ↗</a>`
              : ''
          }</div>
        </div>
        <button class="card-modal-close" id="card-close">×</button>
      </div>
      <div class="card-modal-body">
        <div class="card-modal-left">${renderCardLeft(company, c, gmailUrl, calls)}</div>
        <div class="card-modal-right">${renderCardRight(actions)}</div>
      </div>
    </div>
  `;
  overlay.classList.add('card-overlay--open');
  document.addEventListener('keydown', handleCardKeydown);
}

function closeCard() {
  const overlay = document.getElementById('card-overlay');
  overlay.classList.remove('card-overlay--open');
  overlay.innerHTML = '';
  openCardId = null;
  document.removeEventListener('keydown', handleCardKeydown);
}

function handleCardKeydown(e) {
  if (e.key === 'Escape') closeCard();
}
```

- [ ] **Step 2: Wire up open/close event delegation**

Find the click listener on `.crm-table` (around line 338):

```js
document.querySelector('.crm-table').addEventListener('click', e => {
  const th = e.target.closest('th[data-col]');
  if (!th) return;
  ...
```

Add a new delegated click listener for the card-open button, right after the existing crm-table click listener (before the drag-to-reorder section):

```js
// Card open: delegated click on ⊞ button
document.querySelector('.crm-table').addEventListener('click', e => {
  const btn = e.target.closest('.card-open-btn');
  if (!btn) return;
  const hid = btn.dataset.hubspotId;
  const company = allRows.find(r => String(r.hubspot_id ?? '') === hid);
  if (company) openCard(company);
});

// Card close: click on overlay backdrop (outside the modal)
document.getElementById('card-overlay').addEventListener('click', e => {
  if (e.target === document.getElementById('card-overlay')) closeCard();
});
```

Also add a delegated click on the overlay for the × close button. Add this right after the overlay click listener above:

```js
document.getElementById('card-overlay').addEventListener('click', e => {
  if (e.target.closest('#card-close')) closeCard();
});
```

- [ ] **Step 3: Preview**

Open `site/crm.html` in a browser. Click the ⊞ button next to any company name. A card modal should appear with:
- Company name and domain in the header, HubSpot link if present
- Left column: contact, last contact, notes, Fireflies section (may show "No calls on record" if fireflies.json is empty)
- Right column: "No actions yet — add one above." and a ＋ Add button

Click × or click the dimmed backdrop to close the card. Press Escape to close. All three should work.

- [ ] **Step 4: Commit**

```bash
git add site/crm.html
git commit -m "feat: card modal open/close with customer details and fireflies"
```

---

## Task 8: Card CRUD — create, toggle, delete

**Files:**
- Modify: `site/crm.html`

- [ ] **Step 1: Add CRUD helper functions**

Add the following immediately after the `handleCardKeydown` function (still in the card modal section):

```js
// --- Action CRUD ---

async function createAction(hubspot_id, name, priority) {
  try {
    const res = await fetch(`${WORKER_URL}/actions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hubspot_id: String(hubspot_id), name, priority }),
    });
    if (!res.ok) throw new Error(await res.text());
    const action = await res.json();
    const list = actionsMap.get(String(hubspot_id)) ?? [];
    actionsMap.set(String(hubspot_id), [...list, action]);
    return action;
  } catch (e) {
    console.error('[actions] create failed:', e);
    return null;
  }
}

async function toggleAction(id, hubspot_id, currentDone) {
  try {
    const res = await fetch(`${WORKER_URL}/actions/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ done: currentDone ? 0 : 1 }),
    });
    if (!res.ok) throw new Error(await res.text());
    const updated = await res.json();
    const list = actionsMap.get(String(hubspot_id)) ?? [];
    actionsMap.set(String(hubspot_id), list.map(a => a.id === id ? updated : a));
    return updated;
  } catch (e) {
    console.error('[actions] toggle failed:', e);
    return null;
  }
}

async function deleteAction(id, hubspot_id) {
  try {
    const res = await fetch(`${WORKER_URL}/actions/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (!res.ok && res.status !== 204) throw new Error(await res.text());
    const list = actionsMap.get(String(hubspot_id)) ?? [];
    actionsMap.set(String(hubspot_id), list.filter(a => a.id !== id));
    return true;
  } catch (e) {
    console.error('[actions] delete failed:', e);
    return false;
  }
}

function showCardError(msg) {
  const right = document.querySelector('.card-modal-right');
  if (!right) return;
  const err = document.createElement('div');
  err.style.cssText = 'font-size:12px;color:#C43E3E;padding:4px 0;';
  err.textContent = msg;
  right.prepend(err);
  setTimeout(() => err.remove(), 3000);
}
```

- [ ] **Step 2: Add card CRUD event delegation**

Find the overlay click listeners you added in Task 7. After all of them, add a new delegated click listener on the overlay for card interactions:

```js
// Card CRUD: add form, toggle, delete
document.getElementById('card-overlay').addEventListener('click', async e => {
  // Show add form
  if (e.target.closest('#card-add-btn')) {
    const form = document.getElementById('card-add-form');
    if (form) { form.style.display = 'flex'; document.getElementById('card-action-name')?.focus(); }
    return;
  }

  // Cancel add form
  if (e.target.closest('#card-action-cancel')) {
    const form = document.getElementById('card-add-form');
    if (form) form.style.display = 'none';
    return;
  }

  // Save new action
  if (e.target.closest('#card-action-save')) {
    const name     = document.getElementById('card-action-name')?.value.trim();
    const priority = document.getElementById('card-action-priority')?.value;
    if (!name) { document.getElementById('card-action-name')?.focus(); return; }
    const action = await createAction(openCardId, name, priority);
    if (!action) { showCardError("Couldn't save — try again"); return; }
    rerenderCardActions();
    render();
    return;
  }

  // Toggle done
  const checkBtn = e.target.closest('.action-check');
  if (checkBtn) {
    const id       = checkBtn.dataset.actionId;
    const hid      = checkBtn.dataset.hubspotId;
    const actions  = actionsMap.get(hid) ?? [];
    const existing = actions.find(a => a.id === id);
    if (!existing) return;
    const updated = await toggleAction(id, hid, existing.done);
    if (!updated) { showCardError("Couldn't save — try again"); return; }
    rerenderCardActions();
    render();
    return;
  }

  // Delete
  const delBtn = e.target.closest('.action-delete');
  if (delBtn) {
    const id  = delBtn.dataset.actionId;
    const hid = delBtn.dataset.hubspotId;
    const ok  = await deleteAction(id, hid);
    if (!ok) { showCardError("Couldn't delete — try again"); return; }
    rerenderCardActions();
    render();
    return;
  }
});
```

- [ ] **Step 3: Also handle Enter key in the card add form name input**

Add this listener near the other card listeners:

```js
document.getElementById('card-overlay').addEventListener('keydown', async e => {
  if (e.key !== 'Enter') return;
  if (!e.target.closest('#card-add-form')) return;
  e.preventDefault();
  document.getElementById('card-action-save')?.click();
});
```

- [ ] **Step 4: Preview — create an action**

Open the CRM. Click ⊞ on any company. Click ＋ Add in the card. Type a task name, choose a priority, press Add. The action should appear in the list below and the CS actions column on the table row should now show a coloured pill.

- [ ] **Step 5: Preview — toggle done**

Click the checkbox next to an action. The action should get a strikethrough style and the checkbox should turn green. The pill in the table row should disappear (only open tasks are shown as pills).

- [ ] **Step 6: Preview — delete**

Hover over an action. A ✕ button should appear on the right. Click it. The action should be removed from the list and from the table row.

- [ ] **Step 7: Verify persistence**

Refresh the page. All the actions you created should still appear in the card and table row (fetched from the Worker on load).

- [ ] **Step 8: Commit**

```bash
git add site/crm.html
git commit -m "feat: card action crud - create, toggle done, delete"
```

---

## Task 9: Inline add popover (table row quick-add)

**Files:**
- Modify: `site/crm.html`

- [ ] **Step 1: Add closeInlinePopover helper**

Near the other card helpers, add:

```js
// --- Inline add popover ---

function closeInlinePopover() {
  const p = document.getElementById('inline-add-popover');
  if (!p) return;
  p.classList.remove('inline-add-popover--open');
  p.innerHTML = '';
  delete p.dataset.hubspotId;
}
```

Note: `closeInlinePopover()` is already called inside `openCard()` from Task 7 — that's correct.

- [ ] **Step 2: Add openInlinePopover function**

```js
function openInlinePopover(btn) {
  closeInlinePopover();
  closeCard();
  const hid  = btn.dataset.hubspotId;
  const rect = btn.getBoundingClientRect();
  const p    = document.getElementById('inline-add-popover');
  p.innerHTML = `
    <input type="text" class="inline-action-name" placeholder="Action name…" maxlength="200">
    <select class="inline-action-priority">
      <option value="high">High</option>
      <option value="med" selected>Med</option>
      <option value="low">Low</option>
    </select>
    <button class="inline-action-save">Add</button>
  `;
  p.dataset.hubspotId = hid;
  p.style.top  = `${rect.bottom + window.scrollY + 4}px`;
  p.style.left = `${rect.left  + window.scrollX}px`;
  p.classList.add('inline-add-popover--open');
  p.querySelector('.inline-action-name')?.focus();
}
```

- [ ] **Step 3: Wire up the "+ Add" button in the table**

Add a new delegated click on `.crm-table` for the `.add-action-btn`:

```js
document.querySelector('.crm-table').addEventListener('click', e => {
  const btn = e.target.closest('.add-action-btn');
  if (!btn) return;
  openInlinePopover(btn);
});
```

- [ ] **Step 4: Wire up save and dismiss for the popover**

Add these listeners after the inline popover functions:

```js
// Inline popover: save on button click
document.getElementById('inline-add-popover').addEventListener('click', async e => {
  if (!e.target.closest('.inline-action-save')) return;
  const p        = document.getElementById('inline-add-popover');
  const hid      = p.dataset.hubspotId;
  const name     = p.querySelector('.inline-action-name')?.value.trim();
  const priority = p.querySelector('.inline-action-priority')?.value;
  if (!name) { p.querySelector('.inline-action-name')?.focus(); return; }
  const action = await createAction(hid, name, priority);
  if (!action) return; // silently fail — could add error toast here
  closeInlinePopover();
  render();
});

// Inline popover: save on Enter key
document.getElementById('inline-add-popover').addEventListener('keydown', async e => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  document.querySelector('#inline-add-popover .inline-action-save')?.click();
});

// Inline popover: close on Escape or click outside
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeInlinePopover();
});

document.addEventListener('click', e => {
  const p = document.getElementById('inline-add-popover');
  if (!p?.classList.contains('inline-add-popover--open')) return;
  if (!p.contains(e.target) && !e.target.closest('.add-action-btn')) closeInlinePopover();
}, true);
```

- [ ] **Step 5: Preview — inline add**

In the CRM table, click "+ Add" on any row (not inside the card). A small popover should appear below the button with a name input, priority dropdown, and Add button. Type a task name and press Add or Enter. The popover closes, and a pill should appear in the CS actions column for that row.

- [ ] **Step 6: Preview — popover dismiss**

Click "+ Add" to open the popover, then click somewhere else on the page. The popover should close. Press Escape — same result.

- [ ] **Step 7: Final commit**

```bash
git add site/crm.html
git commit -m "feat: inline add popover for quick action creation from table row"
```

---

## Task 10: Push and preview

- [ ] **Step 1: Push branch**

```bash
git push -u origin feat/card-action-tracker
```

- [ ] **Step 2: Check Cloudflare preview URL**

Go to the Cloudflare Pages dashboard or check the GitHub commit status. A preview URL will be generated, e.g. `https://feat-card-action-tracker.stack-plg.pages.dev`.

- [ ] **Step 3: Smoke test on preview**

On the preview URL:
1. CRM table loads — ⊞ button visible on each row, CS actions column has "+ Add"
2. Click ⊞ — card opens with two columns
3. Add an action in the card — it appears in the list and as a pill on the row
4. Toggle done — strikethrough, pill disappears
5. Delete — action removed
6. Click "+ Add" on a table row — popover opens, can add action
7. Refresh page — actions persist

- [ ] **Step 4: Tell Charlie the preview is ready**

Share the preview URL. When Charlie says "ship it", merge to main.
