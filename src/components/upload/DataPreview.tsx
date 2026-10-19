import type { CellValue } from '@/types/issue';
import { FIELD_LABELS, LOGICAL_FIELDS, type ColumnMapping } from '@/types/mappings';
import { cellToString } from '@/lib/text';
import { PREVIEW_ROWS } from '@/lib/config';
import { cn } from '@/lib/utils';

interface Props {
  headers: string[];
  dataRows: CellValue[][];
  firstDataRowNumber: number;
  mapping: ColumnMapping;
}

/** First rows below the selected header row, showing the actual imported values. */
export function DataPreview({ headers, dataRows, firstDataRowNumber, mapping }: Props) {
  const fieldByColumn = new Map<number, string>();
  for (const f of LOGICAL_FIELDS) {
    const col = mapping[f];
    if (col !== null) fieldByColumn.set(col, FIELD_LABELS[f]);
  }
  const rows = dataRows.slice(0, PREVIEW_ROWS);

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Showing the first {rows.length} of {dataRows.length.toLocaleString()} data rows. Highlighted columns are mapped to dashboard fields.
      </p>
      <div className="max-h-[420px] overflow-auto rounded-md border">
        <table className="w-full min-w-max border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-secondary">
            <tr>
              <th className="border-b px-2 py-1.5 text-left font-medium text-muted-foreground">Row</th>
              {headers.map((h, i) => (
                <th key={i} className={cn('border-b px-2 py-1.5 text-left font-semibold', fieldByColumn.has(i) && 'bg-primary/10')}>
                  <div className="max-w-[220px] truncate" title={h}>
                    {h}
                  </div>
                  {fieldByColumn.has(i) && <div className="text-[10px] font-medium uppercase tracking-wide text-primary">→ {fieldByColumn.get(i)}</div>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r} className="even:bg-secondary/30">
                <td className="tabular border-b px-2 py-1 text-muted-foreground">{firstDataRowNumber + r}</td>
                {headers.map((_, c) => {
                  const text = cellToString(row?.[c] ?? null);
                  return (
                    <td key={c} className={cn('border-b px-2 py-1', fieldByColumn.has(c) && 'bg-primary/5')}>
                      <div className="max-w-[220px] truncate" title={text}>
                        {text}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
