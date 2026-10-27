# Browser verification suites

These suites drive the **production build** in Google Chrome. They compare what the dashboard shows and exports with an independent oracle, and check the privacy guarantees in a real browser. They complement `npm test`, which runs in jsdom with a stand-in for the chart canvas.

## Running

```sh
npm run build        # the suites test dist/, not the dev server
npm run e2e          # management, edges, builder, layout
node e2e/run.mjs builder layout   # selected suites
npm run e2e:perf     # 100,000-row performance measurement (manual, ~2–3 min)
```

Requirements:
- Google Chrome. Set `CHROME_PATH` to use another Chromium-based browser.
- Python 3 for the oracle. Set `PYTHON` if it is not on the path as `python` / `python3`.

The runner starts `vite preview` on `127.0.0.1:4173`, with the production security headers. If a server is already running there, it reuses it. Set `E2E_URL` to test another address.

Outputs are written to `e2e/.work/` (git-ignored): generated data, downloads, PDFs, screenshots, NetLogs and `layout/layout-report.json`.

## What each suite checks

| Suite | Checks |
|---|---|
| `management` | Column and value mapping rules; every executive KPI; the assignee summary and heatmaps (total and open-only); Top-N; risks and aging buckets (including boundary days and missing, invalid and future dates); data-quality score; the three duplicate rules; CSV round-trip and formula-injection neutralisation; all four report templates (Excel sheets, frozen headers, values, print preview, PDF); global filters; privacy (see below). |
| `edges` | Empty scope, all-closed data, no high-priority group, no Created Date column, no Status column, unconfirmed custom priorities, keyboard operation and visible focus. |
| `builder` | Custom Chart Builder values against the oracle (Assignee → Priority heatmap, State → Assignee %, Assignee → State stacked, Priority % of total, Open vs closed preset); drill-down; chart-only filters; CSV, Excel, SVG (well-formed, renders) and PNG exports; reorder and remove; no text collisions or clipping for seven chart types at 1440 / 1024 / 390 px; privacy. |
| `layout` | Every dashboard chart, with the oracle dataset and a stress dataset (very long names, 12 statuses, 9 priorities) at 1440 / 1024 / 390 px. Fails on any text collision, clipped text, page overflow, or a sticky header that would cover section titles. |
| `perf` | Upload, builder interactions, a dashboard filter and Excel exports at 100,000 × 50. Prints timings and has no thresholds. |

**Privacy checks** (management and builder):
1. A heap snapshot before Clear Data must contain the data; this is the positive control.
2. After Clear Data, no uploaded value may be strongly reachable in the heap.
3. Browser storage and cookies must stay empty.
4. A Chrome NetLog with full byte capture must show only GET requests from the app to its own server, and never the uploaded data.
5. The browser profile on disk must contain no uploaded data.

## The oracle

`oracle.py` uses only the Python standard library and shares no code with the app. It generates a seeded, adversarial 420-record Azure DevOps-style CSV (`oracle-issues.csv`) with:
- case variants of one assignee, and blank and "Unassigned" owners;
- unmapped, custom and blank statuses and priorities;
- duplicate and blank IDs;
- missing, invalid (31 Feb) and future dates;
- dates on the aging-bucket boundaries;
- formula-like and quoted titles.

From the specification, it computes every expected figure into `truth-management.json` and `truth-builder.json`. Dates are relative to the day of the run.

## How text collisions are measured

Each SVG text element is treated as an oriented rectangle: its bounding box passed through its screen transform. Two texts collide when no separating axis exists and they overlap by more than 1 px. This judges rotated axis labels by their real geometry. Labels deliberately shortened with "…" are reported but do not fail the suite.
