# CRM Enhancements — Design Spec
Date: 2026-03-19

## Overview

Enhance the CRM table with two new live columns (Notes, Last contact), column
drag-to-reorder with localStorage persistence, sortable live columns, contact
email as a Gmail draft link, row fade-in animation, and a green focus ring on the
search input. Fix the missing Connectors nav link. All styling uses the existing
CSS custom properties and matches the dashboard's interaction patterns.

---

## Files changed

| File | Change |
|---|---|
| `scripts/fetch-hubspot.js` | Add `notes_last_contacted` to PROPERTIES |
| `site/data/hubspot.json` | Regenerated with new property |
| `site/crm.html` | All JS and HTML changes |
| `site/style.css` | New and updated styles |

---

## Data changes

### fetch-hubspot.js

Add `'notes_last_contacted'` to the `PROPERTIES` array.

Expose it in the company mapping:
```js
notes_last_contacted: c.properties.notes_last_contacted ?? null,
```

`notes` is already in the data — no change needed for that property.

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
per-column render function so columns can be individually reordered.

| Key | Header | Source label | Data | Sortable |
|---|---|---|---|---|
| `name` | Name | HubSpot | `company.name` → link to `hubspot_url` | ✓ A→Z / Z→A |
| `contact` | Primary contact | HubSpot | `company.contact.name` + mailto email | ✓ by last name |
| `notes` | Notes | HubSpot | `company.notes` — truncated, full text on `title` | ✓ A→Z / Z→A |
| `last_contact` | Last contact | HubSpot | `company.notes_last_contacted` — relative time, absolute on `title` | ✓ most recent first |
| `account` | Account | Pylon | `—` placeholder | ✗ |
| `integrations` | Connected integrations | PostHog | `—` placeholder | ✗ |
| `api_requests` | API requests | PostHog | `—` placeholder | ✗ |
| `tickets_total` | Tickets total | Pylon | `—` placeholder | ✗ |
| `open_tickets` | Open tickets | Pylon | `—` placeholder | ✗ |
| `cs_actions` | Open CS actions | — | `—` placeholder | ✗ |
| `last_call` | Last call | Fireflies | `—` placeholder | ✗ |

### Column header format

Live columns: `Name`, `Primary contact`, `Notes`, `Last contact`
Placeholder columns: `Account (Pylon)`, `Connected integrations (PostHog)`,
`API requests (PostHog)`, `Tickets total (Pylon)`, `Open tickets (Pylon)`,
`Open CS actions`, `Last call (Fireflies)`

Source in parentheses only for placeholder columns — same convention as existing
headers.

---

## Sorting

Three-click cycle (asc → desc → reset to name A→Z), same as existing behaviour.

Sortable columns: `name`, `contact`, `notes`, `last_contact`.

**Sort values:**
- `name`: `company.name ?? ''` lowercased
- `contact`: last-name-first (`contactSortValue()` — already implemented), nulls last
- `notes`: `company.notes ?? ''` lowercased, nulls last (`'\uffff'`)
- `last_contact`: `new Date(company.notes_last_contacted).getTime()`, nulls sort last
  in both directions

`aria-sort` attribute updated on the active `<th>`. Unsorted columns carry none.

---

## Column drag-to-reorder

### State

Default order array:
```js
const DEFAULT_COL_ORDER = [
  'name','contact','notes','last_contact',
  'account','integrations','api_requests',
  'tickets_total','open_tickets','cs_actions','last_call'
];
```

`localStorage` key: `plg_crm_col_order`

On page load: read from localStorage; if present and all 11 keys are included,
use it. Otherwise fall back to `DEFAULT_COL_ORDER`.

### HTML

Each `<th>` has:
```html
<th data-col="name" draggable="true" ...>Name</th>
```

### Drag events

All events on the `<thead>` row (event delegation).

- `dragstart`: store `dragSrcCol`. Add `.crm-th--dragging` to source `<th>`.
- `dragover`: `e.preventDefault()`. Add `.crm-th--drag-over` to target `<th>`.
- `dragleave` / `dragend`: remove `.crm-th--drag-over` from all headers; remove
  `.crm-th--dragging` from source.
- `drop`: swap `dragSrcCol` and target col in `colOrder` array; save to
  localStorage; call `render()`.

Since the table is fully re-rendered by `render()`, swapping the `colOrder` array
is enough — there is no manual DOM cell-moving needed.

### Cursor

`<th>` elements that are draggable get `cursor: grab`. While dragging: `cursor: grabbing`.

---

## Cell rendering

Replace the `PLACEHOLDER_CELL.repeat(7)` approach with a `CELLS` map:

```js
const CELLS = {
  name:        company => `<td>...</td>`,   // name + HubSpot link
  contact:     company => `<td>...</td>`,   // name + mailto email
  notes:       company => `<td>...</td>`,   // truncated notes or —
  last_contact:company => `<td>...</td>`,   // relative time or —
  account:     ()      => PLACEHOLDER_CELL,
  integrations:()      => PLACEHOLDER_CELL,
  api_requests:()      => PLACEHOLDER_CELL,
  tickets_total:()     => PLACEHOLDER_CELL,
  open_tickets:()      => PLACEHOLDER_CELL,
  cs_actions:  ()      => PLACEHOLDER_CELL,
  last_call:   ()      => PLACEHOLDER_CELL,
};
```

`renderRow(company)` iterates `colOrder` and calls `CELLS[col](company)`.

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

Relative time helper:
```js
function relativeTime(iso) {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 8) return `${weeks} weeks ago`;
  const months = Math.floor(days / 30);
  return `${months} months ago`;
}
```

Cell:
```js
last_contact: company => {
  const rel = relativeTime(company.notes_last_contacted);
  if (!rel) return PLACEHOLDER_CELL;
  const abs = new Date(company.notes_last_contacted).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric'
  });
  return `<td class="crm-date" title="${escHtml(abs)}">${escHtml(rel)}</td>`;
}
```

### Contact cell

Email rendered as a `mailto:` link so clicking it opens a Gmail compose window:
```js
${c.email
  ? `<div class="crm-contact-email">
       <a href="mailto:${escHtml(c.email)}" class="crm-mailto">${escHtml(c.email)}</a>
     </div>`
  : ''}
```

---

## Search

No changes to search logic. Search already covers name, domain, contact name, and
email. Extend to also search `notes`:

```js
(company.notes ?? '').toLowerCase().includes(q)
```

---

## Animations

### Row fade-in

When `render()` re-populates the tbody, rows fade in:

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

(Already present — verify it stays.)

### Search input focus

```css
.crm-search:focus {
  border-color: rgba(0, 175, 102, 0.4);
  box-shadow: 0 0 0 2px rgba(0, 175, 102, 0.1);
}
```

Replace the existing `.crm-search:focus` rule which only set `border-color: var(--so-neutral-30)`.

---

## New CSS classes

Add to `site/style.css`:

```css
/* Column drag */
.crm-table th[draggable="true"] {
  cursor: grab;
}
.crm-table th[draggable="true"]:active {
  cursor: grabbing;
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

/* Mailto link */
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
