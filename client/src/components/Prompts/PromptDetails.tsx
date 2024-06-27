import type { TPromptGroup } from 'librechat-data-provider';
import CategoryIcon from './Groups/CategoryIcon';
import PromptVariables from './PromptVariables';
import Description from './Description';
import { useLocalize } from '~/hooks';
import Command from './Command';

const PromptDetails = ({ group }: { group: TPromptGroup }) => {
  const localize = useLocalize();
  if (!group) {
    return null;
  }

  const promptText = group.productionPrompt?.prompt ?? '';

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
      <div className="flex h-full w-full flex-col md:flex-row">
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto border-gray-300 p-0 dark:border-gray-600 md:max-h-[calc(100vh-150px)] md:p-4">
          <div>
            <h2 className="flex items-center justify-between rounded-t-lg border border-gray-300 py-2 pl-4 text-base font-semibold dark:border-gray-600 dark:text-gray-200">
              {localize('com_ui_prompt_text')}
            </h2>
            <div className="group relative min-h-32 rounded-b-lg border border-gray-300 p-4 transition-all duration-150 dark:border-gray-600">
              <span className="block break-words px-2 py-1 dark:text-gray-200">{promptText}</span>
            </div>
          </div>
          <PromptVariables promptText={promptText} />
          <Description initialValue={group.oneliner} disabled={true} />
          <Command initialValue={group.command} disabled={true} />
        </div>
      </div>
    </div>
  );
};

export default PromptDetails;
