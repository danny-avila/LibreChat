const UPLOAD_PLACEHOLDER = /^\/mnt\/data\/(\d+)\.(?:png|jpe?g|webp)$/;

type ToolArgumentValue =
  | string
  | number
  | boolean
  | null
  | ToolArgumentValue[]
  | { [key: string]: ToolArgumentValue };

export interface ImageToolRequestFile {
  file_id?: string;
  type?: string;
}

export interface ImageToolRequest {
  body?: {
    files?: ImageToolRequestFile[];
  };
}

export interface ImageToolUser {
  id?: string;
}

export interface ImageToolFile {
  file_id: string;
}

export interface ImageToolFileQuery {
  file_id: {
    $in: string[];
  };
  user: string;
}

export interface ImageToolEncoding {
  image_urls?: Array<{
    file_id: string;
    image_url?: {
      url?: string;
    };
  }>;
}

export interface ImageToolDependencies {
  findFiles: (query: ImageToolFileQuery) => Promise<readonly ImageToolFile[] | null | undefined>;
  encodeImages: (
    request: ImageToolRequest | undefined,
    files: readonly ImageToolFile[],
  ) => Promise<ImageToolEncoding>;
}

export interface ResolveImageToolArgumentsParams {
  forwardUploadedImages?: boolean;
  toolArguments: ToolArgumentValue;
  request?: ImageToolRequest;
  user?: ImageToolUser;
  dependencies: ImageToolDependencies;
}

function isPlainObject(value: ToolArgumentValue): value is Record<string, ToolArgumentValue> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function getUploadPlaceholderIndex(value: ToolArgumentValue): number | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const match = value.match(UPLOAD_PLACEHOLDER);
  if (!match) {
    return undefined;
  }

  const index = Number(match[1]);
  return Number.isSafeInteger(index) ? index : undefined;
}

function getRequestImageFileIds(request?: ImageToolRequest): string[] {
  const files = request?.body?.files;
  if (!files) {
    return [];
  }

  return files
    .filter((file) => file.type?.startsWith('image/') && typeof file.file_id === 'string')
    .map((file) => file.file_id!);
}

function collectReferencedIndexes(value: ToolArgumentValue, indexes: Set<number>): void {
  const index = getUploadPlaceholderIndex(value);
  if (index !== undefined) {
    indexes.add(index);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectReferencedIndexes(item, indexes);
    }
  } else if (isPlainObject(value)) {
    for (const item of Object.values(value)) {
      collectReferencedIndexes(item, indexes);
    }
  }
}

function isImageDataUrl(value: unknown): value is string {
  return typeof value === 'string' && /^data:image\/[^;,]+;base64,/.test(value);
}

function replaceReferencedPlaceholders(
  value: ToolArgumentValue,
  imageUrlsByIndex: ReadonlyMap<number, string>,
): ToolArgumentValue {
  const index = getUploadPlaceholderIndex(value);
  if (index !== undefined) {
    return imageUrlsByIndex.get(index) ?? value;
  }

  if (Array.isArray(value)) {
    let replacement: ToolArgumentValue[] | undefined;
    for (let index = 0; index < value.length; index++) {
      const current = value[index];
      const resolved = replaceReferencedPlaceholders(current, imageUrlsByIndex);
      if (resolved !== current) {
        replacement ??= value.slice();
        replacement[index] = resolved;
      }
    }
    return replacement ?? value;
  }

  if (isPlainObject(value)) {
    let replacement: Record<string, ToolArgumentValue> | undefined;
    for (const [key, current] of Object.entries(value)) {
      const resolved = replaceReferencedPlaceholders(current, imageUrlsByIndex);
      if (resolved !== current) {
        replacement ??= { ...value };
        replacement[key] = resolved;
      }
    }
    return replacement ?? value;
  }

  return value;
}

export async function resolveUploadedImageArguments({
  forwardUploadedImages,
  toolArguments,
  request,
  user,
  dependencies,
}: ResolveImageToolArgumentsParams): Promise<ToolArgumentValue> {
  if (forwardUploadedImages !== true) {
    return toolArguments;
  }

  const referencedIndexes = new Set<number>();
  collectReferencedIndexes(toolArguments, referencedIndexes);
  if (referencedIndexes.size === 0) {
    return toolArguments;
  }

  const fileIds = getRequestImageFileIds(request);
  if (!user?.id || fileIds.length === 0) {
    return toolArguments;
  }

  const referencedFileIds = [
    ...new Set(fileIds.filter((_fileId, index) => referencedIndexes.has(index))),
  ];
  if (referencedFileIds.length === 0) {
    return toolArguments;
  }

  const foundFiles = await dependencies.findFiles({
    file_id: { $in: referencedFileIds },
    user: user.id,
  });
  const filesById = new Map((foundFiles ?? []).map((file) => [file.file_id, file]));
  const imageFiles = referencedFileIds
    .map((fileId) => filesById.get(fileId))
    .filter((file): file is ImageToolFile => file !== undefined);
  if (imageFiles.length === 0) {
    return toolArguments;
  }

  const { image_urls: imageUrls } = await dependencies.encodeImages(request, imageFiles);
  const imageUrlsByFileId = new Map(
    (imageUrls ?? [])
      .filter((image) => isImageDataUrl(image.image_url?.url))
      .map((image) => [image.file_id, image.image_url!.url!] as const),
  );
  const imageUrlsByIndex = new Map(
    [...referencedIndexes].flatMap((index) => {
      const fileId = fileIds[index];
      const url = fileId ? imageUrlsByFileId.get(fileId) : undefined;
      return url ? [[index, url] as const] : [];
    }),
  );

  return replaceReferencedPlaceholders(toolArguments, imageUrlsByIndex);
}
