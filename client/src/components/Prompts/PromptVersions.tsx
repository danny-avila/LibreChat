import React from 'react';
import { format } from 'date-fns';
import { Layers3 } from 'lucide-react';
import type { TPrompt, TPromptGroup } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';
import { Tag } from '~/components/ui';
import { cn } from '~/utils';

const PromptVersions = ({
  prompts,
  group,
  selectionIndex,
  setSelectionIndex,
}: {
  prompts: TPrompt[];
  group?: TPromptGroup;
  selectionIndex: React.SetStateAction<number>;
  setSelectionIndex: React.Dispatch<React.SetStateAction<number>>;
}) => {
  const localize = useLocalize();
  return (
    <>
      <h2 className="mb-4 flex gap-2 text-base font-semibold dark:text-gray-200">
        <Layers3 className="icon-lg text-brand-blue-500" />
        {localize('com_ui_versions')}
      </h2>
      <ul className="flex flex-col gap-3">
        {prompts.map((prompt: TPrompt, index: number) => {
          const tags: string[] = [];
          if (index === 0) {
            tags.push('latest');
          }

          if (prompt._id === group?.productionId) {
            tags.push('production');
          }

          return (
            <li
              key={index}
              className={cn(
                'relative cursor-pointer rounded-lg border p-4 dark:border-gray-600 dark:bg-transparent',
                index === selectionIndex ? 'bg-gray-100 dark:bg-gray-700' : 'bg-white',
              )}
              onClick={() => setSelectionIndex(index)}
            >
              <p className="font-bold dark:text-gray-200">
                {localize('com_ui_version_var', `${prompts.length - index}`)}
              </p>
              <p className="absolute right-4 top-5 whitespace-nowrap text-xs text-gray-600 dark:text-gray-400">
                {format(new Date(prompt.createdAt), 'yyyy-MM-dd HH:mm')}
              </p>
              {tags.length > 0 && (
                <span className="flex flex-wrap gap-1 text-sm">
                  {tags.map((tag, i) => {
                    return (
                      <Tag
                        key={`${tag}-${i}`}
                        label={tag}
                        className={cn(
                          'w-fit border border-transparent bg-blue-100 text-blue-500 dark:border-blue-500 dark:bg-transparent dark:text-blue-500',
                          tag === 'production' &&
                          'bg-brand-blue-100 text-brand-blue-500 dark:border-brand-blue-500 dark:bg-transparent dark:text-brand-blue-500',
                        )}
                        labelClassName="flex m-0 justify-center gap-1"
                        LabelNode={
                          tag === 'production' ? (
                            <div className="flex items-center ">
                              <span className="slow-pulse h-[0.4rem] w-[0.4rem] rounded-full bg-brand-blue-400" />
                            </div>
                          ) : null
                        }
                      />
                    );
                  })}
                </span>
              )}
              {group?.authorName && (
                <p className="text-xs text-gray-600 dark:text-gray-400">by {group.authorName}</p>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
};

export default PromptVersions;
