import { useMemo } from 'react';
import { Variable } from 'lucide-react';
import { extractUniqueVariables, cn } from '~/utils';
import { Separator } from '~/components/ui';
import { useLocalize } from '~/hooks';

const specialVariables = {
  current_date: true,
  current_user: true,
};

const specialVariableClasses =
  'bg-yellow-500/25 text-yellow-600 dark:border-yellow-500/50 dark:bg-transparent dark:text-yellow-500/90';

const PromptVariables = ({ promptText }: { promptText: string }) => {
  const localize = useLocalize();

  const variables = useMemo(() => {
    return extractUniqueVariables(promptText || '');
  }, [promptText]);

  return (
    <div>
      <h3 className="flex items-center gap-2 rounded-t-lg border border-border-medium py-2 pl-4 text-base font-semibold text-text-secondary">
        <Variable className="icon-sm" />
        {localize('com_ui_variables')}
      </h3>
      <div className="flex w-full flex-row flex-wrap rounded-b-lg border border-border-medium p-4 md:min-h-16">
        {variables.length ? (
          <div className="flex h-7 items-center">
            {variables.map((variable, index) => (
              <label
                className={cn(
                  'mr-1 rounded-full border border-border-medium px-2 text-text-secondary',
                  specialVariables[variable.toLowerCase()] ? specialVariableClasses : '',
                )}
                key={index}
              >
                {specialVariables[variable.toLowerCase()] ? variable.toLowerCase() : variable}
              </label>
            ))}
          </div>
        ) : (
          <div className="flex h-7 items-center">
            <span className="text-xs text-text-tertiary md:text-sm">
              {localize('com_ui_variables_info')}
            </span>
          </div>
        )}
        <Separator className="my-3 bg-border-medium" />
        <span className="text-xs text-text-tertiary md:text-sm">
          {localize('com_ui_special_variables')}
        </span>
      </div>
    </div>
  );
};

export default PromptVariables;
