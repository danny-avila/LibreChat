import { EModelEndpoint, FileSources } from 'librechat-data-provider';
import { MinimalIcon } from '~/components/Endpoints';
import { cn } from '~/utils';

const sourceToEndpoint = {
  [FileSources.openai]: EModelEndpoint.openAI,
  [FileSources.azure]: EModelEndpoint.azureOpenAI,
};
const sourceToClassname = {
  [FileSources.openai]: 'bg-black/65',
  [FileSources.azure]: 'azure-bg-color opacity-85',
};

const defaultClassName =
  'absolute right-0 bottom-0 rounded-full p-[0.15rem] text-gray-600 transition-colors';

export default function SourceIcon({
  source,
  className = defaultClassName,
}: {
  source?: FileSources;
  className?: string;
}) {
  if (source === FileSources.local || source === FileSources.firebase) {
    return null;
  }

  const endpoint = sourceToEndpoint[source ?? ''];

  if (!endpoint) {
    return null;
  }
  return (
    <button type="button" className={cn(className, sourceToClassname[source ?? ''] ?? '')}>
      <span className="flex items-center justify-center">
        <MinimalIcon
          endpoint={endpoint}
          size={14}
          isCreatedByUser={false}
          iconClassName="h-3 w-3"
        />
      </span>
    </button>
  );
}
