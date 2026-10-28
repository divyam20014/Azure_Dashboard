import { Eye, FileSpreadsheet } from 'lucide-react';
import { Section, Notice } from '@/components/common/Common';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/common/Toast';
import { MultiSelectFilter } from '@/components/issues/IssueFilters';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import { REPORT_SECTIONS, REPORT_TEMPLATES, sectionAvailability, type ReleaseCriteria, type ReportTemplateId } from '@/lib/reports/reportTemplates';
import { reportWorkbookTables } from '@/lib/reports/reportWorkbook';
import { workbookBlob } from '@/lib/export/excelExporter';
import { downloadBlob } from '@/lib/export/download';
import { exportFileName } from '@/lib/export/reportExporter';
import { formatCount } from '@/lib/text';
import { cn } from '@/lib/utils';
import { useReportModel } from './reportContext';

const CRITERIA: { key: keyof ReleaseCriteria; label: string }[] = [
  { key: 'maxHighPriorityOpen', label: 'Max open high-priority issues' },
  { key: 'maxOpenBacklog', label: 'Max open backlog' },
  { key: 'maxReopened', label: 'Max reopened issues' },
  { key: 'maxUnassigned', label: 'Max unassigned issues' },
];

/** Choose a report template and its sections; preview and export happen locally. */
export function ReportGenerator() {
  const { settings, analytics, dataset, openReportPreview } = useDashboard();
  const notify = useToast();
  const { options, sections, availability, ctx, template } = useReportModel();
  const update = settings.updateReport;

  const chooseTemplate = (id: ReportTemplateId) => update({ template: id, sections: REPORT_TEMPLATES[id].sections });
  const toggleSection = (id: (typeof REPORT_SECTIONS)[number]['id']) =>
    update({ sections: options.sections.includes(id) ? options.sections.filter((s) => s !== id) : [...options.sections, id] });

  const downloadExcel = () => {
    try {
      const tables = reportWorkbookTables(ctx, options, sections);
      downloadBlob(workbookBlob(tables), exportFileName(dataset, options.template === 'daily' ? 'daily-qa-report' : `${options.template}-report`, 'xlsx'));
      notify(`${template.title} exported with ${tables.length} worksheets.`);
    } catch {
      notify('The Excel report could not be generated — the browser may be low on memory.', 'warning');
    }
  };

  const assigneeOptions = analytics.agg.byAssignee.map((a) => ({ value: a.name, count: a.total }));

  return (
    <Section
      id="reports"
      title="Export and Report Generation"
      description="Management reports built in this browser from the current dashboard scope. Nothing is uploaded; files are saved only when you click a download button."
      collapsible
      defaultCollapsed
      collapsedSummary={template.title}
    >
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" role="radiogroup" aria-label="Report template">
        {Object.values(REPORT_TEMPLATES).map((t) => (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={options.template === t.id}
            onClick={() => chooseTemplate(t.id)}
            className={cn('rounded-lg border bg-card p-3 text-left shadow-sm transition-colors hover:bg-secondary', options.template === t.id && 'ring-2 ring-primary')}
          >
            <p className="text-sm font-semibold">{t.title}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t.description}</p>
          </button>
        ))}
      </div>

      <Card className="grid gap-5 p-4 lg:grid-cols-[3fr_2fr]">
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">Sections to include</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {REPORT_SECTIONS.map((s) => {
              const avail = sectionAvailability(s.id, availability);
              return (
                <label key={s.id} className={cn('flex items-start gap-2 rounded-md border p-2 text-sm', !avail.available && 'opacity-60')}>
                  <Checkbox className="mt-0.5" checked={avail.available && options.sections.includes(s.id)} disabled={!avail.available} onChange={() => toggleSection(s.id)} aria-label={`Include ${s.label}`} />
                  <span>
                    <span className="font-medium">{s.label}</span>
                    <span className="block text-xs text-muted-foreground">{avail.available ? s.description : `Unavailable: ${avail.reason}`}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="space-y-4 text-sm">
          {options.template === 'workload' && dataset.config.columnMapping.assignee !== null && (
            <div>
              <p className="mb-1 font-semibold">Assignees in the workload report</p>
              <MultiSelectFilter field="assignee" options={assigneeOptions} selected={options.assignees} onChange={(v) => update({ assignees: v })} ariaLabel="Report assignees" label={options.assignees.length ? 'Selected assignees' : 'All assignees in scope'} />
              <p className="mt-1 text-xs text-muted-foreground">Affects only this report (assignee section and register). Neutral workload figures — no ranking by performance.</p>
            </div>
          )}
          {(options.template === 'release' || options.sections.includes('readiness')) && (
            <div>
              <p className="mb-1 font-semibold">Release criteria (optional)</p>
              <p className="mb-2 text-xs text-muted-foreground">Leave blank to report indicators only. The report never declares a release safe or unsafe.</p>
              <div className="grid grid-cols-2 gap-2">
                {CRITERIA.map((c) => (
                  <label key={c.key} className="text-xs">
                    {c.label}
                    <Input
                      type="number"
                      min={0}
                      className="mt-0.5 h-8"
                      value={options.releaseCriteria[c.key] ?? ''}
                      onChange={(e) => update({ releaseCriteria: { ...options.releaseCriteria, [c.key]: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) } })}
                    />
                  </label>
                ))}
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs">
              Register rows in printed report
              <Input type="number" min={10} max={5000} className="mt-0.5 h-8" value={options.registerLimit} onChange={(e) => update({ registerLimit: Math.min(5000, Math.max(10, Number(e.target.value) || 10)) })} />
            </label>
            <label className="mt-5 flex items-center gap-2 text-xs">
              <Checkbox checked={options.pageBreaks} onChange={(e) => update({ pageBreaks: e.target.checked })} />
              New page per major section
            </label>
          </div>
          <Notice>
            Scope: {formatCount(analytics.scopes.inScope)} records{analytics.filterDescription ? ` (filters: ${analytics.filterDescription})` : ''}. Sections: {sections.length ? sections.join(', ') : 'none selected'}.
          </Notice>
          <div className="flex flex-wrap gap-2">
            <Button onClick={openReportPreview} disabled={sections.length === 0}>
              <Eye /> Preview report
            </Button>
            <Button variant="outline" onClick={downloadExcel} disabled={sections.length === 0}>
              <FileSpreadsheet /> Download Excel report
            </Button>
          </div>
        </div>
      </Card>
    </Section>
  );
}
