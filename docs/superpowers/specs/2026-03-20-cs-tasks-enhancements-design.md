# CS Tasks Page — Enhancements Design

**Date:** 2026-03-20
**Status:** Approved

---

## Overview

Nine targeted improvements to `site/tasks.html` to improve usability, consistency with other pages, and inline task management.

---

## Changes

### 1. Remove "Customer Support" nav link

Remove the `<a href="index.html">Customer Support <span>soon</span></a>` link from the site nav in `tasks.html`. It points to an unbuilt page and clutters the nav.

### 2. Search bar

Add a search input to the toolbar (left of the filter pills). Filters in real-time across both task name and client name. Matches against `a.name` and the company name from `companyMap`.

- Reuse `crm-search-wrap` / `crm-search` / `crm-search-icon` classes from `style.css`
- Placeholder: "Search tasks or customers…"
- Wire to `render()` on `input` event

### 3. PLG / SLG / Cust type filter pills

Add a pill group in the toolbar (right of the search bar, left of the priority pills) to filter tasks by the type of their associated customer.

- Options: All · PLG · SLG · Cust
- Customer type is read from `hubspot.json` (field: `type`) and stored in a `typeMap: Map<hubspot_id, type>`
- Active pill style: white background + `var(--so-green-dark)` text + `box-shadow: 0 1px 2px rgba(0,0,0,0.08)` — matching `.crm-pill--active`
- State variable: `activeType = ''`

### 4. Toolbar order

Left to right in `tasks-toolbar-right`:

1. Search bar
2. PLG/SLG/Cust type pills
3. Priority pills (All · High · Med · Low) — existing
4. "New task" button

### 5. Header and cell left-alignment

Add `text-align: left` to `.tasks-col-label`. The grid columns are already identical between header and rows; this was a CSS omission.

### 6. Inline due date editing

Clicking a due date cell replaces the text with an `<input type="date">` in place. On `change` or `blur`, the new date is PATCHed to the worker (`/actions/:id` with `{ due_date: value }`) and the cell reverts to text.

- Active state style: `border: 1px solid var(--so-primary)` + `box-shadow: 0 0 0 3px rgba(0,175,102,0.10)`
- If the user presses Escape, discard the change

### 7. Client name → client popup

Make the client name cell a clickable element that opens the same card modal already used in `crm.html`.

- Duplicate the card modal HTML and its JS (`renderCardLeft`, `renderCardRight`, `openCard`, `closeCard`) from `crm.html` directly into `tasks.html` — no shared file, keeping each page self-contained
- Clicking the client name in any task row calls `openCard(hubspot_id)`
- The card modal requires `companyMap`, the actions worker, and the Pylon/PostHog/Fireflies data — replicate the same data-fetching pattern from `crm.html`

### 8. Page background

Change the `.tasks-page` background from `var(--so-background)` to `#EEF8F3` — the same green-tinted background used on `dashboard.html`.

### 9. Inline "New task" row (replaces modal)

Replace the modal with an inline row inserted at the top of `#tasks-list` when "New task" is clicked.

**Creation flow:**
- Clicking "New task" inserts an editable row at the top of the list (light green `#F7FDF9` background)
- Row has a single `<input>` for the task name; Priority, Due date, and Client cells show greyed-out placeholder text ("Med", "No date", "No client")
- Pressing `Enter` saves the task: `POST /actions` with `{ name, priority: 'med', hubspot_id: null, due_date: null }`
- Pressing `Escape` cancels and removes the row
- The new task appears in the Upcoming tab

**Post-creation editing:**
- Client cell: clicking it on any row with no client opens an inline `<select>` dropdown populated from `companyMap`, styled with green focus border (matching due-date edit). On change, PATCHes `{ hubspot_id: value }` to the worker.
- Due date cell: clicking it opens an inline `<input type="date">` (see item 6 above)

**Remove:** The `#new-task-overlay` modal, all modal CSS (`.modal-overlay`, `.modal`, `.modal-header`, `.modal-body`, `.modal-footer`, `.field-label`, `.field-input`, `.field-select`, `.btn-cancel`, `.btn-save`), and all modal JS.

---

## Worker API requirements

**The worker must be updated before frontend work begins.** Items 6, 8, and 9 all depend on new PATCH fields.

The Cloudflare Worker at `stack-plg-actions.charlie-9e7.workers.dev` needs to support:

- `GET /actions` — list all actions *(already works)*
- `POST /actions` — create action with `hubspot_id: null` and `due_date: null` allowed *(verify null is accepted)*
- `PATCH /actions/:id` — must accept `due_date` (ISO date string or null) and `hubspot_id` (string or null) *(add these fields if missing)*
- `DELETE /actions/:id` — delete action *(already works)*

Updating the worker is a **required first step** in the implementation plan.

---

## Files changed

- `site/tasks.html` — all frontend changes
- `site/style.css` — add inline task row styles if not already covered by existing classes
- Cloudflare Worker — PATCH endpoint may need `due_date` + `hubspot_id` fields added

---

## Out of scope

- Editing task name inline (not requested)
- Editing priority inline (not requested)
- Sorting by column
