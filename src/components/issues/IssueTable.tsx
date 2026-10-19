import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Columns3, Download, Search, X } from 'lucide-react';
import type { IssueRecord } from '@/types/issue';
import type { LogicalField } from '@/types/mappings';
import { FIELD_LABELS } from '@/types/mappings';
import { Section, EmptyState, Swatch } from '@/components/common/Common';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrubOnUnmount } from '@/components/common/ScrubOnUnmount';
import { Card } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useToast } from '@/components/common/Toast';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import type { SearchScope } from '@/lib/analytics/filters';
import { cellToString, formatCount, formatDate } from '@/lib/text';
import { UNMAPPED_COLOR } from '@/lib/normalization/statusNormalizer';
import { csvBlob, tableToCsv } from '@/lib/export/csvExporter';
import { issueRegisterTable } from '@/lib/export/reportTables';
import { downloadBlob } from '@/lib/export/download';
import { exportFileName } from '@/lib/export/reportExporter';

type ColumnKey = LogicalField | `src:${number}`;

interface ColumnDef {
  key: ColumnKey;
  label: string;
  value: (r: IssueRecord) => string | number | Date | null;
  render?: (r: IssueRecord) => ReactNode;
  className?: string;
}

const DEFAULT_FIELDS: LogicalField[] = ['id', 'title', 'status', 'priority', 'assignee', 'type', 'created', 'updated', 'project', 'severity'];
const PAGE_SIZES = [25, 50, 100, 250];

function compare(a: string | number | Date | null, b: string | number | Date | null): number {
  if (a === b) return 0;
  if (a === null || a === '') return 1;
  if (b === null || b === '') return -1;
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  const na = Number(a);
  const nb = Number(b);
  if (typeof a === 'string' && typeof b === 'string' && a.trim() !== '' && b.trim() !== '' && !Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

export function IssueTable() {
  const { dataset, analytics, filters, openRecord } = useDashboard();
  const notify = useToast();
  const m = dataset.config.columnMapping;
  const colors = analytics.colors;
  const records = analytics.registerRecords;
  const [sort, setSort] = useState<{ key: ColumnKey; dir: 'asc' | 'desc' } | null>(null);
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(0);
  const [extraColumns, setExtraColumns] = useState<number[]>([]);

  useEffect(() => setPage(0), [records]);

  const columns = useMemo<ColumnDef[]>(() => {
    const defs: ColumnDef[] = [];
    for (const f of DEFAULT_FIELDS) {
      if (m[f] === null) continue;
      switch (f) {
        case 'id':
          defs.push({ key: f, label: FIELD_LABELS[f], value: (r) => r.id, render: (r) => <span className="font-medium text-primary">{r.id || '—'}</span> });
          break;
        case 'title':
          defs.push({ key: f, label: FIELD_LABELS[f], value: (r) => r.title, className: 'max-w-[360px] truncate' });
          break;
        case 'status':
          defs.push({
            key: f,
            label: FIELD_LABELS[f],
            value: (r) => r.status,
            render: (r) => (
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                <Swatch color={colors.status[r.status] ?? UNMAPPED_COLOR} />
                {r.status}
              </span>
            ),
          });
          break;
        case 'priority':
          defs.push({
            key: f,
            label: FIELD_LABELS[f],
            value: (r) => r.priority,
            render: (r) => (
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                <Swatch color={colors.priority[r.priority] ?? UNMAPPED_COLOR} />
                {r.priority}
              </span>
            ),
          });
          break;
        case 'created':
        case 'updated':
          defs.push({ key: f, label: FIELD_LABELS[f], value: (r) => r[f], render: (r) => <span className="tabular whitespace-nowrap">{formatDate(r[f])}</span> });
          break;
        default:
          defs.push({ key: f, label: FIELD_LABELS[f], value: (r) => (r as unknown as Record<string, string>)[f] });
      }
    }
    for (const col of extraColumns) {
      defs.push({ key: `src:${col}`, label: dataset.headers[col], value: (r) => cellToString(r.cells[col] ?? null), className: 'max-w-[260px] truncate' });
    }
    return defs;
  }, [m, colors, extraColumns, dataset.headers]);

  const sorted = useMemo(() => {
    if (!sort) return records;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return records;
    const factor = sort.dir === 'asc' ? 1 : -1;
    return [...records].sort((a, b) => factor * compare(col.value(a), col.value(b)) || a.sourceRow - b.sourceRow);
  }, [records, sort, columns]);

  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const current = Math.min(page, pages - 1);
  const visible = sorted.slice(current * pageSize, current * pageSize + pageSize);

  const toggleSort = (key: ColumnKey) =>
    setSort((s) => (s?.key !== key ? { key, dir: 'asc' } : s.dir === 'asc' ? { key, dir: 'desc' } : null));

  const exportFiltered = () => {
    downloadBlob(csvBlob(tableToCsv(issueRegisterTable(sorted, dataset, 'Filtered Issues'))), exportFileName(dataset, 'filtered-issues', 'csv'));
    notify(sorted.length === 0 ? 'Exported 0 records — the file contains column headers only.' : `Exported ${formatCount(sorted.length)} filtered record(s).`, sorted.length === 0 ? 'warning' : 'success');
  };

  const optionalColumns = dataset.headers.map((h, i) => ({ h, i }));

  return (
    <Section
      id="register"
      title="Detailed Issue Register"
      description="The source of truth for every figure above: the records in the current scope, narrowed by any chart selection and search."
      actions={
        <Button variant="outline" size="sm" onClick={exportFiltered}>
          <Download /> Export filtered (CSV)
        </Button>
      }
    >
      <Card className="p-3 sm:p-4">
        <div className="no-print mb-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              aria-label="Search issues"
              placeholder="Search issues…"
              className="pl-8"
              value={filters.state.search}
              onChange={(e) => filters.setSearch(e.target.value)}
            />
            {filters.state.search && (
              <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label="Clear search" onClick={() => filters.setSearch('')}>
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <NativeSelect aria-label="Search in" className="w-40" value={filters.state.searchScope} onChange={(e) => filters.setSearchScope(e.target.value as SearchScope)}>
            <option value="all">All fields</option>
            {m.id !== null && <option value="id">Issue ID</option>}
            {m.title !== null && <option value="title">Title</option>}
            {m.assignee !== null && <option value="assignee">Assignee</option>}
          </NativeSelect>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-9">
                <Columns3 /> Columns {extraColumns.length > 0 && `(+${extraColumns.length})`}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 p-0">
              <ScrubOnUnmount>
                <p className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">Add source columns</p>
                <div className="max-h-72 overflow-y-auto p-1">
                  {optionalColumns.map(({ h, i }) => (
                    <label key={i} className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-secondary">
                      <Checkbox checked={extraColumns.includes(i)} onChange={() => setExtraColumns((cols) => (cols.includes(i) ? cols.filter((c) => c !== i) : [...cols, i]))} />
                      <span className="truncate">{h}</span>
                    </label>
                  ))}
                </div>
              </ScrubOnUnmount>
            </PopoverContent>
          </Popover>
          {filters.hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={filters.clearAll}>
              Reset filters
            </Button>
          )}
        </div>

        <p className="mb-2 text-xs text-muted-foreground" data-testid="register-count">
          {formatCount(sorted.length)} record(s)
          {filters.state.selection ? ` · selection: ${filters.state.selection.label}` : ''}
        </p>

        {sorted.length === 0 ? (
          <EmptyState title="No issues match the current filters">
            Clear the search or selection, or{' '}
            <button type="button" className="font-medium text-primary underline-offset-2 hover:underline" onClick={filters.clearAll}>
              reset all filters
            </button>
            .
          </EmptyState>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full min-w-max text-sm" data-testid="issue-table">
              <thead className="bg-secondary text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2 text-left font-medium">
                    Row
                  </th>
                  {columns.map((c) => (
                    <th key={c.key} scope="col" className="px-3 py-2 text-left font-medium" aria-sort={sort?.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                      <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort(c.key)}>
                        {c.label}
                        {sort?.key === c.key ? sort.dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" /> : <ArrowUpDown className="h-3 w-3 opacity-40" />}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr
                    key={r.index}
                    tabIndex={0}
                    onClick={() => openRecord(r)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') openRecord(r);
                    }}
                    className="cursor-pointer border-t hover:bg-secondary/60 focus-visible:bg-accent focus-visible:outline-none"
                  >
                    <td className="tabular px-3 py-1.5 text-muted-foreground">{r.sourceRow}</td>
                    {columns.map((c) => {
                      const v = c.value(r);
                      return (
                        <td key={c.key} className="px-3 py-1.5">
                          {c.render ? c.render(r) : <div className={c.className} title={typeof v === 'string' ? v : undefined}>{v instanceof Date ? formatDate(v) : (v ?? '')}</div>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {sorted.length > 0 && (
          <div className="no-print mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              Rows per page
              <NativeSelect aria-label="Rows per page" className="w-20" value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }}>
                {PAGE_SIZES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {formatCount(current * pageSize + 1)}–{formatCount(Math.min(sorted.length, (current + 1) * pageSize))} of {formatCount(sorted.length)}
              </span>
              <Button variant="outline" size="sm" disabled={current === 0} onClick={() => setPage(0)}>
                First
              </Button>
              <Button variant="outline" size="sm" disabled={current === 0} onClick={() => setPage(current - 1)}>
                Previous
              </Button>
              <Button variant="outline" size="sm" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>
    </Section>
  );
}
