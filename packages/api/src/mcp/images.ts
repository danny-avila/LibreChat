const UPLOAD_PLACEHOLDER = /^\/mnt\/data\/(\d+)\.(png|jpe?g|webp)$/;
const BASE64_PAYLOAD = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$(?![\s\S])/;
const DATA_URL = /^data:(image\/[^;,]+);base64,([\s\S]*)$(?![\s\S])/i;
const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

type SupportedImageMime = 'image/png' | 'image/jpeg' | 'image/webp';
type UploadPlaceholder = { index: number; mimeType: SupportedImageMime };

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
  type?: string;
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

function normalizeImageMimeType(value: unknown): SupportedImageMime | undefined {
  switch (typeof value === 'string' ? value.toLowerCase() : undefined) {
    case 'image/png':
      return 'image/png';
    case 'image/jpg':
    case 'image/jpeg':
      return 'image/jpeg';
    case 'image/webp':
      return 'image/webp';
  }
}

function getUploadPlaceholder(value: ToolArgumentValue): UploadPlaceholder | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const match = value.match(UPLOAD_PLACEHOLDER);
  if (!match) {
    return undefined;
  }

  const index = Number(match[1]);
  const mimeType = normalizeImageMimeType(`image/${match[2]}`);
  return Number.isSafeInteger(index) && mimeType ? { index, mimeType } : undefined;
}

function getUploadPlaceholderKey({ index, mimeType }: UploadPlaceholder): string {
  return `${index}:${mimeType}`;
}

function getRequestImageFiles(request?: ImageToolRequest): Array<ImageToolRequestFile | undefined> {
  return (request?.body?.files ?? []).map((file) =>
    typeof file.file_id === 'string' && normalizeImageMimeType(file.type) ? file : undefined,
  );
}

function collectReferencedPlaceholders(
  value: ToolArgumentValue,
  placeholders: Map<string, UploadPlaceholder>,
): void {
  const placeholder = getUploadPlaceholder(value);
  if (placeholder) {
    placeholders.set(getUploadPlaceholderKey(placeholder), placeholder);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectReferencedPlaceholders(item, placeholders);
    }
  } else if (isPlainObject(value)) {
    for (const item of Object.values(value)) {
      collectReferencedPlaceholders(item, placeholders);
    }
  }
}

function isCanonicalBase64Payload(payload: string): boolean {
  if (!BASE64_PAYLOAD.test(payload)) {
    return false;
  }

  if (payload.endsWith('==')) {
    const trailingSextet = BASE64_ALPHABET.indexOf(payload.charAt(payload.length - 3));
    return (trailingSextet & 0b1111) === 0;
  }

  if (payload.endsWith('=')) {
    const trailingSextet = BASE64_ALPHABET.indexOf(payload.charAt(payload.length - 2));
    return (trailingSextet & 0b11) === 0;
  }

  return true;
}

function parseImageDataUrl(
  value: unknown,
): { mimeType: SupportedImageMime; url: string } | undefined {
  const match = typeof value === 'string' ? DATA_URL.exec(value) : null;
  const mimeType = normalizeImageMimeType(match?.[1]);
  const payload = match?.[2];
  if (!mimeType || !payload || !isCanonicalBase64Payload(payload)) {
    return undefined;
  }

  return { mimeType, url: `data:${mimeType};base64,${payload}` };
}

function replaceReferencedPlaceholders(
  value: ToolArgumentValue,
  imageUrlsByPlaceholder: ReadonlyMap<string, string>,
): ToolArgumentValue {
  const placeholder = getUploadPlaceholder(value);
  if (placeholder) {
    return imageUrlsByPlaceholder.get(getUploadPlaceholderKey(placeholder)) ?? value;
  }

  if (Array.isArray(value)) {
    let replacement: ToolArgumentValue[] | undefined;
    for (let index = 0; index < value.length; index++) {
      const current = value[index];
      const resolved = replaceReferencedPlaceholders(current, imageUrlsByPlaceholder);
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
      const resolved = replaceReferencedPlaceholders(current, imageUrlsByPlaceholder);
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

  const referencedPlaceholders = new Map<string, UploadPlaceholder>();
  collectReferencedPlaceholders(toolArguments, referencedPlaceholders);
  if (referencedPlaceholders.size === 0) {
    return toolArguments;
  }

  const requestImageFiles = getRequestImageFiles(request);
  if (!user?.id || requestImageFiles.length === 0) {
    return toolArguments;
  }

  const referencedFileIds = [
    ...new Set(
      [...referencedPlaceholders.values()]
        .sort((left, right) => left.index - right.index)
        .flatMap(({ index }) => {
          const fileId = requestImageFiles[index]?.file_id;
          return fileId ? [fileId] : [];
        }),
    ),
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
    (imageUrls ?? []).flatMap((image) => {
      const dataUrl = parseImageDataUrl(image.image_url?.url);
      return dataUrl ? [[image.file_id, dataUrl] as const] : [];
    }),
  );
  const imageUrlsByPlaceholder = new Map(
    [...referencedPlaceholders.values()].flatMap((placeholder) => {
      const { index, mimeType: placeholderMimeType } = placeholder;
      const requestFile = requestImageFiles[index];
      const fileId = requestFile?.file_id;
      const file = fileId ? filesById.get(fileId) : undefined;
      const requestMimeType = normalizeImageMimeType(requestFile?.type);
      const dataUrl = fileId ? imageUrlsByFileId.get(fileId) : undefined;
      return requestMimeType === placeholderMimeType &&
        normalizeImageMimeType(file?.type) === placeholderMimeType &&
        dataUrl?.mimeType === placeholderMimeType
        ? [[getUploadPlaceholderKey(placeholder), dataUrl.url] as const]
        : [];
    }),
  );

  return replaceReferencedPlaceholders(toolArguments, imageUrlsByPlaceholder);
}
