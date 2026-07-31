import { useMemo, useState, useEffect, useCallback } from 'react';
import { useRecoilValue } from 'recoil';
import { Button } from '@librechat/client';
import {
  Constants,
  dataService,
  actionDelimiter,
  actionDomainSeparator,
  splitToolCallName,
} from 'librechat-data-provider';
import type { TAttachment } from 'librechat-data-provider';
import { useLocalize, useProgress, useExpandCollapse } from '~/hooks';
import { ToolIcon, getToolIconType, isError } from './ToolOutput';
import { cn, getToolDisplayLabel, logger } from '~/utils';
import { toolPanelSpacingClassName } from './disclosure';
import { useMCPIconMap, useMCPServerNames } from '~/hooks/MCP';
import { useToolCallIntent } from './Parts/intent';
import { AttachmentGroup } from './Parts';
import ToolCallInfo from './ToolCallInfo';
import ProgressText from './ProgressText';
import { ToolAuthWarning } from './auth';
import store from '~/store';

export default function ToolCall({
  initialProgress = 0.1,
  isLast = false,
  isSubmitting,
  toolCallId,
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
  toolCallId?: string;
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

  const mcpServerNames = useMCPServerNames();
  const { function_name, domain, isMCPToolCall, mcpServerName } = useMemo(() => {
    if (typeof name !== 'string') {
      return { function_name: '', domain: null, isMCPToolCall: false, mcpServerName: '' };
    }
    if (name.includes(Constants.mcp_delimiter)) {
      const [func, server = ''] = splitToolCallName(name, mcpServerNames);
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
  }, [name, parsedAuthUrl, mcpServerNames]);

  const toolIconType = useMemo(() => getToolIconType(name), [name]);
  const displayFunctionName = useMemo(
    () => getToolDisplayLabel(function_name, localize, mcpServerNames),
    [function_name, localize, mcpServerNames],
  );
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

  /** Model-authored live label, streamed as the first args key (injected by
   *  the `tool_intents` capability); persists as the settled label —
   *  completion is a UI state, not a tense change. */
  const intent = useToolCallIntent(_args);

  const getFinishedText = () => {
    if (cancelled) {
      return localize('com_ui_cancelled');
    }
    if (intent != null) {
      return intent;
    }
    if (isMCPToolCall === true) {
      return localize('com_assistants_completed_function', { 0: displayFunctionName });
    }
    if (domain != null && domain && domain.length !== Constants.ENCODED_DOMAIN_LENGTH) {
      return localize('com_assistants_completed_action', { 0: domain });
    }
    return localize('com_assistants_completed_function', { 0: displayFunctionName });
  };

  if (!isLast && (!function_name || function_name.length === 0) && !output) {
    return null;
  }

  return (
    <>
      {/* The live region gets a STABLE in-progress value: the streaming
          intent grows on every delta, and an atomic polite region would
          re-announce the whole sentence each time. The settled intent is
          announced once via getFinishedText. */}
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {(() => {
          if (progress < 1 && !showCancelled) {
            return displayFunctionName
              ? localize('com_assistants_running_var', { 0: displayFunctionName })
              : localize('com_assistants_running_action');
          }
          return getFinishedText();
        })()}
      </span>
      <div
        className="relative my-1 flex h-5 shrink-0 items-center gap-2.5"
        data-testid="tool-call"
        data-tool-call-id={toolCallId}
      >
        <ProgressText
          progress={progress}
          onClick={handleToggleInfo}
          inProgressText={
            intent ??
            (displayFunctionName
              ? localize('com_assistants_running_var', { 0: displayFunctionName })
              : localize('com_assistants_running_action'))
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
      <div style={expandStyle} data-tool-call-output-id={toolCallId}>
        <div className="overflow-hidden" ref={expandRef}>
          {hasInfo && (
            <div
              className={cn(
                toolPanelSpacingClassName,
                'overflow-hidden rounded-lg border border-border-light bg-surface-secondary',
              )}
            >
              <ToolCallInfo input={args ?? ''} output={output} attachments={attachments} />
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
          <ToolAuthWarning />
        </div>
      )}
      {!hideAttachments && attachments && attachments.length > 0 && (
        <AttachmentGroup attachments={attachments} />
      )}
    </>
  );
}
