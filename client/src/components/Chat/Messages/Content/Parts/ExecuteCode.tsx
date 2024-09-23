import { useMemo } from 'react';
import { useRecoilState } from 'recoil';
import { CodeInProgress } from './CodeProgress';
import ProgressText from '~/components/Chat/Messages/Content/ProgressText';
import FinishedIcon from '~/components/Chat/Messages/Content/FinishedIcon';
import MarkdownLite from '~/components/Chat/Messages/Content/MarkdownLite';
import { useProgress } from '~/hooks';
import store from '~/store';

interface ParsedArgs {
  lang: string;
  code: string;
}

export function useParseArgs(args: string): ParsedArgs {
  return useMemo(() => {
    const langMatch = args.match(/"lang"\s*:\s*"(\w+)"/);
    const codeMatch = args.match(/"code"\s*:\s*"(.+?)(?="\s*,\s*"args"|$)/s);

    return {
      lang: langMatch ? langMatch[1] : '',
      code: codeMatch ? codeMatch[1].replace(/\\n/g, '\n').replace(/\\/g, '') : '',
    };
  }, [args]);
}

export default function ExecuteCode({
  initialProgress = 0.1,
  args,
  outputs = ['', {}],
  isSubmitting,
}: {
  initialProgress: number;
  args: string;
  outputs: [string | undefined, Record<string, unknown> | undefined];
  isSubmitting: boolean;
}) {
  const [showCode, setShowCode] = useRecoilState(store.showCode);

  const { lang, code } = useParseArgs(args);
  const progress = useProgress(initialProgress);

  const radius = 56.08695652173913;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - progress * circumference;

  const logs = outputs[0];

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
          <MarkdownLite content={code ? `\`\`\`${lang}\n${code}\n\`\`\`` : ''} />
          {logs != null && logs && (
            <div className="bg-gray-700 p-4 text-xs">
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
