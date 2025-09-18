import React, { useMemo, useState, useRef, useEffect } from 'react';
import { useRecoilValue } from 'recoil';
import type { TAttachment } from 'librechat-data-provider';
import ProgressText from '~/components/Chat/Messages/Content/ProgressText';
import MarkdownLite from '~/components/Chat/Messages/Content/MarkdownLite';
import { useProgress, useLocalize } from '~/hooks';
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
  const codeContentRef = useRef<HTMLDivElement>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const showAnalysisCode = useRecoilValue(store.showCode);
  const [showCode, setShowCode] = useState(showAnalysisCode);
  const [contentHeight, setContentHeight] = useState<number | undefined>(0);

  const prevShowCodeRef = useRef<boolean>(showCode);
  const { lang, code } = useParseArgs(args) ?? ({} as ParsedArgs);
  const progress = useProgress(initialProgress);

  useEffect(() => {
    if (output !== outputRef.current) {
      outputRef.current = output;

      if (showCode && codeContentRef.current) {
        setTimeout(() => {
          if (codeContentRef.current) {
            const newHeight = codeContentRef.current.scrollHeight;
            setContentHeight(newHeight);
          }
        }, 10);
      }
    }
  }, [output, showCode]);

  useEffect(() => {
    if (showCode !== prevShowCodeRef.current) {
      prevShowCodeRef.current = showCode;

      if (showCode && codeContentRef.current) {
        setIsAnimating(true);
        requestAnimationFrame(() => {
          if (codeContentRef.current) {
            const height = codeContentRef.current.scrollHeight;
            setContentHeight(height);
          }

          const timer = setTimeout(() => {
            setIsAnimating(false);
          }, 500);

          return () => clearTimeout(timer);
        });
      } else if (!showCode) {
        setIsAnimating(true);
        setContentHeight(0);

        const timer = setTimeout(() => {
          setIsAnimating(false);
        }, 500);

        return () => clearTimeout(timer);
      }
    }
  }, [showCode]);

  useEffect(() => {
    if (!codeContentRef.current) {
      return;
    }

    const resizeObserver = new ResizeObserver((entries) => {
      if (showCode && !isAnimating) {
        for (const entry of entries) {
          if (entry.target === codeContentRef.current) {
            setContentHeight(entry.contentRect.height);
          }
        }
      }
    });

    resizeObserver.observe(codeContentRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [showCode, isAnimating]);

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
      <div
        className="relative mb-2"
        style={{
          height: showCode ? contentHeight : 0,
          overflow: 'hidden',
          transition:
            'height 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
          opacity: showCode ? 1 : 0,
          transformOrigin: 'top',
          willChange: 'height, opacity',
          perspective: '1000px',
          backfaceVisibility: 'hidden',
          WebkitFontSmoothing: 'subpixel-antialiased',
        }}
      >
        <div
          className={cn(
            'code-analyze-block mt-0.5 overflow-hidden rounded-xl bg-surface-primary',
            showCode && 'shadow-lg',
          )}
          ref={codeContentRef}
          style={{
            transform: showCode ? 'translateY(0) scale(1)' : 'translateY(-8px) scale(0.98)',
            opacity: showCode ? 1 : 0,
            transition:
              'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          {showCode && (
            <div
              style={{
                transform: showCode ? 'translateY(0)' : 'translateY(-4px)',
                opacity: showCode ? 1 : 0,
                transition:
                  'transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
              }}
            >
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
                showCode ? 'border-t border-surface-primary-contrast' : '',
              )}
              style={{
                transform: showCode ? 'translateY(0)' : 'translateY(-6px)',
                opacity: showCode ? 1 : 0,
                transition:
                  'transform 0.45s cubic-bezier(0.16, 1, 0.3, 1) 0.05s, opacity 0.45s cubic-bezier(0.19, 1, 0.22, 1) 0.05s',
                boxShadow: showCode ? '0 -1px 0 rgba(0,0,0,0.05)' : 'none',
              }}
            >
              <div className="prose flex flex-col-reverse">
                <Stdout output={output} />
              </div>
            </div>
          )}
        </div>
      </div>
      {attachments && attachments.length > 0 && <AttachmentGroup attachments={attachments} />}
    </>
  );
}
