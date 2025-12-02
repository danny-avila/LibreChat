import React from 'react';
import { Variable } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { cn } from '~/utils';
import { CodeVariableGfm } from './Markdown';
import { useLocalize } from '~/hooks';

const components: {
  [nodeType: string]: React.ElementType;
} = { code: CodeVariableGfm };

const MCPPromptVariables = ({ promptArguments }: { promptArguments: any; showInfo?: boolean }) => {
  const localize = useLocalize();
  let argumentArray = promptArguments;
  if (typeof promptArguments === 'object' && promptArguments !== null) {
    argumentArray = Object.values(promptArguments);
  }

  return (
    <div className="rounded-xl border border-border-light bg-transparent p-4 shadow-md">
      <h3 className="flex items-center gap-2 py-2 text-lg font-semibold text-text-primary">
        <Variable className="icon-sm" aria-hidden="true" />
        {'Arguments'}
      </h3>
      <div className="flex flex-col space-y-4">
        {argumentArray && argumentArray.length ? (
          <div className="flex flex-wrap gap-2">
            {argumentArray.map((argument, index) => (
              <span className={cn('text-medium font-medium text-text-primary')} key={index}>
                {argument.name}
                {argument.required ? ' (required)' : ' (optional)'}
              </span>
            ))}
          </div>
        ) : (
          <div className="text-sm text-text-secondary">
            <ReactMarkdown components={components} className="markdown prose dark:prose-invert">
              {localize('com_ui_arguments_info')}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
};

export default MCPPromptVariables;
