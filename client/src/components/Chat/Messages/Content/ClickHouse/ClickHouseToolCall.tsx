import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { lowlight } from 'lowlight';
import { ChevronDown, Copy, Check } from 'lucide-react';
import {
  Badge,
  CheckboxMultiSelect,
  ClickUIProvider,
  Grid,
  Pagination,
  Panel,
  Text,
  Separator,
  Tabs,
  Container,
} from '@clickhouse/click-ui';
import type { CellProps } from '@clickhouse/click-ui';
import { useTheme, isDark } from '@librechat/client';
import type { ClickHouseToolCallProps, ParsedOutput, QueryMetrics } from './types';
import { CH_BG, CH_BG_MUTED, SQL_VALUE_KEYS, MAX_ROWS_PER_PAGE } from './types';
import {
  parseInput,
  parseOutput,
  formatJson,
  formatElapsed,
  formatBytes,
  formatValue,
  getRowLabel,
} from './helpers';
import { ClickHouseCostView } from './CostView';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

const GRID_ROW_HEIGHT = 33;
const GRID_HEADER_HEIGHT = 34;

let injectedTheme: 'light' | 'dark' | null = null;
let styleEl: HTMLStyleElement | null = null;

interface HastText {
  type: 'text';
  value: string;
}
interface HastElement {
  type: 'element';
  tagName: string;
  properties?: { className?: string[] };
  children?: HastNode[];
}
type HastNode = HastText | HastElement;

function hastToReact(nodes: HastNode[]): React.ReactNode[] {
  return nodes.map((node, i) => {
    if (node.type === 'text') {
      return node.value;
    }
    return React.createElement(
      node.tagName,
      { key: i, className: node.properties?.className?.join(' ') },
      node.children ? hastToReact(node.children) : undefined,
    );
  });
}

/** Click UI CodeBlock color theme — scoped to `.ch-code` to avoid leaking. */
function chCodeStyles(dark: boolean): string {
  const c = dark
    ? {
        comment: '#999',
        kw: '#88aece',
        attr: '#c59bc1',
        name: '#f08d49',
        str: '#b5bd68',
        bullet: '#ccc',
        del: '#de7176',
        add: '#76c490',
      }
    : {
        comment: '#656e77',
        kw: '#015692',
        attr: '#803378',
        name: '#b75501',
        str: '#54790d',
        bullet: '#535a60',
        del: '#c02d2e',
        add: '#2f6f44',
      };
  return `
.ch-code .hljs-comment{color:${c.comment}}
.ch-code .hljs-keyword,.ch-code .hljs-selector-tag,.ch-code .hljs-meta-keyword,.ch-code .hljs-doctag,.ch-code .hljs-section,.ch-code .hljs-selector-class,.ch-code .hljs-meta,.ch-code .hljs-selector-pseudo,.ch-code .hljs-attr{color:${c.kw}}
.ch-code .hljs-attribute{color:${c.attr}}
.ch-code .hljs-name,.ch-code .hljs-type,.ch-code .hljs-number,.ch-code .hljs-selector-id,.ch-code .hljs-quote,.ch-code .hljs-template-tag,.ch-code .hljs-built_in,.ch-code .hljs-title,.ch-code .hljs-literal{color:${c.name}}
.ch-code .hljs-string,.ch-code .hljs-regexp,.ch-code .hljs-symbol,.ch-code .hljs-variable,.ch-code .hljs-template-variable,.ch-code .hljs-link,.ch-code .hljs-selector-attr,.ch-code .hljs-meta-string{color:${c.str}}
.ch-code .hljs-bullet,.ch-code .hljs-code{color:${c.bullet}}
.ch-code .hljs-deletion{color:${c.del}}
.ch-code .hljs-addition{color:${c.add}}
.ch-code .hljs-emphasis{font-style:italic}
.ch-code .hljs-strong{font-weight:bold}`;
}

/**
 * Syntax-highlighted code display using lowlight with Click UI's color theme.
 * Replaces Click UI's CodeBlock to avoid react-syntax-highlighter's CJS
 * lowlight@1.x which conflicts with rehype-highlight's ESM lowlight@2.x
 * in production builds.
 */
function CodeDisplay({ children, language }: { children: string; language?: string }) {
  const { theme } = useTheme();
  const dark = isDark(theme);
  const [copied, setCopied] = useState(false);
  const copyTimeout = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(copyTimeout.current), []);

  const targetTheme = dark ? 'dark' : 'light';
  useEffect(() => {
    if (injectedTheme === targetTheme) {
      return;
    }
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.setAttribute('data-ch-code', '');
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = chCodeStyles(dark);
    injectedTheme = targetTheme;
  }, [targetTheme, dark]);

  const highlighted = useMemo(() => {
    if (!language || !lowlight.registered(language)) {
      return null;
    }
    try {
      const tree = lowlight.highlight(language, children);
      return hastToReact(tree.children as HastNode[]);
    } catch {
      return null;
    }
  }, [children, language]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
      clearTimeout(copyTimeout.current);
      copyTimeout.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="ch-code overflow-auto rounded-lg bg-surface-tertiary">
      <div className="flex items-start">
        <pre className="min-w-0 flex-1 whitespace-pre-wrap break-words p-3 text-xs leading-relaxed">
          <code>{highlighted ?? children}</code>
        </pre>
        <button
          type="button"
          onClick={copy}
          className="shrink-0 rounded p-1.5 pr-1 pt-2 text-text-secondary transition-colors hover:text-text-primary"
          aria-label="Copy"
        >
          {copied ? <Check className="size-3.5 text-green-500" /> : <Copy className="size-3.5" />}
        </button>
      </div>
    </div>
  );
}

function MetricsBar({ metrics }: { metrics: QueryMetrics }) {
  const localize = useLocalize();
  return (
    <Container orientation="horizontal" padding="none" gap="md" justifyContent="end">
      {metrics.elapsed !== undefined && (
        <Text color="muted" size="xs">
          {localize('com_ch_label_elapsed', { value: formatElapsed(metrics.elapsed) })}
        </Text>
      )}
      {metrics.rowsRead !== undefined && (
        <Text color="muted" size="xs">
          {metrics.bytesRead !== undefined
            ? localize('com_ch_label_read_bytes', {
                rows: metrics.rowsRead.toLocaleString(),
                bytes: formatBytes(metrics.bytesRead),
              })
            : localize('com_ch_label_read', { rows: metrics.rowsRead.toLocaleString() })}
        </Text>
      )}
      {metrics.totalRows !== undefined && metrics.rowsRead === undefined && (
        <Text color="muted" size="xs">
          {localize(metrics.totalRows === 1 ? 'com_ch_label_row' : 'com_ch_label_rows', {
            count: metrics.totalRows,
          })}
        </Text>
      )}
    </Container>
  );
}

function FlatTable({ rows }: { rows: Record<string, unknown>[] }) {
  const localize = useLocalize();
  const allColumns = useMemo(() => {
    const priority = ['name', 'title', 'label'];
    const seen = new Set<string>();
    const cols: string[] = [];
    for (const row of rows) {
      for (const col of Object.keys(row)) {
        if (!seen.has(col) && (row[col] === null || typeof row[col] !== 'object')) {
          seen.add(col);
          cols.push(col);
        }
      }
    }
    return [
      ...cols.filter((c) => priority.includes(c)),
      ...cols.filter((c) => !priority.includes(c)),
    ];
  }, [rows]);

  const [selectedColumns, setSelectedColumns] = useState<string[]>(() => allColumns);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setSelectedColumns(allColumns);
    setCurrentPage(1);
  }, [allColumns]);

  const columns = allColumns.filter((c) => selectedColumns.includes(c));

  const totalPages = Math.ceil(rows.length / MAX_ROWS_PER_PAGE);
  const pageRows = rows.slice(
    (currentPage - 1) * MAX_ROWS_PER_PAGE,
    currentPage * MAX_ROWS_PER_PAGE,
  );
  const gridHeight =
    Math.min(pageRows.length, MAX_ROWS_PER_PAGE) * GRID_ROW_HEIGHT + GRID_HEADER_HEIGHT;

  const Cell: CellProps = useCallback(
    ({ rowIndex, columnIndex, type, ...props }) => {
      if (type === 'header-cell') {
        return <span {...props}>{columns[columnIndex]}</span>;
      }
      return <span {...props}>{formatValue(pageRows[rowIndex - 1]?.[columns[columnIndex]])}</span>;
    },
    [columns, pageRows],
  );

  return (
    <div>
      {allColumns.length > 3 && (
        <div className="mb-2 flex justify-end" style={{ maxWidth: '220px', marginLeft: 'auto' }}>
          <CheckboxMultiSelect
            value={selectedColumns}
            onSelect={(vals) => setSelectedColumns(vals.length > 0 ? vals : [allColumns[0]])}
            selectLabel={localize('com_ch_filter_columns', {
              visible: columns.length,
              total: allColumns.length,
            })}
          >
            {allColumns.map((col) => (
              <CheckboxMultiSelect.Item key={col} value={col} label={col} />
            ))}
          </CheckboxMultiSelect>
        </div>
      )}
      <Panel height={`${gridHeight}px`} fillWidth padding="none" hasBorder radii="sm">
        <Container orientation="vertical" padding="none" gap="none" fillWidth fillHeight>
          <Grid
            cell={Cell}
            rowStart={1}
            rowCount={pageRows.length}
            columnCount={columns.length}
            showHeader
          />
          {totalPages > 1 && (
            <>
              <Separator size="xs" />
              <Pagination
                totalPages={totalPages}
                currentPage={currentPage}
                pageSize={MAX_ROWS_PER_PAGE}
                rowCount={rows.length}
                onChange={setCurrentPage}
              />
            </>
          )}
        </Container>
      </Panel>
    </div>
  );
}

function EndpointPill({ endpoint }: { endpoint: Record<string, unknown> }) {
  const protocol = String(endpoint.protocol ?? '');
  const host = String(endpoint.host ?? '');
  const port = endpoint.port;
  return (
    <div className="flex items-center gap-2 rounded-md bg-surface-tertiary px-2 py-1">
      <Text size="md" color="muted" weight="medium">
        {protocol}
      </Text>
      <Text size="md" className="break-all">
        {host}:{String(port)}
      </Text>
    </div>
  );
}

function ValueRenderer({ value, fieldKey }: { value: unknown; fieldKey?: string }) {
  if (fieldKey && SQL_VALUE_KEYS.has(fieldKey) && typeof value === 'string' && value.length > 0) {
    return (
      <div className="max-h-[200px] overflow-auto rounded">
        <CodeDisplay language="sql">{value}</CodeDisplay>
      </div>
    );
  }
  if (
    Array.isArray(value) &&
    value.length > 0 &&
    typeof value[0] === 'object' &&
    value[0] !== null
  ) {
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
                <Text size="md" weight="medium">
                  {String(col.name)}
                </Text>
                <Text size="md" color="muted">
                  {String(col.column_type)}
                </Text>
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
          const entries = Object.entries(obj).filter(
            ([, v]) => v !== null && v !== undefined && v !== '',
          );
          return (
            <div
              key={i}
              className="flex items-center gap-2 rounded-md bg-surface-tertiary px-2 py-1"
            >
              {entries.map(([k, v], j) => (
                <span key={k}>
                  <Text
                    size="md"
                    color={j === 0 ? 'muted' : 'default'}
                    weight={j === 0 ? 'medium' : 'normal'}
                  >
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
    return (
      <Text size="md" color="muted">
        []
      </Text>
    );
  }
  if (typeof value === 'object' && value !== null) {
    return (
      <Text size="md" weight="mono">
        {JSON.stringify(value, null, 2)}
      </Text>
    );
  }
  return <Text size="md">{formatValue(value)}</Text>;
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

function CollapsibleRow({
  row,
  open,
  onToggle,
  codeTheme,
}: {
  row: Record<string, unknown>;
  open: boolean;
  onToggle: () => void;
  codeTheme: 'light' | 'dark';
}) {
  const label = getRowLabel(row);
  return (
    <Panel padding="none" gap="none" radii="sm" hasBorder orientation="vertical" fillWidth>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full cursor-pointer items-center justify-between rounded px-3 py-2.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px]"
        style={{ background: CH_BG_MUTED[codeTheme] }}
      >
        <Text size="md" weight="medium">
          {label}
        </Text>
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

function CollapsibleRows({
  rows,
  codeTheme,
}: {
  rows: Record<string, unknown>[];
  codeTheme: 'light' | 'dark';
}) {
  const localize = useLocalize();
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
          {allOpen ? localize('com_ch_collapse_all') : localize('com_ch_expand_all')}
        </button>
      </div>
      <div className="-mx-0.5 flex max-h-[400px] w-[calc(100%+4px)] flex-col gap-3 overflow-auto px-0.5 py-0.5">
        {rows.map((row, i) => (
          <CollapsibleRow
            key={i}
            row={row}
            open={openIds.has(i)}
            onToggle={() => toggleOne(i)}
            codeTheme={codeTheme}
          />
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
        <Text size="md" color="danger">
          {parsed.errorMessage}
        </Text>
      </Panel>
    );
  }

  if (parsed.costData) {
    return (
      <ClickHouseCostView
        costs={parsed.costData.costs}
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

  return <CodeDisplay language="json">{parsed.raw}</CodeDisplay>;
}

export default function ClickHouseToolCall({
  input,
  output,
  functionName,
}: ClickHouseToolCallProps) {
  const localize = useLocalize();
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
              {query && <Tabs.Trigger value="query">{localize('com_ch_tab_query')}</Tabs.Trigger>}
              {parsed && <Tabs.Trigger value="result">{localize('com_ui_result')}</Tabs.Trigger>}
            </div>
            <Tabs.Trigger value="details">{localize('com_ui_details')}</Tabs.Trigger>
          </Tabs.TriggersList>

          {query && (
            <Tabs.Content value="query" tabIndex={-1}>
              <div className="pt-3">
                {Object.keys(params).length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1.5">
                    {Object.entries(params).map(([key, value]) => (
                      <div key={key} className="flex items-baseline gap-1.5 text-xs">
                        <Text size="xs" color="muted" weight="medium">
                          {key}
                        </Text>
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
                <CodeDisplay language="sql">{query}</CodeDisplay>
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
                <Text size="xs" color="muted" weight="medium" className="mb-1">
                  {localize('com_ui_input')}
                </Text>
                <div className="max-h-[300px] overflow-auto rounded-lg">
                  <CodeDisplay language="json">{formatJson(input)}</CodeDisplay>
                </div>
              </div>
              {output && (
                <>
                  <Separator size="xs" />
                  <div>
                    <Text size="xs" color="muted" weight="medium" className="mb-1">
                      {localize('com_endpoint_output')}
                    </Text>
                    <div className="max-h-[300px] overflow-auto rounded-lg">
                      <CodeDisplay language="json">{formatJson(output)}</CodeDisplay>
                    </div>
                  </div>
                </>
              )}
            </div>
          </Tabs.Content>
        </Tabs>

        {parsed && (
          <Container
            orientation="horizontal"
            padding="none"
            gap="md"
            justifyContent="end"
            alignItems="center"
          >
            <Badge
              text={
                parsed.error ? localize('com_ch_status_error') : localize('com_ch_status_succeeded')
              }
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
