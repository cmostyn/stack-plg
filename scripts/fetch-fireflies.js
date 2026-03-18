#!/usr/bin/env node
'use strict';

const https = require('https');
const { writeStatus } = require('./write-status');

const API_KEY = process.env.STACKONE_API_KEY;
const ACCOUNT_ID = process.env.STACKONE_FIREFLIES_ACCOUNT_ID;

async function fetchFireflies() {
  try {
    if (!API_KEY || !ACCOUNT_ID) {
      throw new Error('Missing required environment variables: STACKONE_API_KEY or STACKONE_FIREFLIES_ACCOUNT_ID');
    }

    // Calculate date 30 days ago
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const dateFromISO = thirtyDaysAgo.toISOString().split('T')[0];

    const payload = {
      action: 'fireflies_list_transcripts',
      filters: {
        date_from: dateFromISO
      },
      limit: 50
    };

    const auth = Buffer.from(`${API_KEY}:`).toString('base64');

    const options = {
      hostname: 'api.stackone.com',
      path: '/actions/rpc',
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'x-account-id': ACCOUNT_ID,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(JSON.stringify(payload))
      }
    };

    const response = await new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(new Error(`API request failed with status ${res.statusCode}: ${data}`));
          } else {
            resolve(JSON.parse(data));
          }
        });
      });

      req.on('error', reject);
      req.write(JSON.stringify(payload));
      req.end();
    });

    const recordCount = response.data?.length || 0;
    writeStatus('fireflies', 'success', { records: recordCount });
  } catch (error) {
    writeStatus('fireflies', 'error', { error: error.message });
    console.error('[fireflies] Error:', error.message);
    process.exit(1);
  }
}

fetchFireflies();
