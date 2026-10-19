import { ChevronDown, Download, FileSpreadsheet, FileText, Printer, Table2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useToast } from '@/components/common/Toast';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import { csvBlob, tableToCsv } from '@/lib/export/csvExporter';
import { workbookBlob } from '@/lib/export/excelExporter';
import { downloadBlob, textBlob } from '@/lib/export/download';
import { exportFileName, workbookTables } from '@/lib/export/reportExporter';
import { assigneeSummaryTable, dataQualityTable, issueRegisterTable, prioritySummaryTable, statusSummaryTable, type ReportTable } from '@/lib/export/reportTables';
import { summaryToText } from '@/lib/analytics/summaryGenerator';
import { formatCount } from '@/lib/text';

/** Every export is generated in the browser and saved via a local download — nothing is uploaded. */
export function ExportMenu({ onPrintReport }: { onPrintReport: () => void }) {
  const { dataset, analytics } = useDashboard();
  const notify = useToast();
  const m = dataset.config.columnMapping;

  const csv = (table: ReportTable, suffix: string) => {
    downloadBlob(csvBlob(tableToCsv(table)), exportFileName(dataset, suffix, 'csv'));
    notify(table.rows.length === 0 ? `${table.name}: no rows to export — the file contains headers only.` : `${table.name} exported (${formatCount(table.rows.length)} rows).`, table.rows.length ? 'success' : 'warning');
  };

  const excel = () => {
    try {
      const tables = workbookTables({ dataset, agg: analytics.agg, registerRecords: analytics.registerRecords, summary: analytics.summary });
      downloadBlob(workbookBlob(tables), exportFileName(dataset, 'analysis', 'xlsx'));
      notify(`Excel report exported with ${tables.length} worksheets.`);
    } catch {
      notify('The Excel report could not be generated — the browser may be low on memory. Try the CSV exports instead.', 'warning');
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm">
          <Download /> Export Report <ChevronDown className="opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>Report</DropdownMenuLabel>
        <DropdownMenuItem onSelect={excel}>
          <FileSpreadsheet /> Excel workbook (.xlsx)
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onPrintReport}>
          <Printer /> Printable report / PDF
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => downloadBlob(textBlob(summaryToText(analytics.summary, { fileName: dataset.file.fileName, generatedAt: new Date() })), exportFileName(dataset, 'summary', 'txt'))}>
          <FileText /> Executive summary (.txt)
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>CSV</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => csv(issueRegisterTable(dataset.records, dataset, 'All Issues'), 'all-issues')}>
          <Table2 /> All issues ({formatCount(dataset.records.length)})
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => csv(issueRegisterTable(analytics.registerRecords, dataset, 'Filtered Issues'), 'filtered-issues')}>
          <Table2 /> Filtered issues ({formatCount(analytics.registerRecords.length)})
        </DropdownMenuItem>
        {m.status !== null && (
          <DropdownMenuItem onSelect={() => csv(statusSummaryTable(analytics.agg), 'status-summary')}>
            <Table2 /> Status summary
          </DropdownMenuItem>
        )}
        {m.priority !== null && (
          <DropdownMenuItem onSelect={() => csv(prioritySummaryTable(analytics.agg), 'priority-summary')}>
            <Table2 /> Priority summary
          </DropdownMenuItem>
        )}
        {m.assignee !== null && (
          <DropdownMenuItem onSelect={() => csv(assigneeSummaryTable(analytics.agg), 'assignee-summary')}>
            <Table2 /> Assignee summary
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => csv(dataQualityTable(dataset.quality), 'data-quality')}>
          <Table2 /> Data quality report
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
