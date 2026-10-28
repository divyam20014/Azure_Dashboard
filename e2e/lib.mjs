// Shared helpers for the browser verification suites (see e2e/README.md).
import { createRequire } from 'node:module';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const require = createRequire(import.meta.url);
export const XLSX = require('xlsx');
export const Papa = require('papaparse');

export const APP = process.env.E2E_URL ?? 'http://127.0.0.1:4173/';
export const APP_ORIGIN = new URL(APP).origin;
/** Working directory with the generated datasets and truth files; suites write their output here. */
export const WORK = process.env.E2E_WORK ?? process.cwd();

/** The installed Google Chrome (or CHROME_PATH). No browser is downloaded. */
export function browserOptions(extra = {}) {
  return { headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' }), ...extra };
}

const open = new Set();
/** Close every browser this suite opened, whatever happens (no orphaned headless Chrome). */
async function closeAll() {
  await Promise.allSettled([...open].map((b) => b.close()));
  open.clear();
}
for (const ev of ['uncaughtException', 'unhandledRejection']) {
  process.on(ev, async (err) => {
    console.error(`FAIL  suite crashed — ${err?.stack ?? err}`);
    await closeAll();
    process.exit(1);
  });
}

export async function launch(extra) {
  const b = await chromium.launch(browserOptions(extra));
  open.add(b);
  return b;
}

export async function launchPersistent(profileDir, extra) {
  const ctx = await chromium.launchPersistentContext(profileDir, browserOptions(extra));
  open.add(ctx);
  return ctx;
}

/** PASS/FAIL reporter; `finish` prints the tally, closes browsers and sets the exit code. */
export function reporter(suite) {
  const results = [];
  const check = (name, ok, detail = '') => {
    results.push({ name, ok: !!ok, detail: String(detail) });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== '' ? ` — ${detail}` : ''}`);
  };
  const finish = async () => {
    await closeAll();
    const failed = results.filter((r) => !r.ok);
    console.log(`\n${suite}: ${results.length - failed.length}/${results.length} checks passed`);
    process.exit(failed.length ? 1 : 0);
  };
  return { check, finish, results };
}

export const num = (s) => Number(String(s).replace(/[,%]/g, '').trim());
export const sortObj = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, v && typeof v === 'object' ? sortObj(v) : v]));
export const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export const sameObj = (a, b) => eq(sortObj(a), sortObj(b));
/** First differences between two {row: {col: value}} objects, for failure messages. */
export function diff(a, b) {
  const out = [];
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = a[k], y = b[k];
    if ((x && typeof x === 'object') || (y && typeof y === 'object')) {
      for (const k2 of new Set([...Object.keys(x ?? {}), ...Object.keys(y ?? {})])) if ((x ?? {})[k2] !== (y ?? {})[k2]) out.push(`${k}/${k2}: ${(x ?? {})[k2]} vs ${(y ?? {})[k2]}`);
    } else if (x !== y) out.push(`${k}: ${x} vs ${y}`);
  }
  return out.slice(0, 4).join('; ');
}
export const csvRows = (path) => Papa.parse(readFileSync(path, 'utf8').replace(/^﻿/, ''), { header: true, skipEmptyLines: true }).data;

/** Upload a file and go through the mapping screen; `prep` can adjust the mapping first. */
export async function uploadAndGenerate(page, file, prep) {
  await page.goto(APP);
  await page.setInputFiles('[data-testid="file-input"]', file);
  await page.getByRole('heading', { name: /Confirm data mapping/ }).waitFor({ timeout: 120000 });
  if (prep) await prep(page);
  await page.getByRole('button', { name: /Generate dashboard/ }).click();
  await page.getByTestId('kpi-total').waitFor({ timeout: 120000 });
}

/** Scroll the whole page once so every lazily initialised chart is drawn. */
export async function scrollAll(page, steps = 50) {
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, 900);
    await page.waitForTimeout(25);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
}

/**
 * Number of heap nodes that are strongly reachable from the GC roots and whose name contains
 * one of `needles` (uploaded titles, names, statuses…). 0 after Clear Data = data released.
 */
export async function reachableDataNodes(cdp, needles) {
  await cdp.send('HeapProfiler.enable');
  for (let i = 0; i < 3; i++) await cdp.send('HeapProfiler.collectGarbage');
  let snap = '';
  const on = (e) => (snap += e.chunk);
  cdp.on('HeapProfiler.addHeapSnapshotChunk', on);
  await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
  cdp.off('HeapProfiler.addHeapSnapshotChunk', on);
  const s = JSON.parse(snap);
  const m = s.snapshot.meta;
  const NF = m.node_fields.length, EF = m.edge_fields.length, et = m.edge_types[0];
  const iN = m.node_fields.indexOf('name'), iE = m.node_fields.indexOf('edge_count'), eT = m.edge_fields.indexOf('type'), eTo = m.edge_fields.indexOf('to_node');
  const count = s.nodes.length / NF;
  const name = (n) => String(s.strings[s.nodes[n * NF + iN]]);
  const first = new Uint32Array(count + 1);
  for (let n = 0, e = 0; n < count; n++) {
    first[n] = e;
    e += s.nodes[n * NF + iE] * EF;
  }
  first[count] = s.edges.length;
  // String tables hold every string ever interned; only real references count.
  const SKIP = new Set(['(External strings)', '(Internalized strings)', '(String table)']);
  const seen = new Uint8Array(count);
  seen[0] = 1;
  const q = [0];
  while (q.length) {
    const x = q.pop();
    if (SKIP.has(name(x))) continue;
    for (let e = first[x]; e < first[x + 1]; e += EF) {
      if (et[s.edges[e + eT]] === 'weak') continue;
      const to = s.edges[e + eTo] / NF;
      if (!seen[to]) {
        seen[to] = 1;
        q.push(to);
      }
    }
  }
  let live = 0;
  for (let n = 0; n < count; n++) if (seen[n] && needles.some((k) => name(n).includes(k))) live++;
  return live;
}

export async function browserStorage(page) {
  return page.evaluate(async () => ({
    local: localStorage.length,
    session: sessionStorage.length,
    idb: (await indexedDB.databases()).length,
    caches: (await caches.keys()).length,
    sw: (await navigator.serviceWorker.getRegistrations()).length,
    cookie: document.cookie,
  }));
}
export const EMPTY_STORAGE = { local: 0, session: 0, idb: 0, caches: 0, sw: 0, cookie: '' };

/** Requests from a Chrome NetLog (--log-net-log, capture mode Everything). */
export function netlogRequests(path) {
  const text = readFileSync(path, 'utf8');
  const log = JSON.parse(text);
  const ev = Object.fromEntries(Object.entries(log.constants.logEventTypes).map(([k, v]) => [v, k]));
  const reqs = log.events.filter((e) => ev[e.type] === 'URL_REQUEST_START_JOB' && e.params?.url).map((e) => ({ method: e.params.method, url: e.params.url, initiator: e.params.initiator ?? '' }));
  return { text, reqs };
}

/** Files under `dir` that contain `marker` (UTF-8 or UTF-16LE). */
export function filesContaining(dir, marker, hits = []) {
  if (!existsSync(dir)) return hits;
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    let s;
    try {
      s = statSync(p);
    } catch {
      continue;
    }
    if (s.isDirectory()) filesContaining(p, marker, hits);
    else if (s.size < 200 * 1024 * 1024) {
      const b = readFileSync(p);
      if (b.includes(Buffer.from(marker)) || b.includes(Buffer.from(marker, 'utf16le'))) hits.push(p);
    }
  }
  return hits;
}

/**
 * In-page text collision measurement for chart SVGs under `rootSelector`.
 * Each text is an oriented rectangle (its bbox through its screen CTM); two texts collide when
 * no separating axis exists and they overlap by more than 1px. Rotated labels are therefore
 * judged by their real geometry, not by axis-aligned boxes.
 * Returns one entry per chart: {section, panel, w, h, texts, collisions, clipped, truncated, examples}.
 */
export function measureChartText(page, rootSelector = 'body') {
  return page.evaluate((root) => {
    const corners = (el) => {
      const b = el.getBBox();
      const m = el.getScreenCTM();
      const p = (x, y) => ({ x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f });
      return [p(b.x, b.y), p(b.x + b.width, b.y), p(b.x + b.width, b.y + b.height), p(b.x, b.y + b.height)];
    };
    const collide = (P, Q) => {
      for (const poly of [P, Q])
        for (let k = 0; k < 4; k++) {
          const a = poly[k], b = poly[(k + 1) % 4];
          const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
          const nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len;
          const pr = (o) => o.map((q) => q.x * nx + q.y * ny);
          const p1 = pr(P), p2 = pr(Q);
          if (Math.min(Math.max(...p1), Math.max(...p2)) - Math.max(Math.min(...p1), Math.min(...p2)) <= 1) return false;
        }
      return true;
    };
    return [...document.querySelectorAll(`${root} div[role="img"]`)].map((box) => {
      const panel = box.closest('.rounded-lg')?.querySelector('h3')?.textContent?.trim() ?? box.getAttribute('aria-label')?.slice(0, 50) ?? '';
      const section = box.closest('section')?.id ?? '';
      const c = box.getBoundingClientRect();
      const texts = [...box.querySelectorAll('svg text')]
        .map((t) => ({ s: t.textContent, r: t.getBoundingClientRect(), o: corners(t) }))
        .filter((t) => t.s && t.s.trim() && t.r.width > 0);
      let collisions = 0;
      const examples = [];
      for (let i = 0; i < texts.length; i++)
        for (let j = i + 1; j < texts.length; j++)
          if (collide(texts[i].o, texts[j].o)) {
            collisions++;
            if (examples.length < 2) examples.push(`"${texts[i].s.slice(0, 28)}" × "${texts[j].s.slice(0, 28)}"`);
          }
      const clippedTexts = texts.filter((t) => t.r.left < c.left - 1 || t.r.right > c.right + 1 || t.r.top < c.top - 1 || t.r.bottom > c.bottom + 1);
      if (clippedTexts.length && examples.length < 3) examples.push(`clipped "${clippedTexts[0].s.slice(0, 28)}"`);
      const truncated = texts.filter((t) => t.s.endsWith('…') || t.s.endsWith('...')).length;
      return { section, panel, w: Math.round(c.width), h: Math.round(c.height), texts: texts.length, collisions, clipped: clippedTexts.length, truncated, examples };
    });
  }, rootSelector);
}
