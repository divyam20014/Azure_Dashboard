import { describe, expect, it } from 'vitest';
import { buildHeaders, detectColumns, detectHeaderRow } from '@/lib/normalization/columnDetector';

describe('column detection', () => {
  it('detects Azure DevOps export headers', () => {
    const m = detectColumns(['ID', 'Work Item Type', 'Title', 'Assigned To', 'State', 'Priority', 'Severity', 'Area Path', 'Iteration Path', 'Created Date', 'Changed Date', 'Tags']);
    expect(m).toMatchObject({ id: 0, type: 1, title: 2, assignee: 3, status: 4, priority: 5, severity: 6, area: 7, iteration: 8, created: 9, updated: 10, tags: 11 });
  });

  it('detects Jira-style headers and keeps severity separate from priority', () => {
    const m = detectColumns(['Issue key', 'Summary', 'Status', 'Assignee', 'Reporter', 'Issue Type', 'Labels', 'Created', 'Updated', 'Resolved Date']);
    expect(m).toMatchObject({ id: 0, title: 1, status: 2, assignee: 3, reporter: 4, type: 5, tags: 6, created: 7, updated: 8, closed: 9 });
    expect(m.priority).toBeNull();
    expect(m.severity).toBeNull();
  });

  it('matches case/punctuation variants and ADO reference names', () => {
    const m = detectColumns(['bug_id', 'ISSUE-TITLE', 'System.AssignedTo', 'Microsoft.VSTS.Common.Priority', 'workflow status']);
    expect(m).toMatchObject({ id: 0, title: 1, assignee: 2, priority: 3, status: 4 });
  });

  it('uses contains-matching for longer headers without confusing dates', () => {
    const m = detectColumns(['Bug Priority Level', 'Current Status Value', 'State Change Date']);
    expect(m.priority).toBe(0);
    expect(m.status).toBe(1);
    expect(m.created).toBeNull();
  });

  it('never maps one column to two fields', () => {
    const m = detectColumns(['Status']);
    const mapped = Object.values(m).filter((v) => v !== null);
    expect(mapped).toEqual([0]);
  });

  it('returns no mappings for unrelated headers', () => {
    const m = detectColumns(['Foo', 'Bar', 'Baz']);
    expect(Object.values(m).every((v) => v === null)).toBe(true);
  });
});

describe('header row detection and header building', () => {
  it('finds a header row that is not the first row', () => {
    const rows = [['Quarterly bug export'], [], ['Generated 2024-01-01'], ['ID', 'Title', 'State', 'Assigned To', 'Priority'], ['1', 'x', 'New', 'A', 'P1']];
    expect(detectHeaderRow(rows)).toBe(3);
  });

  it('names blank headers and de-duplicates repeated headers', () => {
    const { headers, duplicates } = buildHeaders(['ID', '', 'State', 'state', 'State'], 6);
    expect(headers).toEqual(['ID', 'Column 2', 'State', 'state (2)', 'State (3)', 'Column 6']);
    expect(duplicates).toEqual(['State']);
  });
});
