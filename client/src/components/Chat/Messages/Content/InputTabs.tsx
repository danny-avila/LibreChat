import { useState } from 'react';
import { CodeBlock } from '@clickhouse/click-ui';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

type TabType = 'input' | 'query';

export default function InputTabs({
  input,
  query,
  maxHeight = 250,
}: {
  input: string;
  query: string;
  maxHeight?: number;
}) {
  const localize = useLocalize();
  const [activeTab, setActiveTab] = useState<TabType>('query');

  return (
    <div className="overflow-hidden rounded-lg border border-border-light bg-surface-tertiary">
      <div className="flex border-b border-border-light bg-surface-secondary">
        <button
          onClick={() => setActiveTab('query')}
          className={cn(
            'px-4 py-1.5 text-xs font-medium transition-colors',
            activeTab === 'query'
              ? 'border-b-2 border-text-primary text-text-primary'
              : 'text-text-secondary hover:text-text-primary',
          )}
        >
          {localize('com_ui_query')}
        </button>
        <button
          onClick={() => setActiveTab('input')}
          className={cn(
            'px-4 py-1.5 text-xs font-medium transition-colors',
            activeTab === 'input'
              ? 'border-b-2 border-text-primary text-text-primary'
              : 'text-text-secondary hover:text-text-primary',
          )}
        >
          {localize('com_ui_input')}
        </button>
      </div>
      <div style={{ maxHeight, overflow: 'auto' }}>
        {activeTab === 'query' ? (
          <div className="clickhouse-codeblock">
            <CodeBlock language="sql">{query}</CodeBlock>
          </div>
        ) : (
          <div className="p-2 text-xs text-text-primary">
            <pre
              className="m-0 whitespace-pre-wrap break-words"
              style={{ overflowWrap: 'break-word' }}
            >
              <code>{input}</code>
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
