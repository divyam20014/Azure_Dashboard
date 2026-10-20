import { useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Wand2 } from 'lucide-react';
import type { WorkflowCategory } from '@/types/issue';
import type { AssigneeRule, ColumnMapping, PriorityRule, StatusRule, ValueMappings } from '@/types/mappings';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Notice } from '@/components/common/Common';
import { CORE_STATUSES, CATEGORY_LABELS, buildStatusColors } from '@/lib/normalization/statusNormalizer';
import { mergePriorityOrder, priorityColors, recognizePriority } from '@/lib/normalization/priorityNormalizer';
import { NO_PRIORITY_LABEL, UNKNOWN_PRIORITY_LABEL } from '@/types/issue';
import { formatCount } from '@/lib/text';

interface Props {
  values: ValueMappings;
  mapping: ColumnMapping;
  onChange: (values: ValueMappings) => void;
}

const STATUS_SUGGESTIONS = [...CORE_STATUSES, 'Active', 'In Progress', 'Blocked', 'On Hold', 'Testing', 'Pending', 'Resolved', 'Done', 'Removed', 'Cancelled', 'Ready for Development'];

function SubHeading({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </div>
  );
}

function sourceText(rule: { sourceLabel: string }) {
  return rule.sourceLabel === '' ? <span className="italic text-muted-foreground">(blank)</span> : rule.sourceLabel;
}

function StatusMapping({ values, onChange }: Omit<Props, 'mapping'>) {
  const rules = useMemo(() => Object.values(values.status).sort((a, b) => b.count - a.count), [values.status]);
  const suggestions = rules.filter((r) => r.category === 'unmapped' && r.suggestedCategory);
  const unmapped = rules.filter((r) => r.category === 'unmapped');

  const update = (next: Record<string, StatusRule>) => {
    const labels = [...new Set(Object.values(next).map((r) => r.label.trim() || r.sourceLabel))];
    onChange({ ...values, status: next, statusColors: buildStatusColors(labels, values.statusColors) });
  };
  const patch = (key: string, p: Partial<StatusRule>) => update({ ...values.status, [key]: { ...values.status[key], ...p } });
  const applySuggestions = () => {
    const next = { ...values.status };
    for (const r of suggestions) next[r.key] = { ...r, category: r.suggestedCategory! };
    update(next);
  };
  const labels = [...new Set(rules.map((r) => r.label))];

  return (
    <div>
      <SubHeading title="Status classification">
        {suggestions.length > 0 && (
          <Button size="sm" variant="outline" onClick={applySuggestions}>
            <Wand2 /> Apply {suggestions.length} suggested categor{suggestions.length === 1 ? 'y' : 'ies'}
          </Button>
        )}
      </SubHeading>
      <p className="mb-2 text-xs text-muted-foreground">
        Map each source status to a normalized status and a workflow category. Statuses are never assumed to be open or closed — anything left as <b>Unmapped</b> is reported
        separately and excluded from open / closed totals.
      </p>
      {unmapped.length > 0 && (
        <Notice tone="warning" className="mb-2">
          {unmapped.length} status value(s) are Unmapped ({unmapped.reduce((s, r) => s + r.count, 0).toLocaleString()} records).
        </Notice>
      )}
      <datalist id="status-suggestions">
        {STATUS_SUGGESTIONS.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <div className="max-h-[360px] overflow-auto rounded-md border">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="sticky top-0 z-10 bg-secondary text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Source status</th>
              <th className="px-3 py-2 text-right font-medium">Records</th>
              <th className="px-3 py-2 text-left font-medium">Normalized status</th>
              <th className="px-3 py-2 text-left font-medium">Workflow category</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.key} className="border-t">
                <td className="px-3 py-1.5">{sourceText(r)}</td>
                <td className="tabular px-3 py-1.5 text-right">{formatCount(r.count)}</td>
                <td className="px-3 py-1.5">
                  <Input aria-label={`Normalized status for ${r.sourceLabel || 'blank'}`} className="h-8" list="status-suggestions" value={r.label} onChange={(e) => patch(r.key, { label: e.target.value })} />
                </td>
                <td className="px-3 py-1.5">
                  <div className="flex items-center gap-2">
                    <NativeSelect
                      aria-label={`Workflow category for ${r.sourceLabel || 'blank'}`}
                      className="w-40"
                      value={r.category}
                      onChange={(e) => patch(r.key, { category: e.target.value as WorkflowCategory })}
                    >
                      <option value="unmapped">{CATEGORY_LABELS.unmapped}</option>
                      <option value="open">{CATEGORY_LABELS.open}</option>
                      <option value="closed">{CATEGORY_LABELS.closed}</option>
                    </NativeSelect>
                    {r.category === 'unmapped' && r.suggestedCategory && <span className="text-xs text-muted-foreground">suggested: {CATEGORY_LABELS[r.suggestedCategory]}</span>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3">
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">Status colors (used consistently in cards, charts and tables)</p>
        <div className="flex flex-wrap gap-2">
          {labels.map((label) => (
            <label key={label} className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs">
              <input
                type="color"
                aria-label={`Color for ${label}`}
                className="h-5 w-6 cursor-pointer rounded border-0 bg-transparent p-0"
                value={values.statusColors[label] ?? '#64748b'}
                onChange={(e) => onChange({ ...values, statusColors: { ...values.statusColors, [label]: e.target.value } })}
              />
              {label}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

function PriorityMapping({ values, onChange }: Omit<Props, 'mapping'>) {
  const rules = useMemo(() => Object.values(values.priority).sort((a, b) => b.count - a.count), [values.priority]);
  const numeric = rules.some((r) => r.numeric);
  const colors = priorityColors(values.priorityOrder);

  const update = (next: Record<string, PriorityRule>) => {
    const labels = Object.values(next).map((r) => r.label.trim() || r.sourceLabel);
    const priorityOrder = mergePriorityOrder(labels, values.priorityOrder);
    onChange({ ...values, priority: next, priorityOrder, highPriority: values.highPriority.filter((l) => priorityOrder.includes(l)) });
  };
  const patch = (key: string, p: Partial<PriorityRule>) => update({ ...values.priority, [key]: { ...values.priority[key], ...p } });
  /** "Unknown" means the value explicitly says the priority is not known (e.g. TBD) — kept apart from blank cells. */
  const setUnknown = (rule: PriorityRule, unknown: boolean) => {
    if (unknown) return patch(rule.key, { unknown: true, confirmed: true, label: UNKNOWN_PRIORITY_LABEL });
    const recognized = recognizePriority(rule.sourceLabel);
    patch(rule.key, { unknown: false, confirmed: recognized !== null, label: recognized?.label ?? rule.sourceLabel });
  };
  const move = (index: number, delta: number) => {
    const order = [...values.priorityOrder];
    const target = index + delta;
    if (target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target], order[index]];
    onChange({ ...values, priorityOrder: order });
  };
  const toggleHigh = (label: string) => {
    const set = new Set(values.highPriority);
    if (set.has(label)) set.delete(label);
    else set.add(label);
    onChange({ ...values, highPriority: values.priorityOrder.filter((l) => set.has(l)) });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
      <div>
        <SubHeading title="Priority values" />
        <p className="mb-2 text-xs text-muted-foreground">
          Recognized notations (P1, Priority 2, Critical, High…) are confirmed automatically. Custom values keep their label and are reported as unmapped until you confirm them.
          Tick <b>Unknown</b> for values that mean the priority is not known (e.g. TBD); they are reported separately from blank cells and never join the high-priority group.
          Severity is a separate field and is never treated as priority.
        </p>
        {numeric && (
          <Notice tone="warning" className="mb-2">
            Bare numbers were labelled as P-levels (1 → P1). Confirm that 1 is the highest priority in your tracker, or adjust the labels and order.
          </Notice>
        )}
        <div className="max-h-[320px] overflow-auto rounded-md border">
          <table className="w-full min-w-[420px] text-sm">
            <thead className="sticky top-0 z-10 bg-secondary text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Source value</th>
                <th className="px-3 py-2 text-right font-medium">Records</th>
                <th className="px-3 py-2 text-left font-medium">Priority label</th>
                <th className="px-3 py-2 text-center font-medium">Confirmed</th>
                <th className="px-3 py-2 text-center font-medium">Unknown</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.key} className="border-t">
                  <td className="px-3 py-1.5">{sourceText(r)}</td>
                  <td className="tabular px-3 py-1.5 text-right">{formatCount(r.count)}</td>
                  <td className="px-3 py-1.5">
                    <Input aria-label={`Priority label for ${r.sourceLabel || 'blank'}`} className="h-8" value={r.label} disabled={r.key === '' || r.unknown} onChange={(e) => patch(r.key, { label: e.target.value })} />
                  </td>
                  <td className="px-3 py-1.5 text-center">
                    {r.key === '' ? (
                      <span className="text-xs text-muted-foreground">missing</span>
                    ) : (
                      <Checkbox aria-label={`Confirm priority ${r.sourceLabel}`} checked={r.confirmed} disabled={r.unknown} onChange={(e) => patch(r.key, { confirmed: e.target.checked })} />
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-center">
                    {r.key === '' ? null : <Checkbox aria-label={`Priority ${r.sourceLabel} means unknown`} checked={!!r.unknown} onChange={(e) => setUnknown(r, e.target.checked)} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div>
        <SubHeading title="Priority order and high-priority group" />
        <p className="mb-2 text-xs text-muted-foreground">Top = highest priority. Tick the levels that form the high-priority group.</p>
        <ol className="space-y-1">
          {values.priorityOrder.map((label, i) => (
            <li key={label} className="flex items-center gap-2 rounded-md border px-2 py-1 text-sm">
              <span className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: colors[label] }} aria-hidden />
              <span className="tabular w-5 text-xs text-muted-foreground">{i + 1}.</span>
              <span className="min-w-0 flex-1 truncate">{label}</span>
              <label className="flex items-center gap-1 text-xs">
                <Checkbox
                  checked={values.highPriority.includes(label)}
                  disabled={label === UNKNOWN_PRIORITY_LABEL || label === NO_PRIORITY_LABEL}
                  onChange={() => toggleHigh(label)}
                  aria-label={`Include ${label} in high-priority group`}
                />
                High
              </label>
              <Button size="icon" variant="ghost" className="h-7 w-7" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${label} up`}>
                <ArrowUp />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" disabled={i === values.priorityOrder.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${label} down`}>
                <ArrowDown />
              </Button>
            </li>
          ))}
        </ol>
        {values.highPriority.length === 0 && values.priorityOrder.length > 0 && (
          <Notice tone="warning" className="mt-2">
            No high-priority group is selected; the high-priority table will be empty.
          </Notice>
        )}
      </div>
    </div>
  );
}

const ASSIGNEE_PAGE = 50;

function AssigneeMapping({ values, onChange }: Omit<Props, 'mapping'>) {
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(ASSIGNEE_PAGE);
  const rules = useMemo(() => Object.values(values.assignee).sort((a, b) => b.count - a.count || a.sourceLabel.localeCompare(b.sourceLabel)), [values.assignee]);
  const filtered = search ? rules.filter((r) => r.sourceLabel.toLowerCase().includes(search.toLowerCase())) : rules;
  const patch = (key: string, p: Partial<AssigneeRule>) => onChange({ ...values, assignee: { ...values.assignee, [key]: { ...values.assignee[key], ...p } } });

  return (
    <div>
      <SubHeading title={`Assignees (${rules.length})`}>
        <Input aria-label="Search assignees" placeholder="Search assignees…" className="h-8 w-56" value={search} onChange={(e) => setSearch(e.target.value)} />
      </SubHeading>
      <p className="mb-2 text-xs text-muted-foreground">
        Names are trimmed and grouped case-insensitively only — different spellings are never merged automatically. To merge two entries, give them the same display name.
      </p>
      <div className="max-h-[360px] overflow-auto rounded-md border">
        <table className="w-full min-w-[460px] text-sm">
          <thead className="sticky top-0 z-10 bg-secondary text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Source value</th>
              <th className="px-3 py-2 text-right font-medium">Records</th>
              <th className="px-3 py-2 text-left font-medium">Display name</th>
              <th className="px-3 py-2 text-center font-medium">Unassigned</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, limit).map((r) => (
              <tr key={r.key} className="border-t">
                <td className="max-w-[220px] truncate px-3 py-1.5" title={r.sourceLabel}>
                  {sourceText(r)}
                </td>
                <td className="tabular px-3 py-1.5 text-right">{formatCount(r.count)}</td>
                <td className="px-3 py-1.5">
                  <Input aria-label={`Display name for ${r.sourceLabel || 'blank'}`} className="h-8" value={r.label} disabled={r.unassigned} onChange={(e) => patch(r.key, { label: e.target.value })} />
                </td>
                <td className="px-3 py-1.5 text-center">
                  <Checkbox
                    aria-label={`Treat ${r.sourceLabel || 'blank'} as unassigned`}
                    checked={r.unassigned}
                    disabled={r.key === ''}
                    onChange={(e) => patch(r.key, { unassigned: e.target.checked, label: e.target.checked ? 'Unassigned' : r.sourceLabel })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtered.length > limit && (
        <Button variant="link" size="sm" onClick={() => setLimit((l) => l + ASSIGNEE_PAGE)}>
          Show more ({filtered.length - limit} remaining)
        </Button>
      )}
    </div>
  );
}

export function ValueMapping({ values, mapping, onChange }: Props) {
  return (
    <div className="space-y-8">
      {mapping.status !== null ? <StatusMapping values={values} onChange={onChange} /> : <Notice>Status is not mapped — map a Status column to classify statuses.</Notice>}
      {mapping.priority !== null ? <PriorityMapping values={values} onChange={onChange} /> : <Notice>Priority is not mapped — map a Priority column to configure priorities.</Notice>}
      {mapping.assignee !== null ? <AssigneeMapping values={values} onChange={onChange} /> : <Notice>Assignee is not mapped — map an Assignee column to review names.</Notice>}
      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        <Badge variant="secondary">All mappings are kept in memory for this session only</Badge>
      </div>
    </div>
  );
}
