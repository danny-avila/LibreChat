import type { FrameStats, PerfReport, TimelineRow } from './types';

const TIMELINE_ROW_LIMIT = 60;
/** Matches the load-test panel: below this the DOM did not meaningfully grow,
 *  so a frame-rate drop cannot be blamed on new data. */
const GROWTH_ATTRIBUTION_RATIO = 1.05;

function ms(value: number | undefined, decimals = 1): string {
  return value == null ? 'n/a' : `${value.toFixed(decimals)} ms`;
}

function mb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fps(value: number): string {
  return value > 0 ? value.toFixed(1) : 'n/a';
}

function frameRows(label: string, stats: FrameStats): string[] {
  if (stats.sampleCount === 0) {
    return [`| ${label} | no samples |`];
  }
  return [
    `| ${label} FPS | ${fps(stats.fps)} of ${stats.refreshHz} Hz |`,
    `| ${label} 1% low FPS | ${fps(stats.fpsLow1)} |`,
    `| ${label} frame p50 / p95 / max | ${ms(stats.frameP50Ms)} / ${ms(stats.frameP95Ms)} / ${ms(stats.frameMaxMs)} |`,
    `| ${label} janky frames | ${stats.jankFrames} of ${stats.sampleCount} (${(stats.jankRatio * 100).toFixed(1)}%) |`,
    `| ${label} dropped frames | ${stats.droppedFrames} |`,
  ];
}

function sampleTimeline(timeline: TimelineRow[]): TimelineRow[] {
  if (timeline.length <= TIMELINE_ROW_LIMIT) {
    return timeline;
  }
  const step = timeline.length / TIMELINE_ROW_LIMIT;
  const rows: TimelineRow[] = [];
  for (let i = 0; i < TIMELINE_ROW_LIMIT; i++) {
    rows.push(timeline[Math.floor(i * step)]);
  }
  return rows;
}

export function formatPerfReport(report: PerfReport): string {
  const { snapshot } = report;
  const lines: string[] = [];

  lines.push('# LibreChat performance report');
  lines.push('');
  lines.push(`- Captured: ${new Date(report.createdAt).toISOString()}`);
  lines.push(`- Route: ${report.route}`);
  lines.push(
    report.durationMs > 0
      ? `- Recorded: ${(report.durationMs / 1000).toFixed(1)} s`
      : '- Recorded: not recording, this is a live snapshot',
  );
  lines.push(
    `- Viewport: ${report.viewport} @${report.devicePixelRatio}x, ${report.hardwareConcurrency} cores`,
  );
  lines.push(
    `- Display: ${snapshot.window.refreshHz} Hz (${snapshot.window.budgetMs.toFixed(1)} ms frame budget)`,
  );
  lines.push(`- Long animation frame attribution: ${snapshot.loafSupported ? 'yes' : 'no'}`);
  lines.push(`- User agent: ${report.userAgent}`);
  lines.push('');

  lines.push('## Frames');
  lines.push('');
  lines.push('| metric | value |');
  lines.push('| --- | --- |');
  lines.push(...frameRows('last 5 s', snapshot.window));
  lines.push(...frameRows('scrolling', snapshot.scroll));
  lines.push(`| long tasks | ${snapshot.longTaskMsPerMin.toFixed(0)} ms per minute |`);
  if (snapshot.inputLatencyP95Ms > 0) {
    lines.push(`| input to next frame p95 | ${ms(snapshot.inputLatencyP95Ms)} |`);
  }
  lines.push('');

  lines.push('## Web vitals');
  lines.push('');
  lines.push('| metric | value | attribution |');
  lines.push('| --- | --- | --- |');
  lines.push(
    `| LCP | ${ms(snapshot.vitals.lcpMs, 0)} | ${snapshot.vitals.lcpElement ?? ''} |`,
    `| CLS | ${snapshot.vitals.clsValue?.toFixed(3) ?? 'n/a'} | ${snapshot.vitals.clsTarget ?? ''} |`,
    `| INP | ${ms(snapshot.vitals.inpMs, 0)} | ${[snapshot.vitals.inpType, snapshot.vitals.inpTarget].filter(Boolean).join(' ')} |`,
    `| FCP | ${ms(snapshot.vitals.fcpMs, 0)} | |`,
    `| TTFB | ${ms(snapshot.vitals.ttfbMs, 0)} | |`,
  );
  lines.push('');

  lines.push('## Data scale');
  lines.push('');
  lines.push('| metric | value |');
  lines.push('| --- | --- |');
  lines.push(`| DOM elements | ${snapshot.dom.elements} (peak ${snapshot.dom.peakElements}) |`);
  lines.push(`| DOM growth | ${snapshot.dom.growthPerMin.toFixed(0)} elements per minute |`);
  lines.push(`| message rows | ${snapshot.dom.messageRows} |`);
  lines.push(`| code blocks | ${snapshot.dom.codeBlocks} |`);
  lines.push(`| images | ${snapshot.dom.images} |`);
  if (snapshot.memory.supported) {
    lines.push(
      `| JS heap | ${mb(snapshot.memory.usedBytes)} used, peak ${mb(snapshot.memory.peakBytes)}, limit ${mb(snapshot.memory.limitBytes)} |`,
    );
    lines.push(`| heap growth | ${mb(snapshot.memory.growthBytesPerMin)} per minute |`);
  }
  if (snapshot.react.instrumented) {
    lines.push(
      `| React commits | ${snapshot.react.commitsPerSec.toFixed(1)} per second, worst ${ms(snapshot.react.worstMs)} (${snapshot.react.worstId || 'n/a'}) |`,
    );
  }
  lines.push('');

  lines.push('## Findings');
  lines.push('');
  if (snapshot.issues.length === 0) {
    lines.push('No performance issues detected at current thresholds.');
  } else {
    for (const issue of snapshot.issues) {
      const detail = Object.entries(issue.values)
        .filter(([, value]) => value !== '' && value !== 0)
        .map(([key, value]) => `${key}=${value}`)
        .join(', ');
      lines.push(`- **${issue.severity}** ${issue.id}: ${detail}`);
    }
  }
  lines.push('');

  if (report.worstFrames.length > 0) {
    lines.push('## Worst frames');
    lines.push('');
    lines.push('| frame time | while scrolling | attributed to |');
    lines.push('| --- | --- | --- |');
    for (const spike of report.worstFrames) {
      lines.push(
        `| ${ms(spike.durationMs, 0)} | ${spike.scrolling ? 'yes' : 'no'} | ${spike.source || 'unattributed'} |`,
      );
    }
    lines.push('');
  }

  if (snapshot.longTasks.length > 0) {
    lines.push('## Recent long tasks');
    lines.push('');
    lines.push('| duration | blocking | style & layout | source |');
    lines.push('| --- | --- | --- | --- |');
    for (const task of snapshot.longTasks) {
      lines.push(
        `| ${ms(task.durationMs, 0)} | ${ms(task.blockingMs, 0)} | ${ms(task.styleAndLayoutMs, 0)} | ${task.source} |`,
      );
    }
    lines.push('');
  }

  if (snapshot.shifts.length > 0) {
    lines.push('## Recent layout shifts');
    lines.push('');
    for (const shift of snapshot.shifts) {
      lines.push(`- ${shift.value.toFixed(4)} at ${shift.source}`);
    }
    lines.push('');
  }

  if (report.probe) {
    const { probe } = report;
    lines.push('## Load test');
    lines.push('');
    lines.push(`Target: ${probe.targetLabel}${probe.aborted ? ' (stopped early)' : ''}`);
    lines.push('');
    lines.push(
      '| pass | DOM elements | target subtree | scrolled | FPS | 1% low | p95 frame | dropped | long tasks | grew |',
    );
    lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const pass of probe.passes) {
      lines.push(
        `| ${pass.pass} | ${pass.elements} | ${pass.items} | ${pass.scrolledPx} px | ${fps(pass.frames.fps)} | ${fps(pass.frames.fpsLow1)} | ${ms(pass.frames.frameP95Ms)} | ${pass.frames.droppedFrames} | ${pass.longTaskMs} ms | ${pass.grew ? 'yes' : 'no'} |`,
      );
    }
    lines.push('');
    const { verdict } = probe;
    const grew = verdict.elementsGrowthRatio >= GROWTH_ATTRIBUTION_RATIO;
    const invalid =
      probe.aborted ||
      probe.passes.length === 0 ||
      probe.passes.some((pass) => pass.frames.sampleCount === 0);
    if (invalid) {
      lines.push(
        probe.aborted
          ? 'Verdict: unavailable because the load test was stopped before it completed.'
          : 'Verdict: unavailable because the load test did not capture frame samples.',
      );
    } else {
      const single = probe.passes.length < 2;
      lines.push(
        single
          ? `Verdict: swept once at ${fps(verdict.fpsLast)} FPS with ${verdict.elementsLast} elements live. Worst frame ${ms(verdict.worstFrameMs, 0)}, ${verdict.droppedFrames} dropped frames against a ${ms(1000 / (probe.passes[0]?.frames.refreshHz ?? 60), 1)} budget.`
          : `Verdict: FPS ${fps(verdict.fpsFirst)} to ${fps(verdict.fpsLast)} (${(verdict.fpsDropRatio * 100).toFixed(0)}% drop) while DOM went ${verdict.elementsFirst} to ${verdict.elementsLast} (${verdict.elementsGrowthRatio.toFixed(2)}x). Worst frame ${ms(verdict.worstFrameMs, 0)}, ${verdict.droppedFrames} dropped frames.`,
      );

      if (!verdict.degrades) {
        lines.push('Rendering held up across the run.');
      } else if (grew) {
        lines.push(
          'Rendering degrades as data grows: the list keeps every row in the DOM or re-renders too much per frame.',
        );
      } else {
        lines.push(
          'The screen was already too heavy to sweep at the display rate before any new data loaded, so this is standing cost rather than growth.',
        );
      }
      if (verdict.recycles) {
        lines.push('DOM size stayed flat while more data loaded, so this list recycles rows.');
      }
    }
    lines.push('');
  }

  const timeline = sampleTimeline(report.timeline);
  if (timeline.length > 0) {
    lines.push('## Timeline');
    lines.push('');
    lines.push('```csv');
    lines.push(
      'seconds,fps,frame_p95_ms,jank_frames,dropped_frames,dom_elements,heap_bytes,commit_ms',
    );
    for (const row of timeline) {
      lines.push(
        [
          (row.time / 1000).toFixed(1),
          row.fps.toFixed(1),
          row.frameP95Ms.toFixed(1),
          row.jankFrames,
          row.droppedFrames,
          row.elements,
          row.heapBytes,
          row.commitMs.toFixed(1),
        ].join(','),
      );
    }
    lines.push('```');
    lines.push('');
  }

  return lines.join('\n');
}
