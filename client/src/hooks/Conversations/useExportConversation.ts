import download from 'downloadjs';
import { useCallback } from 'react';
import { useParams } from 'react-router-dom';
import exportFromJSON from 'export-from-json';
import { useQueryClient } from '@tanstack/react-query';
import {
  buildTree,
  QueryKeys,
  ContentTypes,
  ToolCallTypes,
  imageGenTools,
  isImageVisionTool,
} from 'librechat-data-provider';
import type {
  TMessageContentParts,
  TConversation,
  TMessage,
  TPreset,
} from 'librechat-data-provider';
import useBuildMessageTree from '~/hooks/Messages/useBuildMessageTree';
import { useScreenshot } from '~/hooks/ScreenshotContext';
import { useConversationSources } from '~/data-provider/Sources';
import { cleanupPreset, getBklDisplayText } from '~/utils';
import {
  buildPrintHtml,
  printHtmlDocument,
  renderMarkdownToHtml,
  replaceCitationsWithFilenames,
} from '~/utils/exportPrint';
import type { PrintBlock } from '~/utils/exportPrint';
import { sourcesForMessage } from '~/components/Chat/BklPanel/useConversationCitations';
import type { BklSource } from '~/components/Chat/Messages/Content/ChunkModal';

export default function useExportConversation({
  conversation,
  filename,
  type,
  includeOptions,
  exportBranches,
  recursive,
}: {
  conversation: TConversation | null;
  filename: string;
  type: string;
  includeOptions: boolean | 'indeterminate';
  exportBranches: boolean | 'indeterminate';
  recursive: boolean | 'indeterminate';
}) {
  const queryClient = useQueryClient();
  const { captureScreenshot } = useScreenshot();
  const buildMessageTree = useBuildMessageTree();
  // PDF 인용 치환용 — 답변별 저장 출처(bkl_chat_sources). 실패해도 내보내기는 진행.
  const sourcesQuery = useConversationSources(conversation?.conversationId);

  const { conversationId: paramId } = useParams();

  const getMessageTree = useCallback(() => {
    const queryParam =
      paramId === 'new' ? paramId : (conversation?.conversationId ?? paramId ?? '');
    const messages = queryClient.getQueryData<TMessage[]>([QueryKeys.messages, queryParam]) ?? [];
    const dataTree = buildTree({ messages });
    return dataTree?.length === 0 ? null : (dataTree ?? null);
  }, [paramId, conversation?.conversationId, queryClient]);

  const getMessageText = (message: Partial<TMessage> | undefined, format = 'text') => {
    if (!message) {
      return '';
    }

    const formatText = (sender: string, text: string) => {
      if (format === 'text') {
        return `>> ${sender}:\n${text}`;
      }
      return `**${sender}**\n${text}`;
    };

    if (!message.content) {
      return formatText(message.sender || '', message.text || '');
    }

    return message.content
      .filter((content) => content != null)
      .map((content) => getMessageContent(message.sender || '', content))
      .filter((text) => text.length > 0)
      .map((text) => {
        return formatText(text[0], text[1]);
      })
      .join('\n\n\n');
  };

  /**
   * Format and return message texts according to the type of content.
   * Currently, content whose type is `TOOL_CALL` basically returns JSON as is.
   * In the future, different formatted text may be returned for each type.
   */
  const getMessageContent = (sender: string, content?: TMessageContentParts): string[] => {
    if (!content) {
      return [];
    }

    if (content.type === ContentTypes.ERROR) {
      // ERROR
      return [
        sender,
        typeof content[ContentTypes.TEXT] === 'object'
          ? (content[ContentTypes.TEXT].value ?? '')
          : (content[ContentTypes.TEXT] ?? ''),
      ];
    }

    if (content.type === ContentTypes.TEXT) {
      // TEXT
      const textPart = content[ContentTypes.TEXT];
      const text = typeof textPart === 'string' ? textPart : (textPart?.value ?? '');
      if (text.trim().length === 0) {
        return [];
      }
      return [sender, text];
    }

    if (content.type === ContentTypes.TOOL_CALL) {
      const type = content[ContentTypes.TOOL_CALL].type;

      if (type === ToolCallTypes.CODE_INTERPRETER) {
        // CODE_INTERPRETER
        const toolCall = content[ContentTypes.TOOL_CALL];
        const code_interpreter = toolCall[ToolCallTypes.CODE_INTERPRETER];
        return ['Code Interpreter', JSON.stringify(code_interpreter)];
      }

      if (type === ToolCallTypes.RETRIEVAL) {
        // RETRIEVAL
        const toolCall = content[ContentTypes.TOOL_CALL];
        return ['Retrieval', JSON.stringify(toolCall)];
      }

      if (
        type === ToolCallTypes.FUNCTION &&
        imageGenTools.has(content[ContentTypes.TOOL_CALL].function.name)
      ) {
        // IMAGE_GENERATION
        const toolCall = content[ContentTypes.TOOL_CALL];
        return ['Tool', JSON.stringify(toolCall)];
      }

      if (type === ToolCallTypes.FUNCTION) {
        // IMAGE_VISION
        const toolCall = content[ContentTypes.TOOL_CALL];
        if (isImageVisionTool(toolCall)) {
          return ['Tool', JSON.stringify(toolCall)];
        }
        return ['Tool', JSON.stringify(toolCall)];
      }
    }

    if (content.type === ContentTypes.IMAGE_FILE) {
      // IMAGE
      const imageFile = content[ContentTypes.IMAGE_FILE];
      return ['Image', JSON.stringify(imageFile)];
    }

    return [sender, JSON.stringify(content)];
  };

  /**
   * Resolve the user-facing text of a message exactly as the chat UI renders it:
   * prefer the structured `content[]` text/error parts, fall back to `message.text`,
   * and strip BKL control tags (citations internals, filter/query-enhance markers).
   */
  const getDisplayMessageText = (message: Partial<TMessage> | undefined): string => {
    if (!message) {
      return '';
    }

    if (!message.content) {
      return getBklDisplayText(message.text ?? '').trim();
    }

    return message.content
      .filter((content) => content != null)
      .map((content) => {
        if (content.type === ContentTypes.TEXT) {
          const textPart = content[ContentTypes.TEXT];
          return typeof textPart === 'string' ? textPart : (textPart?.value ?? '');
        }
        if (content.type === ContentTypes.ERROR) {
          const textPart = content[ContentTypes.TEXT];
          return typeof textPart === 'object' ? (textPart.value ?? '') : (textPart ?? '');
        }
        return '';
      })
      .map((text) => getBklDisplayText(text))
      .filter((text) => text.trim().length > 0)
      .join('\n\n')
      .trim();
  };

  const getDisplaySender = (message: Partial<TMessage>): string => {
    if (message.sender != null && message.sender.length > 0) {
      return message.sender;
    }
    return message.isCreatedByUser === true ? 'User' : 'Assistant';
  };

  const exportScreenshot = async () => {
    let data;
    try {
      data = await captureScreenshot();
    } catch (err) {
      console.error('Failed to capture screenshot');
      return console.error(err);
    }
    download(data, `${filename}.png`, 'image/png');
  };

  const escapeCSVField = (value: string): string => `"${value.replace(/"/g, '""')}"`;

  const exportCSV = async () => {
    const messages = await buildMessageTree({
      messageId: conversation?.conversationId,
      message: null,
      messages: getMessageTree(),
      branches: Boolean(exportBranches),
      recursive: false,
    });

    const list = Array.isArray(messages) ? messages : [messages];

    const columns = ['sender', 'role', 'timestamp', 'model', 'text'];
    const rows = [columns.map(escapeCSVField).join(',')];

    for (const message of list) {
      if (!message) {
        continue;
      }
      const fields = [
        getDisplaySender(message),
        message.isCreatedByUser === true ? 'user' : 'assistant',
        message.createdAt ?? '',
        message.model ?? '',
        getDisplayMessageText(message),
      ];
      rows.push(fields.map(escapeCSVField).join(','));
    }

    /** Prepend a UTF-8 BOM so Excel detects the encoding and renders Korean correctly. */
    const csv = '\uFEFF' + rows.join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    download(blob, `${filename}.csv`, 'text/csv;charset=utf-8');
  };

  const exportMarkdown = async () => {
    let data =
      '# Conversation\n' +
      `- conversationId: ${conversation?.conversationId}\n` +
      `- endpoint: ${conversation?.endpoint}\n` +
      `- title: ${conversation?.title}\n` +
      `- exportAt: ${new Date().toTimeString()}\n`;

    if (includeOptions === true) {
      data += '\n## Options\n';
      const options = cleanupPreset({ preset: conversation as TPreset });

      for (const key of Object.keys(options)) {
        data += `- ${key}: ${options[key]}\n`;
      }
    }

    const messages = await buildMessageTree({
      messageId: conversation?.conversationId,
      message: null,
      messages: getMessageTree(),
      branches: false,
      recursive: false,
    });

    data += '\n## History\n';
    if (Array.isArray(messages)) {
      for (const message of messages) {
        data += `${getMessageText(message, 'md')}\n`;
        if (message?.error) {
          data += '*(This is an error message)*\n';
        }
        if (message?.unfinished === true) {
          data += '*(This is an unfinished message)*\n';
        }
        data += '\n\n';
      }
    } else {
      data += `${getMessageText(messages, 'md')}\n`;
      if (messages.error) {
        data += '*(This is an error message)*\n';
      }
      if (messages.unfinished === true) {
        data += '*(This is an unfinished message)*\n';
      }
    }

    exportFromJSON({
      data: data,
      fileName: filename,
      extension: 'md',
      exportType: exportFromJSON.types.txt,
    });
  };

  const exportText = async () => {
    let data =
      'Conversation\n' +
      '########################\n' +
      `conversationId: ${conversation?.conversationId}\n` +
      `endpoint: ${conversation?.endpoint}\n` +
      `title: ${conversation?.title}\n` +
      `exportAt: ${new Date().toTimeString()}\n`;

    if (includeOptions === true) {
      data += '\nOptions\n########################\n';
      const options = cleanupPreset({ preset: conversation as TPreset });

      for (const key of Object.keys(options)) {
        data += `${key}: ${options[key]}\n`;
      }
    }

    const messages = await buildMessageTree({
      messageId: conversation?.conversationId,
      message: null,
      messages: getMessageTree(),
      branches: false,
      recursive: false,
    });

    data += '\nHistory\n########################\n';
    if (Array.isArray(messages)) {
      for (const message of messages) {
        data += `${getMessageText(message)}\n`;
        if (message?.error) {
          data += '(This is an error message)\n';
        }
        if (message?.unfinished === true) {
          data += '(This is an unfinished message)\n';
        }
        data += '\n\n';
      }
    } else {
      data += `${getMessageText(messages)}\n`;
      if (messages.error) {
        data += '(This is an error message)\n';
      }
      if (messages.unfinished === true) {
        data += '(This is an unfinished message)\n';
      }
    }

    exportFromJSON({
      data: data,
      fileName: filename,
      extension: 'txt',
      exportType: exportFromJSON.types.txt,
    });
  };

  const exportJSON = async () => {
    const data = {
      conversationId: conversation?.conversationId,
      endpoint: conversation?.endpoint,
      title: conversation?.title,
      exportAt: new Date().toTimeString(),
      branches: exportBranches,
      recursive: recursive,
    };

    if (includeOptions === true) {
      data['options'] = cleanupPreset({ preset: conversation as TPreset });
    }

    const messages = await buildMessageTree({
      messageId: conversation?.conversationId,
      message: null,
      messages: getMessageTree(),
      branches: Boolean(exportBranches),
      recursive: Boolean(recursive),
    });

    if (recursive === true && !Array.isArray(messages)) {
      data['messagesTree'] = messages.children;
    } else {
      data['messages'] = messages;
    }

    /** Use JSON.stringify without indentation to minimize file size for deeply nested recursive exports */
    const jsonString = JSON.stringify(data);
    const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' });
    download(blob, `${filename}.json`, 'application/json');
  };

  /**
   * PDF 내보내기 (2026-08-26 재작성) — 래스터 캡처(jsPDF+html-to-image, 2페이지
   * 14MB) 대신 마크다운을 실제 렌더링한 인쇄 문서를 만들어 브라우저 네이티브
   * 인쇄 대화상자(→ PDF 저장)를 띄운다. 벡터 텍스트라 용량이 작고 선택·검색이
   * 되며, 답변의 인용 [N] 은 저장된 출처(bkl_chat_sources)로 실제 파일명 치환.
   */
  const exportPDF = async () => {
    const messages = await buildMessageTree({
      messageId: conversation?.conversationId,
      message: null,
      messages: getMessageTree(),
      branches: Boolean(exportBranches),
      recursive: false,
    });

    const list = Array.isArray(messages) ? messages : [messages];

    const apiByMessage = new Map<string, BklSource[]>();
    for (const row of sourcesQuery.data?.messages ?? []) {
      apiByMessage.set(row.message_id, (row.sources ?? []) as BklSource[]);
    }

    const blocks: PrintBlock[] = [];
    for (const message of list) {
      if (!message) {
        continue;
      }
      let text = getDisplayMessageText(message);
      if (text.length === 0) {
        continue;
      }
      const isUser = message.isCreatedByUser === true;
      if (!isUser && message.messageId) {
        const sources = sourcesForMessage(apiByMessage, message.messageId);
        text = replaceCitationsWithFilenames(text, sources);
      }
      blocks.push({
        sender: getDisplaySender(message),
        isUser,
        html: await renderMarkdownToHtml(text),
      });
    }

    const html = buildPrintHtml({
      title: conversation?.title ?? 'Conversation',
      documentTitle: filename,
      metaLines: [
        `대화 ID: ${conversation?.conversationId ?? ''}`,
        `내보낸 시각: ${new Date().toLocaleString('ko-KR')}`,
      ],
      blocks,
    });
    await printHtmlDocument(html);
  };

  const exportConversation = () => {
    if (type === 'json') {
      exportJSON();
    } else if (type == 'text') {
      exportText();
    } else if (type == 'markdown') {
      exportMarkdown();
    } else if (type == 'csv') {
      exportCSV();
    } else if (type == 'pdf') {
      exportPDF();
    } else if (type == 'screenshot') {
      exportScreenshot();
    }
  };

  return { exportConversation };
}
