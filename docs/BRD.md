# Business Requirements Document (BRD)

## QA Issue Analytics Dashboard

| | |
|---|---|
| **Document version** | 1.0 |
| **Status** | Draft for review |
| **Application version** | 1.0.0 |
| **Last updated** | 2026-10-28 |
| **Prepared for** | QA / Engineering Management |

---

## 1. Purpose

This document defines the business need, objectives, scope, and functional/non-functional requirements for the **QA Issue Analytics Dashboard** — a browser-based tool that turns an exported issue-tracking spreadsheet (Azure DevOps, Jira, or any similar bug tracker) into a management-ready analytics dashboard, with no server-side component.

## 2. Background / Problem Statement

QA and engineering managers routinely export bug/work-item query results from Azure DevOps (or similar trackers) as Excel/CSV files to answer recurring questions:

- How many issues are **New**, **Reopened**, or **in Development** right now, and **who owns them**?
- Who is carrying the heaviest workload, and is it concentrated on too few people?
- What is the open backlog, the closure rate, and which issues are high priority and still open?
- Which issues need attention today (aging, unassigned, reopened, stuck in QA)?
- Is the exported data itself trustworthy (missing fields, duplicate IDs, unmapped statuses)?

Today this analysis is done manually in Excel/PivotTables after every export, which is repetitive, error-prone, and inconsistent between people. There is also an organizational requirement that **issue data must never leave the analyst's machine** — it cannot be uploaded to a third-party SaaS tool or a company server for this kind of ad hoc analysis.

## 3. Business Objectives

| ID | Objective |
|---|---|
| BO-1 | Eliminate manual spreadsheet rework after every tracker export. |
| BO-2 | Give a single, consistent view of **New / Reopened / Development-in-Progress** work and its owners, since this is the primary daily triage need. |
| BO-3 | Surface actionable risk signals (aging, unassigned, high-priority backlog, reopens, QA queue) without custom formulas. |
| BO-4 | Guarantee that uploaded issue data is never transmitted to, or stored on, any server — satisfying data-handling policy for client/project data. |
| BO-5 | Produce ready-to-share management reports (daily status, weekly management, release readiness, developer/tester workload) in a few clicks. |
| BO-6 | Work with any exporting tool (Azure DevOps, Jira, etc.) and any column layout, via a configurable one-time mapping step. |

## 4. Scope

### 4.1 In scope

- Import of `.xlsx`, `.xls`, and `.csv` exports from any issue tracker.
- User-driven mapping of source columns to logical fields (Status, Assignee, Priority, dates, etc.).
- User-driven normalization of status/priority/assignee values, including recognizing common Azure DevOps and UAT-cycle states (New, Reopened, Development in Progress, Ready for QA, QA in Progress, On Hold, Resolved in UAT, Closed in UAT, Ignore) by name.
- Reusable mapping templates (save/load as a local file) so a recurring export from the same tracker does not need to be remapped each time.
- Executive KPI dashboard, a dedicated **Active Work by Assignee** view (New/Reopened/Development-in-Progress by owner), risk/attention indicators, status/priority analytics, assignee workload analytics with a priority heat-map, a free-form chart builder, a development/QA handoff view, a searchable issue register, a data-quality score, and an optional two-snapshot comparison.
- Local export of filtered data, charts, and four management report templates (Excel and print/PDF).
- A fully client-side, zero-network, zero-persistence architecture (see §8 and the companion TSD).

### 4.2 Out of scope (current version)

- Any live or scheduled synchronization with Azure DevOps, Jira, or any other tracker's API.
- Multi-user / shared / server-hosted state (dashboards, comments, saved views shared between people).
- Historical trend analysis across more than two point-in-time exports (only a two-snapshot "what changed" comparison is supported).
- Time-in-status, cycle time, lead time, or any metric that requires status-change history (the source data is a current-state snapshot only).
- User authentication, roles, or permissions (the tool has no concept of "users" — it is a single-session, single-browser-tab tool).

## 5. Stakeholders and Users

| Role | Interest |
|---|---|
| QA Manager / Engineering Manager | Primary user — daily/weekly triage, status reporting to leadership. |
| Team Lead / Scrum Master | Assignee workload balancing, standup prep. |
| Individual QA/Dev contributor | Occasional use to check personal backlog via drill-down. |
| IT Security / Compliance | Owns the no-data-leaves-the-browser requirement; verifies via the privacy audit. |
| Release manager | Uses the Release Readiness report template before a release decision. |

## 6. Business Requirements

Each requirement is written as "the system shall…". Requirement IDs are stable and should be referenced by the TSD and test plans.

### 6.1 Data import and setup

| ID | Requirement |
|---|---|
| BR-01 | The system shall accept `.xlsx`, `.xls`, and `.csv` files up to a configurable size limit (default 100 MB). |
| BR-02 | The system shall let the user choose the worksheet, header row, CSV delimiter, and date order (M/D/Y or D/M/Y) before importing. |
| BR-03 | The system shall auto-detect the header row and likely column-to-field mapping, and allow the user to correct any detection. |
| BR-04 | The system shall clearly state which analytics become unavailable when Status, Assignee, or Priority is not mapped, rather than failing silently. |
| BR-05 | The system shall let the user save the current column and value mapping as a local file, and re-apply a previously saved mapping to a new file by matching column names — so a recurring export does not need remapping each time. |

### 6.2 Status, priority, and assignee normalization

| ID | Requirement |
|---|---|
| BR-10 | The system shall normalize raw status text into a consistent label and classify it into exactly one workflow category: Open/Pending, Closed, or Unmapped — the category must never be guessed automatically for non-core statuses; the user must confirm it. |
| BR-11 | The system shall recognize, by name, the following statuses without requiring the user to map them from scratch on first use: New, Reopened, Development in Progress, Ready for QA, Closed, QA in Progress, On Hold, Resolved in UAT, Closed in UAT, Ignore, and common generic equivalents (Active, In Progress, Blocked, Testing, Done, etc.). |
| BR-12 | The system shall recognize common priority notations (P1/P2/…, Priority 1/2/…, Critical/High/Medium/Low) automatically, flag bare numbers for the user to confirm the 1-is-highest convention, and let the user define which priority levels count as "high priority." |
| BR-13 | The system shall group assignee names case/whitespace-insensitively and let the user treat blank or placeholder values (e.g. "Unassigned", "N/A") as Unassigned. |

### 6.3 Executive dashboard and active-work triage

| ID | Requirement |
|---|---|
| BR-20 | The system shall display, as the primary landing view, KPI cards for Total, Closed, Closure Rate, Open Backlog, High-Priority Open Backlog, Reopened, Ready for QA, Unassigned, and Data-Quality Score, each of which filters the issue register when clicked. |
| BR-21 | The system shall provide a dedicated view showing, per assignee, the count of issues in each of the New, Reopened, and Development-in-Progress states — the three states requiring active owner attention — with totals, a chart, and one-click drill-down into the matching issues. |
| BR-22 | The system shall allow exporting exactly the active-work record set (New + Reopened + Development-in-Progress) as CSV. |

### 6.4 Risk and attention management

| ID | Requirement |
|---|---|
| BR-30 | The system shall surface, as explicit rule-based indicators (not AI inference), at minimum: high-priority open backlog, reopened issues, aging open issues (configurable day buckets), unassigned issues, incomplete/unmapped records, and the QA queue. |
| BR-31 | Each indicator shall state its exact inclusion rule and any data-quality limitation affecting its accuracy, and allow listing or exporting exactly its matching records. |

### 6.5 Workload and priority analysis

| ID | Requirement |
|---|---|
| BR-40 | The system shall show, per assignee: total, open, closed, high-priority, reopened, ready-for-QA counts, and share of the total/open backlog, sortable and searchable, with a configurable "workload concentration" highlight. |
| BR-41 | The system shall provide an assignee-by-priority matrix (heat map) in both "all issues" and "open issues only" modes. |
| BR-42 | The system shall show priority distribution, priority-by-status mix, and an open/closed/unmapped backlog breakdown per priority level. |

### 6.6 Custom analysis

| ID | Requirement |
|---|---|
| BR-50 | The system shall provide a configurable chart builder supporting at least: bar (vertical/horizontal/stacked/grouped/100%), line, area, pie, donut, heat map, and table outputs, over any combination of the dataset's fields and at least a dozen computed metrics, with at least 25 ready-made views. |
| BR-51 | Each custom chart shall support its own filters (independent of the dashboard's global filters) and export its exact rendered data as CSV/Excel/PNG/SVG. |

### 6.7 Reporting and export

| ID | Requirement |
|---|---|
| BR-60 | The system shall provide at least four management report templates (Daily QA Status, Weekly Management, Release Readiness, Developer/Tester Workload) with selectable sections, previewable, and exportable to Excel and to print/PDF. |
| BR-61 | The system shall never state or imply a release is "approved" — release-readiness output is informational only, against user-defined thresholds. |
| BR-62 | The system shall allow exporting the full dataset, any filtered view, or any single chart/risk-card/KPI selection as CSV or Excel, with formula-injection-safe values. |

### 6.8 Data quality

| ID | Requirement |
|---|---|
| BR-70 | The system shall compute a transparent, weighted data-quality score from explicit, visible rules (completeness, mapping coverage, date validity, ID uniqueness), and list every finding with severity and a recommended fix. |
| BR-71 | The system shall let the user review and selectively exclude duplicate-ID records from analysis, never excluding anything automatically without the user's explicit choice. |

### 6.9 Change tracking

| ID | Requirement |
|---|---|
| BR-80 | The system shall allow loading one earlier export of the same tracker and reporting metric changes, newly observed / no-longer-present issues, and status/priority/assignee changes between the two snapshots. |

### 6.10 Privacy and data handling

| ID | Requirement |
|---|---|
| BR-90 | The system shall process the uploaded file entirely within the user's browser and shall never transmit its contents to any server, service, or third party. |
| BR-91 | The system shall not use any persistent browser storage (cookies, `localStorage`, `sessionStorage`, IndexedDB, Cache Storage, service workers) for issue data, mappings, settings, or report configuration. |
| BR-92 | The system shall fully release all uploaded data from memory on a user-initiated "Clear Data" action, verified by an automated heap-reachability check. |
| BR-93 | The system shall display a clear, accurate privacy statement on the upload screen. |

## 7. Non-Functional Requirements

| Category | Requirement |
|---|---|
| **Performance** | The dashboard shall remain usable (initial render under ~5 seconds, filter interactions under ~1 second) for datasets up to 100,000 rows × 50 columns on a typical laptop. |
| **Browser support** | Current versions of Chrome, Edge, Firefox, and Safari. |
| **Responsiveness** | The UI shall be fully usable at phone width (390px) with no horizontal overflow, and shall adapt its navigation (collapsible sidebar / slide-in drawer) to the viewport. |
| **Accessibility** | Interactive elements shall be keyboard-operable and carry appropriate ARIA labeling; charts shall provide an accessible text summary of their data. |
| **Privacy / Security** | See BR-90 through BR-93; enforced by an automated static-source and runtime audit (`npm run privacy:check`, `privacy.test.tsx`) and a restrictive Content-Security-Policy on every deployment. |
| **Reliability** | Parsing failures (corrupt file, password-protected workbook, unsupported format) shall be reported with an actionable message, never a silent failure or crash. |
| **Maintainability** | Business logic (normalization, aggregation, risk rules, report assembly) shall be implemented as pure, independently unit-tested functions, separate from UI rendering. |

## 8. Assumptions and Constraints

- Users export data manually from their tracker today; this tool does not change that workflow unless a future phase adds the integrations discussed in §11.
- The exported file is a **snapshot of current state** — it has no history of status transitions. Metrics that would require that history (time-in-status, QA turnaround, historical reopen counts, developer productivity) are explicitly out of scope and the UI states "Insufficient data" rather than estimating.
- The organization's security policy prohibits uploading issue/bug data (which may reference client names, internal system details, or security issues) to any third-party or server-hosted tool — this is the foundational constraint behind BR-90–BR-93 and is non-negotiable for the current product.
- The tool assumes one worksheet/export represents one point-in-time scope; combining multiple worksheets automatically is not supported (the user picks one).

## 9. Success Metrics

| Metric | Target |
|---|---|
| Time to produce a daily status update | Reduced from a manual spreadsheet exercise (historically ~20–30 minutes) to under 5 minutes from export to shared report. |
| Analyst trust in the privacy model | Zero findings in the independent network/disk/heap verification described in the TSD and PRIVACY.md. |
| Adoption | Used as the standard pre-standup/pre-release artifact by the QA team within one reporting cycle of rollout. |
| Data-quality visibility | 100% of exports reviewed show a computed data-quality score before being reported on. |

## 10. Known Limitations (business-facing)

- **Snapshot only** — no trend lines across more than two exports in this version; see the roadmap below.
- **No live sync** — the user must still manually export from Azure DevOps/Jira; see §11 for the options under consideration.
- **Assignee de-duplication is manual** — two different spellings of the same person ("J. Smith" vs "John Smith") are not merged automatically.
- **Large Excel files are slow to parse** (~48 seconds for 100k rows in the test environment) — CSV is recommended for very large exports.

## 11. Roadmap / Candidate Future Enhancements

These are **not committed requirements** in this version; they are candidates for a future phase and require a separate decision, since several of them interact with the privacy constraint in §8:

1. **Aging-aware Active Work view** — flag New/Reopened/Dev-in-Progress issues that have sat unactioned past a threshold.
2. **Workload concentration alert on Active Work** — highlight when one assignee holds a disproportionate share of active work.
3. **Active Work as a report section** in the management report templates.
4. **Command palette / quick navigation** for power users.
5. **One-click "stand-up digest" text/Slack export** of Active Work by Assignee.
6. **Bulk value-mapping actions** (e.g., "map all statuses containing 'UAT' to Closed" in one step).
7. **Fuzzy assignee-merge suggestions** to reduce manual de-duplication.
8. **Local-folder auto-load** of the newest exported file via the browser's File System Access API, so a recurring manual export is picked up automatically without a per-file upload click — this preserves the zero-network guarantee (BR-90) because it only ever reads a local file the user placed there.
9. **Scheduled local sync script** (run by the user, not hosted) that pulls an Azure DevOps query via a Personal Access Token and drops the result into the folder from item 8 — decision pending on who owns and secures that script.
10. **Direct live Azure DevOps API integration** — technically possible but requires relaxing the current Content-Security-Policy and no-storage guarantees (storing a token, making authenticated network calls); **requires an explicit, separate risk/privacy decision** before being scheduled, since it changes the trust model described in BR-90–BR-93.

## 12. Glossary

| Term | Meaning |
|---|---|
| **Normalized status** | The display label the dashboard uses for a group of raw source status values (e.g., "Re-Open", "REOPENED" → "Reopened"). |
| **Workflow category** | One of exactly three buckets — Open/Pending, Closed, Unmapped — used for all "is this done yet" calculations (closure %, backlog, aging). |
| **Active work** | Issues currently in the New, Reopened, or Development-in-Progress state — the three states the organization treats as needing owner action right now. |
| **In scope / in analytics** | The subset of imported rows actually used in calculations, after the duplicate-ID rule and any global filters are applied. |
| **Risk indicator** | A rule-based "needs attention" flag (e.g., aging, unassigned) — explicitly not a measure of individual performance or a prediction. |
| **Snapshot comparison** | A manual, two-point-in-time diff between the current export and one earlier export of the same tracker. |
