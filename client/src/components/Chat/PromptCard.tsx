import { TPromptGroup } from 'librechat-data-provider';
import CategoryIcon from '~/components/Prompts/Groups/CategoryIcon';

export default function PromptCard({ promptGroup }: { promptGroup: TPromptGroup }) {
  return (
    <div className="hover:bg-token-main-surface-secondary relative flex w-40 cursor-pointer flex-col gap-2 rounded-2xl border px-3 pb-4 pt-3 text-start align-top text-[15px] shadow-[0_0_2px_0_rgba(0,0,0,0.05),0_4px_6px_0_rgba(0,0,0,0.02)] transition-colors duration-300 ease-in-out fade-in hover:bg-slate-100 dark:border-gray-600 dark:hover:bg-gray-700">
      <div className="">
        <CategoryIcon className="size-4" category={promptGroup.category || ''} />
      </div>
      <p className="break-word line-clamp-3 text-balance text-gray-600 dark:text-gray-400">
        {promptGroup?.oneliner || promptGroup?.productionPrompt?.prompt}
      </p>
    </div>
  );
}
