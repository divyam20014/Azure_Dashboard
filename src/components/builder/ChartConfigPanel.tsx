import type { ReactNode } from 'react';
import { RotateCcw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { MultiSelectFilter } from '@/components/issues/IssueFilters';
import type { FilterField } from '@/types/analytics';
import type { IssueRecord } from '@/types/issue';
import { distinctValues, FILTER_FIELD_LABELS } from '@/lib/analytics/filters';
import { CHART_TYPE_LABELS, EMPTY_FILTERS, type ChartConfig, type ChartType, type DimensionId, type MetricId, type SecondaryId, type SortOrder, type TopN } from '@/lib/charts/chartConfig';
import type { DimensionDef } from '@/lib/charts/dimensions';
import type { MetricDef } from '@/lib/charts/metrics';
import type { TypeAvailability } from '@/lib/charts/chartData';

interface Props {
  config: ChartConfig;
  onChange: (config: ChartConfig) => void;
  onReset: () => void;
  dimensions: DimensionDef[];
  metrics: MetricDef[];
  types: TypeAvailability[];
  /** Records in the dashboard scope; chart-filter options come from these real values. */
  scoped: IssueRecord[];
  filterFields: FilterField[];
  hasCreated: boolean;
}

function Field({ label, htmlFor, children, hint }: { label: string; htmlFor: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={htmlFor} className="text-xs font-semibold text-muted-foreground">
        {label}
      </label>
      {children}
      {hint && <p className="text-[11px] leading-snug text-muted-foreground">{hint}</p>}
    </div>
  );
}

const SORT_LABELS: Record<SortOrder, string> = {
  valueDesc: 'Highest value first',
  valueAsc: 'Lowest value first',
  alphaAsc: 'Alphabetical A → Z',
  alphaDesc: 'Alphabetical Z → A',
  natural: 'Configured order (priority mapping, workflow, time)',
};

/** Configuration controls for one chart. Unavailable choices stay visible but disabled, with the reason. */
export function ChartConfigPanel({ config, onChange, onReset, dimensions, metrics, types, scoped, filterFields, hasCreated }: Props) {
  const id = config.id;
  const set = (patch: Partial<ChartConfig>) => onChange({ ...config, ...patch });
  const setDisplay = (patch: Partial<ChartConfig['display']>) => onChange({ ...config, display: { ...config.display, ...patch } });
  const metric = metrics.find((m) => m.id === config.metric);
  const countMetrics = metrics.filter((m) => m.kind === 'count');
  const chartFilterCount = Object.values(config.filters.criteria).filter((v) => v && v.length).length + (config.filters.createdFrom || config.filters.createdTo ? 1 : 0);
  const typeInfo = types.find((t) => t.type === config.type);
  const isTabular = config.type === 'heatmap' || config.type === 'table';

  return (
    <div className="space-y-4" aria-label="Chart configuration">
      <Field label="A. Chart type" htmlFor={`${id}-type`} hint={typeInfo && !typeInfo.available ? <span className="text-warning">Not compatible: {typeInfo.reason}</span> : undefined}>
        <NativeSelect id={`${id}-type`} value={config.type} onChange={(e) => set({ type: e.target.value as ChartType })}>
          {types.map((t) => (
            <option key={t.type} value={t.type} disabled={!t.available && t.type !== config.type}>
              {CHART_TYPE_LABELS[t.type]}
              {!t.available ? ' — not compatible' : ''}
            </option>
          ))}
        </NativeSelect>
      </Field>

      <Field label="B. Analyze data by" htmlFor={`${id}-primary`}>
        <NativeSelect id={`${id}-primary`} value={config.primary} onChange={(e) => set({ primary: e.target.value as DimensionId, secondary: config.secondary === e.target.value ? null : config.secondary })}>
          {dimensions.map((d) => (
            <option key={d.id} value={d.id} disabled={!d.available}>
              {d.label}
              {!d.available ? ` — ${d.reason}` : ''}
            </option>
          ))}
        </NativeSelect>
      </Field>

      <Field label="C. Secondary grouping / series" htmlFor={`${id}-secondary`} hint="Optional. Creates one series per value, e.g. Assignee → Priority.">
        <NativeSelect id={`${id}-secondary`} value={config.secondary ?? ''} onChange={(e) => set({ secondary: (e.target.value || null) as SecondaryId })}>
          <option value="">None</option>
          <option value="metrics">Compare metrics (one series per metric)</option>
          {dimensions
            .filter((d) => d.id !== config.primary)
            .map((d) => (
              <option key={d.id} value={d.id} disabled={!d.available}>
                {d.label}
                {!d.available ? ` — ${d.reason}` : ''}
              </option>
            ))}
        </NativeSelect>
      </Field>

      {config.secondary === 'metrics' ? (
        <fieldset className="space-y-1">
          <legend className="text-xs font-semibold text-muted-foreground">D. Metrics to compare (issue counts)</legend>
          <div className="max-h-44 space-y-1 overflow-y-auto rounded-md border p-2">
            {countMetrics.map((m) => (
              <label key={m.id} className={`flex items-start gap-2 text-xs ${m.available ? '' : 'opacity-60'}`}>
                <Checkbox
                  className="mt-0.5"
                  disabled={!m.available}
                  checked={config.compareMetrics.includes(m.id)}
                  onChange={(e) => set({ compareMetrics: e.target.checked ? [...config.compareMetrics, m.id] : config.compareMetrics.filter((x) => x !== m.id) })}
                  aria-label={`Compare ${m.label}`}
                />
                <span>
                  {m.label}
                  {!m.available && <span className="block text-muted-foreground">{m.reason}</span>}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : (
        <Field label="D. Metric / value" htmlFor={`${id}-metric`} hint={metric ? metric.explanation : undefined}>
          <NativeSelect id={`${id}-metric`} value={config.metric} onChange={(e) => set({ metric: e.target.value as MetricId })}>
            {metrics.map((m) => (
              <option key={m.id} value={m.id} disabled={!m.available}>
                {m.label}
                {!m.available ? ` — ${m.reason}` : ''}
              </option>
            ))}
          </NativeSelect>
        </Field>
      )}

      <fieldset className="space-y-2">
        <legend className="flex w-full items-center justify-between text-xs font-semibold text-muted-foreground">
          <span>E. Chart filters {chartFilterCount > 0 && `(${chartFilterCount} active)`}</span>
          {chartFilterCount > 0 && (
            <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[11px]" onClick={() => set({ filters: EMPTY_FILTERS })}>
              <X /> Clear chart filters
            </Button>
          )}
        </legend>
        <p className="text-[11px] text-muted-foreground">Apply to this chart only — the dashboard&apos;s global filters are not changed.</p>
        <div className="flex flex-wrap gap-1.5">
          {filterFields.map((f) => (
            <MultiSelectFilter
              key={f}
              field={f}
              options={distinctValues(scoped, f)}
              selected={config.filters.criteria[f] ?? []}
              onChange={(v) => set({ filters: { ...config.filters, criteria: { ...config.filters.criteria, [f]: v } } })}
              ariaLabel={`Chart filter: ${FILTER_FIELD_LABELS[f]}`}
            />
          ))}
        </div>
        {hasCreated && (
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] text-muted-foreground">
              Created from
              <Input type="date" className="mt-0.5 h-8" value={config.filters.createdFrom} onChange={(e) => set({ filters: { ...config.filters, createdFrom: e.target.value } })} aria-label="Chart filter: created from" />
            </label>
            <label className="text-[11px] text-muted-foreground">
              Created to
              <Input type="date" className="mt-0.5 h-8" value={config.filters.createdTo} onChange={(e) => set({ filters: { ...config.filters, createdTo: e.target.value } })} aria-label="Chart filter: created to" />
            </label>
          </div>
        )}
      </fieldset>

      <div className="grid grid-cols-2 gap-2">
        <Field label="F. Sort" htmlFor={`${id}-sort`}>
          <NativeSelect id={`${id}-sort`} value={config.sort} onChange={(e) => set({ sort: e.target.value as SortOrder })}>
            {(Object.keys(SORT_LABELS) as SortOrder[]).map((s) => (
              <option key={s} value={s}>
                {SORT_LABELS[s]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Categories shown" htmlFor={`${id}-topn`} hint="Display limit only.">
          <NativeSelect id={`${id}-topn`} value={String(config.display.topN)} onChange={(e) => setDisplay({ topN: (e.target.value === 'all' ? 'all' : Number(e.target.value)) as TopN })}>
            <option value="5">Top 5</option>
            <option value="10">Top 10</option>
            <option value="20">Top 20</option>
            <option value="all">All</option>
          </NativeSelect>
        </Field>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-xs font-semibold text-muted-foreground">G. Display</legend>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
          {(
            [
              ['dataLabels', 'Data labels'],
              ['legend', 'Legend'],
              ['gridlines', 'Gridlines'],
              ['percentages', 'Percentages'],
              ['showOther', 'Group rest as "Other"'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className={`flex items-center gap-2 ${isTabular && key !== 'showOther' ? 'opacity-50' : ''}`}>
              <Checkbox checked={config.display[key]} disabled={isTabular && key !== 'showOther'} onChange={(e) => setDisplay({ [key]: e.target.checked })} />
              {label}
            </label>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Number format" htmlFor={`${id}-numfmt`}>
            <NativeSelect id={`${id}-numfmt`} value={config.display.numberFormat} onChange={(e) => setDisplay({ numberFormat: e.target.value as 'exact' | 'compact' })}>
              <option value="exact">Exact (1,234)</option>
              <option value="compact">Compact (1.2K)</option>
            </NativeSelect>
          </Field>
          <Field label="Chart size" htmlFor={`${id}-size`}>
            <NativeSelect id={`${id}-size`} value={config.display.size} onChange={(e) => setDisplay({ size: e.target.value as 'compact' | 'standard' | 'expanded' })}>
              <option value="compact">Compact</option>
              <option value="standard">Standard</option>
              <option value="expanded">Expanded</option>
            </NativeSelect>
          </Field>
        </div>
        <Field label="Chart title" htmlFor={`${id}-title`}>
          <Input id={`${id}-title`} className="h-8" placeholder="Automatic" value={config.title} onChange={(e) => set({ title: e.target.value })} />
        </Field>
        <Field label="Subtitle" htmlFor={`${id}-subtitle`}>
          <Input id={`${id}-subtitle`} className="h-8" placeholder="Automatic (metric and filters)" value={config.subtitle} onChange={(e) => set({ subtitle: e.target.value })} />
        </Field>
      </fieldset>

      <Button size="sm" variant="outline" onClick={onReset}>
        <RotateCcw /> Reset chart configuration
      </Button>
    </div>
  );
}
