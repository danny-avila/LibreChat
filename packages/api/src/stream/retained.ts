import {
  ContentTypes,
  mergeEditedMessageContent,
  stripReasoningLabelMetadata,
} from 'librechat-data-provider';
import type {
  Agents,
  TMessage,
  TMessageContentParts,
  UserSubmittedMessageFieldPath,
} from 'librechat-data-provider';
import {
  mergeUserSubmittedPaths,
  mergeUserSubmittedMessageFieldPaths,
} from '~/protection/provenance';
import { isPersistableAbortContentPart } from './abortContent';
import { compactContentParts } from '~/utils/content';

export interface MessageContentProvenance {
  userSubmittedPaths?: readonly string[];
  userSubmittedMessageFieldPaths?: readonly UserSubmittedMessageFieldPath[];
}

export type RetainedContent = Agents.RetainedContent & MessageContentProvenance;

interface EditedContent {
  index: number;
  type: string;
  text?: string;
  think?: string;
}

/** Apply the edit to server-loaded history before capturing its immutable prefix. */
export async function applyRetainedContentEdit(
  message:
    | Pick<
        Partial<TMessage>,
        'content' | 'isUserSubmitted' | 'userSubmittedPaths' | 'userSubmittedMessageFieldPaths'
      >
    | undefined,
  edited: EditedContent | null | undefined,
  capture?: (
    parts: Agents.MessageContentComplex[],
    type: Agents.RetainedContent['type'],
    provenance: MessageContentProvenance,
  ) => void | Promise<void>,
): Promise<void> {
  if (edited == null) {
    return;
  }
  message ??= {};
  const { index, type } = edited;
  const parts = Array.isArray(message.content) ? message.content : [];
  const part = parts[index];
  if (type !== ContentTypes.TEXT && type !== ContentTypes.THINK) {
    throw new Error('Invalid retained content type');
  }
  if (index >= 0 && index < parts.length && part?.type === type) {
    parts[index] = {
      ...stripReasoningLabelMetadata(part),
      [type]: edited[type],
    } as TMessageContentParts;
    message.userSubmittedPaths = mergeUserSubmittedPaths(message.userSubmittedPaths, [
      `/content/${index}/${type}`,
    ]);
  }
  await capture?.(parts, type, {
    userSubmittedPaths: mergeUserSubmittedPaths(
      message.userSubmittedPaths,
      message.isUserSubmitted === true ? parts.map((_, i) => `/content/${i}`) : [],
    ),
    userSubmittedMessageFieldPaths: mergeUserSubmittedMessageFieldPaths(
      message.userSubmittedMessageFieldPaths,
    ),
  });
}

/** Only persistence/FINAL consumers compose the prefix; runtime provenance stays completion-local. */
export function projectRetainedMessageContent(
  completion: Agents.MessageContentComplex[],
  metadata:
    | (MessageContentProvenance & { retainedContent?: RetainedContent; createdAt?: number })
    | null = {},
  options: {
    abort?: boolean;
    provenance?: MessageContentProvenance;
    expectedCreatedAt?: number;
  } = {},
): {
  content: Agents.MessageContentComplex[];
  userSubmittedPaths: string[];
  userSubmittedMessageFieldPaths: UserSubmittedMessageFieldPath[];
} {
  if (options.expectedCreatedAt != null && metadata?.createdAt !== options.expectedCreatedAt) {
    throw new Error('Generation changed before partial response persistence');
  }
  metadata ??= {};
  const completionIndices = new Map<number, number>();
  const retainedIndices = new Map<number, number>();
  const retain = options.abort ? isPersistableAbortContentPart : undefined;
  const generated = compactContentParts(completion as TMessageContentParts[], {
    retain,
    indices: completionIndices,
  });
  const retained = metadata.retainedContent;
  const prefix = compactContentParts((retained?.parts ?? []) as TMessageContentParts[], {
    retain,
    indices: retainedIndices,
  });
  const merged = mergeEditedMessageContent(prefix, generated, retained?.type ?? '');
  const offset = prefix.length - (merged.firstPartMerged ? 1 : 0);
  const userSubmittedPaths: string[] = [];
  const userSubmittedMessageFieldPaths: UserSubmittedMessageFieldPath[] = [];
  const generatedProvenance = options.provenance ?? metadata;

  for (const [provenance, indices, shift] of [
    [retained, retainedIndices, 0],
    [generatedProvenance, completionIndices, offset],
  ] as const) {
    const remap = (path: string): string[] => {
      if (path === '/content') {
        return Array.from(indices.values(), (index) => `/content/${index + shift}`);
      }
      if (!path.startsWith('/content/')) {
        return [path];
      }
      const match = /^\/content\/(0|[1-9]\d*)(\/.*)?$/.exec(path);
      const index = match == null ? undefined : indices.get(Number(match[1]));
      return index == null ? [] : [`/content/${index + shift}${match?.[2] ?? ''}`];
    };
    for (const path of mergeUserSubmittedPaths(provenance?.userSubmittedPaths)) {
      userSubmittedPaths.push(...remap(path));
    }
    for (const entry of mergeUserSubmittedMessageFieldPaths(
      provenance?.userSubmittedMessageFieldPaths,
    )) {
      for (const path of remap(entry.path)) {
        userSubmittedMessageFieldPaths.push({ ...entry, path });
      }
    }
  }
  for (let index = 0; index < merged.content.length; index++) {
    if (merged.content[index]?.type === ContentTypes.STEER) {
      userSubmittedPaths.push(`/content/${index}`);
    }
  }
  return {
    content: merged.content,
    userSubmittedPaths: mergeUserSubmittedPaths(userSubmittedPaths),
    userSubmittedMessageFieldPaths: mergeUserSubmittedMessageFieldPaths(
      userSubmittedMessageFieldPaths,
    ),
  };
}
