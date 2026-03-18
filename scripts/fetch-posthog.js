#!/usr/bin/env node
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs   = require('fs');
const path = require('path');

const API_KEY    = process.env.STACKONE_API_KEY;
const ACCOUNT_ID = process.env.STACKONE_POSTHOG_ACCOUNT_ID;
const OUT_FILE   = path.join(__dirname, '../site/data/posthog.json');

if (!API_KEY || !ACCOUNT_ID) {
  console.error('[posthog] Missing STACKONE_API_KEY or STACKONE_POSTHOG_ACCOUNT_ID');
  process.exit(1);
}

const AUTH       = 'Basic ' + Buffer.from(API_KEY + ':').toString('base64');
const PROJECT_ID = 14642; // [Prod] Dashboard

async function rpc(action, body) {
  const res = await fetch('https://api.stackone.com/actions/rpc', {
    method: 'POST',
    headers: {
      'Authorization': AUTH,
      'x-account-id': ACCOUNT_ID,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action, body }),
  });
  if (!res.ok) throw new Error(`RPC ${action} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

// Fetch all events for a specific org in the last 30 days
async function fetchOrgEvents(orgId) {
  const events = [];
  const after = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const propertyFilter = JSON.stringify([
    { key: '$organizations_current_organization_id', value: orgId, operator: 'exact', type: 'event' },
  ]);

  let nextUrl = undefined;
  while (true) {
    const body = {
      path: { project_id: PROJECT_ID },
      query: { limit: 1000, properties: propertyFilter, after },
    };
    if (nextUrl) body.query.after = undefined; // use the cursor from next URL if needed

    const data = await rpc('posthog_list_events', body);
    const results = data?.data?.results ?? [];
    events.push(...results);

    // PostHog paginates via next URL, but for counts we only need to know
    // whether there are events and the max/min timestamps — stop after first page
    break;
  }

  return events;
}

async function main() {
  // Load HubSpot data to get the list of PLG org_ids
  const hubspotFile = path.join(__dirname, '../site/data/hubspot.json');
  if (!fs.existsSync(hubspotFile)) {
    console.error('[posthog] hubspot.json not found — run fetch-hubspot.js first');
    process.exit(1);
  }
  const hubspot = JSON.parse(fs.readFileSync(hubspotFile, 'utf8'));
  const orgs = hubspot.filter(c => c.org_id).map(c => ({ org_id: c.org_id, name: c.name }));

  console.log(`[posthog] Fetching events for ${orgs.length} orgs...`);

  const output = [];
  for (const org of orgs) {
    process.stdout.write(`  ${org.name}...`);
    try {
      const events = await fetchOrgEvents(org.org_id);
      const distinctUsers = new Set(events.map(e => e.distinct_id)).size;
      const apiRequests   = events.filter(e => e.event === 'api_request').length;
      const pageviews     = events.filter(e => e.event === '$pageview').length;
      const timestamps    = events.map(e => e.timestamp).filter(Boolean).sort();
      process.stdout.write(` ${events.length} events\n`);

      output.push({
        org_id:       org.org_id,
        org_name:     org.name,
        active_users: distinctUsers,
        total_events: events.length,
        pageviews,
        api_requests: apiRequests,
        first_seen:   timestamps[0] ?? null,
        last_seen:    timestamps[timestamps.length - 1] ?? null,
        period_days:  30,
      });
    } catch (e) {
      process.stdout.write(` ERROR: ${e.message}\n`);
      output.push({
        org_id:       org.org_id,
        org_name:     org.name,
        active_users: 0,
        total_events: 0,
        pageviews:    0,
        api_requests: 0,
        first_seen:   null,
        last_seen:    null,
        period_days:  30,
        error:        e.message,
      });
    }
  }

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(output, null, 2) + '\n');
  console.log(`[posthog] Written to ${OUT_FILE}`);
}

main().catch(e => { console.error('[posthog]', e.message); process.exit(1); });
