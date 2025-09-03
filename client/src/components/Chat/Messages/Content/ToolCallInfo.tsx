import React from 'react';
import { useLocalize } from '~/hooks';
import { UIResourceRenderer } from '@mcp-ui/client';
import UIResourceGrid from './UIResourceGrid';
import type { UIResource } from '~/common';

function OptimizedCodeBlock({ text, maxHeight = 320 }: { text: string; maxHeight?: number }) {
  return (
    <div
      className="rounded-lg bg-surface-tertiary p-2 text-xs text-text-primary"
      style={{
        position: 'relative',
        maxHeight,
        overflow: 'auto',
      }}
    >
      <pre className="m-0 whitespace-pre-wrap break-words" style={{ overflowWrap: 'break-word' }}>
        <code>{text}</code>
      </pre>
    </div>
  );
}

export default function ToolCallInfo({
  input,
  output,
  domain,
  function_name,
  pendingAuth,
}: {
  input: string;
  function_name: string;
  output?: string | null;
  domain?: string;
  pendingAuth?: boolean;
}) {
  const localize = useLocalize();
  const formatText = (text: string) => {
    try {
      return JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      return text;
    }
  };

  let title =
    domain != null && domain
      ? localize('com_assistants_domain_info', { 0: domain })
      : localize('com_assistants_function_use', { 0: function_name });
  if (pendingAuth === true) {
    title =
      domain != null && domain
        ? localize('com_assistants_action_attempt', { 0: domain })
        : localize('com_assistants_attempt_info');
  }

  // Extract ui_resources from the output to display them in the UI
  let uiResources: UIResource[] = [];
  if (output?.includes('ui_resources')) {
    const parsedOutput = JSON.parse(output);
    const uiResourcesItem = parsedOutput.find(
      (contentItem) => contentItem.metadata === 'ui_resources',
    );
    if (uiResourcesItem?.text) {
      uiResources = JSON.parse(atob(uiResourcesItem.text)) as UIResource[];
    }
    output = JSON.stringify(
      parsedOutput.filter((contentItem) => contentItem.metadata !== 'ui_resources'),
    );
  }

  return (
    <div className="w-full p-2">
      <div style={{ opacity: 1 }}>
        <div className="mb-2 text-sm font-medium text-text-primary">{title}</div>
        <div>
          <OptimizedCodeBlock text={formatText(input)} maxHeight={250} />
        </div>
        {output && (
          <>
            <div className="my-2 text-sm font-medium text-text-primary">
              {localize('com_ui_result')}
            </div>
            <div>
              <OptimizedCodeBlock text={formatText(output)} maxHeight={250} />
            </div>
            {uiResources.length > 0 && (
              <div className="my-2 text-sm font-medium text-text-primary">
                {localize('com_ui_ui_resources')}
              </div>
            )}
            <div>
              {uiResources.length > 1 && <UIResourceGrid uiResources={uiResources} />}

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
            </div>
          </>
        )}
      </div>
    </div>
  );
}
