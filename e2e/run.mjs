// Browser verification runner (see e2e/README.md).
//   node e2e/run.mjs                 all CI suites: management, edges, builder, layout
//   node e2e/run.mjs builder layout  selected suites
//   node e2e/run.mjs perf            100k-row performance measurement (manual)
// Needs a production build (`npm run build`), Python 3 for the oracle and Google Chrome.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const WORK = process.env.E2E_WORK ?? join(ROOT, 'e2e', '.work');
const URL_ = process.env.E2E_URL ?? 'http://127.0.0.1:4173/';
const DEFAULT = ['management', 'edges', 'builder', 'layout'];
const ALL = [...DEFAULT, 'perf'];
const wanted = process.argv.slice(2);
const suites = wanted.length ? wanted : DEFAULT;
for (const s of suites) if (!ALL.includes(s)) fail(`Unknown suite "${s}". Available: ${ALL.join(', ')}`);

function fail(msg) {
  console.error(msg);
  process.exit(2);
}

if (!existsSync(join(ROOT, 'dist', 'index.html'))) fail('No production build found. Run `npm run build` first.');
mkdirSync(WORK, { recursive: true });

// 1. Independent oracle data (seeded; dates relative to today).
const python = process.env.PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3');
const oracle = spawnSync(python, ['-I', join(ROOT, 'e2e', 'oracle.py')], { cwd: WORK, stdio: 'inherit', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
if (oracle.status !== 0) fail(`Oracle failed (${python}). Set PYTHON to a Python 3 interpreter.`);

// 2. Production preview server (with the production security headers), unless one is running.
async function up() {
  try {
    return (await fetch(URL_)).ok;
  } catch {
    return false;
  }
}
let server = null;
if (!(await up())) {
  const { port, hostname } = new URL(URL_);
  server = spawn(process.execPath, [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--port', port || '4173', '--strictPort', '--host', hostname], { cwd: ROOT, stdio: 'ignore' });
  for (let i = 0; i < 60 && !(await up()); i++) await new Promise((r) => setTimeout(r, 500));
  if (!(await up())) {
    server.kill();
    fail(`Preview server did not start at ${URL_}.`);
  }
}
const stop = () => server && !server.killed && server.kill();
process.on('exit', stop);
process.on('SIGINT', () => process.exit(130));

// 3. Suites, one at a time (they measure timing and memory, so they must not compete).
const summary = [];
for (const name of suites) {
  console.log(`\n=== ${name} ===`);
  const started = Date.now();
  const code = await new Promise((resolve) => {
    const child = spawn(process.execPath, [join(ROOT, 'e2e', 'suites', `${name}.mjs`)], { cwd: ROOT, stdio: 'inherit', env: { ...process.env, E2E_WORK: WORK, E2E_URL: URL_ } });
    child.on('exit', (c) => resolve(c ?? 1));
  });
  summary.push({ name, ok: code === 0, seconds: Math.round((Date.now() - started) / 1000) });
}
stop();
console.log('\n=== summary ===');
for (const s of summary) console.log(`${s.ok ? 'PASS' : 'FAIL'}  ${s.name} (${s.seconds}s)`);
console.log(`Output (downloads, reports, NetLogs): ${WORK}`);
process.exit(summary.every((s) => s.ok) ? 0 : 1);
