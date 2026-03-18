#!/usr/bin/env node
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs   = require('fs');
const path = require('path');
const { writeStatus } = require('./write-status');

const API_KEY    = process.env.STACKONE_API_KEY;
const ACCOUNT_ID = process.env.STACKONE_HUBSPOT_ACCOUNT_ID;
const OUT_FILE   = path.join(__dirname, '../site/data/hubspot.json');

if (!API_KEY || !ACCOUNT_ID) {
  console.error('[hubspot] Missing STACKONE_API_KEY or STACKONE_HUBSPOT_ACCOUNT_ID');
  process.exit(1);
}

const AUTH = 'Basic ' + Buffer.from(API_KEY + ':').toString('base64');
const PROPERTIES = ['name', 'domain', 'type', 'org_id', 'notes', 'tier', 'welcome_email_sent'];

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

async function fetchAllPLGCompanies() {
  const companies = [];
  let after = undefined;

  while (true) {
    const reqBody = {
      filterGroups: [{ filters: [{ propertyName: 'type', operator: 'EQ', value: 'Customer - PLG' }] }],
      properties: PROPERTIES,
      limit: 100,
    };
    if (after) reqBody.after = after;

    const data = await rpc('hubspot_search_companies', reqBody);
    const results = data?.result?.results ?? data?.results ?? [];
    companies.push(...results);

    const next = data?.result?.paging?.next?.after ?? data?.paging?.next?.after;
    if (!next) break;
    after = next;
  }

  return companies;
}

async function main() {
  console.log('[hubspot] Fetching PLG companies...');
  const raw = await fetchAllPLGCompanies();
  console.log(`[hubspot] Found ${raw.length} companies`);

  const companies = raw.map(c => ({
    hubspot_id:        c.id,
    name:              c.properties.name ?? null,
    domain:            c.properties.domain ?? null,
    org_id:            c.properties.org_id ?? null,
    tier:              c.properties.tier ?? null,
    notes:             c.properties.notes ?? null,
    welcome_email_sent: c.properties.welcome_email_sent === 'true',
    type:              c.properties.type ?? null,
    hubspot_url:       c.url ?? null,
    updated_at:        c.updatedAt ?? null,
  }));

  // Sort alphabetically by name
  companies.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(companies, null, 2) + '\n');
  console.log(`[hubspot] Written to ${OUT_FILE}`);
  writeStatus('hubspot', 'ok', { records: companies.length });
}

main().catch(e => {
  console.error('[hubspot]', e.message);
  writeStatus('hubspot', 'error', { error: e.message });
  process.exit(1);
});
