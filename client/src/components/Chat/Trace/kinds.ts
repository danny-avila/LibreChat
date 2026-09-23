import { Bot, Zap, Wrench, Sparkles, Workflow } from 'lucide-react';
import type { TTraceRecordKind, TTraceStatus } from 'librechat-data-provider';
import type { LucideIcon } from 'lucide-react';
import type { TranslationKeys } from '~/hooks';

type KindAppearance = {
  icon: LucideIcon;
  label: TranslationKeys;
  /** Static class names: Tailwind cannot see an interpolated `bg-series-${n}`. */
  bar: string;
  /** The generation's time to first token, drawn as a tint of its bar. */
  tint: string;
  fill: string;
};

export const KIND_APPEARANCE: Record<TTraceRecordKind, KindAppearance> = {
  agent: {
    icon: Bot,
    label: 'com_ui_trace_kind_agent',
    bar: 'bg-series-1',
    tint: 'bg-series-1/30',
    fill: 'fill-series-1',
  },
  generation: {
    icon: Sparkles,
    label: 'com_ui_trace_kind_generation',
    bar: 'bg-series-2',
    tint: 'bg-series-2/30',
    fill: 'fill-series-2',
  },
  tool: {
    icon: Wrench,
    label: 'com_ui_trace_kind_tool',
    bar: 'bg-series-3',
    tint: 'bg-series-3/30',
    fill: 'fill-series-3',
  },
  span: {
    icon: Workflow,
    label: 'com_ui_trace_kind_span',
    bar: 'bg-series-6',
    tint: 'bg-series-6/30',
    fill: 'fill-series-6',
  },
  event: {
    icon: Zap,
    label: 'com_ui_trace_kind_event',
    bar: 'bg-series-4',
    tint: 'bg-series-4/30',
    fill: 'fill-series-4',
  },
};

export const STATUS_LABEL: Record<TTraceStatus, TranslationKeys> = {
  ok: 'com_ui_trace_status_ok',
  running: 'com_ui_trace_status_running',
  error: 'com_ui_trace_status_error',
  warning: 'com_ui_trace_status_warning',
};
