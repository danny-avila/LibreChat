import { useCallback } from 'react';
import download from 'downloadjs';
import { useParams } from 'react-router-dom';
import exportFromJSON from 'export-from-json';
import { useQueryClient } from '@tanstack/react-query';
import { buildTree, QueryKeys } from 'librechat-data-provider';
import type { TConversation, TMessage, TPreset } from 'librechat-data-provider';
import useBuildMessageTree from '~/hooks/Messages/useBuildMessageTree';
import { useScreenshot } from '~/hooks/ScreenshotContext';
import { formatMessageText } from './format';
import { cleanupPreset } from '~/utils';
import { useLocalize } from '~/hooks';

type ExportValues = {
  fieldName: string;
  fieldValues: string[];
};
type ExportEntries = ExportValues[];

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
  const localize = useLocalize();

  const { conversationId: paramId } = useParams();

  const getMessageTree = useCallback(() => {
    const queryParam =
      paramId === 'new' ? paramId : (conversation?.conversationId ?? paramId ?? '');
    const messages = queryClient.getQueryData<TMessage[]>([QueryKeys.messages, queryParam]) ?? [];
    const dataTree = buildTree({ messages });
    return dataTree?.length === 0 ? null : (dataTree ?? null);
  }, [paramId, conversation?.conversationId, queryClient]);

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

  const exportCSV = async () => {
    const data: Partial<TMessage>[] = [];

    const messages = await buildMessageTree({
      messageId: conversation?.conversationId,
      message: null,
      messages: getMessageTree(),
      branches: Boolean(exportBranches),
      recursive: false,
    });

    if (Array.isArray(messages)) {
      for (const message of messages) {
        if (!message) {
          continue;
        }
        data.push(message);
      }
    } else {
      data.push(messages);
    }

    exportFromJSON({
      data: data,
      fileName: filename,
      extension: 'csv',
      exportType: exportFromJSON.types.csv,
      beforeTableEncode: (entries: ExportEntries | undefined) => [
        {
          fieldName: 'sender',
          fieldValues: entries?.find((e) => e.fieldName == 'sender')?.fieldValues ?? [],
        },
        {
          fieldName: 'text',
          fieldValues: entries?.find((e) => e.fieldName == 'text')?.fieldValues ?? [],
        },
        {
          fieldName: 'isCreatedByUser',
          fieldValues: entries?.find((e) => e.fieldName == 'isCreatedByUser')?.fieldValues ?? [],
        },
        {
          fieldName: 'error',
          fieldValues: entries?.find((e) => e.fieldName == 'error')?.fieldValues ?? [],
        },
        {
          fieldName: 'unfinished',
          fieldValues: entries?.find((e) => e.fieldName == 'unfinished')?.fieldValues ?? [],
        },
        {
          fieldName: 'messageId',
          fieldValues: entries?.find((e) => e.fieldName == 'messageId')?.fieldValues ?? [],
        },
        {
          fieldName: 'parentMessageId',
          fieldValues: entries?.find((e) => e.fieldName == 'parentMessageId')?.fieldValues ?? [],
        },
        {
          fieldName: 'createdAt',
          fieldValues: entries?.find((e) => e.fieldName == 'createdAt')?.fieldValues ?? [],
        },
      ],
    });
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
        data += `${formatMessageText({ message, format: 'md', localize })}\n`;
        if (message?.error) {
          data += '*(This is an error message)*\n';
        }
        if (message?.unfinished === true) {
          data += '*(This is an unfinished message)*\n';
        }
        data += '\n\n';
      }
    } else {
      data += `${formatMessageText({ message: messages, format: 'md', localize })}\n`;
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
        data += `${formatMessageText({ message, localize })}\n`;
        if (message?.error) {
          data += '(This is an error message)\n';
        }
        if (message?.unfinished === true) {
          data += '(This is an unfinished message)\n';
        }
        data += '\n\n';
      }
    } else {
      data += `${formatMessageText({ message: messages, localize })}\n`;
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

  const exportConversation = () => {
    if (type === 'json') {
      exportJSON();
    } else if (type == 'text') {
      exportText();
    } else if (type == 'markdown') {
      exportMarkdown();
    } else if (type == 'csv') {
      exportCSV();
    } else if (type == 'screenshot') {
      exportScreenshot();
    }
  };

  return { exportConversation };
}
