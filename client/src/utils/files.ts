import {
  TextPaths,
  FilePaths,
  CodePaths,
  AudioPaths,
  VideoPaths,
  SheetPaths,
} from '@librechat/client';
import {
  megabyte,
  Providers,
  QueryKeys,
  inferMimeType,
  excelMimeTypes,
  EToolResources,
  EModelEndpoint,
  retrievalMimeTypes,
  isBedrockDocumentType,
  isPermissiveMimeConfig,
  codeInterpreterMimeTypes,
  isDocumentSupportedProvider,
  fileConfig as defaultFileConfig,
} from 'librechat-data-provider';
import type { TFile, EndpointFileConfig, FileConfig, RegexLike } from 'librechat-data-provider';
import type { QueryClient } from '@tanstack/react-query';
import type { ExtendedFile } from '~/common';

export const partialTypes = ['text/x-'];

export function hasIncompleteFiles(files: Map<string, ExtendedFile>): boolean {
  for (const file of files.values()) {
    if (file.progress < 1) {
      return true;
    }
  }
  return false;
}

const textDocument = {
  paths: TextPaths,
  fill: '#FF5588',
  title: 'Document',
};

const spreadsheet = {
  paths: SheetPaths,
  fill: '#10A37F',
  title: 'Spreadsheet',
};

const codeFile = {
  paths: CodePaths,
  fill: '#FF6E3C',
  // TODO: make this dynamic to the language
  title: 'Code',
};

const artifact = {
  paths: CodePaths,
  fill: '#2D305C',
  title: 'Code',
};

const audioFile = {
  paths: AudioPaths,
  fill: '#FF6B35',
  title: 'Audio',
};

const videoFile = {
  paths: VideoPaths,
  fill: '#8B5CF6',
  title: 'Video',
};

export const fileTypes = {
  /* Category matches */
  file: {
    paths: FilePaths,
    fill: '#0000FF',
    title: 'File',
  },
  text: textDocument,
  txt: textDocument,
  audio: audioFile,
  video: videoFile,
  // application:,

  /* Partial matches */
  csv: spreadsheet,
  'application/pdf': textDocument,
  pdf: textDocument,
  'text/x-': codeFile,
  artifact: artifact,

  /* Exact matches */
  // 'application/json':,
  // 'text/html':,
  // 'text/css':,
  // image,
};

// export const getFileType = (type = '') => {
//   let fileType = fileTypes.file;
//   const exactMatch = fileTypes[type];
//   const partialMatch = !exactMatch && partialTypes.find((type) => type.includes(type));
//   const category = (!partialMatch && (type.split('/')[0] ?? 'text') || 'text');

//   if (exactMatch) {
//     fileType = exactMatch;
//   } else if (partialMatch) {
//     fileType = fileTypes[partialMatch];
//   } else if (fileTypes[category]) {
//     fileType = fileTypes[category];
//   }

//   if (!fileType) {
//     fileType = fileTypes.file;
//   }

//   return fileType;
// };

export const getFileType = (
  type = '',
): {
  paths: React.FC;
  fill: string;
  title: string;
} => {
  // Direct match check
  if (fileTypes[type]) {
    return fileTypes[type];
  }

  if (excelMimeTypes.test(type)) {
    return spreadsheet;
  }

  // Partial match check
  const partialMatch = partialTypes.find((partial) => type.includes(partial));
  if (partialMatch && fileTypes[partialMatch]) {
    return fileTypes[partialMatch];
  }

  // Category check
  const category = type.split('/')[0] || 'text';
  if (fileTypes[category]) {
    return fileTypes[category];
  }

  // Default file type
  return fileTypes.file;
};

/**
 * Format a date string to a human readable format
 * @example
 * formatDate('2020-01-01T00:00:00.000Z') // '1 Jan 2020'
 */
export function formatDate(dateString: string, isSmallScreen = false) {
  if (!dateString) {
    return '';
  }

  const date = new Date(dateString);

  if (isSmallScreen) {
    return date.toLocaleDateString('en-US', {
      month: 'numeric',
      day: 'numeric',
      year: '2-digit',
    });
  }

  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];

  const day = date.getDate();
  const month = months[date.getMonth()];
  const year = date.getFullYear();

  return `${day} ${month} ${year}`;
}

/**
 * Adds a file to the query cache
 */
export function addFileToCache(queryClient: QueryClient, newfile: TFile) {
  const currentFiles = queryClient.getQueryData<TFile[]>([QueryKeys.files]);

  if (!currentFiles) {
    console.warn('No current files found in cache, skipped updating file query cache');
    return;
  }

  const fileIndex = currentFiles.findIndex((file) => file.file_id === newfile.file_id);

  if (fileIndex > -1) {
    console.warn('File already exists in cache, skipped updating file query cache');
    return;
  }

  queryClient.setQueryData<TFile[]>(
    [QueryKeys.files],
    [
      {
        ...newfile,
      },
      ...currentFiles,
    ],
  );
}

export function formatBytes(bytes: number, decimals = 2) {
  if (bytes === 0) {
    return 0;
  }
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm));
}

const { checkType } = defaultFileConfig;

type FileSizeValidationParams = {
  fileList: File[];
  files: Map<string, ExtendedFile>;
  setError: (error: string) => void;
  endpointFileConfig: EndpointFileConfig;
};

export const validateFileSizes = ({
  files,
  fileList,
  setError,
  endpointFileConfig,
}: FileSizeValidationParams): boolean => {
  const { fileSizeLimit, totalSizeLimit } = endpointFileConfig;

  for (const file of fileList) {
    if (fileSizeLimit && file.size >= fileSizeLimit) {
      setError(`File size limit exceeded: ${fileSizeLimit / megabyte} MB`);
      return false;
    }
  }

  if (totalSizeLimit) {
    const currentTotalSize = Array.from(files.values()).reduce(
      (total, file) => total + file.size,
      0,
    );
    const incomingTotalSize = fileList.reduce((total, file) => total + file.size, 0);
    if (currentTotalSize + incomingTotalSize > totalSizeLimit) {
      setError(`Total file size limit exceeded: ${totalSizeLimit / megabyte} MB`);
      return false;
    }
  }

  return true;
};

type FileDuplicateValidationParams = {
  fileList: File[];
  files: Map<string, ExtendedFile>;
  setError: (error: string) => void;
};

export const validateFileDuplicates = ({
  files,
  fileList,
  setError,
}: FileDuplicateValidationParams): boolean => {
  const combinedFilesInfo = [
    ...Array.from(files.values()).map(
      (file) =>
        `${file.file?.name ?? file.filename}-${file.size}-${file.type?.split('/')[0] ?? 'file'}`,
    ),
    ...fileList.map(
      (file: File | undefined) =>
        `${file?.name}-${file?.size}-${file?.type.split('/')[0] ?? 'file'}`,
    ),
  ];

  const uniqueFilesSet = new Set(combinedFilesInfo);

  if (uniqueFilesSet.size !== combinedFilesInfo.length) {
    setError('com_error_files_dupe');
    return false;
  }

  return true;
};

export const validateFiles = ({
  files,
  fileList,
  setError,
  endpointFileConfig,
  toolResource,
  fileConfig,
  skipSizeValidation = false,
}: {
  fileList: File[];
  files: Map<string, ExtendedFile>;
  setError: (error: string) => void;
  endpointFileConfig: EndpointFileConfig;
  toolResource?: string;
  fileConfig: FileConfig | null;
  skipSizeValidation?: boolean;
}) => {
  const { fileLimit, supportedMimeTypes, disabled } = endpointFileConfig;
  /** Block all uploads if the endpoint is explicitly disabled */
  if (disabled === true) {
    setError('com_ui_attach_error_disabled');
    return false;
  }
  const incomingTotalSize = fileList.reduce((total, file) => total + file.size, 0);
  if (incomingTotalSize === 0) {
    setError('com_error_files_empty');
    return false;
  }

  if (fileLimit && fileList.length + files.size > fileLimit) {
    setError(`File limit reached: ${fileLimit} files`);
    return false;
  }

  for (let i = 0; i < fileList.length; i++) {
    let originalFile = fileList[i];
    const fileType = inferMimeType(originalFile.name, originalFile.type);

    // Check if the file type is still empty after the extension check
    if (!fileType) {
      setError('Unable to determine file type for: ' + originalFile.name);
      return false;
    }

    // Replace empty type with inferred type
    if (originalFile.type !== fileType) {
      const newFile = new File([originalFile], originalFile.name, { type: fileType });
      originalFile = newFile;
      fileList[i] = newFile;
    }

    let mimeTypesToCheck = supportedMimeTypes;
    if (toolResource === EToolResources.context) {
      mimeTypesToCheck = [
        ...(fileConfig?.text?.supportedMimeTypes || []),
        ...(fileConfig?.ocr?.supportedMimeTypes || []),
        ...(fileConfig?.stt?.supportedMimeTypes || []),
      ];
    }

    if (!checkType(originalFile.type, mimeTypesToCheck)) {
      setError(`Unsupported file type: ${originalFile.type}`);
      return false;
    }
  }

  if (
    !skipSizeValidation &&
    !validateFileSizes({ files, fileList, setError, endpointFileConfig })
  ) {
    return false;
  }

  return validateFileDuplicates({ files, fileList, setError });
};

export type UploadOptionContext = {
  provider?: string | null;
  endpoint?: string | null;
  endpointType?: string | null;
  useResponsesApi?: boolean;
  fileSearchEnabled: boolean;
  codeEnabled: boolean;
  contextEnabled: boolean;
  fileSearchAllowedByAgent: boolean;
  codeAllowedByAgent: boolean;
  fileConfig: FileConfig | null;
  endpointSupportedMimeTypes?: RegexLike[];
};

const isProviderAttachType = (type: string, ctx: UploadOptionContext): boolean => {
  let currentProvider = (ctx.provider || ctx.endpoint) ?? '';
  if (currentProvider.toLowerCase() === Providers.OPENROUTER) {
    currentProvider = Providers.OPENROUTER;
  }
  const isAzureWithResponsesApi =
    (currentProvider === EModelEndpoint.azureOpenAI ||
      ctx.endpointType === EModelEndpoint.azureOpenAI) &&
    ctx.useResponsesApi === true;

  if (
    isDocumentSupportedProvider(ctx.endpointType) ||
    isDocumentSupportedProvider(currentProvider) ||
    isAzureWithResponsesApi
  ) {
    /** Custom endpoints that the admin opened up (permissive config) honor that allowlist,
     * matching the file picker; an inherited default config is not treated as opened up. */
    if (
      ctx.endpointType === EModelEndpoint.custom &&
      ctx.endpointSupportedMimeTypes != null &&
      isPermissiveMimeConfig(ctx.endpointSupportedMimeTypes)
    ) {
      return checkType(type, ctx.endpointSupportedMimeTypes);
    }
    if (currentProvider === EModelEndpoint.google || currentProvider === Providers.OPENROUTER) {
      return (
        type.startsWith('image/') ||
        type.startsWith('video/') ||
        type.startsWith('audio/') ||
        type === 'application/pdf'
      );
    }
    if (currentProvider === Providers.BEDROCK || ctx.endpointType === EModelEndpoint.bedrock) {
      return type.startsWith('image/') || isBedrockDocumentType(type);
    }
    return type.startsWith('image/') || type === 'application/pdf';
  }
  return type.startsWith('image/');
};

const isContextType = (type: string, fileConfig: FileConfig | null): boolean =>
  checkType(type, [
    ...(fileConfig?.text?.supportedMimeTypes || []),
    ...(fileConfig?.ocr?.supportedMimeTypes || []),
    ...(fileConfig?.stt?.supportedMimeTypes || []),
  ]);

/**
 * Upload destinations a file set can be routed to, given the active endpoint and agent
 * capabilities. `undefined` is direct provider attachment; the rest are tool resources.
 * Each option requires every file to be valid for it, so the caller can decide between
 * auto-routing (one option), prompting (multiple), or rejecting (none).
 */
export const getViableUploadOptions = (
  fileList: File[],
  ctx: UploadOptionContext,
): (EToolResources | undefined)[] => {
  if (fileList.length === 0) {
    return [];
  }
  const types = fileList.map((file) => inferMimeType(file.name, file.type));
  if (types.some((type) => !type)) {
    return [];
  }
  const every = (predicate: (type: string) => boolean) =>
    types.every((type) => predicate(type as string));

  const options: (EToolResources | undefined)[] = [];
  if (every((type) => isProviderAttachType(type, ctx))) {
    options.push(undefined);
  }
  if (
    ctx.fileSearchEnabled &&
    ctx.fileSearchAllowedByAgent &&
    every((type) => !type.startsWith('image/') && checkType(type, retrievalMimeTypes))
  ) {
    options.push(EToolResources.file_search);
  }
  if (
    ctx.codeEnabled &&
    ctx.codeAllowedByAgent &&
    every((type) => checkType(type, codeInterpreterMimeTypes))
  ) {
    options.push(EToolResources.execute_code);
  }
  if (ctx.contextEnabled && every((type) => isContextType(type, ctx.fileConfig))) {
    options.push(EToolResources.context);
  }
  return options;
};

/**
 * Character count past which a plain-text paste is attached as a file rather than inserted
 * into the composer. Roughly a screenful of prose, so ordinary pastes are untouched.
 */
export const PASTE_AS_FILE_MIN_LENGTH = 2500;

export const PASTED_TEXT_FILENAME = 'pasted-text.txt';

export type PasteAsFileContext = {
  /** The user's `pasteLongTextAsFile` preference. */
  enabled: boolean;
  uploadsDisabled: boolean;
  isAssistants: boolean;
  /** Names already attached to the composer, used to keep successive pastes distinct. */
  attachedFilenames: Set<string>;
  /** The file config the destination check reads has not arrived yet. */
  configPending: boolean;
  getOptions: (files: File[]) => (EToolResources | undefined)[];
};

/**
 * Uploads are deduped on name + size + type, so a fixed name would collapse that key to size
 * alone for pastes and reject a second, different paste that merely matched the first one's
 * length. Numbering keeps every paste attachable while staying readable in the UI.
 */
const nextPastedTextFilename = (taken: Set<string>): string => {
  let candidate = PASTED_TEXT_FILENAME;
  let suffix = 1;
  while (taken.has(candidate)) {
    suffix += 1;
    candidate = `pasted-text-${suffix}.txt`;
  }
  return candidate;
};

export type PastedTextAttachment = {
  file: File;
  /** Context for non-assistant attachments; assistants resolve their destination on upload. */
  toolResource?: EToolResources;
};

/**
 * Turns a long plain-text paste into a text attachment, keeping the composer readable while
 * preserving the exact paste in the generated file. Context attachments follow the same
 * configured token limits as other uploaded text files. Returns `null` whenever the paste
 * should stay inline, so the caller can leave the browser's native paste untouched.
 */
export const resolvePastedTextFile = (
  text: string,
  ctx: PasteAsFileContext,
): PastedTextAttachment | null => {
  if (!ctx.enabled || ctx.uploadsDisabled || text.length <= PASTE_AS_FILE_MIN_LENGTH) {
    return null;
  }

  const name = nextPastedTextFilename(ctx.attachedFilenames);
  const file = new File([text], name, { type: 'text/plain' });
  if (ctx.isAssistants) {
    return { file };
  }

  /** `context` is the only automatic non-assistant destination because retrieval-based routes
   * can change what the model sees. Pasting text must never pop a destination picker.
   *
   * That check reads MIME lists that arrive with the file config, so declining while the config
   * is still in flight would quietly ignore the setting on a slow first load. Routing the paste
   * instead hands the decision to the upload, which waits for the same config and restores the
   * text inline if it turns out the destination is unavailable. */
  if (!ctx.configPending && !ctx.getOptions([file]).includes(EToolResources.context)) {
    return null;
  }

  return { file, toolResource: EToolResources.context };
};

export function sortPagesByRelevance(
  pages: number[],
  pageRelevance: Record<number, number>,
): number[] {
  if (!pageRelevance || Object.keys(pageRelevance).length === 0) {
    return pages;
  }
  return [...pages].sort((a, b) => (pageRelevance[b] || 0) - (pageRelevance[a] || 0));
}

/**
 * Collapses whitespace runs to underscores so export filenames come out
 * identical across all export formats: `export-from-json`'s default formatter
 * only replaces the first whitespace run, while direct downloads replace none.
 */
export function normalizeExportFilename(filename: string): string {
  return filename.replace(/\s+/g, '_');
}
