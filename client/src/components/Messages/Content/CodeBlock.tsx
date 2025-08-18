import React, { useRef, useState, useMemo, useEffect } from 'react';
import copy from 'copy-to-clipboard';
import { InfoIcon } from 'lucide-react';
import { Tools } from 'librechat-data-provider';
import { Clipboard, CheckMark } from '@librechat/client';
import type { CodeBarProps } from '~/common';
import ResultSwitcher from '~/components/Messages/Content/ResultSwitcher';
import { useToolCallsMapContext, useMessageContext } from '~/Providers';
import { LogContent } from '~/components/Chat/Messages/Content/Parts';
import RunCode from '~/components/Messages/Content/RunCode';
import { useLocalize } from '~/hooks';
import cn from '~/utils/cn';

type CodeBlockProps = Pick<
  CodeBarProps,
  'lang' | 'plugin' | 'error' | 'allowExecution' | 'blockIndex'
> & {
  codeChildren: React.ReactNode;
  classProp?: string;
};

const CodeBar: React.FC<CodeBarProps> = React.memo(
  ({ lang, error, codeRef, blockIndex, plugin = null, allowExecution = true }) => {
    const localize = useLocalize();
    const [isCopied, setIsCopied] = useState(false);
    return (
      <div className="relative flex items-center justify-between rounded-tl-md rounded-tr-md bg-gray-700 px-4 py-2 font-sans text-xs text-gray-200 dark:bg-gray-700">
        <span className="">{lang}</span>
        {plugin === true ? (
          <InfoIcon className="ml-auto flex h-4 w-4 gap-2 text-white/50" />
        ) : (
          <div className="flex items-center justify-center gap-4">
            {allowExecution === true && (
              <RunCode lang={lang} codeRef={codeRef} blockIndex={blockIndex} />
            )}
            <button
              type="button"
              className={cn(
                'ml-auto flex gap-2',
                error === true ? 'h-4 w-4 items-start text-white/50' : '',
              )}
              onClick={async () => {
                const codeString = codeRef.current?.textContent;
                if (codeString != null) {
                  setIsCopied(true);
                  copy(codeString.trim(), { format: 'text/plain' });

                  setTimeout(() => {
                    setIsCopied(false);
                  }, 3000);
                }
              }}
            >
              {isCopied ? (
                <>
                  <CheckMark className="h-[18px] w-[18px]" />
                  {error === true ? '' : localize('com_ui_copied')}
                </>
              ) : (
                <>
                  <Clipboard />
                  {error === true ? '' : localize('com_ui_copy_code')}
                </>
              )}
            </button>
          </div>
        )}
      </div>
    );
  },
);

const CodeBlock: React.FC<CodeBlockProps> = ({
  lang,
  blockIndex,
  codeChildren,
  classProp = '',
  allowExecution = true,
  plugin = null,
  error,
}) => {
  const codeRef = useRef<HTMLElement>(null);
  const toolCallsMap = useToolCallsMapContext();
  const { messageId, partIndex } = useMessageContext();
  const key = allowExecution
    ? `${messageId}_${partIndex ?? 0}_${blockIndex ?? 0}_${Tools.execute_code}`
    : '';
  const [currentIndex, setCurrentIndex] = useState(0);

  const fetchedToolCalls = toolCallsMap?.[key];
  const [toolCalls, setToolCalls] = useState(toolCallsMap?.[key] ?? null);

  useEffect(() => {
    if (fetchedToolCalls) {
      setToolCalls(fetchedToolCalls);
      setCurrentIndex(fetchedToolCalls.length - 1);
    }
  }, [fetchedToolCalls]);

  const currentToolCall = useMemo(() => toolCalls?.[currentIndex], [toolCalls, currentIndex]);

  const next = () => {
    if (!toolCalls) {
      return;
    }
    if (currentIndex < toolCalls.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const previous = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const isNonCode = !!(plugin === true || error === true);
  const language = isNonCode ? 'json' : lang;

  return (
    <div className="w-full rounded-md bg-gray-900 text-xs text-white/80">
      <CodeBar
        lang={lang}
        error={error}
        codeRef={codeRef}
        blockIndex={blockIndex}
        plugin={plugin === true}
        allowExecution={allowExecution}
      />
      <div className={cn(classProp, 'overflow-y-auto p-4')}>
        <code
          ref={codeRef}
          className={cn(
            isNonCode ? '!whitespace-pre-wrap' : `hljs language-${language} !whitespace-pre`,
          )}
        >
          {codeChildren}
        </code>
      </div>
      {allowExecution === true && toolCalls && toolCalls.length > 0 && (
        <>
          <div className="bg-gray-700 p-4 text-xs">
            <div
              className="prose flex flex-col-reverse text-white"
              style={{
                color: 'white',
              }}
            >
              <pre className="shrink-0">
                <LogContent
                  output={(currentToolCall?.result as string | undefined) ?? ''}
                  attachments={currentToolCall?.attachments ?? []}
                  renderImages={true}
                />
              </pre>
            </div>
          </div>
          {toolCalls.length > 1 && (
            <ResultSwitcher
              currentIndex={currentIndex}
              totalCount={toolCalls.length}
              onPrevious={previous}
              onNext={next}
            />
          )}
        </>
      )}
    </div>
  );
};

export default CodeBlock;
