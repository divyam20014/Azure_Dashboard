import type { Aggregates } from '@/types/analytics';
import type { ValueMappings } from '@/types/mappings';
import { percentOf } from '@/lib/text';
import { CORE_STATUSES, isCoreStatus } from '@/lib/normalization/statusNormalizer';

export type KpiKey = 'total' | 'closed' | 'new' | 'reopened' | 'readyForQa' | 'devInProgress' | 'other' | 'unassigned';

export interface Kpi {
  key: KpiKey;
  label: string;
  count: number;
  percent: number | null;
  /** Status labels this KPI covers (for filtering). */
  statuses?: string[];
}

const CORE_KPI: { key: KpiKey; status: (typeof CORE_STATUSES)[number]; label: string }[] = [
  { key: 'closed', status: 'Closed', label: 'Closed Issues' },
  { key: 'new', status: 'New', label: 'New Issues' },
  { key: 'reopened', status: 'Reopened', label: 'Reopened Issues' },
  { key: 'readyForQa', status: 'Ready for QA', label: 'Ready for QA' },
  { key: 'devInProgress', status: 'Development in Progress', label: 'Development in Progress' },
];

/** Status labels that are not one of the five core statuses. */
export function otherStatuses(agg: Aggregates): string[] {
  return agg.byStatus.filter((s) => !isCoreStatus(s.label)).map((s) => s.label);
}

export function computeKpis(agg: Aggregates): Kpi[] {
  const total = agg.total;
  const kpis: Kpi[] = [{ key: 'total', label: 'Total Issues', count: total, percent: total ? 100 : null }];
  for (const c of CORE_KPI) {
    const count = agg.statusMap[c.status] ?? 0;
    kpis.push({ key: c.key, label: c.label, count, percent: percentOf(count, total), statuses: [c.status] });
  }
  const others = otherStatuses(agg);
  const otherCount = others.reduce((sum, s) => sum + (agg.statusMap[s] ?? 0), 0);
  kpis.push({ key: 'other', label: 'Other / Unmapped Statuses', count: otherCount, percent: percentOf(otherCount, total), statuses: others });
  kpis.push({ key: 'unassigned', label: 'Unassigned Issues', count: agg.unassigned, percent: percentOf(agg.unassigned, total) });
  return kpis;
}

export interface ClosureInfo {
  /** null when no status has been classified as Closed. */
  percent: number | null;
  closedCount: number;
  closedStatuses: string[];
  unmappedCount: number;
  configured: boolean;
}

/** Closure % = records in the Closed workflow category / total in scope. */
export function computeClosure(agg: Aggregates, values: ValueMappings): ClosureInfo {
  const closedStatuses = [...new Set(Object.values(values.status).filter((r) => r.category === 'closed').map((r) => r.label))];
  const configured = closedStatuses.length > 0;
  return {
    percent: configured ? percentOf(agg.byCategory.closed, agg.total) : null,
    closedCount: agg.byCategory.closed,
    closedStatuses,
    unmappedCount: agg.byCategory.unmapped,
    configured,
  };
}

/** Workflow categories the user has actually configured (at least one status assigned). */
export function configuredCategories(values: ValueMappings): { closed: boolean; open: boolean } {
  const rules = Object.values(values.status);
  return { closed: rules.some((r) => r.category === 'closed'), open: rules.some((r) => r.category === 'open') };
}

export interface HandoffStage {
  label: string;
  count: number;
  statuses: string[];
}

/** Workflow stage volumes for the Development and QA handoff view. */
export function computeHandoffStages(agg: Aggregates): HandoffStage[] {
  const stage = (label: string, status: string): HandoffStage => ({ label, count: agg.statusMap[status] ?? 0, statuses: [status] });
  const others = otherStatuses(agg);
  return [
    stage('New', 'New'),
    stage('Development in Progress', 'Development in Progress'),
    stage('Ready for QA', 'Ready for QA'),
    stage('Reopened', 'Reopened'),
    stage('Closed', 'Closed'),
    { label: 'Other statuses', count: others.reduce((s, l) => s + (agg.statusMap[l] ?? 0), 0), statuses: others },
  ];
}
