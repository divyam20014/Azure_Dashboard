import type { ReactNode } from 'react';
import { AlertOctagon, CheckCircle2, FlaskConical, Gauge, HelpCircle, Layers, ListTodo, Percent, RotateCcw, ShieldCheck, UserX, type LucideIcon } from 'lucide-react';
import { UNASSIGNED_LABEL } from '@/types/issue';
import type { Criteria } from '@/types/analytics';
import { formatCount, formatPercent } from '@/lib/text';
import { cn } from '@/lib/utils';
import { CATEGORY_COLORS, UNASSIGNED_COLOR, UNMAPPED_COLOR } from '@/lib/normalization/statusNormalizer';
import { Badge } from '@/components/ui/badge';
import { useDashboard } from './DashboardContext';

interface CardProps {
  id: string;
  label: string;
  value: ReactNode;
  lines: ReactNode[];
  icon: LucideIcon;
  color: string;
  active: boolean;
  unavailable?: boolean;
  badge?: ReactNode;
  onClick: () => void;
  actionLabel: string;
}

function KpiCard({ id, label, value, lines, icon: Icon, color, active, unavailable, badge, onClick, actionLabel }: CardProps) {
  return (
    <button
      type="button"
      role="listitem"
      disabled={unavailable}
      aria-pressed={active}
      aria-label={`${label}: ${typeof value === 'string' || typeof value === 'number' ? value : ''}. ${actionLabel}`}
      data-testid={`kpi-${id}`}
      onClick={onClick}
      className={cn(
        'group relative flex min-w-0 flex-col gap-1 overflow-hidden rounded-lg border bg-card p-3 text-left shadow-sm transition-all print-avoid-break',
        'hover:-translate-y-px hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0',
        active && 'ring-2 ring-primary',
      )}
    >
      <span className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: color }} aria-hidden />
      <div className="flex items-start justify-between gap-2 pt-1">
        <span className="text-xs font-medium leading-tight text-muted-foreground">{label}</span>
        <span className="rounded-md p-1" style={{ backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)` }}>
          <Icon className="h-4 w-4" style={{ color }} aria-hidden />
        </span>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="tabular text-2xl font-semibold tracking-tight" data-testid={`kpi-${id}-count`}>
          {value}
        </span>
        {badge}
      </div>
      {lines.filter(Boolean).map((line, i) => (
        <span key={i} className="text-xs leading-snug text-muted-foreground">
          {line}
        </span>
      ))}
    </button>
  );
}

function list(values: string[], empty = 'none configured'): string {
  if (values.length === 0) return empty;
  return values.length > 3 ? `${values.slice(0, 3).join(', ')} +${values.length - 3}` : values.join(', ');
}

/** Executive KPI cards. Every card filters the issue register; clicking again removes the filter. */
export function KpiCards() {
  const { analytics, dataset, select, selectRecords, isSelected, filters } = useDashboard();
  const m = analytics.executive;
  const s = m.scopes;
  const colors = analytics.colors.status;
  const pctOf = (p: number | null) => `${formatPercent(p)} of ${formatCount(s.inScope)}${s.filtered ? ' filtered' : ''}`;
  const toggle = (id: string, label: string, criteria: Criteria) => select(`kpi:${id}`, label, criteria);
  const scrollToQuality = () => document.getElementById('quality')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const statusOff = !m.statusMapped;

  const cards: CardProps[] = [
    {
      id: 'total',
      label: 'Total Issues',
      value: formatCount(s.inScope),
      lines: [
        `${formatCount(s.imported)} rows imported · ${formatCount(s.valid)} valid records`,
        s.excluded > 0 ? `${formatCount(s.included)} in analytics · ${formatCount(s.excluded)} excluded by duplicate rule` : `${formatCount(s.included)} in analytics`,
        s.filtered ? `Filtered view: ${formatCount(s.inScope)} of ${formatCount(s.included)}` : null,
      ],
      icon: Layers,
      color: 'hsl(var(--primary))',
      active: filters.state.selection === null,
      onClick: () => filters.clearSelection(),
      actionLabel: 'Show all records in the register.',
    },
    {
      id: 'closed',
      label: 'Closed Issues',
      value: statusOff ? '—' : formatCount(m.closed.count),
      lines: statusOff ? ['Status column not mapped'] : [pctOf(m.closed.percent), `Closed statuses: ${list(m.closed.statuses)}`],
      icon: CheckCircle2,
      color: CATEGORY_COLORS.closed,
      active: isSelected('kpi:closed'),
      unavailable: statusOff,
      onClick: () => toggle('closed', 'Closed (workflow)', { category: ['closed'] }),
      actionLabel: 'Filter the register to closed issues.',
    },
    {
      id: 'closureRate',
      label: 'Closure Rate (current state)',
      value: statusOff ? '—' : !m.closureRate.configured ? 'Not configured' : s.inScope === 0 ? 'N/A' : formatPercent(m.closureRate.percent),
      badge: m.closureRate.configured && m.closureRate.provisional ? <Badge variant="warning">Provisional</Badge> : undefined,
      lines: statusOff
        ? ['Status column not mapped']
        : !m.closureRate.configured
          ? ['No status is classified as Closed']
          : [
              `Closed ÷ issues in scope · snapshot, not a trend`,
              m.closureRate.provisional ? `${formatCount(m.closureRate.unmapped)} record(s) have unmapped statuses` : null,
            ],
      icon: Percent,
      color: CATEGORY_COLORS.closed,
      active: isSelected('kpi:closureRate'),
      unavailable: statusOff,
      onClick: () => toggle('closureRate', 'Closed (workflow)', { category: ['closed'] }),
      actionLabel: 'Filter the register to closed issues.',
    },
    {
      id: 'openBacklog',
      label: 'Open Backlog',
      value: statusOff ? '—' : formatCount(m.openBacklog.count),
      lines: statusOff ? ['Status column not mapped'] : [pctOf(m.openBacklog.percent), `Open statuses: ${list(m.openBacklog.statuses)}`],
      icon: ListTodo,
      color: CATEGORY_COLORS.open,
      active: isSelected('kpi:openBacklog'),
      unavailable: statusOff,
      onClick: () => toggle('openBacklog', 'Open backlog', { category: ['open'] }),
      actionLabel: 'Filter the register to open issues.',
    },
    {
      id: 'highPriority',
      label: `${m.highPriorityOpen.group.join(' + ') || 'High-priority'} Open Backlog`,
      value: !m.priorityMapped || statusOff ? '—' : m.highPriorityOpen.configured ? formatCount(m.highPriorityOpen.count) : 'Not configured',
      badge: m.highPriorityOpen.numericConvention ? <Badge variant="warning">Check convention</Badge> : undefined,
      lines: !m.priorityMapped
        ? ['Priority column not mapped']
        : statusOff
          ? ['Status column not mapped']
          : m.highPriorityOpen.configured
            ? [m.highPriorityOpen.levels.map((l) => `${l.label}: ${formatCount(l.count)}`).join(' · '), pctOf(m.highPriorityOpen.percent)]
            : ['Choose the high-priority group in Edit Mappings'],
      icon: AlertOctagon,
      color: '#d03b3b',
      active: isSelected('kpi:highPriority'),
      unavailable: !m.priorityMapped || statusOff || !m.highPriorityOpen.configured,
      onClick: () => toggle('highPriority', `${m.highPriorityOpen.group.join(' + ')} open`, { priority: m.highPriorityOpen.group, category: ['open'] }),
      actionLabel: 'Filter the register to open high-priority issues.',
    },
    {
      id: 'reopened',
      label: 'Reopened Issues',
      value: statusOff ? '—' : formatCount(m.reopened.count),
      lines: statusOff ? ['Status column not mapped'] : [pctOf(m.reopened.percent), m.reopened.mapped ? 'Currently in Reopened state (not reopen history)' : 'No status is mapped to Reopened'],
      icon: RotateCcw,
      color: colors['Reopened'] ?? UNMAPPED_COLOR,
      active: isSelected('kpi:reopened'),
      unavailable: statusOff,
      onClick: () => toggle('reopened', 'Reopened', { status: ['Reopened'] }),
      actionLabel: 'Filter the register to reopened issues.',
    },
    {
      id: 'readyForQa',
      label: 'Ready for QA',
      value: statusOff ? '—' : formatCount(m.readyForQa.count),
      lines: statusOff ? ['Status column not mapped'] : [pctOf(m.readyForQa.percent), m.readyForQa.mapped ? 'QA-ready queue' : 'No status is mapped to Ready for QA'],
      icon: FlaskConical,
      color: colors['Ready for QA'] ?? UNMAPPED_COLOR,
      active: isSelected('kpi:readyForQa'),
      unavailable: statusOff,
      onClick: () => toggle('readyForQa', 'Ready for QA', { status: ['Ready for QA'] }),
      actionLabel: 'Filter the register to the QA-ready queue.',
    },
    {
      id: 'unassigned',
      label: 'Unassigned Issues',
      value: m.assigneeMapped ? formatCount(m.unassigned.count) : '—',
      lines: m.assigneeMapped ? [pctOf(m.unassigned.percent), 'Blank or placeholder assignee'] : ['Assignee column not mapped'],
      icon: UserX,
      color: UNASSIGNED_COLOR,
      active: isSelected('kpi:unassigned'),
      unavailable: !m.assigneeMapped,
      onClick: () => toggle('unassigned', 'Unassigned', { assignee: [UNASSIGNED_LABEL] }),
      actionLabel: 'Filter the register to unassigned issues.',
    },
  ];

  if (m.blocked.mapped) {
    cards.push({
      id: 'blocked',
      label: 'Blocked Issues',
      value: formatCount(m.blocked.count),
      lines: [pctOf(m.blocked.percent), 'Normalized status = Blocked'],
      icon: AlertOctagon,
      color: colors['Blocked'] ?? '#be123c',
      active: isSelected('kpi:blocked'),
      onClick: () => toggle('blocked', 'Blocked', { status: ['Blocked'] }),
      actionLabel: 'Filter the register to blocked issues.',
    });
  }
  if (m.statusMapped && m.unmappedStatus.count > 0) {
    cards.push({
      id: 'unmapped',
      label: 'Unmapped Statuses',
      value: formatCount(m.unmappedStatus.count),
      lines: [pctOf(m.unmappedStatus.percent), `Not open or closed: ${list(m.unmappedStatus.values, '—')}`],
      icon: HelpCircle,
      color: UNMAPPED_COLOR,
      active: isSelected('kpi:unmapped'),
      onClick: () => toggle('unmapped', 'Unmapped status', { category: ['unmapped'] }),
      actionLabel: 'Filter the register to records with unmapped statuses.',
    });
  }
  const score = analytics.qualityScore;
  cards.push({
    id: 'quality',
    label: 'Data-Quality Score',
    value: score.overall === null ? 'N/A' : `${score.overall.toFixed(0)}/100`,
    lines: [`${score.passed} rules passed · ${score.warnings} warnings · ${score.errors} errors`, 'All valid records · see Data Quality'],
    icon: score.overall !== null && score.overall >= 90 ? ShieldCheck : Gauge,
    color: score.overall === null ? UNMAPPED_COLOR : score.overall >= 98 ? CATEGORY_COLORS.closed : score.overall >= 90 ? '#c98500' : '#d03b3b',
    active: false,
    onClick: scrollToQuality,
    actionLabel: 'Go to the Data Quality section.',
  });

  // Compact snapshot of the remaining workflow stages (kept from the earlier KPI row).
  const stages = [
    { id: 'new', label: 'New', metric: m.newIssues, criteria: { status: ['New'] } },
    { id: 'devInProgress', label: 'Development in Progress', metric: m.devInProgress, criteria: { status: ['Development in Progress'] } },
    { id: 'other', label: 'Other statuses', metric: m.otherStatuses, criteria: { status: m.otherStatuses.statuses.length ? m.otherStatuses.statuses : ['__none__'] } },
  ];

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6" role="list" aria-label="Executive KPIs">
        {cards.map((c) => (
          <KpiCard key={c.id} {...c} />
        ))}
      </div>
      {m.statusMapped && (
        <div className="flex flex-wrap items-center gap-2 text-xs" aria-label="Workflow snapshot">
          <span className="text-muted-foreground">Workflow snapshot:</span>
          {stages.map((st) => (
            <button
              key={st.id}
              type="button"
              data-testid={`kpi-${st.id}`}
              aria-pressed={isSelected(`kpi:${st.id}`)}
              onClick={() => (st.id === 'other' && !m.otherStatuses.statuses.length ? undefined : select(`kpi:${st.id}`, st.label, st.criteria))}
              className={cn('inline-flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 hover:bg-secondary', isSelected(`kpi:${st.id}`) && 'ring-2 ring-primary')}
            >
              <span className="h-2 w-2 rounded-sm" style={{ background: colors[st.label] ?? UNMAPPED_COLOR }} aria-hidden />
              {st.label}
              <b className="tabular" data-testid={`kpi-${st.id}-count`}>
                {formatCount(st.metric.count)}
              </b>
              <span className="text-muted-foreground">({formatPercent(st.metric.percent)})</span>
            </button>
          ))}
          {dataset.config.columnMapping.created !== null && analytics.aging.available && (
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 hover:bg-secondary"
              onClick={() => {
                const last = analytics.aging.buckets[analytics.aging.buckets.length - 1];
                selectRecords('kpi:aging-oldest', `Open, age ${last.label}`, last.indexes);
              }}
            >
              Oldest open issue: <b className="tabular">{analytics.aging.oldestDays ?? '—'} days</b> since creation
            </button>
          )}
        </div>
      )}
    </div>
  );
}
