import {
  Tools,
  Constants,
  ContentTypes,
  ToolCallTypes,
  imageGenTools,
  isImageVisionTool,
} from 'librechat-data-provider';
import { memo, useMemo } from 'react';
import type { TMessageContentParts, TAttachment, Agents } from 'librechat-data-provider';
import { useMessageContext, useMessagesOperations } from '~/Providers';
import {
  PACKAGE_OF_PRACTICES_UI_MESSAGE,
  messageContentHasPopTool,
  normalizeMessageContentParts,
} from '~/utils/packageOfPracticesUiMask';
import { OpenAIImageGen, EmptyText, Reasoning, ExecuteCode, AgentUpdate, Text } from './Parts';
import { ErrorMessage } from './MessageContent';
import RetrievalCall from './RetrievalCall';
import AgentHandoff from './AgentHandoff';
import CodeAnalyze from './CodeAnalyze';
import Container from './Container';
import WebSearch from './WebSearch';
import ToolCall from './ToolCall';
import ImageGen from './ImageGen';
import Image from './Image';

type PartProps = {
  part?: TMessageContentParts;
  isLast?: boolean;
  isSubmitting: boolean;
  showCursor: boolean;
  isCreatedByUser: boolean;
  attachments?: TAttachment[];
};

function ancestorChainHasPopTool(
  messages:
    | Array<{ messageId: string; parentMessageId?: string | null; content?: unknown }>
    | undefined,
  startParentId: string | null | undefined,
): boolean {
  if (!messages?.length || !startParentId) {
    return false;
  }
  const seen = new Set<string>();
  let id: string | null | undefined = startParentId;
  for (let hop = 0; hop < 48 && id && !seen.has(id); hop++) {
    seen.add(id);
    const m = messages.find((x) => x.messageId === id);
    if (!m) {
      break;
    }
    if (messageContentHasPopTool(m.content as Array<TMessageContentParts | undefined> | string)) {
      return true;
    }
    id = m.parentMessageId ?? undefined;
  }
  return false;
}

function indexOfFirstTextPart(parts: Array<TMessageContentParts | undefined> | undefined): number {
  if (!parts?.length) {
    return -1;
  }
  for (let i = 0; i < parts.length; i++) {
    if (parts[i]?.type === ContentTypes.TEXT) {
      return i;
    }
  }
  return -1;
}

const Part = memo(function Part({
  part,
  isSubmitting,
  attachments,
  isLast,
  showCursor,
  isCreatedByUser,
}: PartProps) {
  const { messageId, partIndex, contentPartCount } = useMessageContext();
  const { getMessages } = useMessagesOperations();

  const packageOfPracticesUi = useMemo(() => {
    if (isCreatedByUser || typeof partIndex !== 'number' || !messageId) {
      return { hideAssistantProse: false as const };
    }
    const messages = getMessages() ?? [];
    const msg = messages.find((m) => m.messageId === messageId);
    if (!msg || msg.isCreatedByUser) {
      return { hideAssistantProse: false as const };
    }
    const contentRaw = msg.content as Array<TMessageContentParts | undefined> | string | undefined;
    const local = messageContentHasPopTool(contentRaw);
    const ancestor = ancestorChainHasPopTool(messages, msg.parentMessageId ?? undefined);
    if (!local && !ancestor) {
      return { hideAssistantProse: false as const };
    }
    return {
      hideAssistantProse: true as const,
      firstTextPartIndex: indexOfFirstTextPart(normalizeMessageContentParts(contentRaw)),
    };
  }, [contentPartCount, getMessages, isCreatedByUser, messageId, partIndex]);

  if (!part) {
    return null;
  }

  if (part.type === ContentTypes.ERROR) {
    return (
      <ErrorMessage
        text={
          part[ContentTypes.ERROR] ??
          (typeof part[ContentTypes.TEXT] === 'string'
            ? part[ContentTypes.TEXT]
            : part.text?.value) ??
          ''
        }
        className="my-2"
      />
    );
  }
  if (part.type === ContentTypes.AGENT_UPDATE) {
    return (
      <>
        <AgentUpdate currentAgentId={part[ContentTypes.AGENT_UPDATE]?.agentId} />
        {isLast && showCursor && (
          <Container>
            <EmptyText />
          </Container>
        )}
      </>
    );
  }
  if (part.type === ContentTypes.TEXT) {
    const text = typeof part.text === 'string' ? part.text : part.text?.value;

    if (typeof text !== 'string') {
      return null;
    }

    if (packageOfPracticesUi.hideAssistantProse) {
      const fi = packageOfPracticesUi.firstTextPartIndex;
      if (fi >= 0) {
        if (partIndex !== fi) {
          return null;
        }
        return (
          <Container>
            <Text
              text={PACKAGE_OF_PRACTICES_UI_MESSAGE}
              isCreatedByUser={isCreatedByUser}
              showCursor={showCursor}
            />
          </Container>
        );
      }
      return (
        <Container>
          <Text
            text={PACKAGE_OF_PRACTICES_UI_MESSAGE}
            isCreatedByUser={isCreatedByUser}
            showCursor={showCursor}
          />
        </Container>
      );
    }

    if (part.tool_call_ids != null && !text) {
      return null;
    }
    if (!isLast && text.length > 0 && /^\s*$/.test(text)) {
      return null;
    }
    return (
      <Container>
        <Text text={text} isCreatedByUser={isCreatedByUser} showCursor={showCursor} />
      </Container>
    );
  }
  if (part.type === ContentTypes.THINK) {
    const reasoning = typeof part.think === 'string' ? part.think : part.think?.value;
    if (typeof reasoning !== 'string') {
      return null;
    }
    if (packageOfPracticesUi.hideAssistantProse) {
      return null;
    }
    return <Reasoning reasoning={reasoning} isLast={isLast ?? false} />;
  }
  if (part.type === ContentTypes.TOOL_CALL) {
    const toolCall = part[ContentTypes.TOOL_CALL];

    if (!toolCall) {
      return null;
    }

    const isToolCall =
      'args' in toolCall && (!toolCall.type || toolCall.type === ToolCallTypes.TOOL_CALL);
    if (isToolCall && toolCall.name === Tools.execute_code) {
      return (
        <ExecuteCode
          attachments={attachments}
          isSubmitting={isSubmitting}
          output={toolCall.output ?? ''}
          initialProgress={toolCall.progress ?? 0.1}
          args={typeof toolCall.args === 'string' ? toolCall.args : ''}
        />
      );
    }
    if (isToolCall && (toolCall.name === 'image_gen_oai' || toolCall.name === 'image_edit_oai')) {
      return (
        <OpenAIImageGen
          initialProgress={toolCall.progress ?? 0.1}
          isSubmitting={isSubmitting}
          toolName={toolCall.name}
          args={typeof toolCall.args === 'string' ? toolCall.args : ''}
          output={toolCall.output ?? ''}
          attachments={attachments}
        />
      );
    }
    if (isToolCall && toolCall.name === Tools.web_search) {
      return (
        <WebSearch
          output={toolCall.output ?? ''}
          initialProgress={toolCall.progress ?? 0.1}
          isSubmitting={isSubmitting}
          attachments={attachments}
          isLast={isLast}
        />
      );
    }
    if (isToolCall && toolCall.name?.startsWith(Constants.LC_TRANSFER_TO_)) {
      return (
        <AgentHandoff
          args={toolCall.args ?? ''}
          name={toolCall.name || ''}
          output={toolCall.output ?? ''}
        />
      );
    }
    if (toolCall.type === ToolCallTypes.CODE_INTERPRETER) {
      const code_interpreter = toolCall[ToolCallTypes.CODE_INTERPRETER];
      return (
        <CodeAnalyze
          initialProgress={toolCall.progress ?? 0.1}
          code={code_interpreter.input}
          outputs={code_interpreter.outputs ?? []}
        />
      );
    }
    if (
      toolCall.type === ToolCallTypes.RETRIEVAL ||
      toolCall.type === ToolCallTypes.FILE_SEARCH
    ) {
      return (
        <RetrievalCall initialProgress={toolCall.progress ?? 0.1} isSubmitting={isSubmitting} />
      );
    }
    if (
      toolCall.type === ToolCallTypes.FUNCTION &&
      ToolCallTypes.FUNCTION in toolCall &&
      imageGenTools.has(toolCall.function.name)
    ) {
      return (
        <ImageGen
          initialProgress={toolCall.progress ?? 0.1}
          args={toolCall.function.arguments as string}
        />
      );
    }
    if (toolCall.type === ToolCallTypes.FUNCTION && ToolCallTypes.FUNCTION in toolCall) {
      if (isImageVisionTool(toolCall)) {
        if (isSubmitting && showCursor) {
          return (
            <Container>
              <Text text={''} isCreatedByUser={isCreatedByUser} showCursor={showCursor} />
            </Container>
          );
        }
        return null;
      }

      return (
        <ToolCall
          initialProgress={toolCall.progress ?? 0.1}
          isSubmitting={isSubmitting}
          args={toolCall.function.arguments as string}
          name={toolCall.function.name}
          output={toolCall.function.output}
          isLast={isLast}
        />
      );
    }
    if (isToolCall) {
      return (
        <ToolCall
          args={toolCall.args ?? ''}
          name={toolCall.name || ''}
          output={toolCall.output ?? ''}
          initialProgress={toolCall.progress ?? 0.1}
          isSubmitting={isSubmitting}
          attachments={attachments}
          auth={toolCall.auth}
          expires_at={toolCall.expires_at}
          isLast={isLast}
        />
      );
    }
    return null;
  }
  if (part.type === ContentTypes.IMAGE_FILE) {
    const imageFile = part[ContentTypes.IMAGE_FILE];
    const height = imageFile.height ?? 1920;
    const width = imageFile.width ?? 1080;
    return (
      <Image
        imagePath={imageFile.filepath}
        height={height}
        width={width}
        altText={imageFile.filename ?? 'Uploaded Image'}
        placeholderDimensions={{
          height: height + 'px',
          width: width + 'px',
        }}
      />
    );
  }

  return null;
});

export default Part;
