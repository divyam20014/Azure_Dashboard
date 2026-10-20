import { useRef } from 'react';
import { Download, GitCompare, ListFilter, Trash2, Upload } from 'lucide-react';
import { Section, Panel, ErrorMessage, LoadingIndicator, Notice } from '@/components/common/Common';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/common/Toast';
import { comparisonTables } from '@/lib/reports/reportWorkbook';
import { workbookBlob } from '@/lib/export/excelExporter';
import { downloadBlob } from '@/lib/export/download';
import { exportFileName } from '@/lib/export/reportExporter';
import { ACCEPTED_EXTENSIONS } from '@/lib/config';
import { formatCount, formatPercent } from '@/lib/text';
import type { FieldChange } from '@/lib/analytics/snapshotComparison';
import { useDashboard } from './DashboardContext';

const LIST_LIMIT = 15;

function ChangeList({ title, items, onView }: { title: string; items: { key: string; text: string }[]; onView?: () => void }) {
  return (
    <div className="rounded-md border p-3">
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-sm font-medium">
          {title} <span className="tabular text-muted-foreground">({formatCount(items.length)})</span>
        </p>
        {onView && items.length > 0 && (
          <Button size="sm" variant="ghost" onClick={onView}>
            <ListFilter /> View
          </Button>
        )}
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">None.</p>
      ) : (
        <ul className="space-y-0.5 text-xs">
          {items.slice(0, LIST_LIMIT).map((i) => (
            <li key={i.key} className="truncate" title={i.text}>
              {i.text}
            </li>
          ))}
          {items.length > LIST_LIMIT && <li className="text-muted-foreground">+{formatCount(items.length - LIST_LIMIT)} more (all in the export)</li>}
        </ul>
      )}
    </div>
  );
}

const changeText = (c: FieldChange) => `${c.id}: ${c.previous} → ${c.current}`;

/** Optional comparison against an earlier export. Both snapshots stay in memory; Clear Data removes both. */
export function ComparisonPanel() {
  const { analytics, comparison, dataset, selectRecords, scrollToRegister } = useDashboard();
  const notify = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const result = analytics.comparison;
  const snapshot = comparison.snapshot;
  const view = (source: string, label: string, indexes: number[]) => {
    selectRecords(source, label, indexes);
    scrollToRegister();
  };

  return (
    <Section
      // Re-initialise when a snapshot is loaded or removed so the results open automatically.
      key={snapshot ? `loaded:${snapshot.fileName}` : 'empty'}
      id="comparison"
      title="Snapshot Comparison"
      description="Optional: load an earlier export of the same tracker to see what changed. Records are matched by issue ID; both files stay in this browser tab only."
      collapsible
      defaultCollapsed={!snapshot}
      collapsedSummary={snapshot ? `Comparing with ${snapshot.fileName}` : 'No earlier snapshot loaded'}
      actions={
        <div className="flex flex-wrap gap-2">
          <input
            ref={inputRef}
            type="file"
            className="sr-only"
            tabIndex={-1}
            data-testid="comparison-file-input"
            accept={ACCEPTED_EXTENSIONS.join(',')}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) comparison.load(file);
            }}
          />
          <Button size="sm" variant="outline" onClick={() => inputRef.current?.click()} disabled={comparison.loading}>
            <Upload /> {snapshot ? 'Replace earlier snapshot' : 'Load earlier snapshot'}
          </Button>
          {snapshot && result && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  downloadBlob(workbookBlob(comparisonTables(result, snapshot.fileName, dataset.file.fileName)), exportFileName(dataset, 'comparison', 'xlsx'));
                  notify('Comparison exported.');
                }}
              >
                <Download /> Export comparison
              </Button>
              <Button size="sm" variant="ghost" onClick={comparison.clear}>
                <Trash2 /> Remove snapshot
              </Button>
            </>
          )}
        </div>
      }
    >
      {comparison.loading && <LoadingIndicator label="Reading the earlier snapshot in your browser…" />}
      {comparison.error && (
        <ErrorMessage title={comparison.error.title}>
          <p>{comparison.error.message}</p>
          <p className="mt-1">The current analysis is unchanged.</p>
        </ErrorMessage>
      )}
      {!snapshot || !result ? (
        !comparison.loading && (
          <Notice>
            <GitCompare className="mr-1 inline h-4 w-4" aria-hidden />
            Load a previous export to compare. It is normalized with the current column and value mappings. Week-on-week changes are only shown when two snapshots are available.
          </Notice>
        )
      ) : (
        <div className="space-y-3" data-testid="comparison-result">
          <Notice>
            Previous: <b>{snapshot.fileName}</b> ({formatCount(result.previousTotal)} records) · Current: <b>{dataset.file.fileName}</b> ({formatCount(result.currentTotal)} records in analytics) · {formatCount(result.matched)} IDs matched.
            {result.unmatchablePrevious + result.unmatchableCurrent > 0 && ` ${formatCount(result.unmatchablePrevious + result.unmatchableCurrent)} record(s) without an ID could not be matched.`}
            {result.ambiguousIds > 0 && ` ${formatCount(result.ambiguousIds)} repeated ID(s): only the first occurrence is compared.`}
          </Notice>
          {snapshot.missingFields.length > 0 && <Notice tone="warning">These mapped columns were not found in the earlier snapshot: {snapshot.missingFields.join(', ')}. Related changes cannot be compared.</Notice>}
          <Panel title="Metric comparison" description="Current-state counts in each snapshot. % change is shown only when the previous value is not zero.">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm" data-testid="comparison-metrics">
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-b">
                    <th className="py-1.5 pr-2 text-left font-medium">Metric</th>
                    <th className="py-1.5 pr-2 text-right font-medium">Previous</th>
                    <th className="py-1.5 pr-2 text-right font-medium">Current</th>
                    <th className="py-1.5 pr-2 text-right font-medium">Change</th>
                    <th className="py-1.5 text-right font-medium">% change</th>
                  </tr>
                </thead>
                <tbody className="tabular">
                  {result.metrics.map((m) => (
                    <tr key={m.metric} className="border-b last:border-0">
                      <td className="py-1.5 pr-2">{m.metric}</td>
                      <td className="py-1.5 pr-2 text-right">{formatCount(m.previous)}</td>
                      <td className="py-1.5 pr-2 text-right">{formatCount(m.current)}</td>
                      <td className="py-1.5 pr-2 text-right">{m.change > 0 ? `+${formatCount(m.change)}` : formatCount(m.change)}</td>
                      <td className="py-1.5 text-right">{m.percentChange === null ? '—' : formatPercent(m.percentChange)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <ChangeList
              title="Newly observed (not necessarily new issues)"
              items={result.newlyObserved.map((r) => ({ key: String(r.index), text: `${r.id}: ${r.title}` }))}
              onView={() => view('cmp:new', 'Newly observed since previous snapshot', result.newlyObserved.map((r) => r.index))}
            />
            <ChangeList title="No longer present in the export (not necessarily deleted)" items={result.noLongerPresent.map((r) => ({ key: String(r.index), text: `${r.id}: ${r.title} (was ${r.status})` }))} />
            <ChangeList
              title="Moved to Closed"
              items={result.closedBetween.map((c) => ({ key: c.id, text: changeText(c) }))}
              onView={() => view('cmp:closed', 'Closed between snapshots', result.closedBetween.map((c) => c.currentIndex))}
            />
            <ChangeList
              title="Moved from Closed back to Open"
              items={result.reopenedBetween.map((c) => ({ key: c.id, text: changeText(c) }))}
              onView={() => view('cmp:reopened', 'Reopened between snapshots', result.reopenedBetween.map((c) => c.currentIndex))}
            />
            <ChangeList
              title="Status changes"
              items={result.statusChanges.map((c) => ({ key: c.id, text: changeText(c) }))}
              onView={() => view('cmp:status', 'Status changed since previous snapshot', result.statusChanges.map((c) => c.currentIndex))}
            />
            <ChangeList
              title="Priority changes"
              items={result.priorityChanges.map((c) => ({ key: c.id, text: changeText(c) }))}
              onView={() => view('cmp:priority', 'Priority changed since previous snapshot', result.priorityChanges.map((c) => c.currentIndex))}
            />
            <ChangeList
              title="Assignee changes"
              items={result.assigneeChanges.map((c) => ({ key: c.id, text: changeText(c) }))}
              onView={() => view('cmp:assignee', 'Assignee changed since previous snapshot', result.assigneeChanges.map((c) => c.currentIndex))}
            />
          </div>
        </div>
      )}
    </Section>
  );
}
