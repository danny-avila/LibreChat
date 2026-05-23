import { Terminal, Type, Database } from 'lucide-react';
import { EModelEndpoint, FileSources } from 'librechat-data-provider';
import { MinimalIcon } from '~/components/Endpoints';
import { cn } from '~/utils';

const sourceToEndpoint = {
  [FileSources.openai]: EModelEndpoint.openAI,
  [FileSources.azure]: EModelEndpoint.azureOpenAI,
};

const sourceToClassname = {
  [FileSources.openai]: 'bg-white/75 dark:bg-black/65',
  [FileSources.azure]: 'azure-bg-color',
  [FileSources.azure_blob]: 'azure-bg-color',
  [FileSources.execute_code]: 'bg-black text-white opacity-85',
  [FileSources.text]: 'bg-blue-500 dark:bg-blue-900 opacity-85 text-white',
  [FileSources.vectordb]: 'bg-yellow-700 dark:bg-yellow-900 opacity-85 text-white',
};

const defaultClassName =
  'absolute right-0 bottom-0 rounded-full p-[0.15rem] text-gray-600 transition-colors';

export default function SourceIcon({
  source,
  isCodeFile,
  className = defaultClassName,
}: {
  source?: FileSources;
  isCodeFile?: boolean;
  className?: string;
}) {
  if (isCodeFile === true) {
    return (
      <div className={cn(className, sourceToClassname[FileSources.execute_code] ?? '')}>
        <span className="flex items-center justify-center">
          <Terminal className="h-3 w-3" aria-hidden="true" />
        </span>
      </div>
    );
  }

  if (source === FileSources.text) {
    return (
      <div className={cn(className, sourceToClassname[source] ?? '')}>
        <span className="flex items-center justify-center">
          <Type className="h-3 w-3" aria-hidden="true" />
        </span>
      </div>
    );
  }

  if (source === FileSources.vectordb) {
    return (
      <div className={cn(className, sourceToClassname[source] ?? '')}>
        <span className="flex items-center justify-center">
          <Database className="h-3 w-3" aria-hidden="true" />
        </span>
      </div>
    );
  }

  const endpoint = sourceToEndpoint[source ?? ''];

  if (!endpoint) {
    return null;
  }
  return (
    <div className={cn(className, sourceToClassname[source ?? ''] ?? '')}>
      <span className="flex items-center justify-center">
        <MinimalIcon
          endpoint={endpoint}
          size={14}
          isCreatedByUser={false}
          iconClassName="h-3 w-3"
        />
      </span>
    </div>
  );
}
