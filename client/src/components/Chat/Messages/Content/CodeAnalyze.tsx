import { useState } from 'react';
import { useRecoilValue } from 'recoil';
import { CodeInProgress } from './Parts/CodeProgress';
import { useProgress, useLocalize } from '~/hooks';
import ProgressText from './ProgressText';
import FinishedIcon from './FinishedIcon';
import MarkdownLite from './MarkdownLite';
import store from '~/store';

export default function CodeAnalyze({
  initialProgress = 0.1,
  code,
  outputs = [],
  isSubmitting,
}: {
  initialProgress: number;
  code: string;
  outputs: Record<string, unknown>[];
  isSubmitting: boolean;
}) {
  const localize = useLocalize();
  const progress = useProgress(initialProgress);
  const showAnalysisCode = useRecoilValue(store.showCode);
  const [showCode, setShowCode] = useState(showAnalysisCode);

  const radius = 56.08695652173913;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - progress * circumference;

  const logs = outputs.reduce((acc, output) => {
    if (output['logs']) {
      return acc + output['logs'] + '\n';
    }
    return acc;
  }, '');

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
          inProgressText="Analyzing"
          finishedText="Finished analyzing"
          hasInput={!!code.length}
        />
      </div>
      {showCode && (
        <div className="code-analyze-block mb-3 mt-0.5 overflow-hidden rounded-xl bg-black">
          <MarkdownLite content={code ? `\`\`\`python\n${code}\n\`\`\`` : ''} />
          {logs && (
            <div className="bg-gray-700 p-4 text-xs">
              <div className="mb-1 text-gray-400">{localize('com_ui_result')}</div>
              <div
                className="prose flex flex-col-reverse text-white"
                style={{
                  color: 'white',
                }}
              >
                <pre className="shrink-0">{logs}</pre>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
