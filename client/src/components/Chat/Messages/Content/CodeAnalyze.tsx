import { useState } from 'react';
import { useRecoilValue } from 'recoil';
import { useProgress, useLocalize } from '~/hooks';
import ProgressText from './ProgressText';
import MarkdownLite from './MarkdownLite';
import store from '~/store';

export default function CodeAnalyze({
  initialProgress = 0.1,
  code,
  outputs = [],
}: {
  initialProgress: number;
  code: string;
  outputs: Record<string, unknown>[];
}) {
  const localize = useLocalize();
  const progress = useProgress(initialProgress);
  const showAnalysisCode = useRecoilValue(store.showCode);
  const [showCode, setShowCode] = useState(showAnalysisCode);

  const logs = outputs.reduce((acc, output) => {
    if (output['logs']) {
      return acc + output['logs'] + '\n';
    }
    return acc;
  }, '');

  return (
    <>
      <div className="my-2.5 flex items-center gap-2.5">
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
