import type { ErrorRendererProps } from './parts';
import type { TranslationKeys } from '~/hooks';
import { useLocalize } from '~/hooks';

/** Labels match the assistant builder, so v1's `retrieval` keeps its own name. */
const toolLabelKeys: Record<string, TranslationKeys> = {
  code_interpreter: 'com_assistants_code_interpreter',
  file_search: 'com_assistants_file_search',
  retrieval: 'com_assistants_retrieval',
};

/** An assistant run refused because the reader's role denies a native tool the assistant stores. */
export default function AssistantError({ json }: ErrorRendererProps) {
  const localize = useLocalize();
  const tools = Array.isArray(json.tools)
    ? json.tools.filter((tool): tool is string => typeof tool === 'string')
    : [];
  const labels = [
    ...new Set(
      tools.map((tool) => {
        const key = toolLabelKeys[tool];
        return key != null ? localize(key) : tool;
      }),
    ),
  ];
  if (labels.length === 0) {
    return localize('com_error_assistant_tool_not_permitted_generic');
  }
  return localize('com_error_assistant_tool_not_permitted', { 0: labels.join(', ') });
}
