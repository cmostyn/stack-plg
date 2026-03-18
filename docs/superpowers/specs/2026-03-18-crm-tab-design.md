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
| `site/dashboard.html` | CRM nav link added to `.site-nav` (hardcoded class, matching existing pattern) |
| `site/index.html` | CRM nav link added to `.site-nav` (Support Digests page shares the same header pattern) |

---

## Data

### hubspot.json

The existing fetch script already pulls all companies filtered by
`type = "Customer - PLG"`. It will be extended to:

1. Batch-fetch associated contact IDs per company via
   `POST /crm/v3/associations/companies/contacts/batch/read`. No association
   label filter — fetch all contacts. Chunk company IDs at ≤100 per request.
   Cap at 100 contact IDs per company before the contact read step (first 100
   returned; edge case only at current scale).
2. Batch-read those contacts via `POST /crm/v3/objects/contacts/batch/read`
   for properties `firstname`, `lastname`, `email`, `createdate`. Chunk at
   ≤100 contact IDs per request.
3. Pick the single contact with the most recent `createdate` contact property
   (not the association date) per company. This surfaces the most recently
   signed-up user, as intended.
4. Add a `contact` field to each company object:

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
Active state is hardcoded in the HTML markup on each page (matching the
existing `site-nav-link--active` pattern in `dashboard.html`).

### Search
- Text input above the table, full width on mobile, ~300px on desktop
- Placeholder: "Search customers…"
- Filters rows in real time across: company name, domain, contact name, contact email
- When no filter is active, label reads: `"55 customers"`
- When a filter is active, label reads: `"12 of 55 customers"`

### Table
- Full-width, one row per customer
- Default sort: company name A→Z
- Sortable columns: Name, Primary contact
  - Click → asc; click again → desc; third click resets to global default
    (company name A→Z) regardless of which column was clicked
  - Active sort column shows ↑ (asc) or ↓ (desc) in the header
  - Primary contact sorts alphabetically by lastname then firstname
  - Null contacts sort last in both asc and desc directions
- Placeholder cells: grey dash `—` with `title="Coming soon"` native tooltip
- Name cell: `<a href="{hubspot_url}" target="_blank" rel="noopener">` —
  `hubspot_url` is already present in `hubspot.json`
- Contact cell: "First Last · email@domain.com", or `—` if contact is null
- Defensive rendering: if `company.name` is missing, show `hubspot_id`;
  if `company.contact` is malformed, treat as null

### Data loading
- Fetch path: `./data/hubspot.json` (relative to `site/crm.html`, consistent
  with the site root convention used across other pages)
- On load error: replace the table wrapper with
  `<p class="crm-error">Customer data couldn't be loaded. Try refreshing the page.</p>`

### Row count
Label above the table. Format:
- No filter active: `"N customers"`
- Filter active: `"N of M customers"`

---

## Styles

New classes added to `style.css`:

- `.crm-toolbar` — flex row, search input + row count
- `.crm-search` — styled text input matching card border/radius tokens
- `.crm-count` — small tag-font row count label
- `.crm-table` — full-width table, border-collapse
- `.crm-table th` — sortable header, cursor pointer, tag font
- `.crm-table th[aria-sort]` — active sort indicator
- `.crm-table td` — body font, 14px
- `.crm-placeholder` — grey `—` for placeholder cells
- `.crm-error` — inline error message style

---

## Behaviour

- Data loaded from `./data/hubspot.json` via `fetch()` at page load
- Search and sort are pure client-side JS, no server involvement
- Placeholder cells are static HTML — no API calls at runtime
- Load error: inline `<p class="crm-error">` replaces the table

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
