import { useMemo } from 'react';
import { SquareTerminal } from 'lucide-react';
import type { TAttachment } from 'librechat-data-provider';
import ProgressText from '~/components/Chat/Messages/Content/ProgressText';
import { ERROR_PATTERNS } from './ExecuteCode';
import useToolCallState from './useToolCallState';
import useLazyHighlight from './useLazyHighlight';
import CodeWindowHeader from './CodeWindowHeader';
import { AttachmentGroup } from './Attachment';
import parseJsonField from './parseJsonField';
import { useLocalize } from '~/hooks';
import Stdout from './Stdout';
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

  const highlighted = useLazyHighlight(command || undefined, 'bash');
  const outputHasError = useMemo(() => ERROR_PATTERNS.test(output), [output]);

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
          <div className="my-2 overflow-hidden rounded-lg border border-border-light bg-surface-secondary">
            {command && <CodeWindowHeader language="bash" code={command} />}
            {command && (
              <pre className="max-h-[300px] overflow-auto bg-surface-chat p-4 font-mono text-xs dark:bg-surface-primary-alt">
                <code className="hljs language-bash !whitespace-pre">{highlighted}</code>
              </pre>
            )}
            {hasOutput && (
              <div
                className={cn(
                  'bg-surface-primary-alt p-4 text-xs dark:bg-transparent',
                  command && 'border-t border-border-light',
                )}
              >
                <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-text-secondary">
                  {localize('com_ui_output')}
                </div>
                <div
                  className={cn(
                    'max-h-[200px] overflow-auto',
                    outputHasError ? 'text-red-600 dark:text-red-400' : 'text-text-primary',
                  )}
                >
                  <Stdout output={output} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      {attachments && attachments.length > 0 && <AttachmentGroup attachments={attachments} />}
    </>
  );
}
