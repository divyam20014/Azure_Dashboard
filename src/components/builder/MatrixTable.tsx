import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import type { ChartData } from '@/lib/charts/chartData';
import { cn } from '@/lib/utils';
import { formatValue } from './builderChartOption';

const RAMP = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95'];

function heat(value: number | null, max: number): { background?: string; color?: string } {
  if (!value || max <= 0) return {};
  const step = Math.min(RAMP.length - 1, Math.floor((value / max) * (RAMP.length - 1) + 0.0001));
  return { background: RAMP[step], color: step >= 3 ? '#ffffff' : '#0f172a' };
}

interface Props {
  data: ChartData;
  /** Heat shading (heatmap) or a plain table. */
  heatmap: boolean;
  compact: boolean;
  onCellClick?: (categoryIndex: number, seriesIndex: number) => void;
  categoryHeader: string;
}

/**
 * Rows = primary categories, columns = series. Every cell shows its exact value, so colour
 * is never the only signal; rows scroll (with sticky headers) instead of shrinking text.
 */
export function MatrixTable({ data, heatmap, compact, onCellClick, categoryHeader }: Props) {
  const [search, setSearch] = useState('');
  const additive = !!data.seriesMetrics ? false : data.metric.additive;
  const showTotals = additive && data.metric.unit !== '%';
  const rows = useMemo(
    () => data.categories.map((c, ci) => ({ c, ci })).filter(({ c }) => !search || c.label.toLowerCase().includes(search.toLowerCase())),
    [data.categories, search],
  );
  const max = Math.max(0, ...data.cells.flatMap((r) => r.map((c) => c.value ?? 0)));
  const columnTotals = data.series.map((_, si) => data.cells[si].reduce((s, c) => s + (c.value ?? 0), 0));
  const unit = data.seriesMetrics ? 'issues' : data.metric.label.toLowerCase();

  return (
    <div className="space-y-2">
      {data.categories.length > 8 && (
        <Input aria-label={`Search ${categoryHeader}`} placeholder={`Search ${categoryHeader.toLowerCase()}…`} className="h-8 w-56" value={search} onChange={(e) => setSearch(e.target.value)} />
      )}
      <div className="max-h-[520px] overflow-auto rounded-md border">
        <table className="w-full min-w-max border-separate border-spacing-0 text-sm" data-testid={heatmap ? 'builder-heatmap' : 'builder-table'}>
          <thead className="sticky top-0 z-10 bg-card">
            <tr>
              <th scope="col" className="sticky left-0 z-20 border-b bg-card px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                {categoryHeader}
              </th>
              {data.series.map((s) => (
                <th key={s.key} scope="col" className="max-w-[160px] border-b px-3 py-2 text-center text-xs font-semibold" title={s.label}>
                  <span className="block truncate">{s.label}</span>
                </th>
              ))}
              {showTotals && data.series.length > 1 && (
                <th scope="col" className="border-b px-3 py-2 text-center text-xs font-semibold">
                  Total
                </th>
              )}
            </tr>
          </thead>
          <tbody className="tabular">
            {rows.map(({ c, ci }) => (
              <tr key={c.key}>
                <th scope="row" className={cn('sticky left-0 z-[5] max-w-[240px] border-b bg-card px-3 py-1 text-left font-normal', c.unmapped && 'italic text-muted-foreground')} title={c.label}>
                  <span className="block truncate">
                    {c.label}
                    {c.unmapped ? ' (unmapped)' : ''}
                  </span>
                </th>
                {data.series.map((s, si) => {
                  const v = data.cells[si][ci].value;
                  const name = `${c.label}, ${s.label}: ${formatValue(v, data, false)} ${data.metric.unit ? '' : unit}`.trim();
                  return (
                    <td key={s.key} className="border-b border-l border-card p-0.5">
                      <button
                        type="button"
                        disabled={!onCellClick || !data.cells[si][ci].indexes.length}
                        onClick={() => onCellClick?.(ci, si)}
                        aria-label={name}
                        title={name}
                        className={cn('w-full min-w-[3.5rem] rounded px-2 py-1 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', (v === 0 || v === null) && 'text-muted-foreground/60')}
                        style={heatmap ? heat(v, max) : undefined}
                      >
                        {v === 0 && heatmap ? '·' : formatValue(v, data, compact)}
                      </button>
                    </td>
                  );
                })}
                {showTotals && data.series.length > 1 && <td className="border-b px-3 py-1 text-center font-semibold">{formatValue(data.categoryValues[ci], data, compact)}</td>}
              </tr>
            ))}
          </tbody>
          {showTotals && (
            <tfoot className="sticky bottom-0 bg-secondary tabular">
              <tr>
                <th scope="row" className="sticky left-0 bg-secondary px-3 py-1.5 text-left text-xs font-semibold">
                  Total (drawn rows)
                </th>
                {columnTotals.map((t, i) => (
                  <td key={data.series[i].key} className="px-3 py-1.5 text-center font-semibold">
                    {formatValue(t, data, compact)}
                  </td>
                ))}
                {data.series.length > 1 && <td className="px-3 py-1.5 text-center font-semibold">{formatValue(columnTotals.reduce((a, b) => a + b, 0), data, compact)}</td>}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {search && <p className="text-xs text-muted-foreground">Showing {rows.length} of {data.categories.length} rows matching “{search}”.</p>}
    </div>
  );
}
