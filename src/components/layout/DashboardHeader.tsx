import type { ReactNode } from 'react';
import { BarChart3, FileSpreadsheet, Moon, RefreshCw, SlidersHorizontal, Sun, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/components/common/ThemeContext';
import { formatCount } from '@/lib/text';

interface Props {
  fileName?: string;
  sheetName?: string;
  recordCount?: number;
  /** Records included in analytics after the duplicate rule. */
  includedCount?: number;
  activeFilterCount?: number;
  reportTemplate?: string;
  comparisonFile?: string;
  datasetLabel?: string;
  onReplace?: () => void;
  onEditMappings?: () => void;
  onClear?: () => void;
  exportSlot?: ReactNode;
  showNav?: boolean;
}

export const SECTION_NAV = [
  { id: 'overview', label: 'Executive' },
  { id: 'summary', label: 'Summary' },
  { id: 'risks', label: 'Risks' },
  { id: 'status', label: 'Status' },
  { id: 'priority', label: 'Priority' },
  { id: 'assignees', label: 'Assignees' },
  { id: 'handoff', label: 'Handoff' },
  { id: 'register', label: 'Issues' },
  { id: 'quality', label: 'Data Quality' },
  { id: 'comparison', label: 'Comparison' },
  { id: 'reports', label: 'Reports' },
];

export function DashboardHeader({ fileName, sheetName, recordCount, includedCount, activeFilterCount, reportTemplate, comparisonFile, datasetLabel, onReplace, onEditMappings, onClear, exportSlot, showNav }: Props) {
  const { dark, toggle } = useTheme();
  return (
    <header className="no-print sticky top-0 z-30 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/85">
      <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="rounded-lg bg-primary p-1.5 text-primary-foreground">
            <BarChart3 className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold leading-tight tracking-tight sm:text-lg">QA Issue Analytics Dashboard</h1>
            <p className="hidden text-xs text-muted-foreground sm:block">Issue Tracking, Workload and Quality Insights</p>
          </div>
        </div>

        {fileName && (
          <div className="flex min-w-0 items-center gap-2 rounded-md border bg-secondary/50 px-2.5 py-1 text-xs" data-testid="header-file">
            <FileSpreadsheet className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
            <span className="max-w-[220px] truncate font-medium" title={fileName}>
              {fileName}
            </span>
            {sheetName && <span className="hidden max-w-[120px] truncate text-muted-foreground md:inline">· {sheetName}</span>}
            {recordCount !== undefined && <span className="tabular text-muted-foreground">· {formatCount(recordCount)} records</span>}
            {includedCount !== undefined && recordCount !== undefined && includedCount !== recordCount && (
              <span className="tabular text-muted-foreground">({formatCount(includedCount)} in analytics)</span>
            )}
            {activeFilterCount ? <span className="text-primary">· {activeFilterCount} filter(s) active</span> : null}
            {datasetLabel && <span className="hidden max-w-[180px] truncate text-muted-foreground lg:inline">· {datasetLabel}</span>}
          </div>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {onReplace && (
            <Button variant="outline" size="sm" onClick={onReplace}>
              <RefreshCw /> <span className="hidden sm:inline">Replace File</span>
            </Button>
          )}
          {onEditMappings && (
            <Button variant="outline" size="sm" onClick={onEditMappings}>
              <SlidersHorizontal /> <span className="hidden sm:inline">Edit Mappings</span>
            </Button>
          )}
          {exportSlot}
          {onClear && (
            <Button variant="outline" size="sm" className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={onClear}>
              <Trash2 /> <span className="hidden sm:inline">Clear Data</span>
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={toggle} aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}>
            {dark ? <Sun /> : <Moon />}
          </Button>
        </div>
      </div>
      {showNav && (reportTemplate || comparisonFile) && (
        <p className="mx-auto hidden max-w-[1500px] px-4 pb-1 text-[11px] text-muted-foreground md:block" data-testid="header-context">
          {reportTemplate && <>Report template: {reportTemplate}</>}
          {comparisonFile && <> · Comparing with: {comparisonFile}</>}
        </p>
      )}
      {showNav && (
        <nav aria-label="Dashboard sections" className="mx-auto flex max-w-[1500px] gap-1 overflow-x-auto px-4 pb-2">
          {SECTION_NAV.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground">
              {s.label}
            </a>
          ))}
        </nav>
      )}
    </header>
  );
}
