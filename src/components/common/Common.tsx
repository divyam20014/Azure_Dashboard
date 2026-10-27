import { useState, type ReactNode } from 'react';
import { AlertTriangle, ChevronRight, Info, Loader2, Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';

interface SectionProps {
  id: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Allow the user to collapse the section. Content stays mounted, so no state is lost. */
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  /** Short summary shown while collapsed, e.g. "12 findings". */
  collapsedSummary?: ReactNode;
}

/** A titled dashboard section; `id` doubles as the in-page navigation anchor. */
export function Section({ id, title, description, actions, children, className, collapsible, defaultCollapsed = false, collapsedSummary }: SectionProps) {
  const [collapsed, setCollapsed] = useState(collapsible ? defaultCollapsed : false);
  const contentId = `${id}-content`;
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={cn('scroll-mt-[calc(var(--header-offset,112px)+12px)] space-y-3', className)}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 items-start gap-2">
          {collapsible && (
            <button
              type="button"
              className="no-print mt-0.5 rounded-md p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-expanded={!collapsed}
              aria-controls={contentId}
              aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${title}`}
              onClick={() => setCollapsed((c) => !c)}
            >
              <ChevronRight className={cn('h-5 w-5 transition-transform', !collapsed && 'rotate-90')} aria-hidden />
            </button>
          )}
          <div className="min-w-0">
            <h2 id={`${id}-title`} className="section-title">
              {title}
            </h2>
            {collapsed && collapsedSummary ? (
              <p className="mt-0.5 text-sm text-muted-foreground" data-testid={`${id}-collapsed-summary`}>
                {collapsedSummary}
              </p>
            ) : (
              description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
            )}
          </div>
        </div>
        {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      <div id={contentId} hidden={collapsed} className="space-y-3">
        {children}
      </div>
    </section>
  );
}

interface PanelProps {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Card wrapper for one chart or table. */
export function Panel({ title, description, actions, children, className }: PanelProps) {
  return (
    <Card className={cn('flex min-w-0 flex-col print-avoid-break', className)}>
      <div className="flex flex-wrap items-start justify-between gap-2 p-4 pb-2 sm:px-5">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold leading-tight">{title}</h3>
          {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      <div className="min-w-0 flex-1 px-4 pb-4 sm:px-5">{children}</div>
    </Card>
  );
}

export function EmptyState({ title, children, className }: { title: string; children?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 rounded-md border border-dashed px-4 py-10 text-center', className)}>
      <Inbox className="h-6 w-6 text-muted-foreground" aria-hidden />
      <p className="text-sm font-medium">{title}</p>
      {children && <div className="max-w-md text-sm text-muted-foreground">{children}</div>}
    </div>
  );
}

export function ErrorMessage({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div role="alert" className="flex gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-semibold text-destructive">{title}</p>
        {children && <div className="text-foreground/90">{children}</div>}
        {action}
      </div>
    </div>
  );
}

export function Notice({ tone = 'info', children, className }: { tone?: 'info' | 'warning'; children: ReactNode; className?: string }) {
  const Icon = tone === 'warning' ? AlertTriangle : Info;
  return (
    <div
      className={cn(
        'flex gap-2 rounded-md border p-3 text-sm',
        tone === 'warning' ? 'border-warning/40 bg-warning/10' : 'border-primary/20 bg-accent/60',
        className,
      )}
    >
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', tone === 'warning' ? 'text-warning' : 'text-primary')} aria-hidden />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function LoadingIndicator({ label, fraction }: { label: string; fraction?: number }) {
  return (
    <div className="flex flex-col gap-2" role="status" aria-live="polite">
      <div className="flex items-center gap-2 text-sm">
        <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden />
        <span>{label}</span>
        {fraction !== undefined && <span className="tabular text-muted-foreground">{Math.round(fraction * 100)}%</span>}
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
        {fraction !== undefined ? (
          <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${Math.round(fraction * 100)}%` }} />
        ) : (
          <div className="h-full w-1/3 animate-pulse rounded-full bg-primary/70" />
        )}
      </div>
    </div>
  );
}

/** Small colored square used beside text so identity never relies on colored text. */
export function Swatch({ color, className }: { color: string; className?: string }) {
  return <span aria-hidden className={cn('inline-block h-2.5 w-2.5 shrink-0 rounded-[3px]', className)} style={{ backgroundColor: color }} />;
}
