#!/usr/bin/env node
/**
 * Generates synthetic issue-tracker exports for demos and performance testing.
 * All names and titles are fictional and generated locally.
 *
 *   node scripts/generate-sample-data.mjs                      -> samples/sample-issues.csv (600 rows) + .xlsx
 *   node scripts/generate-sample-data.mjs --rows 100000 --columns 50 --out <dir>
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as XLSX from 'xlsx';

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const rows = Number(arg('rows', 600));
const extraColumns = Math.max(0, Number(arg('columns', 16)) - 16);
const outDir = arg('out', 'samples');

let seed = 42;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = (items, weights) => {
  if (!weights) return items[Math.floor(rand() * items.length)];
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rand() * total;
  for (let i = 0; i < items.length; i++) if ((r -= weights[i]) < 0) return items[i];
  return items[items.length - 1];
};

const first = ['Aarav', 'Bea', 'Chen', 'Dara', 'Elif', 'Femi', 'Gita', 'Hugo', 'Ines', 'Jonas', 'Kiri', 'Lena', 'Mateo', 'Nia', 'Omar', 'Priya', 'Quinn', 'Rosa', 'Sven', 'Tara', 'Uma', 'Vik', 'Wen', 'Yara'];
const last = ['Sample', 'Example', 'Placeholder', 'Demo', 'Testwell', 'Mockford'];
const people = first.map((f, i) => `${f} ${last[i % last.length]}`);
const states = ['New', 'Development in Progress', 'Ready for QA', 'Closed', 'Re-open', 'Active', 'Blocked', 'Resolved', 'On Hold'];
const stateWeights = [18, 16, 12, 34, 6, 5, 3, 4, 2];
const priorities = ['1', '2', '3', '4', ''];
const priorityWeights = [10, 30, 40, 18, 2];
const types = ['Bug', 'Bug', 'Bug', 'Task', 'User Story'];
const areas = ['Web\\Checkout', 'Web\\Login', 'Mobile\\Android', 'Mobile\\iOS', 'API\\Payments', 'API\\Search', 'Reporting'];
const verbs = ['fails', 'crashes', 'is slow', 'shows wrong total', 'times out', 'is misaligned', 'returns 500', 'ignores filter'];
const nouns = ['Login page', 'Checkout button', 'Invoice export', 'Search results', 'Profile form', 'Dashboard widget', 'Payment API', 'Settings screen'];

const header = ['ID', 'Work Item Type', 'Title', 'State', 'Assigned To', 'Priority', 'Severity', 'Area Path', 'Iteration Path', 'Created Date', 'Changed Date', 'Closed Date', 'Created By', 'Tags', 'Team Project', 'Environment'];
for (let c = 0; c < extraColumns; c++) header.push(`Custom Field ${c + 1}`);

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const data = [header];
for (let i = 0; i < rows; i++) {
  const state = pick(states, stateWeights);
  const created = new Date(2024, 0, 1 + Math.floor(rand() * 300));
  const changed = new Date(created.getTime() + Math.floor(rand() * 40) * 86400000);
  const row = [
    String(10000 + i),
    pick(types),
    `${pick(nouns)} ${pick(verbs)}`,
    state,
    rand() < 0.05 ? '' : pick(people),
    pick(priorities, priorityWeights),
    `${1 + Math.floor(rand() * 4)} - ${pick(['Critical', 'High', 'Medium', 'Low'])}`,
    pick(areas),
    `Release 3\\Sprint ${1 + Math.floor(rand() * 12)}`,
    iso(created),
    iso(changed),
    state === 'Closed' ? iso(changed) : '',
    pick(people),
    rand() < 0.3 ? 'regression' : '',
    'Contoso Demo',
    pick(['QA', 'Staging', 'UAT']),
  ];
  for (let c = 0; c < extraColumns; c++) row.push(`value ${Math.floor(rand() * 1000)}`);
  data.push(row);
}
// A few realistic data-quality problems.
if (rows > 20) {
  data[5][0] = data[4][0]; // duplicate ID
  data[8][0] = ''; // missing ID
  data[12][9] = '31/31/2024'; // invalid date
  data.splice(15, 0, header.map(() => '')); // blank row
}

mkdirSync(outDir, { recursive: true });
const stem = rows === 600 ? 'sample-issues' : `issues-${rows}`;
const csv = data.map((r) => r.map((v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(',')).join('\r\n');
writeFileSync(join(outDir, `${stem}.csv`), csv);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Synthetic issue export'], ['All data is fictional']]), 'About');
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), 'Work Items');
writeFileSync(join(outDir, `${stem}.xlsx`), XLSX.write(wb, { bookType: 'xlsx', type: 'buffer', compression: true }));
console.log(`Wrote ${rows} rows x ${header.length} columns to ${outDir}/${stem}.csv and .xlsx`);
