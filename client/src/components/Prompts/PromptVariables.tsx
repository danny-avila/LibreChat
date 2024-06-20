import { useMemo } from 'react';
import { Variable } from 'lucide-react';
import { extractUniqueVariables } from '~/utils';
import { Separator } from '../ui';
import { useLocalize } from '~/hooks';

const PromptVariables = ({ promptText }: { promptText: string }) => {
  const localize = useLocalize();

  const variables = useMemo(() => {
    return extractUniqueVariables(promptText || '');
  }, [promptText]);

  return (
    <>
      <h3 className="flex items-center gap-2 rounded-t-lg border border-border-medium py-2 pl-4 text-base font-semibold text-text-secondary">
        <Variable className="icon-sm" />
        {localize('com_ui_variables')}
      </h3>
      <div className="mb-4 flex w-full flex-row flex-wrap rounded-b-lg border border-border-medium p-4 md:min-h-16">
        {variables.length ? (
          <div className="flex h-7 items-center">
            {variables.map((variable, index) => (
              <label
                className="mr-1 rounded-full border border-border-medium px-2 text-text-secondary"
                key={index}
              >
                {variable}
              </label>
            ))}
          </div>
        ) : (
          <div className="flex h-7 items-center">
            <span className="text-sm text-text-tertiary">{localize('com_ui_variables_info')}</span>
          </div>
        )}
        <Separator className="my-3 bg-border-medium" />
        <span className="text-sm text-text-tertiary">{localize('com_ui_special_variables')}</span>
      </div>
    </>
  );
};

export default PromptVariables;
