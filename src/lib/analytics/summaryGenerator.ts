import type { Aggregates, CountingRule } from '@/types/analytics';
import type { ColumnMapping, ValueMappings } from '@/types/mappings';
import { UNASSIGNED_LABEL } from '@/types/issue';
import { formatCount, formatPercent, percentOf } from '@/lib/text';
import { computeClosure } from './statusAnalytics';
import { computeLeaders, type Leader } from './assigneeAnalytics';
import type { DataQualityReport } from './dataQuality';

export interface SummaryInput {
  agg: Aggregates;
  values: ValueMappings;
  mapping: ColumnMapping;
  quality: DataQualityReport;
  countingRule: CountingRule;
  /** Human-readable description of active global filters (empty when none). */
  filterDescription: string;
  /** Records left out by the duplicate-review rule (only used when countingRule = 'review'). */
  reviewExcluded?: number;
  /** Overall data-quality score (0–100) when it could be calculated. */
  qualityScore?: number | null;
}

export interface Insight {
  id: string;
  title: string;
  text: string;
}

export interface ExecutiveSummary {
  headline: string;
  insights: Insight[];
  /** Counting rules and caveats that apply to every number above. */
  notes: string[];
}

function n(count: number): string {
  return formatCount(count);
}

function issues(count: number): string {
  return `${n(count)} ${count === 1 ? 'issue' : 'issues'}`;
}

function pct(count: number, total: number): string {
  return formatPercent(percentOf(count, total));
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  if (names.length > 4) return `${names.slice(0, 3).join(', ')} and ${names.length - 3} others`;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function leaderSentence(leader: Leader, noun: string): string | null {
  if (leader.count === 0 || leader.names.length === 0) return null;
  if (leader.names.length === 1) return `${leader.names[0]} has the most ${noun}, with ${n(leader.count)}.`;
  return `${joinNames(leader.names)} are tied for the most ${noun}, with ${n(leader.count)} each.`;
}

/**
 * Deterministic, rule-based executive summary. Uses only calculated values and
 * real assignee names from the data; makes no judgement about individual performance.
 */
export function generateSummary(input: SummaryInput): ExecutiveSummary {
  const { agg, values, mapping, quality } = input;
  const total = agg.total;
  const insights: Insight[] = [];
  const notes: string[] = [];
  const hasStatus = mapping.status !== null;
  const hasPriority = mapping.priority !== null;
  const hasAssignee = mapping.assignee !== null;
  const status = (label: string) => agg.statusMap[label] ?? 0;

  if (input.countingRule === 'unique') {
    notes.push(`Counts include one record per issue ID; ${n(quality.duplicateExtraRecords)} repeated-ID record(s) are excluded.`);
  } else if (input.countingRule === 'review') {
    notes.push(`Counts exclude ${n(input.reviewExcluded ?? 0)} duplicate-ID record(s) selected during duplicate review; all other imported records are included.`);
  } else if (quality.duplicateIdRecords > 0) {
    notes.push(`Counts include all imported records. ${n(quality.duplicateIdRecords)} records share an ID with another record (${n(quality.duplicateIdValues)} distinct IDs).`);
  } else {
    notes.push('Counts include all imported records.');
  }
  if (input.filterDescription) notes.push(`Global filters applied: ${input.filterDescription}.`);
  notes.push('Status figures describe the current state in the file (a snapshot), not historical trends.');

  if (total === 0) {
    return { headline: 'No issues are in the current analysis scope.', insights, notes };
  }

  let headline = `The analysis covers ${issues(total)}.`;
  if (hasStatus) {
    const closed = status('Closed');
    headline = `Out of ${issues(total)}, ${n(closed)} ${closed === 1 ? 'is' : 'are'} closed, representing ${pct(closed, total)} of the dataset.`;
    const ready = status('Ready for QA');
    const dev = status('Development in Progress');
    headline += ` ${n(ready)} ${ready === 1 ? 'issue is' : 'issues are'} ready for QA, while ${n(dev)} ${dev === 1 ? 'is' : 'are'} currently in development.`;
  }
  if (hasAssignee) {
    const top = computeLeaders(agg, [])[0];
    if (top.names.length === 1) headline += ` ${top.names[0]} has the highest assigned issue count, with ${issues(top.count)}.`;
    else if (top.names.length > 1) headline += ` ${joinNames(top.names)} share the highest assigned issue count, with ${issues(top.count)} each.`;
  }

  if (hasStatus) {
    const most = [...agg.byStatus].sort((a, b) => b.count - a.count)[0];
    if (most) {
      insights.push({ id: 'common-status', title: 'Most common status', text: `"${most.label}" is the most common status with ${issues(most.count)} (${pct(most.count, total)}).` });
    }
    insights.push({
      id: 'statuses',
      title: 'Status breakdown',
      text: `New: ${n(status('New'))}. Reopened: ${n(status('Reopened'))}. Ready for QA: ${n(status('Ready for QA'))}. Development in Progress: ${n(status('Development in Progress'))}. Closed: ${n(status('Closed'))}.`,
    });
    const closure = computeClosure(agg, values);
    if (closure.configured) {
      let text = `${issues(agg.byCategory.open)} ${agg.byCategory.open === 1 ? 'is' : 'are'} in an Open / Pending workflow state and ${n(closure.closedCount)} in a Closed state (closure rate ${formatPercent(closure.percent)}; closed statuses: ${closure.closedStatuses.join(', ')}).`;
      if (closure.unmappedCount > 0) text += ` ${issues(closure.unmappedCount)} have unclassified statuses and are counted as neither open nor closed.`;
      insights.push({ id: 'workflow', title: 'Open vs closed', text });
    } else {
      insights.push({
        id: 'workflow',
        title: 'Open vs closed',
        text: 'Closure percentage is not configured: no status has been classified as Closed. Classify statuses in Edit Mappings to enable it.',
      });
    }
  } else {
    insights.push({ id: 'no-status', title: 'Status', text: 'The status column is not mapped, so status-based insights are unavailable.' });
  }

  if (hasPriority) {
    const largest = [...agg.byPriority].sort((a, b) => b.count - a.count)[0];
    if (largest) {
      insights.push({ id: 'priority', title: 'Largest priority group', text: `${largest.label} is the largest priority group with ${issues(largest.count)} (${pct(largest.count, total)}).` });
    }
    if (values.highPriority.length > 0) {
      const group = values.highPriority;
      const count = group.reduce((s, p) => s + (agg.priorityMap[p] ?? 0), 0);
      const open = group.reduce((s, p) => s + (agg.priorityCategory[p]?.open ?? 0), 0);
      let text = `${issues(count)} ${count === 1 ? 'is' : 'are'} in the high-priority group (${group.join(', ')}).`;
      if (hasStatus && computeClosure(agg, values).configured) {
        text += ` ${n(open)} of them ${open === 1 ? 'is' : 'are'} in an open workflow state`;
        text += group.length > 1 ? ` (${group.map((p) => `${p} open: ${n(agg.priorityCategory[p]?.open ?? 0)}`).join(', ')}).` : '.';
      }
      insights.push({ id: 'high-priority', title: 'High-priority issues', text });
    }
  } else {
    insights.push({ id: 'no-priority', title: 'Priority', text: 'The priority column is not mapped, so priority insights are unavailable.' });
  }

  if (hasAssignee) {
    const leaders = computeLeaders(agg, values.highPriority);
    const people = agg.byAssignee.filter((a) => a.name !== UNASSIGNED_LABEL).length;
    insights.push({ id: 'assignees', title: 'Assignees', text: `Issues are assigned across ${n(people)} ${people === 1 ? 'person' : 'people'}.` });
    for (const leader of leaders.slice(1)) {
      const noun = leader.metric.replace(/^Most /, '');
      if (!hasStatus && /open|reopened|ready/.test(noun)) continue;
      const sentence = leaderSentence(leader, noun);
      if (sentence) insights.push({ id: `leader-${noun}`, title: leader.metric, text: sentence });
    }
    insights.push({
      id: 'unassigned',
      title: 'Unassigned issues',
      text: agg.unassigned > 0 ? `${issues(agg.unassigned)} (${pct(agg.unassigned, total)}) ${agg.unassigned === 1 ? 'has' : 'have'} no assignee.` : 'Every issue in scope has an assignee.',
    });
    notes.push('Issue counts per assignee describe workload distribution only; they are not a measure of individual performance.');
  } else {
    insights.push({ id: 'no-assignee', title: 'Assignees', text: 'The assignee column is not mapped, so workload insights are unavailable.' });
  }

  const attention = quality.rowsNeedingAttention;
  let qualityText =
    attention > 0
      ? `${n(attention)} source row(s) need data-quality attention across the full import (see the Data Quality Overview).`
      : 'No data-quality problems were detected in the import.';
  if (input.qualityScore !== undefined && input.qualityScore !== null) qualityText += ` Data-quality score: ${input.qualityScore.toFixed(0)}/100.`;
  if (hasStatus && agg.byCategory.unmapped > 0) qualityText += ` ${issues(agg.byCategory.unmapped)} in scope have unmapped statuses, so open and closed totals are provisional.`;
  insights.push({ id: 'quality', title: 'Data quality', text: qualityText });

  return { headline, insights, notes };
}

export function summaryToText(summary: ExecutiveSummary, meta: { fileName: string; generatedAt: Date }): string {
  const lines = [
    'QA Issue Analytics Dashboard — Executive Summary',
    `Source file: ${meta.fileName}`,
    `Generated: ${meta.generatedAt.toLocaleString()}`,
    '',
    summary.headline,
    '',
    'Key insights:',
    ...summary.insights.map((i) => `- ${i.title}: ${i.text}`),
    '',
    'Counting rules:',
    ...summary.notes.map((note) => `- ${note}`),
  ];
  return lines.join('\n');
}
