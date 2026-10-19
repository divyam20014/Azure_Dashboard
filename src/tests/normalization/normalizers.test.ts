import { describe, expect, it } from 'vitest';
import { defaultStatusRule, buildStatusRules } from '@/lib/normalization/statusNormalizer';
import { recognizePriority, defaultPriorityOrder, defaultHighPriority, mergePriorityOrder, defaultPriorityRule } from '@/lib/normalization/priorityNormalizer';
import { defaultAssigneeRule, assigneeLabel, isUnassignedPlaceholder } from '@/lib/normalization/assigneeNormalizer';
import { parseDateCell, excelSerialToDate } from '@/lib/normalization/dateParser';
import { normKey } from '@/lib/text';
import { NO_PRIORITY_LABEL, NO_STATUS_LABEL } from '@/types/issue';

const dv = (sourceLabel: string, count = 1) => ({ key: normKey(sourceLabel), sourceLabel, count });

describe('status normalization', () => {
  it.each([
    ['Closed', 'Closed', 'closed'],
    ['  CLOSED ', 'Closed', 'closed'],
    ['new', 'New', 'open'],
    ['Re-open', 'Reopened', 'open'],
    ['re open', 'Reopened', 'open'],
    ['Reopened', 'Reopened', 'open'],
    ['Ready for QA', 'Ready for QA', 'open'],
    ['ready-for-qa', 'Ready for QA', 'open'],
    ['Ready For Testing', 'Ready for QA', 'open'],
    ['Development In Progress', 'Development in Progress', 'open'],
    ['Dev in progress', 'Development in Progress', 'open'],
  ])('maps %j to %s (%s)', (raw, label, category) => {
    const rule = defaultStatusRule(dv(raw.trim()));
    expect(rule.label).toBe(label);
    expect(rule.category).toBe(category);
  });

  it('recognizes other statuses but leaves them Unmapped (suggestion only)', () => {
    const active = defaultStatusRule(dv('Active'));
    expect(active.label).toBe('Active');
    expect(active.category).toBe('unmapped');
    expect(active.suggestedCategory).toBe('open');
    const done = defaultStatusRule(dv('done'));
    expect(done.category).toBe('unmapped');
    expect(done.suggestedCategory).toBe('closed');
  });

  it('never suggests a category for Resolved / Removed / Cancelled', () => {
    for (const s of ['Resolved', 'Removed', 'Cancelled', 'Canceled']) {
      const rule = defaultStatusRule(dv(s));
      expect(rule.category).toBe('unmapped');
      expect(rule.suggestedCategory).toBeNull();
    }
  });

  it('keeps unknown statuses as-is and unmapped', () => {
    const rule = defaultStatusRule(dv('Awaiting Vendor'));
    expect(rule.label).toBe('Awaiting Vendor');
    expect(rule.category).toBe('unmapped');
  });

  it('treats blank as (No Status)', () => {
    expect(defaultStatusRule({ key: '', sourceLabel: '', count: 3 }).label).toBe(NO_STATUS_LABEL);
  });

  it('preserves user edits when rules are rebuilt', () => {
    const first = buildStatusRules([dv('Resolved', 2)]);
    first['resolved'] = { ...first['resolved'], category: 'closed', label: 'Done-ish' };
    const rebuilt = buildStatusRules([dv('Resolved', 5)], first);
    expect(rebuilt['resolved'].category).toBe('closed');
    expect(rebuilt['resolved'].label).toBe('Done-ish');
    expect(rebuilt['resolved'].count).toBe(5);
  });
});

describe('priority normalization', () => {
  it.each([
    ['P1', 'P1'],
    ['p2', 'P2'],
    ['P 3', 'P3'],
    ['Priority 1', 'P1'],
    ['priority-4', 'P4'],
    ['1 - Critical', 'P1'],
    ['2: High', 'P2'],
    ['Critical', 'Critical'],
    ['HIGH', 'High'],
    ['med', 'Medium'],
  ])('recognizes %j as %s', (raw, label) => {
    expect(recognizePriority(raw)?.label).toBe(label);
  });

  it('flags bare numbers as numeric so the UI can ask for confirmation of the convention', () => {
    expect(recognizePriority('1')).toEqual({ label: 'P1', numeric: true });
    expect(recognizePriority('3.0')).toEqual({ label: 'P3', numeric: true });
  });

  it('leaves custom priorities unconfirmed with their original label', () => {
    const rule = defaultPriorityRule(dv('Showstopper'));
    expect(rule.label).toBe('Showstopper');
    expect(rule.confirmed).toBe(false);
  });

  it('does not equate severity labels with P-levels', () => {
    // "Severity 1" is not a priority notation.
    expect(recognizePriority('Severity 1')).toBeNull();
  });

  it('orders P-levels, then word levels, then custom, then blank', () => {
    expect(defaultPriorityOrder(['Low', 'P2', 'Custom', NO_PRIORITY_LABEL, 'P1', 'Critical', 'P10'])).toEqual([
      'P1',
      'P2',
      'P10',
      'Critical',
      'Low',
      'Custom',
      NO_PRIORITY_LABEL,
    ]);
  });

  it('keeps a user-defined order and appends new labels', () => {
    expect(mergePriorityOrder(['P1', 'P2', 'P3'], ['P3', 'P1'])).toEqual(['P3', 'P1', 'P2']);
  });

  it('defaults the high-priority group to P1/P2, else top word levels, else nothing', () => {
    expect(defaultHighPriority(['P1', 'P2', 'P3'])).toEqual(['P1', 'P2']);
    expect(defaultHighPriority(['Critical', 'High', 'Low'])).toEqual(['Critical', 'High']);
    expect(defaultHighPriority(['Gold', 'Silver'])).toEqual([]);
  });
});

describe('assignee normalization', () => {
  it('trims names and treats blanks / placeholders as Unassigned', () => {
    expect(defaultAssigneeRule(dv('  Asha   Rao ')).label).toBe('Asha Rao');
    expect(defaultAssigneeRule({ key: '', sourceLabel: '', count: 1 }).unassigned).toBe(true);
    expect(isUnassignedPlaceholder('N/A')).toBe(true);
    expect(isUnassignedPlaceholder('Nadia')).toBe(false);
  });

  it('groups case-insensitively through the shared key, not by fuzzy similarity', () => {
    expect(normKey('Ben Ito')).toBe(normKey('ben ITO'));
    expect(normKey('Ben Ito')).not.toBe(normKey('Benjamin Ito'));
  });

  it('honors a user override marking a value as unassigned', () => {
    const rule = { ...defaultAssigneeRule(dv('Team Queue')), unassigned: true };
    expect(assigneeLabel(rule)).toEqual({ label: 'Unassigned', unassigned: true });
  });
});

describe('date parsing', () => {
  it('parses ISO, Excel serials and Date cells', () => {
    expect(parseDateCell('2024-03-05', 'MDY').date?.getDate()).toBe(5);
    expect(parseDateCell(new Date(2024, 0, 2), 'MDY').date?.getMonth()).toBe(0);
    expect(excelSerialToDate(45292)?.getFullYear()).toBe(2024); // 2024-01-01
    expect(parseDateCell(45292, 'MDY').invalid).toBe(false);
  });

  it('reads numeric dates in the configured order', () => {
    const mdy = parseDateCell('03/05/2024', 'MDY').date!;
    expect([mdy.getMonth() + 1, mdy.getDate()]).toEqual([3, 5]);
    const dmy = parseDateCell('03/05/2024', 'DMY').date!;
    expect([dmy.getMonth() + 1, dmy.getDate()]).toEqual([5, 3]);
    expect(parseDateCell('1/15/2024 3:30 PM', 'MDY').date?.getHours()).toBe(15);
  });

  it('rejects impossible and garbage dates but treats blanks as missing (not invalid)', () => {
    expect(parseDateCell('31/02/2024', 'DMY').invalid).toBe(true);
    expect(parseDateCell('13/25/2024', 'MDY').invalid).toBe(true);
    expect(parseDateCell('not a date', 'MDY').invalid).toBe(true);
    expect(parseDateCell('', 'MDY')).toEqual({ date: null, invalid: false });
    expect(parseDateCell(null, 'MDY')).toEqual({ date: null, invalid: false });
  });

  it('parses month-name formats', () => {
    expect(parseDateCell('12 Jan 2024', 'MDY').date?.getMonth()).toBe(0);
    expect(parseDateCell('Jan 12, 2024', 'MDY').date?.getDate()).toBe(12);
  });
});
