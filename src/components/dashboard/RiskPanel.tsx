import { useState } from 'react';
import { Download, ListFilter } from 'lucide-react';
import { Section, EmptyState } from '@/components/common/Common';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/common/Toast';
import type { RiskIndicator } from '@/lib/analytics/riskAnalytics';
import { csvBlob, tableToCsv } from '@/lib/export/csvExporter';
import { issueRegisterTable } from '@/lib/export/reportTables';
import { downloadBlob } from '@/lib/export/download';
import { exportFileName } from '@/lib/export/reportExporter';
import { formatCount } from '@/lib/text';
import { cn } from '@/lib/utils';
import { useDashboard } from './DashboardContext';

const ATTENTION_STYLE: Record<number, string> = {
  1: 'border-l-[#d03b3b]',
  2: 'border-l-[#e2553f]',
  3: 'border-l-[#c98500]',
  4: 'border-l-[#64748b]',
  5: 'border-l-[#7c3aed]',
  6: 'border-l-[#2a78d6]',
};

function parseThresholds(text: string): number[] | null {
  const parts = text.split(/[,\s]+/).filter(Boolean).map(Number);
  if (parts.length === 0 || parts.some((n) => !Number.isFinite(n) || n < 0)) return null;
  return parts;
}

function RiskCard({ risk }: { risk: RiskIndicator }) {
  const { dataset, selectRecords, isSelected, scrollToRegister, analytics } = useDashboard();
  const notify = useToast();
  const source = `risk:${risk.id}`;
  const active = isSelected(source);
  const records = risk.indexes.map((i) => dataset.records[i]);
  const ids = records.map((r) => r.id).filter(Boolean);

  const view = () => {
    selectRecords(source, risk.title, risk.indexes);
    if (!active) scrollToRegister();
  };
  const exportRecords = () => {
    downloadBlob(csvBlob(tableToCsv(issueRegisterTable(records, dataset, risk.title))), exportFileName(dataset, `risk-${risk.id}`, 'csv'));
    notify(`Exported ${formatCount(records.length)} record(s) for "${risk.title}".`);
  };

  return (
    <Card className={cn('flex flex-col gap-3 border-l-4 p-4 print-avoid-break', ATTENTION_STYLE[risk.rank])} data-testid={`risk-${risk.id}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Badge variant="secondary" className="mb-1">
            {risk.rank}. {risk.category}
          </Badge>
          <h3 className="text-sm font-semibold">{risk.title}</h3>
        </div>
        <span className="tabular text-2xl font-semibold" data-testid={`risk-${risk.id}-count`}>
          {risk.available ? formatCount(risk.count) : 'N/A'}
        </span>
      </div>
      <p className="text-sm text-foreground/85">{risk.explanation}</p>
      {risk.available && risk.facts.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs">
          {risk.facts.map((f) => (
            <span key={f.label} className="rounded-md bg-secondary px-2 py-0.5">
              {f.label}: <b className="tabular">{typeof f.value === 'number' ? formatCount(f.value) : f.value}</b>
            </span>
          ))}
        </div>
      )}
      {risk.available &&
        risk.breakdowns.map((b) =>
          b.rows.length === 0 ? null : (
            <div key={b.title}>
              <p className="mb-1 text-xs font-medium text-muted-foreground">{b.title}</p>
              <ul className="space-y-0.5 text-xs">
                {b.rows.slice(0, 5).map((r) => (
                  <li key={r.label} className="flex justify-between gap-2">
                    <span className="truncate">{r.label}</span>
                    <span className="tabular font-medium">{formatCount(r.count)}</span>
                  </li>
                ))}
                {b.rows.length > 5 && <li className="text-muted-foreground">+{b.rows.length - 5} more</li>}
              </ul>
            </div>
          ),
        )}
      {risk.id === 'aging' && risk.available && (
        <div className="flex flex-wrap gap-1.5">
          {analytics.aging.buckets.map((b) => (
            <button
              key={b.label}
              type="button"
              disabled={b.indexes.length === 0}
              onClick={() => {
                selectRecords(`aging:${b.label}`, `Open, age ${b.label}`, b.indexes);
                scrollToRegister();
              }}
              className={cn('rounded-full border px-2 py-0.5 text-xs hover:bg-secondary disabled:opacity-50', isSelected(`aging:${b.label}`) && 'ring-2 ring-primary')}
            >
              {b.label}: <b className="tabular">{formatCount(b.indexes.length)}</b>
            </button>
          ))}
        </div>
      )}
      {ids.length > 0 && (
        <p className="text-xs text-muted-foreground">
          IDs: {ids.slice(0, 8).join(', ')}
          {ids.length > 8 ? ` +${ids.length - 8} more` : ''}
        </p>
      )}
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer select-none">Rule and limitations</summary>
        <p className="mt-1">
          <span className="font-medium text-foreground">Included when:</span> {risk.rule}
        </p>
        {risk.limitations.length > 0 ? (
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {risk.limitations.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-1">No known limitations for this indicator.</p>
        )}
      </details>
      {risk.available && risk.limitations.length > 0 && <p className="text-xs text-warning">⚠ {risk.limitations.length} limitation(s) — see rule details.</p>}
      <div className="no-print mt-auto flex flex-wrap gap-2">
        <Button size="sm" variant={active ? 'default' : 'outline'} disabled={!risk.available || risk.count === 0} onClick={view} aria-pressed={active}>
          <ListFilter /> {active ? 'Showing in register' : `View ${formatCount(risk.count)} in register`}
        </Button>
        <Button size="sm" variant="ghost" disabled={!risk.available || risk.count === 0} onClick={exportRecords} aria-label={`Export ${risk.title} records as CSV`}>
          <Download /> CSV
        </Button>
      </div>
    </Card>
  );
}

export function RiskPanel() {
  const { analytics, settings } = useDashboard();
  const [thresholdText, setThresholdText] = useState(settings.settings.agingThresholds.join(', '));
  const [invalid, setInvalid] = useState(false);
  const flagged = analytics.risks.filter((r) => r.available && r.count > 0).length;

  return (
    <Section
      id="risks"
      title="Risks and Attention Required"
      description="Issues that may need follow-up, from explicit rules shown on each card. These are attention indicators, not evidence of missed deadlines or delivery failure."
      collapsible
      collapsedSummary={`${flagged} indicator(s) with affected issues`}
      actions={
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const parsed = parseThresholds(thresholdText);
            setInvalid(parsed === null);
            if (parsed) settings.update({ agingThresholds: parsed });
          }}
        >
          <label htmlFor="aging-thresholds" className="text-xs text-muted-foreground">
            Aging buckets (days)
          </label>
          <Input id="aging-thresholds" className={cn('h-8 w-28', invalid && 'border-destructive')} value={thresholdText} onChange={(e) => setThresholdText(e.target.value)} aria-invalid={invalid} />
          <Button size="sm" variant="outline" type="submit">
            Apply
          </Button>
        </form>
      }
    >
      {analytics.agg.total === 0 ? (
        <EmptyState title="No issues in the current scope">Adjust or clear the global filters.</EmptyState>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {analytics.risks.map((r) => (
            <RiskCard key={r.id} risk={r} />
          ))}
        </div>
      )}
    </Section>
  );
}
