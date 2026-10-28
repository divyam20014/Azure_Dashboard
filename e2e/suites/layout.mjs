// Chart layout suite: every dashboard chart, two datasets (one with very long names, 12 statuses
// and 9 priorities) × three widths. Fails on any text collision, clipped text, page overflow, or a
// sticky header taller than the section scroll margin. Deliberate "…" truncation is reported only.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { WORK, launch, reporter, uploadAndGenerate, scrollAll, measureChartText } from '../lib.mjs';

const OUT = join(WORK, 'layout');
mkdirSync(OUT, { recursive: true });
const { check, finish } = reporter('layout');

// Stress dataset: long assignee names, many long statuses and priorities.
const statuses = ['New', 'Closed', 'Reopened', 'Ready for QA', 'Development in Progress', 'Waiting for Customer Confirmation', 'Pending Third-Party Vendor Fix', 'Blocked by Infrastructure Upgrade', 'Deferred to Next Major Release', 'Under Security Review', 'Awaiting Product Owner Decision', 'Duplicate of Existing Defect'];
const prios = ['P1', 'P2', 'P3', 'P4', 'P5', 'Critical - Production Down', 'Major Functional Regression', 'Cosmetic', 'TBD'];
const lines = ['ID,Title,State,Assigned To,Priority'];
for (let i = 1; i <= 600; i++) {
  const a = `Maximilian Alexander Featherstonehaugh-Worthington ${String(i % 30).padStart(2, '0')}`;
  lines.push(`${i},Item ${i},${statuses[i % statuses.length]},${a},${prios[(i * 7) % prios.length]}`);
}
const STRESS = join(OUT, 'stress.csv');
writeFileSync(STRESS, lines.join('\n'));

const DATASETS = [
  { name: 'oracle-issues.csv', path: join(WORK, 'oracle-issues.csv'), prep: (p) => p.selectOption('#date-order-select', 'DMY') },
  { name: 'stress.csv', path: STRESS },
];
const browser = await launch();
const report = [];
for (const ds of DATASETS) {
  for (const width of [1440, 1024, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await uploadAndGenerate(page, ds.path, ds.prep);
    await scrollAll(page, 50);
    await page.waitForTimeout(900);
    const charts = await measureChartText(page);
    const header = await page.evaluate(() => ({
      height: Math.round(document.querySelector('header').getBoundingClientRect().height),
      scrollMargin: parseFloat(getComputedStyle(document.getElementById('risks')).scrollMarginTop),
    }));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    report.push({ dataset: ds.name, width, header, overflow, charts });
    const where = `${ds.name} @${width}px`;
    const bad = charts.filter((c) => c.collisions || c.clipped);
    check(`${where}: ${charts.length} charts, no text collisions or clipping`, charts.length > 0 && bad.length === 0, bad.map((c) => `${c.section}/${c.panel}: ${c.collisions} collision(s), ${c.clipped} clipped — ${c.examples.join('; ')}`).join(' | '));
    check(`${where}: section titles clear the sticky header`, header.scrollMargin >= header.height, `header ${header.height}px, scroll margin ${header.scrollMargin}px`);
    check(`${where}: no horizontal page overflow`, overflow <= 0, `${overflow}px`);
    const truncated = charts.reduce((n, c) => n + c.truncated, 0);
    if (truncated) console.log(`      (${truncated} label(s) deliberately shortened with "…"; full text in tooltips and exports)`);
    await page.close();
  }
}
writeFileSync(join(OUT, 'layout-report.json'), JSON.stringify(report, null, 1));
await finish();
