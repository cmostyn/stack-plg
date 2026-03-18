---
title: Connector Status Page
date: 2026-03-18
status: approved
---

# Connector Status Page

A dedicated page showing the live status, capabilities, and last-fetch stats for each data connector powering the CS Analytics dashboard.

## Problem

There is no way to see at a glance which connectors are working, when they last ran, or what data they provide. This matters for debugging, onboarding, and understanding what the dashboard is built on.

## Solution

A new `connectors.html` page (nav: "Connectors") showing one card per connector. Each card displays:
- Status pill: Connected / Error / Not configured
- Static description of what the connector reads
- Live stat chips (record counts from last fetch)
- Last fetch timestamp (human-relative, e.g. "2 hours ago")

## Connectors

| Connector | Status | Fetch script |
|-----------|--------|--------------|
| HubSpot | Active | `fetch-hubspot.js` |
| Pylon | Active | `fetch-pylon.js` |
| PostHog | Active | `fetch-posthog.js` |
| Fireflies | Active | `fetch-fireflies.js` (new) |
| Google Drive | Active | `fetch-googledrive.js` (new) |
| Gmail | Not configured | — |

## Data Flow

Each fetch script writes its result into `site/data/connectors.json` on success or failure. The connectors page reads this file at load time. No server required — status is as-of last fetch run.

### `connectors.json` schema

```json
{
  "hubspot": {
    "status": "ok",
    "last_fetch": "2026-03-18T14:00:00Z",
    "records": 55
  },
  "pylon": {
    "status": "ok",
    "last_fetch": "2026-03-18T14:01:00Z",
    "records": 55,
    "open_tickets": 12
  },
  "posthog": {
    "status": "ok",
    "last_fetch": "2026-03-18T14:03:00Z",
    "records": 48
  },
  "fireflies": {
    "status": "ok",
    "last_fetch": "2026-03-18T14:05:00Z",
    "records": 32
  },
  "googledrive": {
    "status": "ok",
    "last_fetch": "2026-03-18T14:06:00Z",
    "records": 140
  },
  "gmail": {
    "status": "not_configured"
  }
}
```

`status` values: `ok` | `error` | `not_configured`
On error, an `error` string field is included with the message.

Each fetch script reads the current `connectors.json`, updates its own key, and writes it back. This way a single script run doesn't wipe other connectors' entries.

## New Fetch Scripts

### `fetch-fireflies.js`
- Env var: `STACKONE_FIREFLIES_ACCOUNT_ID`
- RPC action: `fireflies_list_transcripts` (last 30 days)
- Stat: transcript count

### `fetch-googledrive.js`
- Env var: `STACKONE_GOOGLEDRIVE_ACCOUNT_ID`
- RPC action: `googledrive_list_files`
- Stat: file count

Both follow the same RPC pattern as existing scripts (StackOne API, Basic auth, `x-account-id` header).

## Connector Card Design

Follows existing `stat-card` / `digest-card` patterns from `style.css`.

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

- Status pill uses StackOne semantic colors: green (`--so-green-dark`) / red (`--so-red-dark`) / grey (`--so-text-tag`)
- Stat chips: tag-style, `--so-foreground` background, `--so-font-tag` font
- Not-configured cards: muted border (`--so-neutral-10`), greyed text, no stat chips
- Account IDs never shown in the UI — internal config only

## Page Layout

- Grid: 3 columns (≥1100px), 2 columns (≥680px), 1 column (mobile)
- Header/nav identical to `dashboard.html` with "Connectors" as active nav item
- Heading: "Data connectors" (Stack Sans Text, 32px)
- Subheading: "Status and capabilities of each data source powering this dashboard."

## Files Changed

| File | Change |
|------|--------|
| `site/connectors.html` | New page |
| `site/style.css` | Add connector card styles |
| `site/data/connectors.json` | New data file (committed as empty shell) |
| `scripts/fetch-fireflies.js` | New fetch script |
| `scripts/fetch-googledrive.js` | New fetch script |
| `scripts/fetch-hubspot.js` | Write status to connectors.json |
| `scripts/fetch-pylon.js` | Write status to connectors.json |
| `scripts/fetch-posthog.js` | Write status to connectors.json |
| `site/index.html` | Add Connectors nav link |
| `site/dashboard.html` | Add Connectors nav link |
| `site/manifest.json` | Add connectors page entry |
| `.env.example` | Add new account ID vars |
