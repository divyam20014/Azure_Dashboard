import type { ReactNode } from 'react';
import type { CsvDelimiter, ParsedFile } from '@/types/issue';
import type { DateOrder } from '@/types/mappings';
import { NativeSelect } from '@/components/ui/select';
import { CSV_DELIMITERS } from '@/lib/parsers/csvParser';
import { HEADER_SCAN_ROWS } from '@/lib/config';
import { cellToString, isBlankCell } from '@/lib/text';

interface Props {
  parsed: ParsedFile;
  headerRowIndex: number;
  dateOrder: DateOrder;
  disabled: boolean;
  onSheetChange: (name: string) => void;
  onDelimiterChange: (d: CsvDelimiter) => void;
  onHeaderRowChange: (index: number) => void;
  onDateOrderChange: (order: DateOrder) => void;
}

function rowPreview(row: ParsedFile['rows'][number] | undefined): string {
  if (!row || row.every((c) => isBlankCell(c))) return '(empty row)';
  const text = row
    .filter((c) => !isBlankCell(c))
    .slice(0, 4)
    .map((c) => cellToString(c))
    .join(' | ');
  return text.length > 60 ? `${text.slice(0, 59)}…` : text;
}

function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function WorksheetSelector({ parsed, headerRowIndex, dateOrder, disabled, onSheetChange, onDelimiterChange, onHeaderRowChange, onDateOrderChange }: Props) {
  const scan = Math.min(parsed.rows.length, HEADER_SCAN_ROWS);
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {parsed.kind !== 'csv' ? (
        <Field label="Worksheet" htmlFor="sheet-select" hint={parsed.sheetNames.length > 1 ? `${parsed.sheetNames.length} worksheets found — sheets are never combined.` : undefined}>
          <NativeSelect id="sheet-select" value={parsed.sheetName} disabled={disabled} onChange={(e) => onSheetChange(e.target.value)}>
            {parsed.sheetNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </NativeSelect>
        </Field>
      ) : (
        <Field label="Delimiter" htmlFor="delimiter-select" hint="Change it if the columns in the preview look wrong.">
          <NativeSelect id="delimiter-select" value={parsed.delimiter} disabled={disabled} onChange={(e) => onDelimiterChange(e.target.value as CsvDelimiter)}>
            {CSV_DELIMITERS.map((d) => (
              <option key={d.label} value={d.value}>
                {d.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
      )}
      <Field label="Header row" htmlFor="header-row-select" hint="The row that contains the column names.">
        <NativeSelect id="header-row-select" value={headerRowIndex} disabled={disabled || scan === 0} onChange={(e) => onHeaderRowChange(Number(e.target.value))}>
          {Array.from({ length: scan }, (_, i) => (
            <option key={i} value={i}>
              Row {parsed.firstRowNumber + i}: {rowPreview(parsed.rows[i])}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Date format (numeric dates)" htmlFor="date-order-select" hint="Used for text dates like 03/05/2024.">
        <NativeSelect id="date-order-select" value={dateOrder} disabled={disabled} onChange={(e) => onDateOrderChange(e.target.value as DateOrder)}>
          <option value="MDY">Month / Day / Year</option>
          <option value="DMY">Day / Month / Year</option>
        </NativeSelect>
      </Field>
    </div>
  );
}
