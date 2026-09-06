import { Profiler } from 'react';
import type { ProfilerOnRenderCallback, ReactNode } from 'react';
import { isPerfMonitorEnabled } from './enabled';
import { reportCommit } from '~/lib/perf/commit';

const enabled = isPerfMonitorEnabled();

const onRender: ProfilerOnRenderCallback = (id, _phase, actualDuration) => {
  reportCommit(id, actualDuration);
};

interface PerformanceProfilerProps {
  id?: string;
  children: ReactNode;
}

export default function PerformanceProfiler({ id = 'app', children }: PerformanceProfilerProps) {
  if (!enabled) {
    return <>{children}</>;
  }

  return (
    <Profiler id={id} onRender={onRender}>
      {children}
    </Profiler>
  );
}
