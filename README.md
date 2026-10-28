# QA Issue Analytics Dashboard

A single-page web app that turns an issue-tracking spreadsheet (Azure DevOps, Jira or any bug-tracker export) into a QA management dashboard:
- an executive dashboard with actionable KPI cards;
- a risk and attention panel;
- assignee workload analytics with an assignee × priority heatmap;
- a **Custom Chart Builder**: one configuration panel for any grouping, metric and chart type (e.g. Assignee → Priority → Issue Count, State → Assignee → %, Assignee → State → stacked bars);
- status and priority analytics, and a development/QA handoff view;
- a searchable issue register;
- a scored data-quality report with duplicate review;
- an optional comparison against an earlier snapshot;
- four management-report templates, exported as Excel or printed / saved as PDF.

**Everything runs in the browser.** The uploaded file is parsed in memory, never sent to a server, never written to browser storage, and released when you click **Clear Data**. See [PRIVACY.md](PRIVACY.md) for how this is enforced and how to verify it.

**Documentation:** [Business Requirements (BRD)](docs/BRD.md) · [Technical Specification (TSD)](docs/TSD.md) · [User Guide](docs/USER_GUIDE.md)

## Requirements

- Node.js 22.12+ (required by the test runner; developed and verified with Node 22.16 / npm 10.9)
- A modern browser (Chrome, Edge, Firefox, Safari — current versions)

## Commands

| Task | Command |
|---|---|
| Install dependencies | `npm install` |
| Start the development server | `npm run dev` → http://localhost:5173 |
| Run all unit, integration and privacy tests | `npm test` |
| Type-check | `npm run typecheck` |
| Production build (to `dist/`) | `npm run build` |
| Preview the production build (with production security headers) | `npm run preview` → http://localhost:4173 |
| Static privacy audit (run after `npm run build` to include the build checks) | `npm run privacy:check` |
| Regenerate the sample data files | `node scripts/generate-sample-data.mjs` |
| Generate a large performance dataset | `node scripts/generate-sample-data.mjs --rows 100000 --columns 50 --out <dir>` |

Sample files with fictional data are in [samples/](samples/): `sample-issues.csv` and `sample-issues.xlsx` (600 issues, with a few deliberate data-quality problems).

## Using the dashboard

1. **Upload** an `.xlsx`, `.xls` or `.csv` file (drag and drop or browse). Large files are parsed in a Web Worker with a progress indicator and a Cancel button.
2. **Source & preview** — pick the worksheet (sheets are never combined), the header row (auto-detected, can be below row 1), the CSV delimiter (auto-detected) and the date order (M/D/Y or D/M/Y) for text dates. The preview shows the actual imported values.
3. **Column mapping** — detected columns are shown and can be corrected. Status, Assignee and Priority are marked essential; if one is missing you can continue and the app explains which analytics are unavailable.
4. **Value mapping**
   - *Statuses*: each source value gets a normalized label and a workflow category (Open / Closed / Unmapped). Only the five core statuses (Closed, New, Reopened, Ready for QA, Development in Progress) are categorized automatically; everything else stays **Unmapped** until you decide. Suggestions (e.g. Active → Open, Done → Closed) are applied only when you click *Apply suggested categories*. Resolved / Removed / Cancelled never get a suggestion. Common Azure DevOps / UAT-cycle states (QA in Progress, On Hold, Resolved in UAT, Closed in UAT, Ignore) are recognized by name so they don't need re-mapping on every export, but their workflow category is still your decision.
   - *Priorities*: P1/Priority 1/Critical/High… are recognized; bare numbers are labelled P1, P2… with a notice asking you to confirm the convention. Custom values are kept and reported as unmapped until confirmed. Priority order and the high-priority group are configurable. Severity is never treated as priority.
   - *Assignees*: trimmed and grouped case-insensitively only; blank and placeholder values (e.g. "Unassigned", "N/A") count as Unassigned. You can rename entries (giving two entries the same name merges them) or mark any value as unassigned.
   - Status colors are configurable and used consistently in cards, charts and tables.
   - *Unknown priorities*: values such as "TBD", "N/A" or "Unknown" are treated by default as an explicit **Unknown** priority. This is kept separate from blank cells and never part of the high-priority group. Untick **Unknown** to treat a value as a custom priority instead.
5. **Generate dashboard.** Use **Edit Mappings** at any time to change these choices, **Replace File** to load another file (the current analysis stays until the new one is confirmed), and **Clear Data** to release everything.

**Reusing a mapping across exports.** On the Column mapping / Value mapping steps, **Save mapping** downloads the current column and value mapping as a small local JSON file; **Load mapping** applies a previously saved one to the file you're currently setting up, matching columns by header name (not position) and value rules by the exact source text. This is a user-initiated file round-trip, like the other exports — nothing is written to browser storage, so it does not change the privacy guarantees in [PRIVACY.md](PRIVACY.md). Review Column mapping and Value mapping afterwards; columns whose header name changed are not matched automatically.

### Dashboard layout

Header (file, imported vs. in-analytics records, active filters, report template, comparison file), then:
1. **Executive Dashboard**: KPI cards, plus four overview charts (status distribution, priority distribution, open backlog by priority, top-10 assignee workload).
2. **Active Work by Assignee**: who currently holds New, Reopened and Development-in-Progress issues — the three states that need an owner's action right now.
3. **Executive Summary**
4. **Risks and Attention Required**
5. **Status** and **Priority** analytics
6. **Assignee Workload and Priority Matrix**
7. **Custom Chart Builder**
8. **Development and QA Handoff**
9. **Issue Register**
10. **Data Quality**
11. **Snapshot Comparison**
12. **Export and Report Generation**

Lower-priority sections can be collapsed: they show a one-line summary, and their content stays loaded, so no filters or settings are lost.

**KPI cards.** Every card filters the issue register; click again to remove the filter.
- **Total:** imported rows, valid records, records in analytics and records excluded by the duplicate rule.
- **Closed:** count, share of scope, and the statuses classified as closed.
- **Closure rate:** a current-state ratio, not a trend. Marked *Provisional* while unmapped statuses exist; shows *Not configured* without a Closed mapping.
- **Open backlog** and the configured statuses it counts.
- **P1 + P2 open backlog:** the configured high-priority group, with a per-level split. Shows *Check convention* when bare numbers were read as P-levels.
- **Reopened:** the current state only.
- **Ready for QA** and **Unassigned**.
- **Blocked:** shown only when a status is mapped to Blocked.
- **Unmapped statuses:** shown only when there are any.
- **Data-quality score.**
- A *workflow snapshot* strip keeps the New / Development in Progress / Other counts.

**Risks and Attention Required.** Six rule-based indicators, ranked:
1. High-priority open backlog
2. Reopened
3. Aging open issues: age since creation, with configurable buckets (default 0–7 / 8–14 / 15–30 / >30 days). Missing, unreadable and future Created Dates are flagged, never aged.
4. Unassigned
5. Unmapped or incomplete records
6. QA queue

Each card shows its exact rule, breakdowns, IDs and limitations, and can list or export exactly its records. These are attention indicators, not evidence of missed deadlines.

**Assignee workload.**
- **Summary table:** total, closed, open, each high-priority level, combined, reopened, ready for QA, share of issues and of the open backlog, and unmapped statuses. Unassigned is shown separately, not as a person.
- **Display controls:** search, sort by any metric, Top 5 / 10 / 25 / All. These are display-only and never filter records.
- **Dashboard filters:** searchable multi-select for assignees, statuses and priorities.
- **Workload-concentration highlight:** optional, neutral, threshold set by you.
- **Drill-down panel** for a single assignee.
- **Charts:** stacked bars by priority and by status.
- **Heatmap:** *Total* or *Open issues only*, sortable columns, exact counts and keyboard-accessible cells.

### Charts: readability rules

Every chart (dashboard and builder) is laid out from its measured container width by the pure rules in `src/components/charts/chartLayout.ts`, so text does not overlap, clip or cover data:
- **Legends wrap** onto as many rows as needed (never paged), and the plot is moved down by the legend's exact height.
- **Category labels** fit as they are, wrap onto two lines, rotate 35° only when parallel labels stay at least 30 px apart, or the chart switches to horizontal bars. Long names are truncated with an ellipsis; the full name is in the tooltip, the accessible summary and the exports.
- **Horizontal bars** reserve at most 38 % of the width for names, and the chart grows taller with the number of categories instead of squeezing bars.
- **Value labels** are shown only when they fit their bar; otherwise values are in tooltips. ECharts' render-time overlap check hides any label that would still touch another.
- **Value-axis ticks** are reduced on narrow charts and shown compactly (1.2K) or in the metric's unit (35 %, 4.5 d). The rotated axis name is placed from the widest tick label and stays inside the chart.
- **Donut totals** are drawn once in the centre; segment values are in the legend, not as overlapping slice labels.
- One font is used both to measure and to draw chart text, so the layout estimates match what is rendered.
- Each chart has a toolbar above the plot (never over it): **PNG** (2× resolution) and **SVG** download with the chart title, and **full screen**. Images are produced locally from the chart's own SVG.
- Section links scroll below the sticky header at every width (the header height is published as a CSS variable).

### Custom Chart Builder

One reusable panel creates any number of charts, all calculated by one engine (`src/lib/charts`) from the same in-memory dataset and the same dashboard scope (duplicate rule and global filters).
- **A. Chart type:** vertical or horizontal bar, stacked, grouped, 100 % stacked, line, area, pie, donut, heatmap, table. A type that does not suit the data is explained (with the compatible types) instead of being silently changed.
- **B. Analyze data by:** Assignee, Priority, State, Workflow category, Work Item Type, Project, Area, Iteration, Severity, Created month / week, or any other column with up to 200 distinct values.
- **C. Secondary grouping:** any second dimension (one series per value), or *Compare metrics* (one series per selected metric). Up to 12 series are drawn; for more, the chart says how many were not drawn and suggests the heatmap or table, which show all.
- **D. Metric:** issue count, % of total, % within group, closed, open, unmapped, high-priority (all / open), each configured priority level, reopened, ready for QA, unassigned, average age (days, open issues with a valid created date) and distinct issue IDs. Each metric shows how it is calculated.
- **E. Chart filters:** status, priority, assignee and the other dashboard fields, plus a created-date range. They narrow only this chart; the dashboard totals never change.
- **F. Sort** by value (high → low or low → high), name (A–Z or Z–A) or natural order (priority order, dates), **Top 5 / 10 / 20 / All** with an optional "Other" (only for metrics that can be added up).
- **G. Display:** data labels, legend, gridlines, percentages, exact or compact numbers, size, title and subtitle (automatic by default: metric, records in scope, chart and dashboard filters).
- **Ready-made views:** 29 assignee-, priority- and state-wise configurations (e.g. workload, assignee × priority heatmap, priority by state, open vs closed, % of state per assignee). Only views the dataset can support are offered.
- **Manage:** duplicate, move up / down, remove, reset. Charts are kept for this session only and are cleared on a new dataset and on Clear Data.
- **Drill-down:** clicking a bar, segment, point or cell lists exactly its records in the Issue Register (register only).
- **Exports:** CSV of exactly the values drawn; Excel with *Chart Data (as drawn)*, *All Categories* (when Top-N hides some), *Chart Configuration* (type, groupings, metric definition, dashboard and chart filters, record counts) and *Chart Records* (mapped issue fields of every record behind the chart); PNG / SVG image.

### Dataset scopes

| Scope | Meaning | Used by |
|---|---|---|
| Imported rows | Data rows below the header, blank rows included | Data quality |
| Valid records | Non-blank rows normalized into issues | Data-quality score and findings |
| In analytics | Valid records after the duplicate-handling rule | Base for filters and comparison |
| In scope | In analytics and matching the global filters (incl. created-date range) | All KPIs, charts, risks, assignee figures, reports |
| Issue register | In scope, narrowed by a KPI/chart/risk selection and search | Register, selection export |

The filter bar always states *Showing X of Y records*. The header shows imported versus in-analytics counts whenever they differ.

### Filters and counting rules

- **Global filters** define the scope of *every* section: Status, Priority, Assignee, Work Item Type, Project, Area, Severity, Iteration, Workflow, and a Created Date range when a Created Date column is mapped. The assignee *Drill down* selector is a shortcut for the assignee filter.
- **Selections** — clicking a KPI card, chart element or matrix cell — narrow only the **Issue Register**, so dashboard totals never change underneath you. A selection can be promoted to a global filter ("apply to dashboard"). Active filters and the selection are always shown as chips with *Clear all filters*.
- **Duplicate IDs** (the counting rule) has three options:
  - *Include all imported records* (default, with a visible warning);
  - *Exclude subsequent duplicate IDs* (keeps the first record per ID);
  - *Review duplicates before excluding*: in the Data Quality section you tick exactly which records to exclude, and nothing is excluded until you choose.

  Blank IDs are never treated as duplicates of each other. Excluded records are always reported separately from imported records.
- Percentages are always count ÷ issues in the current scope. **Closure %** = issues in the Closed workflow category ÷ issues in scope; it shows *Not configured* when no status is classified as Closed.

### Management reports (Export and Report Generation section)

| Template | Default sections |
|---|---|
| Daily QA Status Report | Executive summary & KPIs, status, priority (incl. open high-priority issues), risks (reopened, QA queue, unassigned…), data quality |
| Weekly Management Report | Summary & KPIs, status, priority, assignee workload & matrix, risks, data quality, snapshot comparison (only when a snapshot is loaded) |
| Release Readiness Report | Summary & KPIs, readiness indicators, priority, risks, aging, data quality |
| Developer / Tester Workload Report | Assignee workload & matrix and the issue register, for selected assignees or all |

- **Sections:** each can be included or excluded. Unsupported sections, such as aging without a Created Date, are disabled with the reason.
- **Release criteria:** the release template accepts optional numeric criteria (maximum open high-priority, open backlog, reopened, unassigned). Without criteria it states that it shows indicators only. It never declares a release approved.
- **Preview:** shows the template, generation date, dataset scope, filters, selected sections and the applicable data limitations. It is printed with the browser's *Save as PDF*, using A4 print styles: controls hidden, table headers repeated on every page, rows never split, optional page breaks between sections.
- **Excel report:** contains only the worksheets for the selected sections:
  - Executive Summary, KPI Details, Release Readiness;
  - Status, Priority and Assignee Summary, Assignee-Priority Matrix (all and open-only), Assignee-Status;
  - Risk and Attention Items, Risk Records, Aging;
  - Data Quality Score, Summary and Report;
  - Comparison Summary and Changes, Detailed Issue Register.

  Header rows are frozen and detail sheets have auto-filters.

### Snapshot comparison (optional)

Load an earlier export of the same tracker. It is normalized with the current column and value mappings: columns are matched by header name, and in a multi-sheet workbook the best-matching worksheet is chosen. Records are matched by issue ID, and the comparison reports:
- metric changes (absolute, plus % where the previous value is not zero);
- issues *newly observed* or *no longer present in the export* (never called created or deleted);
- status, priority and assignee changes;
- moves to Closed and back from Closed.

Both snapshots stay in memory. *Remove snapshot* or Clear Data releases them.

### Data-quality score

- **Rules:** eight, each measuring the share of valid records that pass:
  - ID, status, priority and assignee completeness;
  - status and priority mapping coverage;
  - date validity, which includes a future-date check;
  - unique IDs.
- **Outcomes:** pass at ≥ 98 %, warning at ≥ 90 %, error below that.
- **Overall score:** the weight-averaged score of the applicable rules. Weights can be changed.
- **Absent fields:** rules for fields missing from the file are *not applicable*, not penalised, unless you mark the field as required.
- **Findings:** every finding lists a severity (Error / Warning / Info) and a recommended correction.
- **Scope:** this is a completeness and consistency indicator, not a formal quality certification.

### Exports (all generated locally)

- **Excel workbook (quick export)**: Executive Summary, Status Summary, Priority Summary, Assignee Summary, Assignee-Priority Matrix, Assignee-Status Summary, Filtered Issue Register, Data Quality Summary and Data Quality Report. Sheets that need unmapped columns are omitted, and header rows are frozen.
- **Selection export**: the exact records of any KPI, chart segment, heatmap cell or risk card (*export* on the selection chip, or *CSV* on a risk card).
- **CSV**: all issues, filtered issues, status / priority / assignee summaries, data-quality report. Values that start with `=`, `+`, `-`, `@`, tab or CR are prefixed with `'` to prevent spreadsheet formula injection; text cells in the `.xlsx` export are typed as strings, which Excel never evaluates.
- **Printable report / PDF**: opens the report preview for the selected template (see Management reports).
- **Executive summary** as text (also *Copy Summary*).
- **Charts**: every chart can be downloaded as PNG or SVG; builder charts also export their exact data as CSV or Excel (see Custom Chart Builder).

## Architecture

| Area | Location | Notes |
|---|---|---|
| Parsing | `src/lib/parsers/` | Content sniffing (zip / OLE / text) instead of trusting extensions; SheetJS for workbooks, Papa Parse for CSV; `ImportSession` runs inside `src/workers/parsingWorker.ts` (main-thread fallback where workers are unavailable). |
| Normalization | `src/lib/normalization/` | Header-row and column detection, status / priority / assignee normalizers, date parser, `datasetBuilder` (rows → `IssueRecord`s, duplicate flags). |
| Analytics | `src/lib/analytics/` | Pure functions, all fed by one pipeline (`src/hooks/useAnalytics.ts`):<br>• filter model and single-pass aggregation;<br>• `executiveMetrics` (KPIs and dataset scopes);<br>• `riskAnalytics` (risk indicators and aging);<br>• `assigneeAnalytics` (workload, sort keys, total/open matrix);<br>• `dataQuality` and `dataQualityScore`;<br>• `snapshotComparison`;<br>• the rule-based summary. |
| Charts | `src/lib/charts/`, `src/components/charts/`, `src/components/builder/` | Chart configuration types, dimensions, metric definitions, the single-pass `buildChartData` engine, compatibility rules, presets and exports; pure layout rules (`chartLayout.ts`), the chart shell (toolbar, full screen, PNG/SVG) and the builder UI. |
| Reports | `src/lib/reports/` | Report templates, section availability, release criteria, report workbook assembly. |
| Export | `src/lib/export/` | Format-neutral report tables rendered to CSV and XLSX; local download helper. |
| Privacy | `src/lib/privacy/`, `vite.config.ts`, `public/` | Session cleanup, unload warning, Content-Security-Policy (meta + HTTP headers). |
| State | `src/hooks/` | `useDataset` (import → setup draft → active dataset, comparison snapshot), `useFilters` (global filters, created range, selection, duplicate rule and review decisions), `useAnalysisSettings` (aging buckets, score weights, required fields, workload threshold, report options, custom chart configurations), memoized `useAnalytics`. All state is in memory only and is reset on a new dataset and on Clear Data. |
| UI | `src/components/` | shadcn/ui-style components (Radix primitives + Tailwind + class-variance-authority) and Lucide icons; Apache ECharts (SVG renderer) for charts. |

Stack: React 18, TypeScript 5.6, Vite 6, Tailwind CSS 3.4, Radix UI, Lucide, Apache ECharts 6.1 (with its renderer ZRender 6.1.0 pinned as a direct dependency), SheetJS 0.20.3 (installed from the SheetJS CDN tarball — the npm registry copy is an older, vulnerable release), Papa Parse 5.4, Vitest 5 + React Testing Library.

## Deployment

`npm run build` produces static files in `dist/`. Any static host works; the uploaded data never reaches it.

- The build embeds a CSP `<meta>` tag with `connect-src 'none'`.
- A Web Worker takes its CSP from **HTTP headers**, not the page's meta tag, so serve the same policy as a header. Ready-made configs are included and copied into `dist/`:
  - Azure Static Web Apps: `staticwebapp.config.json`
  - Netlify / Cloudflare Pages: `_headers`
  - Other hosts (nginx, IIS, S3/CloudFront…): send the headers listed in `SECURITY_HEADERS` in `vite.config.ts`.
- Do not add analytics or error-reporting scripts to `index.html`; the CSP would block them anyway.
- Maximum upload size defaults to 100 MB; override at build time with `VITE_MAX_FILE_SIZE_MB=200 npm run build`.

## Verification performed

These were executed for this delivery (Windows 11, Node 22.16, Chrome stable, headless).

Chart visibility and Custom Chart Builder (latest):
- `npm test`: **175 tests in 12 files passed**, including 28 for the chart engine, compatibility rules, presets, exports and layout rules, plus 2 UI integration tests of the builder (configure, filter, drill down, export, reorder, remove, Clear Data reset).
- **Overlap probe** (production build, Chrome): every text element of every dashboard chart was measured as an oriented rectangle, with 2 datasets (one with very long names and 12 statuses) × 3 widths (1440, 1024, 390 px), 78 chart renders in total.
  - Before: 1,585 overlapping label pairs and 105 clipped labels, and the sticky header covered section titles at every width.
  - After: **0 overlaps and 0 clipped labels**, and section links land below the header at every width.
  - The remaining findings are deliberate ellipsis truncations of very long names.
- **Builder against an independent Python oracle** (420-record adversarial dataset): **42/42 checks passed**.
  - Every cell of Assignee → Priority → Issue Count, State → Assignee → % within state, Assignee → State (stacked, via CSV and Excel), Priority → % of total, and the Open vs closed preset matched.
  - Drill-down listed exactly the cell's records, and chart filters left the dashboard KPIs unchanged.
  - SVG downloads are well-formed and render as images; PNG downloads are 2× resolution.
  - Seven builder charts of different types showed 0 overlaps and 0 clipping at 1440, 1024 and 390 px.
  - Privacy as described in [PRIVACY.md](PRIVACY.md).
- **100,000 records × 50 columns** (Chrome, same machine as below):
  - upload to dashboard 4.1 s;
  - adding a builder chart 0.8 s, and 1.8–2.1 s for a second or third chart;
  - changing secondary grouping, type, Top-N or metric 0.33–0.70 s;
  - a dashboard filter click with three builder charts open 0.57 s;
  - a chart's Excel export with all 100k Chart Records 19.7 s;
  - JS heap ≈ 470 MB.

Management enhancement:
- `npm test`: **145 tests in 10 files passed**. New coverage includes:
  - executive metrics, assignee metrics, sort keys and the open-only matrix;
  - risk indicators, aging buckets and future dates;
  - data-quality score (absent vs. required fields, weights);
  - unknown priorities, duplicate review and created-date range, record-set selections;
  - snapshot comparison;
  - report templates, section availability and release criteria;
  - report workbook with frozen headers, and inert formula-like Excel cells;
  - UI integration: KPI cards, risk drill-down and export, heatmap modes, Top-N and search, duplicate review, templates, sections, preview, Excel, comparison and full Clear Data reset.
- Browser verification of the production build against a 480-record adversarial dataset with an explicit truth table: **43/43 checks passed**.
  - Every executive KPI, risk count, risk drill-down, selection export and open-only heatmap cell matched the truth.
  - The Weekly Excel report had all 15 expected sheets, frozen headers, and KPI and assignee values equal to the truth.
  - The print preview had the expected sections, a PDF was generated, controls were hidden in print and table headers repeated.
  - No horizontal overflow at 390 px.
  - After Clear Data (with reports, risks and a comparison snapshot used), 0 heap objects holding uploaded or comparison data remained reachable, and the worker was terminated.
  - No browser storage was used, the app made only GET requests to its own server, the uploaded data never appeared in network traffic, and the disk profile was clean.

Earlier delivery:
- `npm test`: 112 tests in 8 files passed. They cover:
  - Unit: normalizers, column/header detection, dates, aggregation, KPIs, matrix, filters, counting rules, closure, summary, data quality, CSV escaping, formula injection, workbook round-trip.
  - Integration (CSV and Excel): upload → mapping → KPIs → charts → KPI/chart drill-down → global filter → search → export → clear; replacement-failure handling.
  - Privacy and memory-release.
- Independent end-to-end verification (production build, Chrome, 480-record adversarial dataset with an explicit truth table): **81/81 checks passed**.
  - Every KPI, status/priority count, assignee total, matrix cell and export matched the raw data, for CSV and XLSX, unfiltered, under global filters, under a chart selection and with the duplicate-ID counting rule.
  - Network, disk and heap checks are described in [PRIVACY.md](PRIVACY.md).
- `npm run typecheck`, `npm run build` and `npm run privacy:check` succeed.
- Production build driven in headless Chrome with the 600-row sample workbook: every KPI matched an independent count of the file; chart and matrix drill-downs, Excel/CSV downloads, the print report (A4 PDF), dark mode and Clear Data worked; zero requests left `localhost`; local/session storage and cookies stayed empty; no console errors; no horizontal overflow at 390 px width.
- 100,000 rows × 50 columns: CSV parse 2–6 s, dashboard build 1–4 s, KPI drill-down ≈0.2 s, global filter ≈0.3 s, ≈200 MB JS heap. The same data as a 64 MB `.xlsx` took ≈48 s to parse (the UI stays responsive meanwhile).
- `npm audit --omit=dev`: 0 vulnerabilities in production dependencies.

## Known limitations

- **Snapshot only.** A spreadsheet of current states cannot yield time-in-status, QA turnaround, historical reopen counts or productivity; the app shows "Insufficient data" instead of estimating. Closure % is a current-state ratio, not a trend.
- **Large exports block the page briefly.** Workbooks are written on the main thread: a chart's Excel export with 100k Chart Records took ≈ 20 s, and the dashboard's Excel export took ≈ 24 s on the test machine. CSV exports are much faster.
- **Large Excel files are slow** to parse (SheetJS reads the whole workbook): ~48 s for 100k rows × 50 columns in Chrome on the test machine. Export very large datasets as CSV instead. Performance depends on the device and browser memory.
- **Password-protected workbooks** cannot be opened; they are detected from the reader's error and the user is asked to remove the password. Detection could not be exercised with a real encrypted file because the library cannot create one.
- **Numeric text dates** follow one configurable order (M/D/Y or D/M/Y) per import; mixed orders in one column are reported as invalid dates rather than guessed.
- **Assignee grouping** is case/whitespace-insensitive only. Different spellings of the same person must be merged manually in Value mapping.
- **Memory release**: Clear Data drops every reference to the data, resets the file input and terminates the parsing worker; the browser's garbage collector then reclaims memory. No claim is made about forensic erasure of physical memory.
- **Theme choice is not remembered** between visits, because the app deliberately uses no browser storage.
- **Dev-time advisories**: `npm audit` reports advisories in Tailwind CSS 3's build-time dependencies (glob matching). They affect only the local build tooling, not the shipped app; upgrading means migrating to Tailwind 4.
- **Snapshot comparison** matches records by issue ID only. Records without an ID cannot be matched (they are counted and reported). For repeated IDs only the first occurrence is compared. Changes between snapshots are differences between two exports, not a workflow history.
- **Aging** is age since creation for open issues, measured against the local date when the dashboard is viewed. It is not time spent in the current state.
- **Report charts** in the printed report show at most the top 20 assignees; the report tables list all. The printed register is capped (configurable, default 200 rows); the Excel report always contains every record.
- **Frozen header rows** are added by editing the generated workbook in memory, because the SheetJS community edition has no option for them. If that step fails, the workbook is still produced, just without frozen headers.
- **Behaviour changes in this release**:
  - The *Closed Issues* card now counts every status in the Closed workflow category, not only the literal status "Closed".
  - Source priority values such as "N/A", "TBD" or "-" now default to the explicit *Unknown* priority instead of an unconfirmed custom value.
- **Custom Chart Builder**:
  - At most 12 series are drawn in one chart; the heatmap and table show every series.
  - Columns other than the mapped fields are offered as groupings only when they have at most 200 distinct values.
  - "Other" is offered only for metrics that can be added up (counts), not for percentages within a group or averages.
  - *Chart Records* in a chart's Excel export lists the mapped issue fields and source row, not every original column; use the Issue Register export for those.
  - Chart configurations are not saved between visits (no browser storage is used).
- **Very long names** are truncated in charts (full text in tooltips, the accessible summary and exports). On phone-width screens, charts with many long categories switch to horizontal bars and grow taller.
- **Charts in tests**: jsdom cannot lay out ECharts, so automated tests use a stand-in for the chart canvas that exposes the same data and click events; real chart rendering was verified in the browser run above.
