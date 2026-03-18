# CRM Tab — Design Spec
Date: 2026-03-18

## Overview

Add a CRM tab to the PLG dashboard showing a searchable, sortable table of all
Customer - PLG accounts, with links to HubSpot and placeholder columns for
data sources not yet connected.

---

## Files changed

| File | Change |
|---|---|
| `site/crm.html` | New page |
| `scripts/fetch-hubspot.js` | Extended to fetch primary contact per company |
| `site/style.css` | New table, search, and placeholder styles |
| `site/dashboard.html` | CRM nav link added to `.site-nav` (hardcoded class) |
| `site/index.html` | CRM nav link added to `.site-nav` (same change as dashboard.html) |

---

## Data

### hubspot.json

The existing fetch script already pulls all companies filtered by
`type = "Customer - PLG"`. It will be extended to:

1. Batch-fetch associated contact IDs per company via
   `POST /crm/v3/associations/companies/contacts/batch/read`. No association
   label filter — fetch all contacts. Chunk company IDs at ≤100 per request.
   Each input object in the request body must include `"limit": 100` to cap
   contacts returned per company.
2. Collect all contact IDs across all companies, deduplicate, then rechunk
   at ≤100 before the next step.
3. Batch-read those contacts via `POST /crm/v3/objects/contacts/batch/read`
   for properties `firstname`, `lastname`, `email`, `createdate`. Chunk at
   ≤100 contact IDs per request.
4. For each company, pick the contact with the most recent `createdate`
   property. Tiebreak: lowest contact ID parsed as an integer (not
   lexicographic — HubSpot IDs are numeric strings).
5. Add a `contact` field to each company object:

```json
{
  "hubspot_id": "411466041590",
  "name": "Antonio Perez, CPA, P.A.",
  "domain": "antoniocpa.com",
  "hubspot_url": "https://app-eu1.hubspot.com/...",
  "contact": {
    "name": "Jane Smith",
    "email": "jane@example.com"
  }
}
```

If a company has no associated contacts, `contact` is `null`.

---

## Columns

| # | Column | Source | Status |
|---|---|---|---|
| 1 | Name | HubSpot | Live — links to `hubspot_url` |
| 2 | Primary contact | HubSpot | Live — most recent by contact `createdate` |
| 3 | Pylon | Pylon | Placeholder |
| 4 | Connected integrations | PostHog | Placeholder |
| 5 | API requests | PostHog | Placeholder |
| 6 | Support tickets (all time) | Pylon | Placeholder |
| 7 | Open support tickets | Pylon | Placeholder |
| 8 | Open CS actions | Custom (future) | Placeholder |
| 9 | Most recent call | Fireflies | Placeholder |

---

## UI

### Page shell
Same header and nav as `dashboard.html`. Nav gains a third link: CRM.
Active class (`site-nav-link--active`) is hardcoded in the HTML of each page,
matching the existing pattern.

### Search
- Text input above the table, ~300px on desktop, full-width on mobile
- Placeholder: "Search customers…"
- Filters rows in real time across: company name, domain (already present in
  `hubspot.json` from the existing company fetch), contact name, contact email
- Label format:
  - No filter active: `"N customers"`
  - Filter active: `"N of M customers"`

### Table
- Full-width inside an `overflow-x: auto` wrapper (handles narrow viewports)
- Default sort: company name A→Z
- Sortable columns: Name (sorts by company name), Primary contact (sorts by
  lastname then firstname)
- Sort cycle: click → ascending; click again → descending; third click →
  reset to global default (company name A→Z, Name column `aria-sort` restored)
- Active sort column carries `aria-sort="ascending"` or `aria-sort="descending"`
  on the `<th>`. Unsorted columns carry no `aria-sort` attribute.
- Sort indicators rendered via CSS only:
  `th[aria-sort="ascending"]::after { content: " ↑"; }`
  `th[aria-sort="descending"]::after { content: " ↓"; }`
- Null contacts sort last in both ascending and descending directions
- Placeholder cells: `<td class="crm-placeholder" title="Coming soon">—</td>`
- Name cell: `<a href="{hubspot_url}" target="_blank" rel="noopener">{name}</a>`
- Contact cell: "First Last · email@domain.com", or `—` if contact is null
- Defensive rendering: if `company.name` is missing, display `hubspot_id`;
  if `company.contact` is malformed or not an object, treat as null

### Data loading
- Fetch path: `./data/hubspot.json` (relative, consistent with site root)
- On load error: replace the table wrapper with
  `<p class="crm-error">Customer data couldn't be loaded. Try refreshing the page.</p>`

---

## Styles

New classes added to `style.css`:

- `.crm-toolbar` — flex row containing search input and row count
- `.crm-search` — text input styled with card border/radius tokens
- `.crm-count` — tag-font row count label
- `.crm-table-wrap` — `overflow-x: auto` wrapper around the table
- `.crm-table` — full-width table, `border-collapse: collapse`
- `.crm-table th` — sortable header: `cursor: pointer`, tag font, no user-select
- `.crm-table th[aria-sort]` — visual indicator via `::after` pseudo-element
- `.crm-table td` — body font, 14px, vertical padding
- `.crm-placeholder` — grey colour (`var(--so-neutral-40)`) for `—` cells
- `.crm-error` — inline error message, body font, muted colour

---

## Behaviour

- Data loaded from `./data/hubspot.json` via `fetch()` at page load
- Search and sort are pure client-side JS, no server involvement
- Placeholder cells are static HTML — no API calls at runtime
- Load error: `<p class="crm-error">` replaces the table wrapper

---

## Out of scope

- Pylon account URL construction (requires mapping not yet available)
- PostHog connected integrations count
- PostHog API request count
- Pylon ticket counts
- CS actions (feature not yet built)
- Fireflies most recent call
- Pagination (55 rows is manageable without it)
- Export / CSV download
