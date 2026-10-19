import { useRef, useState, type DragEvent } from 'react';
import { ArrowLeft, FileSpreadsheet, ShieldCheck, UploadCloud, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrubOnUnmount } from '@/components/common/ScrubOnUnmount';
import { Card } from '@/components/ui/card';
import { ErrorMessage, LoadingIndicator } from '@/components/common/Common';
import { ACCEPTED_EXTENSIONS, MAX_FILE_SIZE_MB } from '@/lib/config';
import { formatBytes } from '@/lib/text';
import { cn } from '@/lib/utils';
import type { ParseProgress } from '@/lib/parsers/importSession';
import type { ImportFailure } from '@/hooks/useDataset';

export const PRIVACY_STATEMENT =
  'Your file is processed locally in your browser. The uploaded file and its data are not uploaded to a server or stored in a database. Exported reports are generated locally on your device.';

const STAGE_LABEL: Record<ParseProgress['stage'], string> = {
  reading: 'Reading file in your browser…',
  parsing: 'Parsing rows…',
  preparing: 'Preparing worksheet…',
};

interface Props {
  onFile: (file: File) => void;
  parsing: boolean;
  progress: ParseProgress | null;
  onCancelParse: () => void;
  failure: ImportFailure | null;
  onDismissFailure: () => void;
  /** Present when a dataset is already loaded (replace flow). */
  onBack?: () => void;
  currentFileName?: string;
}

export function FileUpload({ onFile, parsing, progress, onCancelParse, failure, onDismissFailure, onBack, currentFileName }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [selected, setSelected] = useState<{ name: string; size: number } | null>(null);

  const accept = (file: File | undefined) => {
    if (!file) return;
    setSelected({ name: file.name, size: file.size });
    onFile(file);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (parsing) return;
    accept(event.dataTransfer.files[0]);
  };

  return (
    <ScrubOnUnmount className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-8 sm:py-12">
      {onBack && (
        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={onBack} disabled={parsing}>
            <ArrowLeft /> Back to current analysis
          </Button>
          {currentFileName && <span className="truncate text-xs text-muted-foreground">Current: {currentFileName}</span>}
        </div>
      )}

      <div className="space-y-1 text-center">
        <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">{onBack ? 'Replace the uploaded file' : 'Analyse an issue-tracking spreadsheet'}</h2>
        <p className="text-sm text-muted-foreground">
          Upload an Azure DevOps, Jira or other bug-tracker export. You will confirm the worksheet and column mapping before the dashboard is generated.
        </p>
      </div>

      <Card className="p-0">
        <div
          role="button"
          tabIndex={parsing ? -1 : 0}
          aria-label="Upload a file: drop it here or press Enter to browse"
          aria-disabled={parsing}
          onClick={() => !parsing && inputRef.current?.click()}
          onKeyDown={(e) => {
            if (!parsing && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            if (!parsing) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            'm-3 flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-12 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            dragging ? 'border-primary bg-accent' : 'border-border hover:border-primary/60 hover:bg-secondary/50',
            parsing && 'cursor-default opacity-80',
          )}
        >
          <div className="rounded-full bg-accent p-3">
            <UploadCloud className="h-7 w-7 text-primary" aria-hidden />
          </div>
          <div>
            <p className="font-medium">Drag and drop your file here</p>
            <p className="text-sm text-muted-foreground">
              or <span className="font-medium text-primary underline-offset-4 hover:underline">browse your computer</span>
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            Excel (.xlsx, .xls) or CSV (.csv) · up to {MAX_FILE_SIZE_MB} MB
          </p>
          <input
            ref={inputRef}
            type="file"
            data-testid="file-input"
            accept={[...ACCEPTED_EXTENSIONS, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'text/csv'].join(',')}
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => accept(e.target.files?.[0])}
          />
        </div>

        {(selected || parsing) && (
          <div className="mx-3 mb-3 space-y-3 rounded-md border bg-secondary/40 p-3">
            {selected && (
              <div className="flex items-center gap-3">
                <FileSpreadsheet className="h-5 w-5 shrink-0 text-primary" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" title={selected.name}>
                    {selected.name}
                  </p>
                  <p className="text-xs text-muted-foreground">{formatBytes(selected.size)}</p>
                </div>
                {parsing && (
                  <Button variant="outline" size="sm" onClick={onCancelParse}>
                    <X /> Cancel
                  </Button>
                )}
              </div>
            )}
            {parsing && progress && <LoadingIndicator label={STAGE_LABEL[progress.stage]} fraction={progress.fraction} />}
          </div>
        )}
      </Card>

      {failure && (
        <ErrorMessage
          title={failure.error.title}
          action={
            <Button variant="link" size="sm" className="h-auto p-0" onClick={onDismissFailure}>
              Dismiss
            </Button>
          }
        >
          <p>{failure.error.message}</p>
          {failure.keptExisting && <p className="mt-1 font-medium">Your current analysis has been kept unchanged.</p>}
        </ErrorMessage>
      )}

      <div className="flex gap-3 rounded-lg border border-emerald-600/30 bg-emerald-600/5 p-4" data-testid="privacy-statement">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
        <div className="space-y-1 text-sm">
          <p className="font-semibold">Private by design</p>
          <p className="text-foreground/90">{PRIVACY_STATEMENT}</p>
          <p className="text-xs text-muted-foreground">
            Nothing is saved in browser storage. Refreshing or closing the page discards the analysis; use Clear Data to release it at any time.
          </p>
        </div>
      </div>
    </ScrubOnUnmount>
  );
}
