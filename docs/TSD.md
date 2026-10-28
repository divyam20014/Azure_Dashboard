# Technical Specification Document (TSD)

## QA Issue Analytics Dashboard

| | |
|---|---|
| **Document version** | 1.0 |
| **Application version** | 1.0.0 |
| **Last updated** | 2026-10-28 |
| **Companion documents** | [BRD.md](BRD.md) (requirements), [USER_GUIDE.md](USER_GUIDE.md) (end-user guide), [../PRIVACY.md](../PRIVACY.md) (privacy verification detail), [../README.md](../README.md) (developer quick reference) |

---

## 1. Architecture Overview

The application is a **single-page, client-only React app**. There is no backend, no API, and no database. Every requirement in the BRD (§6, §8) is satisfied by code running entirely inside the user's browser tab, including file parsing (in a Web Worker), all analytics, chart rendering, and file export.

```
┌─────────────────────────────────────────────────────────────────────┐
│                              Browser tab                             │
│                                                                       │
│   File (.xlsx/.xls/.csv)                                             │
│        │  (local File object, read via Blob/FileReader)              │
│        ▼                                                              │
│   Web Worker (parsingWorker.ts)                                      │
│        │  SheetJS / Papa Parse → rows[][]                            │
│        ▼                                                              │
│   Normalization (src/lib/normalization)                              │
│        │  column detection, status/priority/assignee rules,          │
│        │  date parsing → IssueRecord[]                               │
│        ▼                                                              │
│   Analytics pipeline (useAnalytics, src/lib/analytics)                │
│        │  filters → aggregates → KPIs, risks, assignee metrics,       │
│        │  data-quality score, comparison, summary                    │
│        ▼                                                              │
│   React UI (src/components)                                          │
│        │  dashboard sections, chart builder, issue register,          │
│        │  report generator                                           │
│        ▼                                                              │
│   Export (src/lib/export, src/lib/charts/chartExport.ts)             │
│        CSV / XLSX / PNG / SVG / print-to-PDF — all via Blob +         │
│        object URL, downloaded locally, never uploaded                │
│                                                                       │
│   No step in this pipeline performs a network request.                │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.1 Data flow / scope stages

`useAnalytics` (`src/hooks/useAnalytics.ts`) defines the canonical scope pipeline every section reads from:

```
dataset.records (all valid, normalized rows)
   ──duplicate-ID rule──▶ included
   ──created-date range + global filters──▶ scoped   (KPIs, charts, risks, assignee figures, reports all read "scoped")
   ──chart/KPI/risk selection + search──▶ registerRecords   (Issue Register only)
```

This single, memoized pipeline guarantees that every KPI, chart, and export is computed from the same data under the same rules — there is exactly one aggregation function (`computeAggregates`), not one per screen.

## 2. Technology Stack

| Layer | Technology | Notes |
|---|---|---|
| UI framework | React 18.3, TypeScript 5.6 | Function components + hooks only. |
| Build tool | Vite 6 | Dev server, production build, static asset bundling. |
| Styling | Tailwind CSS 3.4 + `class-variance-authority` | Utility-first; dark mode via `prefers-color-scheme`/manual toggle. |
| UI primitives | Radix UI (`react-dialog`, `react-dropdown-menu`, `react-popover`) | Accessible unstyled primitives, styled locally in `src/components/ui`. |
| Icons | Lucide React | |
| Charts | Apache ECharts 6.1 (SVG renderer) + ZRender 6.1 (pinned) | Wrapped by a pure layout-rules module (`chartLayout.ts`) so charts never overlap/clip text. |
| Spreadsheet parsing | SheetJS 0.20.3 (from the SheetJS CDN tarball, not the npm registry mirror) | `.xlsx`/`.xls` read/write, including report workbook generation. |
| CSV parsing | Papa Parse 5.4 | Its remote-URL streaming feature is statically audited as never enabled. |
| Testing | Vitest 5, React Testing Library, `@testing-library/user-event` | Unit + integration + privacy/runtime tests. |
| Hosting | Any static file host | No server runtime required; ships as static `dist/`. |

No analytics, telemetry, error-reporting, AI, or database package is a dependency — enforced by `scripts/privacy-audit.mjs` (§9).

## 3. Repository / Module Structure

```
src/
  components/
    builder/        Custom Chart Builder UI (card, config panel, matrix table)
    charts/          Chart primitives: ECharts wrapper, layout engine, theme, per-type charts
    common/          Section/Panel/EmptyState/Notice/Toast/Theme/ScrubOnUnmount
    dashboard/       Executive dashboard, Active Work by Assignee, Risk panel, Status/
                     Priority/Assignee analytics, Handoff, Data Quality, Comparison,
                     DashboardContext (shared state surface for all sections)
    export/          Export menu, report generator UI, report print preview
    issues/          Issue register table, global filters, details drawer
    layout/          Header, sidebar navigation, lazy-mount wrapper, overall layout shell
    ui/              Design-system primitives (button, card, dialog, sheet, select, …)
    upload/          File upload, setup wizard, column/value mapping, worksheet selector
  hooks/             useDataset, useFilters, useAnalysisSettings, useAnalytics, useFileImport
  lib/
    analytics/       Pure functions: aggregate, executiveMetrics, riskAnalytics,
                     assigneeAnalytics, priorityAnalytics, statusAnalytics, dataQuality(Score),
                     snapshotComparison, summaryGenerator, filters
    charts/          Chart config types, dimensions, metric definitions, the chart-data
                     engine, compatibility rules, presets, export
    export/          Format-neutral report tables, CSV/Excel exporters, download helper
    normalization/   Column detection, status/priority/assignee normalizers, date parser,
                     datasetBuilder (rows → IssueRecord[]), mappingTemplate (save/load)
    parsers/         File sniffing, CSV/Excel parsers, import session, worker protocol
    privacy/         Session cleanup, chart-label cache cleanup
    reports/         Report templates, section availability, workbook assembly
  types/             issue.ts, mappings.ts, analytics.ts
  workers/           parsingWorker.ts (off-main-thread parsing)
  tests/             Unit, integration, privacy/release test suites
```

## 4. Data Model

### 4.1 Core record — `IssueRecord` (`src/types/issue.ts`)

One row of the imported file, after normalization. Key fields: `index`, `sourceRow`, `id`, `title`, `statusRaw`/`status`/`statusCategory`, `priorityRaw`/`priority`, `assigneeRaw`/`assignee`/`isUnassigned`, `type`, `project`, `area`, `iteration`, `severity`, `reporter`, `tags`, `resolution`, `developer`, `environment`, `created`/`updated`/`closed` (`Date | null`), `invalidDates`, `isDuplicateId`/`isFirstOfId`, and `cells` (the raw row, for the details drawer).

`WorkflowCategory = 'closed' | 'open' | 'unmapped'` is the three-bucket classification described in the BRD glossary.

### 4.2 Configuration — `src/types/mappings.ts`

- `ColumnMapping`: `Record<LogicalField, number | null>` — one source column index per logical field (`id`, `title`, `status`, `assignee`, `priority`, `severity`, `type`, `created`, `updated`, `closed`, `reporter`, `project`, `area`, `iteration`, `tags`, `resolution`, `developer`, `environment`).
- `ValueMappings`: per-field normalization rules —
  - `status: Record<key, StatusRule>` — `{ key, sourceLabel, label, category, suggestedCategory, count }`.
  - `priority: Record<key, PriorityRule>` — `{ key, sourceLabel, label, confirmed, numeric, unknown?, count }`.
  - `assignee: Record<key, AssigneeRule>` — `{ key, sourceLabel, label, unassigned, count }`.
  - `priorityOrder: string[]`, `highPriority: string[]`, `statusColors: Record<string, string>`.
- `SetupConfig`: `{ sheetName, headerRowIndex, columnMapping, values, dateOrder }` — the complete, serializable description of how a file is interpreted. This is exactly what a **mapping template** (§7.6) exports/imports.

### 4.3 Aggregation output — `src/types/analytics.ts`

- `Dataset`: the active, fully built import — `{ file, headers, config, records, totalDataRows, blankRows, quality, projectName }`.
- `Aggregates`: one pass over the in-scope records — totals, `byStatus`, `byCategory`, `byPriority`, `byAssignee: AssigneeAggregate[]`, `byType`, cross-tabs (`priorityStatus`, `priorityCategory`).
- `AssigneeAggregate`: `{ name, isUnassigned, total, open, closed, unmapped, byStatus, byPriority, byPriorityOpen }`.
- `Criteria` / `Selection`: the filter/selection model shared by every clickable KPI, chart, and risk card.

## 5. Key Subsystems and Algorithms

### 5.1 File parsing (`src/lib/parsers`, `src/workers/parsingWorker.ts`)

- **Content sniffing** (`fileSniffer.ts`) identifies the real file type (ZIP/OLE/text signatures) instead of trusting the extension, so a mislabeled file is still handled or rejected with an accurate error.
- Parsing of `.xlsx`/`.xls` (SheetJS) and `.csv` (Papa Parse) runs inside a **Web Worker** (`parsingWorker.ts`) via a small message protocol (`workerProtocol.ts`), with progress reporting and cancellation, so a large file does not freeze the UI. A main-thread fallback exists for environments without Worker support.
- `importSession.ts` orchestrates open → parse → cancel/replace, and `importErrors.ts` classifies failures (empty file, password-protected workbook, corrupt data, oversized) into user-facing messages.

### 5.2 Normalization (`src/lib/normalization`)

- `columnDetector.ts`: header-row detection and best-effort column→field matching by header text.
- `statusNormalizer.ts`: the status-alias system.
  - `CORE_STATUSES` (auto-categorized): Closed, New, Reopened, Ready for QA, Development in Progress.
  - `ACTIVE_FOCUS_STATUSES`: New, Reopened, Development in Progress — drives the Active Work by Assignee view (§6.2).
  - `KNOWN_STATUSES`: a larger alias table (recognized by name, category only *suggested*, never auto-applied, except for the five core statuses) including the Azure DevOps/UAT-cycle states added for this organization's workflow: QA in Progress, On Hold, Resolved in UAT, Closed in UAT, Ignore, plus generic equivalents (Active, In Progress, Blocked, Testing, Done, Resolved, Removed, Cancelled, Rejected, Fixed, Duplicate, Won't Fix).
  - Matching is done on a **compact key** (`compactKey`: lower-cased, alphanumeric-only) so "Re-Open", "REOPENED", and "reopn" all match the same alias.
- `priorityNormalizer.ts`: recognizes P1–P5/Priority N/Critical-High-Medium-Low-type values; bare numbers are labeled as P-levels with a "confirm the convention" notice; explicit "unknown" values (TBD, N/A) are a distinct `Unknown` priority, never silently blank.
- `assigneeNormalizer.ts`: case/whitespace-insensitive grouping; blank/placeholder detection for "Unassigned".
- `dateParser.ts`: configurable M/D/Y vs D/M/Y text-date parsing; a column cannot silently mix both — invalid dates are reported, not guessed.
- `datasetBuilder.ts`: turns the sliced source table into `IssueRecord[]`, flags duplicate IDs, computes `projectName`, and calls `computeDataQuality`. Also hosts:
  - `buildValueMappings(table, mapping, previous?)` — (re)builds value rules for the current column mapping, carrying forward any prior user edits whose source value key still exists.
  - `comparisonSetup(file, reference)` — maps a second (comparison) file onto the first file's mapping **by header name**, with a detected-mapping fallback for renamed columns.
  - `applyMappingTemplate(table, reference)` — the same by-name matching technique, used to apply a **saved mapping template** (§7.6) to a newly uploaded file.
- `mappingTemplate.ts`: `buildMappingTemplate`/`parseMappingTemplate` — serializes/validates a `{ version, headers, columnMapping, values, dateOrder }` JSON document used for the save/load-mapping feature. Validation is structural (shape-checked field by field) so a malformed or unrelated JSON file is rejected with a clear error rather than crashing the importer.

### 5.3 Analytics pipeline (`src/lib/analytics`, `src/hooks/useAnalytics.ts`)

| Module | Responsibility |
|---|---|
| `filters.ts` | Applies the duplicate-ID counting rule, created-date range, global field criteria, chart/KPI selection, and search — in that fixed order (see §1.1). |
| `aggregate.ts` | `computeAggregates` — the single pass that produces every count/cross-tab the rest of the app reads. |
| `executiveMetrics.ts` | KPI-card figures and dataset scope counters (imported/valid/included/in-scope). |
| `riskAnalytics.ts` | The six risk indicators (high-priority backlog, reopened, aging, unassigned, incomplete/unmapped, QA queue) and `calculateAging` (day-bucketed age-since-creation for open issues only). |
| `assigneeAnalytics.ts` | Per-assignee metrics, leaderboard ("who has the most…"), sort/Top-N/search, and the assignee×priority matrix (`assigneePriorityMatrix`, all/open modes). |
| `priorityAnalytics.ts`, `statusAnalytics.ts` | Priority backlog/high-priority records; KPI definitions, closure %, and handoff-stage volumes. |
| `dataQuality.ts` / `dataQualityScore.ts` | Per-record findings and the weighted 0–100 score (8 rules; absent-but-unmapped fields are "not applicable," not penalized, unless marked required). |
| `snapshotComparison.ts` | Matches two record sets by ID; reports metric deltas and newly-observed / no-longer-present / status-moved-to/from-Closed sets. |
| `summaryGenerator.ts` | Rule-based (non-AI) natural-language executive summary from the computed `Aggregates`. |

`useAnalytics` composes all of the above into one memoized object (`Analytics`) consumed by every dashboard section through `DashboardContext`.

### 5.4 Chart engine (`src/lib/charts`, `src/components/charts`, `src/components/builder`)

- A single `buildChartData` function computes any configured chart (dimension × secondary grouping × metric × chart-level filters × sort/Top-N) from the dataset — the dashboard's fixed charts and the Custom Chart Builder's user-defined charts share this one engine, so figures are always consistent with the rest of the dashboard.
- `chartLayout.ts` is a **pure, unit-tested layout algorithm** (legend wrapping, label rotation/truncation, horizontal-vs-vertical orientation, axis tick density) that guarantees no overlapping or clipped text at any container width — verified by an automated overlap probe across multiple datasets and widths (documented in the README's verification log).
- `ChartShell` provides the common chart chrome: PNG (2×)/SVG export, full-screen, and an accessible text summary of the rendered data (for screen readers and for tests, since jsdom cannot lay out ECharts).
- `presets.ts` offers ~29 ready-made Assignee/Priority/State-wise views, filtered to only those the current dataset's mapping actually supports.

### 5.5 Reporting and export (`src/lib/reports`, `src/lib/export`)

- `reportTemplates.ts`: four templates (Daily QA Status, Weekly Management, Release Readiness, Developer/Tester Workload), each with a default section list and per-section availability rules (e.g., aging is unavailable without a Created-Date column).
- `reportWorkbook.ts` + `reportTables.ts`: builds format-neutral `ReportTable` objects (shared by CSV and Excel export) for every report section and quick-export sheet, then assembles the Excel workbook (frozen header rows, auto-filters).
- `excelExporter.ts` / `csvExporter.ts`: `.xlsx` cells are typed as strings where needed and CSV values starting with `=`, `+`, `-`, `@`, tab, or CR are prefixed with `'` — formula-injection mitigation (OWASP-aligned) on every export path.
- `download.ts`: the only file-saving mechanism in the app — builds a `Blob`, creates a short-lived `URL.createObjectURL`, triggers a hidden `<a download>`, and revokes the object URL — never a network request.
- `chartExport.ts`: PNG (canvas rasterization of the chart's own SVG) / SVG download for any chart.

### 5.6 State management (`src/hooks`)

| Hook | Owns |
|---|---|
| `useDataset` | Import lifecycle: `idle → parsing → setup → dashboard`, the active `Dataset`, comparison snapshot, replace/edit-mapping/clear flows. |
| `useFilters` | Global field filters, created-date range, counting rule (all/unique/review-duplicates), the current chart/KPI selection, search text/scope. |
| `useAnalysisSettings` | Aging thresholds, data-quality rule weights, required fields, workload concentration threshold, report options, and the list of Custom Chart Builder configurations. |
| `useAnalytics` | The read-only, memoized pipeline described in §1.1 and §5.3, parametrized by the three hooks above. |

All four hooks hold state **only in React memory** — see §6.

### 5.7 UI composition

- `DashboardContext` (`src/components/dashboard/DashboardContext.tsx`) is the single context every dashboard section reads from: `dataset`, `analytics`, `filters`, `settings`, `comparison`, and the `select`/`selectRecords`/`isSelected`/`openRecord`/`scrollToRegister` actions. This keeps every section's click-to-filter behavior consistent without prop drilling.
- `DashboardLayout` composes the sections in a fixed order behind a collapsible left **sidebar** (`DashboardSidebar.tsx`): a persistent, collapsible icon rail on tablet/desktop with scroll-spy active-section highlighting, and a slide-in drawer (built on the Radix Dialog–based `Sheet` primitive) on phone widths.
- `Section`/`Panel` (`src/components/common/Common.tsx`) are the two layout primitives every dashboard area is built from. `Section` supports `collapsible`/`defaultCollapsed`/`collapsedSummary`, so a section's content stays mounted (no lost filters/settings) while hidden via the `hidden` attribute.
- `LazyMount` (`src/components/layout/LazyMount.tsx`) defers mounting heavy below-the-fold sections (Assignee Workload, Data Quality, Handoff) until they approach the viewport (`IntersectionObserver`, 600 px margin), falling back to immediate rendering when `IntersectionObserver` is unavailable — this fallback is also what keeps those sections testable in jsdom, which has no `IntersectionObserver`.
- `ScrubOnUnmount` actively severs DOM/React references on unmount so that detached-but-still-referenced form controls (a known Chromium quirk) cannot keep an entire removed dashboard's text content reachable in memory after Clear Data (§6).

## 6. Security and Privacy Architecture

This is the most load-bearing non-functional requirement (BRD §6.10) and is treated as a first-class, continuously-verified architectural property, not an incidental fact.

| Guarantee | Mechanism |
|---|---|
| No network transmission | No application code calls `fetch`, `XMLHttpRequest`, `sendBeacon`, `WebSocket`, or `EventSource` — enforced by a static regex scan of every `.ts`/`.tsx` file (`scripts/privacy-audit.mjs`) and a runtime test that instruments all of those APIs plus storage/cookie APIs during a full upload→filter→export→print→clear flow (`src/tests/privacy/privacy.test.tsx`). |
| Content-Security-Policy | `connect-src 'none'` (plus `script-src 'self'`, `form-action 'none'`, `object-src 'none'`, `worker-src 'self' blob:`) shipped both as an HTML `<meta>` tag and as HTTP response headers (`vite preview`, `public/staticwebapp.config.json` for Azure Static Web Apps, `public/_headers` for Netlify/Cloudflare Pages) — the header form is required because a Web Worker takes its CSP from its own script's response headers, not the page's `<meta>` tag. |
| No persistence | No `localStorage`, `sessionStorage`, IndexedDB, cookies, Cache Storage, or service worker anywhere in the app. All state — dataset, mappings, filters, settings, custom charts, comparison snapshot — lives in React state and is discarded on refresh (with a confirmation prompt) or Clear Data. |
| No AI/analytics/telemetry | The executive summary is generated by fixed, auditable rules (`summaryGenerator.ts`), not a model call; no analytics/error-reporting/AI package is a dependency (checked by name pattern in the audit script). |
| Full memory release on Clear Data | Clear Data terminates the parsing worker, clears the file input, and resets every hook's state. Verified by heap-snapshot analysis to leave **0 strongly-reachable objects** referencing uploaded titles/assignees/statuses, after fixing three specific leak sources during development: stale memoized-callback closures (`useDataset`), detached-but-DOM-pinned form controls (`ScrubOnUnmount`), and ECharts/ZRender's module-level label-width cache (`src/lib/privacy/chartCacheCleanup.ts`). |
| Export safety | CSV/Excel formula-injection mitigation (§5.5); no export path ever opens a network connection — files are produced as in-memory `Blob`s and saved via a local object URL. |

### 6.1 Verification cadence

Every feature addition in this codebase has historically been accompanied by an independent verification pass (see the "Verification performed" section of the README) covering: Chrome NetLog capture (network), heap snapshots before/after Clear Data (memory), and a byte-scan of the browser profile directory (disk). This TSD treats that verification method as a **standing requirement** for any future change that touches parsing, storage, or export — not an optional nicety.

## 7. Notable Implementation Details Worth Preserving

These are specific design decisions a future maintainer should not casually "fix," because they encode a requirement:

1. **Workflow category is never inferred for non-core statuses.** Only Closed/New/Reopened/Ready-for-QA/Development-in-Progress get an automatic category; everything else starts `unmapped` and requires an explicit user choice, even when a "suggested" category is shown. This is deliberate (BR-10) — guessing wrong would silently corrupt closure %, aging, and backlog figures.
2. **Selections never change dashboard totals.** Clicking a KPI/chart/risk card only narrows the *Issue Register*; every other figure is computed from the unfiltered (global-filter-scoped) data, so totals never move unexpectedly underneath a user mid-analysis. A selection can be explicitly "applied to dashboard" to promote it to a global filter.
3. **Duplicate IDs are never silently excluded.** The default counting rule includes every row (with a visible warning); exclusion only happens when the user picks "exclude" or explicitly reviews and ticks individual duplicates.
4. **`LazyMount`'s `IntersectionObserver`-unavailable fallback must render immediately**, not just degrade gracefully — several integration tests depend on this exact behavior to exercise below-the-fold sections in jsdom, which has no `IntersectionObserver`. Do not add a global `IntersectionObserver` polyfill to the test setup without re-checking this fallback path.
5. **Mapping templates and comparison setup both match columns by header name, not position** (`applyMappingTemplate`, `comparisonSetup`), with a same-field auto-detected fallback — this is what makes them resilient to the exported column order changing between runs.

## 8. Performance Characteristics

(From the project's documented load testing on a representative development machine; re-verify on hardware changes.)

| Scenario | Result |
|---|---|
| Upload → dashboard, 100,000 rows × 50 columns | ~4.1 s |
| Global filter click, 3 builder charts open | ~0.57 s |
| Builder chart Excel export, 100k Chart Records | ~19.7 s |
| CSV parse, 100k × 50 | 2–6 s |
| Excel (`.xlsx`) parse, 100k × 50 (~64 MB file) | ~48 s (UI stays responsive via the Web Worker) |
| JS heap at 100k rows | ~470 MB with the Custom Chart Builder active |

**Implication for sizing guidance in the User Guide:** recommend CSV over Excel for very large exports, and note that Excel export of very large record sets is a multi-second, main-thread-blocking operation (SheetJS has no public streaming write API).

## 9. Testing Strategy

| Layer | Location | What it covers |
|---|---|---|
| Unit | `src/tests/analytics/`, `src/tests/normalization/`, `src/tests/parsing/`, `src/tests/export/` | Normalizers, column/header detection, date parsing, aggregation, KPIs, the assignee matrix, filters/counting rules, closure %, the rule-based summary, CSV escaping/formula-injection, workbook round-trip, chart-builder data engine, compatibility rules, presets, chart exports, layout rules. |
| Integration (jsdom + RTL) | `src/tests/integration/` | Full upload → mapping → dashboard → drill-down → filter → search → export → Clear Data flows, for both CSV and Excel; the Custom Chart Builder end-to-end; duplicate review; snapshot comparison; report template/section/preview/Excel generation. ECharts itself is replaced by a lightweight stand-in (`echartsMock.tsx`) since jsdom cannot lay out canvas/SVG charts — real rendering is verified separately in a browser. |
| Privacy / release | `src/tests/privacy/` | Instruments `fetch`, `XMLHttpRequest.open`, `sendBeacon`, `WebSocket`, `Storage.setItem`, `indexedDB.open`, and `document.cookie` across a full session and asserts none are called; a companion test asserts 0 strongly-reachable uploaded-data references after Clear Data. |
| Static / build audit | `scripts/privacy-audit.mjs`, `npm run privacy:check` | Source-code API scan, dependency-name scan, CSP presence in the production build, and an informational scan of third-party bundle contents. |

Run `npm test` for the full suite, `npm run typecheck` for strict TypeScript project-reference checking, and `npm run build && npm run privacy:check` before any release to also exercise the build-time checks.

**Test-authoring note:** because several dashboard sections now default to **collapsed** (see §10), any integration test that queries content inside Risks, Status, Priority, Assignee Workload, Chart Builder, Handoff, Data Quality, Comparison, or Reports must first expand that section (click its "Expand …" toggle button, `aria-label="Expand <Section title>"`) — a shared `expandSection(user, title)` test helper exists in `src/tests/integration/helpers.ts` for this.

## 10. UI/Navigation Architecture (current)

- **Navigation:** a collapsible left sidebar (`DashboardSidebar.tsx`) lists every section by icon + label, highlights the section currently under the sticky header via `IntersectionObserver`-based scroll-spy, and collapses to an icon-only rail or a slide-in drawer (phone widths) — replacing an earlier horizontal scrolling link bar.
- **Section default states:** Executive Dashboard, Active Work by Assignee, and the Issue Register are expanded by default; Executive Summary, Risks and Attention Required, Status, Priority, Assignee Workload, Custom Chart Builder, Handoff, Data Quality, Snapshot Comparison, and Reports start collapsed (Snapshot Comparison auto-expands once a snapshot is loaded). This is a deliberate information-density choice (BRD §4.1) — every section's content remains mounted while collapsed, so no filter, chart configuration, or report selection is ever lost by collapsing it.
- **Active Work by Assignee** (`src/components/dashboard/ActiveWorkByAssignee.tsx`) is the newest dashboard section, added specifically to satisfy BR-21/BR-22: a focused cross-tab of `ACTIVE_FOCUS_STATUSES` × assignee, independent of (and simpler than) the general-purpose Assignee Workload section below it.

## 11. Deployment

- `npm run build` produces a static `dist/` directory — any static host works, since there is no backend to provision.
- The CSP must be served as an HTTP header (not only the embedded `<meta>` tag) for the Worker's own script response, or `connect-src 'none'` will not apply to it. Ready-made configs are included: `public/staticwebapp.config.json` (Azure Static Web Apps — the organization's likely target, given the application's name and domain) and `public/_headers` (Netlify/Cloudflare Pages). For any other host (nginx, IIS, S3/CloudFront, etc.), apply the headers listed in `SECURITY_HEADERS` in `vite.config.ts`.
- `VITE_MAX_FILE_SIZE_MB` (build-time env var) overrides the default 100 MB upload limit.
- Do not add any analytics, error-reporting, or third-party script tag to `index.html` — the CSP will block it, and doing so would violate BR-90.

## 12. Known Technical Limitations

(Mirrors BRD §10, with the technical cause.)

- **No time-in-status / cycle-time / historical reopen-count metrics** — the data model has no transition history, only current-state fields (`created`/`updated`/`closed` dates and the current `status`). Any such metric would require either tracker-side change history or periodic snapshotting, neither of which is in scope today.
- **Snapshot comparison is 1:1 and ID-matched only** — records without an ID cannot be matched; repeated IDs compare only the first occurrence per file.
- **Assignee de-duplication is exact-after-normalization only** (`normKey`: trim + collapse whitespace + lowercase) — no fuzzy matching.
- **Mixed date formats in one column are rejected, not guessed** — a single `dateOrder` applies per import.
- **Large `.xlsx` parse time** is dominated by SheetJS reading the whole workbook synchronously inside the worker; there is no streaming reader available in the pinned SheetJS build.
- **No multi-file combination** — only one worksheet/import is analyzed at a time (plus one optional comparison snapshot).

## 13. Extensibility Guide (for future development)

| To add… | Start in… |
|---|---|
| A new recognized status alias | `KNOWN_STATUSES` in `src/lib/normalization/statusNormalizer.ts` — add `{ label, aliases, suggested? }`; never set `category` directly unless it belongs in `CORE_STATUSES`. |
| A new risk indicator | `calculateRiskIndicators` in `src/lib/analytics/riskAnalytics.ts`; follow the existing `RiskIndicator` shape (rule, limitations, breakdowns, indexes) so `RiskPanel.tsx` renders it automatically. |
| A new chart-builder metric | `src/lib/charts/metrics.ts` (definition) + compatibility rules in the chart-data engine; add a unit test alongside the existing metric tests. |
| A new report template/section | `src/lib/reports/reportTemplates.ts` (template definition + section availability) and `reportTables.ts`/`reportWorkbook.ts` for its data. |
| A new dashboard section | A component under `src/components/dashboard/`, wrapped in `<Section id="…" collapsible …>`, registered in `DashboardLayout.tsx` and in `DASHBOARD_SECTIONS` (`DashboardSidebar.tsx`) for navigation. |
| Any feature touching parsing, storage, or export | Re-run `npm run privacy:check` and the privacy test suite before merging — see §6.1. |

## 14. Appendix: Dataset Scope Reference

| Scope | Meaning | Consumers |
|---|---|---|
| Imported rows | Every data row below the header, blank rows included | Data Quality |
| Valid records | Non-blank rows normalized into `IssueRecord`s | Data-quality score and findings |
| In analytics (`included`) | Valid records after the duplicate-ID counting rule | Base for filters and comparison |
| In scope (`scoped`) | In analytics, narrowed by global filters (incl. created-date range) | All KPIs, charts, risks, assignee figures, reports |
| Issue register (`registerRecords`) | In scope, narrowed by the active KPI/chart/risk selection and search | Register display and selection export |
