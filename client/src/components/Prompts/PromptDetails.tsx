import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import remarkMath from 'remark-math';
import supersub from 'remark-supersub';
import rehypeHighlight from 'rehype-highlight';
import { replaceSpecialVars } from 'librechat-data-provider';
import type { TPromptGroup } from 'librechat-data-provider';
import { codeNoExecution } from '~/components/Chat/Messages/Content/Markdown';
import { useLocalize, useAuthContext } from '~/hooks';
import CategoryIcon from './Groups/CategoryIcon';
import PromptVariables from './PromptVariables';
import { PromptVariableGfm } from './Markdown';
import { Label } from '~/components/ui';
import Description from './Description';
import Command from './Command';

const PromptDetails = ({ group }: { group?: TPromptGroup }) => {
  const localize = useLocalize();
  const { user } = useAuthContext();

  const mainText = useMemo(() => {
    const initialText = group?.productionPrompt?.prompt ?? '';
    return replaceSpecialVars({ text: initialText, user });
  }, [group?.productionPrompt?.prompt, user]);

  if (!group) {
    return null;
  }

  return (
    <div>
      <div className="flex flex-col items-center justify-between p-4 text-text-primary sm:flex-row">
        <div className="mb-1 flex flex-row items-center font-bold sm:text-xl md:mb-0 md:text-2xl">
          <div className="mb-1 flex items-center md:mb-0">
            <div className="rounded pr-2">
              {(group.category?.length ?? 0) > 0 ? (
                <CategoryIcon category={group.category ?? ''} />
              ) : null}
            </div>
            <Label className="text-2xl font-bold">{group.name}</Label>
          </div>
        </div>
      </div>
      <div className="flex h-full max-h-screen flex-col overflow-y-auto md:flex-row">
        <div className="flex flex-1 flex-col gap-4 p-0 md:max-h-[calc(100vh-150px)] md:p-2">
          <div>
            <h2 className="flex items-center justify-between rounded-t-lg border border-border-light py-2 pl-4 text-base font-semibold text-text-primary">
              {localize('com_ui_prompt_text')}
            </h2>
            <div className="group relative min-h-32 rounded-b-lg border border-border-light p-4 transition-all duration-150">
              <ReactMarkdown
                remarkPlugins={[
                  /** @ts-ignore */
                  supersub,
                  remarkGfm,
                  [remarkMath, { singleDollarTextMath: true }],
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
          <PromptVariables promptText={mainText} showInfo={false} />
          <Description initialValue={group.oneliner} disabled={true} />
          <Command initialValue={group.command} disabled={true} />
        </div>
      </div>
    </div>
  );
};

export default PromptDetails;
