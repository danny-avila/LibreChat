import React, { useRef, useState, useMemo, useEffect, useCallback } from 'react';
import copy from 'copy-to-clipboard';
import { InfoIcon } from 'lucide-react';
import { Tools } from 'librechat-data-provider';
import { Clipboard, CheckMark, TooltipAnchor } from '@librechat/client';
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

interface FloatingCodeBarProps extends CodeBarProps {
  isVisible: boolean;
}

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
                'ml-auto flex gap-2 rounded-sm focus:outline focus:outline-white',
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
              {isCopied ? <CheckMark className="h-[18px] w-[18px]" /> : <Clipboard />}
              {error !== true && (
                <span className="relative">
                  <span className="invisible">{localize('com_ui_copy_code')}</span>
                  <span className="absolute inset-0 flex items-center">
                    {isCopied ? localize('com_ui_copied') : localize('com_ui_copy_code')}
                  </span>
                </span>
              )}
            </button>
          </div>
        )}
      </div>
    );
  },
);

const FloatingCodeBar: React.FC<FloatingCodeBarProps> = React.memo(
  ({ lang, error, codeRef, blockIndex, plugin = null, allowExecution = true, isVisible }) => {
    const localize = useLocalize();
    const [isCopied, setIsCopied] = useState(false);
    const copyButtonRef = useRef<HTMLButtonElement>(null);

    const handleCopy = useCallback(() => {
      const codeString = codeRef.current?.textContent;
      if (codeString != null) {
        const wasFocused = document.activeElement === copyButtonRef.current;
        setIsCopied(true);
        copy(codeString.trim(), { format: 'text/plain' });
        if (wasFocused) {
          requestAnimationFrame(() => {
            copyButtonRef.current?.focus();
          });
        }

        setTimeout(() => {
          const focusedElement = document.activeElement as HTMLElement | null;
          setIsCopied(false);
          requestAnimationFrame(() => {
            focusedElement?.focus();
          });
        }, 3000);
      }
    }, [codeRef]);

    return (
      <div
        className={cn(
          'absolute bottom-2 right-2 flex items-center gap-2 font-sans text-xs text-gray-200 transition-opacity duration-150',
          isVisible ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      >
        {plugin === true ? (
          <InfoIcon className="flex h-4 w-4 gap-2 text-white/50" />
        ) : (
          <>
            {allowExecution === true && (
              <RunCode lang={lang} codeRef={codeRef} blockIndex={blockIndex} iconOnly />
            )}
            <TooltipAnchor
              description={isCopied ? localize('com_ui_copied') : localize('com_ui_copy_code')}
              render={
                <button
                  ref={copyButtonRef}
                  type="button"
                  tabIndex={isVisible ? 0 : -1}
                  aria-label={isCopied ? localize('com_ui_copied') : localize('com_ui_copy_code')}
                  className={cn(
                    'flex items-center justify-center rounded p-1.5 hover:bg-gray-700 focus:bg-gray-700 focus:outline focus:outline-white',
                    error === true ? 'h-4 w-4 text-white/50' : '',
                  )}
                  onClick={handleCopy}
                >
                  {isCopied ? (
                    <CheckMark className="h-[18px] w-[18px]" aria-hidden="true" />
                  ) : (
                    <Clipboard aria-hidden="true" />
                  )}
                </button>
              }
            />
          </>
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
  const containerRef = useRef<HTMLDivElement>(null);
  const [isBarVisible, setIsBarVisible] = useState(false);
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

  // Handle focus within the container (for keyboard navigation)
  const handleFocus = useCallback(() => {
    setIsBarVisible(true);
  }, []);

  const handleBlur = useCallback((e: React.FocusEvent) => {
    // Check if focus is moving to another element within the container
    if (!containerRef.current?.contains(e.relatedTarget as Node)) {
      setIsBarVisible(false);
    }
  }, []);

  const handleMouseEnter = useCallback(() => {
    setIsBarVisible(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    // Only hide if no element inside has focus
    if (!containerRef.current?.contains(document.activeElement)) {
      setIsBarVisible(false);
    }
  }, []);

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
    <div
      ref={containerRef}
      className="relative w-full rounded-md bg-gray-900 text-xs text-white/80"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleFocus}
      onBlur={handleBlur}
    >
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
      <FloatingCodeBar
        lang={lang}
        error={error}
        codeRef={codeRef}
        blockIndex={blockIndex}
        plugin={plugin === true}
        allowExecution={allowExecution}
        isVisible={isBarVisible}
      />
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
