/** Server-owned continuation identity is never portable or valid after a text edit. */
type NativeContentPart = {
  type?: string;
  native_media?: { continuationRef?: string };
  thoughtSignature?: string;
  thought_signature?: string;
  image_file?: {
    file_id?: string;
    filepath?: string;
    filename?: string;
    width?: number;
    height?: number;
  };
};

function isContentPart(value: unknown): value is NativeContentPart {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

export function detachNativeIdentity<T extends object>(part: T): T {
  if (!('native_media' in part) && !('thoughtSignature' in part) && !('thought_signature' in part))
    return part;
  const {
    native_media: _reference,
    thoughtSignature: _signature,
    thought_signature: _legacySignature,
    ...visible
  } = part as T & NativeContentPart;
  return visible as T;
}

/** Copies visible content across deployments without reusing owner-bound files or signatures. */
export function portableNativeContent<T>(content: T): T {
  if (!Array.isArray(content)) return content;
  return content.map((part: unknown) => {
    if (!isContentPart(part)) return part;
    const visible = detachNativeIdentity(part);
    if (part.type !== 'image_file' || part.native_media == null) return visible;
    return {
      ...visible,
      image_file: {
        file_id: '',
        filepath: '',
        filename: part.image_file?.filename ?? '',
        width: part.image_file?.width ?? 0,
        height: part.image_file?.height ?? 0,
        unavailable: 'not_transferred',
      },
    };
  }) as T;
}

/** Uses the existing mutation provenance so every persistence entry point applies one policy. */
export function detachEditedNativeContent<T>(content: T, submittedPaths: readonly string[]): T {
  if (!Array.isArray(content) || submittedPaths.length === 0) return content;
  const edited = new Set<number>();
  for (const path of submittedPaths) {
    const match = /^\/content\/(\d+)\/(?:text|think)(?:\/|$)/.exec(path);
    if (match) edited.add(Number(match[1]));
  }
  if (!edited.size) return content;
  return content.map((part: unknown, index: number) =>
    edited.has(index) && isContentPart(part) ? detachNativeIdentity(part) : part,
  ) as T;
}

export function getNativeContinuationRefs(content: unknown): string[] {
  if (!Array.isArray(content)) return [];
  const refs = new Set<string>();
  for (const part of content) {
    if (isContentPart(part) && typeof part.native_media?.continuationRef === 'string')
      refs.add(part.native_media.continuationRef);
  }
  return Array.from(refs);
}

/** Shared-link images remain renderable, but their owner's file ids never become model inputs. */
export function stripSharedFileIds<
  T extends {
    files?: Array<{ file_id?: string }>;
    attachments?: Array<{ file_id?: string }>;
    content?: unknown[];
  },
>(message: T): T {
  const strip = ({ file_id: _id, ...file }: { file_id?: string }) => file;
  return {
    ...message,
    ...(Array.isArray(message.files) && { files: message.files.map(strip) }),
    ...(Array.isArray(message.attachments) && { attachments: message.attachments.map(strip) }),
    ...(Array.isArray(message.content) && {
      content: message.content.map((part) => {
        if (!isContentPart(part)) return part;
        const visible = detachNativeIdentity(part);
        if (part.type !== 'image_file' || !part.image_file) return visible;
        return { ...visible, image_file: { ...part.image_file, file_id: '' } };
      }),
    }),
  };
}
