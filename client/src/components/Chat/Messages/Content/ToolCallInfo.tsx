import { useState, useMemo } from 'react';
import { Tools } from 'librechat-data-provider';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { UIResourceRenderer } from '@mcp-ui/client';
import type { TAttachment, UIResource } from 'librechat-data-provider';
import { useLocalize, useExpandCollapse } from '~/hooks';
import { OutputRenderer } from './ToolOutput';
import UIResourceCarousel from './UIResourceCarousel';
import { cn } from '~/utils';

function isSimpleObject(obj: unknown): obj is Record<string, string | number | boolean | null> {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
    return false;
  }
  const entries = Object.entries(obj);
  if (entries.length === 0 || entries.length > 6) {
    return false;
  }
  return entries.every(
    ([, v]) =>
      v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean',
  );
}

function KeyValueInput({ data }: { data: Record<string, string | number | boolean | null> }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
      {Object.entries(data).map(([key, value]) => (
        <div key={key} className="flex items-baseline gap-1.5">
          <span className="font-medium text-text-secondary">{key}</span>
          <span className="rounded bg-surface-tertiary px-1.5 py-0.5 text-text-primary">
            {String(value ?? 'null')}
          </span>
        </div>
      ))}
    </div>
  );
}

function InputRenderer({ input }: { input: string }) {
  if (!input || input.trim().length === 0) {
    return null;
  }

  try {
    const parsed = JSON.parse(input);
    if (isSimpleObject(parsed)) {
      return <KeyValueInput data={parsed} />;
    }
    return (
      <pre className="max-h-[200px] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-surface-tertiary p-2 font-mono text-xs text-text-primary">
        <code>{JSON.stringify(parsed, null, 2)}</code>
      </pre>
    );
  } catch {
    return (
      <pre className="max-h-[200px] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-surface-tertiary p-2 font-mono text-xs text-text-primary">
        <code>{input}</code>
      </pre>
    );
  }
}

export default function ToolCallInfo({
  input,
  output,
  attachments,
}: {
  input: string;
  output?: string | null;
  attachments?: TAttachment[];
}) {
  const localize = useLocalize();
  const [showParams, setShowParams] = useState(false);
  const paramsExpandStyle = useExpandCollapse(showParams);

  const formattedInput = useMemo(() => {
    try {
      const parsed = JSON.parse(input);
      if (typeof parsed === 'object' && parsed !== null && Object.keys(parsed).length === 0) {
        return '';
      }
      return JSON.stringify(parsed, null, 2);
    } catch {
      return input;
    }
  }, [input]);

  const uiResources: UIResource[] =
    attachments
      ?.filter((attachment) => attachment.type === Tools.ui_resources)
      .flatMap((attachment) => {
        return attachment[Tools.ui_resources] as UIResource[];
      }) ?? [];

  const hasParams = formattedInput.trim().length > 0;

  return (
    <div className="w-full p-3">
      {output && <OutputRenderer text={output} />}
      {output && hasParams && <div className="my-2 border-t border-border-light" />}
      {hasParams && (
        <>
          <button
            type="button"
            className={cn(
              'inline-flex items-center gap-1 text-xs text-text-tertiary',
              'hover:text-text-secondary',
            )}
            onClick={() => setShowParams((prev) => !prev)}
            aria-expanded={showParams}
          >
            <span>{localize('com_ui_parameters')}</span>
            {showParams ? (
              <ChevronUp className="size-3 shrink-0" aria-hidden="true" />
            ) : (
              <ChevronDown className="size-3 shrink-0" aria-hidden="true" />
            )}
          </button>
          <div style={paramsExpandStyle}>
            <div className="overflow-hidden pt-1">
              <InputRenderer input={formattedInput} />
            </div>
          </div>
        </>
      )}
      {uiResources.length > 0 && (
        <>
          {(hasParams || output) && <div className="my-2 border-t border-border-light" />}
          {uiResources.length > 1 && <UIResourceCarousel uiResources={uiResources} />}
          {uiResources.length === 1 && (
            <UIResourceRenderer
              resource={uiResources[0]}
              onUIAction={async (result) => {
                console.log('Action:', result);
              }}
              htmlProps={{
                autoResizeIframe: { width: true, height: true },
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
