#!/usr/bin/env node
'use strict';

const fs   = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../site/data');

function load(filename) {
  const file = path.join(DATA_DIR, filename);
  if (!fs.existsSync(file)) {
    console.warn(`[build] WARNING: ${filename} not found — skipping`);
    return [];
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function main() {
  console.log('[build] Loading data sources...');
  const hubspot  = load('hubspot.json');
  const pylon    = load('pylon.json');
  const posthog  = load('posthog.json');

  // Index by org_id for fast lookup
  const pylonByOrgId    = Object.fromEntries(pylon.filter(p => p.org_id).map(p => [p.org_id, p]));
  const posthogByOrgId  = Object.fromEntries(posthog.filter(p => p.org_id).map(p => [p.org_id, p]));
  // Also index Pylon by hubspot_id
  const pylonByHubspotId = Object.fromEntries(pylon.filter(p => p.hubspot_id).map(p => [p.hubspot_id, p]));

  console.log(`[build] HubSpot: ${hubspot.length}, Pylon: ${pylon.length}, PostHog: ${posthog.length}`);

  const customers = hubspot.map(company => {
    const orgId = company.org_id;
    const pylonData   = pylonByOrgId[orgId] ?? pylonByHubspotId[company.hubspot_id] ?? null;
    const posthogData = posthogByOrgId[orgId] ?? null;

    return {
      // Identity
      name:       company.name,
      domain:     company.domain,
      org_id:     orgId,
      hubspot_id: company.hubspot_id,
      hubspot_url: company.hubspot_url,
      tier:       company.tier,
      welcome_email_sent: company.welcome_email_sent,
      notes:      company.notes,

      // Pylon support data
      pylon: pylonData ? {
        account_id:        pylonData.pylon_account_id,
        open_tickets_live: pylonData.open_tickets_live,
        issues_last_30d:   pylonData.issues_last_30d,
        updated_at:        pylonData.updated_at,
      } : null,

      // PostHog product data
      posthog: posthogData ? {
        active_users: posthogData.active_users,
        total_events: posthogData.total_events,
        pageviews:    posthogData.pageviews,
        api_requests: posthogData.api_requests,
        first_seen:   posthogData.first_seen,
        last_seen:    posthogData.last_seen,
        period_days:  posthogData.period_days,
      } : null,

      // Meta
      generated_at: new Date().toISOString(),
    };
  });

  // Sort: customers with most recent Pylon activity first, then alphabetically
  customers.sort((a, b) => {
    const aTs = a.pylon?.updated_at ?? '';
    const bTs = b.pylon?.updated_at ?? '';
    if (aTs !== bTs) return bTs.localeCompare(aTs);
    return (a.name ?? '').localeCompare(b.name ?? '');
  });

  const outFile = path.join(DATA_DIR, 'customers.json');
  fs.writeFileSync(outFile, JSON.stringify(customers, null, 2) + '\n');
  console.log(`[build] Written ${customers.length} customers → ${outFile}`);

  // Summary stats
  const withPylon   = customers.filter(c => c.pylon).length;
  const withPosthog = customers.filter(c => c.posthog).length;
  const totalOpen   = customers.reduce((n, c) => n + (c.pylon?.open_tickets_live ?? 0), 0);
  console.log(`[build] Pylon match: ${withPylon}/${customers.length}, PostHog match: ${withPosthog}/${customers.length}, open tickets: ${totalOpen}`);
}

main();
