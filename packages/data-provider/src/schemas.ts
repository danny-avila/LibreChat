import { z } from 'zod';
import { EModelEndpoint } from './types';

export const tMessageSchema = z.object({
  messageId: z.string(),
  conversationId: z.string(),
  clientId: z.string(),
  parentMessageId: z.string(),
  sender: z.string(),
  text: z.string(),
  isCreatedByUser: z.boolean(),
  error: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const eModelEndpointSchema = z.nativeEnum(EModelEndpoint);

export const tPluginAuthConfigSchema = z.object({
  authField: z.string(),
  label: z.string(),
  description: z.string(),
});

export const tPluginSchema = z.object({
  name: z.string(),
  pluginKey: z.string(),
  description: z.string(),
  icon: z.string(),
  authConfig: z.array(tPluginAuthConfigSchema),
  authenticated: z.boolean(),
  isButton: z.boolean().optional(),
});

export const tExampleSchema = z.object({
  input: z.object({
    content: z.string(),
  }),
  output: z.object({
    content: z.string(),
  }),
});

export const tAgentOptionsSchema = z.object({
  agent: z.string(),
  skipCompletion: z.boolean(),
  model: z.string(),
  temperature: z.number(),
});

export const tConversationSchema = z.object({
  conversationId: z.string().nullable(),
  title: z.string(),
  user: z.string().optional(),
  endpoint: eModelEndpointSchema.nullable(),
  suggestions: z.array(z.string()).optional(),
  messages: z.array(tMessageSchema).optional(),
  tools: z.array(tPluginSchema).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  systemMessage: z.string().optional(),
  modelLabel: z.string().optional(),
  examples: z.array(tExampleSchema).optional(),
  chatGptLabel: z.string().nullable(),
  userLabel: z.string().optional(),
  model: z.string().optional(),
  promptPrefix: z.string().nullable(),
  temperature: z.number().optional(),
  topP: z.number().optional(),
  topK: z.number().optional(),
  context: z.string().optional(),
  top_p: z.number().optional(),
  frequency_penalty: z.number().optional(),
  presence_penalty: z.number().optional(),
  jailbreak: z.boolean().optional(),
  jailbreakConversationId: z.string().optional(),
  conversationSignature: z.string().optional(),
  parentMessageId: z.string().optional(),
  clientId: z.string().optional(),
  invocationId: z.string().optional(),
  toneStyle: z.string().optional(),
  maxOutputTokens: z.number().optional(),
  agentOptions: tAgentOptionsSchema.optional(),
});

export const tPresetSchema = tConversationSchema
  .omit({ conversationId: true })
  .merge(z.object({ conversationId: z.string().optional() }));
