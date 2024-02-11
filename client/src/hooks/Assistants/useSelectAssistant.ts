import { useCallback } from 'react';
import { EModelEndpoint, defaultOrderQuery } from 'librechat-data-provider';
import type { TConversation, TPreset } from 'librechat-data-provider';
import { useListAssistantsQuery } from '~/data-provider';
import { useChatContext } from '~/Providers/ChatContext';
import useDefaultConvo from '~/hooks/useDefaultConvo';
import { mapAssistants } from '~/utils';

export default function useSelectAssistant() {
  const getDefaultConversation = useDefaultConvo();
  const { conversation, newConversation } = useChatContext();
  const { data: assistantMap = {} } = useListAssistantsQuery(defaultOrderQuery, {
    select: (res) => mapAssistants(res.data),
  });

  const onSelect = useCallback(
    (value: string) => {
      const assistant = assistantMap?.[value];
      if (!assistant) {
        return;
      }
      const template: Partial<TPreset | TConversation> = {
        endpoint: EModelEndpoint.assistants,
        assistant_id: assistant.id,
        model: assistant.model,
        conversationId: 'new',
      };

      if (conversation?.endpoint === EModelEndpoint.assistants) {
        const currentConvo = getDefaultConversation({
          conversation: { ...(conversation ?? {}) },
          preset: template,
        });
        newConversation({
          template: currentConvo,
          preset: template as Partial<TPreset>,
          keepLatestMessage: true,
        });
        return;
      }

      newConversation({
        template: { ...(template as Partial<TConversation>) },
        preset: template as Partial<TPreset>,
      });
    },
    [assistantMap, conversation, getDefaultConversation, newConversation],
  );

  return { onSelect };
}
