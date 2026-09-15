import React, { useMemo } from 'react';
import type { TAttachment, UIResource } from 'librechat-data-provider';
import { useMCPAppsHost } from '~/Providers/MCPAppsPolicyContext';
import { selectToolCallUIResources } from '~/utils/mcpApps';
import { useAppBridge, useMCPAppFrame } from '~/hooks/MCP';
import { MCPAppFrame } from './MCPAppFrame';
import { useLocalize } from '~/hooks';

const DEFAULT_APP_VIEW_HEIGHT = 320;

const MCPAppView = React.memo(function MCPAppView({
  app,
  userId,
}: {
  app: UIResource;
  userId: string;
}) {
  const localize = useLocalize();
  const frame = useMCPAppFrame(app, {
    defaultHeight: DEFAULT_APP_VIEW_HEIGHT,
    toolArgs: app.toolArgs,
  });

  useAppBridge({
    iframeRef: frame.iframeRef,
    resource: app,
    toolArgs: frame.toolArgs,
    toolResult: frame.toolResult,
    userId,
    attempt: frame.attempt,
    active: frame.active,
    onSizeChanged: frame.onSizeChanged,
    onLoaded: frame.onLoaded,
    onTeardown: frame.onTeardown,
    onFailed: frame.onFailed,
  });

  if (frame.status === 'tornDown') {
    return null;
  }
  if (frame.kind === 'unavailable') {
    return (
      <div className="my-2 flex items-center gap-2 rounded-lg border border-border-light bg-surface-secondary px-4 py-3 text-sm text-text-secondary">
        {localize('com_ui_mcp_app_shared_unavailable')}
      </div>
    );
  }
  return (
    <div className="relative my-2 overflow-hidden" style={{ height: frame.height }}>
      <MCPAppFrame frame={frame} resource={app} spinner />
    </div>
  );
});

export function MCPAppViews({ attachments }: { attachments?: TAttachment[] }) {
  const { policy, userId } = useMCPAppsHost();
  const apps = useMemo(() => selectToolCallUIResources(attachments), [attachments]);

  if (!policy.enabled || !userId || apps.length === 0) {
    return null;
  }

  return (
    <>
      {apps.map(({ key, resource }) => (
        <MCPAppView key={JSON.stringify([userId, key])} app={resource} userId={userId} />
      ))}
    </>
  );
}
