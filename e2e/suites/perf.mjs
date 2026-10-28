// Performance measurement (manual: `npm run e2e:perf`): 100,000 records × 50 columns.
// Times from each UI action until its result is on screen. Prints a table; there are no pass/fail
// thresholds because timings depend on the machine.
import { existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { WORK, launch, uploadAndGenerate } from '../lib.mjs';

const ROWS = Number(process.env.PERF_ROWS ?? 100000);
const DIR = join(WORK, 'perf');
const FILE = join(DIR, `issues-${ROWS}.csv`);
if (!existsSync(FILE)) {
  mkdirSync(DIR, { recursive: true });
  console.log(`Generating ${ROWS} rows × 50 columns…`);
  execFileSync(process.execPath, ['scripts/generate-sample-data.mjs', '--rows', String(ROWS), '--columns', '50', '--out', DIR], { stdio: 'inherit' });
}

const rows = [];
const browser = await launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  let t0 = Date.now();
  await uploadAndGenerate(page, FILE);
  rows.push([`Upload → dashboard (${ROWS.toLocaleString('en-US')} rows, 50 columns)`, Date.now() - t0]);

  const section = page.locator('#builder');
  const card = (i) => section.getByTestId(`builder-card-${i}`);
  // Each step: perform the change, wait until the result is shown, then for two painted frames.
  const step = async (name, act, ready) => {
    const s = Date.now();
    await act();
    await ready();
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    rows.push([name, Date.now() - s]);
  };
  const sel = (i, label, v) => card(i).getByLabel(label, { exact: true }).selectOption(v);
  const svgDrawn = (i) => () => card(i).locator('div[role="img"] svg').first().waitFor({ timeout: 60000 });
  const timedDownload = async (name, trigger) => {
    const s = Date.now();
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 600000 }), trigger()]);
    await dl.path();
    rows.push([name, Date.now() - s]);
  };

  await step('Builder: add chart (count by Assignee)', () => section.getByRole('button', { name: /Add chart/ }).click(), svgDrawn(0));
  await step('Builder: secondary grouping → Priority (stacked)', async () => {
    await sel(0, 'C. Secondary grouping / series', 'priority');
    await sel(0, 'A. Chart type', 'stacked');
  }, svgDrawn(0));
  await step('Builder: chart type → Heatmap', () => sel(0, 'A. Chart type', 'heatmap'), () => card(0).getByTestId('builder-heatmap').waitFor({ timeout: 60000 }));
  await step('Builder: categories shown → All', () => sel(0, 'Categories shown', 'all'), () => card(0).getByTestId('builder-heatmap').waitFor());
  await step('Builder: metric → Open issue count', () => sel(0, 'D. Metric / value', 'open'), () => card(0).getByTestId('builder-title').filter({ hasText: /Open/ }).waitFor({ timeout: 60000 }));
  await step('Builder: metric → Average age (days)', () => sel(0, 'D. Metric / value', 'avgAge'), () => card(0).getByTestId('builder-title').filter({ hasText: /age/i }).waitFor({ timeout: 60000 }));
  await step('Builder: add 2nd chart, State → Assignee → % within state (table)', async () => {
    await section.getByRole('button', { name: /Add chart/ }).click();
    await sel(1, 'B. Analyze data by', 'status');
    await sel(1, 'C. Secondary grouping / series', 'assignee');
    await sel(1, 'D. Metric / value', 'percentGroup');
    await sel(1, 'A. Chart type', 'table');
  }, () => card(1).getByTestId('builder-table').waitFor({ timeout: 60000 }));
  await step('Builder: add 3rd chart, Created month line', async () => {
    await section.getByRole('button', { name: /Add chart/ }).click();
    await sel(2, 'B. Analyze data by', 'createdMonth');
    await sel(2, 'A. Chart type', 'line');
  }, svgDrawn(2));
  await timedDownload('Chart Excel export (heatmap, all Chart Records)', () => card(0).getByRole('button', { name: 'Export chart data as Excel' }).click({ timeout: 600000 }));
  await step('Dashboard filter click with 3 builder charts', () => page.getByTestId('kpi-closed').click(), () => page.getByTestId('scope-summary').waitFor());
  await page.getByRole('button', { name: /Export Report/ }).first().click();
  await timedDownload('Dashboard Excel export (Closed filter active)', () => page.getByRole('menuitem', { name: /Excel workbook/ }).click({ timeout: 600000 }));
  rows.push(['JS heap after all steps (MB)', await page.evaluate(() => (performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1))]);
  if (errors.length) console.log('page errors:', errors.slice(0, 3));
} finally {
  await browser.close();
  for (const [n, v] of rows) console.log(`${String(v).padStart(8)}  ${n}${/MB/.test(n) ? '' : ' (ms)'}`);
}
