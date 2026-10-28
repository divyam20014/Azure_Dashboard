import { useEffect, useState } from 'react';
import {
  Activity,
  AlertOctagon,
  ArrowRightLeft,
  ChevronsLeft,
  ChevronsRight,
  FileBarChart2,
  GitCompare,
  LayoutDashboard,
  Lightbulb,
  ListOrdered,
  ShieldCheck,
  Siren,
  Table2,
  Users,
  Wand2,
  type LucideIcon,
} from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

export interface SidebarSection {
  id: string;
  label: string;
  icon: LucideIcon;
}

export const DASHBOARD_SECTIONS: SidebarSection[] = [
  { id: 'overview', label: 'Executive', icon: LayoutDashboard },
  { id: 'active-work', label: 'Active Work', icon: Siren },
  { id: 'summary', label: 'Summary', icon: Lightbulb },
  { id: 'risks', label: 'Risks', icon: AlertOctagon },
  { id: 'status', label: 'Status', icon: Activity },
  { id: 'priority', label: 'Priority', icon: ListOrdered },
  { id: 'assignees', label: 'Assignees', icon: Users },
  { id: 'builder', label: 'Chart Builder', icon: Wand2 },
  { id: 'handoff', label: 'Handoff', icon: ArrowRightLeft },
  { id: 'register', label: 'Issues', icon: Table2 },
  { id: 'quality', label: 'Data Quality', icon: ShieldCheck },
  { id: 'comparison', label: 'Comparison', icon: GitCompare },
  { id: 'reports', label: 'Reports', icon: FileBarChart2 },
];

/** Scroll-spy: highlights the section currently visible just below the sticky header. */
function useActiveSection(ids: string[]): string | null {
  const [active, setActive] = useState<string | null>(ids[0] ?? null);
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const elements = ids.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => el !== null);
    if (elements.length === 0) return;
    const offset = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--header-offset'), 10) || 112;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) setActive(visible[0].target.id);
      },
      { rootMargin: `-${offset + 4}px 0px -65% 0px`, threshold: 0 },
    );
    for (const el of elements) observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join('|')]);
  return active;
}

function NavList({ sections, active, collapsed, onNavigate }: { sections: SidebarSection[]; active: string | null; collapsed?: boolean; onNavigate?: () => void }) {
  return (
    <ul className="space-y-0.5">
      {sections.map((s) => {
        const Icon = s.icon;
        const isActive = active === s.id;
        return (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              onClick={onNavigate}
              aria-current={isActive ? 'location' : undefined}
              title={collapsed ? s.label : undefined}
              className={cn(
                'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors',
                collapsed && 'justify-center px-0',
                isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
              )}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden />
              {!collapsed && <span className="truncate">{s.label}</span>}
            </a>
          </li>
        );
      })}
    </ul>
  );
}

interface Props {
  sections: SidebarSection[];
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

/** Collapsible left navigation: a persistent rail on tablet/desktop, a slide-in drawer on phones. */
export function DashboardSidebar({ sections, collapsed, onToggleCollapse, mobileOpen, onCloseMobile }: Props) {
  const active = useActiveSection(sections.map((s) => s.id));

  return (
    <>
      <aside
        className={cn('no-print sticky hidden shrink-0 self-start overflow-y-auto border-r bg-card/60 py-3 transition-[width] duration-150 md:block', collapsed ? 'w-14 px-1.5' : 'w-56 px-2.5')}
        style={{ top: 'var(--header-offset, 112px)', height: 'calc(100dvh - var(--header-offset, 112px))' }}
        aria-label="Dashboard sections"
      >
        <NavList sections={sections} active={active} collapsed={collapsed} />
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          className="mt-2 flex w-full items-center justify-center rounded-md border py-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          {collapsed ? <ChevronsRight className="h-4 w-4" aria-hidden /> : <ChevronsLeft className="h-4 w-4" aria-hidden />}
        </button>
      </aside>

      <Sheet open={mobileOpen} onOpenChange={(open) => !open && onCloseMobile()}>
        <SheetContent aria-describedby="sections-drawer-desc" className="inset-y-0 left-0 right-auto w-72 max-w-[82vw] border-l-0 border-r md:hidden">
          <SheetTitle className="text-sm font-semibold">Dashboard sections</SheetTitle>
          <SheetDescription id="sections-drawer-desc" className="sr-only">
            Jump to a section of the dashboard.
          </SheetDescription>
          <div className="mt-3">
            <NavList sections={sections} active={active} onNavigate={onCloseMobile} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
