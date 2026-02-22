import mongoose from 'mongoose';
import { logger } from '@librechat/data-schemas';

import type { IMessage } from '@librechat/data-schemas';

type MessageProjection = Pick<IMessage, 'messageId' | 'sender' | 'text' | 'isCreatedByUser' | 'createdAt'>;

function formatMessages(messages: MessageProjection[]): string {
  if (!messages.length) {
    return 'No messages found.';
  }

  return messages
    .map((m) => {
      const role = m.isCreatedByUser ? 'User' : 'Assistant';
      return `[${role}]: ${m.text ?? '(no text)'}`;
    })
    .join('\n\n');
}

export async function readFullConversation(
  conversationId: string,
  userId: string,
): Promise<string> {
  try {
    const Message = mongoose.models.Message;
    const messages = await Message.find({
      conversationId,
      user: userId,
    })
      .sort({ createdAt: 1 })
      .select('messageId sender text isCreatedByUser createdAt')
      .lean<MessageProjection[]>();

    return formatMessages(messages);
  } catch (error) {
    logger.error('[synthesis/tools] Error reading full conversation:', error);
    return 'Error reading conversation.';
  }
}

export async function readConversationExcerpt(
  conversationId: string,
  userId: string,
  startIndex: number,
  endIndex: number,
): Promise<string> {
  try {
    const Message = mongoose.models.Message;
    const messages = await Message.find({
      conversationId,
      user: userId,
    })
      .sort({ createdAt: 1 })
      .skip(startIndex)
      .limit(endIndex - startIndex)
      .select('messageId sender text isCreatedByUser createdAt')
      .lean<MessageProjection[]>();

    return formatMessages(messages);
  } catch (error) {
    logger.error('[synthesis/tools] Error reading conversation excerpt:', error);
    return 'Error reading conversation excerpt.';
  }
}

interface ReadFullConversationArgs {
  conversationId: string;
}

interface ReadConversationExcerptArgs {
  conversationId: string;
  startIndex: number;
  endIndex: number;
}

interface SynthesisToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, { type: string; description: string }>;
      required: string[];
    };
    execute: (args: ReadFullConversationArgs | ReadConversationExcerptArgs) => Promise<string>;
  };
}

export function createSynthesisToolDefinitions(userId: string): SynthesisToolDefinition[] {
  return [
    {
      type: 'function',
      function: {
        name: 'read_full_conversation',
        description:
          'Load the complete message history of a conversation to examine it in detail.',
        parameters: {
          type: 'object',
          properties: {
            conversationId: {
              type: 'string',
              description: 'The ID of the conversation to read',
            },
          },
          required: ['conversationId'],
        },
        execute: async (args: ReadFullConversationArgs | ReadConversationExcerptArgs) => {
          return readFullConversation(args.conversationId, userId);
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'read_conversation_excerpt',
        description:
          'Load a specific range of messages from a conversation (by message index, 0-based).',
        parameters: {
          type: 'object',
          properties: {
            conversationId: {
              type: 'string',
              description: 'The ID of the conversation to read',
            },
            startIndex: {
              type: 'number',
              description: 'Start index (inclusive, 0-based)',
            },
            endIndex: {
              type: 'number',
              description: 'End index (exclusive)',
            },
          },
          required: ['conversationId', 'startIndex', 'endIndex'],
        },
        execute: async (args: ReadFullConversationArgs | ReadConversationExcerptArgs) => {
          const excerptArgs = args as ReadConversationExcerptArgs;
          return readConversationExcerpt(
            excerptArgs.conversationId,
            userId,
            excerptArgs.startIndex,
            excerptArgs.endIndex,
          );
        },
      },
    },
  ];
}
