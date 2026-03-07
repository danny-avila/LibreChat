import { useMemo, useState, useEffect, useRef } from 'react';
import { useRecoilValue } from 'recoil';
import type { TAttachment } from 'librechat-data-provider';
import ProgressText from '~/components/Chat/Messages/Content/ProgressText';
import MarkdownLite from '~/components/Chat/Messages/Content/MarkdownLite';
import { useProgress, useLocalize, useExpandCollapse } from '~/hooks';
import CodeWindowHeader from './CodeWindowHeader';
import { AttachmentGroup } from './Attachment';
import Stdout from './Stdout';
import { cn } from '~/utils';
import store from '~/store';

interface ParsedArgs {
  lang?: string;
  code?: string;
}

export function useParseArgs(args?: string): ParsedArgs | null {
  return useMemo(() => {
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

export default function ExecuteCode({
  isSubmitting,
  initialProgress = 0.1,
  args,
  output = '',
  attachments,
}: {
  initialProgress: number;
  isSubmitting: boolean;
  args?: string;
  output?: string;
  attachments?: TAttachment[];
}) {
  const localize = useLocalize();
  const hasOutput = output.length > 0;
  const outputRef = useRef<string>(output);
  const showAnalysisCode = useRecoilValue(store.showCode);
  const [showCode, setShowCode] = useState(showAnalysisCode);
  const expandStyle = useExpandCollapse(showCode);

  const { lang = 'py', code } = useParseArgs(args) ?? ({} as ParsedArgs);
  const progress = useProgress(initialProgress);

  useEffect(() => {
    if (output !== outputRef.current) {
      outputRef.current = output;
    }
  }, [output]);

  const cancelled = !isSubmitting && progress < 1;

  return (
    <>
      <div className="relative my-2.5 flex size-5 shrink-0 items-center gap-2.5">
        <ProgressText
          progress={progress}
          onClick={() => setShowCode((prev) => !prev)}
          inProgressText={localize('com_ui_analyzing')}
          finishedText={
            cancelled ? localize('com_ui_cancelled') : localize('com_ui_analyzing_finished')
          }
          hasInput={!!code?.length}
          isExpanded={showCode}
          error={cancelled}
        />
      </div>
      <div className="mb-2" style={expandStyle}>
        <div className="overflow-hidden">
          <div className="mt-0.5 overflow-hidden rounded-lg border border-border-light bg-surface-secondary">
            {showCode && code && <CodeWindowHeader language={lang} code={code} />}
            {showCode && (
              <div className="max-h-[300px] overflow-auto">
                <MarkdownLite
                  content={code ? `\`\`\`${lang}\n${code}\n\`\`\`` : ''}
                  codeExecution={false}
                />
              </div>
            )}
            {hasOutput && (
              <div
                className={cn(
                  'bg-surface-tertiary p-4 text-xs',
                  showCode ? 'border-t border-border-light' : '',
                )}
              >
                <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-text-tertiary">
                  {localize('com_ui_output')}
                </div>
                <div className="max-h-[200px] overflow-auto">
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
