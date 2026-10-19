import { describe, expect, it } from 'vitest';
import { StrictMode, useState } from 'react';
import { act, render, screen } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { setPlatformAPI } from 'zrender/lib/core/platform.js';
import { ensureFontMeasureInfo, measureWidth } from 'zrender/lib/contain/text.js';
import { scrubSubtree } from '@/lib/privacy/sessionCleanup';
import { releaseChartTextCache } from '@/lib/privacy/chartCacheCleanup';
import { ScrubOnUnmount } from '@/components/common/ScrubOnUnmount';
import { useDataset } from '@/hooks/useDataset';
import { buildDataset, initialSetup } from '@/lib/normalization/datasetBuilder';
import { sampleParsedFile, SAMPLE_HEADERS } from '../fixtures';

const flushMicrotasks = () => act(() => new Promise<void>((r) => setTimeout(r, 0)));

describe('scrubSubtree', () => {
  it('isolates every node and empties form controls, so a control the browser keeps alive holds no data', () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <table><tbody><tr><td><div title="Secret title">Secret title</div></td></tr></tbody></table>
      <label>Rows <select aria-label="Rows for Secret"><option>25</option></select></label>
      <input value="Secret name" aria-label="Display name for Secret name" />`;
    document.body.appendChild(root);
    const select = root.querySelector('select')!;
    const input = root.querySelector('input')!;
    const cell = root.querySelector('td')!;
    root.remove();

    scrubSubtree(root);

    expect(root.childNodes).toHaveLength(0);
    for (const el of [select, input, cell]) {
      expect(el.parentNode).toBeNull();
      expect(el.childNodes).toHaveLength(0);
    }
    expect(select.getAttributeNames()).toEqual([]);
    expect(input.getAttributeNames()).toEqual([]);
    expect(input.value).toBe('');
  });
});

describe('ScrubOnUnmount', () => {
  it('tears down its contents after a real unmount', async () => {
    const { unmount, container } = render(
      <ScrubOnUnmount>
        <p>Secret title</p>
        <select aria-label="pick">
          <option>Secret name</option>
        </select>
      </ScrubOnUnmount>,
    );
    const wrapper = container.firstElementChild!;
    const select = screen.getByLabelText('pick');
    unmount();
    await flushMicrotasks();
    expect(wrapper.childNodes).toHaveLength(0);
    expect(select.parentNode).toBeNull();
    expect(select.childNodes).toHaveLength(0);
  });

  it('leaves a mounted view intact under StrictMode (simulated unmount in development)', async () => {
    render(
      <StrictMode>
        <ScrubOnUnmount>
          <p>Still visible</p>
        </ScrubOnUnmount>
      </StrictMode>,
    );
    await flushMicrotasks();
    expect(screen.getByText('Still visible')).toBeInTheDocument();
  });

  it('does not scrub when only its children change', async () => {
    function Toggle() {
      const [n, setN] = useState(1);
      return (
        <ScrubOnUnmount>
          <button onClick={() => setN(n + 1)}>Count {n}</button>
        </ScrubOnUnmount>
      );
    }
    render(<Toggle />);
    await act(async () => screen.getByRole('button').click());
    await flushMicrotasks();
    expect(screen.getByRole('button')).toHaveTextContent('Count 2');
  });
});

describe('releaseChartTextCache', () => {
  it('evicts label text measured by the chart renderer, including the LRU reuse slot', () => {
    // jsdom has no canvas; give the renderer a deterministic measurer.
    setPlatformAPI({ measureText: (text: string) => ({ width: text.length * 7 }) as TextMetrics });
    const font = '12px sans-serif';
    measureWidth(ensureFontMeasureInfo(font), 'Secret assignee 12 (4.0%)');
    expect(ensureFontMeasureInfo(font).strWidthCache.get('Secret assignee 12 (4.0%)')).toBe(175);

    releaseChartTextCache();

    const after = ensureFontMeasureInfo(font);
    expect(after.strWidthCache.get('Secret assignee 12 (4.0%)')).toBeUndefined();
    // Repeated clears in one session must evict again.
    measureWidth(after, 'Second dataset label');
    releaseChartTextCache();
    expect(ensureFontMeasureInfo(font).strWidthCache.get('Second dataset label')).toBeUndefined();
  });
});

describe('useDataset callbacks', () => {
  it('do not keep the dataset reachable once it is cleared', async () => {
    const file = sampleParsedFile();
    const { result } = renderHook(() => useDataset());
    // Load a draft through the public API, confirm it, then clear.
    const csv = [SAMPLE_HEADERS.join(','), '1,Secret title,New,Asha,P1,Bug,2024-01-01,'].join('\n');
    await act(async () => {
      await result.current.openFile(new File([csv], 'x.csv', { lastModified: 9 }));
    });
    await act(async () => {
      await result.current.confirmDraft();
    });
    expect(result.current.dataset?.records[0].title).toBe('Secret title');
    const confirmBefore = result.current.confirmDraft;
    act(() => result.current.clearAll());
    expect(result.current.dataset).toBeNull();
    // The memoized callbacks are stable and read state through a ref, so the closure
    // retained by a stale callback no longer holds the cleared dataset.
    expect(result.current.confirmDraft).toBe(confirmBefore);
    await act(async () => {
      await result.current.confirmDraft(); // no draft: must be a no-op, not rebuild old data
    });
    expect(result.current.dataset).toBeNull();
    // Sanity: building from the fixture still works independently.
    expect(buildDataset(file, initialSetup(file)).records.length).toBe(9);
  });
});
