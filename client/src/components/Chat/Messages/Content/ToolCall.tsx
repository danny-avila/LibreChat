import React, { useRef, useMemo, useState, useEffect, useCallback } from 'react';
import { useRecoilValue } from 'recoil';
import { Button } from '@librechat/client';
import { TriangleAlert } from 'lucide-react';
import {
  Constants,
  Tools,
  dataService,
  actionDelimiter,
  actionDomainSeparator,
} from 'librechat-data-provider';
import type { TAttachment, UIResource } from 'librechat-data-provider';
import { useLocalize, useProgress, useExpandCollapse } from '~/hooks';
import { ToolIcon, getToolIconType, isError } from './ToolOutput';
import { useMCPIconMap, useAppBridge } from '~/hooks/MCP';
import { getMCPSandboxUrl } from '~/utils/mcpApps';
import { AttachmentGroup } from './Parts';
import ToolCallInfo from './ToolCallInfo';
import ProgressText from './ProgressText';
import { logger } from '~/utils';
import store from '~/store';

const SPINNER_TIMEOUT_MS = 10_000;

const MCPAppView = React.memo(function MCPAppView({
  app,
  args,
}: {
  app: UIResource;
  args: string | Record<string, unknown>;
}) {
  const localize = useLocalize();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState<number | undefined>(undefined);
  const [loaded, setLoaded] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const sandboxUrl = useMemo(() => getMCPSandboxUrl(), []);

  useEffect(() => {
    if (loaded) return;
    const timer = setTimeout(() => setTimedOut(true), SPINNER_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [loaded]);

  const toolArgs = useMemo(() => {
    try {
      return typeof args === 'string' ? JSON.parse(args) : args;
    } catch {
      return undefined;
    }
  }, [args]);

  const toolResult = useMemo(() => {
    const sc = app.structuredContent as Record<string, unknown> | undefined | null;
    const content = (app.content as [] | undefined) ?? [];
    if ((!sc || typeof sc !== 'object' || Array.isArray(sc)) && content.length === 0)
      return undefined;
    return {
      content,
      ...(sc && typeof sc === 'object' && !Array.isArray(sc) ? { structuredContent: sc } : {}),
    };
  }, [app.structuredContent, app.content]);

  const handleSizeChanged = useCallback((params: { height?: number; width?: number }) => {
    if (params.height && params.height > 0) {
      setHeight(params.height);
      setLoaded(true);
    }
  }, []);

  useAppBridge(iframeRef, app, toolArgs, toolResult, handleSizeChanged);

  return (
    <div className="my-2" style={height ? { height } : { minHeight: 100 }}>
      {!loaded && !timedOut && (
        <div className="flex items-center gap-2 rounded-lg border border-border-light bg-surface-secondary px-4 py-3 text-sm text-text-secondary">
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          {localize('com_ui_loading_interactive_view')}
        </div>
      )}
      {timedOut && !loaded && (
        <div className="flex items-center gap-2 rounded-lg border border-border-light bg-surface-secondary px-4 py-3 text-sm text-text-secondary">
          {localize('com_ui_mcp_app_failed_to_load')}
        </div>
      )}
      <iframe
        ref={iframeRef}
        data-sandbox-url={sandboxUrl}
        sandbox="allow-scripts allow-forms"
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          display: loaded ? 'block' : 'none',
        }}
        title={`MCP App: ${app.toolName ?? ''}`}
      />
    </div>
  );
});

export default function ToolCall({
  initialProgress = 0.1,
  isLast = false,
  isSubmitting,
  name,
  args: _args = '',
  output,
  attachments,
  auth,
  hideAttachments = false,
  onExpand,
}: {
  initialProgress: number;
  isLast?: boolean;
  isSubmitting: boolean;
  name: string;
  args: string | Record<string, unknown>;
  output?: string | null;
  attachments?: TAttachment[];
  auth?: string;
  hideAttachments?: boolean;
  onExpand?: () => void;
}) {
  const localize = useLocalize();
  const autoExpand = useRecoilValue(store.autoExpandTools);
  const hasOutput = (output?.length ?? 0) > 0;
  const [showInfo, setShowInfo] = useState(() => autoExpand && hasOutput);
  const { style: expandStyle, ref: expandRef } = useExpandCollapse(showInfo);

  useEffect(() => {
    if (autoExpand && hasOutput) {
      setShowInfo(true);
    }
  }, [autoExpand, hasOutput]);

  const parsedAuthUrl = useMemo(() => {
    if (!auth) {
      return null;
    }
    try {
      return new URL(auth);
    } catch {
      return null;
    }
  }, [auth]);

  const { function_name, domain, isMCPToolCall, mcpServerName } = useMemo(() => {
    if (typeof name !== 'string') {
      return { function_name: '', domain: null, isMCPToolCall: false, mcpServerName: '' };
    }
    if (name.includes(Constants.mcp_delimiter)) {
      const parts = name.split(Constants.mcp_delimiter);
      const func = parts[0];
      const server = parts.slice(1).join(Constants.mcp_delimiter);
      const displayName = func === 'oauth' ? server : func;
      return {
        function_name: displayName || '',
        domain: server && (server.replaceAll(actionDomainSeparator, '.') || null),
        isMCPToolCall: true,
        mcpServerName: server || '',
      };
    }

    if (parsedAuthUrl) {
      const redirectUri = parsedAuthUrl.searchParams.get('redirect_uri') || '';
      const mcpMatch = redirectUri.match(/\/api\/mcp\/([^/]+)\/oauth\/callback/);
      if (mcpMatch?.[1]) {
        return {
          function_name: mcpMatch[1],
          domain: null,
          isMCPToolCall: true,
          mcpServerName: mcpMatch[1],
        };
      }
    }

    const [func, _domain] = name.includes(actionDelimiter)
      ? name.split(actionDelimiter)
      : [name, ''];
    return {
      function_name: func || '',
      domain: _domain && (_domain.replaceAll(actionDomainSeparator, '.') || null),
      isMCPToolCall: false,
      mcpServerName: '',
    };
  }, [name, parsedAuthUrl]);

  const toolIconType = useMemo(() => getToolIconType(name), [name]);
  const mcpIconMap = useMCPIconMap();
  const mcpIconUrl = isMCPToolCall ? mcpIconMap.get(mcpServerName) : undefined;

  const actionId = useMemo(() => {
    if (isMCPToolCall || !parsedAuthUrl) {
      return '';
    }
    const redirectUri = parsedAuthUrl.searchParams.get('redirect_uri') || '';
    const match = redirectUri.match(/\/api\/actions\/([^/]+)\/oauth\/callback/);
    return match?.[1] || '';
  }, [parsedAuthUrl, isMCPToolCall]);

  const handleOAuthClick = useCallback(async () => {
    if (!auth) {
      return;
    }
    try {
      if (isMCPToolCall && mcpServerName) {
        await dataService.bindMCPOAuth(mcpServerName);
      } else if (actionId) {
        await dataService.bindActionOAuth(actionId);
      }
    } catch (e) {
      logger.error('Failed to bind OAuth CSRF cookie', e);
    }
    window.open(auth, '_blank', 'noopener,noreferrer');
  }, [auth, isMCPToolCall, mcpServerName, actionId]);

  const hasError = typeof output === 'string' && isError(output);
  const cancelled = !isSubmitting && initialProgress < 1 && !hasError;
  const errorState = hasError;

  const args = useMemo(() => {
    if (typeof _args === 'string') {
      return _args;
    }
    try {
      return JSON.stringify(_args, null, 2);
    } catch (e) {
      logger.error(
        'client/src/components/Chat/Messages/Content/ToolCall.tsx - Failed to stringify args',
        e,
      );
      return '';
    }
  }, [_args]) as string | undefined;

  const hasInfo = useMemo(
    () => (args?.length ?? 0) > 0 || (output?.length ?? 0) > 0,
    [args, output],
  );

  const mcpApp = useMemo(() => {
    const uiResources: UIResource[] =
      attachments
        ?.filter((a) => a.type === Tools.ui_resources)
        .flatMap((a) => (a[Tools.ui_resources] ?? []) as UIResource[]) ?? [];
    return uiResources.find((r) => r.toolName && r.serverName && !r.text) ?? null;
  }, [attachments]);

  const authDomain = useMemo(() => {
    return parsedAuthUrl?.hostname ?? '';
  }, [parsedAuthUrl]);

  const progress = useProgress(initialProgress);
  const showCancelled = cancelled || (errorState && !output);

  const handleToggleInfo = useCallback(() => {
    setShowInfo((prev) => {
      const next = !prev;
      if (next) {
        onExpand?.();
      }
      return next;
    });
  }, [onExpand]);

  const subtitle = useMemo(() => {
    if (isMCPToolCall && mcpServerName) {
      return localize('com_ui_via_server', { 0: mcpServerName });
    }
    if (domain && domain.length !== Constants.ENCODED_DOMAIN_LENGTH) {
      return localize('com_ui_via_server', { 0: domain });
    }
    return undefined;
  }, [isMCPToolCall, mcpServerName, domain, localize]);

  const getFinishedText = () => {
    if (cancelled) {
      return localize('com_ui_cancelled');
    }
    if (isMCPToolCall === true) {
      return localize('com_assistants_completed_function', { 0: function_name });
    }
    if (domain != null && domain && domain.length !== Constants.ENCODED_DOMAIN_LENGTH) {
      return localize('com_assistants_completed_action', { 0: domain });
    }
    return localize('com_assistants_completed_function', { 0: function_name });
  };

  if (!isLast && (!function_name || function_name.length === 0) && !output) {
    return null;
  }

  return (
    <>
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {(() => {
          if (progress < 1 && !showCancelled) {
            return function_name
              ? localize('com_assistants_running_var', { 0: function_name })
              : localize('com_assistants_running_action');
          }
          return getFinishedText();
        })()}
      </span>
      <div className="relative my-1.5 flex h-5 shrink-0 items-center gap-2.5">
        <ProgressText
          progress={progress}
          onClick={handleToggleInfo}
          inProgressText={
            function_name
              ? localize('com_assistants_running_var', { 0: function_name })
              : localize('com_assistants_running_action')
          }
          authText={
            !showCancelled && authDomain.length > 0 ? localize('com_ui_requires_auth') : undefined
          }
          finishedText={getFinishedText()}
          subtitle={subtitle}
          errorSuffix={errorState && !cancelled ? localize('com_ui_tool_failed') : undefined}
          icon={
            <ToolIcon
              type={toolIconType}
              iconUrl={mcpIconUrl}
              isAnimating={progress < 1 && !showCancelled && !errorState}
            />
          }
          hasInput={hasInfo}
          isExpanded={showInfo}
          error={showCancelled}
        />
      </div>
      <div style={expandStyle}>
        <div className="overflow-hidden" ref={expandRef}>
          {hasInfo && (
            <div className="my-2 overflow-hidden rounded-lg border border-border-light bg-surface-secondary">
              <ToolCallInfo input={args ?? ''} output={output} />
            </div>
          )}
        </div>
      </div>
      {auth != null && auth && progress < 1 && !showCancelled && (
        <div className="flex w-full flex-col gap-2.5">
          <div className="mb-1 mt-2">
            <Button
              className="inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium"
              variant="default"
              rel="noopener noreferrer"
              onClick={handleOAuthClick}
            >
              {localize('com_ui_sign_in_to_domain', { 0: authDomain })}
            </Button>
          </div>
          <p className="flex items-center text-xs text-text-warning">
            <TriangleAlert className="mr-1.5 inline-block h-4 w-4" aria-hidden="true" />
            {localize('com_assistants_allow_sites_you_trust')}
          </p>
        </div>
      )}
      {!hideAttachments && attachments && attachments.length > 0 && (
        <AttachmentGroup attachments={attachments} />
      )}
      {mcpApp && hasOutput && <MCPAppView key={mcpApp.resourceId} app={mcpApp} args={_args} />}
    </>
  );
}
