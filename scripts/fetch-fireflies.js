#!/usr/bin/env node
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs   = require('fs');
const path = require('path');
const { writeStatus } = require('./write-status');

const API_KEY  = process.env.FIREFLIES_API_KEY;
const OUT_FILE = path.join(__dirname, '../site/data/fireflies.json');

// Domains that belong to StackOne or are personal/generic — not customer companies
const INTERNAL_DOMAINS = new Set(['stackone.com']);
const GENERIC_DOMAINS  = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk',
  'hotmail.com', 'outlook.com', 'live.com', 'icloud.com',
  'me.com', 'mac.com', 'protonmail.com', 'proton.me',
  'fireflies.ai',
]);

if (!API_KEY) {
  console.error('[fireflies] Missing FIREFLIES_API_KEY');
  process.exit(1);
}

async function gql(query, variables = {}) {
  const res = await fetch('https://api.fireflies.ai/graphql', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Fireflies GraphQL failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors.map(e => e.message).join('; '));
  return json.data;
}

function externalDomains(transcript) {
  const emails = transcript.participants ?? [];
  const domains = new Set();
  for (const email of emails) {
    const domain = (email.split('@')[1] ?? '').toLowerCase();
    if (domain && !INTERNAL_DOMAINS.has(domain) && !GENERIC_DOMAINS.has(domain)) {
      domains.add(domain);
    }
  }
  return [...domains];
}

const LIST_QUERY = `
  query Transcripts($fromDate: DateTime, $skip: Int, $limit: Int) {
    transcripts(fromDate: $fromDate, skip: $skip, limit: $limit) {
      id
      title
      date
      participants
      summary { action_items }
    }
  }
`;

async function fetchAllTranscripts(fromDate) {
  const transcripts = [];
  const PAGE_SIZE   = 50;
  let   skip        = 0;

  while (true) {
    const data = await gql(LIST_QUERY, { fromDate, limit: PAGE_SIZE, skip: skip || undefined });
    const page = data?.transcripts ?? [];
    if (!page.length) break;
    // Normalise date to ISO string
    for (const t of page) t.dateString = new Date(t.date).toISOString();
    transcripts.push(...page);
    console.log(`[fireflies] Fetched ${transcripts.length} transcripts so far...`);
    if (page.length < PAGE_SIZE) break;
    skip += page.length;
  }

  return transcripts;
}

async function main() {
  // Fetch all transcripts from the last year
  const fromDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
  console.log(`[fireflies] Fetching transcripts from ${fromDate}...`);

  const transcripts = await fetchAllTranscripts(fromDate);
  console.log(`[fireflies] Found ${transcripts.length} total transcripts`);

  // Only keep transcripts that have external participants
  const externalTranscripts = transcripts.filter(t => externalDomains(t).length > 0);

  // Build domain → most-recent transcript map
  const latestByDomain = new Map();
  for (const t of externalTranscripts) {
    for (const domain of externalDomains(t)) {
      const existing = latestByDomain.get(domain);
      if (!existing || t.dateString > existing.dateString) {
        latestByDomain.set(domain, t);
      }
    }
  }

  console.log(`[fireflies] ${latestByDomain.size} unique external domains found`);

  const output = [];
  for (const t of externalTranscripts) {
    const domains = externalDomains(t);
    for (const domain of domains) {
      output.push({
        domain,
        id:           t.id,
        title:        t.title,
        date:         t.dateString,
        action_items: t.summary?.action_items
          ? t.summary.action_items.split('\n').map(s => s.trim()).filter(Boolean)
          : [],
      });
    }
  }

  // Sort most-recent first
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
