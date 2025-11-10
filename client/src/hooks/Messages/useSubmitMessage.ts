import { v4 } from 'uuid';
import { useCallback, useState } from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import {
  Constants,
  Tools,
  dataService,
  replaceSpecialVars,
} from 'librechat-data-provider';
import type { TMessage, WebDoc } from 'librechat-data-provider';
import { useToastContext } from '@librechat/client';
import { useChatContext, useChatFormContext, useAddedChatContext } from '~/Providers';
import { useAuthContext } from '~/hooks/AuthContext';
import { useLocalize, useRequiresKey } from '~/hooks';
import store from '~/store';
import type { TPinnedWebSource } from '~/common';

const appendIndex = (index: number, value?: string) => {
  if (!value) {
    return value;
  }
  return `${value}${Constants.COMMON_DIVIDER}${index}`;
};

const normalizeSnippet = (value?: string | null) =>
  (value ?? '')
    .replace(/\s+/g, ' ')
    .replace(/\u00a0/g, ' ')
    .trim();

const summarizeDocs = (
  query: string,
  docs: WebDoc[],
  localize: (key: string, vars?: Record<string, unknown>) => string,
) => {
  if (!docs.length) {
    return localize('com_ui_web_search_no_results', { 0: query });
  }

  const header = localize('com_ui_web_search_results_header', { 0: query });
  const footer = localize('com_ui_web_search_summary_footer');

  const lines = docs.slice(0, 4).map((doc, index) => {
    const title = doc.title || doc.url;
    const snippet = normalizeSnippet(doc.snippet || doc.text || '');
    const truncated = snippet.length > 320 ? `${snippet.slice(0, 317)}…` : snippet;
    const parts = [`${index + 1}. ${title}`, doc.url];
    if (truncated) {
      parts.push(truncated);
    }
    return parts.join('\n');
  });

  return [header, ...lines, footer].filter(Boolean).join('\n\n');
};

const buildPinnedSourcesBlock = (sources: TPinnedWebSource[], header: string) => {
  if (!sources.length) {
    return '';
  }

  const items = sources.map((source, index) => {
    const snippet = normalizeSnippet(source.text || source.snippet || '');
    const parts = [`[${index + 1}] ${source.title ?? source.url}`, source.url];
    if (snippet) {
      parts.push(snippet);
    }
    return parts.join('\n');
  });

  return [header, ...items].join('\n');
};

export default function useSubmitMessage() {
  const { user } = useAuthContext();
  const methods = useChatFormContext();
  const {
    ask,
    index,
    getMessages,
    setMessages,
    latestMessage,
    setLatestMessage,
    conversation,
    optionSettings,
    setOptionSettings,
  } = useChatContext();
  const { addedIndex, ask: askAdditional, conversation: addedConvo } = useAddedChatContext();
  const { requiresKey, endpointLabel, expiryTime, isExpired } = useRequiresKey();
  const { showToast } = useToastContext();
  const localize = useLocalize();
  const displayEndpointLabel = endpointLabel || localize('com_endpoint_ai');

  const autoSendPrompts = useRecoilValue(store.autoSendPrompts);
  const activeConvos = useRecoilValue(store.allConversationsSelector);
  const setActivePrompt = useSetRecoilState(store.activePromptByIndex(index));
  const [isManualSearchRunning, setIsManualSearchRunning] = useState(false);

  const submitMessage = useCallback(
    async (data?: { text: string }) => {
      if (!data) {
        console.warn('No data provided to submitMessage');
        return;
      }

      if (requiresKey) {
        let message = localize('com_endpoint_config_placeholder');
        if (isExpired && expiryTime && expiryTime !== 'never') {
          try {
            const formatted = new Date(expiryTime).toLocaleString();
            message = localize('com_error_expired_user_key', {
              0: displayEndpointLabel,
              1: formatted,
            });
          } catch {
            message = localize('com_error_expired_user_key', {
              0: displayEndpointLabel,
              1: expiryTime,
            });
          }
        }
        showToast({ message, status: 'error' });
        return;
      }

      const trimmed = data.text.trim();
      const isWebCommand = /^\/web\s+/i.test(trimmed);

      const rootMessages = getMessages();
      const isLatestInRootMessages = rootMessages?.some(
        (message) => message.messageId === latestMessage?.messageId,
      );
      if (!isLatestInRootMessages && latestMessage) {
        setMessages([...(rootMessages || []), latestMessage]);
      }

      if (isWebCommand) {
        const query = trimmed.replace(/^\/web\s+/i, '').trim();
        if (!query) {
          showToast({
            message: localize('com_ui_web_search_enter_query') ?? 'Enter a web search query',
            status: 'error',
          });
          return;
        }

        if (isManualSearchRunning) {
          return;
        }

        try {
          setIsManualSearchRunning(true);
          const result = await dataService.runWebSearch({
            operation: 'search_and_read',
            query,
          });

          const docs = result?.docs ?? [];
          const summary = summarizeDocs(query, docs, localize);
          const messageId = v4();
          const convoId = conversation?.conversationId ?? Constants.NEW_CONVO;
          const toolCallId = `manual_web_${messageId}`;
          const attachment: TMessage['attachments'][number] = {
            conversationId: convoId,
            messageId,
            toolCallId,
            type: Tools.web_search,
            [Tools.web_search]: {
              turn: (rootMessages?.length ?? 0) + 1,
              organic: docs,
              topStories: [],
            },
          };

          const manualMessage: TMessage = {
            messageId,
            conversationId: convoId,
            parentMessageId: latestMessage?.messageId ?? Constants.NO_PARENT,
            sender: conversation?.sender ?? 'Assistant',
            text: summary,
            model: conversation?.model ?? '',
            endpoint: conversation?.endpoint ?? '',
            isCreatedByUser: false,
            error: false,
            attachments: [attachment],
            searchResult: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };

          const nextMessages = [...(rootMessages ?? []), manualMessage];
          setMessages(nextMessages);
          setLatestMessage?.(manualMessage);
          showToast({
            message: localize('com_ui_web_search_results_ready') ?? 'Web results added',
            status: 'success',
          });
        } catch (error) {
          console.error('Manual web search failed', error);
          showToast({
            message: localize('com_ui_web_search_error') ?? 'Unable to fetch web results',
            status: 'error',
          });
        } finally {
          setIsManualSearchRunning(false);
          methods.reset();
        }

        return;
      }

      const hasAdded = addedIndex && activeConvos[addedIndex] && addedConvo;
      const isNewMultiConvo =
        hasAdded &&
        activeConvos.every((convoId) => convoId === Constants.NEW_CONVO) &&
        !rootMessages?.length;
      const overrideConvoId = isNewMultiConvo ? v4() : undefined;
      const overrideUserMessageId = hasAdded ? v4() : undefined;
      const rootIndex = addedIndex - 1;
      const clientTimestamp = new Date().toISOString();

      const pinnedSources = optionSettings?.pinnedWebSources ?? [];
      let submissionText = data.text;
      if (pinnedSources.length > 0) {
        const groundingBlock = buildPinnedSourcesBlock(
          pinnedSources,
          localize('com_ui_web_search_grounding_header'),
        );
        submissionText = `${submissionText.trim()}\n\n${groundingBlock}`.trim();
        setOptionSettings((prev) => ({
          ...(prev ?? {}),
          pinnedWebSources: [],
        }));
      }

      ask({
        text: submissionText,
        overrideConvoId: appendIndex(rootIndex, overrideConvoId),
        overrideUserMessageId: appendIndex(rootIndex, overrideUserMessageId),
        clientTimestamp,
      });

      if (hasAdded) {
        askAdditional(
          {
            text: submissionText,
            overrideConvoId: appendIndex(addedIndex, overrideConvoId),
            overrideUserMessageId: appendIndex(addedIndex, overrideUserMessageId),
            clientTimestamp,
          },
          { overrideMessages: rootMessages },
        );
      }

      methods.reset();
    },
    [
      ask,
      methods,
      addedIndex,
      addedConvo,
      setMessages,
      getMessages,
      activeConvos,
      askAdditional,
      latestMessage,
      setLatestMessage,
      requiresKey,
      displayEndpointLabel,
      expiryTime,
      isExpired,
      localize,
      showToast,
      optionSettings,
      setOptionSettings,
      conversation,
      isManualSearchRunning,
    ],
  );

  const submitPrompt = useCallback(
    (text: string) => {
      const parsedText = replaceSpecialVars({ text, user });
      if (autoSendPrompts) {
        submitMessage({ text: parsedText });
        return;
      }

      const currentText = methods.getValues('text');
      const newText = currentText.trim().length > 1 ? `\n${parsedText}` : parsedText;
      setActivePrompt(newText);
    },
    [autoSendPrompts, submitMessage, setActivePrompt, methods, user],
  );

  return { submitMessage, submitPrompt };
}
