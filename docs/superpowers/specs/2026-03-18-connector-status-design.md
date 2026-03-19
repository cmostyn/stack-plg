---
title: Connector Status Page
date: 2026-03-18
status: approved
---

# Connector Status Page

A dedicated page showing the live status, capabilities, and last-fetch stats for each data connector powering the CS Analytics dashboard.

## Problem

There is no way to see at a glance which connectors are working, when they last ran, or what data they provide.

## Solution

A new `connectors.html` page (nav: "Connectors") showing one card per connector. Each card displays:
- Status pill: Connected / Error / Not configured
- Static description of what the connector reads
- Live stat chips (record counts from last fetch)
- Last fetch timestamp (human-relative, e.g. "2 hours ago")

## Connectors

| Connector | Status | Fetch script | Account ID env var | API key env var |
|-----------|--------|--------------|-------------------|-----------------|
| HubSpot | Active | `fetch-hubspot.js` | `STACKONE_HUBSPOT_ACCOUNT_ID` | `STACKONE_API_KEY` |
| Pylon | Active | `fetch-pylon.js` | `STACKONE_PYLON_ACCOUNT_ID` | `STACKONE_PYLON_API_KEY` |
| PostHog | Active | `fetch-posthog.js` | `STACKONE_POSTHOG_ACCOUNT_ID` | `STACKONE_API_KEY` |
| Fireflies | Active | `fetch-fireflies.js` (new) | `STACKONE_FIREFLIES_ACCOUNT_ID` | `STACKONE_API_KEY` |
| Google Drive | Active | `fetch-googledrive.js` (new) | `STACKONE_GOOGLEDRIVE_ACCOUNT_ID` | `STACKONE_API_KEY` |
| Gmail | Not configured | — | — | — |

Pylon uses a separate `STACKONE_PYLON_API_KEY`; all others share `STACKONE_API_KEY`.

## Data Flow

Each fetch script writes its result to its own status file: `site/data/status-{connector}.json`. This avoids any race condition from concurrent runs — no shared file is written. The connectors page fetches all six files individually at load time.

### Per-connector status file schema

**Success:**
```json
{ "status": "ok", "last_fetch": "2026-03-18T14:00:00Z", "records": 55 }
```

**Success with extra stats (Pylon only):**
```json
{ "status": "ok", "last_fetch": "2026-03-18T14:01:00Z", "records": 55, "open_tickets": 12 }
```
- `records` = account count; `open_tickets` = sum of `open_tickets_live` across all accounts.

**Error:**
```json
{ "status": "error", "last_fetch": "2026-03-18T14:00:00Z", "error": "HTTP 401 Unauthorized" }
```
- `last_fetch` is always written (time of the attempt); `records` is absent on error.

**Not configured (static, committed to repo):**
```json
{ "status": "not_configured" }
```

### Files
```
site/data/status-hubspot.json
site/data/status-pylon.json
site/data/status-posthog.json
site/data/status-fireflies.json
site/data/status-googledrive.json
site/data/status-gmail.json       ← static, never written by a script
```

All `status-*.json` files except `status-gmail.json` are gitignored (generated). `status-gmail.json` is committed as `{ "status": "not_configured" }`.

### Existing script changes
Existing scripts (`fetch-hubspot.js`, `fetch-pylon.js`, `fetch-posthog.js`) continue writing their primary output files (`hubspot.json`, `pylon.json`, `posthog.json`) unchanged — `build.js` and `dashboard.html` are not affected. They additionally write their `status-{connector}.json` file on success or error.

## New Fetch Scripts

### `fetch-fireflies.js`
- Env: `STACKONE_API_KEY`, `STACKONE_FIREFLIES_ACCOUNT_ID`
- RPC action: `fireflies_list_transcripts` with `fromDate` = 30 days ago
- Stat: `records` = transcript count returned

### `fetch-googledrive.js`
- Env: `STACKONE_API_KEY`, `STACKONE_GOOGLEDRIVE_ACCOUNT_ID`
- RPC action: `googledrive_list_files`
- Stat: `records` = file count returned

## Connector Card Design

```
┌──────────────────────────────────────────────┐
│  [icon]  HubSpot             ● Connected      │
│                                               │
│  Companies, deal pipelines, customer tiers,   │
│  and custom properties for all PLG accounts.  │
│                                               │
│  [55 companies]                               │
│                                               │
│  Last fetched 2 hours ago                     │
└──────────────────────────────────────────────┘
```

- Status pill: green (`--so-green-dark`) / red (`--so-red-dark`) / grey (`--so-text-tag`)
- Stat chips: tag-style pill, `--so-foreground` bg, `--so-font-tag` font
- Not-configured cards: `--so-neutral-5` bg, muted border, no stat chips, no last-fetch line
- Account IDs never shown in UI — internal config only

### Connector icons

Inline SVG monograms in a 32×32 rounded square. Brand accent color per connector:

| Connector | Icon bg | Letter |
|-----------|---------|--------|
| HubSpot | `#FF7A59` (HubSpot orange) | H |
| Pylon | `#4D4EBA` (StackOne purple) | P |
| PostHog | `#F54E00` (PostHog orange) | P |
| Fireflies | `#EB4646` (Fireflies red) | F |
| Google Drive | `#4285F4` (Google blue) | G |
| Gmail | `--so-neutral-15` (muted, not configured) | M |

White letter on coloured square. Not-configured connectors use muted grey icon.

### Static descriptions

| Connector | Description |
|-----------|-------------|
| HubSpot | Companies, deal pipelines, customer tiers, and custom properties for all PLG accounts. |
| Pylon | Support tickets, open issues, and account-level activity across all PLG customers. |
| PostHog | Product usage events, active users, pageviews, and API request volume per org. |
| Fireflies | Meeting transcripts and call recordings from customer and team meetings. |
| Google Drive | Files and documents in the connected Google Drive. |
| Gmail | Inbound and outbound email threads, labels, and contact history. |

### Stat chips per connector

| Connector | Chips shown |
|-----------|-------------|
| HubSpot | `{n} companies` |
| Pylon | `{n} accounts` · `{n} open tickets` |
| PostHog | `{n} orgs tracked` |
| Fireflies | `{n} transcripts (30d)` |
| Google Drive | `{n} files` |
| Gmail | — (not configured) |

## Fallback: connectors.json not yet fetched

If a `status-{connector}.json` file fails to load (404 — first deploy, script not yet run), that connector card shows status as `not_configured` with label "Not yet fetched" instead of "Not configured". The page must not error if any file is missing.

## Page Layout

- Grid: 3 columns (≥1100px), 2 columns (≥680px), 1 column (mobile)
- Header/nav identical to `dashboard.html`; "Connectors" is the active nav item
- Nav order: PLG Motion · Connectors · Support Digests
- Heading: "Data connectors" (Stack Sans Text, 32px, `--so-text-header`)
- Subheading: "Status and capabilities of each data source powering this dashboard."

### Updated nav HTML (all pages)
```html
<nav class="site-nav">
  <a href="dashboard.html" class="site-nav-link">PLG Motion</a>
  <a href="connectors.html" class="site-nav-link">Connectors</a>
  <a href="index.html" class="site-nav-link">Support Digests</a>
</nav>
```
Each page adds `site-nav-link--active` to its own link.

## `.env.example` additions

```
STACKONE_FIREFLIES_ACCOUNT_ID=
STACKONE_GOOGLEDRIVE_ACCOUNT_ID=
```

## Files Changed

| File | Change |
|------|--------|
| `site/connectors.html` | New page |
| `site/style.css` | Add connector card styles |
| `site/data/status-gmail.json` | New static file: `{"status":"not_configured"}` |
| `site/data/status-*.json` | Generated by scripts (gitignored) |
| `scripts/fetch-fireflies.js` | New script |
| `scripts/fetch-googledrive.js` | New script |
| `scripts/fetch-hubspot.js` | Also write `status-hubspot.json` |
| `scripts/fetch-pylon.js` | Also write `status-pylon.json` |
| `scripts/fetch-posthog.js` | Also write `status-posthog.json` |
| `site/index.html` | Add Connectors nav link |
| `site/dashboard.html` | Add Connectors nav link |
| `site/manifest.json` | Add connectors page entry |
| `.env.example` | Add two new account ID vars |
| `.gitignore` | Ignore `site/data/status-*.json` except `status-gmail.json` |
