import React, { useMemo } from 'react';
import { Variable } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Separator } from '@librechat/client';
import { specialVariables } from 'librechat-data-provider';
import { cn, extractUniqueVariables } from '~/utils';
import { CodeVariableGfm } from './Markdown';
import { useLocalize } from '~/hooks';

const specialVariableClasses =
  'bg-amber-100 text-yellow-800 border-yellow-600 dark:border-yellow-500/50 dark:bg-transparent dark:text-yellow-500/90';

const components: {
  [nodeType: string]: React.ElementType;
} = { code: CodeVariableGfm };

const PromptVariables = ({
  promptText,
  showInfo = true,
}: {
  promptText: string;
  showInfo?: boolean;
}) => {
  const localize = useLocalize();

  const variables = useMemo(() => {
    return extractUniqueVariables(promptText || '');
  }, [promptText]);

  return (
    <div className="rounded-xl border border-border-light bg-transparent p-4 shadow-md">
      <h3 className="flex items-center gap-2 py-2 text-lg font-semibold text-text-primary">
        <Variable className="icon-sm" aria-hidden="true" />
        {localize('com_ui_variables')}
      </h3>
      <div className="flex flex-col space-y-4">
        {variables.length ? (
          <div className="flex flex-wrap gap-2">
            {variables.map((variable, index) => (
              <span
                className={cn(
                  'rounded-full border border-border-light px-3 py-1 text-text-primary',
                  specialVariables[variable.toLowerCase()] != null ? specialVariableClasses : '',
                )}
                key={index}
              >
                {specialVariables[variable.toLowerCase()] != null
                  ? variable.toLowerCase()
                  : variable}
              </span>
            ))}
          </div>
        ) : (
          <div className="text-sm text-text-secondary">
            <ReactMarkdown components={components} className="markdown prose dark:prose-invert">
              {localize('com_ui_variables_info')}
            </ReactMarkdown>
          </div>
        )}
        <Separator className="my-3 text-text-primary" />
        {showInfo && (
          <div className="space-y-4">
            <div>
              <span className="text-sm font-medium text-text-primary">
                {localize('com_ui_special_variables')}
              </span>
              <span className="text-sm text-text-secondary">
                <ReactMarkdown components={components} className="markdown prose dark:prose-invert">
                  {localize('com_ui_special_variables_more_info')}
                </ReactMarkdown>
              </span>
            </div>
            <div>
              <span className="text-sm font-medium text-text-primary">
                {localize('com_ui_dropdown_variables')}
              </span>
              <span className="break-words text-sm text-text-secondary">
                <ReactMarkdown components={components} className="markdown prose dark:prose-invert">
                  {localize('com_ui_dropdown_variables_info')}
                </ReactMarkdown>
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PromptVariables;
