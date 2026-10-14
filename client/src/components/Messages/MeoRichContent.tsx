import { memo, useMemo } from 'react';
import Markdown from '~/components/Chat/Messages/Content/Markdown';
import { cn } from '~/utils';

type MeoBlock = {
  type?: string;
  block_id?: string;
  [key: string]: unknown;
};

type MessageWithMeoBlocks = {
  meoBlocks?: unknown;
  meo_blocks?: unknown;
};

function parseBlocks(value: unknown): MeoBlock[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is MeoBlock => item != null && typeof item === 'object');
  }
  if (typeof value !== 'string' || value.trim() === '') {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is MeoBlock => item != null && typeof item === 'object')
      : [];
  } catch {
    return [];
  }
}

export function getMeoBlocks(message: unknown): MeoBlock[] {
  if (message == null || typeof message !== 'object') {
    return [];
  }
  const candidate = message as MessageWithMeoBlocks;
  return parseBlocks(candidate.meoBlocks ?? candidate.meo_blocks);
}

const stringValue = (value: unknown): string => (typeof value === 'string' ? value : '');
const arrayValue = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const recordValue = (value: unknown): Record<string, unknown> =>
  value != null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

function BlockShell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'my-2 overflow-hidden rounded-2xl border border-border-light bg-surface-secondary',
        className,
      )}
    >
      {children}
    </div>
  );
}

function ChartBlock({ block }: { block: MeoBlock }) {
  const data = arrayValue(block.data).map(recordValue);
  const series = arrayValue(block.series).map(recordValue);
  const valueKey = stringValue(series[0]?.key);
  const xKey = stringValue(block.x_key);
  const values = data.map((row) => {
    const value = row[valueKey];
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  });
  const max = Math.max(...values, 1);
  const kind = stringValue(block.kind) || 'bar';
  const points = values
    .map((value, index) => {
      const x = values.length <= 1 ? 50 : (index / (values.length - 1)) * 100;
      const y = 92 - (value / max) * 78;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <BlockShell>
      <div className="p-4">
        <div className="mb-3 text-sm font-medium text-text-primary">
          {stringValue(block.title) || 'Chart'}
        </div>
        {kind === 'line' || kind === 'area' || kind === 'scatter' ? (
          <svg className="h-52 w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            <line x1="0" y1="94" x2="100" y2="94" className="stroke-border-medium" />
            {kind !== 'scatter' && (
              <polyline
                points={points}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
                className="text-text-primary"
              />
            )}
            {kind === 'scatter' &&
              values.map((value, index) => {
                const x = values.length <= 1 ? 50 : (index / (values.length - 1)) * 100;
                const y = 92 - (value / max) * 78;
                return <circle key={`${x}-${y}`} cx={x} cy={y} r="2" className="fill-text-primary" />;
              })}
          </svg>
        ) : (
          <div className="flex h-52 items-end gap-2" role="img" aria-label={stringValue(block.title)}>
            {data.map((row, index) => {
              const value = values[index] ?? 0;
              return (
                <div key={index} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-2">
                  <div className="text-xs text-text-secondary">{value}</div>
                  <div
                    className="w-full min-w-2 rounded-t-lg bg-text-primary"
                    style={{ height: `${Math.max((value / max) * 78, 2)}%` }}
                  />
                  <div className="max-w-full truncate text-xs text-text-secondary">
                    {String(row[xKey] ?? '')}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </BlockShell>
  );
}

function TableBlock({ block }: { block: MeoBlock }) {
  const columns = arrayValue(block.columns).map(recordValue);
  const rows = arrayValue(block.rows).map(recordValue);
  return (
    <BlockShell>
      {stringValue(block.title) && (
        <div className="border-b border-border-light px-4 py-3 text-sm font-medium text-text-primary">
          {stringValue(block.title)}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-max border-collapse text-sm">
          <thead>
            <tr className="border-b border-border-light text-left text-text-secondary">
              {columns.map((column, index) => (
                <th key={index} className="px-4 py-2 font-medium">
                  {stringValue(column.label) || stringValue(column.key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-b border-border-light last:border-0">
                {columns.map((column, columnIndex) => (
                  <td key={columnIndex} className="px-4 py-2 text-text-primary">
                    {String(row[stringValue(column.key)] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </BlockShell>
  );
}

function HtmlBlock({ block }: { block: MeoBlock }) {
  const sandbox = stringValue(block.sandbox) || 'static';
  const sandboxValue = sandbox === 'static' ? '' : 'allow-scripts';
  return (
    <BlockShell>
      <div className="flex items-center justify-between border-b border-border-light px-4 py-3">
        <span className="text-sm font-medium text-text-primary">
          {stringValue(block.title) || 'HTML artifact'}
        </span>
        <span className="text-xs text-text-secondary">Sandboxed</span>
      </div>
      <iframe
        className="h-80 w-full bg-white"
        title={stringValue(block.title) || 'Meo artifact'}
        srcDoc={stringValue(block.html)}
        sandbox={sandboxValue}
      />
    </BlockShell>
  );
}

function PluginBlock({ block }: { block: MeoBlock }) {
  const presentation = recordValue(block.presentation);
  const actions = arrayValue(presentation.actions).map(recordValue);
  const dispatchAction = (actionId: string) => {
    window.dispatchEvent(
      new CustomEvent('meo:block-action', {
        detail: { actionId, blockId: stringValue(block.block_id), block },
      }),
    );
  };
  return (
    <BlockShell className="p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs font-medium text-text-secondary">
            {stringValue(presentation.plugin_name) || 'Connector'}
          </div>
          <div className="mt-1 text-base font-medium text-text-primary">
            {stringValue(presentation.title)}
          </div>
          {stringValue(presentation.subtitle) && (
            <div className="mt-1 text-sm text-text-secondary">{stringValue(presentation.subtitle)}</div>
          )}
        </div>
        <span className="rounded-full bg-surface-tertiary px-2.5 py-1 text-xs text-text-secondary">
          Connected
        </span>
      </div>
      {presentation.body != null && (
        <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-xl bg-surface-primary p-3 text-xs text-text-secondary">
          {typeof presentation.body === 'string'
            ? presentation.body
            : JSON.stringify(presentation.body, null, 2)}
        </pre>
      )}
      {actions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {actions.map((action, index) => (
            <button
              key={index}
              type="button"
              onClick={() => dispatchAction(stringValue(action.action_id))}
              className="rounded-full border border-border-medium px-3 py-1.5 text-sm text-text-primary hover:bg-surface-tertiary"
            >
              {stringValue(action.label) || 'Open'}
            </button>
          ))}
        </div>
      )}
    </BlockShell>
  );
}

function ToolActivityBlock({ block }: { block: MeoBlock }) {
  const state = stringValue(block.state);
  return (
    <BlockShell className="p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-medium text-text-primary">{stringValue(block.title) || 'Tool'}</div>
        <span className="rounded-full bg-surface-tertiary px-2.5 py-1 text-xs text-text-secondary">
          {state.replaceAll('_', ' ')}
        </span>
      </div>
      {stringValue(block.detail) && (
        <div className="mt-2 text-sm text-text-secondary">{stringValue(block.detail)}</div>
      )}
      {(state === 'running' || state === 'queued') && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-tertiary">
          <div className="h-full w-2/3 animate-pulse rounded-full bg-text-primary" />
        </div>
      )}
    </BlockShell>
  );
}

function SourceBlock({ block }: { block: MeoBlock }) {
  const sources = block.type === 'source_group' ? arrayValue(block.sources).map(recordValue) : [block];
  return (
    <div className="my-2 flex flex-wrap gap-2">
      {sources.map((source, index) => {
        const uri = stringValue(source.uri);
        const label = stringValue(source.label) || `Source ${index + 1}`;
        return uri.startsWith('http://') || uri.startsWith('https://') ? (
          <a
            key={index}
            href={uri}
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-border-light bg-surface-secondary px-3 py-1.5 text-sm text-text-primary hover:bg-surface-tertiary"
          >
            {label}
          </a>
        ) : (
          <span key={index} className="rounded-full bg-surface-secondary px-3 py-1.5 text-sm text-text-secondary">
            {label}
          </span>
        );
      })}
    </div>
  );
}

function SupplementalBlock({ block }: { block: MeoBlock }) {
  switch (block.type) {
    case 'chart':
      return <ChartBlock block={block} />;
    case 'table':
      return <TableBlock block={block} />;
    case 'html':
      return <HtmlBlock block={block} />;
    case 'plugin':
      return <PluginBlock block={block} />;
    case 'tool_activity':
      return <ToolActivityBlock block={block} />;
    case 'citation':
    case 'source_group':
      return <SourceBlock block={block} />;
    case 'image': {
      const uri = stringValue(block.uri) || stringValue(block.resource_uri);
      return uri ? (
        <img
          className="my-2 max-h-[36rem] max-w-full rounded-2xl border border-border-light object-contain"
          src={uri}
          alt={stringValue(block.alt) || stringValue(block.name)}
        />
      ) : null;
    }
    case 'attachment':
    case 'artifact':
    case 'presentation':
    case 'confirmation':
    case 'error':
      return (
        <BlockShell className="p-4">
          <div className="text-sm font-medium text-text-primary">
            {stringValue(block.title) || stringValue(block.name) || stringValue(block.type)}
          </div>
          {(stringValue(block.detail) || stringValue(block.value)) && (
            <div className="mt-1 text-sm text-text-secondary">
              {stringValue(block.detail) || stringValue(block.value)}
            </div>
          )}
        </BlockShell>
      );
    default:
      return null;
  }
}

const MeoRichContent = memo(function MeoRichContent({
  blocks,
  renderTextual = false,
}: {
  blocks: MeoBlock[];
  renderTextual?: boolean;
}) {
  const stableBlocks = useMemo(() => blocks.filter(Boolean), [blocks]);
  if (stableBlocks.length === 0) {
    return null;
  }
  return (
    <div className="meo-rich-content w-full">
      {stableBlocks.map((block, index) => {
        const key = stringValue(block.block_id) || `${block.type ?? 'block'}-${index}`;
        if (renderTextual && (block.type === 'text' || block.type === 'markdown')) {
          return (
            <div key={key} className="markdown prose message-content dark:prose-invert w-full break-words text-text-primary">
              <Markdown content={stringValue(block.text)} isLatestMessage={false} />
            </div>
          );
        }
        if (renderTextual && block.type === 'code') {
          return (
            <pre key={key} className="my-2 overflow-x-auto rounded-2xl bg-surface-secondary p-4 text-sm text-text-primary">
              <code>{stringValue(block.text)}</code>
            </pre>
          );
        }
        if (renderTextual && block.type === 'math') {
          return (
            <div key={key} className="markdown prose message-content dark:prose-invert w-full text-text-primary">
              <Markdown content={`$$${stringValue(block.latex)}$$`} isLatestMessage={false} />
            </div>
          );
        }
        return <SupplementalBlock key={key} block={block} />;
      })}
    </div>
  );
});

export default MeoRichContent;
