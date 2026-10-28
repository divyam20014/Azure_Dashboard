# User Guide

## QA Issue Analytics Dashboard

| | |
|---|---|
| **Document version** | 1.0 |
| **Application version** | 1.0.0 |
| **Audience** | QA managers, engineering managers, team leads, and anyone who needs to turn an Azure DevOps (or Jira, or similar) export into a shareable status view |

---

## 1. What this tool does

You export a query's results from Azure DevOps (or any issue tracker) to Excel or CSV, drag it into this page, and get:

- A KPI dashboard (total, closed, open backlog, high priority, reopened, ready for QA, unassigned, data-quality score).
- A dedicated view of **who currently owns New, Reopened, and Development-in-Progress work** — the view most people open first thing in the morning.
- A risk/attention panel (aging issues, unassigned issues, high-priority backlog, reopens, QA queue).
- Workload and priority breakdowns by assignee, with drill-down into the exact matching issues.
- A chart builder for anything the built-in views don't cover.
- A searchable, exportable issue register.
- A data-quality score and findings list.
- An optional comparison against a prior export.
- Four ready-to-send report templates, exportable to Excel or PDF.

**Nothing you upload ever leaves your browser.** There is no server, no account, and no internet connection required once the page has loaded. See §14 for how that is verified.

## 2. Getting started

1. Open the dashboard in a current version of Chrome, Edge, Firefox, or Safari.
2. You'll see the upload screen with the privacy statement at the top. Confirm it, if this is your first time using the tool.
3. Export your query from Azure DevOps (**Boards → Queries → your query → Column Options → Export to CSV/Excel**, or the equivalent for your tracker), or use one of the sample files in `samples/` to try the tool first.

## 3. Step 1 — Upload your file

- Drag and drop the file onto the upload area, or click to browse.
- Supported formats: `.xlsx`, `.xls`, `.csv` (up to 100 MB by default).
- Large files show a progress bar and a **Cancel** button; parsing happens in the background so the page stays responsive.
- If the file can't be read (wrong format, password-protected, corrupted), you'll get a clear message telling you what to fix — never a silent failure.

## 4. Step 2 — Source & preview

- **Worksheet**: if your Excel file has multiple sheets, pick the one with your issues. Sheets are never combined automatically.
- **Header row**: auto-detected; change it if your export has extra title rows above the real headers.
- **CSV delimiter**: auto-detected (comma, semicolon, tab, or pipe).
- **Date order**: choose M/D/Y or D/M/Y for any text-formatted dates in your file (Excel's own date cells are read directly and don't need this).
- The preview table shows your actual data, so you can confirm you picked the right sheet/header row before continuing.

## 5. Step 3 — Column mapping

The tool tries to auto-detect which of your columns are Status, Assignee, Priority, Issue ID, Title, dates, etc. Review and correct any of these using the dropdowns next to each detected field.

- **Status, Assignee, and Priority are the three "essential" fields.** If one isn't mapped, the tool tells you exactly which analytics will be unavailable (e.g., no Status column means no KPI cards, no closure %, no risk panel) — you can still continue with what's available.
- Every other field (Created Date, Project, Area, Iteration, Severity, Type, etc.) is optional and simply unlocks more analysis when present.

### Reusing a mapping (recommended for recurring exports)

If you run the same query from the same project every day/week, you don't need to redo this mapping each time:

1. After mapping once, click **Save mapping** (on the Column mapping or Value mapping step). This downloads a small `.json` file to your computer — nothing is uploaded, it's a normal file download.
2. Next time you upload a new export of the same query, click **Load mapping** and pick that file. The tool matches your columns **by name**, so it still works even if the column order changed, and applies all your status/priority/assignee decisions automatically.
3. Always glance over Column mapping and Value mapping afterward — if Azure DevOps added a brand-new status value since your last export, it will show up as unmapped and need a one-time decision.

## 6. Step 4 — Value mapping

This is where you tell the tool what your tracker's specific values *mean*.

### 6.1 Status

Every distinct status value in your file gets a row with two things to set:

- **Normalized status** — just a display label. If your export has "Re-Open" and "REOPENED" as two slightly different text values, you'd give both the label "Reopened" so they're counted together everywhere in the dashboard.
- **Workflow category** — exactly one of **Open/Pending**, **Closed**, or **Unmapped**. This is what drives every "is this done yet" number: closure %, open backlog, aging, and the handoff view.

> **Why two separate things?** The normalized status is just a name — you can have as many as you want (New, Reopened, Dev in Progress, QA in Progress, Resolved in UAT, Closed in UAT, On Hold, Ignore…). The workflow category is a strict 3-way bucket, because "closure %" and "open backlog" need a yes/no answer, and the tool will never guess that answer for you — you decide, once, per status.

The five most common statuses — **Closed, New, Reopened, Ready for QA, Development in Progress** — are recognized and categorized automatically. A larger set of common names — including **QA in Progress, On Hold, Resolved in UAT, Closed in UAT,** and **Ignore** — are recognized by name (so you won't need to retype them), but you still choose their workflow category yourself, since whether e.g. "Resolved in UAT" should count as Closed is a team decision, not something the tool should assume.

Anything left as **Unmapped** is reported separately and excluded from open/closed totals — it is never silently guessed as one or the other.

### 6.2 Priority

- Common formats (P1/P2/…, "Priority 1", Critical/High/Medium/Low) are recognized automatically.
- Bare numbers (just "1", "2"…) are read as P-levels with a note asking you to confirm that 1 means highest priority in your tracker.
- Values that explicitly mean "we don't know" (TBD, N/A, blank-but-explicit) are treated as a distinct **Unknown** priority, separate from a truly blank cell, and never counted in the high-priority group.
- Set the **priority order** (drag/reorder) and tick which levels form your **high-priority group** — this feeds the "High-Priority Open Backlog" KPI and several risk indicators.

### 6.3 Assignee

- Names are grouped ignoring case and extra spaces only — "john smith" and "John Smith" are merged, but "J. Smith" is **not** automatically merged with "John Smith". If you see the same person listed twice, rename one entry to match the other.
- Blank cells and common placeholders ("Unassigned", "N/A") are treated as **Unassigned** automatically; you can mark any other value as Unassigned too.

### 6.4 Click Generate dashboard

Once you're happy with the mapping, click **Generate dashboard**. You can always come back with **Edit Mappings** in the header if you need to change anything later — your filters and chart configurations are preserved.

## 7. Finding your way around the dashboard

- A **collapsible sidebar** on the left lists every section with an icon. Click a section name to jump to it; the currently-visible section is highlighted automatically as you scroll.
- Click the **arrows at the bottom of the sidebar** to collapse it to icons-only (useful on a smaller screen) or expand it back.
- On a phone, tap the **menu icon** in the header to open the same navigation as a slide-in panel.
- Each dashboard section has a small **chevron (▸)** next to its title — click it to collapse/expand that section. Collapsing never loses your settings; everything inside stays exactly as you left it.
- To keep the page focused, some sections start **collapsed** by default (Risks, Status, Priority, Assignee Workload, Chart Builder, Handoff, Data Quality, Comparison, Reports). The ones you'll use constantly — **Executive Dashboard**, **Active Work by Assignee**, and the **Issue Register** — start open.

## 8. Executive Dashboard

The top of the page. KPI cards for Total, Closed, Closure Rate, Open Backlog, High-Priority Open Backlog, Reopened, Ready for QA, Unassigned, and Data-Quality Score.

- **Click any card** to filter the Issue Register (at the bottom of the page) to exactly those records. Click it again to clear that filter.
- The four overview charts below the cards (status distribution, priority distribution, open backlog by priority, top-10 assignee workload) are also clickable in the same way.
- The "Total" card always shows the real totals — clicking other cards never changes what the dashboard *counts*, only what the register *displays*.

## 9. Active Work by Assignee

This is the section built specifically for the daily "who has what" question. It shows, for each person, their current count of **New**, **Reopened**, and **Development in Progress** issues — the three states that need someone to act on them right now.

- The four stat tiles at the top show the org-wide totals for each of those three statuses, plus a combined "Total active" tile. Click any tile to filter the register.
- The chart shows active issues per assignee, broken down by which of the three statuses they're in. Click a segment to see exactly those issues.
- The table lists every assignee with at least one active issue, with per-status counts, a total, and their share of their own total workload. Click any number to drill into the register; click a name to filter the whole dashboard to that person.
- **Export CSV** downloads exactly this active-work record set — handy for pasting into a standup message or a status email.

## 10. Risks and Attention Required

Six rule-based indicators, ranked by attention priority:

1. **High-priority backlog** — open issues in your configured high-priority group.
2. **Reopened issues** — current state, not a historical reopen count.
3. **Aging open issues** — open issues older than your configured thresholds (default buckets: 0–7, 8–14, 15–30, and 30+ days since creation).
4. **Unassigned issues**.
5. **Unmapped or incomplete records** — things missing or not yet classified that limit the accuracy of the figures above.
6. **QA queue** — issues currently Ready for QA.

Every card shows its exact rule and any limitation affecting it (e.g., "N unmapped statuses are not counted as open"), and you can **list** the matching records in the register or **export them as CSV** directly from the card. These are *attention flags*, not a judgment of anyone's performance — read them that way when sharing with the team.

## 11. Status and Priority analytics

- **Status**: a fixed-order comparison of the five core statuses plus "Other," the open-vs-closed workflow split, and your closure percentage (with a note if it's "provisional" because some statuses are still unmapped).
- **Priority**: priority-by-status mix, an open/closed/unmapped backlog breakdown per priority, and a full list of every high-priority issue currently open, clickable through to the full record.

## 12. Assignee Workload and Priority Matrix

The detailed workload view (separate from the simpler Active Work panel in §9 — this one covers *every* status and priority, not just the three active ones).

- Search, sort by any column, and show Top 5/10/25/All — these controls only change what's *displayed*, never what's counted.
- The summary table shows total, closed, open, each high-priority level, reopened, ready-for-QA, and share of total/open backlog per person.
- Set a **workload concentration threshold** (e.g., "flag anyone holding more than 30% of the open backlog") to get a visible badge on that person's row.
- The **assignee × priority heat map** can show all issues or open-issues-only; darker cells mean more issues, and every cell's exact count is always shown (never hidden behind color alone).
- Click any assignee name to drill down into just their issues, with the dashboard filters still applying underneath.

## 13. Custom Chart Builder

When the built-in views don't show exactly what you need:

1. Click **Add chart**, or pick one of the ~29 ready-made views from the dropdown (e.g., "Assignee × Priority heat map," "State × Assignee %").
2. Configure: chart type (bar/stacked/line/pie/donut/heat map/table…), what to analyze by, an optional secondary grouping, the metric (count, % of total, open, closed, high-priority, reopened, average age, etc.), chart-only filters, sorting, and Top-N.
3. Click a bar/segment/cell to drill into those exact records in the Issue Register.
4. Export the chart's exact data as CSV/Excel, or the image as PNG/SVG.
5. Add as many charts as you like; duplicate, reorder, or remove them freely. They reset when you upload a new file or clear data (nothing is saved between sessions — see §14).

## 14. Development and QA Handoff

A pipeline view of where work currently sits (New → Development in Progress → Ready for QA → Reopened → Closed), plus an explicit list of metrics the tool **cannot** calculate from a point-in-time export (time in development, QA turnaround, historical reopen counts, developer productivity) — shown as "Insufficient data" rather than guessed, since your file only has current state, not a history of changes.

## 15. Issue Register

The detailed, searchable table behind every figure in the dashboard.

- Search across all fields or a specific scope; sort any column; choose which columns to show; page through large result sets.
- The register always reflects whatever KPI/chart/risk selection is currently active, on top of your global filters — the header above it always tells you "Showing X of Y records."
- **Export filtered (CSV)** downloads exactly what's currently displayed.
- Click any row to open the full record details in a side panel.

## 16. Data Quality Overview

- A 0–100 score built from 8 explicit rules (ID/status/priority/assignee completeness, status/priority mapping coverage, date validity, unique IDs) — 98%+ passes, 90%+ is a warning, below that is an error.
- Fields you haven't mapped are not penalized unless you explicitly mark them as required.
- Every finding lists its severity and a recommended fix, and you can download the full data-quality report as CSV.
- If your file has duplicate issue IDs, you'll see them here with three choices: include all (default, with a warning), exclude all but the first occurrence, or **review and choose exactly which ones to exclude** — nothing is ever excluded automatically without your decision.

## 17. Snapshot Comparison (optional)

Load an earlier export of the same tracker to see what changed:

1. Click **Load snapshot** and pick the older file. It's normalized using the same column/value mapping as your current file, matched by column name.
2. You'll see: which metrics moved (and by how much), which issues are newly observed or no longer present, status/priority/assignee changes, and anything that moved to or back from Closed.
3. This compares exactly two point-in-time exports — it is not a running history. Remove the snapshot any time with **Remove snapshot**, or it clears automatically on Clear Data.

## 18. Export and Report Generation

Four ready-made templates:

| Template | Best for |
|---|---|
| **Daily QA Status Report** | A quick daily summary: KPIs, status, priority, risks, data quality. |
| **Weekly Management Report** | The full picture for a weekly update: adds assignee workload and (if loaded) the snapshot comparison. |
| **Release Readiness Report** | Pre-release check against your own thresholds (max open high-priority, max open backlog, max reopened, max unassigned) — it reports whether your criteria are met; it never declares a release "approved." |
| **Developer / Tester Workload Report** | Assignee workload plus the issue register, for one or more chosen people. |

- Toggle individual sections on/off; unsupported sections (e.g., aging without a Created Date column) are shown disabled with the reason.
- **Preview report** opens a print-ready view — use your browser's **Save as PDF** to export it, or click **Excel** in the preview to download a full workbook with one worksheet per section.
- The quick **Export Report** menu in the header also offers a one-click Excel workbook of the whole dashboard, CSV exports of any view, and an executive summary as text (or copy it straight to your clipboard).

## 19. Comparing with the earlier "every state" list

If your Azure DevOps board uses exactly these states — **New, Re-opened, Ignore, Ready for QA, Development in progress, QA in progress, On hold, Resolved in UAT, Closed in UAT** — here's how they map in this tool out of the box:

| Your state | Recognized as | Needs a one-time category decision? |
|---|---|---|
| New | New (core) | No — auto-categorized Open |
| Re-opened | Reopened (core) | No — auto-categorized Open |
| Ready for QA | Ready for QA (core) | No — auto-categorized Open |
| Development in progress | Development in Progress (core) | No — auto-categorized Open |
| QA in progress | QA in Progress | Yes (suggested: Open) |
| On hold | On Hold | Yes (suggested: Open) |
| Resolved in UAT | Resolved in UAT | Yes (your call — Closed or Open, depending on your process) |
| Closed in UAT | Closed in UAT | Yes (your call) |
| Ignore | Ignore | Yes (your call — many teams leave this Unmapped so it's excluded from both open and closed totals) |

Make these category decisions once, then **Save mapping** (§5) so every future export from this board applies them automatically.

## 20. Privacy and data handling — what actually happens to your file

- Your file is read and processed **only inside your browser tab**. It is parsed in a background Web Worker, never sent to any server.
- The page's security policy (Content-Security-Policy) technically blocks the browser itself from making any outbound connection — even if a bug tried to, it would be refused.
- No cookies, no browser storage of any kind is used — refreshing the page clears everything (you'll get a warning first), and there's an explicit **Clear Data** button that releases everything immediately.
- All exports (CSV, Excel, PNG, PDF) are generated on your machine and saved through your browser's normal download mechanism — nothing is uploaded as part of exporting, either.
- See [PRIVACY.md](../PRIVACY.md) for the full independent verification methodology, if you need to document this for a security review.

## 21. Tips and best practices

- **Save a mapping template** the first time you set up a recurring query, so every future export is a 30-second upload instead of a full remapping.
- **Decide your workflow categories once, deliberately** — especially ambiguous ones like "Resolved in UAT" or "Ignore" — since this single decision drives closure %, backlog, and several risk indicators.
- **Export as CSV for very large queries** (tens of thousands of rows) — it parses dramatically faster than Excel.
- **Use the Active Work by Assignee section for your daily standup**, and the full Assignee Workload section for weekly planning/rebalancing conversations.
- **Treat risk indicators as conversation starters, not scorecards** — they're explicitly designed to flag situations, not to rate individuals.

## 22. Troubleshooting / FAQ

**My file won't upload.**
Check the error message — it will say specifically if the file is empty, password-protected, an unsupported format, or over the size limit. Password-protected workbooks must have the password removed before uploading (the tool processes nothing without being able to read the actual data).

**A KPI/section says "not mapped" or "Not configured."**
Map the required column in Column Mapping (Status/Assignee/Priority), or — for closure %/backlog — go to Value Mapping and classify at least one status as Open or Closed.

**My closure % says "Provisional."**
Some records have a status still marked Unmapped. Finish classifying your statuses in Value Mapping to get a definitive number.

**Two spellings of the same person show up separately.**
Rename one of them to match the other's display name in Value Mapping → Assignees — the tool only merges identical-after-trimming names automatically.

**I refreshed the page and lost my work.**
This is expected — the tool deliberately keeps nothing in browser storage. Export anything you need (CSV/Excel/PDF) or save your mapping template before refreshing, replacing the file, or clicking Clear Data.

**Can this sync automatically with Azure DevOps?**
Not in the current version — you still export manually. See the BRD's roadmap section for options under consideration (a local-folder auto-load, a local sync script, or a full live API integration) and the trade-offs each one involves.

**A chart's numbers look different from the KPI cards.**
Check the chart's own filters (chart-level filters narrow only that one chart) versus the dashboard's global filters (shown as chips above the Issue Register) — they're independent by design so you can explore a chart without disturbing the rest of the dashboard.

## 23. Keyboard and accessibility notes

- All interactive elements (KPI cards, chart bars, heat-map cells, sidebar links) are keyboard-reachable and screen-reader labeled.
- Every chart includes a hidden, screen-reader-accessible text summary of its data, not just the visual rendering.
- The heat map is fully operable by keyboard, including sorting a column from the keyboard.
- The app respects your system's light/dark mode, with a manual toggle in the header (not remembered between visits, by design — see §20).
