import React, { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { Button } from '@librechat/client';
import type { TAttachment, UIResource } from 'librechat-data-provider';
import { MCPAppApproval, useMCPAppApproval } from '~/hooks/MCP/approval';
import { useMCPAppsHost } from '~/Providers/MCPAppsPolicyContext';
import { selectToolCallUIResources } from '~/utils/mcpApps';
import { useAppBridge, useMCPAppFrame } from '~/hooks/MCP';
import { MCPAppFrame } from './MCPAppFrame';
import { useLocalize } from '~/hooks';

const DEFAULT_APP_VIEW_HEIGHT = 320;

/**
 * Attachments rendered by a stable ancestor. Presentation components may still receive those
 * attachments for files, search rows, and outcome metadata; only their duplicate App view stands
 * down. Object identity keeps independently owned nested attachments visible.
 */
export const MCPAppSuppressionContext = React.createContext<ReadonlySet<TAttachment> | null>(null);

function ActiveMCPAppView({
  app,
  userId,
  close,
}: {
  app: UIResource;
  userId: string;
  close: () => void;
}) {
  const localize = useLocalize();
  const approval = useMCPAppApproval();
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
    onRequestAction: approval.request,
    onCancelAction: approval.cancel,
    attempt: frame.attempt,
    active: frame.active,
    onSizeChanged: frame.onSizeChanged,
    onLoaded: frame.onLoaded,
    onTeardown: () => {
      approval.cancel();
      close();
    },
    onFailed: frame.onFailed,
  });

  let body: React.ReactNode = null;
  if (frame.kind === 'unavailable') {
    body = (
      <div className="border-border-light bg-surface-secondary text-text-secondary my-2 flex items-center gap-2 rounded-lg border px-4 py-3 text-sm">
        {localize('com_ui_mcp_app_shared_unavailable')}
      </div>
    );
  } else if (frame.status !== 'tornDown') {
    body = (
      <div className="relative my-2 overflow-hidden" style={{ height: frame.height }}>
        <MCPAppFrame frame={frame} resource={app} spinner />
      </div>
    );
  }
  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={close}>
        {localize('com_ui_mcp_app_close')}
      </Button>
      {body}
      <MCPAppApproval
        action={approval.pending}
        approve={approval.approve}
        cancel={approval.cancel}
      />
    </>
  );
}

const MCPAppView = React.memo(function MCPAppView({
  app,
  userId,
}: {
  app: UIResource;
  userId: string;
}) {
  const localize = useLocalize();
  const { reserveView, releaseView } = useMCPAppsHost();
  const viewKey = useId();
  const [opened, setOpened] = useState(false);
  const [atCapacity, setAtCapacity] = useState(false);
  const close = useCallback(() => {
    releaseView(viewKey);
    setOpened(false);
    setAtCapacity(false);
  }, [releaseView, viewKey]);
  useEffect(
    () => () => {
      releaseView(viewKey);
    },
    [releaseView, viewKey],
  );
  const open = () => {
    const reserved = reserveView(viewKey);
    if (!reserved) {
      setAtCapacity(true);
      return;
    }
    setAtCapacity(false);
    setOpened(true);
  };
  return (
    <div className="my-2" data-mcp-app-view={app.toolName}>
      {opened ? (
        <ActiveMCPAppView app={app} userId={userId} close={close} />
      ) : (
        <div className="border-border-light bg-surface-secondary text-text-secondary flex min-h-16 items-center gap-3 rounded-lg border px-4 py-3 text-sm">
          <span className="min-w-0 flex-1 truncate">{app.toolName}</span>
          <Button type="button" variant="outline" size="sm" onClick={open}>
            {localize('com_ui_mcp_app_open')}
          </Button>
          {atCapacity && <span role="alert">{localize('com_ui_mcp_app_at_capacity')}</span>}
        </div>
      )}
    </div>
  );
});

export function MCPAppViews({ attachments }: { attachments?: TAttachment[] }) {
  const suppressedAttachments = React.useContext(MCPAppSuppressionContext);
  const { policy, userId } = useMCPAppsHost();
  const visibleAttachments = useMemo(
    () =>
      suppressedAttachments == null
        ? attachments
        : attachments?.filter((attachment) => !suppressedAttachments.has(attachment)),
    [attachments, suppressedAttachments],
  );
  const apps = useMemo(() => selectToolCallUIResources(visibleAttachments), [visibleAttachments]);

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
