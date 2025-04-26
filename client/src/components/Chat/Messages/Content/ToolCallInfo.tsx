import { useLocalize } from '~/hooks';

export default function ToolCallInfo({
  input,
  output,
  domain,
  function_name,
  pendingAuth,
}: {
  input: string;
  function_name: string;
  output?: string | null;
  domain?: string;
  pendingAuth?: boolean;
}) {
  const localize = useLocalize();
  const formatText = (text: string) => {
    try {
      return JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      return text;
    }
  };

  let title =
    domain != null && domain
      ? localize('com_assistants_domain_info', { 0: domain })
      : localize('com_assistants_function_use', { 0: function_name });
  if (pendingAuth === true) {
    title =
      domain != null && domain
        ? localize('com_assistants_action_attempt', { 0: domain })
        : localize('com_assistants_attempt_info');
  }

  return (
    <div className="w-full rounded-xl border border-border-light bg-surface-secondary p-2 shadow-md">
      <div className="mb-2 text-sm font-medium text-text-primary">{title}</div>
      <div className="max-h-32 overflow-y-auto rounded-lg bg-surface-tertiary p-2 text-xs text-text-primary">
        <code className="!whitespace-pre-wrap">{formatText(input)}</code>
      </div>
      {output != null && output && (
        <>
          <div className="mb-2 mt-2 text-sm font-medium text-text-primary">
            {localize('com_ui_result')}
          </div>
          <div className="max-h-96 overflow-y-auto break-words rounded-lg bg-surface-tertiary p-2 text-xs text-text-primary">
            <code className="!whitespace-pre-wrap break-words">{formatText(output)}</code>
          </div>
        </>
      )}
    </div>
  );
}
