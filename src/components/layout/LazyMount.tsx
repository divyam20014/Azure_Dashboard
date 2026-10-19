import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Mounts heavy, below-the-fold sections only when they approach the viewport,
 * so the first paint of a large dataset is not blocked by every chart at once.
 * Falls back to immediate rendering where IntersectionObserver is unavailable.
 */
export function LazyMount({ children, minHeight = 400 }: { children: ReactNode; minHeight?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    if (visible || !ref.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '600px 0px' },
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [visible]);

  return <div ref={ref}>{visible ? children : <div style={{ minHeight }} aria-hidden />}</div>;
}
