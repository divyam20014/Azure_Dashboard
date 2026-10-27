import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { Section, Panel, EmptyState, Notice } from '@/components/common/Common';
import { SimpleBarChart } from '@/components/charts/SimpleBarChart';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { QUALITY_CATEGORIES, type QualityCategory } from '@/lib/analytics/dataQuality';
import { DEFAULT_QUALITY_WEIGHTS, PASS_THRESHOLD, QUALITY_DIMENSIONS, WARNING_THRESHOLD, type QualityDimension, type RuleOutcome } from '@/lib/analytics/dataQualityScore';
import { csvBlob, tableToCsv } from '@/lib/export/csvExporter';
import { dataQualityTable } from '@/lib/export/reportTables';
import { downloadBlob } from '@/lib/export/download';
import { exportFileName } from '@/lib/export/reportExporter';
import { FIELD_LABELS, type LogicalField } from '@/types/mappings';
import type { IssueRecord } from '@/types/issue';
import { formatCount, formatPercent } from '@/lib/text';
import { cn } from '@/lib/utils';
import { useDashboard } from './DashboardContext';

const PAGE = 25;
const GROUP_PAGE = 20;
const QUALITY_COLOR = '#c98500';

const OUTCOME_LABEL: Record<RuleOutcome, string> = { pass: 'Pass', warning: 'Warning', error: 'Error', 'not-applicable': 'Not applicable' };
const OUTCOME_VARIANT: Record<RuleOutcome, 'success' | 'warning' | 'destructive' | 'secondary'> = { pass: 'success', warning: 'warning', error: 'destructive', 'not-applicable': 'secondary' };

function QualityScorePanel() {
  const { analytics, dataset, settings } = useDashboard();
  const score = analytics.qualityScore;
  const [editing, setEditing] = useState(false);
  const weights = settings.settings.qualityWeights;
  const required = settings.settings.requiredFields;
  const absentFields = useMemo(
    () => [...new Set(QUALITY_DIMENSIONS.flatMap((d) => d.fields))].filter((f) => dataset.config.columnMapping[f] === null),
    [dataset.config.columnMapping],
  );

  return (
    <Panel
      title="Data-quality score"
      description="A transparent completeness and consistency indicator over all valid records (independent of filters). Not a formal quality certification."
      actions={
        <Button size="sm" variant="outline" onClick={() => setEditing((e) => !e)} aria-expanded={editing}>
          {editing ? 'Done' : 'Adjust weights'}
        </Button>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
        <div className="flex flex-col items-start gap-1">
          <span className="tabular text-4xl font-semibold" data-testid="quality-score">
            {score.overall === null ? 'N/A' : score.overall.toFixed(1)}
          </span>
          <span className="text-xs text-muted-foreground">out of 100 · {formatCount(score.recordsChecked)} records checked</span>
          <div className="mt-2 flex flex-wrap gap-1 text-xs">
            <Badge variant="success">{score.passed} passed</Badge>
            <Badge variant="warning">{score.warnings} warnings</Badge>
            <Badge variant="destructive">{score.errors} errors</Badge>
            <Badge variant="secondary">{score.notApplicable} not applicable</Badge>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Method: each rule = valid records ÷ records checked. Pass ≥ {PASS_THRESHOLD}%, warning ≥ {WARNING_THRESHOLD}%, error below. Overall = weighted average of applicable rules. Fields absent from the file are not applicable unless marked required.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm" data-testid="quality-score-table">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="py-1.5 pr-2 text-left font-medium">Rule</th>
                <th className="py-1.5 pr-2 text-left font-medium">Outcome</th>
                <th className="py-1.5 pr-2 text-right font-medium">Score</th>
                <th className="py-1.5 pr-2 text-right font-medium">Valid / checked</th>
                <th className="py-1.5 text-right font-medium">Weight</th>
              </tr>
            </thead>
            <tbody>
              {score.dimensions.map((d) => (
                <tr key={d.id} className="border-b align-top last:border-0">
                  <td className="py-1.5 pr-2">
                    <span className="font-medium">{d.label}</span>
                    <span className="block text-xs text-muted-foreground">{d.note ?? d.description}</span>
                  </td>
                  <td className="py-1.5 pr-2">
                    <Badge variant={OUTCOME_VARIANT[d.outcome]}>{OUTCOME_LABEL[d.outcome]}</Badge>
                  </td>
                  <td className="tabular py-1.5 pr-2 text-right">{d.score === null ? '—' : formatPercent(d.score)}</td>
                  <td className="tabular py-1.5 pr-2 text-right">{d.score === null ? '—' : `${formatCount(d.valid)} / ${formatCount(d.checked)}`}</td>
                  <td className="py-1.5 text-right">
                    {editing ? (
                      <Input
                        type="number"
                        min={0}
                        aria-label={`Weight for ${d.label}`}
                        className="ml-auto h-7 w-16 text-right"
                        value={weights[d.id]}
                        onChange={(e) => settings.update({ qualityWeights: { ...weights, [d.id as QualityDimension]: Math.max(0, Number(e.target.value) || 0) } })}
                      />
                    ) : (
                      <span className="tabular">{d.weight}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {editing && (
            <div className="mt-3 space-y-2 text-xs">
              <Button size="sm" variant="ghost" onClick={() => settings.update({ qualityWeights: DEFAULT_QUALITY_WEIGHTS, requiredFields: [] })}>
                Restore default weights
              </Button>
              {absentFields.length > 0 && (
                <div>
                  <p className="mb-1 font-medium">Fields absent from this file — mark as required to score them as missing:</p>
                  <div className="flex flex-wrap gap-3">
                    {absentFields.map((f) => (
                      <label key={f} className="flex items-center gap-1.5">
                        <Checkbox
                          checked={required.includes(f)}
                          onChange={(e) => settings.update({ requiredFields: e.target.checked ? [...required, f] : required.filter((x) => x !== f) })}
                        />
                        {FIELD_LABELS[f as LogicalField]}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}

function DuplicatePanel() {
  const { dataset, filters, analytics } = useDashboard();
  const q = dataset.quality;
  const [limit, setLimit] = useState(GROUP_PAGE);
  const groups = useMemo(() => {
    const map = new Map<string, IssueRecord[]>();
    for (const r of dataset.records) if (r.isDuplicateId) map.set(r.id, [...(map.get(r.id) ?? []), r]);
    return [...map.entries()];
  }, [dataset.records]);
  const review = filters.state.countingRule === 'review';
  const excluded = filters.state.reviewExcluded;
  const subsequent = useMemo(() => dataset.records.filter((r) => r.isDuplicateId && !r.isFirstOfId).map((r) => r.index), [dataset.records]);

  return (
    <Panel
      title="Duplicate issue IDs"
      description="Duplicates are never merged automatically. Choose a duplicate-handling rule in the global filter bar; blank IDs are never treated as duplicates of each other."
    >
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ['Records with a blank ID', q.missingIds],
          ['Duplicate ID occurrences', q.duplicateIdRecords],
          ['Distinct IDs affected', q.duplicateIdValues],
          ['Excluded by the current rule', analytics.scopes.excluded],
        ].map(([label, value]) => (
          <div key={label as string} className="rounded-md bg-secondary/60 p-2">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="tabular text-lg font-semibold">{formatCount(value as number)}</p>
          </div>
        ))}
      </div>
      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">No duplicate issue IDs were found.</p>
      ) : (
        <>
          {review ? (
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Notice className="flex-1">Review mode: tick the records to exclude from analytics. Nothing is excluded until you choose.</Notice>
              <Button size="sm" variant="outline" onClick={() => filters.setReviewExcluded(new Set(subsequent))}>
                Exclude all subsequent occurrences
              </Button>
              <Button size="sm" variant="ghost" onClick={() => filters.setReviewExcluded(new Set())}>
                Include all
              </Button>
            </div>
          ) : (
            <p className="mb-2 text-xs text-muted-foreground">
              Current rule: {filters.state.countingRule === 'all' ? 'all imported records are counted' : 'subsequent records with the same ID are excluded'}.{' '}
              <button type="button" className="font-medium text-primary underline-offset-2 hover:underline" onClick={() => filters.setCountingRule('review')}>
                Review duplicates individually
              </button>
            </p>
          )}
          <div className="max-h-[420px] overflow-auto rounded-md border">
            <table className="w-full min-w-[620px] text-sm" data-testid="duplicate-table">
              <thead className="sticky top-0 bg-secondary text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Issue ID</th>
                  <th className="px-3 py-2 text-left font-medium">Source row</th>
                  <th className="px-3 py-2 text-left font-medium">Title</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                  <th className="px-3 py-2 text-left font-medium">Assignee</th>
                  <th className="px-3 py-2 text-center font-medium">{review ? 'Exclude' : 'Occurrence'}</th>
                </tr>
              </thead>
              <tbody>
                {groups.slice(0, limit).flatMap(([id, recs]) =>
                  recs.map((r, i) => (
                    <tr key={r.index} className={cn('border-t', i === 0 && 'border-t-2')}>
                      <td className="px-3 py-1.5 font-medium">{i === 0 ? id : ''}</td>
                      <td className="tabular px-3 py-1.5">{r.sourceRow}</td>
                      <td className="max-w-[260px] truncate px-3 py-1.5" title={r.title}>
                        {r.title}
                      </td>
                      <td className="px-3 py-1.5">{r.status}</td>
                      <td className="px-3 py-1.5">{r.assignee}</td>
                      <td className="px-3 py-1.5 text-center">
                        {review ? (
                          <Checkbox aria-label={`Exclude row ${r.sourceRow} (ID ${id})`} checked={excluded.has(r.index)} onChange={() => filters.toggleReviewExcluded(r.index)} />
                        ) : (
                          <span className="text-xs text-muted-foreground">{i === 0 ? 'first' : `#${i + 1}`}</span>
                        )}
                      </td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
          {groups.length > limit && (
            <Button variant="link" size="sm" onClick={() => setLimit((l) => l + GROUP_PAGE)}>
              Show more ({groups.length - limit} more IDs)
            </Button>
          )}
        </>
      )}
    </Panel>
  );
}

export function DataQualityOverview() {
  const { dataset, analytics } = useDashboard();
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
    { label: 'Records with future dates', value: q.futureDates, tone: 'warn' },
    { label: 'Unmapped statuses (records)', value: q.unmappedStatusRecords, tone: 'warn' },
    { label: 'Unmapped priorities (records)', value: q.unmappedPriorityRecords, tone: 'warn' },
    { label: 'Unrecognized columns', value: q.unrecognizedColumns.length },
  ];

  const issues = useMemo(() => (category ? q.issues.filter((i) => i.category === category) : q.issues), [q.issues, category]);
  const pages = Math.max(1, Math.ceil(issues.length / PAGE));
  const current = Math.min(page, pages - 1);
  const chartItems = QUALITY_CATEGORIES.map((c) => ({ label: c, value: q.countsByCategory[c], color: QUALITY_COLOR })).filter((i) => i.value > 0);
  const score = analytics.qualityScore;

  return (
    <Section
      id="quality"
      title="Data Quality Overview"
      description={`Validation of the imported rows (checked ${q.checkedAt.toLocaleString()}). Original values are never modified.`}
      collapsible
      collapsedSummary={`Score ${score.overall === null ? 'N/A' : `${score.overall.toFixed(0)}/100`} · ${formatCount(q.issues.length)} finding(s)`}
      actions={
        <Button variant="outline" size="sm" onClick={() => downloadBlob(csvBlob(tableToCsv(dataQualityTable(q))), exportFileName(dataset, 'data-quality', 'csv'))}>
          <Download /> Download data quality report
        </Button>
      }
    >
      <QualityScorePanel />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-7">
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

      <DuplicatePanel />

      <div className="grid gap-4 lg:grid-cols-[2fr_3fr]">
        <Panel title="Problems by category" description="Number of row-level findings per validation category.">
          {chartItems.length === 0 ? (
            <EmptyState title="No data-quality problems detected" />
          ) : (
            <SimpleBarChart
              items={chartItems}
              onSelect={(label) => {
                setCategory(label as QualityCategory);
                setPage(0);
              }}
              title="Problems by category"
                ariaLabel="Bar chart of data quality findings by category"
              labelWidth={140}
              valueAxisName="Findings"
            />
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
            <NativeSelect
              aria-label="Filter problem rows by category"
              className="w-48"
              value={category}
              onChange={(e) => {
                setCategory(e.target.value as QualityCategory | '');
                setPage(0);
              }}
            >
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
                <table className="w-full min-w-[720px] text-sm" data-testid="quality-table">
                  <thead className="text-xs text-muted-foreground">
                    <tr className="border-b">
                      <th className="py-2 pr-3 text-left font-medium">Row</th>
                      <th className="py-2 pr-3 text-left font-medium">Issue ID</th>
                      <th className="py-2 pr-3 text-left font-medium">Category</th>
                      <th className="py-2 pr-3 text-left font-medium">Severity</th>
                      <th className="py-2 pr-3 text-left font-medium">Problem</th>
                      <th className="py-2 text-left font-medium">Recommended correction</th>
                    </tr>
                  </thead>
                  <tbody>
                    {issues.slice(current * PAGE, current * PAGE + PAGE).map((i, idx) => (
                      <tr key={`${i.sourceRow}-${i.category}-${idx}`} className="border-b align-top last:border-0">
                        <td className="tabular py-1.5 pr-3">{i.sourceRow}</td>
                        <td className="py-1.5 pr-3">{i.issueId || '—'}</td>
                        <td className="whitespace-nowrap py-1.5 pr-3 font-medium">{i.category}</td>
                        <td className="py-1.5 pr-3">
                          <Badge variant={i.severity === 'Error' ? 'destructive' : i.severity === 'Warning' ? 'warning' : 'secondary'}>{i.severity}</Badge>
                        </td>
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
