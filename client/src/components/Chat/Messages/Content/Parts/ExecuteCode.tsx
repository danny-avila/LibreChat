import { useMemo } from 'react';
import { SquareTerminal } from 'lucide-react';
import type { TAttachment } from 'librechat-data-provider';
import ProgressText from '~/components/Chat/Messages/Content/ProgressText';
import useLazyHighlight from './useLazyHighlight';
import useToolCallState from './useToolCallState';
import CodeWindowHeader from './CodeWindowHeader';
import { AttachmentGroup } from './Attachment';
import { useLocalize } from '~/hooks';
import Stdout from './Stdout';
import { cn } from '~/utils';

interface ParsedArgs {
  lang?: string;
  code?: string;
}

export function useParseArgs(args?: string | Record<string, unknown>): ParsedArgs | null {
  return useMemo(() => {
    if (typeof args === 'object' && args !== null) {
      return { lang: String(args.lang ?? ''), code: String(args.code ?? '') };
    }
    let parsedArgs: ParsedArgs | string | undefined | null = args;
    try {
      parsedArgs = JSON.parse(args || '');
    } catch {
      // console.error('Failed to parse args:', e);
    }
    if (typeof parsedArgs === 'object') {
      return parsedArgs;
    }
    const langMatch = args?.match(/"lang"\s*:\s*"(\w+)"/);
    const codeMatch = args?.match(/"code"\s*:\s*"(.+?)(?="\s*,\s*"(session_id|args)"|"\s*})/s);

    let code = '';
    if (codeMatch) {
      code = codeMatch[1];
      if (code.endsWith('"}')) {
        code = code.slice(0, -2);
      }
      code = code.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    }

    return {
      lang: langMatch ? langMatch[1] : '',
      code,
    };
  }, [args]);
}

export const ERROR_PATTERNS = /^(Traceback|Error:|Exception:|.*Error:)/m;

export default function ExecuteCode({
  isSubmitting,
  initialProgress = 0.1,
  args,
  output = '',
  attachments,
  hideAttachments = false,
}: {
  initialProgress: number;
  isSubmitting: boolean;
  args?: string | Record<string, unknown>;
  output?: string;
  attachments?: TAttachment[];
  hideAttachments?: boolean;
}) {
  const localize = useLocalize();
  const { lang = 'py', code } = useParseArgs(args) ?? ({} as ParsedArgs);

  const { showCode, toggleCode, expandStyle, expandRef, progress, cancelled, hasError, hasOutput } =
    useToolCallState(initialProgress, isSubmitting, output, !!code);

  const highlighted = useLazyHighlight(code, lang);
  const outputHasError = useMemo(() => ERROR_PATTERNS.test(output), [output]);

  return (
    <>
      <div className="relative my-1.5 flex size-5 shrink-0 items-center gap-2.5">
        <ProgressText
          progress={progress}
          onClick={toggleCode}
          inProgressText={localize('com_ui_analyzing')}
          finishedText={
            cancelled ? localize('com_ui_cancelled') : localize('com_ui_analyzing_finished')
          }
          errorSuffix={hasError && !cancelled ? localize('com_ui_tool_failed') : undefined}
          icon={
            <SquareTerminal
              className={cn(
                'size-4 shrink-0 text-text-secondary',
                progress < 1 && !cancelled && !hasError && 'animate-pulse',
              )}
              aria-hidden="true"
            />
          }
          hasInput={!!code?.length}
          isExpanded={showCode}
          error={cancelled}
        />
      </div>
      <div style={expandStyle}>
        <div className="overflow-hidden" ref={expandRef}>
          <div className="my-2 overflow-hidden rounded-lg border border-border-light bg-surface-secondary">
            {code && <CodeWindowHeader language={lang} code={code} />}
            {code && (
              <pre className="max-h-[300px] overflow-auto bg-surface-chat p-4 font-mono text-xs dark:bg-surface-primary-alt">
                <code className={`hljs language-${lang} !whitespace-pre`}>{highlighted}</code>
              </pre>
            )}
            {hasOutput && (
              <div
                className={cn(
                  'bg-surface-primary-alt p-4 text-xs dark:bg-transparent',
                  code && 'border-t border-border-light',
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
      {!hideAttachments && attachments && attachments.length > 0 && (
        <AttachmentGroup attachments={attachments} />
      )}
    </>
  );
}
