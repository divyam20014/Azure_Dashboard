import { useMemo, useState } from 'react';
import { ChevronDown, Filter, Layers, X } from 'lucide-react';
import type { CountingRule, FilterField } from '@/types/analytics';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { NativeSelect } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { ScrubOnUnmount } from '@/components/common/ScrubOnUnmount';
import { applyCountingRule, displayFilterValue, distinctValues, FILTER_FIELD_LABELS, FILTER_FIELDS } from '@/lib/analytics/filters';
import { formatCount } from '@/lib/text';
import { cn } from '@/lib/utils';
import { useDashboard } from '@/components/dashboard/DashboardContext';

const MAX_OPTIONS = 300;

function MultiSelectFilter({ field, options, selected, onChange }: { field: FilterField; options: { value: string; count: number }[]; selected: string[]; onChange: (v: string[]) => void }) {
  const [query, setQuery] = useState('');
  const filtered = query ? options.filter((o) => displayFilterValue(field, o.value).toLowerCase().includes(query.toLowerCase())) : options;
  const toggle = (value: string) => onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  const label = FILTER_FIELD_LABELS[field];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={cn('h-8', selected.length > 0 && 'border-primary text-primary')} aria-label={`Filter by ${label}`}>
          {label}
          {selected.length > 0 && <Badge className="px-1.5 py-0">{selected.length}</Badge>}
          <ChevronDown className="opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0">
        <ScrubOnUnmount>
          <div className="border-b p-2">
            <Input autoFocus placeholder={`Search ${label.toLowerCase()}…`} className="h-8" value={query} onChange={(e) => setQuery(e.target.value)} aria-label={`Search ${label}`} />
          </div>
          <div className="max-h-72 overflow-y-auto p-1" role="group" aria-label={`${label} options`}>
            {filtered.slice(0, MAX_OPTIONS).map((o) => (
              <label key={o.value} className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-secondary">
                <Checkbox checked={selected.includes(o.value)} onChange={() => toggle(o.value)} />
                <span className="min-w-0 flex-1 truncate" title={displayFilterValue(field, o.value)}>
                  {displayFilterValue(field, o.value)}
                </span>
                <span className="tabular text-xs text-muted-foreground">{formatCount(o.count)}</span>
              </label>
            ))}
            {filtered.length > MAX_OPTIONS && <p className="px-2 py-1.5 text-xs text-muted-foreground">Showing {MAX_OPTIONS} of {filtered.length}. Refine the search to see more.</p>}
            {filtered.length === 0 && <p className="px-2 py-3 text-center text-xs text-muted-foreground">No matching values</p>}
          </div>
          {selected.length > 0 && (
            <div className="border-t p-1">
              <Button variant="ghost" size="sm" className="w-full" onClick={() => onChange([])}>
                Clear {label.toLowerCase()} filter
              </Button>
            </div>
          )}
        </ScrubOnUnmount>
      </PopoverContent>
    </Popover>
  );
}

/** Global filters (affect every section) plus the register-only chart selection, both always visible. */
export function IssueFilters() {
  const { dataset, filters, analytics } = useDashboard();
  const { state } = filters;
  const m = dataset.config.columnMapping;
  const base = useMemo(() => applyCountingRule(dataset.records, state.countingRule), [dataset.records, state.countingRule]);

  const available: FilterField[] = FILTER_FIELDS.filter((f) => {
    if (f === 'category') return m.status !== null;
    return m[f] !== null;
  });
  const options = useMemo(() => Object.fromEntries(available.map((f) => [f, distinctValues(base, f)])) as Record<FilterField, { value: string; count: number }[]>, [base, available.join()]);

  const chips = FILTER_FIELDS.flatMap((f) => (state.global[f] ?? []).map((v) => ({ field: f, value: v })));
  const hasDuplicates = dataset.quality.duplicateIdRecords > 0;

  return (
    <div className="space-y-2 rounded-lg border bg-card p-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Filter className="h-3.5 w-3.5" aria-hidden /> Global filters
        </span>
        {available.map((f) => (
          <MultiSelectFilter key={f} field={f} options={options[f] ?? []} selected={state.global[f] ?? []} onChange={(v) => filters.setGlobalField(f, v)} />
        ))}
        <div className="ml-auto flex items-center gap-2">
          <label htmlFor="counting-rule" className="flex items-center gap-1 text-xs text-muted-foreground">
            <Layers className="h-3.5 w-3.5" aria-hidden /> Counting rule
          </label>
          <NativeSelect id="counting-rule" className="w-56" value={state.countingRule} onChange={(e) => filters.setCountingRule(e.target.value as CountingRule)} disabled={!hasDuplicates && state.countingRule === 'all'}>
            <option value="all">All imported records{hasDuplicates ? ' (incl. duplicates)' : ''}</option>
            <option value="unique">Exclude duplicate IDs (keep first)</option>
          </NativeSelect>
        </div>
      </div>

      {(chips.length > 0 || state.selection || filters.hasActiveFilters) && (
        <div className="flex flex-wrap items-center gap-2 border-t pt-2">
          <span className="text-xs text-muted-foreground">
            Scope: <b className="text-foreground">{formatCount(analytics.agg.total)}</b> of {formatCount(base.length)} records
          </span>
          {chips.map((c) => (
            <Badge key={`${c.field}:${c.value}`} variant="secondary" className="gap-1 pr-1">
              {FILTER_FIELD_LABELS[c.field]}: {displayFilterValue(c.field, c.value)}
              <button
                type="button"
                className="rounded-full p-0.5 hover:bg-background"
                aria-label={`Remove filter ${FILTER_FIELD_LABELS[c.field]} ${c.value}`}
                onClick={() => filters.setGlobalField(c.field, (state.global[c.field] ?? []).filter((v) => v !== c.value))}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          {state.selection && (
            <Badge className="gap-1 pr-1" data-testid="selection-chip">
              Register selection: {state.selection.label}
              <button type="button" className="rounded px-1 text-[11px] underline-offset-2 hover:underline" onClick={filters.promoteSelection}>
                apply to dashboard
              </button>
              <button type="button" className="rounded-full p-0.5 hover:bg-background" aria-label="Clear register selection" onClick={filters.clearSelection}>
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          <Button variant="link" size="sm" className="ml-auto h-auto p-0" onClick={filters.clearAll}>
            Clear all filters
          </Button>
        </div>
      )}
    </div>
  );
}
