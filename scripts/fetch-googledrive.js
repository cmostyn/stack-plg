#!/usr/bin/env node
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { writeStatus } = require('./write-status');

const API_KEY    = process.env.STACKONE_API_KEY;
const ACCOUNT_ID = process.env.STACKONE_GOOGLEDRIVE_ACCOUNT_ID;

if (!API_KEY || !ACCOUNT_ID) {
  console.error('[googledrive] Missing STACKONE_API_KEY or STACKONE_GOOGLEDRIVE_ACCOUNT_ID');
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
  console.log('[googledrive] Fetching files...');

  const data = await rpc('googledrive_list_files', {
    query: {
      corpora: 'allDrives',
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
      pageSize: 1000,
      fields: 'files(id)',
    },
  });

  const files = data?.data?.files ?? data?.result?.files ?? [];
  console.log(`[googledrive] Found ${files.length} files`);

  writeStatus('googledrive', 'ok', { records: files.length });
}

main().catch(e => {
  console.error('[googledrive]', e.message);
  writeStatus('googledrive', 'error', { error: e.message });
  process.exit(1);
});
