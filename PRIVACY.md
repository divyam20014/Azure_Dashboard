# Privacy design and verification checklist

Statement shown on the upload screen:

> Your file is processed locally in your browser. The uploaded file and its data are not uploaded to a server or stored in a database. Exported reports are generated locally on your device.

## How the statement is enforced

| Guarantee | Mechanism |
|---|---|
| File is read locally | The `File` object is read with `Blob.arrayBuffer()` / `FileReader` inside a Web Worker (`src/workers/parsingWorker.ts`). There is no upload endpoint and no backend. |
| No data leaves the browser | No application code calls `fetch`, `XMLHttpRequest`, `sendBeacon`, `WebSocket` or `EventSource`. Production builds also carry a Content-Security-Policy with `connect-src 'none'` (plus `img-src 'self' data: blob:`, `form-action 'none'`, `script-src 'self'`), so the browser itself refuses outbound connections, image beacons and form posts — even from a third-party library. The policy is sent both as a `<meta>` tag (page) and as HTTP headers (`vite preview`, `staticwebapp.config.json`, `_headers`), because a Web Worker takes its policy from the headers of its own script. |
| No external AI / analytics / telemetry | The executive summary is produced by fixed rules (`src/lib/analytics/summaryGenerator.ts`). No analytics, error-reporting or AI packages are installed; no fonts or scripts load from other origins. |
| No persistence | No `localStorage`, `sessionStorage`, IndexedDB, cookies, Cache Storage or service worker. All data lives in React state, the worker and the file input. Refreshing the page discards it (a browser prompt warns first). |
| Reports and comparisons are local | Report previews, the management Excel report and the snapshot comparison are built from in-memory analytics. A comparison snapshot is parsed by the same worker and held only in React state. |
| Settings are not persisted | Aging buckets, score weights, required fields, the workload threshold, report template, sections and release criteria live in React state only. No browser storage is used. They are reset on a new dataset and on Clear Data. |
| Exports are local | Files are built in memory (`Blob`) and saved through an object URL that is revoked afterwards, only after a user click. PDF output uses the browser's own print dialog. |
| Clear Data releases the session | Confirmation dialog → terminates the parsing worker (dropping its cached workbook), clears the file input, resets the dataset, setup draft, filters, selections, search and messages, and returns to the upload screen. Three less obvious holders are also released (see below). |

### Memory release details

An independent heap-snapshot audit found three places where uploaded data outlived Clear Data. All are fixed, with regression tests in `src/tests/privacy/release.test.tsx`:

1. **Stale React callbacks.** Memoized callbacks in `useDataset` closed over the hook's whole `state`, so the closure of the last such render kept `dataset.records` alive. They now read the draft through a ref.
2. **Detached DOM pinned by the browser.** Chrome keeps native references to some form controls after they are removed (seen: the rows-per-page `<select>`). A detached control still links to its former parent, so the entire removed dashboard — every rendered title and name — stayed in memory. Every view that renders uploaded data is wrapped in `ScrubOnUnmount`. On removal it severs all parent/child links and blanks form-control values and attributes, leaving any pinned control isolated and empty.
3. **Chart label cache.** ECharts' renderer (ZRender) caches the measured width of every drawn label in a module-level LRU (`strWidthCache`), including assignee names, statuses and legend text. Clear Data evicts it (`src/lib/privacy/chartCacheCleanup.ts`).

After these fixes, a heap snapshot taken after Clear Data contains **0** strongly reachable objects (JavaScript strings or DOM nodes) holding uploaded titles, assignee names, statuses or priorities. This held across every interaction tested: setup and value mapping, filters, search, filter popovers, record drawer, print view and exports.

Third-party code note: Papa Parse contains an `XMLHttpRequest`-based streamer used only for remote URLs (`download: true`), which this app never uses; the static audit checks that the option is never set, and the CSP blocks it regardless. The `http://` strings in the SheetJS and ECharts bundles are XML namespace identifiers, not requests.

What is **not** claimed: forensic erasure of memory. The app drops all references so the browser can reclaim the memory; the operating system and browser decide when that physically happens.

## Automated checks

| Check | How to run | What it verifies |
|---|---|---|
| Runtime privacy test | `npm test` (`src/tests/privacy/privacy.test.tsx`) | Full flow — upload, KPI and chart selection, global filter, search, Excel/CSV/data-quality exports, print report, Clear Data — with `fetch`, `XMLHttpRequest.open`, `sendBeacon`, `WebSocket`, `Storage.setItem`, `indexedDB.open` and `document.cookie` instrumented: none are called; storage stays empty; after clearing, no file name, assignee or title remains in the page. |
| Worker lifecycle test | same file | Cancelling / clearing terminates the worker and rejects pending parses. |
| Static source scan | same file and `npm run privacy:check` | Application source contains no network, telemetry or storage APIs; no database/analytics/AI dependencies; CSP configured. |
| Build audit | `npm run build && npm run privacy:check` | `dist/index.html` has the CSP with `connect-src 'none'` and loads no external scripts; lists network-capable code inside third-party bundles for review. |
| Dependency audit | `npm audit --omit=dev` | Known vulnerabilities in shipped dependencies. |

## Manual verification procedure (browser)

Run `npm run build && npm run preview`, open http://localhost:4173 and open DevTools.

1. **Upload generates no request with file contents**
   - Network tab → enable *Preserve log*, clear the log.
   - Upload a file and complete the mapping.
   - Expected: no new entries except same-origin JavaScript chunks / favicon. Nothing is POSTed; no request goes to another origin.
2. **Filtering generates no transmission** — click KPI cards, chart bars, matrix cells; change global filters and search. Expected: no new network entries.
3. **Exports generate no upload** — run every item in *Export Report* and *Download data quality report*. Expected: files appear in the browser's downloads; the Network tab shows at most `blob:` entries, never an HTTP request.
4. **Connections are blocked by policy** — in the Console run
   `fetch('https://example.com', {method:'POST', body:'x'})`
   Expected: `Refused to connect … violates … connect-src 'none'`.
   Response headers of `/assets/parsingWorker-*.js` (Network tab → Headers) should include the same `Content-Security-Policy`.
5. **No browser storage** — Application tab → Local Storage, Session Storage, IndexedDB, Cookies, Cache Storage and Service Workers are empty for the site, before and after an analysis.
6. **Clear Data resets the session** — click *Clear Data* and confirm. Expected: upload screen with the privacy statement; the header no longer shows the file name. Optional: Memory tab → take a heap snapshot and search for a distinctive issue title; after clearing and pressing the *collect garbage* button it should no longer be found.
7. **Refresh does not restore data** — reload the page (accept the browser warning). Expected: empty upload screen.

## Independent verification (heap, network, disk)

An end-to-end verifier drove the production build in Chrome. It used a 480-record adversarial dataset with a unique marker in every title and compared against an explicit truth table. Results:

- **Network:** Chrome NetLog with full byte capture. The page and its worker made only `GET` requests to the app server, and the uploaded data appears nowhere in the captured traffic. Chrome's own background services (time sync, Safe Browsing, accounts, autofill, GCM) also appear in a NetLog. They are attributable by initiator and none were initiated by the app.
- **Disk:** the browser profile directory was byte-scanned after the session; it contains no uploaded data. `localStorage`, `sessionStorage`, IndexedDB, Cache Storage, service workers and cookies were all empty.
- **Memory:** heap snapshots before and after Clear Data; strong-reachability analysis as described above. The parsing worker is terminated.

## Verification of the management enhancement

The same method was applied after adding the executive dashboard, risk panel, assignee workload, report generator, data-quality score, duplicate review and snapshot comparison. The flow:
1. Upload the 480-record truth dataset and verify the KPIs, risks and heatmap.
2. Export the selection.
3. Load a comparison snapshot.
4. Generate the Weekly Excel report and the print preview / PDF.
5. Clear Data.

Results observed:
- **Memory:** 0 strongly reachable heap objects holding uploaded titles, assignee names, statuses, priorities or the comparison file name after Clear Data. The parsing worker was terminated.
- **Network:** NetLog showed only GET requests from the app to its own server, and the dataset marker never appeared in any traffic.
- **Storage and disk:** `localStorage`, `sessionStorage`, IndexedDB, Cache Storage and cookies stayed empty. The browser profile on disk contained no uploaded data.
- **Automated tests:** the runtime privacy test now also covers the report generator's Excel export and loading a comparison snapshot; no requests and no storage writes. After Clear Data, no trace of the snapshot file name remains in the page.

## Results of the earlier verification run

Executed on the production build in headless Chrome with `samples/sample-issues.xlsx`: 7 requests in total, all to `localhost:4173` (initial page assets, lazy JS chunks, favicon); 0 requests to any other origin; `localStorage`, `sessionStorage` and cookies empty after upload, filtering, exports, printing and clearing. In the browser, `fetch`, `sendBeacon` and an external image request to `example.com` were each refused by the CSP (console: "violates … Content Security Policy … The action has been blocked"). The worker script was confirmed to be served with the CSP header by `vite preview`.
