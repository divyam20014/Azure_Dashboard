import { formatCount } from '@/lib/text';
import { cn } from '@/lib/utils';
import type { MatrixRow } from '@/lib/analytics/assigneeAnalytics';

interface Props {
  priorities: string[];
  rows: MatrixRow[];
  columnTotals: number[];
  grandTotal: number;
  max: number;
  onCellClick: (assignee: string, priority: string) => void;
  onRowClick: (assignee: string) => void;
}

/** Sequential single-hue ramp (light -> dark blue) for magnitude; exact counts are always printed. */
const RAMP = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95'];

function cellStyle(value: number, max: number): { background?: string; color?: string } {
  if (value === 0 || max === 0) return {};
  const step = Math.min(RAMP.length - 1, Math.floor((value / max) * (RAMP.length - 1) + 0.0001));
  return { background: RAMP[step], color: step >= 3 ? '#ffffff' : '#0f172a' };
}

/** Assignee x priority matrix rendered as an accessible HTML table with heat shading. */
export function AssigneePriorityHeatmap({ priorities, rows, columnTotals, grandTotal, max, onCellClick, onRowClick }: Props) {
  return (
    <div className="max-h-[560px] overflow-auto rounded-md border">
      <table className="w-full min-w-max border-separate border-spacing-0 text-sm" data-testid="assignee-priority-matrix">
        <thead className="sticky top-0 z-10 bg-card">
          <tr>
            <th scope="col" className="sticky left-0 z-20 border-b bg-card px-3 py-2 text-left text-xs font-medium text-muted-foreground">
              Assignee
            </th>
            {priorities.map((p) => (
              <th key={p} scope="col" className="border-b px-3 py-2 text-center text-xs font-semibold">
                {p}
              </th>
            ))}
            <th scope="col" className="border-b px-3 py-2 text-center text-xs font-semibold">
              Total
            </th>
          </tr>
        </thead>
        <tbody className="tabular">
          {rows.map((row) => (
            <tr key={row.assignee}>
              <th scope="row" className="sticky left-0 z-[5] max-w-[220px] border-b bg-card px-3 py-1 text-left font-normal">
                <button type="button" className="block max-w-full truncate text-left hover:text-primary hover:underline" title={row.assignee} onClick={() => onRowClick(row.assignee)}>
                  {row.assignee}
                </button>
              </th>
              {row.cells.map((v, i) => (
                <td key={priorities[i]} className="border-b border-l border-card p-0.5">
                  <button
                    type="button"
                    disabled={v === 0}
                    onClick={() => onCellClick(row.assignee, priorities[i])}
                    aria-label={`${row.assignee}, ${priorities[i]}: ${v} issues`}
                    className={cn('w-full min-w-[3.5rem] rounded px-2 py-1 text-center transition-opacity', v === 0 ? 'cursor-default text-muted-foreground/60' : 'hover:opacity-80')}
                    style={cellStyle(v, max)}
                  >
                    {v === 0 ? '·' : formatCount(v)}
                  </button>
                </td>
              ))}
              <td className="border-b px-3 py-1 text-center font-semibold">{formatCount(row.total)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="sticky bottom-0 bg-secondary tabular">
          <tr>
            <th scope="row" className="sticky left-0 bg-secondary px-3 py-1.5 text-left text-xs font-semibold">
              Total
            </th>
            {columnTotals.map((t, i) => (
              <td key={priorities[i]} className="px-3 py-1.5 text-center font-semibold">
                {formatCount(t)}
              </td>
            ))}
            <td className="px-3 py-1.5 text-center font-semibold">{formatCount(grandTotal)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
