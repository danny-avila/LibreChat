import { lazy, Suspense, useEffect, useState } from 'react';
import { Activity } from 'lucide-react';
import { isPerfMonitorEnabled } from './enabled';
import { useLocalize } from '~/hooks';

const LazyPerformanceHud = lazy(() => import('./PerformanceHud'));

interface PerformanceGateProps {
  enabled?: boolean;
}

export default function PerformanceGate({
  enabled = isPerfMonitorEnabled(),
}: PerformanceGateProps) {
  const localize = useLocalize();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!event.altKey || !(event.ctrlKey || event.metaKey) || event.code !== 'KeyP') {
        return;
      }
      event.preventDefault();
      setOpen((current) => !current);
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [enabled]);

  if (!enabled) {
    return null;
  }

  if (!open) {
    return (
      <button
        type="button"
        data-testid="perf-monitor-launcher"
        aria-label={localize('com_ui_perf_open')}
        title={localize('com_ui_perf_shortcut_hint')}
        onClick={() => setOpen(true)}
        className="fixed bottom-3 right-3 z-[9989] flex h-7 w-7 items-center justify-center rounded-full border border-border-medium bg-surface-secondary text-text-secondary shadow-md hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary"
      >
        <Activity className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    );
  }

  return (
    <Suspense fallback={null}>
      <LazyPerformanceHud onClose={() => setOpen(false)} />
    </Suspense>
  );
}
