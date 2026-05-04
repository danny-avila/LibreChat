import { memo } from 'react';
import {
  Tools,
  Constants,
  ContentTypes,
  ToolCallTypes,
  imageGenTools,
  isImageVisionTool,
} from 'librechat-data-provider';
import type { TMessageContentParts, TAttachment } from 'librechat-data-provider';
import {
  ImageGen,
  ExecuteCode,
  AgentUpdate,
  EmptyText,
  Reasoning,
  Summary,
  Text,
  SkillCall,
  ReadFileCall,
  BashCall,
  SubagentCall,
} from './Parts';
import { ErrorMessage } from './MessageContent';
import RetrievalCall from './RetrievalCall';
import { getCachedPreview } from '~/utils';
import AgentHandoff from './AgentHandoff';
import CodeAnalyze from './CodeAnalyze';
import Container from './Container';
import WebSearch from './WebSearch';
import ToolCall from './ToolCall';
import Image from './Image';

type PartProps = {
  part?: TMessageContentParts;
  isLast?: boolean;
  isSubmitting: boolean;
  showCursor: boolean;
  isCreatedByUser: boolean;
  attachments?: TAttachment[];
  hideAttachments?: boolean;
};

const Part = memo(function Part({
  part,
  isSubmitting,
  attachments,
  isLast,
  showCursor,
  isCreatedByUser,
  hideAttachments,
}: PartProps) {
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
  } else if (part.type === ContentTypes.AGENT_UPDATE) {
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
  } else if (part.type === ContentTypes.TEXT) {
    const text = typeof part.text === 'string' ? part.text : part.text?.value;

    if (typeof text !== 'string') {
      return null;
    }
    if (part.tool_call_ids != null && !text) {
      return null;
    }
    /** Handle whitespace-only text to avoid layout shift */
    if (text.length > 0 && /^\s*$/.test(text)) {
      /** Show placeholder for whitespace-only last part during streaming */
      if (isLast && showCursor) {
        return (
          <Container>
            <EmptyText />
          </Container>
        );
      }
      /** Skip rendering non-last whitespace-only parts to avoid empty Container */
      if (!isLast) {
        return null;
      }
    }
    return (
      <Container>
        <Text text={text} isCreatedByUser={isCreatedByUser} showCursor={showCursor} />
      </Container>
    );
  } else if (part.type === ContentTypes.THINK) {
    const reasoning = typeof part.think === 'string' ? part.think : part.think?.value;
    if (typeof reasoning !== 'string') {
      return null;
    }
    return <Reasoning reasoning={reasoning} isLast={isLast ?? false} />;
  } else if (part.type === ContentTypes.SUMMARY) {
    return (
      <Summary
        content={part.content}
        model={part.model}
        provider={part.provider}
        tokenCount={part.tokenCount}
        summarizing={part.summarizing}
      />
    );
  } else if (part.type === ContentTypes.TOOL_CALL) {
    const toolCall = part[ContentTypes.TOOL_CALL];

    if (!toolCall) {
      return null;
    }

    const isToolCall =
      'args' in toolCall && (!toolCall.type || toolCall.type === ToolCallTypes.TOOL_CALL);
    if (
      isToolCall &&
      (toolCall.name === Tools.execute_code ||
        toolCall.name === Constants.PROGRAMMATIC_TOOL_CALLING)
    ) {
      return (
        <ExecuteCode
          attachments={attachments}
          isSubmitting={isSubmitting}
          output={toolCall.output ?? ''}
          initialProgress={toolCall.progress ?? 0.1}
          args={toolCall.args}
          hideAttachments={hideAttachments}
        />
      );
    } else if (
      isToolCall &&
      (toolCall.name === 'image_gen_oai' ||
        toolCall.name === 'image_edit_oai' ||
        toolCall.name === 'gemini_image_gen')
    ) {
      return (
        <ImageGen
          initialProgress={toolCall.progress ?? 0.1}
          isSubmitting={isSubmitting}
          toolName={toolCall.name}
          args={typeof toolCall.args === 'string' ? toolCall.args : ''}
          output={toolCall.output ?? ''}
          attachments={attachments}
        />
      );
    } else if (isToolCall && toolCall.name === 'skill') {
      return (
        <SkillCall
          args={toolCall.args}
          output={toolCall.output ?? ''}
          initialProgress={toolCall.progress ?? 0.1}
          isSubmitting={isSubmitting}
          attachments={attachments}
        />
      );
    } else if (isToolCall && toolCall.name === Constants.SUBAGENT) {
      /** `subagent_content` is the aggregated content-parts array the
       *  backend writes onto the tool_call at message-save time so the
       *  child's activity survives a page refresh. Not present on older
       *  runs recorded before the persistence path existed — those fall
       *  back to the Recoil atom (live session) or the raw tool output
       *  inside `SubagentCall`. */
      const persistedContent = (
        toolCall as unknown as {
          subagent_content?: TMessageContentParts[];
        }
      ).subagent_content;
      return (
        <SubagentCall
          toolCallId={toolCall.id ?? ''}
          args={toolCall.args}
          output={toolCall.output ?? ''}
          initialProgress={toolCall.progress ?? 0.1}
          isSubmitting={isSubmitting}
          attachments={attachments}
          persistedContent={persistedContent}
        />
      );
    } else if (isToolCall && toolCall.name === 'read_file') {
      return (
        <ReadFileCall
          args={toolCall.args}
          output={toolCall.output ?? ''}
          initialProgress={toolCall.progress ?? 0.1}
          isSubmitting={isSubmitting}
          attachments={attachments}
        />
      );
    } else if (isToolCall && toolCall.name === 'bash_tool') {
      return (
        <BashCall
          args={toolCall.args}
          output={toolCall.output ?? ''}
          initialProgress={toolCall.progress ?? 0.1}
          isSubmitting={isSubmitting}
          attachments={attachments}
        />
      );
    } else if (isToolCall && toolCall.name === Tools.web_search) {
      return (
        <WebSearch
          output={toolCall.output ?? ''}
          initialProgress={toolCall.progress ?? 0.1}
          isSubmitting={isSubmitting}
          attachments={attachments}
          isLast={isLast}
        />
      );
    } else if (isToolCall && (toolCall.name === 'file_search' || toolCall.name === 'retrieval')) {
      return (
        <RetrievalCall
          initialProgress={toolCall.progress ?? 0.1}
          isSubmitting={isSubmitting}
          output={toolCall.output ?? undefined}
          attachments={attachments}
        />
      );
    } else if (isToolCall && toolCall.name?.startsWith(Constants.LC_TRANSFER_TO_)) {
      return <AgentHandoff args={toolCall.args ?? ''} name={toolCall.name || ''} />;
    } else if (isToolCall) {
      return (
        <ToolCall
          args={toolCall.args ?? ''}
          name={toolCall.name || ''}
          output={toolCall.output ?? ''}
          initialProgress={toolCall.progress ?? 0.1}
          isSubmitting={isSubmitting}
          attachments={attachments}
          auth={toolCall.auth}
          isLast={isLast}
          hideAttachments={hideAttachments}
        />
      );
    } else if (toolCall.type === ToolCallTypes.CODE_INTERPRETER) {
      const code_interpreter = toolCall[ToolCallTypes.CODE_INTERPRETER];
      return (
        <CodeAnalyze
          initialProgress={toolCall.progress ?? 0.1}
          code={code_interpreter.input}
          outputs={code_interpreter.outputs ?? []}
        />
      );
    } else if (
      toolCall.type === ToolCallTypes.RETRIEVAL ||
      toolCall.type === ToolCallTypes.FILE_SEARCH
    ) {
      return (
        <RetrievalCall
          initialProgress={toolCall.progress ?? 0.1}
          isSubmitting={isSubmitting}
          output={(toolCall as { output?: string }).output}
          attachments={attachments}
        />
      );
    } else if (
      toolCall.type === ToolCallTypes.FUNCTION &&
      ToolCallTypes.FUNCTION in toolCall &&
      imageGenTools.has(toolCall.function.name)
    ) {
      return (
        <ImageGen
          initialProgress={toolCall.progress ?? 0.1}
          args={toolCall.function.arguments as string}
          isSubmitting={isSubmitting}
          toolName={toolCall.function.name}
          output={toolCall.function.output ?? ''}
        />
      );
    } else if (toolCall.type === ToolCallTypes.FUNCTION && ToolCallTypes.FUNCTION in toolCall) {
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
          hideAttachments={hideAttachments}
        />
      );
    }
  } else if (part.type === ContentTypes.IMAGE_FILE) {
    const imageFile = part[ContentTypes.IMAGE_FILE];
    const cached = imageFile.file_id ? getCachedPreview(imageFile.file_id) : undefined;
    return (
      <Image
        imagePath={cached ?? imageFile.filepath}
        altText={imageFile.filename ?? 'Uploaded Image'}
        width={imageFile.width}
        height={imageFile.height}
      />
    );
  }

  return null;
});
Part.displayName = 'Part';

export default Part;
