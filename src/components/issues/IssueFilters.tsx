import { useMemo, useState } from 'react';
import { CalendarRange, ChevronDown, Download, Filter, Layers, X } from 'lucide-react';
import type { CountingRule, FilterField } from '@/types/analytics';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { NativeSelect } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { ScrubOnUnmount } from '@/components/common/ScrubOnUnmount';
import { useToast } from '@/components/common/Toast';
import { displayFilterValue, distinctValues, FILTER_FIELD_LABELS, FILTER_FIELDS } from '@/lib/analytics/filters';
import { csvBlob, tableToCsv } from '@/lib/export/csvExporter';
import { issueRegisterTable } from '@/lib/export/reportTables';
import { downloadBlob } from '@/lib/export/download';
import { exportFileName } from '@/lib/export/reportExporter';
import { formatCount } from '@/lib/text';
import { cn } from '@/lib/utils';
import { useDashboard } from '@/components/dashboard/DashboardContext';

const MAX_OPTIONS = 300;

export interface MultiSelectProps {
  field: FilterField;
  options: { value: string; count: number }[];
  selected: string[];
  onChange: (v: string[]) => void;
  /** Accessible name of the trigger (default "Filter by <field>"). */
  ariaLabel?: string;
  /** Visible trigger text (default: the field label). */
  label?: string;
}

/** Searchable multi-select used for every value filter. */
export function MultiSelectFilter({ field, options, selected, onChange, ariaLabel, label: triggerLabel }: MultiSelectProps) {
  const [query, setQuery] = useState('');
  const filtered = query ? options.filter((o) => displayFilterValue(field, o.value).toLowerCase().includes(query.toLowerCase())) : options;
  const toggle = (value: string) => onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  const label = FILTER_FIELD_LABELS[field];
  const groupName = ariaLabel ? `${ariaLabel} options` : `${label} options`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={cn('h-8', selected.length > 0 && 'border-primary text-primary')} aria-label={ariaLabel ?? `Filter by ${label}`}>
          {triggerLabel ?? label}
          {selected.length > 0 && <Badge className="px-1.5 py-0">{selected.length}</Badge>}
          <ChevronDown className="opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0">
        <ScrubOnUnmount>
          <div className="border-b p-2">
            <Input autoFocus placeholder={`Search ${label.toLowerCase()}…`} className="h-8" value={query} onChange={(e) => setQuery(e.target.value)} aria-label={`Search ${label}`} />
          </div>
          <div className="max-h-72 overflow-y-auto p-1" role="group" aria-label={groupName}>
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

/** Global value filters that are available for the mapped columns. */
export function useAvailableFilterFields(): FilterField[] {
  const { dataset } = useDashboard();
  const m = dataset.config.columnMapping;
  return FILTER_FIELDS.filter((f) => (f === 'category' ? m.status !== null : m[f] !== null));
}

/** Options come from all records in analytics, so selecting one filter never hides the others' values. */
export function useFilterOptions(fields: FilterField[]): Record<FilterField, { value: string; count: number }[]> {
  const { analytics } = useDashboard();
  const key = fields.join('|');
  return useMemo(
    () => Object.fromEntries(fields.map((f) => [f, distinctValues(analytics.included, f)])) as Record<FilterField, { value: string; count: number }[]>,
    [analytics.included, key],
  );
}

/** A global (dashboard-wide) filter for one field; can be placed in any section. */
export function GlobalFieldFilter({ field, ariaLabel, label }: { field: FilterField; ariaLabel?: string; label?: string }) {
  const { filters } = useDashboard();
  const options = useFilterOptions([field]);
  return (
    <MultiSelectFilter
      field={field}
      options={options[field] ?? []}
      selected={filters.state.global[field] ?? []}
      onChange={(v) => filters.setGlobalField(field, v)}
      ariaLabel={ariaLabel}
      label={label}
    />
  );
}

/** Global filters (affect every section) plus the register-only chart selection, both always visible. */
export function IssueFilters() {
  const { dataset, filters, analytics } = useDashboard();
  const notify = useToast();
  const { state } = filters;
  const m = dataset.config.columnMapping;
  const available = useAvailableFilterFields();
  const options = useFilterOptions(available);
  const s = analytics.scopes;

  const chips = FILTER_FIELDS.flatMap((f) => (state.global[f] ?? []).map((v) => ({ field: f, value: v })));
  const hasDuplicates = dataset.quality.duplicateIdRecords > 0;

  const exportSelection = () => {
    const records = analytics.registerRecords;
    downloadBlob(csvBlob(tableToCsv(issueRegisterTable(records, dataset, 'Selected Issues'))), exportFileName(dataset, 'selection', 'csv'));
    notify(records.length === 0 ? 'Exported 0 records — the file contains column headers only.' : `Exported the ${formatCount(records.length)} record(s) of the current selection.`, records.length ? 'success' : 'warning');
  };

  return (
    <div className="space-y-2 rounded-lg border bg-card p-3 shadow-sm" data-testid="global-filters">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Filter className="h-3.5 w-3.5" aria-hidden /> Global filters
        </span>
        {available.map((f) => (
          <MultiSelectFilter key={f} field={f} options={options[f] ?? []} selected={state.global[f] ?? []} onChange={(v) => filters.setGlobalField(f, v)} />
        ))}
        {m.created !== null && (
          <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            <CalendarRange className="h-3.5 w-3.5" aria-hidden />
            <label htmlFor="created-from">Created</label>
            <Input id="created-from" type="date" className="h-8 w-[8.5rem]" value={state.createdFrom} max={state.createdTo || undefined} onChange={(e) => filters.setCreatedRange(e.target.value, state.createdTo)} aria-label="Created from" />
            <span aria-hidden>–</span>
            <Input id="created-to" type="date" className="h-8 w-[8.5rem]" value={state.createdTo} min={state.createdFrom || undefined} onChange={(e) => filters.setCreatedRange(state.createdFrom, e.target.value)} aria-label="Created to" />
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          <label htmlFor="counting-rule" className="flex items-center gap-1 text-xs text-muted-foreground">
            <Layers className="h-3.5 w-3.5" aria-hidden /> Duplicate IDs
          </label>
          <NativeSelect id="counting-rule" aria-label="Counting rule" className="w-64" value={state.countingRule} onChange={(e) => filters.setCountingRule(e.target.value as CountingRule)} disabled={!hasDuplicates && state.countingRule === 'all'}>
            <option value="all">Include all imported records{hasDuplicates ? ' (incl. duplicates)' : ''}</option>
            <option value="unique">Exclude subsequent duplicate IDs</option>
            <option value="review">Review duplicates before excluding</option>
          </NativeSelect>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t pt-2">
        <span className="text-xs text-muted-foreground" data-testid="scope-summary">
          Showing <b className="text-foreground">{formatCount(s.inScope)}</b> of {formatCount(s.included)} records
          {s.excluded > 0 && ` · ${formatCount(s.valid)} imported, ${formatCount(s.excluded)} excluded by the duplicate rule`}
          {state.countingRule === 'review' && ' · duplicate review active (see Data Quality)'}
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
        {(state.createdFrom || state.createdTo) && (
          <Badge variant="secondary" className="gap-1 pr-1">
            Created: {state.createdFrom || '…'} – {state.createdTo || '…'} (undated records excluded)
            <button type="button" className="rounded-full p-0.5 hover:bg-background" aria-label="Remove created date filter" onClick={() => filters.setCreatedRange('', '')}>
              <X className="h-3 w-3" />
            </button>
          </Badge>
        )}
        {state.selection && (
          <Badge className="gap-1 pr-1" data-testid="selection-chip">
            Register selection: {state.selection.label} ({formatCount(analytics.registerRecords.length)})
            {!state.selection.indexes && (
              <button type="button" className="rounded px-1 text-[11px] underline-offset-2 hover:underline" onClick={filters.promoteSelection}>
                apply to dashboard
              </button>
            )}
            <button type="button" className="inline-flex items-center gap-0.5 rounded px-1 text-[11px] underline-offset-2 hover:underline" onClick={exportSelection} aria-label="Export the selected records as CSV">
              <Download className="h-3 w-3" aria-hidden /> export
            </button>
            <button type="button" className="rounded-full p-0.5 hover:bg-background" aria-label="Clear register selection" onClick={filters.clearSelection}>
              <X className="h-3 w-3" />
            </button>
          </Badge>
        )}
        {filters.hasActiveFilters && (
          <Button variant="link" size="sm" className="ml-auto h-auto p-0" onClick={filters.clearAll}>
            Clear all filters
          </Button>
        )}
      </div>
    </div>
  );
}
