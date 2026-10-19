import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, type HTMLAttributes } from 'react';
import { scrubSubtree } from '@/lib/privacy/sessionCleanup';

/**
 * A <div> whose contents are torn down (see scrubSubtree) when it unmounts. Wrap every
 * view that renders uploaded data so nothing it displayed survives in detached DOM.
 * The teardown runs right after the commit and only if the node actually left the
 * document, so StrictMode's simulated unmount (dev only) never wipes a live view.
 */
export const ScrubOnUnmount = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function ScrubOnUnmount(props, forwardedRef) {
  const ref = useRef<HTMLDivElement>(null);
  useImperativeHandle(forwardedRef, () => ref.current as HTMLDivElement);
  useLayoutEffect(() => {
    const el = ref.current;
    return () => {
      queueMicrotask(() => {
        if (el && !el.isConnected) scrubSubtree(el);
      });
    };
  }, []);
  return <div ref={ref} {...props} />;
});
