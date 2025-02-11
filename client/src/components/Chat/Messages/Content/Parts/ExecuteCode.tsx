import React, { useMemo, useState } from 'react';
import { useRecoilValue } from 'recoil';
import type { TAttachment } from 'librechat-data-provider';
import ProgressText from '~/components/Chat/Messages/Content/ProgressText';
import FinishedIcon from '~/components/Chat/Messages/Content/FinishedIcon';
import MarkdownLite from '~/components/Chat/Messages/Content/MarkdownLite';
import { useProgress, useLocalize } from '~/hooks';
import { CodeInProgress } from './CodeProgress';
import Attachment from './Attachment';
import LogContent from './LogContent';
import store from '~/store';

interface ParsedArgs {
  lang: string;
  code: string;
}

export function useParseArgs(args: string): ParsedArgs {
  return useMemo(() => {
    const langMatch = args.match(/"lang"\s*:\s*"(\w+)"/);
    const codeMatch = args.match(/"code"\s*:\s*"(.+?)(?="\s*,\s*"args"|$)/s);

    let code = '';
    if (codeMatch) {
      code = codeMatch[1];
      if (code.endsWith('"}')) {
        code = code.slice(0, -2);
      }
      code = code.replace(/\\n/g, '\n').replace(/\\/g, '');
    }

    return {
      lang: langMatch ? langMatch[1] : '',
      code,
    };
  }, [args]);
}

const radius = 56.08695652173913;
const circumference = 2 * Math.PI * radius;

export default function ExecuteCode({
  initialProgress = 0.1,
  args,
  output = '',
  isSubmitting,
  attachments,
}: {
  initialProgress: number;
  args: string;
  output?: string;
  isSubmitting: boolean;
  attachments?: TAttachment[];
}) {
  const localize = useLocalize();
  const showAnalysisCode = useRecoilValue(store.showCode);
  const [showCode, setShowCode] = useState(showAnalysisCode);

  const { lang, code } = useParseArgs(args);
  const progress = useProgress(initialProgress);
  const offset = circumference - progress * circumference;

  return (
    <>
      <div className="my-2.5 flex items-center gap-2.5">
        <div className="relative h-5 w-5 shrink-0">
          {progress < 1 ? (
            <CodeInProgress
              offset={offset}
              radius={radius}
              progress={progress}
              isSubmitting={isSubmitting}
              circumference={circumference}
            />
          ) : (
            <FinishedIcon />
          )}
        </div>
        <ProgressText
          progress={progress}
          onClick={() => setShowCode((prev) => !prev)}
          inProgressText={localize('com_ui_analyzing')}
          finishedText={localize('com_ui_analyzing_finished')}
          hasInput={!!code.length}
          isExpanded={showCode}
        />
      </div>
      {showCode && (
        <div className="code-analyze-block mb-3 mt-0.5 overflow-hidden rounded-xl bg-black">
          <MarkdownLite
            content={code ? `\`\`\`${lang}\n${code}\n\`\`\`` : ''}
            codeExecution={false}
          />
          {output.length > 0 && (
            <div className="bg-gray-700 p-4 text-xs">
              <div
                className="prose flex flex-col-reverse text-white"
                style={{
                  color: 'white',
                }}
              >
                <pre className="shrink-0">
                  <LogContent output={output} attachments={attachments} />
                </pre>
              </div>
            </div>
          )}
        </div>
      )}
      {attachments?.map((attachment, index) => <Attachment attachment={attachment} key={index} />)}
    </>
  );
}
