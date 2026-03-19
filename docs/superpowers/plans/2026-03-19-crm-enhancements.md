# CRM Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Notes and Last contact live columns to the CRM table, add column drag-to-reorder with localStorage persistence, extend sorting to all 4 live columns, turn contact emails into Gmail compose links, add row animations, and fix a missing nav link.

**Architecture:** All changes are in three files — `fetch-hubspot.js` adds `last_contact` to the data, `crm.html` replaces the static render approach with a `colOrder`-driven dynamic render, and `style.css` adds the new classes. The `<thead>` is now rebuilt by `render()` on every call so drag-to-reorder works without any DOM cell-moving.

**Tech Stack:** Vanilla JS, HTML5 Drag and Drop API, CSS custom properties (`--so-*`), localStorage. No build step. Local preview: `npx serve site` then open `http://localhost:3000/crm.html`.

**Spec:** `docs/superpowers/specs/2026-03-19-crm-enhancements.md`

---

## Files changed

| File | What changes |
|---|---|
| `scripts/fetch-hubspot.js` | Add `notes_last_contacted` to contact fetch; derive `last_contact` per company |
| `site/crm.html` | Full JS refactor — dynamic headers, CELLS map, 4-column sort, drag-to-reorder, search extension, nav fix |
| `site/style.css` | New classes for drag, notes, date, mailto; cursor fix; search focus; row animation |

---

## Task 1: Create branch

- [ ] **Step 1: Create and switch to feature branch**

```bash
cd /Users/mostyn/Documents/stack-plg
git checkout -b feat/crm-enhancements
```

Expected: `Switched to a new branch 'feat/crm-enhancements'`

---

## Task 2: Data — add `last_contact` to fetch-hubspot.js

**Files:**
- Modify: `scripts/fetch-hubspot.js`

Three edits to make in order:

- [ ] **Step 1: Add `notes_last_contacted` to the contact properties array (line 100)**

Find this line:
```js
      properties: ['firstname', 'lastname', 'email', 'createdate'],
```

Replace with:
```js
      properties: ['firstname', 'lastname', 'email', 'createdate', 'notes_last_contacted'],
```

- [ ] **Step 2: Expose `notes_last_contacted` in the contact map (lines 108–113)**

Find this block (the `result.set()` call inside `fetchContacts()`):
```js
      result.set(c.id, {
        name:       [c.properties.firstname, c.properties.lastname].filter(Boolean).join(' ') || null,
        email:      c.properties.email ?? null,
        createdate: c.properties.createdate ?? null,
        _id:        c.id,
      });
```

Replace with:
```js
      result.set(c.id, {
        name:                 [c.properties.firstname, c.properties.lastname].filter(Boolean).join(' ') || null,
        email:                c.properties.email ?? null,
        createdate:           c.properties.createdate ?? null,
        notes_last_contacted: c.properties.notes_last_contacted ?? null,
        _id:                  c.id,
      });
```

- [ ] **Step 3: Derive `last_contact` per company in `main()` (lines 162–165)**

Find this block:
```js
  for (const company of companies) {
    const ids = assocMap.get(company.hubspot_id) ?? [];
    company.contact = pickPrimaryContact(ids, contactMap);
  }
```

Replace with:
```js
  for (const company of companies) {
    const ids = assocMap.get(company.hubspot_id) ?? [];
    company.contact = pickPrimaryContact(ids, contactMap);

    // Derive last contact date from all associated contacts' notes_last_contacted
    const timestamps = ids
      .map(id => contactMap.get(id)?.notes_last_contacted)
      .filter(Boolean)
      .map(ts => new Date(ts).getTime())
      .filter(t => !isNaN(t));
    company.last_contact = timestamps.length
      ? new Date(Math.max(...timestamps)).toISOString()
      : null;
  }
```

- [ ] **Step 4: Verify the script reads correctly**

```bash
node -e "const fs = require('fs'); const src = fs.readFileSync('scripts/fetch-hubspot.js', 'utf8'); console.log(src.includes('notes_last_contacted') ? 'OK: notes_last_contacted found' : 'MISSING'); console.log(src.includes('last_contact') ? 'OK: last_contact found' : 'MISSING');"
```

Expected:
```
OK: notes_last_contacted found
OK: last_contact found
```

- [ ] **Step 5: Regenerate `site/data/hubspot.json`**

The `.env` file must have `STACKONE_API_KEY` and `STACKONE_HUBSPOT_ACCOUNT_ID` set (see `.env.example`). Then run:

```bash
node scripts/fetch-hubspot.js
```

Expected output ends with: `[hubspot] Written to .../site/data/hubspot.json`

After the script completes, verify the new field is present:

```bash
node -e "const d = require('./site/data/hubspot.json'); const withContact = d.filter(c => c.last_contact); console.log('last_contact field present:', withContact.length > 0 ? 'YES (' + withContact.length + ' companies have data)' : 'NO (all null — check HubSpot notes_last_contacted property)');"
```

Expected: `last_contact field present: YES (N companies have data)` — or if all null, that means HubSpot has no `notes_last_contacted` values set yet (not a script error — the column will just show `—` placeholders for now).

- [ ] **Step 6: Commit**

```bash
git add scripts/fetch-hubspot.js site/data/hubspot.json
git commit -m "feat: add last_contact derivation to hubspot fetch"
```

---

## Task 3: CSS — new styles and fixes

**Files:**
- Modify: `site/style.css`

All edits are additions and one targeted replacement.

- [ ] **Step 1: Fix `.crm-search:focus` — replace existing rule (around line 538)**

Find this existing rule:
```css
.crm-search:focus {
  border-color: var(--so-neutral-30);
}
```

Replace with:
```css
.crm-search:focus {
  border-color: rgba(0, 175, 102, 0.4);
  outline: none;
  box-shadow: 0 0 0 2px rgba(0, 175, 102, 0.1);
}
```

- [ ] **Step 2: Add `transition` to `.crm-table td` (around line 583)**

Find the existing `.crm-table td { ... }` rule block and add `transition: background 0.12s;` inside it:

```css
.crm-table td {
  font-family: var(--so-font-body);
  font-size: 14px;
  /* ... existing properties ... */
  transition: background 0.12s;   /* ← add this line */
}
```

- [ ] **Step 4: Remove blanket `cursor: pointer` from `.crm-table th` (around line 572)**

Find this line inside `.crm-table th { ... }`:
```css
  cursor: pointer;
```

Delete that line only (keep the rest of the rule block intact).

- [ ] **Step 5: Add all new CSS classes after the existing `.crm-error` block (after line 618)**

Append this block at the end of the CRM section in `style.css` (find `.crm-error { ... }` and add after its closing brace):

```css

/* CRM — drag-to-reorder */
.crm-table th[draggable="true"] {
  cursor: grab;
}
.crm-table th[draggable="true"]:active {
  cursor: grabbing;
}
/* Sortable columns — placed after grab so pointer wins via cascade */
.crm-table th[data-col="name"],
.crm-table th[data-col="contact"],
.crm-table th[data-col="notes"],
.crm-table th[data-col="last_contact"] {
  cursor: pointer;
}
.crm-th--dragging {
  opacity: 0.4;
}
.crm-th--drag-over {
  outline: 2px dashed var(--so-primary);
  outline-offset: -2px;
}

/* CRM — notes cell */
.crm-notes {
  font-size: 13px;
  color: var(--so-text-body);
  max-width: 220px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* CRM — date cell */
.crm-date {
  font-size: 13px;
  color: var(--so-text-body);
  white-space: nowrap;
}

/* CRM — Gmail compose link */
.crm-mailto {
  color: var(--so-green-dark);
  text-decoration: none;
  font-size: 12px;
}
.crm-mailto:hover {
  text-decoration: underline;
}

/* CRM — row fade-in */
@keyframes crmRowIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}
.crm-table tbody tr {
  animation: crmRowIn 0.12s ease;
}
```

- [ ] **Step 6: Verify changes**

```bash
node -e "const fs = require('fs'); const s = fs.readFileSync('site/style.css', 'utf8'); ['crm-th--dragging','crm-th--drag-over','crm-notes','crm-date','crm-mailto','crmRowIn','transition: background'].forEach(c => console.log(s.includes(c) ? 'OK: ' + c : 'MISSING: ' + c)); console.log(s.includes('cursor: grab') ? 'OK: grab cursor present' : 'MISSING: grab'); const thBlock = s.match(/\.crm-table th\s*\{([^}]*)\}/); console.log(!thBlock || !thBlock[1].includes('cursor') ? 'OK: blanket cursor removed from .crm-table th' : 'FAIL: cursor still in .crm-table th block — check Step 4 was applied');"
```

Expected: all lines print `OK:`.

- [ ] **Step 7: Commit**

```bash
git add site/style.css
git commit -m "feat: add CRM drag, notes, date, mailto, animation styles"
```

---

## Task 4: HTML — nav fix, static header cleanup, colspan fix

> **Note:** After this task and through Task 5, the page will be non-functional — the static `<thead>` is removed and old sort listeners are deleted, but the new render system is not wired up until Task 6. Do not test the page in a browser until Task 6 Step 2.

**Files:**
- Modify: `site/crm.html`

Prepare the HTML structure. The static `<thead>` is replaced with an empty one that `render()` will populate. The static `id`-based listeners are removed. The nav gains the Connectors link.

- [ ] **Step 1: Add Connectors to the nav (around line 19)**

Find:
```html
        <a href="crm.html" class="site-nav-link site-nav-link--active">CRM</a>
        <a href="index.html" class="site-nav-link">Support Digests</a>
```

Replace with:
```html
        <a href="crm.html" class="site-nav-link site-nav-link--active">CRM</a>
        <a href="connectors.html" class="site-nav-link">Connectors</a>
        <a href="index.html" class="site-nav-link">Support Digests</a>
```

- [ ] **Step 2: Replace the static `<thead>` with an empty one (lines 40–52)**

Find the entire thead block:
```html
        <thead>
          <tr>
            <th id="th-name" aria-sort="ascending">Name</th>
            <th id="th-contact">Primary contact (HubSpot)</th>
            <th>Account (Pylon)</th>
            <th>Connected integrations (PostHog)</th>
            <th>API requests (PostHog)</th>
            <th>Tickets total (Pylon)</th>
            <th>Open tickets (Pylon)</th>
            <th>Open CS actions</th>
            <th>Last call (Fireflies)</th>
          </tr>
        </thead>
```

Replace with:
```html
        <thead></thead>
```

- [ ] **Step 3: Fix colspan in the loading row (line 54)**

Find:
```html
          <tr><td colspan="9" class="crm-placeholder" style="text-align:center;padding:32px">Loading…</td></tr>
```

Replace with:
```html
          <tr><td colspan="11" class="crm-placeholder" style="text-align:center;padding:32px">Loading…</td></tr>
```

- [ ] **Step 4: Remove the two static `getElementById` event listeners at the bottom of the script (lines 201–202)**

Find:
```js
    document.getElementById('th-name').addEventListener('click', () => setSort('name'));
    document.getElementById('th-contact').addEventListener('click', () => setSort('contact'));
```

Delete both lines entirely. (The replacement delegated listener comes in Task 7.)

- [ ] **Step 5: Verify**

```bash
node -e "const fs = require('fs'); const h = fs.readFileSync('site/crm.html', 'utf8'); console.log(!h.includes('id=\"th-name\"') ? 'OK: no th-name id' : 'FAIL: th-name id still present'); console.log(h.includes('connectors.html') ? 'OK: connectors link' : 'FAIL: connectors missing'); console.log(h.includes('colspan=\"11\"') ? 'OK: colspan 11' : 'FAIL: colspan wrong'); console.log(h.includes('<thead></thead>') ? 'OK: empty thead' : 'FAIL: thead not empty');"
```

Expected: all lines print `OK:`.

- [ ] **Step 6: Commit**

```bash
git add site/crm.html
git commit -m "fix: nav Connectors link, empty thead, colspan 11"
```

---

## Task 5: Column infrastructure and cell renderers

**Files:**
- Modify: `site/crm.html` (inside the `<script>` block)

Add all the constants and helper functions that the new render system needs. Do not yet change `render()` or `setSort()` — those come in Tasks 6 and 7.

- [ ] **Step 1: Replace the constants block at the top of the script (around line 62)**

Find:
```js
    // --- Constants ---
    const PLACEHOLDER_CELL = '<td class="crm-placeholder" title="Coming soon">—</td>';
    const PLACEHOLDER_COLS = 7; // columns 3–9
```

Replace with:
```js
    // --- Constants ---
    const PLACEHOLDER_CELL = '<td class="crm-placeholder" title="Coming soon">—</td>';

    const DEFAULT_COL_ORDER = [
      'name', 'contact', 'notes', 'last_contact',
      'account', 'integrations', 'api_requests',
      'tickets_total', 'open_tickets', 'cs_actions', 'last_call',
    ];

    const COL_HEADERS = {
      name:          () => `<th data-col="name" draggable="true">Name</th>`,
      contact:       () => `<th data-col="contact" draggable="true">Primary contact (HubSpot)</th>`,
      notes:         () => `<th data-col="notes" draggable="true">Notes (HubSpot)</th>`,
      last_contact:  () => `<th data-col="last_contact" draggable="true">Last contact (HubSpot)</th>`,
      account:       () => `<th data-col="account" draggable="true">Account (Pylon)</th>`,
      integrations:  () => `<th data-col="integrations" draggable="true">Connected integrations (PostHog)</th>`,
      api_requests:  () => `<th data-col="api_requests" draggable="true">API requests (PostHog)</th>`,
      tickets_total: () => `<th data-col="tickets_total" draggable="true">Tickets total (Pylon)</th>`,
      open_tickets:  () => `<th data-col="open_tickets" draggable="true">Open tickets (Pylon)</th>`,
      cs_actions:    () => `<th data-col="cs_actions" draggable="true">Open CS actions</th>`,
      last_call:     () => `<th data-col="last_call" draggable="true">Last call (Fireflies)</th>`,
    };

    const CELLS = {
      name: company => {
        const display = company.name ?? company.hubspot_id;
        const href    = safeHref(company.hubspot_url);
        return `<td><a href="${href}" target="_blank" rel="noopener">${escHtml(display)}</a></td>`;
      },
      contact: company => {
        const c = isContactObj(company.contact) ? company.contact : null;
        if (!c) return PLACEHOLDER_CELL;
        const gmailUrl = c.email
          ? `https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(c.email)}`
          : null;
        return `<td>
          <div class="crm-contact-name">${escHtml(c.name ?? '')}</div>
          ${gmailUrl
            ? `<div class="crm-contact-email"><a href="${escHtml(gmailUrl)}" target="_blank" rel="noopener" class="crm-mailto">${escHtml(c.email)}</a></div>`
            : ''}
        </td>`;
      },
      notes: company => {
        const n = company.notes;
        if (!n) return PLACEHOLDER_CELL;
        const truncated = n.length > 80 ? n.slice(0, 80) + '…' : n;
        return `<td class="crm-notes" title="${escHtml(n)}">${escHtml(truncated)}</td>`;
      },
      last_contact: company => {
        const rel = relativeTime(company.last_contact);
        if (!rel) return PLACEHOLDER_CELL;
        const abs = new Date(company.last_contact).toLocaleDateString('en-GB', {
          day: 'numeric', month: 'short', year: 'numeric',
        });
        return `<td class="crm-date" title="${escHtml(abs)}">${escHtml(rel)}</td>`;
      },
      account:       () => PLACEHOLDER_CELL,
      integrations:  () => PLACEHOLDER_CELL,
      api_requests:  () => PLACEHOLDER_CELL,
      tickets_total: () => PLACEHOLDER_CELL,
      open_tickets:  () => PLACEHOLDER_CELL,
      cs_actions:    () => PLACEHOLDER_CELL,
      last_call:     () => PLACEHOLDER_CELL,
    };
```

- [ ] **Step 2: Add `loadColOrder()` and `relativeTime()` to the Helpers section**

Find the existing helpers section (after `contactSortValue()`). Insert these two functions immediately before `renderRow()` (they need to go before `CELLS` uses them — but since `CELLS` is a const and `relativeTime` is called at call-time not definition-time, placement just needs to be before `render()` is called). Insert after `contactSortValue`:

```js
    function loadColOrder() {
      try {
        const parsed = JSON.parse(localStorage.getItem('plg_crm_col_order'));
        const valid =
          Array.isArray(parsed) &&
          parsed.length === DEFAULT_COL_ORDER.length &&
          new Set(parsed).size === DEFAULT_COL_ORDER.length &&
          DEFAULT_COL_ORDER.every(k => parsed.includes(k));
        return valid ? parsed : [...DEFAULT_COL_ORDER];
      } catch {
        return [...DEFAULT_COL_ORDER];
      }
    }

    function relativeTime(iso) {
      if (!iso) return null;
      const diff = Date.now() - new Date(iso).getTime();
      if (isNaN(diff) || diff < 0) return 'Today';
      const days = Math.floor(diff / 86400000);
      if (days === 0)  return 'Today';
      if (days === 1)  return 'Yesterday';
      if (days < 7)    return `${days} days ago`;
      const weeks = Math.floor(days / 7);
      if (weeks < 8)   return `${weeks} ${weeks === 1 ? 'week' : 'weeks'} ago`;
      const months = Math.floor(days / 30);
      if (months < 2)  return `${weeks} weeks ago`;
      if (months < 24) return `${months} months ago`;
      const years = Math.floor(days / 365);
      return `${years} ${years === 1 ? 'year' : 'years'} ago`;
    }
```

- [ ] **Step 3: Delete the `renderRow()` function (lines 103–117 in original)**

Find and delete this entire function (it is replaced by the `CELLS` map):
```js
    function renderRow(company) {
      const displayName = company.name ?? company.hubspot_id;
      const href        = safeHref(company.hubspot_url);
      const nameCell    = `<td><a href="${href}" target="_blank" rel="noopener">${escHtml(displayName)}</a></td>`;

      const c = isContactObj(company.contact) ? company.contact : null;
      const contactCell = c
        ? `<td>
            <div class="crm-contact-name">${escHtml(c.name ?? '')}</div>
            ${c.email ? `<div class="crm-contact-email">${escHtml(c.email)}</div>` : ''}
           </td>`
        : `<td class="crm-placeholder">—</td>`;

      return `<tr>${nameCell}${contactCell}${PLACEHOLDER_CELL.repeat(PLACEHOLDER_COLS)}</tr>`;
    }
```

- [ ] **Step 4: Add `colOrder` state variable to the State section**

Find:
```js
    let clickCounts = { name: 1, contact: 0 }; // name starts at 1 (already asc)
```

Add one line after it:
```js
    let colOrder = loadColOrder();
```

- [ ] **Step 5: Verify**

```bash
node -e "const fs = require('fs'); const h = fs.readFileSync('site/crm.html', 'utf8'); console.log(h.includes('DEFAULT_COL_ORDER') ? 'OK: DEFAULT_COL_ORDER' : 'FAIL'); console.log(h.includes('relativeTime') ? 'OK: relativeTime' : 'FAIL'); console.log(h.includes('loadColOrder') ? 'OK: loadColOrder' : 'FAIL'); console.log(!h.includes('renderRow') ? 'OK: renderRow deleted' : 'FAIL: renderRow still present'); console.log(h.includes('colOrder = loadColOrder') ? 'OK: colOrder state' : 'FAIL');"
```

Expected: all lines print `OK:`.

- [ ] **Step 6: Commit**

```bash
git add site/crm.html
git commit -m "feat: add column infrastructure, CELLS map, relativeTime helper"
```

---

## Task 6: Refactor `render()` to use `colOrder`

**Files:**
- Modify: `site/crm.html`

`render()` now rebuilds both `<thead>` and `<tbody>` from `colOrder`. `aria-sort` is set inside `render()` (not in `setSort()`) so the default sort indicator appears on initial load.

- [ ] **Step 1: Replace the `render()` function**

Find the entire existing `render()` function:
```js
    // --- Render ---

    function render() {
      const query    = document.getElementById('crm-search').value.trim();
      const filtered = query ? allRows.filter(c => searchMatch(c, query)) : allRows;
      const display  = sortedRows(filtered);

      document.getElementById('crm-tbody').innerHTML = display.map(renderRow).join('');

      const total = allRows.length;
      const shown = display.length;
      document.getElementById('crm-count').textContent =
        query ? `${shown} of ${total} customers` : `${total} customers`;
    }
```

Replace with:
```js
    // --- Render ---

    function render() {
      const table    = document.querySelector('.crm-table');
      const thead    = table.querySelector('thead');
      const tbody    = table.querySelector('tbody');
      const query    = document.getElementById('crm-search').value.trim();
      const filtered = query ? allRows.filter(c => searchMatch(c, query)) : allRows;
      const display  = sortedRows(filtered);

      // Rebuild thead from colOrder
      thead.innerHTML = `<tr>${colOrder.map(col => COL_HEADERS[col]()).join('')}</tr>`;

      // Set aria-sort on the active sort column
      thead.querySelectorAll('th[data-col]').forEach(th => th.removeAttribute('aria-sort'));
      const activeTh = thead.querySelector(`th[data-col="${sortKey}"]`);
      if (activeTh) activeTh.setAttribute('aria-sort', sortDir === 'asc' ? 'ascending' : 'descending');

      // Rebuild tbody from colOrder
      tbody.innerHTML = display.map(company =>
        `<tr>${colOrder.map(col => CELLS[col](company)).join('')}</tr>`
      ).join('');

      const total = allRows.length;
      const shown = display.length;
      document.getElementById('crm-count').textContent =
        query ? `${shown} of ${total} customers` : `${total} customers`;
    }
```

- [ ] **Step 2: Open in browser and do a basic smoke test**

Start a local server:
```bash
npx serve site -l 3000
```

Open `http://localhost:3000/crm.html`. Check:
- Page loads without JS errors in DevTools console
- Table shows 11 columns with correct headers
- First column header shows `↑` (ascending aria-sort indicator)
- All rows render — Name column has green links, Contact column shows name + email link, Notes and Last contact show real data or `—`
- "N customers" count appears in the toolbar

- [ ] **Step 3: Commit**

```bash
git add site/crm.html
git commit -m "feat: render() rebuilds thead and tbody from colOrder"
```

---

## Task 7: Sort refactor — 4 columns, table delegation

**Files:**
- Modify: `site/crm.html`

Extend `clickCounts` to 4 keys, add `lastContactSortValue()`, update `sortedRows()` to handle all 4 sort keys, and replace the deleted per-element click listeners with a single delegated listener on the table.

- [ ] **Step 1: Update `clickCounts` initialisation (in State section)**

Find:
```js
    let clickCounts = { name: 1, contact: 0 }; // name starts at 1 (already asc)
```

Replace with:
```js
    let clickCounts = { name: 1, contact: 0, notes: 0, last_contact: 0 }; // name starts at 1 (already asc)
```

- [ ] **Step 2: Add `lastContactSortValue()` to the Helpers section**

Add this function after `relativeTime()`:
```js
    function lastContactSortValue(company, dir) {
      if (!company.last_contact) return dir === 'asc' ? Infinity : -Infinity;
      const t = new Date(company.last_contact).getTime();
      return isNaN(t) ? (dir === 'asc' ? Infinity : -Infinity) : t;
    }
```

- [ ] **Step 3: Replace `sortedRows()` with the 4-key version**

Find the existing `sortedRows()`:
```js
    function sortedRows(rows) {
      return [...rows].sort((a, b) => {
        const dir = sortDir === 'asc' ? 1 : -1;
        if (sortKey === 'contact') {
          return dir * contactSortValue(a).localeCompare(contactSortValue(b));
        }
        return dir * (a.name ?? '').localeCompare(b.name ?? '');
      });
    }
```

Replace with:
```js
    function sortedRows(rows) {
      return [...rows].sort((a, b) => {
        const dir = sortDir === 'asc' ? 1 : -1;

        if (sortKey === 'contact') {
          return dir * contactSortValue(a).localeCompare(contactSortValue(b));
        }

        if (sortKey === 'notes') {
          // Nulls always sort last in both directions
          if (!a.notes && !b.notes) return 0;
          if (!a.notes) return 1;
          if (!b.notes) return -1;
          return dir * a.notes.toLowerCase().localeCompare(b.notes.toLowerCase());
        }

        if (sortKey === 'last_contact') {
          const va = lastContactSortValue(a, sortDir);
          const vb = lastContactSortValue(b, sortDir);
          if (va === vb) return 0;
          return va > vb ? dir : -dir;
        }

        // Default: name
        return dir * (a.name ?? '').localeCompare(b.name ?? '');
      });
    }
```

- [ ] **Step 4: Update the `setSort()` else-branch reset to use 4 keys**

Find this line inside the `else` block of `setSort()`:
```js
        clickCounts = { name: 1, contact: 0 };
```

Replace with:
```js
        clickCounts = { name: 1, contact: 0, notes: 0, last_contact: 0 };
```

- [ ] **Step 5: Remove the old `aria-sort` management from `setSort()`**

Find and delete these lines inside `setSort()`:
```js
      // Update aria-sort on sortable headers
      const thName    = document.getElementById('th-name');
      const thContact = document.getElementById('th-contact');
      thName.removeAttribute('aria-sort');
      thContact.removeAttribute('aria-sort');
      const activeEl = sortKey === 'contact' ? thContact : thName;
      activeEl.setAttribute('aria-sort', sortDir === 'asc' ? 'ascending' : 'descending');
```

The `render()` call at the end of `setSort()` already handles `aria-sort` now. Keep the `render();` call.

- [ ] **Step 6: Add the delegated sort click listener to the Init section**

In the init section (after the data fetch and search input listener), add:
```js
    document.querySelector('.crm-table').addEventListener('click', e => {
      const th = e.target.closest('th[data-col]');
      if (!th) return;
      const col = th.dataset.col;
      if (['name', 'contact', 'notes', 'last_contact'].includes(col)) {
        setSort(col);
      }
    });
```

- [ ] **Step 7: Verify in browser**

Open `http://localhost:3000/crm.html`. Check:
- Clicking "Name" cycles: ascending (↑) → descending (↓) → reset to ascending (↑)
- Clicking "Notes" sorts alphabetically ascending first click, descending second, resets third
- Clicking "Last contact" sorts most recent first on first click (ascending), oldest first on second click, resets third
- Companies with no last_contact always appear at the bottom in both sort directions
- Clicking a non-sortable column header (e.g. "Account (Pylon)") does nothing

- [ ] **Step 8: Commit**

```bash
git add site/crm.html
git commit -m "feat: 4-column sort with lastContactSortValue and table delegation"
```

---

## Task 8: Search extension — include notes

**Files:**
- Modify: `site/crm.html`

One line addition to `searchMatch()`.

- [ ] **Step 1: Add notes to `searchMatch()`**

Find this line in `searchMatch()`:
```js
        (c?.email ?? '').toLowerCase().includes(q)
```

Replace with:
```js
        (c?.email ?? '').toLowerCase().includes(q) ||
        (company.notes ?? '').toLowerCase().includes(q)
```

- [ ] **Step 2: Verify in browser**

Open `http://localhost:3000/crm.html`. Type a word that appears in a company's notes but not in their name, domain, or contact. The table should filter to show that company.

- [ ] **Step 3: Commit**

```bash
git add site/crm.html
git commit -m "feat: extend search to include notes"
```

---

## Task 9: Drag-to-reorder columns

**Files:**
- Modify: `site/crm.html`

Add `dragSrcCol` state and all five drag event handlers on the table element. `render()` already rebuilds from `colOrder` so the swap + re-render is the complete implementation.

- [ ] **Step 1: Add `dragSrcCol` to the State section**

Find:
```js
    let colOrder = loadColOrder();
```

Add one line after it:
```js
    let dragSrcCol = null;
```

- [ ] **Step 2: Add the drag event listeners in the Init section**

After the sort click listener added in Task 7, add:

```js
    // --- Drag-to-reorder ---
    const crmTable = document.querySelector('.crm-table');

    crmTable.addEventListener('dragstart', e => {
      const th = e.target.closest('th[data-col]');
      if (!th) return;
      dragSrcCol = th.dataset.col;
      th.classList.add('crm-th--dragging');
    });

    crmTable.addEventListener('dragover', e => {
      e.preventDefault();
      const th = e.target.closest('th');
      if (!th) return;
      document.querySelectorAll('.crm-table thead th').forEach(el => el.classList.remove('crm-th--drag-over'));
      th.classList.add('crm-th--drag-over');
    });

    crmTable.addEventListener('dragend', () => {
      document.querySelectorAll('.crm-table thead th').forEach(el => {
        el.classList.remove('crm-th--dragging');
        el.classList.remove('crm-th--drag-over');
      });
      dragSrcCol = null;
    });

    crmTable.addEventListener('drop', e => {
      e.preventDefault();
      const targetCol = e.target.closest('th[data-col]')?.dataset.col;
      if (!dragSrcCol || !targetCol || dragSrcCol === targetCol) return;
      const srcIdx = colOrder.indexOf(dragSrcCol);
      const tgtIdx = colOrder.indexOf(targetCol);
      if (srcIdx === -1 || tgtIdx === -1) return;
      [colOrder[srcIdx], colOrder[tgtIdx]] = [colOrder[tgtIdx], colOrder[srcIdx]];
      localStorage.setItem('plg_crm_col_order', JSON.stringify(colOrder));
      render();
    });
```

- [ ] **Step 3: Verify in browser**

Open `http://localhost:3000/crm.html`. Check:
- Hovering a column header shows `grab` cursor
- Hovering a sortable column header shows `pointer` cursor (sortable columns override grab)
- Dragging "Last contact" header onto "Name" header: the two columns swap positions. Table re-renders immediately.
- Reload the page — the swapped order is restored from localStorage
- Dragging onto a `<td>` cell (body area) does not throw an error and does not change the column order
- Opening DevTools Application → Local Storage → confirm `plg_crm_col_order` key is set

- [ ] **Step 4: Commit**

```bash
git add site/crm.html
git commit -m "feat: column drag-to-reorder with localStorage persistence"
```

---

## Task 10: Final verification and push

- [ ] **Step 1: Full end-to-end check in browser**

Open `http://localhost:3000/crm.html`. Verify all features:

| Feature | Expected |
|---|---|
| Nav | Dashboard / CRM (active) / Connectors / Support Digests |
| Column count | 11 columns |
| Name column | Green link to HubSpot |
| Contact column | Name + Gmail compose link (not mailto:) |
| Notes column | Truncated at 80 chars, full text on hover title |
| Last contact column | Relative time (e.g. "12 days ago"), absolute date on hover |
| Empty cells | `—` placeholder for companies with no data |
| Sort — Name | Click: A→Z → Z→A → reset |
| Sort — Notes | Click: A→Z → Z→A → reset; nulls always at bottom |
| Sort — Last contact | Click: most recent first → oldest first → reset; nulls always at bottom |
| Drag | Swap two columns, reload, order persists |
| Search | Filters by name, domain, contact, AND notes |
| Search focus | Green focus ring on search input |
| Row animation | Rows fade in on each render |

- [ ] **Step 2: Push branch**

```bash
git push -u origin feat/crm-enhancements
```

Expected: Cloudflare Pages preview URL in the terminal output (or check the Pages dashboard).
