import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { CellValue } from '@/types/issue';
import { ESSENTIAL_FIELDS, ESSENTIAL_FIELD_IMPACT, FIELD_LABELS, LOGICAL_FIELDS, type ColumnMapping as Mapping, type LogicalField } from '@/types/mappings';
import { NativeSelect } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Notice } from '@/components/common/Common';
import { cellToString, isBlankCell } from '@/lib/text';

interface Props {
  headers: string[];
  dataRows: CellValue[][];
  mapping: Mapping;
  onChange: (field: LogicalField, column: number | null) => void;
}

function sampleValues(rows: CellValue[][], col: number | null): string {
  if (col === null) return '';
  const seen: string[] = [];
  for (const row of rows) {
    const v = row?.[col];
    if (isBlankCell(v ?? null)) continue;
    const text = cellToString(v ?? null);
    if (!seen.includes(text)) seen.push(text);
    if (seen.length >= 3) break;
  }
  return seen.join(' · ');
}

export function ColumnMapping({ headers, dataRows, mapping, onChange }: Props) {
  const missingEssentials = ESSENTIAL_FIELDS.filter((f) => mapping[f] === null);
  const mappedColumns = new Set(LOGICAL_FIELDS.map((f) => mapping[f]).filter((c) => c !== null));
  const unmappedHeaders = headers.filter((_, i) => !mappedColumns.has(i));
  const sampleRows = dataRows.slice(0, 200);

  return (
    <div className="space-y-4">
      {missingEssentials.length > 0 ? (
        <Notice tone="warning">
          <p className="font-medium">Some recommended fields are not mapped. You can continue with partial data; these analytics will be unavailable:</p>
          <ul className="mt-1 list-disc pl-5">
            {missingEssentials.map((f) => (
              <li key={f}>
                <span className="font-medium">{FIELD_LABELS[f]}</span> — {ESSENTIAL_FIELD_IMPACT[f]}
              </li>
            ))}
          </ul>
        </Notice>
      ) : (
        <Notice>Status, Assignee and Priority are mapped — the full dashboard is available. Review the detected columns below.</Notice>
      )}

      <div className="grid gap-x-6 gap-y-3 md:grid-cols-2">
        {LOGICAL_FIELDS.map((field) => {
          const essential = ESSENTIAL_FIELDS.includes(field);
          const col = mapping[field];
          return (
            <div key={field} className="flex min-w-0 flex-col gap-1">
              <label htmlFor={`map-${field}`} className="flex items-center gap-2 text-sm font-medium">
                {FIELD_LABELS[field]}
                {essential && (
                  <Badge variant={col === null ? 'warning' : 'success'} className="gap-1">
                    {col === null ? <AlertTriangle className="h-3 w-3" aria-hidden /> : <CheckCircle2 className="h-3 w-3" aria-hidden />}
                    Essential
                  </Badge>
                )}
              </label>
              <NativeSelect id={`map-${field}`} value={col === null ? '' : String(col)} onChange={(e) => onChange(field, e.target.value === '' ? null : Number(e.target.value))}>
                <option value="">— Not mapped —</option>
                {headers.map((h, i) => (
                  <option key={i} value={i}>
                    {h}
                  </option>
                ))}
              </NativeSelect>
              <p className="min-h-4 truncate text-xs text-muted-foreground" title={sampleValues(sampleRows, col)}>
                {col !== null ? `e.g. ${sampleValues(sampleRows, col) || '(empty in the first rows)'}` : ''}
              </p>
            </div>
          );
        })}
      </div>

      {unmappedHeaders.length > 0 && (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium">Other columns kept for the issue register and details view ({unmappedHeaders.length}):</span> {unmappedHeaders.join(', ')}
        </p>
      )}
    </div>
  );
}
