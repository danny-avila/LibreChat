import { useMemo } from 'react';
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
import { useTheme, isDark } from '@librechat/client';
import type { TableColumnConfigProps, TableRowType } from '@clickhouse/click-ui';

interface ClickHouseToolCallProps {
  input: string;
  output?: string | null;
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

interface ParsedOutput {
  error: boolean;
  errorMessage?: string;
  rows?: Record<string, unknown>[];
  keyValue?: Record<string, unknown>;
  metrics?: QueryMetrics;
  raw: string;
}

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

function parseOutput(raw: string): ParsedOutput {
  const formatted = formatJson(raw);
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if ('error' in parsed || 'Error' in parsed) {
      return { error: true, errorMessage: String(parsed.error ?? parsed.Error), raw: formatted };
    }
    const result = (parsed.result ?? parsed) as Record<string, unknown>;
    if (result.status === 'error') {
      return { error: true, errorMessage: String(result.message ?? ''), raw: formatted };
    }
    const metrics = extractMetrics(result);
    const data = unwrapData(result);
    if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object' && data[0] !== null) {
      return { error: false, rows: data as Record<string, unknown>[], metrics, raw: formatted };
    }
    if (typeof result === 'object' && result !== null && !Array.isArray(result)) {
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
  for (const key of ['data', 'rows', 'backups', 'databases', 'tables', 'clickpipes', 'services']) {
    if (Array.isArray(obj[key])) {
      return obj[key];
    }
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

function buildTableData(rows: Record<string, unknown>[]): {
  headers: TableColumnConfigProps[];
  tableRows: TableRowType[];
} {
  const columns = Object.keys(rows[0]);
  const headers: TableColumnConfigProps[] = columns.map((col) => ({
    label: col,
    overflowMode: 'truncated' as const,
  }));
  const tableRows: TableRowType[] = rows.map((row, i) => ({
    id: i,
    items: columns.map((col) => ({ label: formatValue(row[col]) })),
  }));
  return { headers, tableRows };
}

function ResultContent({
  parsed,
  codeTheme,
}: {
  parsed: ParsedOutput;
  codeTheme: 'light' | 'dark';
}) {
  if (parsed.error && parsed.errorMessage) {
    return (
      <Panel padding="sm" color="default" radii="sm" hasBorder>
        <Text size="xs" color="danger">{parsed.errorMessage}</Text>
      </Panel>
    );
  }

  if (parsed.rows && parsed.rows.length > 0) {
    const { headers, tableRows } = buildTableData(parsed.rows);
    return (
      <div ref={(el) => {
        if (!el) {
          return;
        }
        const tableEl = el.querySelector('table');
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
          thead.querySelectorAll('th').forEach((th) => {
            (th as HTMLElement).style.background = 'var(--cui-color-background-muted)';
          });
        }
      }}>
        <Table headers={headers} rows={tableRows} size="sm" />
      </div>
    );
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
    <CodeBlock language="json" theme={codeTheme}>
      {parsed.raw}
    </CodeBlock>
  );
}

export default function ClickHouseToolCall({ input, output }: ClickHouseToolCallProps) {
  const { theme } = useTheme();
  const codeTheme = isDark(theme) ? 'dark' : 'light';
  const { query, params } = useMemo(() => parseInput(input), [input]);
  const parsed = useMemo(() => (output ? parseOutput(output) : null), [output]);
  const defaultTab = query ? 'query' : parsed ? 'result' : 'details';

  return (
    <ClickUIProvider theme={codeTheme}>
      <div className="flex w-full flex-col gap-3 px-3 py-3">
        <Tabs defaultValue={defaultTab}>
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
                            background: 'var(--cui-color-background-muted)',
                            color: 'var(--cui-color-text-default)',
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
                <ResultContent parsed={parsed} codeTheme={codeTheme} />
              </div>
            </Tabs.Content>
          )}

          <Tabs.Content value="details" tabIndex={-1}>
            <div className="flex flex-col gap-3 pt-3">
              <div>
                <Text size="xs" color="muted" weight="medium" className="mb-1">Input</Text>
                <div className="max-h-[300px] overflow-auto rounded-lg">
                  <CodeBlock language="json" theme={codeTheme}>
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
                      <CodeBlock language="json" theme={codeTheme}>
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
              text={parsed.error ? 'Error' : 'Completed'}
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
