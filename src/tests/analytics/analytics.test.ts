import { describe, expect, it } from 'vitest';
import { buildDataset, initialSetup } from '@/lib/normalization/datasetBuilder';
import { computeAggregates } from '@/lib/analytics/aggregate';
import { computeKpis, computeClosure, computeHandoffStages } from '@/lib/analytics/statusAnalytics';
import { computeBacklog, highPriorityRecords } from '@/lib/analytics/priorityAnalytics';
import { computeLeaders, assigneePriorityMatrix, sortAndLimitAssignees } from '@/lib/analytics/assigneeAnalytics';
import { applyCountingRule, applyCriteria, searchRecords } from '@/lib/analytics/filters';
import { generateSummary } from '@/lib/analytics/summaryGenerator';
import type { SetupConfig } from '@/types/mappings';
import { sampleParsedFile } from '../fixtures';

function sample(edit?: (c: SetupConfig) => void) {
  const file = sampleParsedFile();
  const config = initialSetup(file);
  edit?.(config);
  return buildDataset(file, config);
}

const kpi = (kpis: ReturnType<typeof computeKpis>, key: string) => kpis.find((k) => k.key === key)!;

describe('dataset building', () => {
  it('detects the header, skips blank rows and keeps source row numbers', () => {
    const ds = sample();
    expect(ds.config.headerRowIndex).toBe(0);
    expect(ds.records).toHaveLength(9);
    expect(ds.blankRows).toEqual([9]); // header is row 1, blank is the 8th data row
    expect(ds.records[0].sourceRow).toBe(2);
    expect(ds.totalDataRows).toBe(10);
  });

  it('normalizes values without altering the originals', () => {
    const ds = sample();
    const r103 = ds.records.find((r) => r.id === '103')!;
    expect(r103.status).toBe('Reopened');
    expect(r103.statusRaw).toBe('re-open');
    const lower = ds.records.find((r) => r.id === '104' && r.isFirstOfId)!;
    expect(lower.assignee).toBe('Ben Ito');
    expect(lower.assigneeRaw).toBe('ben ito');
    expect(lower.cells[3]).toBe('ben ito');
  });

  it('keeps free-text titles exactly as imported (line breaks preserved, only trimmed)', () => {
    const file = sampleParsedFile();
    file.rows[1][1] = '  First line\nsecond   line  ';
    const ds = buildDataset(file, initialSetup(file));
    expect(ds.records[0].title).toBe('First line\nsecond   line');
  });

  it('flags duplicates without removing them', () => {
    const ds = sample();
    const dups = ds.records.filter((r) => r.isDuplicateId);
    expect(dups.map((r) => r.id)).toEqual(['104', '104']);
    expect(dups.filter((r) => r.isFirstOfId)).toHaveLength(1);
  });
});

describe('aggregation and KPIs', () => {
  it('counts statuses, unassigned and other statuses correctly', () => {
    const ds = sample();
    const agg = computeAggregates(ds.records, ds.config.values);
    const kpis = computeKpis(agg);
    expect(kpi(kpis, 'total').count).toBe(9);
    expect(kpi(kpis, 'closed').count).toBe(2);
    expect(kpi(kpis, 'new').count).toBe(3);
    expect(kpi(kpis, 'reopened').count).toBe(1);
    expect(kpi(kpis, 'readyForQa').count).toBe(1);
    expect(kpi(kpis, 'devInProgress').count).toBe(1);
    expect(kpi(kpis, 'other').count).toBe(1);
    expect(kpi(kpis, 'other').statuses).toEqual(['Blocked']);
    expect(kpi(kpis, 'unassigned').count).toBe(1);
    expect(kpi(kpis, 'closed').percent).toBeCloseTo((2 / 9) * 100);
  });

  it('handles an empty scope without dividing by zero', () => {
    const ds = sample();
    const agg = computeAggregates([], ds.config.values);
    const kpis = computeKpis(agg);
    expect(kpis.every((k) => k.count === 0 && k.percent === null)).toBe(true);
    expect(computeClosure(agg, ds.config.values).percent).toBeNull();
  });

  it('counts priorities in configured order', () => {
    const ds = sample();
    const agg = computeAggregates(ds.records, ds.config.values);
    expect(agg.byPriority).toEqual([
      { label: 'P1', count: 2 },
      { label: 'P2', count: 3 },
      { label: 'P3', count: 1 },
      { label: 'P4', count: 1 },
      { label: 'Urgent-ish', count: 1 },
      { label: '(No Priority)', count: 1 },
    ]);
  });

  it('computes assignee totals, statuses and the assignee-priority matrix', () => {
    const ds = sample();
    const agg = computeAggregates(ds.records, ds.config.values);
    const byName = Object.fromEntries(agg.byAssignee.map((a) => [a.name, a]));
    expect(byName['Asha Rao'].total).toBe(3);
    expect(byName['Ben Ito'].total).toBe(3);
    expect(byName['Carla Diaz'].total).toBe(2);
    expect(byName['Unassigned'].total).toBe(1);
    expect(byName['Ben Ito'].byPriority).toEqual({ P1: 1, P2: 2 });
    expect(byName['Ben Ito'].byStatus).toEqual({ Reopened: 1, 'Ready for QA': 1, New: 1 });

    const priorities = agg.byPriority.map((p) => p.label);
    const matrix = assigneePriorityMatrix(agg, priorities);
    const ben = matrix.rows.find((r) => r.assignee === 'Ben Ito')!;
    expect(ben.cells).toEqual([1, 2, 0, 0, 0, 0]);
    expect(matrix.columnTotals).toEqual([2, 3, 1, 1, 1, 1]);
    expect(matrix.columnTotals.reduce((a, b) => a + b, 0)).toBe(agg.total);
    expect(matrix.max).toBe(2);
  });

  it('reports leaders with ties and excludes Unassigned', () => {
    const ds = sample();
    const agg = computeAggregates(ds.records, ds.config.values);
    const leaders = computeLeaders(agg, ['P1', 'P2']);
    expect(leaders[0]).toEqual({ metric: 'Highest total issues', names: ['Asha Rao', 'Ben Ito'], count: 3 });
    expect(leaders[1]).toEqual({ metric: 'Most P1 issues', names: ['Asha Rao', 'Ben Ito'], count: 1 });
    expect(leaders[2]).toEqual({ metric: 'Most P2 issues', names: ['Ben Ito'], count: 2 });
    expect(leaders.find((l) => l.metric === 'Most reopened issues')!.names).toEqual(['Ben Ito']);
  });

  it('sorts, searches and limits assignees', () => {
    const ds = sample();
    const agg = computeAggregates(ds.records, ds.config.values);
    expect(sortAndLimitAssignees(agg.byAssignee, { direction: 'asc', search: '', topN: 2 }).map((a) => a.name)).toEqual(['Unassigned', 'Carla Diaz']);
    expect(sortAndLimitAssignees(agg.byAssignee, { direction: 'desc', search: 'carla', topN: 'all' }).map((a) => a.name)).toEqual(['Carla Diaz']);
  });
});

describe('workflow categories and closure', () => {
  it('only counts explicitly closed categories and reports unmapped separately', () => {
    const ds = sample();
    const agg = computeAggregates(ds.records, ds.config.values);
    const closure = computeClosure(agg, ds.config.values);
    expect(closure.configured).toBe(true);
    expect(closure.closedCount).toBe(2);
    expect(closure.unmappedCount).toBe(1); // Blocked is unmapped until the user classifies it
    expect(closure.percent).toBeCloseTo((2 / 9) * 100);
    const backlog = computeBacklog(agg);
    expect(backlog.find((b) => b.priority === 'P2')).toEqual({ priority: 'P2', open: 2, closed: 1, unmapped: 0, total: 3 });
  });

  it('shows closure as not configured when no status is classified as closed', () => {
    const ds = sample((c) => {
      for (const rule of Object.values(c.values.status)) if (rule.category === 'closed') rule.category = 'unmapped';
    });
    const agg = computeAggregates(ds.records, ds.config.values);
    expect(computeClosure(agg, ds.config.values)).toMatchObject({ configured: false, percent: null });
  });

  it('applies user status re-mapping', () => {
    const ds = sample((c) => {
      c.values.status['blocked'].category = 'open';
      c.values.status['blocked'].label = 'Development in Progress';
    });
    const agg = computeAggregates(ds.records, ds.config.values);
    expect(agg.statusMap['Development in Progress']).toBe(2);
    expect(agg.byCategory.unmapped).toBe(0);
  });

  it('computes handoff stage volumes', () => {
    const ds = sample();
    const stages = computeHandoffStages(computeAggregates(ds.records, ds.config.values));
    expect(stages.map((s) => s.count)).toEqual([3, 1, 1, 1, 2, 1]);
  });
});

describe('filters and counting rules', () => {
  it('excludes repeated IDs only when asked, keeping the first occurrence', () => {
    const ds = sample();
    expect(applyCountingRule(ds.records, 'all')).toHaveLength(9);
    const unique = applyCountingRule(ds.records, 'unique');
    expect(unique).toHaveLength(8);
    expect(unique.find((r) => r.id === '104')!.title).toBe('Slow report');
  });

  it('ANDs fields and ORs values within a field', () => {
    const ds = sample();
    expect(applyCriteria(ds.records, { assignee: ['Ben Ito'], priority: ['P2'] })).toHaveLength(2);
    expect(applyCriteria(ds.records, { status: ['New', 'Closed'] })).toHaveLength(5);
    expect(applyCriteria(ds.records, { status: ['New'], category: ['closed'] })).toHaveLength(0);
    expect(applyCriteria(ds.records, {})).toHaveLength(9);
  });

  it('keeps filtered totals consistent with aggregates', () => {
    const ds = sample();
    const scoped = applyCriteria(ds.records, { assignee: ['Asha Rao'] });
    const agg = computeAggregates(scoped, ds.config.values);
    expect(agg.total).toBe(3);
    expect(agg.byStatus.reduce((s, x) => s + x.count, 0)).toBe(3);
    expect(agg.byPriority.reduce((s, x) => s + x.count, 0)).toBe(3);
  });

  it('searches by scope', () => {
    const ds = sample();
    expect(searchRecords(ds.records, '103', 'id')).toHaveLength(1);
    expect(searchRecords(ds.records, 'slow', 'title')).toHaveLength(2);
    expect(searchRecords(ds.records, 'carla', 'assignee')).toHaveLength(2);
    expect(searchRecords(ds.records, 'carla', 'title')).toHaveLength(0);
  });

  it('selects high-priority records using the configured group', () => {
    const ds = sample();
    expect(highPriorityRecords(ds.records, ds.config.values).map((r) => r.priority)).toEqual(['P1', 'P1', 'P2', 'P2', 'P2']);
    const custom = { ...ds.config.values, highPriority: ['P4'] };
    expect(highPriorityRecords(ds.records, custom)).toHaveLength(1);
    expect(highPriorityRecords(ds.records, { ...ds.config.values, highPriority: [] })).toHaveLength(0);
  });
});

describe('data quality', () => {
  it('reports every category without changing records', () => {
    const q = sample().quality;
    expect(q).toMatchObject({
      totalImportedRows: 10,
      blankRows: 1,
      validRecords: 9,
      missingIds: 1,
      duplicateIdRecords: 2,
      duplicateIdValues: 1,
      duplicateExtraRecords: 1,
      missingStatuses: 0,
      missingAssignees: 1,
      missingPriorities: 1,
      invalidDates: 1,
      unmappedStatusRecords: 1,
      unmappedPriorityRecords: 1,
    });
    expect(q.unmappedStatusValues).toEqual(['Blocked']);
    expect(q.unmappedPriorityValues).toEqual(['Urgent-ish']);
    // Severity is mapped and Created Date is mapped; nothing else is left over.
    expect(q.unrecognizedColumns).toEqual([]);
    const blank = q.issues.find((i) => i.category === 'Blank row')!;
    expect(blank.sourceRow).toBe(9);
  });
});

describe('executive summary', () => {
  it('uses only calculated values and real names', () => {
    const ds = sample();
    const agg = computeAggregates(ds.records, ds.config.values);
    const summary = generateSummary({ agg, values: ds.config.values, mapping: ds.config.columnMapping, quality: ds.quality, countingRule: 'all', filterDescription: '' });
    expect(summary.headline).toContain('Out of 9 issues, 2 are closed, representing 22.2% of the dataset.');
    expect(summary.headline).toContain('1 issue is ready for QA, while 1 is currently in development.');
    expect(summary.headline).toContain('Asha Rao and Ben Ito share the highest assigned issue count, with 3 issues each.');
    const text = JSON.stringify(summary);
    expect(text).not.toMatch(/underperform|poor performance|lazy/i);
    expect(summary.notes.join(' ')).toMatch(/2 records share an ID/);
  });

  it('degrades gracefully for an empty scope', () => {
    const ds = sample();
    const agg = computeAggregates([], ds.config.values);
    const summary = generateSummary({ agg, values: ds.config.values, mapping: ds.config.columnMapping, quality: ds.quality, countingRule: 'all', filterDescription: 'Status: Closed' });
    expect(summary.headline).toBe('No issues are in the current analysis scope.');
    expect(summary.insights).toHaveLength(0);
  });

  it('omits unavailable metrics when columns are not mapped', () => {
    const ds = sample((c) => {
      c.columnMapping.status = null;
      c.values.status = {};
    });
    const agg = computeAggregates(ds.records, ds.config.values);
    const summary = generateSummary({ agg, values: ds.config.values, mapping: ds.config.columnMapping, quality: ds.quality, countingRule: 'all', filterDescription: '' });
    expect(summary.headline).not.toMatch(/closed/);
    expect(summary.insights.find((i) => i.id === 'no-status')).toBeTruthy();
  });
});
