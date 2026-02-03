import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import supersub from 'remark-supersub';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import { Copy, Check, FileText } from 'lucide-react';
import { replaceSpecialVars } from 'librechat-data-provider';
import { Button, TooltipAnchor, useToastContext } from '@librechat/client';
import type { TPromptGroup } from 'librechat-data-provider';
import { codeNoExecution } from '~/components/Chat/Messages/Content/MarkdownComponents';
import { PromptVariableGfm } from '../editor/Markdown';
import { useLocalize, useAuthContext } from '~/hooks';

interface PromptTextCardProps {
  group: TPromptGroup;
}

const PromptTextCard = ({ group }: PromptTextCardProps) => {
  const localize = useLocalize();
  const { user } = useAuthContext();
  const { showToast } = useToastContext();
  const [isCopied, setIsCopied] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const mainText = useMemo(() => {
    const initialText = group.productionPrompt?.prompt ?? '';
    return replaceSpecialVars({ text: initialText, user });
  }, [group.productionPrompt?.prompt, user]);

  const handleCopy = useCallback(async () => {
    if (isCopied) {
      return;
    }
    try {
      await navigator.clipboard.writeText(mainText);
      setIsCopied(true);
      showToast({
        message: localize('com_ui_copied_to_clipboard'),
        status: 'success',
      });
      timeoutRef.current = setTimeout(() => {
        setIsCopied(false);
      }, 2000);
    } catch {
      showToast({
        message: localize('com_ui_copy_failed'),
        status: 'error',
      });
    }
  }, [mainText, showToast, localize, isCopied]);

  return (
    <div className="rounded-xl border border-border-light bg-transparent shadow-md">
      <header className="flex items-center justify-between border-b border-border-light p-3">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-text-secondary" aria-hidden="true" />
          <h3 className="text-base font-semibold text-text-primary">
            {localize('com_ui_prompt_text')}
          </h3>
        </div>
        <TooltipAnchor
          description={isCopied ? localize('com_ui_copied') : localize('com_ui_copy')}
          render={
            <Button
              size="icon"
              variant="ghost"
              onClick={handleCopy}
              className="size-8 gap-1.5"
              aria-label={
                isCopied ? localize('com_ui_copied') : localize('com_ui_copy_to_clipboard')
              }
              aria-live="polite"
            >
              {isCopied ? (
                <Check className="size-4" aria-hidden="true" />
              ) : (
                <Copy className="size-4" aria-hidden="true" />
              )}
            </Button>
          }
        />
      </header>
      <div className="max-h-96 overflow-y-auto p-3">
        <ReactMarkdown
          remarkPlugins={[
            /** @ts-ignore */
            supersub,
            remarkGfm,
            [remarkMath, { singleDollarTextMath: false }],
          ]}
          rehypePlugins={[
            /** @ts-ignore */
            [rehypeKatex],
            /** @ts-ignore */
            [rehypeHighlight, { ignoreMissing: true }],
          ]}
          /** @ts-ignore */
          components={{ p: PromptVariableGfm, code: codeNoExecution }}
          className="markdown prose dark:prose-invert light dark:text-gray-70 my-1 break-words"
        >
          {mainText}
        </ReactMarkdown>
      </div>
    </div>
  );
};

export default PromptTextCard;
