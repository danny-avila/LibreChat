import { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import copy from 'copy-to-clipboard';
import { useRecoilValue } from 'recoil';
import type { TAttachment } from 'librechat-data-provider';
import { parseBackgroundHandle, splitBackgroundAttachments } from './handle';
import ProgressText from '~/components/Chat/Messages/Content/ProgressText';
import parseJsonField, { areToolCallArgsComplete } from './parseJsonField';
import CopyButton from '~/components/Messages/Content/CopyButton';
import LangIcon from '~/components/Messages/Content/LangIcon';
import { sandboxStartingByToolCallId } from '~/store';
import useToolCallState from './useToolCallState';
import useLazyHighlight from './useLazyHighlight';
import { ERROR_PATTERNS } from './ExecuteCode';
import { AttachmentGroup } from './Attachment';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

export default function BashCall({
  isSubmitting,
  initialProgress = 0.1,
  args,
  output = '',
  attachments,
  commandField = 'command',
  hideAttachments = false,
  onExpand,
  toolCallId,
}: {
  initialProgress: number;
  isSubmitting: boolean;
  args?: string | Record<string, unknown>;
  output?: string;
  attachments?: TAttachment[];
  commandField?: string;
  hideAttachments?: boolean;
  onExpand?: () => void;
  toolCallId?: string;
}) {
  const localize = useLocalize();
  const command = useMemo(() => parseJsonField(args, commandField), [args, commandField]);
  const isWritingCommand = !command || !areToolCallArgsComplete(args);
  const sandboxStarting = useRecoilValue(sandboxStartingByToolCallId(toolCallId ?? ''));

  const { showCode, toggleCode, expandStyle, expandRef, progress, cancelled, hasError, hasOutput } =
    useToolCallState(initialProgress, isSubmitting, output, !!command, onExpand);

  const highlighted = useLazyHighlight(command || undefined, 'bash');
  const outputHasError = useMemo(() => ERROR_PATTERNS.test(output), [output]);
  /** A backgrounded call's persisted output stays the dispatch handle until
   *  the detached run settles and patches it; render a background state
   *  instead of the handle JSON. Completion arrives live as the status marker
   *  attachment (also covers stdout-only runs) or as harvested files. */
  const backgroundHandle = useMemo(() => parseBackgroundHandle(output), [output]);
  const { fileAttachments, backgroundStatus } = useMemo(
    () => splitBackgroundAttachments(attachments, toolCallId),
    [attachments, toolCallId],
  );
  const backgroundFailed = backgroundHandle != null && backgroundStatus === 'error';
  const backgroundFinishedText = backgroundHandle
    ? localize(
        backgroundStatus != null || (fileAttachments?.length ?? 0) > 0
          ? 'com_ui_background_finished'
          : 'com_ui_background_running',
      )
    : null;

  const [isCopied, setIsCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timerRef.current), []);

  const handleCopy = useCallback(() => {
    setIsCopied(true);
    copy(command, { format: 'text/plain' });
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setIsCopied(false), 3000);
  }, [command]);

  const inProgressText = (() => {
    if (isWritingCommand) {
      return localize('com_ui_writing_command');
    }
    if (sandboxStarting) {
      return localize('com_ui_sandbox_starting');
    }
    return localize('com_ui_running_command');
  })();

  return (
    <>
      <div className="relative my-1.5 flex size-5 shrink-0 items-center gap-2.5">
        <ProgressText
          progress={progress}
          onClick={toggleCode}
          inProgressText={inProgressText}
          finishedText={
            cancelled
              ? localize('com_ui_cancelled')
              : (backgroundFinishedText ?? localize('com_ui_command_finished'))
          }
          errorSuffix={
            (hasError && !cancelled) || backgroundFailed
              ? localize('com_ui_tool_failed')
              : undefined
          }
          icon={
            <LangIcon
              lang="bash"
              className={cn(
                'size-4 shrink-0 text-text-secondary',
                progress < 1 && !cancelled && !hasError && 'animate-pulse',
              )}
            />
          }
          hasInput={!!command || hasOutput}
          isExpanded={showCode}
          error={cancelled}
        />
      </div>
      <div style={expandStyle}>
        <div className="overflow-hidden" ref={expandRef}>
          <div className="my-2 overflow-hidden rounded-lg border border-border-light">
            {command && (
              <div className="relative max-h-[300px] overflow-auto bg-surface-tertiary dark:bg-gray-950">
                <CopyButton
                  iconOnly
                  isCopied={isCopied}
                  onClick={handleCopy}
                  className="sticky right-0 top-1 float-right mr-1.5 mt-1"
                  label={localize('com_ui_copy_code')}
                />
                <pre className="whitespace-pre-wrap break-words px-3 py-2.5 pr-10 font-mono text-xs">
                  <span className="select-none text-text-tertiary" aria-hidden="true">
                    {'$ '}
                  </span>
                  <code className="hljs language-bash">{highlighted ?? command}</code>
                </pre>
              </div>
            )}
            {hasOutput && backgroundHandle == null && (
              <div className={cn(command && 'border-t border-border-light')}>
                <pre
                  className={cn(
                    'max-h-[300px] overflow-auto whitespace-pre-wrap break-words px-3 py-2.5 font-mono text-xs',
                    outputHasError ? 'text-red-600 dark:text-red-400' : 'text-text-primary',
                  )}
                >
                  {output}
                </pre>
              </div>
            )}
          </div>
        </div>
      </div>
      {!hideAttachments && fileAttachments && fileAttachments.length > 0 && (
        <AttachmentGroup attachments={fileAttachments} />
      )}
    </>
  );
}
