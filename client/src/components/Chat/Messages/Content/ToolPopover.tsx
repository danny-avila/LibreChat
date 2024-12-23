import * as Popover from '@radix-ui/react-popover';
import useLocalize from '~/hooks/useLocalize';

export default function ToolPopover({
  input,
  output,
  function_name,
  domain,
}: {
  input: string;
  function_name: string;
  output?: string | null;
  domain?: string;
}) {
  const localize = useLocalize();
  const formatText = (text: string) => {
    try {
      return JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      return text;
    }
  };

  return (
    <Popover.Portal>
      <Popover.Content
        side="bottom"
        align="start"
        sideOffset={12}
        alignOffset={-5}
        className="w-18 min-w-[180px]  max-w-sm rounded-lg bg-white dark:bg-gray-900"
      >
        <div tabIndex={-1}>
          <div className="bg-token-surface-primary max-w-sm rounded-md p-2 shadow-[0_0_24px_0_rgba(0,0,0,0.05),inset_0_0.5px_0_0_rgba(0,0,0,0.05),0_2px_8px_0_rgba(0,0,0,0.05)]">
            <div className="mb-2 text-sm font-medium dark:text-gray-100">
              {domain != null && domain
                ? localize('com_assistants_domain_info', domain)
                : localize('com_assistants_function_use', function_name)}
            </div>
            <div className="bg-token-surface-secondary text-token-text-primary dark rounded-md text-xs">
              <div className="max-h-32 overflow-y-auto rounded-md p-2 dark:bg-gray-700">
                <code className="!whitespace-pre-wrap ">{formatText(input)}</code>
              </div>
            </div>
            {output != null && output && (
              <>
                <div className="mb-2 mt-2 text-sm font-medium dark:text-gray-100">
                  {localize('com_ui_result')}
                </div>
                <div className="bg-token-surface-secondary text-token-text-primary dark rounded-md text-xs">
                  <div className="max-h-32 overflow-y-auto rounded-md p-2 dark:bg-gray-700">
                    <code className="!whitespace-pre-wrap ">{formatText(output)}</code>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </Popover.Content>
    </Popover.Portal>
  );
}
