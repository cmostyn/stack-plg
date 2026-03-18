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
| `site/dashboard.html` | Nav link added |
| `site/index.html` | Nav link added |

---

## Data

### hubspot.json

The existing fetch script already pulls all companies filtered by
`type = "Customer - PLG"`. It will be extended to:

1. After fetching all companies, batch-fetch associated contact IDs per company
   using the HubSpot associations API.
2. Batch-read those contacts for `firstname`, `lastname`, `email`, and
   `createdate`.
3. Pick the single contact with the most recent `createdate` per company.
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
| 2 | Primary contact | HubSpot | Live — most recent signup by `createdate` |
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
Active state applied to the CRM link when on `crm.html`.

### Search
- Text input above the table, full width on mobile, ~300px on desktop
- Placeholder: "Search customers…"
- Filters rows in real time across: company name, domain, contact name, contact email
- Row count label updates alongside ("28 of 55 customers")

### Table
- Full-width, one row per customer
- Default sort: company name A→Z
- Sortable columns: Name, Primary contact
  - Click header to sort asc; click again for desc
  - Active sort column shows ↑ or ↓ indicator
- Placeholder cells: grey dash `—`, tooltip on hover: "Coming soon"
- Name cell: company name as `<a>` linking to HubSpot, opens in new tab
- Contact cell: "First Last · email@domain.com", or `—` if no contact

### Row count
Label above the table: "55 customers" (or "12 of 55 customers" when filtered).

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

---

## Behaviour

- Data loaded from `site/data/hubspot.json` via `fetch()` at page load
- Search and sort are pure client-side JS, no server involvement
- Placeholder cells are static HTML — no API calls at runtime
- If `hubspot.json` fails to load, show an inline error message in place of
  the table

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
