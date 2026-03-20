# CS Tasks Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement 9 improvements to the CS Tasks page: remove stale nav link, add search + type filters, fix alignment, inline due-date and client editing, client card popup, green background, and inline task creation.

**Architecture:** All changes are confined to two files — `worker/index.js` (worker must ship first as a blocking dependency) and `site/tasks.html`. The card modal CSS already lives in `style.css` which tasks.html already loads. Worker and frontend are deployed independently; use separate feature branches.

**Tech Stack:** Vanilla JS, HTML/CSS, Cloudflare Workers (D1 SQLite), `wrangler` CLI for worker deploys, `gh` CLI for Cloudflare Pages preview URLs.

---

## Files

| File | Change |
|------|--------|
| `worker/index.js` | POST: make `hubspot_id` optional (default `''`); PATCH: add `due_date` + `hubspot_id` fields |
| `site/tasks.html` | All 9 frontend changes |

> `site/style.css` — no changes needed. Card modal CSS (`.card-overlay`, `.card-modal-*`) already defined there.

---

## Task 1: Update worker — POST + PATCH

**Files:**
- Modify: `worker/index.js`

The DB schema already has `due_date TEXT` (nullable) and `hubspot_id TEXT NOT NULL`. The spec says to use `null` for "no client", but because the column is `NOT NULL`, we use `''` (empty string) as the sentinel instead. The worker and frontend are both updated to treat `''` as "no client".

### POST /actions — make hubspot_id optional

- [ ] **Step 1: Find the POST /actions handler**

Open `worker/index.js`. Find the block:
```js
const { hubspot_id, name, priority } = body ?? {};
if (!hubspot_id || !name || !priority) {
  return json({ error: 'Missing required fields: hubspot_id, name, priority' }, 400);
}
```

- [ ] **Step 2: Relax the hubspot_id requirement**

Replace that block with:
```js
const { hubspot_id, name, priority } = body ?? {};
if (!name || !priority) {
  return json({ error: 'Missing required fields: name, priority' }, 400);
}
if (!['high', 'med', 'low'].includes(priority)) {
  return json({ error: 'priority must be high, med, or low' }, 400);
}
const hid = hubspot_id ? String(hubspot_id) : '';
```

- [ ] **Step 3: Update the INSERT to use `hid`**

Find the INSERT line and change `String(hubspot_id)` → `hid` in both the `.bind()` and the returned JSON:
```js
await env.DB
  .prepare('INSERT INTO cs_actions (id, hubspot_id, name, priority, done, created_at) VALUES (?, ?, ?, ?, 0, ?)')
  .bind(id, hid, String(name), priority, created_at)
  .run();
return json({ id, hubspot_id: hid, name: String(name), priority, done: 0, created_at }, 201);
```

### PATCH /actions/:id — add due_date + hubspot_id fields

- [ ] **Step 4: Find the PATCH handler's sets/vals block**

Find the block that builds `sets` and `vals`. Currently it handles `name`, `priority`, and `done`. Add two new fields after the `done` block:

```js
if ('due_date' in body) {
  const d = body.due_date;
  if (d !== null && !/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    return json({ error: 'due_date must be YYYY-MM-DD or null' }, 400);
  }
  sets.push('due_date = ?'); vals.push(d ?? null);
}
if ('hubspot_id' in body) {
  sets.push('hubspot_id = ?'); vals.push(body.hubspot_id ? String(body.hubspot_id) : '');
}
```

- [ ] **Step 5: Deploy the updated worker**

```bash
cd /Users/mostyn/stack-plg/worker
npx wrangler deploy
```

Expected: `Published stack-plg-actions` with a deployment URL. If wrangler is not installed: `npm install -g wrangler` first.

- [ ] **Step 6: Smoke-test POST with no hubspot_id**

```bash
curl -s -X POST https://stack-plg-actions.charlie-9e7.workers.dev/actions \
  -H 'Content-Type: application/json' \
  -d '{"name":"test task","priority":"med"}' | jq .
```

Expected: JSON with `hubspot_id: ""`.

- [ ] **Step 7: Smoke-test PATCH due_date**

Take any existing task ID from the GET response:
```bash
ID=$(curl -s https://stack-plg-actions.charlie-9e7.workers.dev/actions | jq -r '.[0].id')
curl -s -X PATCH "https://stack-plg-actions.charlie-9e7.workers.dev/actions/$ID" \
  -H 'Content-Type: application/json' \
  -d '{"due_date":"2026-04-01"}' | jq .due_date
```

Expected: `"2026-04-01"`.

- [ ] **Step 8: Smoke-test PATCH hubspot_id**

```bash
curl -s -X PATCH "https://stack-plg-actions.charlie-9e7.workers.dev/actions/$ID" \
  -H 'Content-Type: application/json' \
  -d '{"hubspot_id":"12345"}' | jq .hubspot_id
```

Expected: `"12345"`.

- [ ] **Step 9: Commit worker changes**

```bash
cd /Users/mostyn/stack-plg
git add worker/index.js
git commit -m "feat: worker — optional hubspot_id on POST, due_date + hubspot_id on PATCH"
```

---

## Task 2: Frontend branch + quick wins (nav, background, alignment)

**Files:**
- Modify: `site/tasks.html`

- [ ] **Step 1: Create feature branch**

```bash
cd /Users/mostyn/stack-plg
git checkout -b feat/cs-tasks-enhancements
```

- [ ] **Step 2: Remove Customer Support nav link**

In `site/tasks.html`, find and delete this line in the `<nav>`:
```html
<a href="index.html" class="site-nav-link">Customer Support <span class="nav-coming-soon">soon</span></a>
```

- [ ] **Step 3: Set green page background**

In the `<style>` block, find `.tasks-page { ... }` and change:
```css
background: var(--so-background);
```
to:
```css
background: #EEF8F3;
```

- [ ] **Step 4: Fix column header left-alignment**

Find `.tasks-col-label { ... }` in the `<style>` block and add `text-align: left;`:
```css
.tasks-col-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--so-neutral-40);
  font-family: var(--so-font-tag);
  text-align: left;
}
```

- [ ] **Step 5: Verify visually**

Open `site/tasks.html` in a browser (or `npx serve site` from the repo root). Check:
- Nav has no "Customer Support" link
- Page background is light green
- Column headers align with cell content

- [ ] **Step 6: Commit**

```bash
git add site/tasks.html
git commit -m "feat: remove CS nav link, green background, fix col header alignment"
```

---

## Task 3: Add typeMap + state variables to JS

**Files:**
- Modify: `site/tasks.html` (JS section)

The type filter needs to know each customer's type (PLG/SLG/Cust). `hubspot.json` has a `type` field per company.

- [ ] **Step 1: Add typeMap and state variables**

In the `<script>` block, find the existing state variables:
```js
let allActions     = [];
let companyMap     = new Map();
let activeTab      = 'upcoming';
let activePriority = '';
let activeCustomer = '';
```

Add two new variables after them:
```js
let typeMap        = new Map();  // hubspot_id → company type string
let activeType     = '';         // '' | 'Customer - PLG' | 'Customer - SLG' | 'Customer'
let activeSearch   = '';
```

- [ ] **Step 2: Populate typeMap when hubspot.json loads**

Find the existing fetch for `hubspot.json`:
```js
fetch('./data/hubspot.json').then(r => r.json()).then(companies => {
  companyMap = new Map(companies.map(c => [String(c.hubspot_id), c.name ?? String(c.hubspot_id)]));
  populateCustomerFilter();
}).catch(() => {});
```

Change it to also populate typeMap:
```js
fetch('./data/hubspot.json').then(r => r.json()).then(companies => {
  companyMap = new Map(companies.map(c => [String(c.hubspot_id), c.name ?? String(c.hubspot_id)]));
  typeMap    = new Map(companies.map(c => [String(c.hubspot_id), c.type ?? '']));
  populateCustomerFilter();
}).catch(() => {});
```

- [ ] **Step 3: Update `filteredActions()` to use activeType and activeSearch**

Find `filteredActions()`:
```js
function filteredActions() {
  return allActions.filter(a => {
    if (tabFor(a) !== activeTab) return false;
    if (activePriority && a.priority !== activePriority) return false;
    if (activeCustomer && String(a.hubspot_id) !== activeCustomer) return false;
    return true;
  });
}
```

Replace with:
```js
function filteredActions() {
  const q = activeSearch.toLowerCase();
  return allActions.filter(a => {
    if (tabFor(a) !== activeTab) return false;
    if (activePriority && a.priority !== activePriority) return false;
    if (activeCustomer && String(a.hubspot_id) !== activeCustomer) return false;
    if (activeType) {
      const t = typeMap.get(String(a.hubspot_id)) ?? '';
      if (t !== activeType) return false;
    }
    if (q) {
      const name   = (a.name ?? '').toLowerCase();
      const client = (companyMap.get(String(a.hubspot_id)) ?? '').toLowerCase();
      if (!name.includes(q) && !client.includes(q)) return false;
    }
    return true;
  });
}
```

- [ ] **Step 4: Commit**

```bash
git add site/tasks.html
git commit -m "feat: add typeMap, activeType, activeSearch state + update filteredActions"
```

---

## Task 4: Toolbar redesign

**Files:**
- Modify: `site/tasks.html` (HTML toolbar + CSS)

- [ ] **Step 1: Replace the toolbar-right HTML**

Find the existing `<div class="tasks-toolbar-right">` block (approx lines 389–404):
```html
<div class="tasks-toolbar-right">
  <div class="priority-pills" id="priority-pills">
    ...
  </div>
  <select id="customer-filter" class="tasks-customer-select">
    <option value="">All customers</option>
  </select>
  <button class="btn-new-task" id="new-task-btn">
    ...
  </button>
</div>
```

Replace the entire `tasks-toolbar-right` div with:
```html
<div class="tasks-toolbar-right">

  <!-- 1. Search -->
  <div class="crm-search-wrap">
    <svg class="crm-search-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="6.5" cy="6.5" r="4.5"/><line x1="10.5" y1="10.5" x2="14.5" y2="14.5"/>
    </svg>
    <input id="tasks-search" class="crm-search" type="search" placeholder="Search tasks or customers…" autocomplete="off">
  </div>

  <!-- 2. Type pills (PLG / SLG / Cust) -->
  <div class="crm-pill-group" id="type-pills">
    <button class="crm-pill crm-pill--active" data-type="">All</button>
    <button class="crm-pill" data-type="Customer - PLG">PLG</button>
    <button class="crm-pill" data-type="Customer - SLG">SLG</button>
    <button class="crm-pill" data-type="Customer">Cust</button>
  </div>

  <!-- 3. Priority pills -->
  <div class="priority-pills" id="priority-pills">
    <button class="priority-pill priority-pill--active" data-priority="">All</button>
    <button class="priority-pill" data-priority="high">High</button>
    <button class="priority-pill" data-priority="med">Med</button>
    <button class="priority-pill" data-priority="low">Low</button>
  </div>

  <!-- 4. New task -->
  <button class="btn-new-task" id="new-task-btn">
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="6" y1="1" x2="6" y2="11"/><line x1="1" y1="6" x2="11" y2="6"/></svg>
    New task
  </button>

</div>
```

Note: the `<select id="customer-filter">` is removed from the toolbar. Keep the `populateCustomerFilter()` function — it still populates the modal customer select (which will be repurposed for inline row below).

- [ ] **Step 2: Add type pill CSS**

In the `<style>` block, add styles for `crm-pill-group` (the type pills use `.crm-pill` / `.crm-pill--active` from `style.css` — those already work. Just need the wrapper):

```css
.crm-pill-group {
  display: flex;
  gap: 2px;
  background: var(--so-neutral-5);
  border-radius: 7px;
  padding: 3px;
}
```

And update `.priority-pills` to match the same capsule style. Find the existing `.priority-pills` CSS and replace:
```css
.priority-pills { display: flex; gap: 4px; }
```
with:
```css
.priority-pills {
  display: flex;
  gap: 2px;
  background: var(--so-neutral-5);
  border-radius: 7px;
  padding: 3px;
}
```

Then update `.priority-pill` to match `.crm-pill` style (no border, pill inside capsule):
```css
.priority-pill {
  background: none;
  border: none;
  border-radius: 5px;
  padding: 4px 10px;
  font-size: 13px;
  font-weight: 400;
  color: var(--so-text-tag);
  cursor: pointer;
  font-family: var(--so-font-body);
  transition: background 0.1s, color 0.1s;
  white-space: nowrap;
}
.priority-pill:hover { background: #fff; color: var(--so-text-body); }
.priority-pill--active {
  background: #fff;
  color: var(--so-green-dark);
  font-weight: 500;
  box-shadow: 0 1px 2px rgba(0,0,0,0.08);
}
```

- [ ] **Step 3: Wire type pills and search to state + render**

In the JS events section, add after the existing priority pills listener:

```js
document.getElementById('type-pills').addEventListener('click', e => {
  const pill = e.target.closest('.crm-pill');
  if (!pill) return;
  activeType = pill.dataset.type;
  document.querySelectorAll('#type-pills .crm-pill').forEach(p =>
    p.classList.toggle('crm-pill--active', p === pill)
  );
  render();
});

document.getElementById('tasks-search').addEventListener('input', e => {
  activeSearch = e.target.value.trim();
  render();
});
```

- [ ] **Step 4: Remove the old customer-filter change listener**

Find and delete this event listener:
```js
document.getElementById('customer-filter').addEventListener('change', e => {
  activeCustomer = e.target.value; render();
});
```

- [ ] **Step 5: Verify toolbar visually**

Open `site/tasks.html`. The toolbar right side should show: search input · All/PLG/SLG/Cust pills · All/High/Med/Low pills · New task button. Clicking PLG should filter to tasks whose customers have type `Customer - PLG`.

- [ ] **Step 6: Commit**

```bash
git add site/tasks.html
git commit -m "feat: toolbar redesign — search, type pills, priority pills, new task"
```

---

## Task 5: Inline due date editing

**Files:**
- Modify: `site/tasks.html`

- [ ] **Step 1: Add CSS for inline date input**

In the `<style>` block, add:
```css
.task-due-input {
  font-size: 13px;
  border: 1px solid var(--so-primary);
  border-radius: var(--so-radius);
  padding: 3px 6px;
  background: #fff;
  outline: none;
  box-shadow: 0 0 0 3px rgba(0,175,102,0.10);
  width: 130px;
  font-family: var(--so-font-body);
  color: var(--so-text-body);
}
```

- [ ] **Step 2: Make due date cell clickable in the render function**

Find the due date cell in the `list.innerHTML = rows.map(a => {` template string:
```js
<div class="task-due${overdue ? ' task-due--overdue' : ''}">${escHtml(dueStr)}</div>
```

Replace with:
```js
<div class="task-due${overdue ? ' task-due--overdue' : ''}" data-due-id="${escHtml(a.id)}" style="cursor:pointer" title="Click to set date">${escHtml(dueStr)}</div>
```

- [ ] **Step 3: Add click handler for due date cells**

In the `document.getElementById('tasks-list').addEventListener('click', ...)` handler, add a new branch after the existing `check` and `del` branches:

```js
const dueCell = e.target.closest('[data-due-id]');
if (dueCell && !dueCell.querySelector('input')) {
  const id = dueCell.dataset.dueId;
  const action = allActions.find(a => a.id === id);
  const currentVal = action?.due_date ?? '';
  const input = document.createElement('input');
  input.type = 'date';
  input.className = 'task-due-input';
  if (currentVal) input.value = currentVal;
  dueCell.textContent = '';
  dueCell.appendChild(input);
  input.focus();

  async function saveDue() {
    const newDate = input.value || null;
    dueCell.textContent = newDate ? formatDate(newDate) : '—';
    if (action) action.due_date = newDate;
    if (newDate !== currentVal) {
      await fetch(`${WORKER_URL}/actions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ due_date: newDate }),
      }).catch(() => {});
    }
    render();
  }

  input.addEventListener('change', saveDue);
  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') { dueCell.textContent = currentVal ? formatDate(currentVal) : '—'; }
    if (e.key === 'Enter')  { saveDue(); }
  });
  input.addEventListener('blur', saveDue);
  return;
}
```

- [ ] **Step 4: Verify**

Open `site/tasks.html`. Click a due date cell — it should become a date picker. Change the date and blur — the text should update and the PATCH should fire (check Network tab).

- [ ] **Step 5: Commit**

```bash
git add site/tasks.html
git commit -m "feat: inline due date editing on task rows"
```

---

## Task 6: Inline client assignment

**Files:**
- Modify: `site/tasks.html`

For rows where `hubspot_id` is `''` (no client), the client cell becomes a dropdown to assign one. For rows that already have a client, the name is a clickable link (handled in Task 7).

- [ ] **Step 1: Add CSS for inline client select**

In the `<style>` block, add:
```css
.task-client-select {
  font-size: 13px;
  border: 1px solid var(--so-primary);
  border-radius: var(--so-radius);
  padding: 3px 8px;
  color: var(--so-text-body);
  background: #fff;
  outline: none;
  box-shadow: 0 0 0 3px rgba(0,175,102,0.10);
  width: 150px;
  font-family: var(--so-font-body);
}
```

- [ ] **Step 2: Update the client cell in the render template**

Find the client cell in the `rows.map(a => { ... })` template:
```js
<div class="task-client">${client}</div>
```

Replace with a conditional: if the task has no hubspot_id, render an "Assign…" button; otherwise render the clickable name:
```js
${a.hubspot_id
  ? `<button class="task-client" data-open-card="${escHtml(String(a.hubspot_id))}" style="background:none;border:none;padding:0;cursor:pointer;text-align:left">${client}</button>`
  : `<button class="task-client-assign" data-assign-id="${escHtml(a.id)}" style="background:none;border:none;padding:0;cursor:pointer;font-size:13px;color:var(--so-neutral-30);font-family:var(--so-font-body)">— assign —</button>`
}
```

- [ ] **Step 3: Add click handler for client assign button**

In `document.getElementById('tasks-list').addEventListener('click', ...)`, add a new branch:

```js
const assignBtn = e.target.closest('.task-client-assign');
if (assignBtn) {
  const id = assignBtn.dataset.assignId;
  const action = allActions.find(a => a.id === id);
  const sel = document.createElement('select');
  sel.className = 'task-client-select';
  sel.innerHTML = '<option value="">Select client…</option>' +
    [...companyMap.entries()]
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([hid, name]) => `<option value="${escHtml(hid)}">${escHtml(name)}</option>`)
      .join('');
  assignBtn.replaceWith(sel);
  sel.focus();

  async function saveClient() {
    const hid = sel.value;
    if (hid && action) {
      action.hubspot_id = hid;
      await fetch(`${WORKER_URL}/actions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hubspot_id: hid }),
      }).catch(() => {});
    }
    render();
  }

  sel.addEventListener('change', saveClient);
  sel.addEventListener('blur', () => render()); // cancel if no selection
  return;
}
```

- [ ] **Step 4: Verify**

Create a task with no client (Task 7 will wire this up, but you can manually insert one via the worker curl test from Task 1). The cell should show "— assign —". Clicking it shows a dropdown; selecting a customer fires the PATCH and re-renders with the name.

- [ ] **Step 5: Commit**

```bash
git add site/tasks.html
git commit -m "feat: inline client assignment for tasks with no client"
```

---

## Task 7: Client name → card popup

**Files:**
- Modify: `site/tasks.html`

Port the card modal from `crm.html` into `tasks.html`. The card modal CSS is already in `style.css`.

- [ ] **Step 1: Copy the card overlay HTML**

In `tasks.html`, just before the closing `</body>` tag, add the overlay div:
```html
<div id="card-overlay" class="card-overlay"></div>
```

- [ ] **Step 2: Copy the data state variables from crm.html**

In `tasks.html`'s `<script>` block, near the top with the other state variables, add:
```js
let openCardId = null;
let pylonMap   = new Map();   // hubspot_id → { tickets, frt }
let posthogMap = new Map();   // hubspot_id → { sessions, users }
let callsMap   = new Map();   // hubspot_id → calls[]
let gmailMap   = new Map();   // hubspot_id → gmailUrl
```

- [ ] **Step 3: Copy and adapt renderCardLeft + renderCardRight functions**

Copy `renderCardLeft(company, c, gmailUrl, calls)` from `crm.html` lines 539–604 verbatim into `tasks.html`'s script block — no changes needed.

Copy `renderCardRight(actions)` from `crm.html` lines 605–649 into `tasks.html`, **but do not copy the body verbatim**. `crm.html` uses `actionsMap.get(openCardId)` to get actions for a company; `tasks.html` must use `allActions` instead. Before pasting, find every reference to `actionsMap` inside `renderCardRight` and in any helper it calls (`rerenderCardActions` if copied), and replace with:

```js
allActions.filter(a => String(a.hubspot_id) === openCardId)
```

Search for `actionsMap` in the copied block after pasting to confirm no occurrences remain.

- [ ] **Step 4: Copy openCard + closeCard functions**

From `crm.html` lines 694–736, copy `openCard(company)` and `closeCard()` verbatim into `tasks.html`'s script block.

- [ ] **Step 5: Copy card overlay event listeners**

From `crm.html`, copy the overlay click handlers (close on backdrop click, close button, Escape key):
```js
document.getElementById('card-overlay').addEventListener('click', e => {
  if (e.target === document.getElementById('card-overlay')) closeCard();
});
document.getElementById('card-overlay').addEventListener('click', e => {
  if (e.target.closest('#card-close')) closeCard();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeCard();
});
```

Note: tasks.html already has a keydown listener for Escape (closing the old modal). Replace it with this one.

- [ ] **Step 6: Wire the client name button to openCard**

In `document.getElementById('tasks-list').addEventListener('click', ...)`, add:
```js
const cardBtn = e.target.closest('[data-open-card]');
if (cardBtn) {
  const hid     = cardBtn.dataset.openCard;
  const company = { hubspot_id: hid, name: companyMap.get(hid) ?? hid, domain: '' };
  openCard(company);
  return;
}
```

- [ ] **Step 7: Fetch supporting data (Pylon, PostHog, Fireflies)**

`openCard` in crm.html uses `pylonMap`, `posthogMap`, `callsMap`, `gmailMap`. In tasks.html these will be empty Maps initially — the card will render with empty data sections (same graceful fallback as crm.html). No additional data fetching is required for the card to open correctly. The task/actions panel will use `allActions`.

- [ ] **Step 8: Verify**

Open `site/tasks.html`. Click a client name on a task row — the card modal should slide open showing the company name and the actions panel. Press Escape or click outside to close.

- [ ] **Step 9: Commit**

```bash
git add site/tasks.html
git commit -m "feat: client name opens card popup (ported from crm.html)"
```

---

## Task 8: Inline new task row (replaces modal)

**Files:**
- Modify: `site/tasks.html`

Replace the modal with an inline row at the top of the list. Type + Enter creates the task with med priority, no date, no client.

- [ ] **Step 1: Add CSS for the inline new-task row**

In the `<style>` block, add:
```css
.task-row--new {
  background: #F7FDF9;
  display: grid;
  grid-template-columns: 36px 1fr 100px 110px 160px 40px;
  align-items: center;
  padding: 12px 20px;
  border-bottom: 1px solid var(--so-neutral-5);
}
.task-new-input {
  font-size: 14px;
  font-weight: 500;
  color: var(--so-text-header);
  font-family: var(--so-font-body);
  border: none;
  outline: none;
  background: transparent;
  width: 100%;
  padding-right: 12px;
}
.task-new-input::placeholder { color: var(--so-neutral-30); font-weight: 400; }
.task-new-hint {
  font-size: 11px;
  color: var(--so-text-tag);
  padding: 3px 20px 8px 76px;
}
.task-new-hint kbd {
  display: inline-block;
  background: var(--so-neutral-5);
  color: var(--so-text-body);
  border-radius: 4px;
  padding: 1px 5px;
  font-size: 10px;
  font-weight: 600;
  font-family: var(--so-font-body);
}
.task-cell-placeholder {
  font-size: 12px;
  color: var(--so-neutral-30);
  font-style: italic;
  font-family: var(--so-font-body);
}
```

- [ ] **Step 2: Add `insertNewTaskRow()` function**

Add this function to the script block:
```js
function insertNewTaskRow() {
  const list = document.getElementById('tasks-list');
  // Don't insert if one already exists
  if (list.querySelector('.task-row--new')) return;

  const row = document.createElement('div');
  row.className = 'task-row--new';
  row.innerHTML = `
    <div></div>
    <input class="task-new-input" id="new-task-input" placeholder="Type task name and press Enter…" maxlength="200" autocomplete="off">
    <div class="task-cell-placeholder">Med</div>
    <div class="task-cell-placeholder">No date</div>
    <div class="task-cell-placeholder">No client</div>
    <div></div>
  `;

  const hint = document.createElement('div');
  hint.className = 'task-new-hint';
  hint.innerHTML = '<kbd>↵ Enter</kbd> to save &nbsp;·&nbsp; <kbd>Esc</kbd> to cancel';

  // Insert at top of list, before first child
  list.insertBefore(hint, list.firstChild);
  list.insertBefore(row, hint);

  const input = row.querySelector('#new-task-input');
  input.focus();

  input.addEventListener('keydown', async e => {
    if (e.key === 'Escape') {
      row.remove();
      hint.remove();
      return;
    }
    if (e.key === 'Enter') {
      const name = input.value.trim();
      if (!name) return;
      input.disabled = true;
      try {
        const action = await createAction('', name, 'med');
        allActions.unshift(action);
        populateCustomerFilter();
        activeTab = 'upcoming';
        document.querySelectorAll('.tasks-tab').forEach(t =>
          t.classList.toggle('tasks-tab--active', t.dataset.tab === 'upcoming')
        );
      } catch {
        input.disabled = false;
        input.focus();
        return;
      }
      row.remove();
      hint.remove();
      render();
    }
  });
}
```

- [ ] **Step 3: Update `createAction()` to allow empty hubspot_id**

Find the existing `createAction` function:
```js
async function createAction(hubspot_id, name, priority) {
  const res = await fetch(`${WORKER_URL}/actions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hubspot_id: String(hubspot_id), name, priority }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
```

It already passes `hubspot_id` — no change needed. The worker (updated in Task 1) now accepts `''`.

- [ ] **Step 4: Wire "New task" button to `insertNewTaskRow()`**

Find:
```js
document.getElementById('new-task-btn').addEventListener('click', openModal);
```

Replace with:
```js
document.getElementById('new-task-btn').addEventListener('click', () => {
  // Switch to Upcoming tab first so the row is visible
  activeTab = 'upcoming';
  document.querySelectorAll('.tasks-tab').forEach(t =>
    t.classList.toggle('tasks-tab--active', t.dataset.tab === 'upcoming')
  );
  render();
  insertNewTaskRow();
});
```

- [ ] **Step 5: Remove the modal HTML**

Delete the entire `<!-- New task modal -->` block (from `<div id="new-task-overlay" class="modal-overlay">` to its closing `</div>`).

- [ ] **Step 6: Remove modal CSS**

In the `<style>` block, delete all CSS rules for:
`.modal-overlay`, `.modal`, `@keyframes fadeIn`, `@keyframes slideUp`, `.modal-header`, `.modal-title`, `.modal-close`, `.modal-body`, `.field-label`, `.field-input`, `.field-select`, `.modal-footer`, `.modal-error`, `.btn-cancel`, `.btn-save`

- [ ] **Step 7: Remove modal JS**

Delete all modal JS: the `const overlay = ...` declaration, `openModal()`, `closeModal()` functions, and all event listeners referencing `new-task-overlay`, `new-task-close`, `nt-cancel`, `nt-save`, and the `nt-customer` / `nt-name` / `nt-error` / `nt-priority` element IDs.

Also update `populateCustomerFilter()`. By Task 4 the `#customer-filter` select is removed from the DOM, so any code in `populateCustomerFilter()` that targets `#customer-filter` or `#nt-customer` will silently fail or throw. Remove those select-population blocks entirely. The function only needs to keep the `companyMap` / `typeMap` data in sync (which is used by the inline client dropdown in Task 6 — that dropdown is built on demand from `companyMap` at click time, not pre-populated).

- [ ] **Step 8: Verify end to end**

Open `site/tasks.html`. Click "New task":
- The Upcoming tab activates
- An editable row appears at the top of the list
- Type "Test task" → press Enter
- Row disappears, new task appears in the list with Med priority, no date, "— assign —" for client
- Click the "— assign —" cell → dropdown appears → select a customer → PATCH fires → name shows

- [ ] **Step 9: Commit**

```bash
git add site/tasks.html
git commit -m "feat: inline new task row — type + Enter, replaces modal"
```

---

## Task 9: Push branch + get preview URL

- [ ] **Step 1: Push the feature branch**

```bash
cd /Users/mostyn/stack-plg
git push -u origin feat/cs-tasks-enhancements
```

- [ ] **Step 2: Wait for Cloudflare Pages build**

```bash
gh run list --repo cmostyn/stack-plg --limit 5
```

Wait until the run shows `completed`.

- [ ] **Step 3: Get the preview URL**

```bash
PREVIEW=$(gh api repos/cmostyn/stack-plg/commits/$(git rev-parse HEAD)/check-runs \
  --jq '.check_runs[] | select(.name=="Cloudflare Pages") | .output.summary' \
  | grep -o "https://[a-z0-9-]*\.stack-plg\.pages\.dev" | tail -1) \
  && echo "$PREVIEW" && open "$PREVIEW"
```

- [ ] **Step 4: Verify on the preview URL**

Check each of the 9 items:
1. ✅ No "Customer Support" in nav
2. ✅ Search box filters by task name and client name
3. ✅ PLG/SLG/Cust pills filter by customer type; active = white + green text
4. ✅ Toolbar order: search · type pills · priority pills · new task
5. ✅ Column headers left-align with cells
6. ✅ Clicking a due date shows an inline date picker; saves on blur/Enter
7. ✅ Client name on rows opens the card popup
8. ✅ Page background is #EEF8F3
9. ✅ "New task" creates inline row; Enter saves; "— assign —" cell triggers dropdown

- [ ] **Step 5: Share preview URL with Charlie**

Post the URL and say: "Ready to merge — say **ship it** when you want this live."
