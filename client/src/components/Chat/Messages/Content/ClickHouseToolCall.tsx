import { useMemo } from 'react';
import { Badge, CodeBlock, Tabs, ClickUIProvider } from '@clickhouse/click-ui';
import { useTheme, isDark } from '@librechat/client';
import { useLocalize } from '~/hooks';

interface ClickHouseToolCallProps {
  input: string;
  output?: string | null;
}

interface ParsedInput {
  query?: string;
  params: Record<string, string>;
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

function formatJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

function detectError(output: string): boolean {
  try {
    const parsed = JSON.parse(output) as Record<string, unknown>;
    return 'error' in parsed || 'Error' in parsed;
  } catch {
    return /error|exception|failed/i.test(output);
  }
}

export default function ClickHouseToolCall({ input, output }: ClickHouseToolCallProps) {
  const localize = useLocalize();
  const { theme } = useTheme();
  const codeTheme = isDark(theme) ? 'dark' : 'light';
  const { query, params } = useMemo(() => parseInput(input), [input]);
  const hasError = output ? detectError(output) : false;

  return (
    <ClickUIProvider theme={codeTheme}>
    <div className="w-full px-3 py-3.5">
      {output && (
        <div className="mb-2 flex items-center gap-2">
          <Badge
            text={hasError ? 'Error' : 'Success'}
            state={hasError ? 'danger' : 'success'}
            size="sm"
          />
        </div>
      )}

      <Tabs defaultValue={query ? 'query' : 'input'}>
        <Tabs.TriggersList>
          {query && <Tabs.Trigger value="query">Query</Tabs.Trigger>}
          <Tabs.Trigger value="input">Input</Tabs.Trigger>
          {output && <Tabs.Trigger value="result">{localize('com_ui_result')}</Tabs.Trigger>}
        </Tabs.TriggersList>

        {query && (
          <Tabs.Content value="query">
            {Object.keys(params).length > 0 && (
              <div className="mb-2 mt-2 flex flex-wrap gap-2">
                {Object.entries(params).map(([key, value]) => (
                  <span
                    key={key}
                    className="rounded bg-surface-tertiary px-2 py-0.5 text-xs text-text-secondary"
                  >
                    {key}: {value}
                  </span>
                ))}
              </div>
            )}
            <div className="mt-2">
              <CodeBlock language="sql" theme={codeTheme} showLineNumbers>
                {query}
              </CodeBlock>
            </div>
          </Tabs.Content>
        )}

        <Tabs.Content value="input">
          <div className="mt-2">
            <CodeBlock language="json" theme={codeTheme}>
              {formatJson(input)}
            </CodeBlock>
          </div>
        </Tabs.Content>

        {output && (
          <Tabs.Content value="result">
            <div className="mt-2">
              <CodeBlock language="json" theme={codeTheme}>
                {formatJson(output)}
              </CodeBlock>
            </div>
          </Tabs.Content>
        )}
      </Tabs>
    </div>
    </ClickUIProvider>
  );
}
