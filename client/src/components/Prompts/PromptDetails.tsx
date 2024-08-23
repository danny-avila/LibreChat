import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import remarkMath from 'remark-math';
import supersub from 'remark-supersub';
import rehypeHighlight from 'rehype-highlight';
import type { TPromptGroup } from 'librechat-data-provider';
import { code } from '~/components/Chat/Messages/Content/Markdown';
import { useLocalize, useAuthContext } from '~/hooks';
import CategoryIcon from './Groups/CategoryIcon';
import PromptVariables from './PromptVariables';
import { PromptVariableGfm } from './Markdown';
import { replaceSpecialVars } from '~/utils';
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
      <div className="flex flex-col items-center justify-between px-4 dark:text-gray-200 sm:flex-row">
        <div className="mb-1 flex flex-row items-center font-bold sm:text-xl md:mb-0 md:text-2xl">
          <div className="mb-1 flex items-center md:mb-0">
            <div className="rounded p-2">
              {(group.category?.length ?? 0) > 0 ? (
                <CategoryIcon category={group.category ?? ''} />
              ) : null}
            </div>
            <span className="mr-2 border border-transparent p-2">{group.name}</span>
          </div>
        </div>
      </div>
      <div className="flex h-full max-h-screen w-full max-w-[90vw]  flex-col overflow-y-auto md:flex-row">
        <div className="flex flex-1 flex-col gap-4 border-gray-300 p-0 dark:border-gray-600 md:max-h-[calc(100vh-150px)] md:p-2">
          <div>
            <h2 className="flex items-center justify-between rounded-t-lg border border-gray-300 py-2 pl-4 text-base font-semibold dark:border-gray-600 dark:text-gray-200">
              {localize('com_ui_prompt_text')}
            </h2>
            <div className="group relative min-h-32 rounded-b-lg border border-gray-300 p-4 transition-all duration-150 dark:border-gray-600 sm:max-w-full">
              <ReactMarkdown
                remarkPlugins={[supersub, remarkGfm, [remarkMath, { singleDollarTextMath: false }]]}
                rehypePlugins={[
                  [rehypeKatex, { output: 'mathml' }],
                  [rehypeHighlight, { ignoreMissing: true }],
                ]}
                components={{ p: PromptVariableGfm, code }}
                className="prose dark:prose-invert light dark:text-gray-70 my-1"
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
