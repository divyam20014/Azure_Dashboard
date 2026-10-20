import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { buildDataset, initialSetup, comparisonSetup } from '@/lib/normalization/datasetBuilder';
import { computeAggregates } from '@/lib/analytics/aggregate';
import { calculateExecutiveMetrics, type DatasetScopes } from '@/lib/analytics/executiveMetrics';
import { calculateAssigneeMetrics, assigneePriorityMatrix, sortAndLimitAssignees } from '@/lib/analytics/assigneeAnalytics';
import { calculateRiskIndicators, calculateAging, agingBuckets } from '@/lib/analytics/riskAnalytics';
import { calculateDataQualityScore } from '@/lib/analytics/dataQualityScore';
import { compareSnapshots } from '@/lib/analytics/snapshotComparison';
import { applyCountingRule, applyCreatedRange, applySelection } from '@/lib/analytics/filters';
import { effectiveSections, evaluateReleaseCriteria, readinessStatement, sectionAvailability } from '@/lib/reports/reportTemplates';
import { kpiDetailsTable, reportWorkbookTables } from '@/lib/reports/reportWorkbook';
import { buildWorkbook, freezeHeaderRows } from '@/lib/export/excelExporter';
import { generateSummary } from '@/lib/analytics/summaryGenerator';
import { DEFAULT_REPORT_OPTIONS } from '@/lib/reports/reportTemplates';
import type { SetupConfig } from '@/types/mappings';
import { sampleParsedFile } from '../fixtures';

/*
 * Fixture (9 valid records, see fixtures.ts):
 *   101 Closed  Asha P1 · 102 New Asha P3 · 103 Reopened Ben P1 · 104 RFQA Ben P2 · 105 DevInProg Carla P4 (bad date)
 *   106 Closed  (unassigned) P2 · 107 Blocked Carla (blank priority, blank date) · 104 New Ben P2 (duplicate) · (no ID) New Asha "Urgent-ish"
 * Categories: closed 2 · open 6 · unmapped 1 (Blocked). High-priority group P1, P2.
 */
function sample(edit?: (c: SetupConfig) => void, editFile?: (file: ReturnType<typeof sampleParsedFile>) => void) {
  const file = sampleParsedFile();
  editFile?.(file);
  const config = initialSetup(file);
  edit?.(config);
  return buildDataset(file, config);
}

function scopesFor(ds: ReturnType<typeof sample>, included = ds.records, inScope = included): DatasetScopes {
  return {
    imported: ds.totalDataRows,
    blankRows: ds.blankRows.length,
    valid: ds.records.length,
    included: included.length,
    excluded: ds.records.length - included.length,
    inScope: inScope.length,
    filtered: inScope.length !== included.length,
  };
}

function metricsFor(ds: ReturnType<typeof sample>, records = ds.records) {
  const agg = computeAggregates(records, ds.config.values);
  return { agg, m: calculateExecutiveMetrics({ agg, values: ds.config.values, mapping: ds.config.columnMapping, scopes: scopesFor(ds, records) }) };
}

describe('executive metrics', () => {
  it('computes every KPI from confirmed mappings', () => {
    const { m } = metricsFor(sample());
    expect(m.scopes).toEqual({ imported: 10, blankRows: 1, valid: 9, included: 9, excluded: 0, inScope: 9, filtered: false });
    expect(m.closed).toMatchObject({ count: 2, statuses: ['Closed'], configured: true });
    expect(m.closed.percent).toBeCloseTo((2 / 9) * 100);
    expect(m.closureRate.percent).toBeCloseTo((2 / 9) * 100);
    expect(m.closureRate).toMatchObject({ configured: true, provisional: true, unmapped: 1 });
    expect(m.openBacklog.count).toBe(6);
    expect(m.openBacklog.statuses.sort()).toEqual(['Development in Progress', 'New', 'Ready for QA', 'Reopened']);
    expect(m.highPriorityOpen.levels).toEqual([
      { label: 'P1', count: 1 },
      { label: 'P2', count: 2 },
    ]);
    expect(m.highPriorityOpen.count).toBe(3);
    expect(m.reopened).toMatchObject({ count: 1, mapped: true });
    expect(m.readyForQa).toMatchObject({ count: 1, mapped: true });
    expect(m.unassigned.count).toBe(1);
    expect(m.unmappedStatus).toMatchObject({ count: 1, values: ['Blocked'] });
    expect(m.blocked).toMatchObject({ count: 1, mapped: true });
  });

  it('never counts unmapped statuses as open, and reports N/A for an empty scope', () => {
    const ds = sample();
    const { m } = metricsFor(ds, []);
    expect(m.closureRate.percent).toBeNull();
    expect(m.openBacklog.percent).toBeNull();
    expect(m.highPriorityOpen.count).toBe(0);
  });

  it('marks the closure rate as not configured when nothing is classified Closed', () => {
    const ds = sample((c) => {
      for (const r of Object.values(c.values.status)) if (r.category === 'closed') r.category = 'unmapped';
    });
    const { m } = metricsFor(ds);
    expect(m.closed.configured).toBe(false);
    expect(m.closureRate).toMatchObject({ configured: false, percent: null });
  });

  it('reports the high-priority KPI as not configured without a group', () => {
    const ds = sample((c) => {
      c.values.highPriority = [];
    });
    expect(metricsFor(ds).m.highPriorityOpen.configured).toBe(false);
  });

  it('distinguishes "not mapped to Reopened" from a real zero', () => {
    const ds = sample((c) => {
      c.values.status['re-open'].label = 'Active';
    });
    expect(metricsFor(ds).m.reopened).toMatchObject({ count: 0, mapped: false });
  });

  it('writes a KPI details table with scope and definition for each KPI', () => {
    const table = kpiDetailsTable(metricsFor(sample()).m);
    const byName = Object.fromEntries(table.rows.map((r) => [r[0], r]));
    expect(byName['Open backlog'][1]).toBe(6);
    expect(byName['P2 open'][1]).toBe(2);
    expect(byName['Reopened (current state)'][4]).toMatch(/not a count of historical reopen events/);
  });
});

describe('assignee workload', () => {
  it('summarizes each assignee with the same rules as the KPIs', () => {
    const { agg } = metricsFor(sample());
    const rows = Object.fromEntries(calculateAssigneeMetrics(agg, ['P1', 'P2']).map((r) => [r.name, r]));
    expect(rows['Ben Ito']).toMatchObject({ total: 3, open: 3, closed: 0, levels: { P1: 1, P2: 2 }, highPriority: 3, reopened: 1, readyForQa: 1 });
    expect(rows['Asha Rao']).toMatchObject({ total: 3, open: 2, closed: 1, levels: { P1: 1, P2: 0 }, highPriority: 1 });
    expect(rows['Carla Diaz']).toMatchObject({ total: 2, open: 1, unmapped: 1 });
    expect(rows['Unassigned']).toMatchObject({ isUnassigned: true, total: 1, closed: 1 });
    expect(rows['Ben Ito'].shareOfOpen).toBeCloseTo(50);
    const sumShares = Object.values(rows).reduce((s, r) => s + (r.shareOfTotal ?? 0), 0);
    expect(sumShares).toBeCloseTo(100);
  });

  it('sorts by any metric and limits Top-N for display only', () => {
    const { agg } = metricsFor(sample());
    expect(sortAndLimitAssignees(agg.byAssignee, { direction: 'desc', search: '', topN: 1, sortKey: 'priority:P2', highPriority: ['P1', 'P2'] }).map((a) => a.name)).toEqual(['Ben Ito']);
    expect(sortAndLimitAssignees(agg.byAssignee, { direction: 'desc', search: '', topN: 'all', sortKey: 'closed' })[0].name).toBe('Asha Rao');
    expect(agg.byAssignee).toHaveLength(4); // the source list is untouched
  });

  it('builds the open-only heatmap from the Open / Pending category', () => {
    const { agg } = metricsFor(sample());
    const priorities = agg.byPriority.map((p) => p.label);
    const open = assigneePriorityMatrix(agg, priorities, 'open');
    const ben = open.rows.find((r) => r.assignee === 'Ben Ito')!;
    expect(ben.cells[priorities.indexOf('P1')]).toBe(1);
    expect(ben.cells[priorities.indexOf('P2')]).toBe(2);
    expect(open.rows.find((r) => r.assignee === 'Unassigned')).toBeUndefined(); // no open issues
    expect(open.grandTotal).toBe(6);
    expect(open.rows.reduce((s, r) => s + r.total, 0)).toBe(6);
  });
});

describe('risk and attention indicators', () => {
  const ref = new Date(2024, 1, 10); // 2024-02-10

  it('lists the right records for each risk with transparent rules', () => {
    const ds = sample();
    const { indicators } = calculateRiskIndicators({ records: ds.records, values: ds.config.values, mapping: ds.config.columnMapping, agingThresholds: [7, 14, 30], referenceDate: ref });
    const by = Object.fromEntries(indicators.map((r) => [r.id, r]));
    const ids = (id: string) => by[id].indexes.map((i) => ds.records[i].id || '(blank)').sort();
    expect(indicators.map((r) => r.id)).toEqual(['high-priority', 'reopened', 'aging', 'unassigned', 'incomplete', 'qa-queue']);
    expect(ids('high-priority')).toEqual(['103', '104', '104']);
    expect(by['high-priority'].facts).toEqual([
      { label: 'P1 open', value: 1 },
      { label: 'P2 open', value: 2 },
    ]);
    expect(by['high-priority'].limitations.join(' ')).toMatch(/unmapped statuses/);
    expect(ids('reopened')).toEqual(['103']);
    expect(ids('unassigned')).toEqual(['106']);
    expect(ids('qa-queue')).toEqual(['104']);
    // incomplete: no-ID record, Blocked (unmapped status, missing priority, missing created), Urgent-ish (unmapped priority)
    expect(ids('incomplete')).toEqual(['(blank)', '107']);
    const problems = Object.fromEntries(by['incomplete'].breakdowns[0].rows.map((r) => [r.label, r.count]));
    // 107 has no Created Date but is not open, so it is not flagged for it (aging only applies to open issues).
    expect(problems).toEqual({ 'Missing status': 0, 'Unmapped status': 1, 'Missing priority': 1, 'Unmapped priority': 1, 'Missing issue ID': 1, 'Missing Created Date (open issues)': 0 });
  });

  it('ages open issues since creation into configurable buckets', () => {
    const ds = sample();
    const aging = calculateAging(ds.records, ds.config.columnMapping, [7, 14, 30], ref);
    // Open & dated: 102 (Jan 6 → 35 d), 103 (34), 104 (33), 104 dup (Jan 11 → 30), no-ID (Jan 12 → 29); 105 date unreadable.
    expect(aging.buckets.map((b) => [b.label, b.indexes.length])).toEqual([
      ['0–7 days', 0],
      ['8–14 days', 0],
      ['15–30 days', 2],
      ['More than 30 days', 3],
    ]);
    expect(aging.aged).toBe(5);
    expect(aging.oldestDays).toBe(35);
    expect(aging.invalidCreated.map((i) => ds.records[i].id)).toEqual(['105']);
    expect(agingBuckets([30, 5]).map((b) => b.label)).toEqual(['0–5 days', '6–30 days', 'More than 30 days']);
  });

  it('flags future Created Dates instead of producing negative ages', () => {
    const ds = sample();
    const aging = calculateAging(ds.records, ds.config.columnMapping, [7], new Date(2024, 0, 9));
    // 104 dup (Jan 11) and no-ID (Jan 12) are after the reference date.
    expect(aging.futureCreated.length).toBe(2);
    expect(aging.buckets.flatMap((b) => b.indexes)).not.toContain(ds.records.findIndex((r) => r.id === '' ));
  });

  it('reports aging as unavailable without a Created Date column', () => {
    const ds = sample((c) => {
      c.columnMapping.created = null;
    });
    const aging = calculateAging(ds.records, ds.config.columnMapping, [7], ref);
    expect(aging).toMatchObject({ available: false });
    expect(aging.reason).toMatch(/Created Date/);
  });
});

describe('data-quality score', () => {
  it('scores each rule from documented counts and weights only applicable rules', () => {
    const ds = sample();
    const score = calculateDataQualityScore({ records: ds.records, mapping: ds.config.columnMapping, values: ds.config.values, now: new Date(2025, 0, 1) });
    const d = Object.fromEntries(score.dimensions.map((x) => [x.id, x]));
    expect([d.idCompleteness.valid, d.idCompleteness.checked]).toEqual([8, 9]);
    expect([d.statusCompleteness.valid, d.statusCompleteness.checked]).toEqual([9, 9]);
    expect([d.statusMapping.valid, d.statusMapping.checked]).toEqual([8, 9]);
    expect([d.priorityMapping.valid, d.priorityMapping.checked]).toEqual([7, 8]);
    expect([d.assigneeCompleteness.valid, d.assigneeCompleteness.checked]).toEqual([8, 9]);
    expect([d.dateValidity.valid, d.dateValidity.checked]).toEqual([8, 9]);
    expect([d.duplicateIds.valid, d.duplicateIds.checked]).toEqual([7, 8]);
    expect(d.statusCompleteness.outcome).toBe('pass');
    expect(d.idCompleteness.outcome).toBe('error');
    const expected = (15 * (8 / 9) + 15 * 1 + 15 * (8 / 9) + 10 * (8 / 9) + 10 * (7 / 8) + 15 * (8 / 9) + 10 * (8 / 9) + 10 * (7 / 8)) / 100 * 100;
    expect(score.overall).toBeCloseTo(expected, 6);
    expect(score.passed + score.warnings + score.errors + score.notApplicable).toBe(8);
  });

  it('does not penalize optional fields that are absent, unless marked required', () => {
    const ds = sample((c) => {
      c.columnMapping.id = null;
    });
    const optional = calculateDataQualityScore({ records: ds.records, mapping: ds.config.columnMapping, values: ds.config.values });
    expect(optional.dimensions.find((x) => x.id === 'idCompleteness')!.outcome).toBe('not-applicable');
    const required = calculateDataQualityScore({ records: ds.records, mapping: ds.config.columnMapping, values: ds.config.values, requiredFields: ['id'] });
    expect(required.dimensions.find((x) => x.id === 'idCompleteness')!).toMatchObject({ outcome: 'error', score: 0 });
    expect(required.overall!).toBeLessThan(optional.overall!);
  });

  it('honors custom weights and returns null for an empty dataset', () => {
    const ds = sample();
    const onlyStatus = calculateDataQualityScore({
      records: ds.records,
      mapping: ds.config.columnMapping,
      values: ds.config.values,
      weights: { idCompleteness: 0, statusCompleteness: 1, statusMapping: 0, priorityCompleteness: 0, priorityMapping: 0, assigneeCompleteness: 0, dateValidity: 0, duplicateIds: 0 },
    });
    expect(onlyStatus.overall).toBeCloseTo(100);
    expect(calculateDataQualityScore({ records: [], mapping: ds.config.columnMapping, values: ds.config.values }).overall).toBeNull();
  });

  it('counts explicitly Unknown priorities as mapped, separate from blank priorities', () => {
    const ds = sample(undefined, (file) => {
      file.rows[2][4] = 'TBD'; // 102: P3 -> TBD
    });
    const rec = ds.records.find((r) => r.id === '102')!;
    expect(rec.priority).toBe('Unknown');
    expect(ds.quality.unmappedPriorityValues).not.toContain('TBD');
    expect(ds.quality.missingPriorities).toBe(1);
  });
});

describe('dataset scopes and selections', () => {
  it('review rule excludes only the duplicates the user chose', () => {
    const ds = sample();
    const dup = ds.records.find((r) => r.id === '104' && !r.isFirstOfId)!;
    expect(applyCountingRule(ds.records, 'review', new Set())).toHaveLength(9);
    expect(applyCountingRule(ds.records, 'review', new Set([dup.index]))).toHaveLength(8);
    // Blank IDs are never treated as duplicates of each other.
    expect(applyCountingRule(ds.records, 'unique').some((r) => r.id === '')).toBe(true);
  });

  it('filters by an inclusive created-date range and excludes undated records', () => {
    const ds = sample();
    expect(applyCreatedRange(ds.records, '2024-01-06', '2024-01-08').map((r) => r.id)).toEqual(['102', '103', '104']);
    expect(applyCreatedRange(ds.records, '', '')).toHaveLength(9);
  });

  it('applies record-set selections exactly', () => {
    const ds = sample();
    const set = new Set([0, 4]);
    expect(applySelection(ds.records, { criteria: {}, indexes: set }).map((r) => r.id)).toEqual(['101', '105']);
    expect(applySelection(ds.records, { criteria: { status: ['Closed'] }, indexes: set }).map((r) => r.id)).toEqual(['101']);
  });

  it('records future dates as data-quality warnings', () => {
    const ds = sample(undefined, (file) => {
      file.rows[1][6] = '2099-01-01';
    });
    expect(ds.quality.futureDates).toBe(1);
    expect(ds.quality.issues.find((i) => i.category === 'Future date')).toMatchObject({ severity: 'Warning', issueId: '101' });
  });
});

describe('snapshot comparison', () => {
  it('matches by ID and labels appearances and disappearances conservatively', () => {
    const current = sample();
    const previous = sample(undefined, (file) => {
      file.rows[1][2] = 'New'; // 101 was New, now Closed
      file.rows[3][2] = 'Closed'; // 103 was Closed, now Reopened
      file.rows[5][3] = 'Asha Rao'; // 105 changed owner
      file.rows[6][0] = '999'; // 106 absent before, 999 gone now
    });
    const c = compareSnapshots(previous.records, current.records, current.config.values);
    expect(c.newlyObserved.map((r) => r.id)).toEqual(['106']);
    expect(c.noLongerPresent.map((r) => r.id)).toEqual(['999']);
    expect(c.closedBetween.map((x) => x.id)).toEqual(['101']);
    expect(c.reopenedBetween.map((x) => x.id)).toEqual(['103']);
    expect(c.assigneeChanges.map((x) => [x.id, x.previous, x.current])).toEqual([['105', 'Asha Rao', 'Carla Diaz']]);
    expect(c.unmatchableCurrent).toBe(1);
    expect(c.ambiguousIds).toBe(2);
    const total = c.metrics.find((m) => m.metric === 'Total records')!;
    expect(total).toMatchObject({ previous: 9, current: 9, change: 0, percentChange: 0 });
  });

  it('avoids division by zero in percentage changes', () => {
    const current = sample();
    const c = compareSnapshots([], current.records, current.config.values);
    expect(c.metrics.every((m) => m.percentChange === null)).toBe(true);
  });

  it('normalizes a snapshot with the reference mappings by header name', () => {
    const reference = sample();
    const file = sampleParsedFile();
    // Reorder columns in the earlier export: header names, not positions, drive the mapping.
    file.rows = file.rows.map((r) => [r[3], r[0], r[1], r[2], r[4], r[5], r[6], r[7]]);
    const config = comparisonSetup(file, reference);
    expect(config.columnMapping.assignee).toBe(0);
    expect(config.columnMapping.id).toBe(1);
    expect(config.columnMapping.status).toBe(3);
    expect(buildDataset(file, config).records.find((r) => r.id === '103')!.status).toBe('Reopened');
  });
});

describe('report templates and workbook', () => {
  it('excludes unsupported sections and keeps canonical order', () => {
    const ds = sample((c) => {
      c.columnMapping.created = null;
    });
    const ctx = { mapping: ds.config.columnMapping, hasComparison: false, agingAvailable: false, agingReason: 'No Created Date column' };
    expect(sectionAvailability('aging', ctx)).toEqual({ available: false, reason: 'No Created Date column' });
    expect(effectiveSections(['register', 'aging', 'summary', 'comparison'], ctx)).toEqual(['summary', 'register']);
  });

  it('evaluates only configured release criteria and never declares approval', () => {
    const { m } = metricsFor(sample());
    expect(readinessStatement(evaluateReleaseCriteria({ maxHighPriorityOpen: null, maxOpenBacklog: null, maxReopened: null, maxUnassigned: null }, m))).toMatch(/No release criteria have been configured/);
    const results = evaluateReleaseCriteria({ maxHighPriorityOpen: 0, maxOpenBacklog: 10, maxReopened: null, maxUnassigned: null }, m);
    expect(results.map((r) => [r.actual, r.met])).toEqual([
      [3, false],
      [6, true],
    ]);
    expect(readinessStatement(results)).toMatch(/1 of 2 configured criteria are not met.*not a formal release approval/);
  });

  it('creates only the worksheets of the selected sections, with frozen header rows', () => {
    const ds = sample();
    const { agg, m } = metricsFor(ds);
    const { indicators, aging } = calculateRiskIndicators({ records: ds.records, values: ds.config.values, mapping: ds.config.columnMapping, agingThresholds: [7, 14, 30] });
    const summary = generateSummary({ agg, values: ds.config.values, mapping: ds.config.columnMapping, quality: ds.quality, countingRule: 'all', filterDescription: '' });
    const tables = reportWorkbookTables(
      {
        dataset: ds,
        agg,
        executive: m,
        summary,
        risks: indicators,
        aging,
        qualityScore: calculateDataQualityScore({ records: ds.records, mapping: ds.config.columnMapping, values: ds.config.values }),
        records: ds.records,
        comparison: null,
        filterDescription: '',
      },
      DEFAULT_REPORT_OPTIONS,
      ['summary', 'risks'],
    );
    expect(tables.map((t) => t.name)).toEqual(['Executive Summary', 'KPI Details', 'Risk and Attention Items', 'Risk Records']);
    const riskRecords = tables[3].rows.filter((r) => r[0] === 'High-priority backlog');
    expect(riskRecords).toHaveLength(3);

    const bytes = XLSX.write(buildWorkbook(tables), { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    const frozen = freezeHeaderRows(bytes);
    const zip = XLSX.CFB.read(new Uint8Array(frozen), { type: 'array' });
    const sheet = zip.FileIndex[zip.FullPaths.findIndex((p: string) => /sheet1\.xml$/.test(p))];
    expect(new TextDecoder().decode(sheet.content as Uint8Array)).toContain('state="frozen"');
    const reopened = XLSX.read(new Uint8Array(frozen), { type: 'array' });
    expect(reopened.SheetNames).toHaveLength(4);
  });

  it('keeps formula-like text inert in Excel cells', () => {
    const ws = buildWorkbook([{ name: 'T', columns: [{ header: 'Title', kind: 'text' }], rows: [['=SUM(1,2)']] }]).Sheets['T'];
    expect(ws['A2']).toMatchObject({ t: 's', v: '=SUM(1,2)' });
    expect(ws['A2'].f).toBeUndefined();
  });
});
