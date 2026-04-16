import { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { SquareTerminal } from 'lucide-react';
import copy from 'copy-to-clipboard';
import type { TAttachment } from 'librechat-data-provider';
import ProgressText from '~/components/Chat/Messages/Content/ProgressText';
import CopyButton from '~/components/Messages/Content/CopyButton';
import { ERROR_PATTERNS } from './ExecuteCode';
import useToolCallState from './useToolCallState';
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

  const { showCode, toggleCode, expandStyle, expandRef, progress, cancelled, hasOutput } =
    useToolCallState(initialProgress, isSubmitting, output, !!command);

  const outputHasError = useMemo(() => ERROR_PATTERNS.test(output), [output]);

  const [isCopied, setIsCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timerRef.current), []);

  const handleCopy = useCallback(() => {
    setIsCopied(true);
    copy(command.trim(), { format: 'text/plain' });
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
          icon={
            <SquareTerminal
              className={cn(
                'size-4 shrink-0 text-text-secondary',
                progress < 1 && !cancelled && 'animate-pulse',
              )}
              aria-hidden="true"
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
              <div className="flex items-start justify-between bg-surface-tertiary px-3 py-2.5 dark:bg-gray-950">
                <pre className="max-h-[300px] flex-1 overflow-auto whitespace-pre-wrap break-words font-mono text-xs">
                  <span className="select-none text-text-tertiary" aria-hidden="true">
                    {'$ '}
                  </span>
                  <span className="text-text-primary">{command}</span>
                </pre>
                <CopyButton
                  iconOnly
                  isCopied={isCopied}
                  onClick={handleCopy}
                  className="ml-2 shrink-0"
                  label={localize('com_ui_copy_code')}
                />
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
