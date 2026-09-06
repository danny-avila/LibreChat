import { Tag } from '@librechat/client';
import type { PerfIssue, PerfIssueId, PerfIssueSeverity } from '~/lib/perf';
import type { TranslationKeys } from '~/hooks';
import { useLocalize } from '~/hooks';

const ISSUE_TITLE: Record<PerfIssueId, TranslationKeys> = {
  lowFps: 'com_ui_perf_issue_low_fps',
  scrollJank: 'com_ui_perf_issue_scroll_jank',
  frameSpikes: 'com_ui_perf_issue_frame_spikes',
  freeze: 'com_ui_perf_issue_freeze',
  longTasks: 'com_ui_perf_issue_long_tasks',
  slowInput: 'com_ui_perf_issue_slow_input',
  layoutShift: 'com_ui_perf_issue_layout_shift',
  heapGrowth: 'com_ui_perf_issue_heap_growth',
  domBloat: 'com_ui_perf_issue_dom_bloat',
  domGrowth: 'com_ui_perf_issue_dom_growth',
  reactChurn: 'com_ui_perf_issue_react_churn',
  slowLcp: 'com_ui_perf_issue_slow_lcp',
};

const ISSUE_DETAIL: Record<PerfIssueId, TranslationKeys> = {
  lowFps: 'com_ui_perf_detail_low_fps',
  scrollJank: 'com_ui_perf_detail_scroll_jank',
  frameSpikes: 'com_ui_perf_detail_frame_spikes',
  freeze: 'com_ui_perf_detail_freeze',
  longTasks: 'com_ui_perf_detail_long_tasks',
  slowInput: 'com_ui_perf_detail_slow_input',
  layoutShift: 'com_ui_perf_detail_layout_shift',
  heapGrowth: 'com_ui_perf_detail_heap_growth',
  domBloat: 'com_ui_perf_detail_dom_bloat',
  domGrowth: 'com_ui_perf_detail_dom_growth',
  reactChurn: 'com_ui_perf_detail_react_churn',
  slowLcp: 'com_ui_perf_detail_slow_lcp',
};

const SEVERITY_VARIANT: Record<PerfIssueSeverity, 'info' | 'warning' | 'error'> = {
  info: 'info',
  warning: 'warning',
  error: 'error',
};

const SEVERITY_LABEL: Record<PerfIssueSeverity, TranslationKeys> = {
  info: 'com_ui_perf_severity_info',
  warning: 'com_ui_perf_severity_warning',
  error: 'com_ui_perf_severity_error',
};

const UNTARGETED_DETAIL: Partial<Record<PerfIssueId, { field: string; key: TranslationKeys }>> = {
  slowInput: { field: 'target', key: 'com_ui_perf_detail_slow_input_untargeted' },
  layoutShift: { field: 'target', key: 'com_ui_perf_detail_layout_shift_untargeted' },
  slowLcp: { field: 'element', key: 'com_ui_perf_detail_slow_lcp_untargeted' },
};

function detailKey(issue: PerfIssue): TranslationKeys {
  const untargeted = UNTARGETED_DETAIL[issue.id];
  if (untargeted && !issue.values[untargeted.field]) {
    return untargeted.key;
  }
  return ISSUE_DETAIL[issue.id];
}

interface IssuePanelProps {
  issues: PerfIssue[];
}

export function IssuePanel({ issues }: IssuePanelProps) {
  const localize = useLocalize();

  if (issues.length === 0) {
    return (
      <p className="rounded-md bg-surface-tertiary px-3 py-4 text-xs text-text-secondary">
        {localize('com_ui_perf_no_issues')}
      </p>
    );
  }

  return (
    <ul aria-live="polite" className="flex flex-col gap-1.5">
      {issues.map((issue) => (
        <li
          key={issue.id}
          className="rounded-md border border-border-light bg-surface-tertiary px-2 py-2"
        >
          <div className="flex items-center gap-2">
            <Tag
              variant={SEVERITY_VARIANT[issue.severity]}
              label={localize(SEVERITY_LABEL[issue.severity])}
              className="max-h-5 shrink-0 border"
              labelClassName="ml-0 px-1 py-0 text-[11px]"
            />
            <span className="truncate text-xs font-semibold text-text-primary">
              {localize(ISSUE_TITLE[issue.id])}
            </span>
          </div>
          <p className="mt-1 text-[11px] leading-snug text-text-secondary">
            {localize(detailKey(issue), issue.values)}
          </p>
        </li>
      ))}
    </ul>
  );
}
