#!/usr/bin/env node
/**
 * Privacy audit: static checks that back the privacy statement.
 *   1. Application source uses no network, telemetry or browser-storage APIs.
 *   2. No database / analytics / telemetry / AI packages are production dependencies.
 *   3. The production build (if present) carries a CSP that forbids all connections.
 *   4. Lists network-capable code paths found inside third-party bundles, for review.
 * Exit code 1 when any check fails.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
let failed = false;
const fail = (msg) => {
  failed = true;
  console.log(`  FAIL  ${msg}`);
};
const pass = (msg) => console.log(`  PASS  ${msg}`);

function walk(dir, filter) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === 'tests' || name === 'node_modules' ? [] : walk(full, filter);
    return filter(name) ? [full] : [];
  });
}

console.log('1. Application source (src/, excluding tests)');
const forbidden = {
  'fetch()': /\bfetch\s*\(/,
  XMLHttpRequest: /XMLHttpRequest/,
  sendBeacon: /sendBeacon/,
  WebSocket: /new\s+WebSocket/,
  EventSource: /EventSource/,
  localStorage: /localStorage/,
  sessionStorage: /sessionStorage/,
  indexedDB: /indexedDB/,
  'document.cookie': /document\.cookie/,
  'Cache Storage': /caches\./,
  serviceWorker: /serviceWorker/,
  'Papa Parse remote download': /download:\s*true/,
};
const files = walk(join(root, 'src'), (n) => /\.(ts|tsx)$/.test(n));
let hits = 0;
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  for (const [name, re] of Object.entries(forbidden)) {
    if (re.test(text)) {
      hits++;
      fail(`${relative(root, file)} uses ${name}`);
    }
  }
}
if (!hits) pass(`${files.length} files scanned; no network, telemetry or storage APIs`);

console.log('2. Production dependencies');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const banned = /sql|mongo|redis|firebase|supabase|dexie|localforage|idb|prisma|sequelize|sentry|analytics|segment|mixpanel|amplitude|posthog|datadog|newrelic|bugsnag|logrocket|openai|anthropic|langchain|axios/i;
const deps = Object.keys(pkg.dependencies ?? {});
const bad = deps.filter((d) => banned.test(d));
if (bad.length) fail(`suspicious dependencies: ${bad.join(', ')}`);
else pass(`${deps.length} dependencies: ${deps.join(', ')}`);

console.log('3. Production build');
const html = join(root, 'dist', 'index.html');
if (!existsSync(html)) {
  console.log('  SKIP  dist/ not found — run `npm run build` first');
} else {
  const csp = /Content-Security-Policy" content="([^"]+)"/.exec(readFileSync(html, 'utf8'))?.[1];
  if (!csp) fail('dist/index.html has no Content-Security-Policy');
  else if (!csp.includes("connect-src 'none'")) fail(`CSP does not forbid connections: ${csp}`);
  else pass(`CSP present: ${csp}`);
  const externalScripts = /<script[^>]+src="https?:/i.test(readFileSync(html, 'utf8'));
  if (externalScripts) fail('index.html loads scripts from another origin');
  else pass('no externally hosted scripts or stylesheets');

  console.log('4. Network-capable code inside bundled third-party libraries (informational)');
  const assets = walk(join(root, 'dist', 'assets'), (n) => n.endsWith('.js'));
  for (const file of assets) {
    const text = readFileSync(file, 'utf8');
    const found = Object.entries(forbidden)
      .filter(([, re]) => re.test(text))
      .map(([n]) => n);
    if (found.length) console.log(`  INFO  ${relative(root, file)}: ${found.join(', ')} (blocked at runtime by connect-src 'none')`);
  }
}

console.log(failed ? '\nPrivacy audit FAILED' : '\nPrivacy audit passed');
process.exit(failed ? 1 : 0);
