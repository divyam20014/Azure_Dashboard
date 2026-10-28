// Custom Chart Builder suite: chart values, drill-down, chart filters, CSV/Excel/SVG/PNG exports,
// reorder/remove, chart layout at three widths and privacy after Clear Data, against the
// independent oracle (e2e/oracle.py → truth-builder.json).
import { readFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { APP_ORIGIN, WORK, XLSX, launchPersistent, reporter, num, sameObj, diff, csvRows, uploadAndGenerate, reachableDataNodes, browserStorage, EMPTY_STORAGE, eq, netlogRequests, filesContaining, measureChartText } from '../lib.mjs';

const OUT = join(WORK, 'builder');
const PROFILE = join(OUT, 'profile');
const NETLOG = join(OUT, 'netlog.json');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const T = JSON.parse(readFileSync(join(WORK, 'truth-builder.json'), 'utf8'));
const DATA = join(WORK, 'oracle-issues.csv');
const { check, finish } = reporter('builder');

const context = await launchPersistent(PROFILE, {
  acceptDownloads: true,
  viewport: { width: 1440, height: 900 },
  args: [`--log-net-log=${NETLOG}`, '--net-log-capture-mode=Everything'],
});
const page = context.pages()[0] ?? (await context.newPage());
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(e.message));
const kpi = async (id) => (await page.getByTestId(`kpi-${id}-count`).textContent()).trim();
const reg = async () => num((await page.getByTestId('register-count').textContent()).match(/^[\d,]+/)[0]);
const download = async (trigger) => {
  const [dl] = await Promise.all([page.waitForEvent('download'), trigger()]);
  const p = join(OUT, `${Date.now()}-${dl.suggestedFilename()}`);
  await dl.saveAs(p);
  return { path: p, name: dl.suggestedFilename() };
};
const total = (row) => Object.values(row).reduce((a, b) => a + b, 0);

// Same mapping decisions as the oracle.
const mapLikeOracle = async (p) => {
  await p.selectOption('#date-order-select', 'DMY');
  await p.getByRole('button', { name: /Value mapping/ }).click();
  await p.getByRole('button', { name: /Apply \d+ suggested categor/ }).click();
  await p.getByLabel('Workflow category for Resolved').selectOption('closed');
};
await uploadAndGenerate(page, DATA, mapLikeOracle);
check('Dashboard total = oracle', num(await kpi('total')) === T.total, await kpi('total'));

const section = page.locator('#builder');
await section.scrollIntoViewIfNeeded();
check('Builder empty state shown', await section.getByText('No custom charts yet').isVisible());
const card = (i) => section.getByTestId(`builder-card-${i}`);
const sel = (i, label, value) => card(i).getByLabel(label, { exact: true }).selectOption(value);
const cardCount = () => section.locator('[data-testid^="builder-card-"]').count();

/** Heatmap/table of card i as {row: {column: text}}; empty cells (·, 0, 0.0%) are omitted. */
const readMatrix = (i, testid) =>
  card(i)
    .getByTestId(testid)
    .evaluate((t) => {
      const cols = [...t.querySelectorAll('thead th')].slice(1).map((th) => th.textContent.trim()).filter((c) => c !== 'Total');
      const m = {};
      for (const tr of t.querySelectorAll('tbody tr')) {
        const row = tr.querySelector('th').textContent.trim().replace(/ \(unmapped\)$/, '');
        [...tr.querySelectorAll('td button')].forEach((b, ci) => {
          const v = b.textContent.trim();
          if (['·', '0', '0.0%', '', '—'].includes(v)) return;
          (m[row] ??= {})[cols[ci]] = v;
        });
      }
      return m;
    });
const numeric = (m) => Object.fromEntries(Object.entries(m).map(([r, c]) => [r, Object.fromEntries(Object.entries(c).map(([k, v]) => [k, num(v)]))]));

// ---------------- 1. Assignee → Priority → Issue count (heatmap) ----------------
await section.getByRole('button', { name: /Add chart/ }).click();
await card(0).waitFor();
check('Default chart: Issue count by Assignee', (await card(0).getByTestId('builder-title').textContent()).includes('Issue count by Assignee'));
await sel(0, 'C. Secondary grouping / series', 'priority');
await sel(0, 'A. Chart type', 'heatmap');
await sel(0, 'Categories shown', 'all');
const heat = numeric(await readMatrix(0, 'builder-heatmap'));
check('Assignee → Priority → Issue count = oracle (every cell)', sameObj(heat, T.assigneePriority), diff(heat, T.assigneePriority));

const ana = 'Ana Silva <ana@example.com>';
await card(0).getByLabel(`${ana}, High: ${T.assigneePriority[ana].High} issue count`).click();
await page.waitForTimeout(400);
check('Heatmap cell drill-down → register count', (await reg()) === T.assigneePriority[ana].High, `${await reg()}`);
check('Drill-down leaves dashboard KPIs unchanged', num(await kpi('total')) === T.total);
await page.getByRole('button', { name: 'Clear register selection' }).click();

const csv1 = csvRows((await download(() => card(0).getByRole('button', { name: 'Export chart data as CSV' }).click())).path);
const fromCsv1 = Object.fromEntries(csv1.map((r) => [r.Category, Object.fromEntries(Object.entries(r).filter(([k, v]) => k !== 'Category' && k !== 'Total' && num(v) !== 0).map(([k, v]) => [k, num(v)]))]));
check('Heatmap CSV export = oracle', sameObj(fromCsv1, T.assigneePriority), diff(fromCsv1, T.assigneePriority));
check('Heatmap CSV row totals = assignee totals', csv1.every((r) => num(r.Total) === total(T.assigneePriority[r.Category])));

await card(0).getByRole('button', { name: 'Chart filter: Priority' }).click();
await page.getByRole('group', { name: 'Chart filter: Priority options' }).getByText('High', { exact: true }).click();
await page.keyboard.press('Escape');
const heatHigh = await readMatrix(0, 'builder-heatmap');
const expectedHigh = Object.fromEntries(Object.entries(T.assigneePriority).filter(([, c]) => c.High).map(([a, c]) => [a, { High: String(c.High) }]));
check('Chart filter Priority = High → only High column, oracle values', sameObj(heatHigh, expectedHigh), diff(heatHigh, expectedHigh));
check('Chart filter leaves dashboard KPIs unchanged', num(await kpi('total')) === T.total);
await card(0).getByRole('button', { name: /Clear chart filters/ }).click();

// ---------------- 2. State → Assignee → % within state (table) ----------------
await section.getByRole('button', { name: /Add chart/ }).click();
await sel(1, 'B. Analyze data by', 'status');
await sel(1, 'C. Secondary grouping / series', 'assignee');
await sel(1, 'D. Metric / value', 'percentGroup');
await sel(1, 'A. Chart type', 'table');
await sel(1, 'Categories shown', 'all');
const pctTable = await readMatrix(1, 'builder-table');
const expPct = Object.fromEntries(Object.entries(T.statusAssigneePct).map(([s, row]) => [s, Object.fromEntries(Object.entries(row).map(([a, v]) => [a, `${v.toFixed(1)}%`]))]));
// At most 12 series are drawn; compare the drawn columns.
const drawnCols = new Set(Object.values(pctTable).flatMap((r) => Object.keys(r)));
const expDrawn = Object.fromEntries(
  Object.entries(expPct)
    .map(([s, row]) => [s, Object.fromEntries(Object.entries(row).filter(([a]) => drawnCols.has(a)))])
    .filter(([, r]) => Object.keys(r).length),
);
check('State → Assignee → % within state = oracle (drawn columns)', sameObj(pctTable, expDrawn), diff(pctTable, expDrawn));
const assignees = Object.keys(T.assigneePriority).length;
check('More than 12 series → limit explained, not silently dropped', assignees <= 12 || /series/i.test(await card(1).textContent()), `${assignees} assignees`);

// ---------------- 3. Assignee → State → Stacked bar (chart + exports) ----------------
await section.getByRole('button', { name: /Add chart/ }).click();
await sel(2, 'C. Secondary grouping / series', 'status');
await sel(2, 'A. Chart type', 'stacked');
await sel(2, 'Categories shown', 'all');
await page.waitForTimeout(600);
check('Stacked chart is drawn (SVG)', (await card(2).locator('div[role="img"] svg').count()) === 1);
const csv3 = csvRows((await download(() => card(2).getByRole('button', { name: 'Export chart data as CSV' }).click())).path);
const statusCols = Object.keys(csv3[0]).filter((k) => k !== 'Category' && k !== 'Total');
const fromCsv3 = Object.fromEntries(csv3.map((r) => [r.Category, Object.fromEntries(statusCols.filter((k) => num(r[k]) !== 0).map((k) => [k, num(r[k])]))]));
const exp3 = Object.fromEntries(Object.entries(T.assigneeStatus).map(([a, row]) => [a, Object.fromEntries(Object.entries(row).filter(([s]) => statusCols.includes(s)))]));
check('Assignee → State stacked CSV = oracle', sameObj(fromCsv3, exp3), diff(fromCsv3, exp3));
check('Stacked CSV totals = assignee totals', csv3.every((r) => num(r.Total) === total(T.assigneeStatus[r.Category])));

const xl = await download(() => card(2).getByRole('button', { name: 'Export chart data as Excel' }).click());
const wb = XLSX.readFile(xl.path);
check('Excel export sheets', ['Chart Data (as drawn)', 'Chart Configuration', 'Chart Records'].every((s) => wb.SheetNames.includes(s)), wb.SheetNames.join(', '));
const xlData = XLSX.utils.sheet_to_json(wb.Sheets['Chart Data (as drawn)'], { defval: null });
check('Excel chart data = CSV chart data', xlData.length === csv3.length && xlData.every((r, i) => statusCols.every((k) => Number(r[k] ?? 0) === num(csv3[i][k]))));
const records = XLSX.utils.sheet_to_json(wb.Sheets['Chart Records']);
check('Excel chart records = records in chart', records.length === T.total, `${records.length}`);
check('Excel chart records: mapped fields, no bulk source columns', !Object.keys(records[0]).some((k) => k.startsWith('Source: ')));
const conf = XLSX.utils.sheet_to_json(wb.Sheets['Chart Configuration'], { header: 1 }).map((r) => r.join(': ')).join('\n');
check('Excel configuration describes the chart', /Chart type: Stacked/.test(conf) && /Grouping: Assignee/.test(conf) && /Secondary grouping: (State|Status)/.test(conf), conf.split('\n').slice(0, 5).join(' | '));

const svgDl = await download(() => card(2).getByRole('button', { name: /as SVG$/ }).click());
const svg = readFileSync(svgDl.path, 'utf8');
check('SVG download includes the chart title', svg.includes('<svg') && svg.includes('Issue count by Assignee and'), svgDl.name);
const svgErr = await page.evaluate((s) => new DOMParser().parseFromString(s, 'image/svg+xml').getElementsByTagName('parsererror')[0]?.textContent ?? '', svg);
check('SVG download is well-formed XML (opens in any viewer)', svgErr === '', svgErr.slice(0, 120));
const svgImg = await page.evaluate(
  (s) =>
    new Promise((res) => {
      const i = new Image();
      i.onload = () => res(`${i.naturalWidth}x${i.naturalHeight}`);
      i.onerror = () => res('error');
      i.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
    }),
  svg,
);
check('SVG download renders as an image', svgImg !== 'error', svgImg);
const png = readFileSync((await download(() => card(2).getByRole('button', { name: /as PNG$/ }).click())).path);
check('PNG download: valid PNG at 2× resolution', png.subarray(1, 4).toString() === 'PNG' && png.readUInt32BE(16) >= 1200, `${png.readUInt32BE(16)}×${png.readUInt32BE(20)}`);

// ---------------- 4. Priority → % of total, a ready-made view, reorder/remove ----------------
await section.getByRole('button', { name: /Add chart/ }).click();
await sel(3, 'B. Analyze data by', 'priority');
await sel(3, 'D. Metric / value', 'percentTotal');
await sel(3, 'A. Chart type', 'bar');
const csv4 = csvRows((await download(() => card(3).getByRole('button', { name: 'Export chart data as CSV' }).click())).path);
const valKey = Object.keys(csv4[0]).find((k) => k !== 'Category');
// CSV holds a fraction (0.319) or a percent (31.9) depending on the column format; normalise to %.
const fromCsv4 = Object.fromEntries(csv4.map((r) => [r.Category, Math.round(num(r[valKey]) * (num(r[valKey]) <= 1 ? 1000 : 10)) / 10]));
check('Priority → % of total = oracle', sameObj(fromCsv4, T.pctTotalByPriority), diff(fromCsv4, T.pctTotalByPriority));

await section.getByLabel('Add a chart from a ready-made view').selectOption('s-open-closed');
const csv5 = csvRows((await download(() => card(4).getByRole('button', { name: 'Export chart data as CSV' }).click())).path);
const oc = Object.fromEntries(csv5.map((r) => [r.Category, num(Object.values(r)[1])]));
check('Preset "Open vs closed" = oracle', oc['Open / Pending'] === T.openClosed.open && oc.Closed === T.openClosed.closed && oc.Unmapped === T.openClosed.unmapped, JSON.stringify(oc));

await card(4).getByRole('button', { name: 'Move chart up' }).click();
check('Move up reorders cards', (await card(3).getByTestId('builder-title').textContent()).toLowerCase().includes('open'));
await card(3).getByRole('button', { name: 'Remove chart' }).click();
check('Remove leaves 4 charts', (await cardCount()) === 4);

// ---------------- 5. Layout of every drawn chart type at three widths ----------------
const addTyped = async (primary, secondary, type, metric) => {
  const i = await cardCount();
  await section.getByRole('button', { name: /Add chart/ }).click();
  await sel(i, 'B. Analyze data by', primary);
  if (secondary) await sel(i, 'C. Secondary grouping / series', secondary);
  if (metric) await sel(i, 'D. Metric / value', metric);
  await sel(i, 'A. Chart type', type);
};
await addTyped('priority', 'status', 'grouped');
await addTyped('status', 'priority', 'percent');
await addTyped('createdWeek', null, 'line');
await addTyped('status', null, 'donut');
await addTyped('assignee', 'metrics', 'grouped');
const drawn = await section.locator('div[role="img"] svg').count();
check('Seven drawn charts on the page', drawn === 7, `${drawn}`);
for (const w of [1440, 1024, 390]) {
  await page.setViewportSize({ width: w, height: 900 });
  await page.waitForTimeout(900);
  const charts = await measureChartText(page, '#builder');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  const bad = charts.filter((c) => c.collisions || c.clipped);
  check(`Builder charts @${w}px: no text collisions, no clipping, no page overflow`, bad.length === 0 && overflow <= 0, bad.map((c) => `${c.panel}: ${c.examples.join('; ')}`).join(' | ') || `${charts.length} charts, overflow ${overflow}px`);
}
await page.setViewportSize({ width: 1440, height: 900 });

// ---------------- 6. Clear Data, storage, heap, network, disk ----------------
const cdp = await context.newCDPSession(page);
const NEEDLES = ['V3-MARKER-', 'Ana Silva', 'Dev 07', 'Awaiting Vendor', 'Sev-X', 'oracle-issues.csv'];
check('Heap positive control before Clear Data (builder charts present)', (await reachableDataNodes(cdp, NEEDLES)) > 0);
await page.getByRole('button', { name: /Clear Data/ }).click();
await page.getByRole('dialog').getByRole('button', { name: 'Clear Data' }).click();
await page.getByTestId('privacy-statement').waitFor();
await page.waitForTimeout(6000);
const live = await reachableDataNodes(cdp, NEEDLES);
check('Clear Data: no reachable uploaded data or chart data in heap', live === 0, `${live}`);
const storage = await browserStorage(page);
check('Browser storage unused', eq(storage, EMPTY_STORAGE), JSON.stringify(storage));
check('No cookies in context', (await context.cookies()).length === 0);
await uploadAndGenerate(page, DATA, (p) => p.selectOption('#date-order-select', 'DMY'));
check('Clear Data removed chart configurations', await page.locator('#builder').getByText('No custom charts yet').isVisible());
check('No console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await context.close();

const { text, reqs } = netlogRequests(NETLOG);
const fromApp = reqs.filter((r) => r.initiator.startsWith(APP_ORIGIN));
check('NetLog: every app-initiated request goes to the app server', fromApp.every((r) => r.url.startsWith(APP_ORIGIN + '/')), `${fromApp.length} app-initiated`);
check('NetLog: app-server traffic is GET only', reqs.filter((r) => r.url.startsWith(APP_ORIGIN + '/')).every((r) => r.method === 'GET'));
check('NetLog: uploaded data never in any traffic (full byte capture)', !text.includes('V3-MARKER') && !text.includes('Ana Silva'));
const hits = filesContaining(PROFILE, 'V3-MARKER');
check('Browser profile on disk holds no uploaded data', hits.length === 0, hits.slice(0, 3).join(', '));
await finish();
