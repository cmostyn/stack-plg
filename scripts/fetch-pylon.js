#!/usr/bin/env node
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs   = require('fs');
const path = require('path');
const { writeStatus } = require('./write-status');

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

async function fetchAccountsByType(type) {
  const accounts = [];
  let cursor = undefined;

  while (true) {
    const body = {
      filter: { field: 'account.hubspot.type', operator: 'equals', value: type },
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

async function fetchIssues(startTime, endTime) {
  const res = await fetch('https://api.stackone.com/actions/rpc', {
    method: 'POST',
    headers: {
      'Authorization': AUTH,
      'x-account-id': ACCOUNT_ID,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      action: 'pylon_list_issues',
      query: { start_time: startTime, end_time: endTime },
    }),
  });
  if (!res.ok) throw new Error(`RPC pylon_list_issues failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data?.result?.data?.data ?? data?.data?.data ?? [];
}

function isoWeekMonday(dateStr) {
  const d = new Date(dateStr);
  const day = d.getUTCDay();
  const daysToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() + daysToMonday);
  return monday.toISOString().slice(0, 10);
}

function buildSummary(issues30d, issues90d, accounts) {
  const OPEN_STATES = { new: 0, waiting_on_you: 0, waiting_on_customer: 0, waiting_on_engineering: 0 };
  const openByState = { ...OPEN_STATES };
  for (const issue of issues30d) {
    if (issue.state in openByState) openByState[issue.state]++;
  }

  const totalOpenLive = accounts.reduce((n, a) => n + (a.open_tickets_live ?? 0), 0);
  const needingAction = openByState.new + openByState.waiting_on_you + openByState.waiting_on_engineering;

  const weekMap = {};
  for (const issue of issues90d) {
    const secs = issue.business_hours_first_response_seconds;
    if (!secs || secs <= 0) continue;
    const week = isoWeekMonday(issue.created_at);
    if (!weekMap[week]) weekMap[week] = [];
    weekMap[week].push(secs / 3600);
  }
  const frtWeekly = Object.entries(weekMap)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([week, vals]) => ({
      week,
      avg_hours: Math.round(vals.reduce((s, v) => s + v, 0) / vals.length * 10) / 10,
    }));

  return { open_by_state: openByState, total_open_live: totalOpenLive, needing_action: needingAction, frt_weekly: frtWeekly };
}

function mapAccount(account, issues30dByAccountId, customerType) {
  const issues = issues30dByAccountId[account.id] ?? [];
  const open   = issues.filter(i => i.state !== 'closed').length;
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
    customer_type:     customerType,
    tier,
    open_tickets_live: openTicketCount,
    issues_last_30d:   { total: issues.length, open, closed },
    updated_at:        account.latest_customer_activity_time ?? null,
  };
}

async function main() {
  const now           = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo  = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const fmt = d => d.toISOString().replace(/\.\d+Z$/, 'Z');

  console.log('[pylon] Fetching PLG + SLG accounts and 90 days of issues in parallel...');
  const [plgRaw, slgRaw, issues60_90, issues30_60, issues30d] = await Promise.all([
    fetchAccountsByType('Customer - PLG'),
    fetchAccountsByType('Customer - SLG'),
    fetchIssues(fmt(ninetyDaysAgo), fmt(sixtyDaysAgo)),
    fetchIssues(fmt(sixtyDaysAgo), fmt(thirtyDaysAgo)),
    fetchIssues(fmt(thirtyDaysAgo), fmt(now)),
  ]);

  console.log(`[pylon] Accounts: ${plgRaw.length} PLG, ${slgRaw.length} SLG`);
  const allIssues90d = [...issues60_90, ...issues30_60, ...issues30d];
  console.log(`[pylon] Issues: ${issues30d.length} (30d), ${allIssues90d.length} (90d)`);

  // Build sets for issue type filtering
  const plgIds = new Set(plgRaw.map(a => a.id));
  const slgIds = new Set(slgRaw.map(a => a.id));

  // Index 30d issues by account ID
  const issues30dByAccountId = {};
  for (const issue of issues30d) {
    const aid = issue.account?.id;
    if (!aid) continue;
    if (!issues30dByAccountId[aid]) issues30dByAccountId[aid] = [];
    issues30dByAccountId[aid].push(issue);
  }

  // Build per-account output
  const plgOutput = plgRaw.map(a => mapAccount(a, issues30dByAccountId, 'plg'));
  const slgOutput = slgRaw.map(a => mapAccount(a, issues30dByAccountId, 'slg'));
  const output    = [...plgOutput, ...slgOutput];
  output.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));

  // Build summaries per type
  const plgIssues30d = issues30d.filter(i => plgIds.has(i.account?.id));
  const slgIssues30d = issues30d.filter(i => slgIds.has(i.account?.id));
  const plgIssues90d = allIssues90d.filter(i => plgIds.has(i.account?.id));
  const slgIssues90d = allIssues90d.filter(i => slgIds.has(i.account?.id));

  // "all" = PLG + SLG combined (not every Pylon account type)
  const allFilteredIssues30d = [...plgIssues30d, ...slgIssues30d];
  const allFilteredIssues90d = [...plgIssues90d, ...slgIssues90d];

  const summary = {
    all: buildSummary(allFilteredIssues30d, allFilteredIssues90d, output),
    plg: buildSummary(plgIssues30d,         plgIssues90d,         plgOutput),
    slg: buildSummary(slgIssues30d,         slgIssues90d,         slgOutput),
    updated_at: now.toISOString(),
  };

  const SUMMARY_FILE = path.join(__dirname, '../site/data/pylon-summary.json');
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(output, null, 2) + '\n');
  fs.writeFileSync(SUMMARY_FILE, JSON.stringify(summary, null, 2) + '\n');

  const s = summary.all;
  console.log(`[pylon] Written: ${output.length} accounts, ${s.needing_action} needing action, ${s.frt_weekly.length} FRT weeks`);
  writeStatus('pylon', 'ok', { records: output.length, open_tickets: s.total_open_live });
}

main().catch(e => {
  console.error('[pylon]', e.message);
  writeStatus('pylon', 'error', { error: e.message });
  process.exit(1);
});
