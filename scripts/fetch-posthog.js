#!/usr/bin/env node
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs   = require('fs');
const path = require('path');
const { writeStatus } = require('./write-status');

const API_KEY      = process.env.STACKONE_API_KEY;
const ACCOUNT_ID   = process.env.STACKONE_POSTHOG_ACCOUNT_ID;
const OUT_FILE     = path.join(__dirname, '../site/data/posthog.json');
const HUBSPOT_FILE = path.join(__dirname, '../site/data/hubspot.json');

const INSIGHT_ID = 3589698; // "Click Data 2" — org-level usage metrics

// TODO: replace domain join with org_id once product writes org_id into HubSpot at activation
const INTERNAL_DOMAINS = new Set(['stackone.com']);
const TYPE_PRIORITY = { 'Customer - PLG': 0, 'Customer - SLG': 1, 'Customer': 2 };

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

function buildDomainMap() {
  try {
    const companies = JSON.parse(fs.readFileSync(HUBSPOT_FILE, 'utf8'));
    const map = new Map();
    for (const c of companies) {
      if (!c.domain) continue;
      const domain = c.domain.toLowerCase().replace(/^www\./, '');
      const existing = map.get(domain);
      const thisPriority = TYPE_PRIORITY[c.type] ?? 99;
      const existingPriority = existing ? (TYPE_PRIORITY[existing.type] ?? 99) : Infinity;
      if (!existing || thisPriority < existingPriority) {
        map.set(domain, { type: c.type, hubspot_id: c.hubspot_id, name: c.name });
      }
    }
    console.log(`[posthog] Built domain map from ${map.size} HubSpot domains`);
    return map;
  } catch (e) {
    console.warn(`[posthog] Could not load hubspot.json for domain join: ${e.message}`);
    return new Map();
  }
}

function extractDomains(users) {
  const domains = new Set();
  for (const u of users) {
    const atIdx = u.indexOf('@');
    if (atIdx === -1) continue;
    const domain = u.slice(atIdx + 1).toLowerCase().replace(/^www\./, '');
    if (!INTERNAL_DOMAINS.has(domain)) domains.add(domain);
  }
  return [...domains];
}

function matchCompany(domains, domainMap) {
  for (const domain of domains) {
    const match = domainMap.get(domain);
    if (match) return match;
  }
  return null;
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

  const domainMap = buildDomainMap();

  const output = rows.map(row => {
    const users = row[7] ? row[7].split(' | ').filter(Boolean) : [];
    const domains = extractDomains(users);
    const company = matchCompany(domains, domainMap);
    return {
      org_name:           row[0] ?? null,
      org_id:             row[1] ?? null,
      page_loads:         row[2] ?? 0,
      click_interactions: row[3] ?? 0,
      linked_accounts:    row[4] ?? 0,
      pages_visited:      row[5] ? row[5].split(' | ').filter(Boolean) : [],
      connectors_clicked: row[6] ? row[6].split(' | ').filter(Boolean) : [],
      users,
      org_created:        row[8] ?? null,
      customer_type:      company?.type ?? null,
      hubspot_id:         company?.hubspot_id ?? null,
      hubspot_name:       company?.name ?? null,
    };
  });

  const matched = output.filter(r => r.customer_type).length;
  console.log(`[posthog] Matched ${matched}/${output.length} orgs to HubSpot companies`);

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
