import { useMemo, useState, useEffect, useCallback } from 'react';
import { useRecoilValue } from 'recoil';
import { Button } from '@librechat/client';
import { TriangleAlert } from 'lucide-react';
import {
  Constants,
  dataService,
  actionDelimiter,
  actionDomainSeparator,
  splitToolCallName,
} from 'librechat-data-provider';
import type { TAttachment, PartMetadata } from 'librechat-data-provider';
import { useLocalize, useProgress, useExpandCollapse, useLazyCollapseBody } from '~/hooks';
import { ToolIcon, getToolIconType, isError } from './ToolOutput';
import { useMCPIconMap, useMCPServerNames } from '~/hooks/MCP';
import { resolveToolCallPhase } from '~/utils/toolCallPhase';
import { useToolCallIntent } from './Parts/intent';
import { AttachmentGroup } from './Parts';
import ToolCallInfo from './ToolCallInfo';
import ProgressText from './ProgressText';
import { logger } from '~/utils';
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
  runStepStatus,
  runStepDurationMs,
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
  runStepStatus?: PartMetadata['runStepStatus'];
  runStepDurationMs?: PartMetadata['runStepDurationMs'];
}) {
  const localize = useLocalize();
  const autoExpand = useRecoilValue(store.autoExpandTools);
  const hasOutput = (output?.length ?? 0) > 0;
  const [showInfo, setShowInfo] = useState(() => autoExpand && hasOutput);
  const { style: expandStyle, ref: expandRef } = useExpandCollapse(showInfo);
  const { shouldRenderBody, mountBody, handleTransitionEnd } = useLazyCollapseBody(showInfo);

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

  const hasError = (typeof output === 'string' && isError(output)) || runStepStatus === 'failed';
  /**
   * The step's own terminal status wins when the run emitted one. The
   * `isSubmitting` heuristic below it is a whole-message inference: it cannot
   * tell which step actually stopped, so it holds every unfinished call in a
   * running state until the entire response ends and then flips them all to
   * cancelled at once. Retained as the fallback for messages saved before
   * `on_run_step_closed` and for endpoints that do not emit it.
   *
   * The status is authoritative on its own terms — deliberately not gated on
   * `hasError`, so output parsing cannot demote a stopped step back into an
   * in-flight state.
   */
  const isClosed = runStepStatus != null;

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

  /**
   * Both halves are load-bearing: passing 1 in stops `useProgress` scheduling
   * its 200ms interval, and masking the result makes the terminal value
   * observable on the same render rather than after the hook settles.
   */
  const rawProgress = useProgress(isClosed ? 1 : initialProgress);
  /**
   * One resolution, read by the label, the live region, the icon and the
   * shimmer alike. It also unifies two inputs that had drifted apart: the
   * cancellation inference read `initialProgress` while the label read the
   * animated `rawProgress`.
   */
  const phase = resolveToolCallPhase({
    runStepStatus,
    displayProgress: rawProgress,
    reportedProgress: initialProgress,
    isSubmitting,
    hasError,
  });

  const handleToggleInfo = useCallback(() => {
    mountBody();
    setShowInfo((prev) => {
      const next = !prev;
      if (next) {
        onExpand?.();
      }
      return next;
    });
  }, [mountBody, onExpand]);

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
    if (phase === 'cancelled') {
      return localize('com_ui_cancelled');
    }
    /**
     * Announced before the completion strings below: a terminal step that
     * errored must not reach the live region as "completed", which would tell
     * a screen-reader user the opposite of what the card shows.
     */
    if (phase === 'failed') {
      return function_name
        ? `${localize('com_ui_failed')}: ${function_name}`
        : localize('com_ui_failed');
    }
    if (intent != null) {
      return intent;
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
      {/* The live region gets a STABLE in-progress value: the streaming
          intent grows on every delta, and an atomic polite region would
          re-announce the whole sentence each time. The settled intent is
          announced once via getFinishedText. */}
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {(() => {
          if (phase === 'running') {
            return function_name
              ? localize('com_assistants_running_var', { 0: function_name })
              : localize('com_assistants_running_action');
          }
          return getFinishedText();
        })()}
      </span>
      <div
        className="relative my-1.5 flex h-5 shrink-0 items-center gap-2.5"
        data-testid="tool-call"
        data-tool-call-id={toolCallId}
      >
        <ProgressText
          phase={phase}
          onClick={handleToggleInfo}
          inProgressText={
            intent ??
            (function_name
              ? localize('com_assistants_running_var', { 0: function_name })
              : localize('com_assistants_running_action'))
          }
          authText={
            phase === 'running' && authDomain.length > 0
              ? localize('com_ui_requires_auth')
              : undefined
          }
          finishedText={getFinishedText()}
          subtitle={subtitle}
          durationMs={runStepDurationMs}
          icon={
            <ToolIcon type={toolIconType} iconUrl={mcpIconUrl} isAnimating={phase === 'running'} />
          }
          hasInput={hasInfo}
          isExpanded={showInfo}
        />
      </div>
      <div
        style={expandStyle}
        onTransitionEnd={handleTransitionEnd}
        data-tool-call-output-id={toolCallId}
      >
        <div className="overflow-hidden" ref={expandRef}>
          {hasInfo && shouldRenderBody && (
            <div className="my-2 overflow-hidden rounded-lg border border-border-light bg-surface-secondary">
              <ToolCallInfo input={args ?? ''} output={output} attachments={attachments} />
            </div>
          )}
        </div>
      </div>
      {auth != null && auth && phase === 'running' && (
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
    </>
  );
}
