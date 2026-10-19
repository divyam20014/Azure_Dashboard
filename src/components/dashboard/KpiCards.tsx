import { CheckCircle2, FlaskConical, HelpCircle, Layers, RotateCcw, Sparkles, UserX, Wrench, type LucideIcon } from 'lucide-react';
import type { Criteria } from '@/types/analytics';
import { UNASSIGNED_LABEL } from '@/types/issue';
import type { KpiKey, Kpi } from '@/lib/analytics/statusAnalytics';
import { formatCount, formatPercent } from '@/lib/text';
import { cn } from '@/lib/utils';
import { UNASSIGNED_COLOR, UNMAPPED_COLOR } from '@/lib/normalization/statusNormalizer';
import { useDashboard } from './DashboardContext';

const ICONS: Record<KpiKey, LucideIcon> = {
  total: Layers,
  closed: CheckCircle2,
  new: Sparkles,
  reopened: RotateCcw,
  readyForQa: FlaskConical,
  devInProgress: Wrench,
  other: HelpCircle,
  unassigned: UserX,
};

const STATUS_FOR_KPI: Partial<Record<KpiKey, string>> = {
  closed: 'Closed',
  new: 'New',
  reopened: 'Reopened',
  readyForQa: 'Ready for QA',
  devInProgress: 'Development in Progress',
};

function subtitle(kpi: Kpi): string {
  if (kpi.key === 'total') return 'Records in the current scope';
  if (kpi.key === 'other') return kpi.statuses && kpi.statuses.length > 0 ? `${kpi.statuses.length} other status value(s)` : 'No other statuses';
  if (kpi.key === 'unassigned') return 'Blank or placeholder assignee';
  return `Status = ${STATUS_FOR_KPI[kpi.key]}`;
}

export function KpiCards() {
  const { analytics, dataset, select, isSelected, filters } = useDashboard();
  const colors = analytics.colors.status;
  const statusMapped = dataset.config.columnMapping.status !== null;
  const assigneeMapped = dataset.config.columnMapping.assignee !== null;

  const colorFor = (kpi: Kpi): string => {
    if (kpi.key === 'total') return 'hsl(var(--primary))';
    if (kpi.key === 'other') return UNMAPPED_COLOR;
    if (kpi.key === 'unassigned') return UNASSIGNED_COLOR;
    return colors[STATUS_FOR_KPI[kpi.key]!] ?? UNMAPPED_COLOR;
  };

  const criteriaFor = (kpi: Kpi): Criteria | null => {
    if (kpi.key === 'total') return null;
    if (kpi.key === 'unassigned') return { assignee: [UNASSIGNED_LABEL] };
    return kpi.statuses && kpi.statuses.length > 0 ? { status: kpi.statuses } : { status: ['__none__'] };
  };

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8" role="list" aria-label="Key metrics">
      {analytics.kpis.map((kpi) => {
        const Icon = ICONS[kpi.key];
        const source = `kpi:${kpi.key}`;
        const active = isSelected(source);
        const unavailable = (kpi.key !== 'total' && kpi.key !== 'unassigned' && !statusMapped) || (kpi.key === 'unassigned' && !assigneeMapped);
        const criteria = criteriaFor(kpi);
        const color = colorFor(kpi);
        return (
          <button
            key={kpi.key}
            type="button"
            role="listitem"
            disabled={unavailable}
            aria-pressed={active}
            data-testid={`kpi-${kpi.key}`}
            onClick={() => {
              if (!criteria) filters.clearSelection();
              else select(source, kpi.label, criteria);
            }}
            className={cn(
              'group relative flex min-w-0 flex-col gap-1 overflow-hidden rounded-lg border bg-card p-3 text-left shadow-sm transition-all print-avoid-break',
              'hover:-translate-y-px hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0',
              active && 'ring-2 ring-primary',
            )}
          >
            <span className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: color }} aria-hidden />
            <div className="flex items-start justify-between gap-2 pt-1">
              <span className="text-xs font-medium leading-tight text-muted-foreground">{kpi.label}</span>
              <span className="rounded-md p-1" style={{ backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)` }}>
                <Icon className="h-4 w-4" style={{ color }} aria-hidden />
              </span>
            </div>
            <span className="tabular text-2xl font-semibold tracking-tight" data-testid={`kpi-${kpi.key}-count`}>
              {unavailable ? '—' : formatCount(kpi.count)}
            </span>
            <span className="text-xs text-muted-foreground">
              {unavailable ? 'Column not mapped' : kpi.key === 'total' ? subtitle(kpi) : `${formatPercent(kpi.percent)} of total · ${subtitle(kpi)}`}
            </span>
          </button>
        );
      })}
    </div>
  );
}
