import { useMemo } from 'react';
import { ArrowRight, Ban } from 'lucide-react';
import { Section, Panel, EmptyState } from '@/components/common/Common';
import { SimpleBarChart } from '@/components/charts/SimpleBarChart';
import { computeHandoffStages } from '@/lib/analytics/statusAnalytics';
import { UNMAPPED_COLOR } from '@/lib/normalization/statusNormalizer';
import { formatCount, formatPercent, percentOf } from '@/lib/text';
import { useDashboard } from './DashboardContext';

const NOT_DERIVABLE = [
  'Time an issue has spent in development',
  'Time an issue has waited for QA',
  'How many times an issue was reopened historically',
  'Developer productivity',
  'QA turnaround time',
];

export function HandoffAnalytics() {
  const { analytics, dataset, select } = useDashboard();
  const { agg, colors } = analytics;
  const stages = useMemo(() => computeHandoffStages(agg), [agg]);

  if (dataset.config.columnMapping.status === null) {
    return (
      <Section id="handoff" title="Development and QA Handoff">
        <EmptyState title="Status column not mapped">Map a Status column to see workflow stage volumes.</EmptyState>
      </Section>
    );
  }

  const pipeline = stages.filter((s) => s.label !== 'Other statuses');
  const selectStage = (label: string) => {
    const stage = stages.find((s) => s.label === label);
    if (stage && stage.statuses.length) select(`stage:${label}`, `Stage = ${label}`, { status: stage.statuses });
  };

  return (
    <Section id="handoff" title="Development and QA Handoff" description="Volume of work currently at each configured workflow stage.">
      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <Panel title="Issues by workflow stage" description="Click a stage to list its issues.">
          <div className="mb-4 flex flex-wrap items-center gap-1.5" aria-label="Workflow pipeline">
            {pipeline.map((s, i) => (
              <div key={s.label} className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => selectStage(s.label)}
                  className="rounded-md border px-2.5 py-1.5 text-left hover:bg-secondary"
                  style={{ borderLeft: `4px solid ${colors.status[s.statuses[0]] ?? UNMAPPED_COLOR}` }}
                >
                  <span className="block text-[11px] text-muted-foreground">{s.label}</span>
                  <span className="tabular block text-base font-semibold">{formatCount(s.count)}</span>
                </button>
                {i < pipeline.length - 1 && <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />}
              </div>
            ))}
          </div>
          <SimpleBarChart
            items={stages.map((s) => ({ label: s.label, value: s.count, color: s.label === 'Other statuses' ? UNMAPPED_COLOR : (colors.status[s.statuses[0]] ?? UNMAPPED_COLOR) }))}
            total={agg.total}
            onSelect={selectStage}
            ariaLabel="Bar chart of issues per workflow stage"
          />
          <p className="mt-2 text-xs text-muted-foreground">
            Work waiting on QA: <b>{formatCount(stages[2].count)}</b> ({formatPercent(percentOf(stages[2].count, agg.total))}) · In development:{' '}
            <b>{formatCount(stages[1].count)}</b> ({formatPercent(percentOf(stages[1].count, agg.total))})
          </p>
        </Panel>
        <Panel title="Time-based metrics" description="A spreadsheet of current states cannot support these measures.">
          <ul className="space-y-2">
            {NOT_DERIVABLE.map((metric) => (
              <li key={metric} className="flex items-start justify-between gap-3 rounded-md border px-3 py-2 text-sm">
                <span>{metric}</span>
                <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground">
                  <Ban className="h-3.5 w-3.5" aria-hidden /> Insufficient data
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            These require status-transition history (timestamps of each state change). The uploaded file only records each issue&apos;s current state, so no estimates are shown.
          </p>
        </Panel>
      </div>
    </Section>
  );
}
