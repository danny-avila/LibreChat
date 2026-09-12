import { memo, useId } from 'react';
import { X } from 'lucide-react';
import { Button, Spinner } from '@librechat/client';
import type { TTraceContent } from 'librechat-data-provider';
import type { ReactNode } from 'react';
import type { TranslationKeys } from '~/hooks';
import type { TraceNode } from './model';
import { useConversationTraceRecordQuery } from '~/data-provider';
import { formatCost, formatTokens } from '~/utils/tokens';
import { KIND_APPEARANCE, STATUS_LABEL } from './kinds';
import { formatClock, formatDuration } from './model';
import { formatJSON } from '~/utils/json';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

type Field = { label: TranslationKeys; value: ReactNode };

function Section({ title, fields }: { title: TranslationKeys; fields: Field[] }) {
  const localize = useLocalize();
  if (fields.length === 0) {
    return null;
  }
  return (
    <section className="flex flex-col gap-1.5">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
        {localize(title)}
      </h4>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
        {fields.map((field) => (
          <div key={field.label} className="contents">
            <dt className="text-text-secondary">{localize(field.label)}</dt>
            <dd className="min-w-0 break-words text-right tabular-nums text-text-primary">
              {field.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function ContentBlock({ label, content }: { label: TranslationKeys; content?: TTraceContent }) {
  const localize = useLocalize();
  if (!content) {
    return null;
  }
  const text = content.truncated ? content.value : formatJSON(content.value);
  return (
    <section className="flex flex-col gap-1">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
        {localize(label)}
      </h4>
      <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border-light bg-surface-primary-alt p-2 font-mono text-xs text-text-primary">
        {text}
      </pre>
      {content.truncated && (
        <p className="text-xs text-text-secondary">{localize('com_ui_trace_truncated')}</p>
      )}
    </section>
  );
}

function RecordContent({ conversationId, recordId }: { conversationId: string; recordId: string }) {
  const localize = useLocalize();
  const { data, isLoading, isError, refetch } = useConversationTraceRecordQuery(
    conversationId,
    recordId,
    true,
  );

  if (isLoading) {
    return (
      <div className="flex justify-center py-4" role="status">
        <Spinner className="size-4 text-text-secondary" />
        <span className="sr-only">{localize('com_ui_trace_loading')}</span>
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="flex flex-col items-start gap-2 text-sm text-text-secondary">
        <p>{localize('com_ui_trace_content_error')}</p>
        <Button size="sm" variant="outline" onClick={() => refetch()}>
          {localize('com_ui_retry')}
        </Button>
      </div>
    );
  }
  if (!data.contentAvailable) {
    return <p className="text-sm text-text-secondary">{localize('com_ui_trace_content_hidden')}</p>;
  }
  if (!data.input && !data.output && !data.metadata) {
    return <p className="text-sm text-text-secondary">{localize('com_ui_trace_content_empty')}</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      <ContentBlock label="com_ui_trace_input" content={data.input} />
      <ContentBlock label="com_ui_trace_output" content={data.output} />
      <ContentBlock label="com_ui_trace_metadata" content={data.metadata} />
    </div>
  );
}

/** Details for the selected record; input and output load only when the deployment allows them. */
function Inspector({
  node,
  turnStart,
  conversationId,
  showContent,
  showCost,
  currency,
  onClose,
}: {
  node: TraceNode;
  turnStart: number;
  conversationId: string;
  showContent: boolean;
  showCost: boolean;
  currency?: { code: string; rate: number };
  onClose: () => void;
}) {
  const localize = useLocalize();
  const headingId = useId();
  const { record } = node;
  const appearance = KIND_APPEARANCE[record.kind];
  const Icon = appearance.icon;
  const { usage } = record;

  const timing: Field[] = [
    { label: 'com_ui_trace_started', value: formatClock(node.start) },
    { label: 'com_ui_trace_offset', value: formatDuration(node.start - turnStart) },
    {
      label: 'com_ui_trace_column_duration',
      value:
        node.end == null ? localize(STATUS_LABEL.running) : formatDuration(node.end - node.start),
    },
  ];
  if (node.firstToken != null) {
    timing.push({
      label: 'com_ui_trace_ttft',
      value: formatDuration(node.firstToken - node.start),
    });
    if (node.end != null) {
      timing.push({
        label: 'com_ui_trace_decoding',
        value: formatDuration(node.end - node.firstToken),
      });
    }
  }

  const usageFields: Field[] = (
    [
      ['com_ui_trace_usage_input', usage?.input],
      ['com_ui_trace_usage_output', usage?.output],
      ['com_ui_trace_usage_reasoning', usage?.reasoning],
      ['com_ui_trace_usage_cache_read', usage?.cacheRead],
      ['com_ui_trace_usage_cache_write', usage?.cacheWrite],
      ['com_ui_trace_usage_total', usage?.total],
    ] as Array<[TranslationKeys, number | undefined]>
  )
    .filter((entry): entry is [TranslationKeys, number] => entry[1] != null)
    .map(([label, value]) => ({ label, value: formatTokens(value) }));
  if (showCost && record.cost != null) {
    usageFields.push({
      label: 'com_ui_trace_summary_cost',
      value: formatCost(record.cost, currency),
    });
  }

  return (
    <aside
      aria-labelledby={headingId}
      data-testid="trace-inspector"
      className="flex min-h-0 flex-col border-border-light bg-presentation max-md:absolute max-md:inset-x-0 max-md:bottom-0 max-md:z-20 max-md:max-h-[65%] max-md:rounded-t-2xl max-md:border-t max-md:shadow-lg md:w-[22rem] md:shrink-0 md:border-l"
    >
      <div className="flex items-center gap-2 border-b border-border-light px-3 py-2">
        <Icon aria-hidden="true" className="size-4 shrink-0 text-text-secondary" />
        <h3 id={headingId} className="min-w-0 flex-1 truncate text-sm font-semibold">
          {record.name}
        </h3>
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={onClose}
          aria-label={localize('com_ui_trace_close_details')}
        >
          <X className="size-4" aria-hidden="true" />
        </Button>
      </div>
      <div className="flex min-h-0 flex-col gap-4 overflow-y-auto p-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full border border-border-light px-2 py-0.5 text-text-secondary">
            {localize(appearance.label)}
          </span>
          <span
            className={cn(
              'rounded-full border px-2 py-0.5',
              record.status === 'error' &&
                'border-status-error-border bg-status-error-subtle text-status-error',
              record.status === 'warning' &&
                'border-status-warning-border bg-status-warning-subtle text-status-warning',
              (record.status === 'ok' || record.status === 'running') &&
                'border-border-light text-text-secondary',
            )}
          >
            {localize(STATUS_LABEL[record.status])}
          </span>
        </div>
        {record.statusMessage != null && (
          <p
            className={cn(
              'whitespace-pre-wrap break-words rounded-lg border p-2 text-xs',
              record.status === 'error'
                ? 'border-status-error-border bg-status-error-subtle text-status-error'
                : 'border-status-warning-border bg-status-warning-subtle text-status-warning',
            )}
          >
            {record.statusMessage}
          </p>
        )}
        <Section title="com_ui_trace_timing" fields={timing} />
        <Section
          title="com_ui_trace_model"
          fields={
            record.model != null ? [{ label: 'com_ui_trace_model', value: record.model }] : []
          }
        />
        <Section title="com_ui_trace_usage" fields={usageFields} />
        <Section
          title="com_ui_trace_identifiers"
          fields={[
            {
              label: 'com_ui_trace_record_id',
              value: <span className="select-all font-mono text-xs">{record.id}</span>,
            },
            {
              label: 'com_ui_trace_trace_id',
              value: <span className="select-all font-mono text-xs">{record.traceId}</span>,
            },
          ]}
        />
        {showContent && (
          <section className="flex flex-col gap-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
              {localize('com_ui_trace_content')}
            </h4>
            <RecordContent conversationId={conversationId} recordId={record.id} />
          </section>
        )}
      </div>
    </aside>
  );
}

export default memo(Inspector);
