# QA Issue Analytics Dashboard

A single-page web app that turns an issue-tracking spreadsheet (Azure DevOps, Jira or any bug-tracker export) into an interactive QA dashboard: KPI cards, status, priority and assignee analytics, an assignee × priority matrix, a development/QA handoff view, a searchable issue register, a data-quality report, a rule-based executive summary, and Excel / CSV / printable exports.

**Everything runs in the browser.** The uploaded file is parsed in memory, never sent to a server, never written to browser storage, and released when you click **Clear Data**. See [PRIVACY.md](PRIVACY.md) for how this is enforced and how to verify it.

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
   - *Statuses*: each source value gets a normalized label and a workflow category (Open / Closed / Unmapped). Only the five core statuses (Closed, New, Reopened, Ready for QA, Development in Progress) are categorized automatically; everything else stays **Unmapped** until you decide. Suggestions (e.g. Active → Open, Done → Closed) are applied only when you click *Apply suggested categories*. Resolved / Removed / Cancelled never get a suggestion.
   - *Priorities*: P1/Priority 1/Critical/High… are recognized; bare numbers are labelled P1, P2… with a notice asking you to confirm the convention. Custom values are kept and reported as unmapped until confirmed. Priority order and the high-priority group are configurable. Severity is never treated as priority.
   - *Assignees*: trimmed and grouped case-insensitively only; blank and placeholder values (e.g. "Unassigned", "N/A") count as Unassigned. You can rename entries (giving two entries the same name merges them) or mark any value as unassigned.
   - Status colors are configurable and used consistently in cards, charts and tables.
5. **Generate dashboard.** Use **Edit Mappings** at any time to change these choices, **Replace File** to load another file (the current analysis stays until the new one is confirmed), and **Clear Data** to release everything.

### Filters and counting rules

- **Global filters** (Status, Priority, Assignee, Work Item Type, Project, Area, Workflow) define the scope of *every* section. The assignee *Drill down* selector is a shortcut for the assignee filter.
- **Selections** — clicking a KPI card, chart element or matrix cell — narrow only the **Issue Register**, so dashboard totals never change underneath you. A selection can be promoted to a global filter ("apply to dashboard"). Active filters and the selection are always shown as chips with *Clear all filters*.
- **Counting rule**: by default every imported record is counted (duplicate IDs included, with a visible warning). *Exclude duplicate IDs* counts the first record per ID.
- Percentages are always count ÷ issues in the current scope. **Closure %** = issues in the Closed workflow category ÷ issues in scope; it shows *Not configured* when no status is classified as Closed.

### Exports (all generated locally)

- **Excel workbook**: Executive Summary, Status Summary, Priority Summary, Assignee Summary, Assignee-Priority Matrix, Assignee-Status Summary, Filtered Issue Register, Data Quality Summary and Data Quality Report (sheets that need unmapped columns are omitted).
- **CSV**: all issues, filtered issues, status / priority / assignee summaries, data-quality report. Values that start with `=`, `+`, `-`, `@`, tab or CR are prefixed with `'` to prevent spreadsheet formula injection; text cells in the `.xlsx` export are typed as strings, which Excel never evaluates.
- **Printable report / PDF**: a print-optimized page (KPIs, insights, status/priority/assignee charts, data-quality summary) printed with the browser's own *Save as PDF*.
- **Executive summary** as text (also *Copy Summary*).

## Architecture

| Area | Location | Notes |
|---|---|---|
| Parsing | `src/lib/parsers/` | Content sniffing (zip / OLE / text) instead of trusting extensions; SheetJS for workbooks, Papa Parse for CSV; `ImportSession` runs inside `src/workers/parsingWorker.ts` (main-thread fallback where workers are unavailable). |
| Normalization | `src/lib/normalization/` | Header-row and column detection, status / priority / assignee normalizers, date parser, `datasetBuilder` (rows → `IssueRecord`s, duplicate flags). |
| Analytics | `src/lib/analytics/` | Filter model, single-pass aggregation, KPIs/closure/handoff, priority backlog, assignee leaders & matrix, data quality, rule-based summary. |
| Export | `src/lib/export/` | Format-neutral report tables rendered to CSV and XLSX; local download helper. |
| Privacy | `src/lib/privacy/`, `vite.config.ts`, `public/` | Session cleanup, unload warning, Content-Security-Policy (meta + HTTP headers). |
| State | `src/hooks/` | `useDataset` (import → setup draft → active dataset), `useFilters`, memoized `useAnalytics` pipeline. |
| UI | `src/components/` | shadcn/ui-style components (Radix primitives + Tailwind + class-variance-authority) and Lucide icons; Apache ECharts (SVG renderer) for charts. |

Stack: React 18, TypeScript 5.6, Vite 6, Tailwind CSS 3.4, Radix UI, Lucide, Apache ECharts 6.1, SheetJS 0.20.3 (installed from the SheetJS CDN tarball — the npm registry copy is an older, vulnerable release), Papa Parse 5.4, Vitest 5 + React Testing Library.

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

These were executed for this delivery (Windows 11, Node 22.16, Chrome stable, headless):

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
- **Large Excel files are slow** to parse (SheetJS reads the whole workbook): ~48 s for 100k rows × 50 columns in Chrome on the test machine. Export very large datasets as CSV instead. Performance depends on the device and browser memory.
- **Password-protected workbooks** cannot be opened; they are detected from the reader's error and the user is asked to remove the password. Detection could not be exercised with a real encrypted file because the library cannot create one.
- **Numeric text dates** follow one configurable order (M/D/Y or D/M/Y) per import; mixed orders in one column are reported as invalid dates rather than guessed.
- **Assignee grouping** is case/whitespace-insensitive only. Different spellings of the same person must be merged manually in Value mapping.
- **Memory release**: Clear Data drops every reference to the data, resets the file input and terminates the parsing worker; the browser's garbage collector then reclaims memory. No claim is made about forensic erasure of physical memory.
- **Theme choice is not remembered** between visits, because the app deliberately uses no browser storage.
- **Dev-time advisories**: `npm audit` reports advisories in Tailwind CSS 3's build-time dependencies (glob matching). They affect only the local build tooling, not the shipped app; upgrading means migrating to Tailwind 4.
- **Charts in tests**: jsdom cannot lay out ECharts, so automated tests use a stand-in for the chart canvas that exposes the same data and click events; real chart rendering was verified in the browser run above.
