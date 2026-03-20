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

// Generic personal/provider domains that won't match a HubSpot company
const GENERIC_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk',
  'hotmail.com', 'outlook.com', 'live.com', 'icloud.com',
  'me.com', 'mac.com', 'protonmail.com', 'proton.me',
]);

if (!API_KEY || !ACCOUNT_ID) {
  console.error('[fireflies] Missing STACKONE_API_KEY or STACKONE_FIREFLIES_ACCOUNT_ID');
  process.exit(1);
}

const AUTH = 'Basic ' + Buffer.from(API_KEY + ':').toString('base64');

// params is spread into the top-level RPC request alongside action
// e.g. rpc('fireflies_list_transcripts', { body: { ... }, query: {} })
//   => POST /actions/rpc { action, body: { ... }, query: {} }
async function rpc(action, params = {}) {
  const res = await fetch('https://api.stackone.com/actions/rpc', {
    method: 'POST',
    headers: {
      'Authorization': AUTH,
      'x-account-id': ACCOUNT_ID,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action, ...params }),
  });
  if (!res.ok) throw new Error(`RPC ${action} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

function externalDomains(transcript) {
  const emails = transcript.participants ?? [];
  const domains = new Set();
  for (const email of emails) {
    const domain = email.split('@')[1];
    if (domain && !STACKONE_DOMAINS.has(domain) && !GENERIC_DOMAINS.has(domain)) {
      domains.add(domain);
    }
  }
  return [...domains];
}

async function fetchAllTranscripts(fromDate) {
  const transcripts = [];
  let skip = 0;

  while (true) {
    // Don't include skip on the first request (skip: 0 triggers different API behaviour)
    const variables = skip === 0
      ? { fromDate, limit: 500 }
      : { fromDate, limit: 500, skip };
    const data = await rpc('fireflies_list_transcripts', {
      body: { variables },
      query: {},
    });
    const page = data?.result?.data ?? data?.data ?? [];
    if (!page.length) break;
    transcripts.push(...page);
    skip += page.length; // advance by however many we got (API may cap per-page)
    if (page.length < 500) break; // fewer than requested = last page
  }

  return transcripts;
}

async function main() {
  const fromDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
  console.log(`[fireflies] Fetching transcripts from ${fromDate}...`);

  const transcripts = await fetchAllTranscripts(fromDate);
  console.log(`[fireflies] Found ${transcripts.length} transcripts`);

  // Only keep transcripts that have external participants
  const externalTranscripts = transcripts.filter(t => externalDomains(t).length > 0);

  // Build domain → most-recent transcript map (avoid fetching detail for older calls)
  const latestByDomain = new Map();
  for (const t of externalTranscripts) {
    for (const domain of externalDomains(t)) {
      const existing = latestByDomain.get(domain);
      if (!existing || t.dateString > existing.dateString) {
        latestByDomain.set(domain, t);
      }
    }
  }

  // Also keep all transcripts per domain for the card (action items)
  // but only fetch detail for the most-recent transcript per domain
  const toFetchDetail = new Set([...latestByDomain.values()].map(t => t.id));
  console.log(`[fireflies] Fetching action items for ${toFetchDetail.size} most-recent transcripts (one per domain)...`);

  const detailCache = new Map(); // id → actionItems[]
  for (const t of externalTranscripts) {
    if (!toFetchDetail.has(t.id) || detailCache.has(t.id)) continue;
    try {
      const detail = await rpc('fireflies_get_transcript', { path: { id: t.id } });
      const raw = detail?.data?.summary?.action_items ?? '';
      detailCache.set(t.id, raw.split('\n').map(s => s.trim()).filter(Boolean));
    } catch (e) {
      console.warn(`[fireflies] Could not fetch detail for ${t.id}: ${e.message}`);
      detailCache.set(t.id, []);
    }
  }

  const output = [];
  for (const t of externalTranscripts) {
    const domains = externalDomains(t);
    for (const domain of domains) {
      output.push({
        domain,
        id:           t.id,
        title:        t.title,
        date:         t.dateString,
        action_items: detailCache.get(t.id) ?? [],
      });
    }
  }

  // Sort most-recent first so the card shows calls in chronological order
  output.sort((a, b) => b.date.localeCompare(a.date));

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(output, null, 2) + '\n');
  console.log(`[fireflies] Written ${output.length} entries to ${OUT_FILE}`);

  writeStatus('fireflies', 'ok', { transcripts: transcripts.length, entries: output.length });
}

main().catch(e => {
  console.error('[fireflies]', e.message);
  writeStatus('fireflies', 'error', { error: e.message });
  process.exit(1);
});
