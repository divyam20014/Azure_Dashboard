// Edge cases: empty scope, no Created Date column, no high-priority group, all-closed data,
// no Status column, keyboard access.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { WORK, launch, reporter, uploadAndGenerate } from '../lib.mjs';

const OUT = join(WORK, 'edges');
mkdirSync(OUT, { recursive: true });
const { check, finish } = reporter('edges');
const browser = await launch();
const errors = [];
async function open(csvText, name, prep) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`${name}: ${m.text()}`));
  const path = join(OUT, name);
  writeFileSync(path, csvText);
  await uploadAndGenerate(page, path, prep);
  for (let i = 0; i < 30; i++) {
    await page.mouse.wheel(0, 900);
    await page.waitForTimeout(25);
  }
  return page;
}
const kpi = (page, id) => page.getByTestId(`kpi-${id}-count`).textContent();

// 1. Empty scope via a created-date range that matches nothing.
{
  const page = await open(['ID,Title,State,Assigned To,Priority,Created Date', '1,a,New,X,P1,2024-01-02', '2,b,Closed,Y,P2,2024-01-03'].join('\n'), 'e1.csv');
  await page.fill('#created-from', '2030-01-01');
  await page.waitForTimeout(300);
  check('Empty scope: total 0', (await kpi(page, 'total')).trim() === '0');
  check('Empty scope: closure rate shows N/A (no division by zero)', (await kpi(page, 'closureRate')).trim() === 'N/A');
  check('Empty scope: risk panel explains the empty state', (await page.locator('#risks').textContent()).includes('No issues in the current scope'));
  await page.getByRole('button', { name: /Preview report/ }).click();
  await page.getByTestId('print-report').waitFor();
  check('Empty scope: report preview renders', (await page.getByTestId('print-report').textContent()).includes('0 records in scope'));
  await page.getByRole('dialog', { name: 'Printable report' }).getByRole('button', { name: /Close/ }).click();
  await page.close();
}
// 2. No Created Date column, no recognizable priority convention, all closed.
{
  const page = await open(['ID,Title,State,Assigned To,Priority', '1,a,Closed,X,Gold', '2,b,Closed,Y,Silver', '3,c,Closed,X,Gold'].join('\n'), 'e2.csv');
  check('All closed: closure rate 100%', (await kpi(page, 'closureRate')).trim() === '100.0%');
  check('All closed: open backlog 0', (await kpi(page, 'openBacklog')).trim() === '0');
  check('No high-priority group: KPI "Not configured" (not 0)', (await kpi(page, 'highPriority')).trim() === 'Not configured');
  check('No Created Date: aging marked unavailable', (await page.getByTestId('risk-aging-count').textContent()).trim() === 'N/A' && (await page.getByTestId('risk-aging').textContent()).includes('No Created Date column is mapped'));
  check('No Created Date: Created filter not offered', (await page.locator('#created-from').count()) === 0);
  check('Aging report section disabled with reason', await page.getByLabel('Include Aging analysis').isDisabled());
  check('Custom priorities flagged unconfirmed in data quality', (await page.locator('#quality').textContent()).includes('Unrecognized priority values: Gold, Silver'));
  await page.close();
}
// 3. Status not mapped at all.
{
  const page = await open(['ID,Title,Assigned To', '1,a,X', '2,b,Y'].join('\n'), 'e3.csv');
  check('No Status column: status KPIs show "—", not 0', (await kpi(page, 'closed')).trim() === '—' && (await kpi(page, 'openBacklog')).trim() === '—');
  check('No Status column: status report sections disabled', await page.getByLabel('Include Status distribution').isDisabled());
  await page.close();
}
// 4. Keyboard: KPI cards and heatmap cells are focusable buttons operable with Enter.
{
  const page = await open(['ID,Title,State,Assigned To,Priority', '1,a,New,X,P1', '2,b,Closed,Y,P2', '3,c,New,X,P1'].join('\n'), 'e4.csv');
  await page.getByTestId('kpi-openBacklog').focus();
  await page.keyboard.press('Enter');
  check('Keyboard: Enter on a KPI card filters the register', (await page.getByTestId('register-count').textContent()).startsWith('2 record'));
  await page.getByLabel('X, P1: 2 issues').focus();
  await page.keyboard.press('Enter');
  check('Keyboard: Enter on a heatmap cell filters the register', (await page.getByTestId('selection-chip').textContent()).includes('X · P1'));
  const focusVisible = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle !== 'none' || getComputedStyle(document.activeElement).boxShadow !== 'none');
  check('Keyboard: focused control has a visible focus indicator', focusVisible);
  await page.close();
}
check('No runtime or console errors in edge cases', errors.length === 0, errors.slice(0, 3).join(' | '));
await finish();
