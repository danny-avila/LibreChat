import type { ContentFieldMap, ContentSource, TextContentFragment } from '../types';
import {
  ContentTraversalLimitError,
  isDataUri,
  shouldIncludeNestedSubmittedText,
  visitNestedStrings,
} from './nested';

export interface ExternalMessagePart {
  readonly type?: string;
  readonly text?: string;
  readonly data?: string;
  readonly url?: string;
  readonly source_type?: string;
  readonly image_url?: string | { readonly url?: string };
  readonly file_id?: string;
  readonly file_data?: string;
  readonly filename?: string;
  readonly source?: {
    readonly type?: string;
    readonly data?: string;
    readonly url?: string;
    readonly [key: string]: unknown;
  };
  readonly input_audio?: {
    readonly data?: string;
    readonly format?: string;
  };
  readonly file?: {
    readonly file_id?: string;
    readonly file_data?: string;
    readonly filename?: string;
  };
  readonly [key: string]: unknown;
}

export interface ExternalToolCall {
  readonly function?: {
    readonly name?: string;
    readonly arguments?: string;
  };
}

export interface ExternalChatMessage {
  readonly role?: string;
  readonly name?: string;
  readonly content?: string | readonly (ExternalMessagePart | null | undefined)[];
  readonly tool_calls?: readonly (ExternalToolCall | null | undefined)[];
}

function createMessageFragment<Source extends ContentSource>(
  id: string,
  path: TextContentFragment['path'],
  text: string,
  source: Source,
  field: ContentFieldMap[Source],
  format: TextContentFragment['format'] = 'plain',
  treatment: TextContentFragment['treatment'] = 'replaceable',
): Extract<TextContentFragment, { source: Source }> {
  return {
    id,
    path,
    text,
    source,
    field,
    format,
    treatment,
    provenance: 'user',
  } as Extract<TextContentFragment, { source: Source }>;
}

type InlineFileTextField = 'content' | 'extracted_text';

interface ProviderReference {
  readonly key: string;
  readonly value: string;
  readonly path: TextContentFragment['path'];
}

interface InspectableReference {
  readonly key: string;
  readonly value: string | undefined;
  readonly path: TextContentFragment['path'];
  readonly format: TextContentFragment['format'];
  readonly fileField: ContentFieldMap['file'] | undefined;
}

interface ProviderInlineText {
  readonly key: string;
  readonly value: string;
  readonly path: TextContentFragment['path'];
  readonly fileField: InlineFileTextField;
  readonly includeAsMessageContent: boolean;
}

interface ProviderPartClassification {
  readonly handledPaths: ReadonlySet<string>;
  readonly references: readonly ProviderReference[];
  readonly inlineTexts: readonly ProviderInlineText[];
}

const PROVIDER_ATTACHMENT_TYPES = new Set(['document', 'file', 'image']);
const PROVIDER_DOCUMENT_TYPES = new Set(['document', 'file']);

function classifyProviderPart(
  part: ExternalMessagePart,
  basePath: TextContentFragment['path'],
): ProviderPartClassification {
  const handledPaths = new Set<string>();
  const references: ProviderReference[] = [];
  const inlineTexts: ProviderInlineText[] = [];
  if (!PROVIDER_ATTACHMENT_TYPES.has(part.type ?? '')) {
    return { handledPaths, references, inlineTexts };
  }

  const seenReferences = new Set<string>();
  const addReference = (
    key: string,
    value: string | undefined,
    path: TextContentFragment['path'],
  ): void => {
    handledPaths.add(path);
    if (
      typeof value !== 'string' ||
      value.length === 0 ||
      isDataUri(value) ||
      seenReferences.has(value)
    ) {
      return;
    }
    seenReferences.add(value);
    references.push({ key, value, path });
  };
  const addInlineText = (
    key: string,
    value: string | undefined,
    path: TextContentFragment['path'],
    fileField: InlineFileTextField,
    includeAsMessageContent: boolean,
  ): void => {
    handledPaths.add(path);
    if (typeof value !== 'string' || value.length === 0 || isDataUri(value)) {
      return;
    }
    inlineTexts.push({ key, value, path, fileField, includeAsMessageContent });
  };

  const sourceType = part.source?.type;
  if (sourceType === 'url') {
    addReference('source-data', part.source?.data, `${basePath}/source/data`);
    addReference('source-url', part.source?.url, `${basePath}/source/url`);
  } else if (sourceType === 'text' && PROVIDER_DOCUMENT_TYPES.has(part.type ?? '')) {
    addInlineText(
      'source-data',
      part.source?.data,
      `${basePath}/source/data`,
      'content',
      part.source?.data !== part.text,
    );
  } else if (sourceType === 'base64') {
    handledPaths.add(`${basePath}/source/data`);
  }

  if (typeof part.source_type !== 'string') {
    return { handledPaths, references, inlineTexts };
  }
  handledPaths.add(`${basePath}/source_type`);
  if (part.source_type === 'url') {
    addReference('data', part.data, `${basePath}/data`);
    addReference('url', part.url, `${basePath}/url`);
  } else if (part.source_type === 'text' && PROVIDER_DOCUMENT_TYPES.has(part.type ?? '')) {
    addInlineText('text', part.text, `${basePath}/text`, 'extracted_text', false);
  } else if (part.source_type === 'base64') {
    handledPaths.add(`${basePath}/data`);
  }

  return { handledPaths, references, inlineTexts };
}

export function* extractMessageContent(
  messages: readonly (ExternalChatMessage | null | undefined)[],
): Generator<TextContentFragment, void, undefined> {
  let traversalComplete = true;
  for (let messageIndex = 0; messageIndex < messages.length; messageIndex++) {
    const message = messages[messageIndex];
    if (message == null) {
      continue;
    }
    const assembledText: string[] = [];
    if (typeof message.name === 'string' && message.name.length > 0) {
      yield createMessageFragment(
        `external-message.${messageIndex}.name`,
        `/${messageIndex}/name`,
        message.name,
        'message',
        'name',
      );
    }
    const content = message.content;
    const isInstruction = message.role === 'system' || message.role === 'developer';
    if (typeof content === 'string') {
      assembledText.push(content);
      yield createMessageFragment(
        `external-message.${messageIndex}.content`,
        `/${messageIndex}/content`,
        content,
        'message',
        'text',
      );
      if (isInstruction) {
        yield createMessageFragment(
          `external-message.${messageIndex}.instruction`,
          `/${messageIndex}/content`,
          content,
          'agent_instruction',
          'instructions',
        );
      }
      if (message.role === 'tool') {
        yield createMessageFragment(
          `external-message.${messageIndex}.tool-output`,
          `/${messageIndex}/content`,
          content,
          'tool_argument',
          'output',
          'plain',
          'inspect_only',
        );
      }
    }
    if (Array.isArray(content)) {
      for (let partIndex = 0; partIndex < content.length; partIndex++) {
        const part = content[partIndex];
        const directText =
          typeof part?.text === 'string' && !isDataUri(part.text) ? part.text : undefined;
        if (directText != null) {
          assembledText.push(directText);
          yield createMessageFragment(
            `external-message.${messageIndex}.part.${partIndex}`,
            `/${messageIndex}/content/${partIndex}/text`,
            directText,
            'message',
            'content_part',
          );
          if (isInstruction) {
            yield createMessageFragment(
              `external-message.${messageIndex}.part.${partIndex}.instruction`,
              `/${messageIndex}/content/${partIndex}/text`,
              directText,
              'agent_instruction',
              'instructions',
            );
          }
          if (message.role === 'tool') {
            yield createMessageFragment(
              `external-message.${messageIndex}.part.${partIndex}.tool-output`,
              `/${messageIndex}/content/${partIndex}/text`,
              directText,
              'tool_argument',
              'output',
              'plain',
              'inspect_only',
            );
          }
        }
        let uri: string | undefined;
        if (typeof part?.image_url === 'string') {
          uri = part.image_url;
        } else if (typeof part?.image_url?.url === 'string') {
          uri = part.image_url.url;
        }
        const basePath = `/${messageIndex}/content/${partIndex}` as const;
        const providerPart = part == null ? undefined : classifyProviderPart(part, basePath);
        const inspectableUri = uri != null && !isDataUri(uri) ? uri : undefined;
        const references: InspectableReference[] = [
          {
            key: 'uri',
            value: inspectableUri,
            path: `/${messageIndex}/content/${partIndex}/image_url`,
            format: 'uri' as const,
            fileField: 'uri' as const,
          },
          {
            key: 'file-id',
            value: part?.file_id,
            path: `/${messageIndex}/content/${partIndex}/file_id`,
            format: 'plain' as const,
            fileField: undefined,
          },
          {
            key: 'filename',
            value: part?.filename,
            path: `/${messageIndex}/content/${partIndex}/filename`,
            format: 'plain' as const,
            fileField: 'name' as const,
          },
          {
            key: 'nested-file-id',
            value: part?.file?.file_id,
            path: `/${messageIndex}/content/${partIndex}/file/file_id`,
            format: 'plain' as const,
            fileField: undefined,
          },
          {
            key: 'nested-filename',
            value: part?.file?.filename,
            path: `/${messageIndex}/content/${partIndex}/file/filename`,
            format: 'plain' as const,
            fileField: 'name' as const,
          },
          ...(providerPart?.references.map((reference) => ({
            ...reference,
            format: 'uri' as const,
            fileField: 'uri' as const,
          })) ?? []),
        ];
        const seenAttachmentReferences = new Set<string>();
        const seenFileReferences = new Set<string>();
        for (const reference of references) {
          if (typeof reference.value !== 'string' || reference.value.length === 0) {
            continue;
          }
          if (!seenAttachmentReferences.has(reference.value)) {
            seenAttachmentReferences.add(reference.value);
            yield createMessageFragment(
              `external-message.${messageIndex}.part.${partIndex}.attachment.${reference.key}`,
              reference.path,
              reference.value,
              'message',
              'attachment_reference',
              reference.format,
              'inspect_only',
            );
          }
          if (
            reference.fileField == null ||
            seenFileReferences.has(`${reference.fileField}:${reference.value}`)
          ) {
            continue;
          }
          seenFileReferences.add(`${reference.fileField}:${reference.value}`);
          yield createMessageFragment(
            `external-message.${messageIndex}.part.${partIndex}.file.${reference.key}`,
            reference.path,
            reference.value,
            'file',
            reference.fileField,
            reference.format,
            'inspect_only',
          );
        }

        for (const inlineText of providerPart?.inlineTexts ?? []) {
          if (inlineText.includeAsMessageContent) {
            assembledText.push(inlineText.value);
            yield createMessageFragment(
              `external-message.${messageIndex}.part.${partIndex}.provider.${inlineText.key}`,
              inlineText.path,
              inlineText.value,
              'message',
              'content_part',
            );
            if (isInstruction) {
              yield createMessageFragment(
                `external-message.${messageIndex}.part.${partIndex}.provider.${inlineText.key}.instruction`,
                inlineText.path,
                inlineText.value,
                'agent_instruction',
                'instructions',
              );
            }
            if (message.role === 'tool') {
              yield createMessageFragment(
                `external-message.${messageIndex}.part.${partIndex}.provider.${inlineText.key}.tool-output`,
                inlineText.path,
                inlineText.value,
                'tool_argument',
                'output',
                'plain',
                'inspect_only',
              );
            }
          }
          yield createMessageFragment(
            `external-message.${messageIndex}.part.${partIndex}.file.${inlineText.key}`,
            inlineText.path,
            inlineText.value,
            'file',
            inlineText.fileField,
            'plain',
            'inspect_only',
          );
        }

        if (part == null) {
          continue;
        }
        const handledPaths = new Set([
          `${basePath}/type`,
          `${basePath}/text`,
          `${basePath}/image_url`,
          `${basePath}/file_id`,
          `${basePath}/file_data`,
          `${basePath}/filename`,
          `${basePath}/input_audio`,
          `${basePath}/file`,
          `${basePath}/file/file_id`,
          `${basePath}/file/file_data`,
          `${basePath}/file/filename`,
          ...(providerPart?.handledPaths ?? []),
        ]);
        let nestedIndex = 0;
        const nestedFragments: TextContentFragment[] = [];
        const complete = visitNestedStrings(
          part,
          basePath,
          (nestedText, nestedPath) => {
            assembledText.push(nestedText);
            nestedFragments.push(
              createMessageFragment(
                `external-message.${messageIndex}.part.${partIndex}.nested.${nestedIndex}`,
                nestedPath,
                nestedText,
                'message',
                'content_part',
              ),
            );
            if (isInstruction) {
              nestedFragments.push(
                createMessageFragment(
                  `external-message.${messageIndex}.part.${partIndex}.nested.${nestedIndex}.instruction`,
                  nestedPath,
                  nestedText,
                  'agent_instruction',
                  'instructions',
                ),
              );
            }
            if (message.role === 'tool') {
              nestedFragments.push(
                createMessageFragment(
                  `external-message.${messageIndex}.part.${partIndex}.nested.${nestedIndex}.tool-output`,
                  nestedPath,
                  nestedText,
                  'tool_argument',
                  'output',
                  'plain',
                  'inspect_only',
                ),
              );
            }
            nestedIndex++;
          },
          {
            includeKeys: true,
            shouldVisit: ({ path, value }) =>
              !handledPaths.has(path) &&
              !(path === `${basePath}/source` && typeof value === 'string' && value === 'source'),
            shouldInclude: shouldIncludeNestedSubmittedText,
          },
        );
        yield* nestedFragments;
        if (!complete) {
          traversalComplete = false;
        }
      }
    }

    if (assembledText.length > 1) {
      const text = assembledText.join('');
      yield createMessageFragment(
        `external-message.${messageIndex}.assembled`,
        `/${messageIndex}/content`,
        text,
        'assembled_context',
        'assembled_context',
        'plain',
        'inspect_only',
      );
      if (isInstruction) {
        yield createMessageFragment(
          `external-message.${messageIndex}.assembled.instruction`,
          `/${messageIndex}/content`,
          text,
          'agent_instruction',
          'instructions',
          'plain',
          'inspect_only',
        );
      }
      if (message.role === 'tool') {
        yield createMessageFragment(
          `external-message.${messageIndex}.assembled.tool-output`,
          `/${messageIndex}/content`,
          text,
          'tool_argument',
          'output',
          'plain',
          'inspect_only',
        );
      }
    }

    if (!Array.isArray(message.tool_calls)) {
      continue;
    }
    for (let callIndex = 0; callIndex < message.tool_calls.length; callIndex++) {
      const fn = message.tool_calls[callIndex]?.function;
      const name = fn?.name;
      if (typeof name === 'string' && name.length > 0) {
        yield createMessageFragment(
          `external-message.${messageIndex}.tool-call.${callIndex}.name`,
          `/${messageIndex}/tool_calls/${callIndex}/function/name`,
          name,
          'tool_argument',
          'name',
          'plain',
          'inspect_only',
        );
      }
      const args = fn?.arguments;
      if (typeof args !== 'string' || args.length === 0) {
        continue;
      }
      yield createMessageFragment(
        `external-message.${messageIndex}.tool-call.${callIndex}.arguments`,
        `/${messageIndex}/tool_calls/${callIndex}/function/arguments`,
        args,
        'tool_argument',
        'arguments',
        'json',
        'inspect_only',
      );
    }
  }
  if (!traversalComplete) {
    throw new ContentTraversalLimitError();
  }
}
