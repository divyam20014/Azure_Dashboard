// Management suite: executive KPIs, assignee analytics, risks and aging, data-quality score,
// duplicate handling, CSV fidelity, report templates (Excel, print, PDF), filters and privacy,
// all checked in the production build against the independent oracle (e2e/oracle.py).
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { APP, APP_ORIGIN, WORK, XLSX, Papa, launchPersistent, reporter, num, eq, sortObj, scrollAll, reachableDataNodes, browserStorage, EMPTY_STORAGE, netlogRequests, filesContaining } from '../lib.mjs';

const OUT = join(WORK, 'management');
const PROFILE = join(OUT, 'profile');
const NETLOG = join(OUT, 'netlog.json');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const T = JSON.parse(readFileSync(join(WORK, 'truth-management.json'), 'utf8'));
const A = T.all;
const { check, finish } = reporter('management');

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
  return p;
};
const sheet = (wb, name) => XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: null });

// ---------------- Setup through the UI ----------------
await page.goto(APP);
await page.setInputFiles('[data-testid="file-input"]', join(WORK, 'oracle-issues.csv'));
await page.getByRole('heading', { name: /Confirm data mapping/ }).waitFor();
await page.selectOption('#date-order-select', 'DMY');
await page.getByRole('button', { name: /Column mapping/ }).click();
check('Mapping: Priority column detected (not Severity)', (await page.inputValue('#map-priority')) === '5', await page.inputValue('#map-priority'));
check('Mapping: Severity kept separate', (await page.inputValue('#map-severity')) === '6');
check('Mapping: Created Date detected', (await page.inputValue('#map-created')) === '8');
await page.getByRole('button', { name: /Value mapping/ }).click();
const cat = (s) => page.getByLabel(`Workflow category for ${s}`);
check('Status rules: Resolved not auto-classified and no suggestion', (await cat('Resolved').inputValue()) === 'unmapped' && !(await cat('Resolved').locator('xpath=..').textContent()).includes('suggested'));
check('Status rules: Removed not auto-classified', (await cat('Removed').inputValue()) === 'unmapped');
check('Status rules: Active suggested Open but not applied', (await cat('Active').inputValue()) === 'unmapped');
check('Status rules: core statuses classified', (await cat('Ready For QA').inputValue()) === 'open' && (await cat('Closed').inputValue()) === 'closed');
await page.getByRole('button', { name: /Apply \d+ suggested categor/ }).click();
check('Apply suggestions: Active → Open, Blocked → Open', (await cat('Active').inputValue()) === 'open' && (await cat('Blocked').inputValue()) === 'open');
check('Apply suggestions leaves Removed / Awaiting Vendor unmapped', (await cat('Removed').inputValue()) === 'unmapped' && (await cat('Awaiting Vendor').inputValue()) === 'unmapped');
await cat('Resolved').selectOption('closed');
check('Priority rules: TBD defaults to Unknown', await page.getByLabel('Priority TBD means unknown').isChecked());
check('Priority rules: custom Sev-X unconfirmed', !(await page.getByLabel('Confirm priority Sev-X').isChecked()));
check('High-priority group defaults to Critical + High', (await page.getByLabel('Include Critical in high-priority group').isChecked()) && (await page.getByLabel('Include High in high-priority group').isChecked()) && !(await page.getByLabel('Include Medium in high-priority group').isChecked()));
check('Unknown cannot join the high-priority group', await page.getByLabel('Include Unknown in high-priority group').isDisabled());
await page.getByRole('button', { name: /Generate dashboard/ }).click();
await page.getByTestId('kpi-total').waitFor();
await scrollAll(page, 45);

// ---------------- Executive KPIs ----------------
const kpiCheck = async (label, id, expected) => check(`KPI ${label}`, num(await kpi(id)) === expected, `${await kpi(id)} vs ${expected}`);
await kpiCheck('total', 'total', A.total);
await kpiCheck('closed (Closed + Resolved)', 'closed', A.closed);
check('KPI closure rate', (await kpi('closureRate')) === `${A.closureRate.toFixed(1)}%`, `${await kpi('closureRate')} vs ${A.closureRate}%`);
await kpiCheck('open backlog', 'openBacklog', A.open);
await kpiCheck('Critical + High open', 'highPriority', A.hpOpenTotal);
check('KPI Critical/High split', (await page.getByTestId('kpi-highPriority').textContent()).includes(`Critical: ${A.hpOpen.Critical} · High: ${A.hpOpen.High}`));
check('KPI high-priority card titled by configured group', (await page.getByTestId('kpi-highPriority').textContent()).startsWith('Critical + High Open Backlog'));
await kpiCheck('reopened', 'reopened', A.reopened);
await kpiCheck('ready for QA', 'readyForQa', A.readyForQa);
await kpiCheck('unassigned', 'unassigned', A.unassigned);
await kpiCheck('blocked', 'blocked', A.blocked);
await kpiCheck('unmapped statuses', 'unmapped', A.unmapped);
check('KPI closed statuses listed', (await page.getByTestId('kpi-closed').textContent()).includes('Closed statuses: Closed, Resolved'));
await page.getByTestId('kpi-closed').click();
check('KPI click → register = closed records', (await reg()) === A.closed);
await page.getByTestId('kpi-closed').click();
check('KPI click again removes the filter', (await reg()) === A.total);

// ---------------- Assignee summary + heatmap ----------------
await page.getByRole('radio', { name: 'All' }).click();
const table = await page.evaluate(() => {
  const t = document.querySelector('[data-testid="assignee-summary-table"]');
  const heads = [...t.querySelectorAll('thead th')].map((h) => h.textContent.trim());
  return [...t.querySelectorAll('tbody tr')].map((tr) => [tr.querySelector('th').textContent.trim(), ...[...tr.querySelectorAll('td')].map((td) => td.textContent.trim())]).map((r) => Object.fromEntries(heads.map((h, i) => [h, r[i]])));
});
const fromTable = Object.fromEntries(
  table.map((r) => [
    r.Assignee.replace(/>\s*\d+% of open$/, '>').replace(/^Unassigned \(no owner\)$/, 'Unassigned'),
    { total: num(r.Total), closed: num(r.Closed), open: num(r.Open), Critical: num(r.Critical), High: num(r.High), reopened: num(r.Reopened), readyForQa: num(r['Ready for QA']) },
  ]),
);
check('Assignee summary table = oracle for every assignee (incl. merged case variants)', eq(sortObj(fromTable), sortObj(A.assignees)), Object.keys(fromTable).length + ' rows');
check('Assignee summary: Critical + High combined column', table.every((r) => num(r['Critical + High']) === num(r.Critical) + num(r.High)));

const readMatrix = () =>
  page.evaluate(() => {
    const t = document.querySelector('[data-testid="assignee-priority-matrix"]');
    const cols = [...t.querySelectorAll('thead th')].map((th) => th.textContent.trim()).slice(1, -1);
    const rows = {};
    for (const tr of t.querySelectorAll('tbody tr')) {
      const name = tr.querySelector('th').textContent.trim();
      rows[name] = {};
      [...tr.querySelectorAll('td')].slice(0, cols.length).forEach((td, i) => {
        const v = td.textContent.trim();
        if (v !== '·') rows[name][cols[i]] = Number(v.replace(/,/g, ''));
      });
    }
    return rows;
  });
check('Heatmap (total) = oracle', eq(sortObj(await readMatrix()), sortObj(A.matrixAll)));
await page.selectOption('[aria-label="Heatmap counts"]', 'open');
await page.waitForTimeout(200);
check('Heatmap (open only) = oracle', eq(sortObj(await readMatrix()), sortObj(A.matrixOpen)));
await page.selectOption('[aria-label="Heatmap counts"]', 'all');
await page.getByRole('radio', { name: 'Top 5' }).click();
check('Top 5 limits the display, not the data', (await page.getByTestId('assignee-display-count').textContent()).includes('Showing 5 of') && (await reg()) === A.total);
const top5 = await page.$$eval('[data-testid="assignee-summary-table"] tbody tr th', (ths) => ths.map((t) => t.textContent.trim()));
const expectedTop5 = Object.entries(A.assignees).filter(([n]) => n !== 'Unassigned').sort((a, b) => b[1].total - a[1].total || a[0].localeCompare(b[0])).slice(0, 5).map(([n]) => n);
check('Top 5 ranking = oracle', eq(top5.slice(0, 5), expectedTop5), top5.join(' | '));

// ---------------- Risks and aging ----------------
const risk = async (id) => (await page.getByTestId(`risk-${id}-count`).textContent()).trim();
check('Risk high-priority backlog', num(await risk('high-priority')) === A.hpOpenTotal);
check('Risk reopened', num(await risk('reopened')) === A.reopened);
check('Risk unassigned', num(await risk('unassigned')) === A.unassigned);
check('Risk QA queue', num(await risk('qa-queue')) === A.readyForQa);
check('Risk unmapped/incomplete', num(await risk('incomplete')) === A.incomplete, `${await risk('incomplete')} vs ${A.incomplete}`);
check('Risk aging (> 30 days bucket)', num(await risk('aging')) === A.aging.buckets['More than 30 days']);
const chips = await page.$$eval('[data-testid="risk-aging"] button.rounded-full', (bs) => bs.map((b) => b.textContent.trim()));
const expectedChips = Object.entries(A.aging.buckets).map(([k, v]) => `${k}: ${v}`);
check('Aging buckets = oracle (boundaries 7/8, 14/15, 30/31)', eq(chips, expectedChips), chips.join(' | '));
const agingText = await page.getByTestId('risk-aging').textContent();
check('Aging limitations report missing / invalid / future Created Dates', agingText.includes(`${A.aging.missing} open record(s) have no Created Date`) && agingText.includes(`${A.aging.invalid} open record(s) have an unreadable`) && agingText.includes(`${A.aging.future} open record(s) have a Created Date in the future`));
await page.getByTestId('risk-aging').getByRole('button', { name: /^0–7 days/ }).click();
check('Aging bucket drill-down lists exactly that bucket', (await reg()) === A.aging.buckets['0–7 days']);
await page.getByRole('button', { name: 'Clear register selection' }).click();
// Changing thresholds recomputes buckets.
await page.fill('#aging-thresholds', '10, 60');
await page.getByRole('button', { name: 'Apply', exact: true }).first().click();
await page.waitForTimeout(300);
const chips2 = await page.$$eval('[data-testid="risk-aging"] button.rounded-full', (bs) => bs.map((b) => b.textContent.trim().split(':')[0]));
check('Custom aging thresholds rebuild the buckets', eq(chips2, ['0–10 days', '11–60 days', 'More than 60 days']), chips2.join(' | '));
await page.fill('#aging-thresholds', '7, 14, 30');
await page.getByRole('button', { name: 'Apply', exact: true }).first().click();

// ---------------- Data quality score ----------------
check('Data-quality score = oracle', (await page.getByTestId('quality-score').textContent()).trim() === T.quality.overall.toFixed(1), `${await page.getByTestId('quality-score').textContent()} vs ${T.quality.overall.toFixed(2)}`);
const dq = await page.$$eval('[data-testid="quality-score-table"] tbody tr', (trs) => trs.map((tr) => [tr.children[0].querySelector('span').textContent.trim(), tr.children[2].textContent.trim()]));
const labels = { idCompleteness: 'Issue ID completeness', statusCompleteness: 'Status completeness', statusMapping: 'Status mapping coverage', priorityCompleteness: 'Priority completeness', priorityMapping: 'Priority mapping coverage', assigneeCompleteness: 'Assignee completeness', dateValidity: 'Date validity', duplicateIds: 'Unique issue IDs' };
const dqOk = Object.entries(T.quality.dims).every(([k, v]) => dq.find(([l]) => l === labels[k])?.[1] === `${v.toFixed(1)}%`);
check('Data-quality rule scores = oracle', dqOk, dq.map((d) => d.join(' ')).join('; '));

// ---------------- Duplicate handling ----------------
const dupPanel = await page.locator('#quality').textContent();
check('Duplicate panel counts (blank IDs, occurrences, distinct)', dupPanel.includes(`Records with a blank ID${T.duplicates.blankIds}`) && dupPanel.includes(`Duplicate ID occurrences${T.duplicates.records}`) && dupPanel.includes(`Distinct IDs affected${T.duplicates.distinct}`));
await page.selectOption('#counting-rule', 'unique');
await page.waitForTimeout(400);
const U = T.unique;
check('Unique rule: total and excluded', num(await kpi('total')) === U.total && (await page.getByTestId('scope-summary').textContent()).includes(`${T.duplicates.extra} excluded`));
check('Unique rule: blank IDs are kept', U.total === A.total - T.duplicates.extra);
check('Unique rule: KPIs recomputed', num(await kpi('closed')) === U.closed && num(await kpi('openBacklog')) === U.open && num(await kpi('highPriority')) === U.hpOpenTotal);
await page.selectOption('#counting-rule', 'review');
await page.waitForTimeout(300);
check('Review rule: nothing excluded until chosen', num(await kpi('total')) === A.total);
await page.locator('[data-testid="duplicate-table"] input[type=checkbox]').nth(1).check();
await page.waitForTimeout(300);
check('Review rule: excluding one record removes exactly one', num(await kpi('total')) === A.total - 1);
await page.getByRole('button', { name: 'Exclude all subsequent occurrences' }).click();
await page.waitForTimeout(300);
check('Review rule: "exclude all subsequent" = unique rule', num(await kpi('total')) === U.total);
await page.selectOption('#counting-rule', 'all');
await page.waitForTimeout(300);

// ---------------- CSV export fidelity ----------------
await page.getByRole('button', { name: /Export Report/ }).click();
const allCsv = Papa.parse(readFileSync(await download(() => page.getByRole('menuitem', { name: /All issues/ }).click()), 'utf8').replace(/^\ufeff/, ''), { header: true, skipEmptyLines: true }).data;
const titlesOk = allCsv.every((r, i) => r.Title === T.titles[i] || r.Title === `'${T.titles[i]}`);
check('CSV All issues: every title round-trips (quotes, commas)', allCsv.length === A.total && titlesOk);
check('CSV formula injection neutralised (= and + prefixes)', allCsv[4].Title.startsWith("'=") && allCsv[5].Title.startsWith("'+"));

// ---------------- Report templates, Excel, print/PDF ----------------
const TEMPLATES = {
  daily: { radio: /Daily QA Status Report/, sections: ['summary', 'status', 'priority', 'risks', 'quality'], sheets: ['Executive Summary', 'KPI Details', 'Status Summary', 'Priority Summary', 'Risk and Attention Items', 'Risk Records', 'Data Quality Score', 'Data Quality Summary', 'Data Quality Report'] },
  weekly: { radio: /Weekly Management Report/, sections: ['summary', 'status', 'priority', 'assignee', 'risks', 'quality'], sheets: ['Executive Summary', 'KPI Details', 'Status Summary', 'Priority Summary', 'Assignee Summary', 'Assignee-Priority Matrix', 'Assignee-Priority (Open)', 'Assignee-Status Summary', 'Risk and Attention Items', 'Risk Records', 'Data Quality Score', 'Data Quality Summary', 'Data Quality Report'] },
  release: { radio: /Release Readiness Report/, sections: ['summary', 'readiness', 'priority', 'risks', 'aging', 'quality'], sheets: ['Executive Summary', 'KPI Details', 'Release Readiness', 'Priority Summary', 'Risk and Attention Items', 'Risk Records', 'Aging (Age Since Creation)', 'Data Quality Score', 'Data Quality Summary', 'Data Quality Report'] },
  workload: { radio: /Developer \/ Tester Workload Report/, sections: ['assignee', 'register'], sheets: ['Executive Summary', 'Assignee Summary', 'Assignee-Priority Matrix', 'Assignee-Priority (Open)', 'Assignee-Status Summary', 'Detailed Issue Register'] },
};
const workbooks = {};
for (const [id, tpl] of Object.entries(TEMPLATES)) {
  await page.getByRole('radio', { name: tpl.radio }).click();
  if (id === 'release') await page.getByLabel('Max open high-priority issues').fill('10');
  if (id === 'workload') {
    await page.getByRole('button', { name: 'Report assignees' }).click();
    for (const n of ['Dev 01', 'Dev 02']) await page.getByRole('group', { name: 'Report assignees options' }).locator('label', { hasText: new RegExp(`^${n}\\s*\\d`) }).locator('input').check();
    await page.keyboard.press('Escape');
  }
  check(`${id}: header shows current template`, (await page.getByTestId('header-context').textContent()).includes(tpl.radio.source.replace(/\\\//g, '/')));
  const xlsx = await download(() => page.getByRole('button', { name: /Download Excel report/ }).click());
  const wb = XLSX.read(readFileSync(xlsx), { type: 'buffer' });
  workbooks[id] = wb;
  check(`${id}: Excel worksheets`, eq(wb.SheetNames, tpl.sheets), wb.SheetNames.join(', '));
  const zip = XLSX.CFB.read(readFileSync(xlsx), { type: 'buffer' });
  const frozen = zip.FullPaths.filter((p) => /worksheets\/sheet\d+\.xml$/.test(p)).every((p) => Buffer.from(zip.FileIndex[zip.FullPaths.indexOf(p)].content).toString().includes('state="frozen"'));
  check(`${id}: every worksheet has a frozen header row`, frozen);
  await page.getByRole('button', { name: /Preview report/ }).click();
  await page.getByTestId('print-report').waitFor();
  const sections = await page.$$eval('[data-report-section]', (els) => els.map((e) => e.getAttribute('data-report-section')));
  check(`${id}: preview sections`, eq(sections, tpl.sections), sections.join(','));
  await page.emulateMedia({ media: 'print' });
  await page.waitForTimeout(500);
  const clipped = await page.evaluate(() => {
    const art = document.querySelector('[data-testid="print-report"]').getBoundingClientRect();
    return [...document.querySelectorAll('[data-testid="print-report"] *')].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.right > art.right + 1;
    }).length;
  });
  check(`${id}: print layout — nothing wider than the page`, clipped === 0, `${clipped} element(s)`);
  const pdf = await page.pdf({ path: join(OUT, `${id}.pdf`), format: 'A4', printBackground: true });
  const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  check(`${id}: PDF produced (${pages} A4 page(s))`, pdf.length > 5000 && pages >= 1);
  if (id === 'release') check('release: unmet criterion stated, no approval claimed', (await page.getByTestId('readiness-statement').textContent()).includes(`Open high-priority issues (Critical, High): ${A.hpOpenTotal} > 10`) && (await page.getByTestId('readiness-statement').textContent()).includes('not a formal release approval'));
  if (id === 'workload') {
    const expected = A.assignees['Dev 01'].total + A.assignees['Dev 02'].total;
    check('workload: register limited to the selected assignees', (await page.locator('[data-report-section="register"] h2').textContent()).includes(`(${expected})`), `expected ${expected}`);
  }
  await page.screenshot({ path: join(OUT, `${id}-print.png`), fullPage: true });
  await page.emulateMedia({ media: 'screen' });
  await page.getByRole('dialog', { name: 'Printable report' }).getByRole('button', { name: /Close/ }).click();
}
// Excel values vs oracle.
const d = workbooks.daily;
check('Excel Status Summary = oracle', eq(sortObj(Object.fromEntries(sheet(d, 'Status Summary').map((r) => [r.Status, r.Issues]))), sortObj(A.status)));
check('Excel Priority Summary: issues and open = oracle', eq(sortObj(Object.fromEntries(sheet(d, 'Priority Summary').map((r) => [r.Priority, r.Issues]))), sortObj(A.priority)) && sheet(d, 'Priority Summary').every((r) => r.Open === A.priorityOpen[r.Priority]));
const kd = Object.fromEntries(sheet(d, 'KPI Details').map((r) => [r.KPI, r.Value]));
check('Excel KPI Details = oracle', kd['Closed issues'] === A.closed && kd['Open backlog'] === A.open && kd['Critical open'] === A.hpOpen.Critical && kd['High open'] === A.hpOpen.High && kd['Ready for QA'] === A.readyForQa && kd['Unassigned'] === A.unassigned);
const rr = sheet(d, 'Risk Records');
const riskItems = Object.fromEntries(sheet(d, 'Risk and Attention Items').map((r) => [r.Indicator, r['Affected Issues']]));
check('Excel Risk Records rows match each indicator count', Object.entries(riskItems).every(([k, v]) => v === null || rr.filter((r) => r.Indicator === k).length === v), JSON.stringify(riskItems));
const w = workbooks.weekly;
const wa = Object.fromEntries(sheet(w, 'Assignee Summary').map((r) => [r.Assignee, { total: r['Total Issues'], closed: r.Closed, open: r.Open, Critical: r['Critical Issues'], High: r['High Issues'], reopened: r.Reopened, readyForQa: r['Ready for QA'] }]));
check('Excel Assignee Summary = oracle', eq(sortObj(wa), sortObj(A.assignees)));
const openSheet = sheet(w, 'Assignee-Priority (Open)').filter((r) => r.Assignee !== 'Total');
const openFromXlsx = Object.fromEntries(openSheet.map((r) => [r.Assignee, Object.fromEntries(Object.entries(r).filter(([k, v]) => k !== 'Assignee' && k !== 'Total' && v))]));
check('Excel open-only matrix = oracle', eq(sortObj(openFromXlsx), sortObj(A.matrixOpen)));
const ag = Object.fromEntries(sheet(workbooks.release, 'Aging (Age Since Creation)').map((r) => [Object.values(r)[0], r['Open Issues']]));
check('Excel aging = oracle', Object.entries(A.aging.buckets).every(([k, v]) => ag[k] === v) && ag['Open, no Created Date'] === A.aging.missing && ag['Open, unreadable Created Date'] === A.aging.invalid && ag['Open, Created Date in the future'] === A.aging.future);
const dqx = sheet(d, 'Data Quality Score')[0];
check('Excel data-quality score = oracle', Math.abs(dqx.Score * 100 - T.quality.overall) < 1e-6, `${dqx.Score}`);
const reg2 = sheet(workbooks.workload, 'Detailed Issue Register');
check('Excel workload register: only selected assignees', reg2.length === A.assignees['Dev 01'].total + A.assignees['Dev 02'].total && reg2.every((r) => ['Dev 01', 'Dev 02'].includes(r.Assignee)));

// ---------------- Filters consistency ----------------
await page.getByRole('button', { name: 'Filter by Priority' }).click();
await page.getByRole('group', { name: 'Priority options' }).locator('label', { hasText: /^Critical\s*\d/ }).locator('input').check();
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
check('Global filter Critical: total / open backlog', num(await kpi('total')) === A.priority.Critical && num(await kpi('openBacklog')) === A.priorityOpen.Critical, `${await kpi('total')}/${await kpi('openBacklog')}`);
check('Global filter Critical: scope line', (await page.getByTestId('scope-summary').textContent()).includes(`Showing ${A.priority.Critical} of ${A.total}`));
await page.getByRole('button', { name: 'Clear all filters' }).click();
await page.waitForTimeout(300);
check('Clear all filters restores scope', num(await kpi('total')) === A.total);

// ---------------- Clear Data, storage, heap ----------------
const cdp = await context.newCDPSession(page);
const NEEDLES = ['V3-MARKER-', 'Ana Silva', 'Dev 07', 'Awaiting Vendor', 'Sev-X', 'oracle-issues.csv'];
const liveDataNodes = () => reachableDataNodes(cdp, NEEDLES);
check('Heap positive control before Clear Data', (await liveDataNodes()) > 0);
await page.getByRole('button', { name: /Clear Data/ }).click();
check('Clear Data asks for confirmation', await page.getByRole('dialog').isVisible());
await page.getByRole('dialog').getByRole('button', { name: 'Clear Data' }).click();
await page.getByTestId('privacy-statement').waitFor();
await page.waitForTimeout(6000);
const live = await liveDataNodes();
check('Clear Data: no reachable uploaded data in heap', live === 0, `${live}`);
check('Clear Data: worker terminated', page.workers().length === 0);
const storage = await browserStorage(page);
check('Browser storage unused', eq(storage, EMPTY_STORAGE), JSON.stringify(storage));
check('No cookies in context', (await context.cookies()).length === 0);
check('No console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await context.close();

const { text, reqs } = netlogRequests(NETLOG);
const app = APP_ORIGIN;
const fromApp = reqs.filter((r) => r.initiator.startsWith(app));
check('NetLog: every app-initiated request goes to the app server', fromApp.every((r) => r.url.startsWith(app + '/')), `${fromApp.length} app-initiated`);
check('NetLog: app-server traffic is GET only', reqs.filter((r) => r.url.startsWith(app + '/')).every((r) => r.method === 'GET'));
check('NetLog: uploaded data never in any traffic (full byte capture)', !text.includes('V3-MARKER'));
writeFileSync(join(OUT, 'requests.json'), JSON.stringify(reqs, null, 1));
const hits = filesContaining(PROFILE, 'V3-MARKER');
check('Browser profile on disk holds no uploaded data', hits.length === 0, hits.slice(0, 3).join(', '));

await finish();
