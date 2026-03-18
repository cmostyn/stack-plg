#!/usr/bin/env node
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs   = require('fs');
const path = require('path');

const API_KEY    = process.env.STACKONE_PYLON_API_KEY;
const ACCOUNT_ID = process.env.STACKONE_PYLON_ACCOUNT_ID;
const OUT_FILE   = path.join(__dirname, '../site/data/pylon.json');

if (!API_KEY || !ACCOUNT_ID) {
  console.error('[pylon] Missing STACKONE_PYLON_API_KEY or STACKONE_PYLON_ACCOUNT_ID');
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

// Fetch all PLG accounts (paginated)
async function fetchPLGAccounts() {
  const accounts = [];
  let cursor = undefined;

  while (true) {
    const body = {
      filter: { field: 'account.hubspot.type', operator: 'equals', value: 'Customer - PLG' },
      limit: 1000,
    };
    if (cursor) body.cursor = cursor;

    const data = await rpc('pylon_search_accounts', body);
    const page = data?.result?.data?.data ?? data?.data?.data ?? [];
    accounts.push(...page);

    const pagination = data?.result?.data?.pagination ?? data?.data?.pagination;
    if (!pagination?.has_next_page) break;
    cursor = pagination.cursor;
  }

  return accounts;
}

// Fetch all issues in a 30-day window (max window allowed by Pylon)
async function fetchIssues(startTime, endTime) {
  const data = await rpc('pylon_list_issues', { query: { start_time: startTime, end_time: endTime } });
  return data?.result?.data?.data ?? data?.data?.data ?? [];
}

async function main() {
  console.log('[pylon] Fetching PLG accounts...');
  const accounts = await fetchPLGAccounts();
  console.log(`[pylon] Found ${accounts.length} PLG accounts`);

  const now           = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const startTime     = thirtyDaysAgo.toISOString().replace(/\.\d+Z$/, 'Z');
  const endTime       = now.toISOString().replace(/\.\d+Z$/, 'Z');

  console.log(`[pylon] Fetching issues ${startTime} → ${endTime}...`);
  const allIssues = await fetchIssues(startTime, endTime);
  console.log(`[pylon] Found ${allIssues.length} total issues`);

  // Index issues by account ID
  const issuesByAccount = {};
  for (const issue of allIssues) {
    const aid = issue.account?.id;
    if (!aid) continue;
    if (!issuesByAccount[aid]) issuesByAccount[aid] = [];
    issuesByAccount[aid].push(issue);
  }

  const output = accounts.map(account => {
    const issues = issuesByAccount[account.id] ?? [];
    const open   = issues.filter(i => i.state === 'open').length;
    const closed = issues.filter(i => i.state === 'closed').length;

    const cf = account.custom_fields ?? {};
    const orgId           = cf['account.hubspot.org_id']?.value ?? null;
    const tier            = cf['tier']?.value ?? null;
    const openTicketCount = cf['count_of_open_tickets']?.value
      ? parseInt(cf['count_of_open_tickets'].value, 10)
      : null;

    const hubspotId = (account.crm_settings?.details ?? [])
      .find(d => d.source === 'hubspot')?.id ?? null;

    return {
      pylon_account_id:  account.id,
      name:              account.name,
      domain:            account.primary_domain ?? null,
      org_id:            orgId,
      hubspot_id:        hubspotId,
      tier,
      open_tickets_live: openTicketCount,
      issues_last_30d: {
        total:  issues.length,
        open,
        closed,
      },
      updated_at: account.latest_customer_activity_time ?? null,
    };
  });

  output.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(output, null, 2) + '\n');
  console.log(`[pylon] Written to ${OUT_FILE}`);
}

main().catch(e => { console.error('[pylon]', e.message); process.exit(1); });
