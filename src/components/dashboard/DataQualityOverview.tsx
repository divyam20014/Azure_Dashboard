import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { Section, Panel, EmptyState, Notice } from '@/components/common/Common';
import { SimpleBarChart } from '@/components/charts/SimpleBarChart';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { QUALITY_CATEGORIES, type QualityCategory } from '@/lib/analytics/dataQuality';
import { csvBlob, tableToCsv } from '@/lib/export/csvExporter';
import { dataQualityTable } from '@/lib/export/reportTables';
import { downloadBlob } from '@/lib/export/download';
import { exportFileName } from '@/lib/export/reportExporter';
import { formatCount } from '@/lib/text';
import { cn } from '@/lib/utils';
import { useDashboard } from './DashboardContext';

const PAGE = 25;
const QUALITY_COLOR = '#c98500';

export function DataQualityOverview() {
  const { dataset } = useDashboard();
  const q = dataset.quality;
  const [category, setCategory] = useState<QualityCategory | ''>('');
  const [page, setPage] = useState(0);

  const metrics: { label: string; value: number; tone?: 'warn' }[] = [
    { label: 'Total imported rows', value: q.totalImportedRows },
    { label: 'Valid issue records', value: q.validRecords },
    { label: 'Blank rows', value: q.blankRows, tone: 'warn' },
    { label: 'Missing issue IDs', value: q.missingIds, tone: 'warn' },
    { label: 'Duplicate-ID records', value: q.duplicateIdRecords, tone: 'warn' },
    { label: 'Missing statuses', value: q.missingStatuses, tone: 'warn' },
    { label: 'Missing assignees', value: q.missingAssignees, tone: 'warn' },
    { label: 'Missing priorities', value: q.missingPriorities, tone: 'warn' },
    { label: 'Records with invalid dates', value: q.invalidDates, tone: 'warn' },
    { label: 'Unmapped statuses (records)', value: q.unmappedStatusRecords, tone: 'warn' },
    { label: 'Unmapped priorities (records)', value: q.unmappedPriorityRecords, tone: 'warn' },
    { label: 'Unrecognized columns', value: q.unrecognizedColumns.length },
  ];

  const issues = useMemo(() => (category ? q.issues.filter((i) => i.category === category) : q.issues), [q.issues, category]);
  const pages = Math.max(1, Math.ceil(issues.length / PAGE));
  const current = Math.min(page, pages - 1);
  const chartItems = QUALITY_CATEGORIES.map((c) => ({ label: c, value: q.countsByCategory[c], color: QUALITY_COLOR })).filter((i) => i.value > 0);

  return (
    <Section
      id="quality"
      title="Data Quality Overview"
      description="Validation of the imported rows. Original values are never modified."
      actions={
        <Button variant="outline" size="sm" onClick={() => downloadBlob(csvBlob(tableToCsv(dataQualityTable(q))), exportFileName(dataset, 'data-quality', 'csv'))}>
          <Download /> Download data quality report
        </Button>
      }
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {metrics.map((mt) => (
          <Card key={mt.label} className="p-3">
            <p className="text-xs text-muted-foreground">{mt.label}</p>
            <p className={cn('tabular text-xl font-semibold', mt.tone === 'warn' && mt.value > 0 && 'text-warning')}>{formatCount(mt.value)}</p>
          </Card>
        ))}
      </div>

      {(q.skippedChecks.length > 0 || q.duplicateHeaders.length > 0 || q.unmappedStatusValues.length > 0 || q.unmappedPriorityValues.length > 0) && (
        <div className="space-y-2">
          {q.skippedChecks.map((s) => (
            <Notice key={s}>{s}</Notice>
          ))}
          {q.duplicateHeaders.length > 0 && <Notice tone="warning">Duplicate column headers were renamed with a numeric suffix: {q.duplicateHeaders.join(', ')}.</Notice>}
          {q.unmappedStatusValues.length > 0 && <Notice tone="warning">Unmapped status values: {q.unmappedStatusValues.join(', ')}. Classify them in Edit Mappings.</Notice>}
          {q.unmappedPriorityValues.length > 0 && <Notice tone="warning">Unrecognized priority values: {q.unmappedPriorityValues.join(', ')}. Confirm them in Edit Mappings.</Notice>}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[2fr_3fr]">
        <Panel title="Problems by category" description="Number of row-level findings per validation category.">
          {chartItems.length === 0 ? (
            <EmptyState title="No data-quality problems detected" />
          ) : (
            <SimpleBarChart items={chartItems} onSelect={(label) => { setCategory(label as QualityCategory); setPage(0); }} ariaLabel="Bar chart of data quality findings by category" labelWidth={140} />
          )}
          {q.unrecognizedColumns.length > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              <span className="font-medium">Columns not mapped to a dashboard field</span> (still available in issue details): {q.unrecognizedColumns.join(', ')}
            </p>
          )}
        </Panel>
        <Panel
          title={`Problem rows (${formatCount(issues.length)})`}
          actions={
            <NativeSelect aria-label="Filter problem rows by category" className="w-48" value={category} onChange={(e) => { setCategory(e.target.value as QualityCategory | ''); setPage(0); }}>
              <option value="">All categories</option>
              {QUALITY_CATEGORIES.filter((c) => q.countsByCategory[c] > 0).map((c) => (
                <option key={c} value={c}>
                  {c} ({q.countsByCategory[c]})
                </option>
              ))}
            </NativeSelect>
          }
        >
          {issues.length === 0 ? (
            <EmptyState title="No problem rows" />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm" data-testid="quality-table">
                  <thead className="text-xs text-muted-foreground">
                    <tr className="border-b">
                      <th className="py-2 pr-3 text-left font-medium">Row</th>
                      <th className="py-2 pr-3 text-left font-medium">Issue ID</th>
                      <th className="py-2 pr-3 text-left font-medium">Category</th>
                      <th className="py-2 pr-3 text-left font-medium">Explanation</th>
                      <th className="py-2 text-left font-medium">Recommended correction</th>
                    </tr>
                  </thead>
                  <tbody>
                    {issues.slice(current * PAGE, current * PAGE + PAGE).map((i, idx) => (
                      <tr key={`${i.sourceRow}-${i.category}-${idx}`} className="border-b align-top last:border-0">
                        <td className="tabular py-1.5 pr-3">{i.sourceRow}</td>
                        <td className="py-1.5 pr-3">{i.issueId || '—'}</td>
                        <td className="whitespace-nowrap py-1.5 pr-3 font-medium">{i.category}</td>
                        <td className="py-1.5 pr-3">{i.explanation}</td>
                        <td className="py-1.5 text-muted-foreground">{i.recommendation}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-2 flex items-center justify-end gap-2 text-xs text-muted-foreground">
                <span>
                  Page {current + 1} of {pages}
                </span>
                <Button variant="outline" size="sm" disabled={current === 0} onClick={() => setPage(current - 1)}>
                  Previous
                </Button>
                <Button variant="outline" size="sm" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>
                  Next
                </Button>
              </div>
            </>
          )}
        </Panel>
      </div>
    </Section>
  );
}
