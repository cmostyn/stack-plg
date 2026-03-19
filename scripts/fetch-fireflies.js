#!/usr/bin/env node
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs   = require('fs');
const path = require('path');
const { writeStatus } = require('./write-status');

const API_KEY    = process.env.STACKONE_API_KEY;
const ACCOUNT_ID = process.env.STACKONE_FIREFLIES_ACCOUNT_ID;
const OUT_FILE   = path.join(__dirname, '../site/data/fireflies.json');

const STACKONE_DOMAINS = new Set(['stackone.com']);

if (!API_KEY || !ACCOUNT_ID) {
  console.error('[fireflies] Missing STACKONE_API_KEY or STACKONE_FIREFLIES_ACCOUNT_ID');
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

function externalDomains(transcript) {
  const emails = transcript.participants ?? [];
  const domains = new Set();
  for (const email of emails) {
    const domain = email.split('@')[1];
    if (domain && !STACKONE_DOMAINS.has(domain)) domains.add(domain);
  }
  return [...domains];
}

async function main() {
  const fromDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  console.log(`[fireflies] Fetching transcripts from ${fromDate}...`);

  const data = await rpc('fireflies_list_transcripts', {
    body: { variables: { fromDate, limit: 50 } },
    query: {},
  });

  const transcripts = data?.data ?? [];
  console.log(`[fireflies] Found ${transcripts.length} transcripts`);

  // Build domain → most recent transcript map
  const byDomain = {};
  for (const t of transcripts) {
    const domains = externalDomains(t);
    for (const domain of domains) {
      if (!byDomain[domain] || t.date > byDomain[domain].date) {
        byDomain[domain] = { title: t.title, date: t.dateString, domain };
      }
    }
  }

  const output = Object.values(byDomain);
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(output, null, 2) + '\n');
  console.log(`[fireflies] Written ${output.length} domain entries to ${OUT_FILE}`);

  writeStatus('fireflies', 'ok', { records: transcripts.length });
}

main().catch(e => {
  console.error('[fireflies]', e.message);
  writeStatus('fireflies', 'error', { error: e.message });
  process.exit(1);
});
