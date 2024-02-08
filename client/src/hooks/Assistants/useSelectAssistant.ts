import { useCallback } from 'react';
import { EModelEndpoint } from 'librechat-data-provider';
import type { TConversation, TPreset, Assistant } from 'librechat-data-provider';
import { useChatContext } from '~/Providers/ChatContext';
import useDefaultConvo from '~/hooks/useDefaultConvo';

export default function useSelectAssistant({
  assistantMap,
}: {
  assistantMap: Record<string, Assistant> | undefined;
}) {
  const getDefaultConversation = useDefaultConvo();
  const { conversation, newConversation } = useChatContext();

  const onSelect = useCallback(
    (value: string) => {
      const assistant = assistantMap?.[value];
      if (!assistant) {
        return;
      }
      const template: Partial<TPreset | TConversation> = {
        endpoint: EModelEndpoint.assistant,
        assistant_id: assistant.id,
        model: assistant.model,
        conversationId: 'new',
      };

      if (conversation?.endpoint === EModelEndpoint.assistant) {
        const currentConvo = getDefaultConversation({
          conversation: { ...(conversation ?? {}) },
          preset: template,
        });
        newConversation({ template: currentConvo, keepLatestMessage: true });
        return;
      }

      newConversation({ template: { ...(template as Partial<TConversation>) } });
    },
    [assistantMap, conversation, getDefaultConversation, newConversation],
  );

  return { onSelect };
}
