#!/usr/bin/env node
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs   = require('fs');
const path = require('path');
const { writeStatus } = require('./write-status');

const API_KEY    = process.env.STACKONE_API_KEY;
const ACCOUNT_ID = process.env.STACKONE_POSTHOG_ACCOUNT_ID;
const OUT_FILE   = path.join(__dirname, '../site/data/posthog.json');

const INSIGHT_ID = 3589698; // "Click Data 2" — org-level usage metrics

if (!API_KEY || !ACCOUNT_ID) {
  console.error('[posthog] Missing STACKONE_API_KEY or STACKONE_POSTHOG_ACCOUNT_ID');
  process.exit(1);
}

const AUTH = 'Basic ' + Buffer.from(API_KEY + ':').toString('base64');

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

async function main() {
  console.log(`[posthog] Fetching insight ${INSIGHT_ID}...`);

  const res = await fetch('https://api.stackone.com/actions/rpc', {
    method: 'POST',
    headers: {
      'Authorization': AUTH,
      'x-account-id': ACCOUNT_ID,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      action: 'posthog_get_insight',
      path: { id: String(INSIGHT_ID) },
    }),
  });
  if (!res.ok) throw new Error(`RPC posthog_get_insight failed: ${res.status} ${await res.text()}`);
  const data = await res.json();

  // Result rows: [org_name, org_id, count_of_page_loads, click_interactions,
  //               linked_accounts, pages_visited, connectors_clicked, users, org_created]
  const rows = data?.data?.result ?? data?.result?.result ?? [];
  console.log(`[posthog] Got ${rows.length} orgs`);

  const output = rows.map(row => ({
    org_name:           row[0] ?? null,
    org_id:             row[1] ?? null,
    page_loads:         row[2] ?? 0,
    click_interactions: row[3] ?? 0,
    linked_accounts:    row[4] ?? 0,
    pages_visited:      row[5] ? row[5].split(' | ').filter(Boolean) : [],
    connectors_clicked: row[6] ? row[6].split(' | ').filter(Boolean) : [],
    users:              row[7] ? row[7].split(' | ').filter(Boolean) : [],
    org_created:        row[8] ?? null,
  }));

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(output, null, 2) + '\n');
  console.log(`[posthog] Written to ${OUT_FILE}`);
  writeStatus('posthog', 'ok', { records: output.length });
}

main().catch(e => {
  console.error('[posthog]', e.message);
  writeStatus('posthog', 'error', { error: e.message });
  process.exit(1);
});
