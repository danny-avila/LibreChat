import type { TPromptGroup } from 'librechat-data-provider';
import CategoryIcon from '../utils/CategoryIcon';

interface PromptDetailHeaderProps {
  group: TPromptGroup;
}

const PromptDetailHeader = ({ group }: PromptDetailHeaderProps) => {
  return (
    <div className="flex flex-col items-center gap-3 py-6">
      {group.category && (
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-secondary">
          <CategoryIcon category={group.category} className="h-8 w-8" />
        </div>
      )}

      <h2 className="text-center text-2xl font-bold text-text-primary">{group.name}</h2>

      {group.oneliner && (
        <p className="max-w-md text-center text-base text-text-secondary">{group.oneliner}</p>
      )}
    </div>
  );
};

export default PromptDetailHeader;
