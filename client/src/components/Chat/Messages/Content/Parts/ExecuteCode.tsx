import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { useRecoilValue } from 'recoil';
import { SquareTerminal } from 'lucide-react';
import type { TAttachment } from 'librechat-data-provider';
import ProgressText from '~/components/Chat/Messages/Content/ProgressText';
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

interface HastText {
  type: 'text';
  value: string;
}

interface HastElement {
  type: 'element';
  tagName: string;
  properties?: { className?: string[] };
  children?: HastNode[];
}

type HastNode = HastText | HastElement;

function hastToReact(nodes: HastNode[]): React.ReactNode[] {
  return nodes.map((node, i) => {
    if (node.type === 'text') {
      return node.value;
    }
    return React.createElement(
      node.tagName,
      { key: i, className: node.properties?.className?.join(' ') },
      node.children ? hastToReact(node.children) : undefined,
    );
  });
}

type LowlightModule = typeof import('lowlight');

/** Lazy-loaded lowlight singleton — only fetched when syntax highlighting is first needed. */
let lowlightPromise: Promise<LowlightModule> | null = null;
let lowlightModule: LowlightModule | null = null;

function loadLowlight(): Promise<LowlightModule> {
  if (lowlightModule) {
    return Promise.resolve(lowlightModule);
  }
  if (!lowlightPromise) {
    lowlightPromise = import('lowlight').then((mod) => {
      lowlightModule = mod;
      return mod;
    });
  }
  return lowlightPromise;
}

function highlightCode(mod: LowlightModule, code: string, lang: string): React.ReactNode[] {
  try {
    const tree = mod.lowlight.registered(lang)
      ? mod.lowlight.highlight(lang, code)
      : mod.lowlight.highlightAuto(code);
    return hastToReact(tree.children as HastNode[]);
  } catch {
    return [code];
  }
}

/** Hook that lazily loads lowlight and returns highlighted nodes once ready. */
function useLazyHighlight(code: string | undefined, lang: string): React.ReactNode[] | null {
  const [highlighted, setHighlighted] = useState<React.ReactNode[] | null>(() => {
    if (!code || !lowlightModule) {
      return null;
    }
    return highlightCode(lowlightModule, code, lang);
  });
  const prevKey = useRef('');

  useEffect(() => {
    const key = `${lang}\0${code ?? ''}`;
    if (key === prevKey.current) {
      return;
    }
    prevKey.current = key;

    if (!code) {
      setHighlighted(null);
      return;
    }

    if (lowlightModule) {
      setHighlighted(highlightCode(lowlightModule, code, lang));
      return;
    }

    let cancelled = false;
    loadLowlight()
      .then((mod) => {
        if (!cancelled) {
          setHighlighted(highlightCode(mod, code, lang));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHighlighted([code]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [code, lang]);

  return highlighted;
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

const ERROR_PATTERNS = /^(Traceback|Error:|Exception:|.*Error:)/m;

export default function ExecuteCode({
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
  const hasOutput = output.length > 0;
  const autoExpand = useRecoilValue(store.autoExpandTools);

  const { lang = 'py', code } = useParseArgs(args) ?? ({} as ParsedArgs);
  const hasContent = !!code || hasOutput;
  const [showCode, setShowCode] = useState(() => autoExpand && hasContent);
  const { style: expandStyle, ref: expandRef } = useExpandCollapse(showCode);

  useEffect(() => {
    if (autoExpand && hasContent) {
      setShowCode(true);
    }
  }, [autoExpand, hasContent]);
  const progress = useProgress(initialProgress);

  const highlighted = useLazyHighlight(code, lang);

  const outputHasError = useMemo(() => ERROR_PATTERNS.test(output), [output]);

  const toggleCode = useCallback(() => setShowCode((prev) => !prev), [setShowCode]);

  const cancelled = !isSubmitting && progress < 1;

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
          icon={
            <SquareTerminal
              className={cn(
                'size-4 shrink-0 text-text-secondary',
                progress < 1 && !cancelled && 'animate-pulse',
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
      {attachments && attachments.length > 0 && <AttachmentGroup attachments={attachments} />}
    </>
  );
}
