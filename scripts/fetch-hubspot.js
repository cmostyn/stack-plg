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
const PROPERTIES = ['name', 'domain', 'type', 'org_id', 'notes', 'tier', 'welcome_email_sent', 'createdate'];

async function rpc(action, body, pathParams) {
  const payload = { action, body };
  if (pathParams) payload.path = pathParams;
  const res = await fetch('https://api.stackone.com/actions/rpc', {
    method: 'POST',
    headers: {
      'Authorization': AUTH,
      'x-account-id': ACCOUNT_ID,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
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

async function fetchContactIdsForCompanies(companies) {
  // Returns Map<companyId, contactId[]>
  const result = new Map();
  const CHUNK = 100;

  for (let i = 0; i < companies.length; i += CHUNK) {
    const chunk = companies.slice(i, i + CHUNK);
    const inputs = chunk.map(c => ({ id: c.hubspot_id }));

    const data = await rpc(
      'hubspot_batch_read_associations',
      { inputs },
      { fromObjectType: 'companies', toObjectType: 'contacts' },
    );

    const results = data?.result?.results ?? data?.results ?? [];
    for (const item of results) {
      const ids = (item.to ?? []).map(t => String(t.toObjectId ?? t.id));
      result.set(item.from.id, ids);
    }
  }

  return result;
}

async function fetchContacts(contactIds) {
  // Returns Map<contactId, { name, email, createdate, _id }>
  // Uses search with OR filter groups (one per ID) — HubSpot supports up to 300 filter groups
  const result = new Map();
  // HubSpot search API allows max 5 filterGroups per request (each is an OR branch for one contact ID)
  const CHUNK = 5;

  for (let i = 0; i < contactIds.length; i += CHUNK) {
    const chunk = contactIds.slice(i, i + CHUNK);
    const data = await rpc('hubspot_search_contacts', {
      filterGroups: chunk.map(id => ({
        filters: [{ propertyName: 'hs_object_id', operator: 'EQ', value: id }],
      })),
      properties: ['firstname', 'lastname', 'email', 'createdate', 'notes_last_contacted'],
      limit: 100,
    });

    // Each filterGroup matches exactly one contact by hs_object_id, so results
    // will never exceed CHUNK rows — no pagination needed.
    const contacts = data?.result?.results ?? data?.results ?? [];
    for (const c of contacts) {
      result.set(c.id, {
        name:                   [c.properties.firstname, c.properties.lastname].filter(Boolean).join(' ') || null,
        email:                  c.properties.email ?? null,
        createdate:             c.properties.createdate ?? null,
        notes_last_contacted:   c.properties.notes_last_contacted ?? null,
        _id:                    c.id,
      });
    }
  }

  return result;
}

function pickPrimaryContact(contactIds, contactMap) {
  const contacts = contactIds.map(id => contactMap.get(id)).filter(Boolean);
  if (contacts.length === 0) return null;

  contacts.sort((a, b) => {
    const da = a.createdate ? new Date(a.createdate).getTime() : 0;
    const db = b.createdate ? new Date(b.createdate).getTime() : 0;
    if (db !== da) return db - da;                               // most recent first
    return parseInt(a._id, 10) - parseInt(b._id, 10);           // tiebreak: lowest numeric ID
  });

  const { name, email } = contacts[0];
  return (name || email) ? { name, email } : null;
}

async function main() {
  console.log('[hubspot] Fetching PLG companies...');
  const raw = await fetchAllPLGCompanies();
  console.log(`[hubspot] Found ${raw.length} companies`);

  const companies = raw.map(c => ({
    hubspot_id:         c.id,
    name:               c.properties.name ?? null,
    domain:             c.properties.domain ?? null,
    org_id:             c.properties.org_id ?? null,
    tier:               c.properties.tier ?? null,
    notes:              c.properties.notes ?? null,
    welcome_email_sent: c.properties.welcome_email_sent === 'true',
    type:               c.properties.type ?? null,
    createdate:         c.properties.createdate ?? null,
    hubspot_url:        c.url ?? null,
    updated_at:         c.updatedAt ?? null,
    contact:            null,
  }));

  console.log('[hubspot] Fetching contact associations...');
  const assocMap = await fetchContactIdsForCompanies(companies);

  const allContactIds = [...new Set([...assocMap.values()].flat())];
  console.log(`[hubspot] Fetching ${allContactIds.length} unique contacts...`);
  const contactMap = await fetchContacts(allContactIds);

  for (const company of companies) {
    const ids = assocMap.get(company.hubspot_id) ?? [];
    company.contact = pickPrimaryContact(ids, contactMap);

    // Derive last_contact: most recent notes_last_contacted across all contacts
    const timestamps = ids
      .map(id => contactMap.get(id)?.notes_last_contacted)
      .filter(Boolean)
      .map(ts => new Date(ts).getTime())
      .filter(t => !isNaN(t));
    company.last_contact = timestamps.length > 0
      ? new Date(Math.max(...timestamps)).toISOString()
      : null;
  }

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
