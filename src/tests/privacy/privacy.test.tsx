import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import App from '@/App';
import { createParseClient } from '@/lib/parsers/parseClient';
import { sampleCsv } from '../fixtures';
import { captureDownloads, clearData, expandSection, generateDashboard, kpiCount, uploadFile } from '../integration/helpers';

vi.mock('@/components/charts/EChart', async () => {
  const mod = await import('../integration/echartsMock');
  return { EChart: mod.EChartMock };
});

const ROOT = join(__dirname, '..', '..', '..');
const SRC = join(ROOT, 'src');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === 'tests' ? [] : sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

describe('runtime: no transmission and no persistence of issue data', () => {
  const spies: Record<string, ReturnType<typeof vi.fn>> = {};
  let cookieWrites = 0;
  const originals: Record<string, unknown> = {};

  beforeEach(() => {
    cookieWrites = 0;
    spies.fetch = vi.fn(() => Promise.reject(new Error('network disabled in test')));
    originals.fetch = globalThis.fetch;
    globalThis.fetch = spies.fetch as unknown as typeof fetch;

    spies.xhrOpen = vi.fn();
    originals.xhrOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = spies.xhrOpen as unknown as typeof XMLHttpRequest.prototype.open;

    spies.beacon = vi.fn(() => true);
    originals.beacon = navigator.sendBeacon;
    Object.defineProperty(navigator, 'sendBeacon', { value: spies.beacon, configurable: true });

    spies.ws = vi.fn();
    originals.ws = globalThis.WebSocket;
    globalThis.WebSocket = spies.ws as unknown as typeof WebSocket;

    spies.setItem = vi.fn();
    originals.setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = spies.setItem as unknown as typeof Storage.prototype.setItem;

    spies.idb = vi.fn();
    originals.idb = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
    Object.defineProperty(globalThis, 'indexedDB', { value: { open: spies.idb }, configurable: true });

    originals.cookie = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      get: () => '',
      set: () => {
        cookieWrites++;
      },
    });
  });

  afterEach(() => {
    globalThis.fetch = originals.fetch as typeof fetch;
    XMLHttpRequest.prototype.open = originals.xhrOpen as typeof XMLHttpRequest.prototype.open;
    Object.defineProperty(navigator, 'sendBeacon', { value: originals.beacon, configurable: true });
    globalThis.WebSocket = originals.ws as typeof WebSocket;
    Storage.prototype.setItem = originals.setItem as typeof Storage.prototype.setItem;
    if (originals.idb) Object.defineProperty(globalThis, 'indexedDB', originals.idb as PropertyDescriptor);
    delete (document as unknown as Record<string, unknown>).cookie;
  });

  it('upload, filtering, exporting, printing and clearing make no requests and write no storage', async () => {
    const user = userEvent.setup();
    render(<App />);
    await uploadFile(user, new File([sampleCsv()], 'private.csv', { lastModified: 3 }));
    await generateDashboard(user);

    // Filtering and chart interaction.
    await user.click(screen.getByTestId('kpi-reopened'));
    await expandSection(user, 'Assignee Workload and Priority Matrix');
    await user.selectOptions(screen.getByLabelText('Drill down into an assignee'), 'Ben Ito');
    await user.type(screen.getByLabelText('Search issues'), 'crash');

    // Exports.
    const downloads = captureDownloads();
    try {
      await user.click(screen.getByRole('button', { name: /Export Report/ }));
      await user.click(await screen.findByRole('menuitem', { name: /Excel workbook/ }));
      await user.click(screen.getByRole('button', { name: /Export Report/ }));
      await user.click(await screen.findByRole('menuitem', { name: /All issues/ }));
      await user.click(screen.getByRole('button', { name: /Download data quality report/ }));
      expect(downloads.blobs.length).toBe(3);
    } finally {
      downloads.restore();
    }

    // Printable report (rendered locally).
    await user.click(screen.getByRole('button', { name: /Export Report/ }));
    await user.click(await screen.findByRole('menuitem', { name: /Printable report/ }));
    expect(screen.getByTestId('print-report')).toHaveTextContent('private.csv');
    await user.click(within(screen.getByRole('dialog', { name: 'Printable report' })).getByRole('button', { name: /Close/ }));

    // Report templates, report Excel export and a comparison snapshot — all local.
    await expandSection(user, 'Export and Report Generation');
    await user.click(screen.getByRole('radio', { name: /Weekly Management Report/ }));
    const reportDownloads = captureDownloads();
    try {
      await user.click(screen.getByRole('button', { name: /Download Excel report/ }));
      expect(reportDownloads.blobs.length).toBe(1);
    } finally {
      reportDownloads.restore();
    }
    await user.upload(screen.getByTestId('comparison-file-input'), new File([sampleCsv()], 'previous-snapshot.csv', { lastModified: 5 }));
    await screen.findByTestId('comparison-result');

    await clearData(user);
    expect(document.body.textContent).not.toContain('previous-snapshot.csv');

    expect(spies.fetch).not.toHaveBeenCalled();
    expect(spies.xhrOpen).not.toHaveBeenCalled();
    expect(spies.beacon).not.toHaveBeenCalled();
    expect(spies.ws).not.toHaveBeenCalled();
    expect(spies.setItem).not.toHaveBeenCalled();
    expect(spies.idb).not.toHaveBeenCalled();
    expect(cookieWrites).toBe(0);
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it('clearing returns to the initial upload state with no dataset in the DOM', async () => {
    const user = userEvent.setup();
    render(<App />);
    await uploadFile(user, new File([sampleCsv()], 'private.csv', { lastModified: 4 }));
    await generateDashboard(user);
    expect(kpiCount('total')).toBe('9');
    await clearData(user);
    expect(document.body.textContent).not.toContain('Asha Rao');
    expect(document.body.textContent).not.toContain('Login fails');
    expect(document.body.textContent).not.toContain('private.csv');
  });
});

describe('parsing worker lifecycle', () => {
  it('terminates the worker (releasing cached file contents) and rejects pending parses on cancel', async () => {
    const instances: { posted: unknown[]; terminated: boolean }[] = [];
    class FakeWorker {
      posted: unknown[] = [];
      terminated = false;
      onmessage: ((e: MessageEvent) => void) | null = null;
      onerror: ((e: ErrorEvent) => void) | null = null;
      constructor() {
        instances.push(this);
      }
      postMessage(m: unknown) {
        this.posted.push(m);
      }
      terminate() {
        this.terminated = true;
      }
    }
    const original = globalThis.Worker;
    globalThis.Worker = FakeWorker as unknown as typeof Worker;
    try {
      const client = createParseClient();
      const pending = client.parse(new File(['a,b'], 'x.csv'), {});
      expect(instances).toHaveLength(1);
      client.terminate();
      await expect(pending).rejects.toMatchObject({ code: 'cancelled' });
      expect(instances[0].terminated).toBe(true);
    } finally {
      globalThis.Worker = original;
    }
  });
});

describe('static checks', () => {
  const files = sourceFiles(SRC);

  it('application code never uses network, telemetry or browser-storage APIs', () => {
    const forbidden = [
      /\bfetch\s*\(/,
      /XMLHttpRequest/,
      /sendBeacon/,
      /new\s+WebSocket/,
      /EventSource/,
      /localStorage/,
      /sessionStorage/,
      /indexedDB/,
      /document\.cookie/,
      /caches\./,
      /serviceWorker/,
      /download:\s*true/,
    ];
    const offenders: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      for (const pattern of forbidden) if (pattern.test(text)) offenders.push(`${relative(ROOT, file)}: ${pattern}`);
    }
    expect(offenders).toEqual([]);
  });

  it('declares no database, analytics, telemetry or AI dependencies', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { dependencies: Record<string, string> };
    const deps = Object.keys(pkg.dependencies);
    const banned = /sql|mongo|redis|firebase|supabase|dexie|localforage|idb|prisma|sequelize|sentry|analytics|segment|mixpanel|amplitude|posthog|datadog|newrelic|bugsnag|logrocket|openai|anthropic|langchain|axios/i;
    expect(deps.filter((d) => banned.test(d))).toEqual([]);
  });

  it('production builds forbid all network connections via Content-Security-Policy', () => {
    const config = readFileSync(join(ROOT, 'vite.config.ts'), 'utf8');
    expect(config).toContain(`"connect-src 'none'"`);
    expect(config).toContain('polyfill: false');
    expect(readFileSync(join(ROOT, 'index.html'), 'utf8')).toContain('<!-- CSP -->');
  });
});
