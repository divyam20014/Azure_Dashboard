import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});

// jsdom lacks these browser APIs used by layout code.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
if (!('ResizeObserver' in globalThis)) {
  (globalThis as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver = ResizeObserverStub;
}
// Deliberately no IntersectionObserver stub: LazyMount and the sidebar's scroll-spy both
// fall back to immediate / no-op behavior when it is undefined, which is what jsdom is.
if (!window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = vi.fn();
// jsdom has no canvas; the chart renderer only needs text measurement from it.
HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ measureText: (t: string) => ({ width: t.length * 7 }), font: '' })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = vi.fn(() => false);
if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = vi.fn();
