#!/usr/bin/env node
'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const chokidar = require('chokidar');

// ── Paths ──────────────────────────────────────────────────────────────────────

const OUTPUTS_DIR = path.join(process.env.HOME, 'Documents/Claude/outputs');
const SITE_DIR    = path.join(__dirname, 'site');
const MANIFEST    = path.join(SITE_DIR, 'manifest.json');
const TEMPLATE    = path.join(__dirname, 'templates/report.html');
const FILE_RE     = /^plg-support-digest-(\d{4}-\d{2}-\d{2})\.html$/;

// ── Helpers ────────────────────────────────────────────────────────────────────

function log(tag, msg) {
  console.log(`[${tag}] ${msg}`);
}

function err(tag, msg) {
  console.error(`[${tag}] ${msg}`);
}

function formatDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

function readManifest() {
  try {
    return JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  } catch {
    return [];
  }
}

function writeManifest(entries) {
  const sorted = entries.slice().sort((a, b) => b.date.localeCompare(a.date));
  fs.writeFileSync(MANIFEST, JSON.stringify(sorted, null, 2) + '\n');
}

function titleFromDigest(filePath) {
  // Pull the <title> from the digest HTML rather than constructing one
  try {
    const html = fs.readFileSync(filePath, 'utf8');
    const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (m) return m[1].trim();
  } catch { /* fall through */ }
  return null;
}

// ── Core: publish one digest ───────────────────────────────────────────────────

function publish(filePath) {
  const filename = path.basename(filePath);
  const match    = filename.match(FILE_RE);
  if (!match) return;

  const date = match[1];
  const manifest = readManifest();

  if (manifest.some(e => e.date === date)) {
    log('skip', `${date} is already published`);
    return;
  }

  log('publish', date);

  // 1. Copy digest into site/reports/YYYY-MM-DD/digest.html
  const reportDir = path.join(SITE_DIR, 'reports', date);
  fs.mkdirSync(reportDir, { recursive: true });
  fs.copyFileSync(filePath, path.join(reportDir, 'digest.html'));
  log('copy', `digest.html → site/reports/${date}/`);

  // 2. Build report page from template
  const title         = titleFromDigest(filePath) ?? `PLG Support Digest — ${formatDate(date)}`;
  const dateFormatted = formatDate(date);
  const template      = fs.readFileSync(TEMPLATE, 'utf8');
  const reportHtml    = template
    .replace(/\{\{TITLE\}\}/g, title)
    .replace(/\{\{DATE_FORMATTED\}\}/g, dateFormatted);

  fs.writeFileSync(path.join(reportDir, 'index.html'), reportHtml);
  log('build', `site/reports/${date}/index.html`);

  // 3. Update manifest
  manifest.push({ date, title });
  writeManifest(manifest);
  log('manifest', `added ${date}`);

  // 4. Commit and push
  const committed = gitCommit(date);
  if (!committed) return;

  // 5. Deploy
  deploy();
}

// ── Git ────────────────────────────────────────────────────────────────────────

function gitCommit(date) {
  try {
    execSync('git add -A', { cwd: __dirname, stdio: 'inherit' });

    // Check there's anything staged
    const status = execSync('git status --porcelain', { cwd: __dirname, encoding: 'utf8' });
    if (!status.trim()) {
      log('git', 'nothing to commit');
      return true;
    }

    execSync(`git commit -m "add PLG digest ${date}"`, { cwd: __dirname, stdio: 'inherit' });
    execSync('git push', { cwd: __dirname, stdio: 'inherit' });
    log('git', `pushed: add PLG digest ${date}`);
    return true;
  } catch (e) {
    err('git', e.message);
    return false;
  }
}

// ── Cloudflare deploy ──────────────────────────────────────────────────────────

function deploy() {
  const hookUrl   = process.env.CF_DEPLOY_HOOK_URL;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token     = process.env.CLOUDFLARE_API_TOKEN;
  const project   = process.env.CF_PROJECT_NAME;

  // Option A: deploy hook (simplest — just a URL to POST to)
  if (hookUrl) {
    try {
      execSync(`curl -s -X POST "${hookUrl}" -o /dev/null -w "%{http_code}"`, { stdio: 'inherit' });
      log('cloudflare', 'deploy triggered via hook');
    } catch (e) {
      err('cloudflare', e.message);
    }
    return;
  }

  // Option B: Cloudflare Pages API
  if (accountId && token && project) {
    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${project}/deployments`;
    try {
      const raw = execSync(
        `curl -s -X POST "${url}" \
         -H "Authorization: Bearer ${token}" \
         -H "Content-Type: application/json"`,
        { encoding: 'utf8' }
      );
      const res = JSON.parse(raw);
      if (res.success) {
        log('cloudflare', 'deploy triggered');
      } else {
        err('cloudflare', JSON.stringify(res.errors));
      }
    } catch (e) {
      err('cloudflare', e.message);
    }
    return;
  }

  log('cloudflare', 'no deploy credentials — if Git integration is set up, the push will trigger a deploy automatically');
}

// ── Scan existing outputs ──────────────────────────────────────────────────────

function scan() {
  if (!fs.existsSync(OUTPUTS_DIR)) {
    err('scan', `outputs folder not found: ${OUTPUTS_DIR}`);
    return;
  }

  const files = fs.readdirSync(OUTPUTS_DIR).filter(f => FILE_RE.test(f));

  if (!files.length) {
    log('scan', 'no digest files found');
    return;
  }

  log('scan', `${files.length} file(s) found`);
  files.forEach(f => publish(path.join(OUTPUTS_DIR, f)));
}

// ── Entry point ────────────────────────────────────────────────────────────────

const mode = process.argv[2];

if (mode === '--watch') {
  scan(); // catch anything dropped since last run

  log('watch', `watching ${OUTPUTS_DIR}`);

  const watcher = chokidar.watch(
    path.join(OUTPUTS_DIR, 'plg-support-digest-*.html'),
    {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 200 },
    }
  );

  watcher.on('add', filePath => {
    log('watch', `new file: ${path.basename(filePath)}`);
    publish(filePath);
  });

  watcher.on('error', e => err('watch', e.message));

} else {
  // --once or no flag: process and exit
  scan();
}
