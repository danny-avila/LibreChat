const IMAGE_GENERATION_SERVER = 'image-generation';
const EDIT_IMAGE_TOOL = 'edit_image';
const UPLOAD_PLACEHOLDER = /^\/mnt\/data\/(\d+)\.(?:png|jpe?g|webp)$/i;

type ToolArgumentValue =
  | string
  | number
  | boolean
  | null
  | ToolArgumentValue[]
  | { [key: string]: ToolArgumentValue };

export interface ImageToolArguments {
  images?: ToolArgumentValue;
  [key: string]: ToolArgumentValue | undefined;
}

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
  serverName?: string;
  toolName?: string;
  toolArguments: ImageToolArguments | string;
  request?: ImageToolRequest;
  user?: ImageToolUser;
  dependencies: ImageToolDependencies;
}

function isImageToolArguments(value: ImageToolArguments | string): value is ImageToolArguments {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getUploadPlaceholderIndex(image: ToolArgumentValue | undefined): number | undefined {
  if (typeof image !== 'string') {
    return undefined;
  }

  const match = image.match(UPLOAD_PLACEHOLDER);
  return match ? Number(match[1]) : undefined;
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

export async function resolveImageToolArguments({
  serverName,
  toolName,
  toolArguments,
  request,
  user,
  dependencies,
}: ResolveImageToolArgumentsParams): Promise<ImageToolArguments | string> {
  if (
    serverName !== IMAGE_GENERATION_SERVER ||
    toolName !== EDIT_IMAGE_TOOL ||
    !isImageToolArguments(toolArguments) ||
    !Array.isArray(toolArguments.images)
  ) {
    return toolArguments;
  }

  const placeholderIndexes = toolArguments.images.map(getUploadPlaceholderIndex);
  if (!placeholderIndexes.some((index) => index !== undefined)) {
    return toolArguments;
  }

  const fileIds = getRequestImageFileIds(request);
  if (!user?.id || fileIds.length === 0) {
    return toolArguments;
  }

  const foundFiles = await dependencies.findFiles({
    file_id: { $in: fileIds },
    user: user.id,
  });
  const filesById = new Map((foundFiles ?? []).map((file) => [file.file_id, file]));
  const imageFiles = fileIds
    .map((fileId) => filesById.get(fileId))
    .filter((file): file is ImageToolFile => file !== undefined);
  if (imageFiles.length === 0) {
    return toolArguments;
  }

  const { image_urls: imageUrls } = await dependencies.encodeImages(request, imageFiles);
  const imageUrlsByFileId = new Map(
    (imageUrls ?? [])
      .filter((image) => typeof image.image_url?.url === 'string')
      .map((image) => [image.file_id, image.image_url!.url!] as const),
  );
  const images = toolArguments.images.map((image, imageIndex) => {
    const placeholderIndex = placeholderIndexes[imageIndex];
    if (placeholderIndex === undefined) {
      return image;
    }
    const fileId = fileIds[placeholderIndex];
    const url = fileId ? imageUrlsByFileId.get(fileId) : undefined;
    return typeof url === 'string' ? url : image;
  });

  return { ...toolArguments, images };
}
