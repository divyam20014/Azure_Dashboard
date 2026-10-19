import type { IssueRecord } from '@/types/issue';
import type { Dataset } from '@/types/analytics';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { ScrubOnUnmount } from '@/components/common/ScrubOnUnmount';
import { CATEGORY_LABELS } from '@/lib/normalization/statusNormalizer';
import { cellToString } from '@/lib/text';

interface Props {
  dataset: Dataset;
  record: IssueRecord | null;
  onClose: () => void;
}

/** All source fields of one record exactly as imported, plus the normalized values used by the dashboard. */
export function IssueDetailsDrawer({ dataset, record, onClose }: Props) {
  return (
    <Sheet open={record !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent aria-describedby="issue-details-desc">
        {record && (
          <ScrubOnUnmount className="flex min-h-0 flex-1 flex-col">
            <div className="border-b p-5 pr-10">
              <SheetTitle className="text-base font-semibold">{record.id ? `Issue ${record.id}` : `Row ${record.sourceRow}`}</SheetTitle>
              <SheetDescription id="issue-details-desc" className="mt-1 text-sm text-muted-foreground">
                {record.title || 'No title in the source data'} · source row {record.sourceRow}
              </SheetDescription>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {dataset.config.columnMapping.status !== null && (
                  <Badge variant="secondary">
                    {record.status} · {CATEGORY_LABELS[record.statusCategory]}
                  </Badge>
                )}
                {dataset.config.columnMapping.priority !== null && <Badge variant="secondary">{record.priority}</Badge>}
                {dataset.config.columnMapping.assignee !== null && <Badge variant="secondary">{record.assignee}</Badge>}
                {record.isDuplicateId && <Badge variant="warning">Duplicate ID</Badge>}
                {record.invalidDates.length > 0 && <Badge variant="warning">Invalid date</Badge>}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">All source fields</h4>
              <dl className="divide-y rounded-md border">
                {dataset.headers.map((h, i) => {
                  const value = cellToString(record.cells[i] ?? null);
                  return (
                    <div key={i} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 px-3 py-2 text-sm">
                      <dt className="break-words text-muted-foreground">{h}</dt>
                      <dd className="whitespace-pre-wrap break-words">{value === '' ? <span className="italic text-muted-foreground">(empty)</span> : value}</dd>
                    </div>
                  );
                })}
              </dl>
            </div>
          </ScrubOnUnmount>
        )}
      </SheetContent>
    </Sheet>
  );
}
