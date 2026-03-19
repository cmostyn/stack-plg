# CRM Enhancements — Design Spec
Date: 2026-03-19

## Overview

Enhance the CRM table with two new live columns (Notes, Last contact), column
drag-to-reorder with localStorage persistence, sortable live columns, contact
email as a Gmail compose link, row fade-in animation, green focus ring on the
search input, and a missing Connectors nav link. All styling uses the existing
CSS custom properties and matches the dashboard's interaction patterns.

---

## Files changed

| File | Change |
|---|---|
| `scripts/fetch-hubspot.js` | Add `notes_last_contacted` to contact properties fetch |
| `site/data/hubspot.json` | Regenerated with `last_contact` field per company |
| `site/crm.html` | All JS and HTML changes |
| `site/style.css` | New and updated styles |

---

## Data changes

### fetch-hubspot.js

`notes_last_contacted` is a **Contact** property in HubSpot (not a Company
property). We already fetch associated contacts per company. Derive last contact
date from them.

**Step 1:** Add `'notes_last_contacted'` to the contact properties array in
`fetchContacts()`:
```js
properties: ['firstname', 'lastname', 'email', 'createdate', 'notes_last_contacted'],
```

**Step 2:** Expose it in the contact map inside `fetchContacts()`:
```js
result.set(c.id, {
  name:               [c.properties.firstname, c.properties.lastname].filter(Boolean).join(' ') || null,
  email:              c.properties.email ?? null,
  createdate:         c.properties.createdate ?? null,
  notes_last_contacted: c.properties.notes_last_contacted ?? null,
  _id:                c.id,
});
```

**Step 3:** Add a `last_contact` field to each company in `main()`. After
`company.contact` is set, compute the most recent `notes_last_contacted` across
all associated contacts:

```js
for (const company of companies) {
  const ids = assocMap.get(company.hubspot_id) ?? [];
  company.contact = pickPrimaryContact(ids, contactMap);

  // Derive last contact date from all associated contacts
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

Output shape per company (added field):
```json
{
  "last_contact": "2026-03-12T14:32:00.000Z"
}
```

`notes` is already in `hubspot.json` — no change needed for that property.

---

## Nav fix

Add the Connectors nav link to `site/crm.html`. It was missing after the March 19
merge. Insert between CRM and Support Digests:

```html
<a href="connectors.html" class="site-nav-link">Connectors</a>
```

---

## Columns

11 columns total. The `PLACEHOLDER_CELL.repeat(7)` approach is replaced with a
per-column render function so columns can be individually reordered. The existing
9 columns are unchanged except: `notes` and `last_contact` are inserted as new
live columns (positions 3 and 4 in the default order), making 11 total.

| Key | Header | Source label | Data | Sortable |
|---|---|---|---|---|
| `name` | Name | HubSpot | `company.name` → link to `hubspot_url` | ✓ A→Z / Z→A |
| `contact` | Primary contact | HubSpot | contact name + Gmail compose link for email | ✓ by last name |
| `notes` | Notes | HubSpot | `company.notes` — truncated at 80 chars, full text on `title` | ✓ A→Z / Z→A |
| `last_contact` | Last contact | HubSpot | `company.last_contact` — relative time, absolute date on `title` | ✓ most recent first |
| `account` | Account (Pylon) | — | `—` placeholder | ✗ |
| `integrations` | Connected integrations (PostHog) | — | `—` placeholder | ✗ |
| `api_requests` | API requests (PostHog) | — | `—` placeholder | ✗ |
| `tickets_total` | Tickets total (Pylon) | — | `—` placeholder | ✗ |
| `open_tickets` | Open tickets (Pylon) | — | `—` placeholder | ✗ |
| `cs_actions` | Open CS actions | — | `—` placeholder | ✗ |
| `last_call` | Last call (Fireflies) | — | `—` placeholder | ✗ |

---

## Sorting

Three-click cycle per column: first click → ascending, second click → descending,
third click → reset to global default (name A→Z). Same mechanic as existing code.

**`clickCounts` initialisation** must include all 4 sortable keys:
```js
let clickCounts = { name: 1, contact: 0, notes: 0, last_contact: 0 };
```

On reset (third click), **both** the initialisation value above and the `else` branch inside `setSort()` must use all 4 keys:
```js
// Inside setSort(), else branch:
sortKey = 'name'; sortDir = 'asc';
clickCounts = { name: 1, contact: 0, notes: 0, last_contact: 0 };
```

Replace the existing `clickCounts = { name: 1, contact: 0 }` reset line inside `setSort()` with the 4-key version above.

Sortable columns and their sort values:

| Key | Sort value | Nulls |
|---|---|---|
| `name` | `(company.name ?? '').toLowerCase()` | sort last |
| `contact` | `contactSortValue(company)` — last name first, existing function | sort last (`'\uffff'`) |
| `notes` | `company.notes.toLowerCase()` | always sort last in both directions |
| `last_contact` | `new Date(company.last_contact).getTime()` | always sort last in both directions |

**Null guard for `last_contact`:**
```js
function lastContactSortValue(company, dir) {
  if (!company.last_contact) return dir === 'asc' ? Infinity : -Infinity;
  const t = new Date(company.last_contact).getTime();
  return isNaN(t) ? (dir === 'asc' ? Infinity : -Infinity) : t;
}
```

Pass `sortDir` when computing this value so nulls always appear last regardless of sort direction.

**Updated `sortedRows()` function** — replace the existing function entirely:
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

**Click listeners for sort** — the existing `getElementById('th-name').addEventListener` approach must be removed. Since `render()` rebuilds the `<thead>` on every call, use a single delegated listener on the `<table>` element instead. Wire this once after data loads:
```js
table.addEventListener('click', e => {
  const th = e.target.closest('th[data-col]');
  if (!th) return;
  const col = th.dataset.col;
  if (['name', 'contact', 'notes', 'last_contact'].includes(col)) {
    setSort(col);
  }
});
```

Remove the existing `getElementById('th-name')` and `getElementById('th-contact')` listener lines entirely.

**`aria-sort` management:** After the dynamic-header refactor, headers are
rendered by `colOrder` and do not have stable IDs. Manage `aria-sort` via
`data-col` attribute. Place this logic **inside `render()`**, immediately after rebuilding `thead.innerHTML`. This ensures the sort indicator is correct on initial page load and after every re-render, not just after sort clicks:
```js
// Inside render(), after thead.innerHTML is set:
document.querySelectorAll('.crm-table thead th[data-col]').forEach(th => {
  th.removeAttribute('aria-sort');
});
const activeTh = document.querySelector(`.crm-table thead th[data-col="${sortKey}"]`);
if (activeTh) activeTh.setAttribute('aria-sort', sortDir === 'asc' ? 'ascending' : 'descending');
```

---

## Column drag-to-reorder

### State

Default order array:
```js
const DEFAULT_COL_ORDER = [
  'name', 'contact', 'notes', 'last_contact',
  'account', 'integrations', 'api_requests',
  'tickets_total', 'open_tickets', 'cs_actions', 'last_call'
];
```

`localStorage` key: `plg_crm_col_order`

On page load: read from localStorage. Validate that the stored value is a JSON array containing exactly all 11 keys (no more, no fewer, no duplicates). Otherwise fall back to `DEFAULT_COL_ORDER`. This guards against stale stored orders from before this feature.

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
let colOrder = loadColOrder();
```

### HTML

Each `<th>` is rendered with:
```html
<th data-col="name" draggable="true" ...>Name</th>
```

### Drag events

Attach all drag event listeners to the `<table>` element using event delegation.

- `dragstart`: store `dragSrcCol = e.target.closest('th')?.dataset.col`. Add
  `.crm-th--dragging` to the source `<th>`.
- `dragover`:
  ```js
  e.preventDefault();
  const th = e.target.closest('th');
  if (!th) return; // guard: dragging over tbody cells must not throw
  document.querySelectorAll('.crm-table thead th').forEach(el => el.classList.remove('crm-th--drag-over'));
  th.classList.add('crm-th--drag-over');
  ```
- `dragleave`: no action needed — `dragover` handles the class swap, and `dragend` cleans up on release.
- `dragend`: remove both `.crm-th--dragging` and `.crm-th--drag-over` from all headers. Clear `dragSrcCol = null`.
- `drop` — complete handler body:
  ```js
  e.preventDefault();
  const targetCol = e.target.closest('th[data-col]')?.dataset.col;
  if (!dragSrcCol || !targetCol || dragSrcCol === targetCol) return;
  const srcIdx = colOrder.indexOf(dragSrcCol);
  const tgtIdx = colOrder.indexOf(targetCol);
  if (srcIdx === -1 || tgtIdx === -1) return;
  [colOrder[srcIdx], colOrder[tgtIdx]] = [colOrder[tgtIdx], colOrder[srcIdx]];
  localStorage.setItem('plg_crm_col_order', JSON.stringify(colOrder));
  render();
  ```

**Swap behaviour:** dragging column A onto column B exchanges their positions. Column A moves to B's slot and B moves to A's slot. Other columns are unaffected. This is simpler than insert-at and consistent with the dashboard tile drag behaviour.

Since `render()` rebuilds the entire `<thead>` and `<tbody>` from `colOrder`, no
manual DOM cell-moving is needed — the swap + re-render is the full implementation.

### Cursor

```css
.crm-table th[draggable="true"] { cursor: grab; }
.crm-table th[draggable="true"]:active { cursor: grabbing; }
```

---

## Cell rendering

Replace the `PLACEHOLDER_CELL.repeat(7)` approach with a `CELLS` map and
per-column header renderer.

```js
const PLACEHOLDER_CELL = '<td class="crm-placeholder" title="Coming soon">—</td>';

const COL_HEADERS = {
  name:         () => `<th data-col="name" draggable="true">Name</th>`,
  contact:      () => `<th data-col="contact" draggable="true">Primary contact (HubSpot)</th>`,
  notes:        () => `<th data-col="notes" draggable="true">Notes (HubSpot)</th>`,
  last_contact: () => `<th data-col="last_contact" draggable="true">Last contact (HubSpot)</th>`,
  account:      () => `<th data-col="account" draggable="true">Account (Pylon)</th>`,
  integrations: () => `<th data-col="integrations" draggable="true">Connected integrations (PostHog)</th>`,
  api_requests: () => `<th data-col="api_requests" draggable="true">API requests (PostHog)</th>`,
  tickets_total:() => `<th data-col="tickets_total" draggable="true">Tickets total (Pylon)</th>`,
  open_tickets: () => `<th data-col="open_tickets" draggable="true">Open tickets (Pylon)</th>`,
  cs_actions:   () => `<th data-col="cs_actions" draggable="true">Open CS actions</th>`,
  last_call:    () => `<th data-col="last_call" draggable="true">Last call (Fireflies)</th>`,
};

const CELLS = {
  name:         company => { /* name + HubSpot link */ },
  contact:      company => { /* name + Gmail compose link */ },
  notes:        company => { /* truncated notes or — */ },
  last_contact: company => { /* relative time or — */ },
  account:      ()      => PLACEHOLDER_CELL,
  integrations: ()      => PLACEHOLDER_CELL,
  api_requests: ()      => PLACEHOLDER_CELL,
  tickets_total:()      => PLACEHOLDER_CELL,
  open_tickets: ()      => PLACEHOLDER_CELL,
  cs_actions:   ()      => PLACEHOLDER_CELL,
  last_call:    ()      => PLACEHOLDER_CELL,
};
```

`render()` rebuilds `<thead>` and `<tbody>`. Delete the existing `renderRow()` function entirely — it is replaced by the `CELLS` map:
```js
thead.innerHTML = `<tr>${colOrder.map(col => COL_HEADERS[col]()).join('')}</tr>`;
tbody.innerHTML = display.map(company =>
  `<tr>${colOrder.map(col => CELLS[col](company)).join('')}</tr>`
).join('');
```

After rebuilding the thead, call the `aria-sort` update (see Sorting section).

**Loading state:** The existing `<tbody>` contains a loading row with `colspan="9"`. Update it to `colspan="11"` to match the new column count. Keep the existing padding value (do not change it):
```html
<tr><td colspan="11" class="crm-placeholder" style="text-align:center;padding:32px">Loading…</td></tr>
```

### Name cell

```js
name: company => {
  const display = company.name ?? company.hubspot_id;
  const href    = safeHref(company.hubspot_url);
  return `<td><a href="${href}" target="_blank" rel="noopener">${escHtml(display)}</a></td>`;
}
```

### Contact cell

```js
contact: company => {
  const c = isContactObj(company.contact) ? company.contact : null;
  if (!c) return PLACEHOLDER_CELL;
  const gmailUrl = c.email
    ? `https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(c.email)}`
    : null;
  return `<td>
    <div class="crm-contact-name">${escHtml(c.name ?? '')}</div>
    ${gmailUrl
      ? `<div class="crm-contact-email">
           <a href="${escHtml(gmailUrl)}" target="_blank" rel="noopener" class="crm-mailto">
             ${escHtml(c.email)}
           </a>
         </div>`
      : ''}
  </td>`;
}
```

### Notes cell

```js
notes: company => {
  const n = company.notes;
  if (!n) return PLACEHOLDER_CELL;
  const truncated = n.length > 80 ? n.slice(0, 80) + '…' : n;
  return `<td class="crm-notes" title="${escHtml(n)}">${escHtml(truncated)}</td>`;
}
```

### Last contact cell

```js
last_contact: company => {
  const rel = relativeTime(company.last_contact);
  if (!rel) return PLACEHOLDER_CELL;
  const abs = new Date(company.last_contact).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric'
  });
  return `<td class="crm-date" title="${escHtml(abs)}">${escHtml(rel)}</td>`;
}
```

---

## Relative time helper

```js
function relativeTime(iso) {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  if (isNaN(diff) || diff < 0) return 'Today'; // future/invalid dates clamp to Today
  const days = Math.floor(diff / 86400000);
  if (days === 0)  return 'Today';
  if (days === 1)  return 'Yesterday';
  if (days < 7)    return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 8)   return `${weeks} ${weeks === 1 ? 'week' : 'weeks'} ago`;
  const months = Math.floor(days / 30);
  if (months < 2)  return `${weeks} weeks ago`; // bridge: avoids "1 months ago"
  if (months < 24) return `${months} months ago`;
  const years = Math.floor(days / 365);
  return `${years} ${years === 1 ? 'year' : 'years'} ago`;
}
```

Thresholds in order: today → yesterday → days (2–6) → weeks (1–7) → weeks continued until months ≥ 2 → months (2–23) → years. Notes:
- `weeks === 1` guard prevents "1 weeks ago"
- `months < 2` guard prevents "1 months ago" (8–8.5 weeks shows "8 weeks ago" instead)
- `years === 1` guard prevents "1 years ago"

---

## Search

Extend the existing `searchMatch()` to also search `notes`:

```js
(company.notes ?? '').toLowerCase().includes(q)
```

No other changes to search logic.

---

## Animations and focus states

### Row fade-in

```css
@keyframes crmRowIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}
.crm-table tbody tr {
  animation: crmRowIn 0.12s ease;
}
```

### Row hover

```css
.crm-table td {
  transition: background 0.12s;
}
```

Verify this is present in the existing stylesheet — add if missing.

### Search input focus (replace existing rule)

```css
.crm-search:focus {
  border-color: rgba(0, 175, 102, 0.4);
  outline: none;
  box-shadow: 0 0 0 2px rgba(0, 175, 102, 0.1);
}
```

---

## New CSS classes

Add to `site/style.css`:

The existing stylesheet applies `cursor: pointer` to all `.crm-table th` elements. This misleads users into thinking non-sortable columns are clickable. Remove that blanket rule and replace it with targeted rules:

```css
/* Existing rule to REMOVE: */
/* .crm-table th { cursor: pointer; } ← remove this blanket rule */

/* Column drag — applied to all 11 headers */
.crm-table th[draggable="true"] {
  cursor: grab;
}
.crm-table th[draggable="true"]:active {
  cursor: grabbing;
}

/* Sortable columns get pointer — placed AFTER grab so it wins via cascade */
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

/* Notes cell */
.crm-notes {
  font-size: 13px;
  color: var(--so-text-body);
  max-width: 220px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Date cell */
.crm-date {
  font-size: 13px;
  color: var(--so-text-body);
  white-space: nowrap;
}

/* Gmail compose link */
.crm-mailto {
  color: var(--so-green-dark);
  text-decoration: none;
  font-size: 12px;
}
.crm-mailto:hover {
  text-decoration: underline;
}

/* Row fade-in */
@keyframes crmRowIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}
.crm-table tbody tr {
  animation: crmRowIn 0.12s ease;
}
```

---

## Out of scope

- Pylon, PostHog, Fireflies live data
- Inline notes editing (requires a backend)
- Create action page (separate spec)
- Useful Links tab (separate spec)
- Column resize
- Pagination
