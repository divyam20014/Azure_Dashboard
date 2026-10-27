import { useMemo } from 'react';
import { Plus } from 'lucide-react';
import { Section, EmptyState } from '@/components/common/Common';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/select';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import { useAvailableFilterFields } from '@/components/issues/IssueFilters';
import { availableDimensions } from '@/lib/charts/dimensions';
import { metricDefinitions } from '@/lib/charts/metrics';
import { defaultChartConfig, newChartId } from '@/lib/charts/chartConfig';
import { buildChartData } from '@/lib/charts/chartData';
import { CHART_PRESETS, configFromPreset } from '@/lib/charts/presets';
import { ChartBuilderCard } from './ChartBuilderCard';

/**
 * Custom Chart Builder: any number of independently configured charts, all produced by
 * one engine (lib/charts) from the same in-memory dataset and dashboard scope.
 */
export function ChartBuilderSection() {
  const { dataset, settings, analytics } = useDashboard();
  const charts = settings.settings.charts;
  const dimensions = useMemo(() => availableDimensions(dataset), [dataset]);
  const metrics = useMemo(() => metricDefinitions(dataset), [dataset]);
  const filterFields = useAvailableFilterFields();
  const firstDim = dimensions.find((d) => d.available)?.id ?? 'assignee';
  // Only offer presets whose groupings and metric exist in this dataset.
  const presets = useMemo(() => {
    const ctx = { dataset, metrics, dimensions };
    return CHART_PRESETS.filter((pr) => buildChartData(analytics.scoped.slice(0, 1), configFromPreset(pr), ctx).status !== 'invalid');
  }, [dataset, metrics, dimensions, analytics.scoped]);
  const groups = ['Assignee', 'Priority', 'State'] as const;

  const addBlank = () => settings.addChart(defaultChartConfig(dimensions.find((d) => d.id === 'assignee')?.available ? 'assignee' : firstDim));
  const addPreset = (id: string) => {
    const preset = CHART_PRESETS.find((p) => p.id === id);
    if (preset) settings.addChart(configFromPreset(preset));
  };

  return (
    <Section
      id="builder"
      title="Custom Chart Builder"
      description="Build your own charts: choose a chart type, what to analyze (e.g. Assignee → Priority), a metric, chart-only filters and display options. Every chart uses the same calculations as the dashboard."
      collapsible
      collapsedSummary={`${charts.length} custom chart(s)`}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <NativeSelect aria-label="Add a chart from a ready-made view" className="w-72" value="" onChange={(e) => e.target.value && addPreset(e.target.value)}>
            <option value="">Add from a ready-made view…</option>
            {groups.map((g) => (
              <optgroup key={g} label={`${g}-wise`}>
                {presets
                  .filter((p) => p.group === g)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
              </optgroup>
            ))}
          </NativeSelect>
          <Button size="sm" onClick={addBlank}>
            <Plus /> Add chart
          </Button>
        </div>
      }
    >
      {charts.length === 0 ? (
        <EmptyState title="No custom charts yet">
          Use <b>Add chart</b> for a blank chart (issue count per assignee) or pick a ready-made assignee-, priority- or state-wise view. Charts are kept for this session only.
        </EmptyState>
      ) : (
        <div className="space-y-4">
          {charts.map((c, i) => (
            <ChartBuilderCard
              key={c.id}
              config={c}
              index={i}
              count={charts.length}
              dimensions={dimensions}
              metrics={metrics}
              filterFields={filterFields}
              onReset={() => settings.updateChart({ ...defaultChartConfig(c.primary), id: c.id ?? newChartId() })}
            />
          ))}
        </div>
      )}
    </Section>
  );
}
