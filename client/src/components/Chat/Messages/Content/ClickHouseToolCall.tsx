import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  Badge,
  CodeBlock,
  ClickUIProvider,
  Panel,
  Text,
  Separator,
  Tabs,
  Table,
  Container,
} from '@clickhouse/click-ui';
import type { TableColumnConfigProps, TableRowType } from '@clickhouse/click-ui';
import { useTheme, isDark } from '@librechat/client';
import { ClickHouseCostView } from './ClickHouseCostView';
import type { CostEntry } from './ClickHouseCostView';
import { cn } from '~/utils';

interface ClickHouseToolCallProps {
  input: string;
  output?: string | null;
  functionName?: string;
}

interface ParsedInput {
  query?: string;
  params: Record<string, string>;
}

interface QueryMetrics {
  elapsed?: number;
  rowsRead?: number;
  bytesRead?: number;
  totalRows?: number;
}

interface CostData {
  grandTotalCHC: number;
  costs: Record<string, unknown>[];
}

interface ParsedOutput {
  error: boolean;
  errorMessage?: string;
  rows?: Record<string, unknown>[];
  keyValue?: Record<string, unknown>;
  costData?: CostData;
  metrics?: QueryMetrics;
  raw: string;
}

const CH_BG = { light: '#ffffff', dark: '#1f1f1c' } as const;
const CH_BG_MUTED = { light: '#f6f7fa', dark: '#282828' } as const;

function parseInput(raw: string): ParsedInput {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const query = (parsed.query ?? parsed.sql) as string | undefined;
    const params: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (key !== 'query' && key !== 'sql') {
        params[key] = String(value);
      }
    }
    return { query, params };
  } catch {
    return { params: {} };
  }
}

function extractMetrics(obj: Record<string, unknown>): QueryMetrics | undefined {
  const stats = obj.statistics as Record<string, unknown> | undefined;
  const rows = obj.rows as number | undefined;
  if (!stats && rows === undefined) {
    return undefined;
  }
  return {
    elapsed: stats?.elapsed as number | undefined,
    rowsRead: stats?.rows_read as number | undefined,
    bytesRead: stats?.bytes_read as number | undefined,
    totalRows: rows as number | undefined,
  };
}

function parseErrorMessage(message: string): string {
  const jsonMatch = message.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return message;
  }
  try {
    const inner = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    const error = inner.error ?? inner.message ?? inner.detail;
    if (typeof error === 'string') {
      const statusCode = inner.status ?? message.match(/HTTP (\d+)/)?.[1];
      return statusCode ? `${statusCode}: ${error}` : error;
    }
  } catch {
    // fall through
  }
  return message;
}

function parseOutput(raw: string): ParsedOutput {
  const formatted = formatJson(raw);
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if ('error' in parsed || 'Error' in parsed) {
      return { error: true, errorMessage: String(parsed.error ?? parsed.Error), raw: formatted };
    }
    const result = (parsed.result ?? parsed) as Record<string, unknown>;
    if (result.status === 'error') {
      return { error: true, errorMessage: parseErrorMessage(String(result.message ?? '')), raw: formatted };
    }
    const metrics = extractMetrics(result);
    if (typeof result.grandTotalCHC === 'number' && Array.isArray(result.costs)) {
      return {
        error: false,
        costData: { grandTotalCHC: result.grandTotalCHC, costs: result.costs as Record<string, unknown>[] },
        metrics,
        raw: formatted,
      };
    }
    const data = unwrapData(result);
    if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object' && data[0] !== null) {
      return { error: false, rows: data as Record<string, unknown>[], metrics, raw: formatted };
    }
    if (typeof result === 'object' && result !== null && !Array.isArray(result)) {
      const cleaned = { ...result };
      delete cleaned.status;
      delete cleaned.statistics;
      delete cleaned.rows;
      const keys = Object.keys(cleaned);
      const isFlat = keys.length > 0 && keys.every((k) => {
        const v = cleaned[k];
        return v === null || typeof v !== 'object' || Array.isArray(v);
      });
      if (isFlat) {
        return { error: false, rows: [cleaned] as Record<string, unknown>[], metrics, raw: formatted };
      }
      const kv = flattenObject(result);
      delete kv.status;
      return { error: false, keyValue: kv, metrics, raw: formatted };
    }
    return { error: false, metrics, raw: formatted };
  } catch {
    return { error: /error|exception|failed/i.test(raw), raw: formatted };
  }
}

function unwrapData(obj: Record<string, unknown>): unknown {
  if (Array.isArray(obj.data) && obj.data.length > 0 && typeof obj.data[0] === 'object') {
    return obj.data;
  }
  const entries = Object.entries(obj);
  const arrays = entries.filter(
    ([, v]) => Array.isArray(v) && v.length > 0 && typeof v[0] === 'object' && v[0] !== null,
  );
  const scalars = entries.filter(
    ([k, v]) => k !== 'status' && !Array.isArray(v) && (typeof v !== 'object' || v === null),
  );
  if (arrays.length === 1 && scalars.length <= 2) {
    return arrays[0][1];
  }
  return obj;
}

function flattenObject(obj: Record<string, unknown>, prefix = ''): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key === 'statistics' || key === 'rows') {
      continue;
    }
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(result, flattenObject(value as Record<string, unknown>, fullKey));
    } else {
      result[fullKey] = value;
    }
  }
  return result;
}

function formatJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

function formatElapsed(seconds: number): string {
  if (seconds < 0.001) {
    return `${(seconds * 1_000_000).toFixed(0)}µs`;
  }
  if (seconds < 1) {
    return `${(seconds * 1000).toFixed(1)}ms`;
  }
  return `${seconds.toFixed(3)}s`;
}

function formatBytes(bytes: number): string {
  const KB = 1000;
  const MB = KB * KB;
  const GB = MB * KB;
  if (bytes >= GB) {
    return `${(bytes / GB).toFixed(2)} GB`;
  }
  if (bytes >= MB) {
    return `${(bytes / MB).toFixed(2)} MB`;
  }
  return `${(bytes / KB).toFixed(2)} KB`;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '—';
  }
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }
  if (typeof value === 'number') {
    return value.toLocaleString();
  }
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return new Date(value).toLocaleString();
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

function MetricsBar({ metrics }: { metrics: QueryMetrics }) {
  return (
    <Container orientation="horizontal" padding="none" gap="md" justifyContent="end">
      {metrics.elapsed !== undefined && (
        <Text color="muted" size="xs">
          Elapsed: {formatElapsed(metrics.elapsed)}
        </Text>
      )}
      {metrics.rowsRead !== undefined && (
        <Text color="muted" size="xs">
          Read: {metrics.rowsRead.toLocaleString()} rows
          {metrics.bytesRead !== undefined && ` (${formatBytes(metrics.bytesRead)})`}
        </Text>
      )}
      {metrics.totalRows !== undefined && !metrics.rowsRead && (
        <Text color="muted" size="xs">
          {metrics.totalRows.toLocaleString()} {metrics.totalRows === 1 ? 'row' : 'rows'}
        </Text>
      )}
    </Container>
  );
}

function FlatTable({ rows }: { rows: Record<string, unknown>[] }) {
  const priorityColumns = ['name', 'title', 'label'];
  const rawColumns = Object.keys(rows[0]).filter((col) => {
    const sample = rows[0][col];
    return sample === null || typeof sample !== 'object';
  });
  const allColumns = [
    ...rawColumns.filter((c) => priorityColumns.includes(c)),
    ...rawColumns.filter((c) => !priorityColumns.includes(c)),
  ];
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(() => new Set());
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const columns = allColumns.filter((c) => !hiddenColumns.has(c));

  const toggleColumn = (col: string) => {
    setHiddenColumns((prev) => {
      const next = new Set(prev);
      if (next.has(col)) {
        next.delete(col);
      } else {
        if (columns.length > 1) {
          next.add(col);
        }
      }
      return next;
    });
  };

  const headers: TableColumnConfigProps[] = columns.map((col) => ({
    label: col,
    overflowMode: 'wrap' as const,
    width: 'auto',
    resizable: true,
  }));
  const tableRows: TableRowType[] = rows.map((row, i) => ({
    id: i,
    items: columns.map((col) => ({ label: formatValue(row[col]), overflowMode: 'wrap' as const })),
  }));

  return (
    <div>
      {allColumns.length > 3 && (
        <div className="relative mb-2 flex justify-end">
          <button
            type="button"
            onClick={() => setShowColumnPicker((prev) => !prev)}
            className="rounded-md border border-border-light bg-surface-tertiary px-2.5 py-1 text-xs text-text-secondary transition-colors hover:bg-surface-hover"
          >
            Filter Columns ({columns.length}/{allColumns.length})
          </button>
          {showColumnPicker && (
            <div
              className="absolute right-0 top-6 z-20 max-h-48 overflow-auto rounded-lg border border-border-light bg-surface-primary p-2 shadow-lg"
              style={{ minWidth: '160px' }}
            >
              {allColumns.map((col) => (
                <label key={col} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs hover:bg-surface-hover">
                  <input
                    type="checkbox"
                    checked={!hiddenColumns.has(col)}
                    onChange={() => toggleColumn(col)}
                    className="accent-current"
                  />
                  {col}
                </label>
              ))}
            </div>
          )}
        </div>
      )}
      <div
        className="opacity-0 transition-opacity duration-100"
        ref={(el) => {
          if (!el) {
            return;
          }
          const tableEl = el.querySelector('table');
          if (tableEl) {
            (tableEl as HTMLElement).style.width = 'max-content';
            (tableEl as HTMLElement).style.minWidth = '100%';
          }
          const scrollContainer = tableEl?.parentElement;
          if (scrollContainer) {
            scrollContainer.style.maxHeight = '360px';
            scrollContainer.style.overflowY = 'auto';
          }
          const thead = el.querySelector('thead');
          if (thead) {
            (thead as HTMLElement).style.position = 'sticky';
            (thead as HTMLElement).style.top = '0';
            (thead as HTMLElement).style.zIndex = '10';
          }
          requestAnimationFrame(() => {
            el.classList.remove('opacity-0');
            el.classList.add('opacity-100');
          });
        }}
      >
        <Table headers={headers} rows={tableRows} size="sm" resizableColumns />
      </div>
    </div>
  );
}

function EndpointPill({ endpoint }: { endpoint: Record<string, unknown> }) {
  const protocol = String(endpoint.protocol ?? '');
  const host = String(endpoint.host ?? '');
  const port = endpoint.port;
  return (
    <div className="flex items-center gap-2 rounded-md bg-surface-tertiary px-2 py-1">
      <Text size="md" color="muted" weight="medium">{protocol}</Text>
      <Text size="md">{host}:{String(port)}</Text>
    </div>
  );
}

const SQL_VALUE_KEYS = new Set(['create_table_query', 'engine_full']);

function ValueRenderer({ value, fieldKey }: { value: unknown; fieldKey?: string }) {
  if (fieldKey && SQL_VALUE_KEYS.has(fieldKey) && typeof value === 'string' && value.length > 0) {
    return (
      <div className="max-h-[200px] overflow-auto rounded">
        <CodeBlock language="sql" theme={undefined} wrapLines>
          {value}
        </CodeBlock>
      </div>
    );
  }
  if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object' && value[0] !== null) {
    const first = value[0] as Record<string, unknown>;
    if ('protocol' in first && 'host' in first) {
      return (
        <div className="flex flex-col gap-1">
          {value.map((ep, i) => (
            <EndpointPill key={i} endpoint={ep as Record<string, unknown>} />
          ))}
        </div>
      );
    }
    if ('column_type' in first && 'name' in first) {
      return (
        <div className="flex flex-col gap-0.5">
          {value.map((item, i) => {
            const col = item as Record<string, unknown>;
            return (
              <div key={i} className="flex items-baseline gap-2">
                <Text size="md" weight="medium">{String(col.name)}</Text>
                <Text size="md" color="muted">{String(col.column_type)}</Text>
              </div>
            );
          })}
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-1">
        {value.map((item, i) => {
          const obj = item as Record<string, unknown>;
          const entries = Object.entries(obj).filter(([, v]) => v !== null && v !== undefined && v !== '');
          return (
            <div key={i} className="flex items-center gap-2 rounded-md bg-surface-tertiary px-2 py-1">
              {entries.map(([k, v], j) => (
                <span key={k}>
                  <Text size="md" color={j === 0 ? 'muted' : 'default'} weight={j === 0 ? 'medium' : 'normal'}>
                    {String(v)}
                  </Text>
                </span>
              ))}
            </div>
          );
        })}
      </div>
    );
  }
  if (Array.isArray(value) && value.length === 0) {
    return <Text size="md" color="muted">[]</Text>;
  }
  if (typeof value === 'object' && value !== null) {
    return <Text size="md" weight="mono">{JSON.stringify(value, null, 2)}</Text>;
  }
  return <Text size="md">{formatValue(value)}</Text>;
}

function getRowLabel(row: Record<string, unknown>): string {
  for (const key of ['name', 'title', 'label', 'id']) {
    if (typeof row[key] === 'string') {
      return row[key] as string;
    }
  }
  return 'Item';
}

function RowContent({ row }: { row: Record<string, unknown> }) {
  const entries = Object.entries(row).filter(([, v]) => v !== null && v !== undefined && v !== '');
  return (
    <div className="w-full py-1">
      {entries.map(([key, value], i) => (
        <div key={key}>
          <div className="flex gap-3 px-3 py-1">
            <Text size="md" color="muted" weight="medium" className="w-36 shrink-0 break-words">
              {key}
            </Text>
            <div className="min-w-0 break-words">
              <ValueRenderer value={value} fieldKey={key} />
            </div>
          </div>
          {i < entries.length - 1 && <Separator size="xs" />}
        </div>
      ))}
    </div>
  );
}

function CollapsibleRow({ row, open, onToggle, codeTheme }: { row: Record<string, unknown>; open: boolean; onToggle: () => void; codeTheme: 'light' | 'dark' }) {
  const label = getRowLabel(row);
  return (
    <Panel padding="none" gap="none" radii="sm" hasBorder orientation="vertical" fillWidth>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full cursor-pointer items-center justify-between rounded px-3 py-2.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px]"
        style={{ background: CH_BG_MUTED[codeTheme] }}
      >
        <Text size="md" weight="medium">{label}</Text>
        <ChevronDown
          className={cn(
            'size-3.5 shrink-0 transition-transform duration-200 ease-out',
            open && 'rotate-180',
          )}
          style={{ color: 'var(--text-secondary)' }}
          aria-hidden="true"
        />
      </button>
      {open && <RowContent row={row} />}
    </Panel>
  );
}

function StaticRows({ rows }: { rows: Record<string, unknown>[] }) {
  return (
    <div className="w-full">
      {rows.map((row, i) => (
        <RowContent key={i} row={row} />
      ))}
    </div>
  );
}

function CollapsibleRows({ rows, codeTheme }: { rows: Record<string, unknown>[]; codeTheme: 'light' | 'dark' }) {
  const [openIds, setOpenIds] = useState<Set<number>>(() => new Set());
  const allOpen = openIds.size === rows.length;

  const toggleAll = () => {
    setOpenIds(allOpen ? new Set() : new Set(rows.map((_, i) => i)));
  };

  const toggleOne = (index: number) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  return (
    <div className="w-full">
      <div className="mb-2 flex justify-end pr-2">
          <button
            type="button"
            onClick={toggleAll}
            className="text-xs"
            style={{ color: 'var(--text-secondary)' }}
          >
            {allOpen ? 'Collapse all' : 'Expand all'}
          </button>
        </div>
      <div className="-mx-0.5 flex w-[calc(100%+4px)] max-h-[400px] flex-col gap-3 overflow-auto px-0.5 py-0.5">
        {rows.map((row, i) => (
          <CollapsibleRow key={i} row={row} open={openIds.has(i)} onToggle={() => toggleOne(i)} codeTheme={codeTheme} />
        ))}
      </div>
    </div>
  );
}

function ResultContent({
  parsed,
  codeTheme,
  functionName,
}: {
  parsed: ParsedOutput;
  codeTheme: 'light' | 'dark';
  functionName?: string;
}) {
  if (parsed.error && parsed.errorMessage) {
    return (
      <Panel padding="sm" color="default" radii="sm" hasBorder>
        <Text size="md" color="danger">{parsed.errorMessage}</Text>
      </Panel>
    );
  }

  if (parsed.costData) {
    return (
      <ClickHouseCostView
        costs={parsed.costData.costs as CostEntry[]}
        grandTotalCHC={parsed.costData.grandTotalCHC}
        codeTheme={codeTheme}
      />
    );
  }

  if (parsed.rows && parsed.rows.length > 0) {
    if (functionName === 'get_service_details') {
      return <StaticRows rows={parsed.rows} />;
    }
    if (functionName === 'get_services_list' || functionName === 'list_tables') {
      return <CollapsibleRows rows={parsed.rows} codeTheme={codeTheme} />;
    }
    return <FlatTable rows={parsed.rows} />;
  }

  if (parsed.keyValue && functionName === 'get_service_details') {
    const cleaned = { ...parsed.keyValue };
    delete cleaned.status;
    return <StaticRows rows={[cleaned]} />;
  }

  if (parsed.keyValue) {
    return (
      <Panel padding="sm" color="default" radii="sm" hasBorder>
        {Object.entries(parsed.keyValue)
          .filter(([, v]) => v !== null && v !== undefined && v !== '')
          .map(([key, value], i, arr) => (
            <div key={key}>
              <div className="flex gap-3 py-1.5">
                <Text size="xs" color="muted" weight="medium" className="w-40 shrink-0">
                  {key}
                </Text>
                <Text size="xs" className="min-w-0 break-words">
                  {formatValue(value)}
                </Text>
              </div>
              {i < arr.length - 1 && <Separator size="xs" />}
            </div>
          ))}
      </Panel>
    );
  }

  return (
    <CodeBlock language="json" theme={codeTheme} wrapLines>
      {parsed.raw}
    </CodeBlock>
  );
}

export default function ClickHouseToolCall({ input, output, functionName }: ClickHouseToolCallProps) {
  const { theme } = useTheme();
  const codeTheme = isDark(theme) ? 'dark' : 'light';
  const { query, params } = useMemo(() => parseInput(input), [input]);
  const parsed = useMemo(() => (output ? parseOutput(output) : null), [output]);
  const autoTab = parsed ? 'result' : 'details';
  const [userTab, setUserTab] = useState<string | null>(null);
  const activeTab = userTab ?? autoTab;

  return (
    <ClickUIProvider theme={codeTheme}>
      <div
        className="flex w-full flex-col gap-2 rounded-lg px-3 py-3"
        style={{ background: CH_BG[codeTheme], margin: '-1px' }}
      >
        <Tabs value={activeTab} onValueChange={setUserTab}>
          <Tabs.TriggersList className="[&]:justify-between">
            <div className="flex">
              {query && <Tabs.Trigger value="query">Query</Tabs.Trigger>}
              {parsed && <Tabs.Trigger value="result">Result</Tabs.Trigger>}
            </div>
            <Tabs.Trigger value="details">Details</Tabs.Trigger>
          </Tabs.TriggersList>

          {query && (
            <Tabs.Content value="query" tabIndex={-1}>
              <div className="pt-3">
                {Object.keys(params).length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1.5">
                    {Object.entries(params).map(([key, value]) => (
                      <div key={key} className="flex items-baseline gap-1.5 text-xs">
                        <Text size="xs" color="muted" weight="medium">{key}</Text>
                        <span
                          className="rounded px-1.5 py-0.5 font-mono text-xs"
                          style={{
                            background: CH_BG_MUTED[codeTheme],
                            color: 'var(--text-primary)',
                          }}
                        >
                          {value}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <CodeBlock language="sql" theme={codeTheme} showLineNumbers wrapLines showWrapButton>
                  {query}
                </CodeBlock>
              </div>
            </Tabs.Content>
          )}

          {parsed && (
            <Tabs.Content value="result" tabIndex={-1}>
              <div className="pt-3">
                <ResultContent parsed={parsed} codeTheme={codeTheme} functionName={functionName} />
              </div>
            </Tabs.Content>
          )}

          <Tabs.Content value="details" tabIndex={-1}>
            <div className="flex flex-col gap-3 pt-3">
              <div>
                <Text size="xs" color="muted" weight="medium" className="mb-1">Input</Text>
                <div className="max-h-[300px] overflow-auto rounded-lg">
                  <CodeBlock language="json" theme={codeTheme} wrapLines>
                    {formatJson(input)}
                  </CodeBlock>
                </div>
              </div>
              {output && (
                <>
                  <Separator size="xs" />
                  <div>
                    <Text size="xs" color="muted" weight="medium" className="mb-1">Output</Text>
                    <div className="max-h-[300px] overflow-auto rounded-lg">
                      <CodeBlock language="json" theme={codeTheme} wrapLines>
                        {formatJson(output)}
                      </CodeBlock>
                    </div>
                  </div>
                </>
              )}
            </div>
          </Tabs.Content>
        </Tabs>

        {parsed && (
          <Container orientation="horizontal" padding="none" gap="md" justifyContent="end" alignItems="center">
            <Badge
              text={parsed.error ? 'Error' : 'Succeeded'}
              state={parsed.error ? 'danger' : 'success'}
              icon={parsed.error ? 'warning' : 'check'}
              iconDir="start"
              size="sm"
            />
            {parsed.metrics && <MetricsBar metrics={parsed.metrics} />}
          </Container>
        )}
      </div>
    </ClickUIProvider>
  );
}
