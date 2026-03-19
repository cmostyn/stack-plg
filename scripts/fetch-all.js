#!/usr/bin/env node
'use strict';

// Runs all connector fetch scripts in sequence.
// Each script is independent — a failure in one does not block the others.
// Used as the Cloudflare Pages build command: node scripts/fetch-all.js

const { execSync } = require('child_process');
const path = require('path');

const SCRIPTS = [
  'fetch-hubspot.js',
  'fetch-pylon.js',
  'fetch-posthog.js',
  'fetch-fireflies.js',
  'fetch-googledrive.js',
];

let anyFailed = false;

for (const script of SCRIPTS) {
  const scriptPath = path.join(__dirname, script);
  console.log(`\n▶ Running ${script}...`);
  try {
    execSync(`node "${scriptPath}"`, { stdio: 'inherit' });
  } catch (e) {
    console.error(`✗ ${script} failed — continuing`);
    anyFailed = true;
  }
}

console.log('\n' + (anyFailed ? '⚠ Build complete with errors (some connectors failed)' : '✓ All connectors fetched successfully'));
