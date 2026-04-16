import { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import copy from 'copy-to-clipboard';
import type { TAttachment } from 'librechat-data-provider';
import ProgressText from '~/components/Chat/Messages/Content/ProgressText';
import CopyButton from '~/components/Messages/Content/CopyButton';
import LangIcon from '~/components/Messages/Content/LangIcon';
import { ERROR_PATTERNS } from './ExecuteCode';
import useToolCallState from './useToolCallState';
import useLazyHighlight from './useLazyHighlight';
import { AttachmentGroup } from './Attachment';
import parseJsonField from './parseJsonField';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

export default function BashCall({
  isSubmitting,
  initialProgress = 0.1,
  args,
  output = '',
  attachments,
}: {
  initialProgress: number;
  isSubmitting: boolean;
  args?: string | Record<string, unknown>;
  output?: string;
  attachments?: TAttachment[];
}) {
  const localize = useLocalize();
  const command = useMemo(() => parseJsonField(args, 'command'), [args]);

  const { showCode, toggleCode, expandStyle, expandRef, progress, cancelled, hasError, hasOutput } =
    useToolCallState(initialProgress, isSubmitting, output, !!command);

  const highlighted = useLazyHighlight(command || undefined, 'bash');
  const outputHasError = useMemo(() => ERROR_PATTERNS.test(output), [output]);

  const [isCopied, setIsCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timerRef.current), []);

  const handleCopy = useCallback(() => {
    setIsCopied(true);
    copy(command, { format: 'text/plain' });
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setIsCopied(false), 3000);
  }, [command]);

  return (
    <>
      <div className="relative my-1.5 flex size-5 shrink-0 items-center gap-2.5">
        <ProgressText
          progress={progress}
          onClick={toggleCode}
          inProgressText={localize('com_ui_running_command')}
          finishedText={
            cancelled ? localize('com_ui_cancelled') : localize('com_ui_command_finished')
          }
          errorSuffix={hasError && !cancelled ? localize('com_ui_tool_failed') : undefined}
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
            {hasOutput && (
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
      {attachments && attachments.length > 0 && <AttachmentGroup attachments={attachments} />}
    </>
  );
}
