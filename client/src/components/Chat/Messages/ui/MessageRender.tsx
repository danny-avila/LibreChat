import React, { useCallback, useEffect, useMemo, memo, useState } from 'react';
import { useAtomValue } from 'jotai';
import { useRecoilState, useRecoilValue } from 'recoil';
import { type TMessage } from 'librechat-data-provider';
import type { TMessageProps, TMessageIcon } from '~/common';
import MessageContent from '~/components/Chat/Messages/Content/MessageContent';
import ChunkModal, { type BklSource } from '~/components/Chat/Messages/Content/ChunkModal';
import { useLocalize, useMessageActions, useContentMetadata } from '~/hooks';
import PlaceholderRow from '~/components/Chat/Messages/ui/PlaceholderRow';
import SiblingSwitch from '~/components/Chat/Messages/SiblingSwitch';
import HoverButtons from '~/components/Chat/Messages/HoverButtons';
import MessageIcon from '~/components/Chat/Messages/MessageIcon';
import SubRow from '~/components/Chat/Messages/SubRow';
import { cn, getMessageAriaLabel } from '~/utils';
import { fontSizeAtom } from '~/store/fontSize';
import { MessageContext } from '~/Providers';
import store from '~/store';

function extractBklRidFromMessage(message?: TMessage): string | null {
  if (!message) {
    return null;
  }

  const RID_RE = /<!-- bkl_rid:([a-zA-Z0-9_-]+) -->/;

  const fromText = message.text?.match(RID_RE)?.[1];
  if (fromText) {
    return fromText;
  }

  if (!Array.isArray(message.content)) {
    return null;
  }

  for (const part of message.content) {
    if (part?.type !== 'text') {
      continue;
    }
    // Server/DB format: { text: { value: "..." } }
    // Streaming delta format: { text: "..." }
    const raw = (part as Record<string, unknown>).text;
    const textValue = typeof raw === 'string' ? raw : (raw as { value?: string } | null)?.value;
    if (!textValue) {
      continue;
    }
    const fromContent = textValue.match(RID_RE)?.[1];
    if (fromContent) {
      return fromContent;
    }
  }

  return null;
}

function formatMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

type BklTiming = { startTime: number; firstTokenTime: number | null; endTime: number };

function getCachedBklSource(messageId: string, n: number): BklSource | null {
  const sources = (window as any).__bklSources?.[messageId];
  if (!Array.isArray(sources)) {
    return null;
  }
  return sources[n - 1] ?? null;
}

function GenerationTimingText({ messageId }: { messageId: string }) {
  const [timing, setTiming] = useState<BklTiming | null>(null);

  useEffect(() => {
    let cancelled = false;
    const check = () => {
      const t = (window as any).__bklTiming?.[messageId];
      if (t && !cancelled) setTiming(t);
    };
    check();
    const t1 = setTimeout(check, 500);
    const t2 = setTimeout(check, 1500);
    const t3 = setTimeout(check, 3000);
    return () => {
      cancelled = true;
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [messageId]);

  if (!timing?.endTime) {
    return null;
  }

  const total = timing.endTime - timing.startTime;
  const ttft = timing.firstTokenTime != null ? timing.firstTokenTime - timing.startTime : null;

  return (
    <p className="mt-1 select-none font-mono text-[11px] text-text-tertiary opacity-70">
      {ttft != null
        ? `⏱ TTFT ${formatMs(ttft)} · 총 ${formatMs(total)}`
        : `⏱ 총 ${formatMs(total)}`}
    </p>
  );
}

type MessageRenderProps = {
  message?: TMessage;
  isSubmitting?: boolean;
} & Pick<
  TMessageProps,
  'currentEditId' | 'setCurrentEditId' | 'siblingIdx' | 'setSiblingIdx' | 'siblingCount'
>;

const MessageRender = memo(function MessageRender({
  message: msg,
  siblingIdx,
  siblingCount,
  setSiblingIdx,
  currentEditId,
  setCurrentEditId,
  isSubmitting = false,
}: MessageRenderProps) {
  const localize = useLocalize();
  const {
    ask,
    edit,
    index,
    agent,
    assistant,
    enterEdit,
    conversation,
    messageLabel,
    handleFeedback,
    handleContinue,
    latestMessageId,
    copyToClipboard,
    regenerateMessage,
    latestMessageDepth,
  } = useMessageActions({
    message: msg,
    currentEditId,
    setCurrentEditId,
  });
  const fontSize = useAtomValue(fontSizeAtom);
  const maximizeChatSpace = useRecoilValue(store.maximizeChatSpace);
  const [activeBklSource, setActiveBklSource] = useRecoilState(store.activeBklSource);

  const handleRegenerateMessage = useCallback(() => regenerateMessage(), [regenerateMessage]);
  const hasNoChildren = !(msg?.children?.length ?? 0);
  const isLast = useMemo(
    () => hasNoChildren && (msg?.depth === latestMessageDepth || msg?.depth === -1),
    [hasNoChildren, msg?.depth, latestMessageDepth],
  );
  const isLatestMessage = msg?.messageId === latestMessageId;
  /** Only pass isSubmitting to the latest message to prevent unnecessary re-renders */
  const effectiveIsSubmitting = isLatestMessage ? isSubmitting : false;

  const iconData: TMessageIcon = useMemo(
    () => ({
      endpoint: msg?.endpoint ?? conversation?.endpoint,
      model: msg?.model ?? conversation?.model,
      iconURL: msg?.iconURL,
      modelLabel: messageLabel,
      isCreatedByUser: msg?.isCreatedByUser,
    }),
    [
      messageLabel,
      conversation?.endpoint,
      conversation?.model,
      msg?.model,
      msg?.iconURL,
      msg?.endpoint,
      msg?.isCreatedByUser,
    ],
  );

  const { hasParallelContent } = useContentMetadata(msg);
  const messageId = msg?.messageId ?? '';
  const bklRid = useMemo(() => {
    const rid = extractBklRidFromMessage(msg);
    if (rid && messageId) {
      const win = window as any;
      win.__bklRids = win.__bklRids ?? {};
      win.__bklRids[messageId] = rid;
    }
    return rid;
  }, [msg, messageId]);
  const activeSource = useMemo(() => {
    if (!activeBklSource || activeBklSource.messageId !== messageId) {
      return null;
    }
    return getCachedBklSource(messageId, activeBklSource.n);
  }, [activeBklSource, messageId]);
  const messageContextValue = useMemo(
    () => ({
      messageId,
      isLatestMessage,
      isExpanded: false as const,
      isSubmitting: effectiveIsSubmitting,
      conversationId: conversation?.conversationId,
    }),
    [messageId, conversation?.conversationId, effectiveIsSubmitting, isLatestMessage],
  );

  if (!msg) {
    return null;
  }

  const getChatWidthClass = () => {
    if (maximizeChatSpace) {
      return 'w-full max-w-full md:px-5 lg:px-1 xl:px-5';
    }
    if (hasParallelContent) {
      return 'md:max-w-[58rem] xl:max-w-[70rem]';
    }
    return 'md:max-w-[47rem] xl:max-w-[55rem]';
  };

  const baseClasses = {
    common: 'group mx-auto flex flex-1 gap-3 transition-all duration-300 transform-gpu ',
    chat: getChatWidthClass(),
  };

  const conditionalClasses = {
    focus: 'focus:outline-none focus:ring-2 focus:ring-border-xheavy',
  };

  return (
    <div
      id={msg.messageId}
      data-bkl-rid={bklRid ?? undefined}
      aria-label={getMessageAriaLabel(msg, localize)}
      className={cn(
        baseClasses.common,
        baseClasses.chat,
        conditionalClasses.focus,
        'message-render',
      )}
    >
      <ChunkModal
        isOpen={activeBklSource?.messageId === messageId}
        onClose={() => setActiveBklSource(null)}
        source={activeSource}
        citationNumber={activeBklSource?.n ?? 0}
      />
      {!hasParallelContent && (
        <div className="relative flex flex-shrink-0 flex-col items-center">
          <div className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full">
            <MessageIcon iconData={iconData} assistant={assistant} agent={agent} />
          </div>
        </div>
      )}

      <div
        className={cn(
          'relative flex flex-col',
          hasParallelContent ? 'w-full' : 'w-11/12',
          msg.isCreatedByUser ? 'user-turn' : 'agent-turn',
        )}
      >
        {!hasParallelContent && (
          <h2 className={cn('select-none font-semibold', fontSize)}>{messageLabel}</h2>
        )}

        <div className="flex flex-col gap-1">
          <div className="flex min-h-[20px] max-w-full flex-grow flex-col gap-0">
            <MessageContext.Provider value={messageContextValue}>
              <MessageContent
                ask={ask}
                edit={edit}
                isLast={isLast}
                text={msg.text || ''}
                message={msg}
                enterEdit={enterEdit}
                error={!!(msg.error ?? false)}
                isSubmitting={effectiveIsSubmitting}
                unfinished={msg.unfinished ?? false}
                isCreatedByUser={msg.isCreatedByUser ?? true}
                siblingIdx={siblingIdx ?? 0}
                setSiblingIdx={setSiblingIdx ?? (() => ({}))}
              />
            </MessageContext.Provider>
          </div>
          {!msg.isCreatedByUser && <GenerationTimingText messageId={msg.messageId} />}
          {hasNoChildren && effectiveIsSubmitting ? (
            <PlaceholderRow />
          ) : (
            <SubRow classes="text-xs">
              <SiblingSwitch
                siblingIdx={siblingIdx}
                siblingCount={siblingCount}
                setSiblingIdx={setSiblingIdx}
              />
              <HoverButtons
                index={index}
                isEditing={edit}
                message={msg}
                enterEdit={enterEdit}
                isSubmitting={isSubmitting}
                conversation={conversation ?? null}
                regenerate={handleRegenerateMessage}
                copyToClipboard={copyToClipboard}
                handleContinue={handleContinue}
                latestMessageId={latestMessageId}
                handleFeedback={handleFeedback}
                isLast={isLast}
              />
            </SubRow>
          )}
        </div>
      </div>
    </div>
  );
});
MessageRender.displayName = 'MessageRender';

export default MessageRender;
