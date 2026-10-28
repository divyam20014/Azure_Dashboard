import { Copy, Download, Lightbulb } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Section } from '@/components/common/Common';
import { useToast } from '@/components/common/Toast';
import { summaryToText } from '@/lib/analytics/summaryGenerator';
import { downloadBlob, textBlob } from '@/lib/export/download';
import { exportFileName } from '@/lib/export/reportExporter';
import { useDashboard } from './DashboardContext';

export function ExecutiveSummary() {
  const { analytics, dataset } = useDashboard();
  const notify = useToast();
  const { summary } = analytics;
  const text = () => summaryToText(summary, { fileName: dataset.file.fileName, generatedAt: new Date() });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text());
      notify('Summary copied to the clipboard.');
    } catch {
      notify('Copy failed — your browser blocked clipboard access. Use Download Summary instead.', 'warning');
    }
  };

  return (
    <Section
      id="summary"
      title="Executive Summary and Key Insights"
      description="Generated in your browser from the calculated figures using fixed rules — no AI service is used."
      collapsible
      defaultCollapsed
      collapsedSummary={summary.headline}
      actions={
        <>
          <Button variant="outline" size="sm" onClick={copy}>
            <Copy /> Copy Summary
          </Button>
          <Button variant="outline" size="sm" onClick={() => downloadBlob(textBlob(text()), exportFileName(dataset, 'summary', 'txt'))}>
            <Download /> Download Summary
          </Button>
        </>
      }
    >
      <Card className="p-4 sm:p-5">
        <p className="text-[15px] leading-relaxed" data-testid="summary-headline">
          {summary.headline}
        </p>
        {summary.insights.length > 0 && (
          <ul className="mt-4 grid gap-x-6 gap-y-2.5 md:grid-cols-2">
            {summary.insights.map((i) => (
              <li key={i.id} className="flex gap-2 text-sm">
                <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                <span>
                  <span className="font-medium">{i.title}: </span>
                  <span className="text-foreground/85">{i.text}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 space-y-0.5 border-t pt-3 text-xs text-muted-foreground">
          {summary.notes.map((n) => (
            <p key={n}>• {n}</p>
          ))}
        </div>
      </Card>
    </Section>
  );
}
