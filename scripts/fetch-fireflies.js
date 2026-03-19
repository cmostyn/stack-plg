#!/usr/bin/env node
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { writeStatus } = require('./write-status');

const API_KEY    = process.env.STACKONE_API_KEY;
const ACCOUNT_ID = process.env.STACKONE_FIREFLIES_ACCOUNT_ID;

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

async function main() {
  const fromDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  console.log(`[fireflies] Fetching transcripts from ${fromDate}...`);

  const data = await rpc('fireflies_list_transcripts', {
    body: { variables: { fromDate, limit: 50 } },
    query: {},
  });

  const transcripts = data?.data ?? [];
  console.log(`[fireflies] Found ${transcripts.length} transcripts`);

  writeStatus('fireflies', 'ok', { records: transcripts.length });
}

main().catch(e => {
  console.error('[fireflies]', e.message);
  writeStatus('fireflies', 'error', { error: e.message });
  process.exit(1);
});
