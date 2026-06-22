import { jsPDF } from 'jspdf';
import download from 'downloadjs';
import { useCallback } from 'react';
import { toCanvas } from 'html-to-image';
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
import { cleanupPreset, getBklDisplayText } from '~/utils';

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
   * Build an off-screen DOM representation of the conversation for PDF rendering.
   * Korean glyphs are rendered by the browser's own fonts and captured to a raster
   * image (see `exportPDF`), so no Hangul-capable font binary needs to be embedded.
   */
  const buildPDFNode = (messages: (Partial<TMessage> | undefined)[]): HTMLDivElement => {
    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.top = '-10000px';
    container.style.left = '-10000px';
    container.style.width = '794px';
    container.style.boxSizing = 'border-box';
    container.style.padding = '48px';
    container.style.backgroundColor = '#ffffff';
    container.style.color = '#111827';
    container.style.fontFamily =
      "'Apple SD Gothic Neo', 'Malgun Gothic', 'Noto Sans KR', 'Segoe UI', system-ui, sans-serif";
    container.style.fontSize = '14px';
    container.style.lineHeight = '1.6';

    const title = document.createElement('h1');
    title.textContent = conversation?.title ?? 'Conversation';
    title.style.fontSize = '22px';
    title.style.fontWeight = '700';
    title.style.margin = '0 0 12px';
    container.appendChild(title);

    const meta = document.createElement('div');
    meta.style.fontSize = '12px';
    meta.style.color = '#6b7280';
    meta.style.marginBottom = '24px';
    meta.style.paddingBottom = '16px';
    meta.style.borderBottom = '1px solid #e5e7eb';
    const metaLines = [
      `conversationId: ${conversation?.conversationId ?? ''}`,
      `endpoint: ${conversation?.endpoint ?? ''}`,
      `exportAt: ${new Date().toString()}`,
    ];
    for (const line of metaLines) {
      const row = document.createElement('div');
      row.textContent = line;
      meta.appendChild(row);
    }
    container.appendChild(meta);

    for (const message of messages) {
      if (!message) {
        continue;
      }
      const text = getDisplayMessageText(message);
      if (text.length === 0) {
        continue;
      }
      const isUser = message.isCreatedByUser === true;

      const block = document.createElement('div');
      block.style.marginBottom = '20px';

      const sender = document.createElement('div');
      sender.textContent = getDisplaySender(message);
      sender.style.fontWeight = '600';
      sender.style.marginBottom = '4px';
      sender.style.color = isUser ? '#1d4ed8' : '#047857';
      block.appendChild(sender);

      const body = document.createElement('div');
      body.textContent = text;
      body.style.whiteSpace = 'pre-wrap';
      body.style.wordBreak = 'break-word';
      block.appendChild(body);

      container.appendChild(block);
    }

    return container;
  };

  const exportPDF = async () => {
    const messages = await buildMessageTree({
      messageId: conversation?.conversationId,
      message: null,
      messages: getMessageTree(),
      branches: Boolean(exportBranches),
      recursive: false,
    });

    const list = Array.isArray(messages) ? messages : [messages];
    const node = buildPDFNode(list);
    document.body.appendChild(node);

    try {
      const canvas = await toCanvas(node, { backgroundColor: '#ffffff', pixelRatio: 2 });
      const imgData = canvas.toDataURL('image/png');

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      let heightLeft = imgHeight;
      let position = 0;
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft > 0) {
        position -= pageHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      pdf.save(`${filename}.pdf`);
    } finally {
      document.body.removeChild(node);
    }
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
