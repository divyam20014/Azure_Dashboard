import { useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Download, FileSpreadsheet, LayoutDashboard, Upload, X } from 'lucide-react';
import type { LogicalField } from '@/types/mappings';
import { LOGICAL_FIELDS } from '@/types/mappings';
import { Button } from '@/components/ui/button';
import { ScrubOnUnmount } from '@/components/common/ScrubOnUnmount';
import { Card } from '@/components/ui/card';
import { ErrorMessage, LoadingIndicator, Notice } from '@/components/common/Common';
import { applyMappingTemplate, buildValueMappings, hasRecognizableFields, initialSetup, sliceSource } from '@/lib/normalization/datasetBuilder';
import { buildMappingTemplate, parseMappingTemplate } from '@/lib/normalization/mappingTemplate';
import { downloadBlob } from '@/lib/export/download';
import { useToast } from '@/components/common/Toast';
import { formatBytes } from '@/lib/text';
import { cn } from '@/lib/utils';
import type { DatasetController } from '@/hooks/useDataset';
import { WorksheetSelector } from './WorksheetSelector';
import { DataPreview } from './DataPreview';
import { ColumnMapping } from './ColumnMapping';
import { ValueMapping } from './ValueMapping';

const STEPS = [
  { key: 'source', label: 'Source & preview' },
  { key: 'columns', label: 'Column mapping' },
  { key: 'values', label: 'Value mapping' },
] as const;

type StepKey = (typeof STEPS)[number]['key'];

export function SetupWizard({ controller }: { controller: DatasetController }) {
  const draft = controller.draft!;
  const { parsed, config } = draft;
  const [step, setStep] = useState<StepKey>('source');
  const table = useMemo(() => sliceSource(parsed, config.headerRowIndex), [parsed, config.headerRowIndex]);
  const busy = controller.parsing || controller.building;
  const empty = parsed.rows.length === 0;
  const recognizable = hasRecognizableFields(config.columnMapping);
  const noDataRows = !empty && table.dataRows.length === 0;
  const canGenerate = !busy && !empty && !noDataRows && recognizable;
  const stepIndex = STEPS.findIndex((s) => s.key === step);
  const notify = useToast();
  const [mappingError, setMappingError] = useState<string | null>(null);
  const mappingFileInput = useRef<HTMLInputElement>(null);

  const saveMappingTemplate = () => {
    const template = buildMappingTemplate(table.headers, config);
    const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json;charset=utf-8' });
    downloadBlob(blob, `${parsed.fileName.replace(/\.[^./]+$/, '')}-mapping.json`);
    notify('Mapping template saved. Load it the next time you upload a similar export.');
  };

  const loadMappingTemplate = async (file: File) => {
    setMappingError(null);
    const text = await file.text();
    const template = parseMappingTemplate(text);
    if (!template) {
      setMappingError(`"${file.name}" is not a recognizable mapping template.`);
      return;
    }
    const applied = applyMappingTemplate(table, template);
    controller.updateDraftConfig({ ...config, ...applied });
    notify('Mapping template applied. Columns and statuses were matched by name — review Column mapping and Value mapping before generating the dashboard.');
  };

  const setColumn = (field: LogicalField, column: number | null) => {
    const mapping = { ...config.columnMapping };
    // One source column feeds one field: reassigning a column unmaps its previous field.
    if (column !== null) for (const f of LOGICAL_FIELDS) if (mapping[f] === column) mapping[f] = null;
    mapping[field] = column;
    controller.updateDraftConfig({ ...config, columnMapping: mapping, values: buildValueMappings(table, mapping, config.values) });
  };

  return (
    <ScrubOnUnmount className="mx-auto w-full max-w-6xl space-y-4 px-4 py-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <FileSpreadsheet className="h-6 w-6 shrink-0 text-primary" aria-hidden />
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold" title={parsed.fileName}>
              {draft.isEdit ? 'Edit mappings' : 'Confirm data mapping'} — {parsed.fileName}
            </h2>
            <p className="text-xs text-muted-foreground">
              {formatBytes(parsed.fileSize)} · {parsed.kind.toUpperCase()} · {table.dataRows.length.toLocaleString()} rows below the header
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" disabled={empty} onClick={saveMappingTemplate} title="Save the column and value mapping as a local JSON file, to reuse on the next export">
            <Download /> Save mapping
          </Button>
          <Button variant="outline" size="sm" disabled={empty} onClick={() => mappingFileInput.current?.click()} title="Apply a mapping template saved earlier, matched to this file by column name">
            <Upload /> Load mapping
          </Button>
          <input
            ref={mappingFileInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void loadMappingTemplate(file);
            }}
          />
          <Button variant="outline" size="sm" onClick={controller.cancelDraft}>
            <X /> {draft.isEdit ? 'Discard changes' : 'Cancel import'}
          </Button>
        </div>
      </div>

      <nav aria-label="Setup steps" className="grid grid-cols-3 gap-2">
        {STEPS.map((s, i) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setStep(s.key)}
            aria-current={step === s.key ? 'step' : undefined}
            className={cn(
              'flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors',
              step === s.key ? 'border-primary bg-accent font-medium text-accent-foreground' : 'bg-card hover:bg-secondary',
            )}
          >
            <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs', step === s.key ? 'bg-primary text-primary-foreground' : 'bg-secondary')}>{i + 1}</span>
            <span className="truncate">{s.label}</span>
          </button>
        ))}
      </nav>

      {controller.failure && (
        <ErrorMessage title={controller.failure.error.title}>
          <p>{controller.failure.error.message}</p>
        </ErrorMessage>
      )}
      {mappingError && (
        <ErrorMessage title="Could not load mapping template">
          <p>{mappingError}</p>
        </ErrorMessage>
      )}
      {parsed.warnings.map((w) => (
        <Notice key={w} tone="warning">
          {w}
        </Notice>
      ))}

      <Card className="p-4 sm:p-5">
        {controller.parsing && <LoadingIndicator label="Loading worksheet…" fraction={controller.progress?.fraction} />}
        {!controller.parsing && step === 'source' && (
          <div className="space-y-4">
            <WorksheetSelector
              parsed={parsed}
              headerRowIndex={config.headerRowIndex}
              dateOrder={config.dateOrder}
              disabled={busy}
              onSheetChange={(sheetName) => controller.reparseDraft({ sheetName })}
              onDelimiterChange={(delimiter) => controller.reparseDraft({ delimiter })}
              onHeaderRowChange={(index) => controller.updateDraftConfig(initialSetup(parsed, config.dateOrder, index))}
              onDateOrderChange={(dateOrder) => controller.updateDraftConfig({ ...config, dateOrder })}
            />
            {empty ? (
              <ErrorMessage title="The selected worksheet is empty">Choose another worksheet that contains issue records.</ErrorMessage>
            ) : noDataRows ? (
              <ErrorMessage title="No rows below the header">The selected header row is the last row of the sheet. Choose an earlier header row.</ErrorMessage>
            ) : (
              <DataPreview headers={table.headers} dataRows={table.dataRows} firstDataRowNumber={table.firstDataRowNumber} mapping={config.columnMapping} />
            )}
          </div>
        )}
        {!controller.parsing && step === 'columns' && !empty && (
          <div className="space-y-4">
            {!recognizable && (
              <ErrorMessage title="No issue-tracking columns recognized">
                None of Issue ID, Title, Status, Assignee or Priority could be detected. Check the header row on step 1, or map the columns manually below.
              </ErrorMessage>
            )}
            <ColumnMapping headers={table.headers} dataRows={table.dataRows} mapping={config.columnMapping} onChange={setColumn} />
          </div>
        )}
        {!controller.parsing && step === 'values' && !empty && (
          <ValueMapping values={config.values} mapping={config.columnMapping} onChange={(values) => controller.updateDraftConfig({ ...config, values })} />
        )}
        {!controller.parsing && empty && step !== 'source' && <Notice>Select a worksheet with data on step 1.</Notice>}
      </Card>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2">
          <Button variant="outline" disabled={stepIndex === 0} onClick={() => setStep(STEPS[stepIndex - 1].key)}>
            <ArrowLeft /> Back
          </Button>
          <Button variant="outline" disabled={stepIndex === STEPS.length - 1} onClick={() => setStep(STEPS[stepIndex + 1].key)}>
            Next <ArrowRight />
          </Button>
        </div>
        <div className="flex items-center gap-3">
          {controller.building && <span className="text-sm text-muted-foreground">Building dashboard…</span>}
          <Button onClick={controller.confirmDraft} disabled={!canGenerate} size="lg">
            <LayoutDashboard /> {draft.isEdit ? 'Apply and update dashboard' : 'Generate dashboard'}
          </Button>
        </div>
      </div>
    </ScrubOnUnmount>
  );
}
