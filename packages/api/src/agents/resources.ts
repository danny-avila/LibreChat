import { logger } from '@librechat/data-schemas';
import { EModelEndpoint, EToolResources, AgentCapabilities } from 'librechat-data-provider';
import type { AgentToolResources, TFile, AgentBaseResource } from 'librechat-data-provider';
import type { IMongoFile, AppConfig, IUser } from '@librechat/data-schemas';
import type { FilterQuery, QueryOptions, ProjectionType } from 'mongoose';
import type { Request as ServerRequest } from 'express';

/** Deferred DB update from provisioning (batched after all files are provisioned) */
export type TFileUpdate = {
  file_id: string;
  metadata?: Record<string, unknown>;
  embedded?: boolean;
};

/**
 * Function type for provisioning a file to the code execution environment.
 * @returns The fileIdentifier and a deferred DB update object
 */
export type TProvisionToCodeEnv = (params: {
  req: ServerRequest & { user?: IUser };
  file: TFile;
  entity_id?: string;
  apiKey?: string;
}) => Promise<{ fileIdentifier: string; fileUpdate: TFileUpdate }>;

/**
 * Function type for provisioning a file to the vector DB for file_search.
 * @returns Object with embedded status and a deferred DB update object
 */
export type TProvisionToVectorDB = (params: {
  req: ServerRequest & { user?: IUser };
  file: TFile;
  entity_id?: string;
  existingStream?: unknown;
}) => Promise<{ embedded: boolean; fileUpdate: TFileUpdate | null }>;

/**
 * Function type for batch-checking code env file liveness.
 * Groups files by session, makes one API call per session.
 * @returns Set of file_ids that are confirmed alive
 */
export type TCheckSessionsAlive = (params: {
  files: TFile[];
  apiKey: string;
  staleSafeWindowMs?: number;
}) => Promise<Set<string>>;

/** Loads CODE_API_KEY for a user. Call once per request. */
export type TLoadCodeApiKey = (userId: string) => Promise<string>;

/** State computed during primeResources for lazy provisioning at tool invocation time */
export type ProvisionState = {
  /** Files that need uploading to the code execution environment */
  codeEnvFiles: TFile[];
  /** Files that need embedding into the vector DB for file_search */
  vectorDBFiles: TFile[];
  /** Pre-loaded CODE_API_KEY to avoid redundant credential fetches */
  codeApiKey?: string;
  /** Set of file_ids confirmed alive in code env (from staleness check) */
  aliveFileIds: Set<string>;
};

/**
 * Function type for retrieving files from the database
 * @param filter - MongoDB filter query for files
 * @param _sortOptions - Sorting options (currently unused)
 * @param selectFields - Field selection options
 * @returns Promise resolving to array of files
 */
export type TGetFiles = (
  filter: FilterQuery<IMongoFile>,
  _sortOptions: ProjectionType<IMongoFile> | null | undefined,
  selectFields: QueryOptions<IMongoFile> | null | undefined,
) => Promise<Array<TFile>>;

/**
 * Function type for filtering files by agent access permissions.
 * Used to enforce that only files the user has access to (via ownership or agent attachment)
 * are returned after a raw DB query.
 */
export type TFilterFilesByAgentAccess = (params: {
  files: Array<TFile>;
  userId: string;
  role?: string;
  agentId: string;
}) => Promise<Array<TFile>>;

/**
 * Helper function to add a file to a specific tool resource category
 * Prevents duplicate files within the same resource category
 * @param params - Parameters object
 * @param params.file - The file to add to the resource
 * @param params.resourceType - The type of tool resource (e.g., execute_code, file_search, image_edit)
 * @param params.tool_resources - The agent's tool resources object to update
 * @param params.processedResourceFiles - Set tracking processed files per resource type
 */
export const addFileToResource = ({
  file,
  resourceType,
  tool_resources,
  processedResourceFiles,
}: {
  file: TFile;
  resourceType: EToolResources;
  tool_resources: AgentToolResources;
  processedResourceFiles: Set<string>;
}): void => {
  if (!file.file_id) {
    return;
  }

  const resourceKey = `${resourceType}:${file.file_id}`;
  if (processedResourceFiles.has(resourceKey)) {
    return;
  }

  const resource = tool_resources[resourceType as keyof AgentToolResources] ?? {};
  if (!resource.files) {
    (tool_resources[resourceType as keyof AgentToolResources] as AgentBaseResource) = {
      ...resource,
      files: [],
    };
  }

  // Check if already exists in the files array
  const resourceFiles = tool_resources[resourceType as keyof AgentToolResources]?.files;
  const alreadyExists = resourceFiles?.some((f: TFile) => f.file_id === file.file_id);

  if (!alreadyExists) {
    resourceFiles?.push(file);
    processedResourceFiles.add(resourceKey);
  }
};

/**
 * Categorizes a file into the appropriate tool resource based on its properties
 * Files are categorized as:
 * - execute_code: Files with fileIdentifier metadata
 * - file_search: Files marked as embedded
 * - image_edit: Image files in the request file set with dimensions
 * @param params - Parameters object
 * @param params.file - The file to categorize
 * @param params.tool_resources - The agent's tool resources to update
 * @param params.requestFileSet - Set of file IDs from the current request
 * @param params.processedResourceFiles - Set tracking processed files per resource type
 */
const categorizeFileForToolResources = ({
  file,
  tool_resources,
  requestFileSet,
  processedResourceFiles,
}: {
  file: TFile;
  tool_resources: AgentToolResources;
  requestFileSet: Set<string>;
  processedResourceFiles: Set<string>;
}): void => {
  // No early returns — a file can belong to multiple tool resources simultaneously
  if (file.metadata?.fileIdentifier) {
    addFileToResource({
      file,
      resourceType: EToolResources.execute_code,
      tool_resources,
      processedResourceFiles,
    });
  }

  if (file.embedded === true) {
    addFileToResource({
      file,
      resourceType: EToolResources.file_search,
      tool_resources,
      processedResourceFiles,
    });
  }

  if (
    requestFileSet.has(file.file_id) &&
    file.type.startsWith('image') &&
    file.height &&
    file.width
  ) {
    addFileToResource({
      file,
      resourceType: EToolResources.image_edit,
      tool_resources,
      processedResourceFiles,
    });
  }
};

/**
 * Primes resources for agent execution by processing attachments and tool resources
 * This function:
 * 1. Fetches context/OCR files (filtered by agent access control when available)
 * 2. Processes attachment files
 * 3. Categorizes files into appropriate tool resources
 * 4. Prevents duplicate files across all sources
 *
 * @param params - Parameters object
 * @param params.req - Express request object
 * @param params.appConfig - Application configuration object
 * @param params.getFiles - Function to retrieve files from database
 * @param params.filterFiles - Optional function to enforce agent-based file access control
 * @param params.requestFileSet - Set of file IDs from the current request
 * @param params.attachments - Promise resolving to array of attachment files
 * @param params.tool_resources - Existing tool resources for the agent
 * @param params.agentId - Agent ID used for access control filtering
 * @returns Promise resolving to processed attachments and updated tool resources
 */
export const primeResources = async ({
  req,
  appConfig,
  getFiles,
  filterFiles,
  requestFileSet,
  attachments: _attachments,
  tool_resources: _tool_resources,
  agentId,
  enabledToolResources,
  checkSessionsAlive,
  loadCodeApiKey,
}: {
  req: ServerRequest & { user?: IUser };
  appConfig?: AppConfig;
  requestFileSet: Set<string>;
  attachments: Promise<Array<TFile | null>> | undefined;
  tool_resources: AgentToolResources | undefined;
  getFiles: TGetFiles;
  filterFiles?: TFilterFilesByAgentAccess;
  agentId?: string;
  /** Set of tool resource types the agent has enabled (e.g., execute_code, file_search) */
  enabledToolResources?: Set<EToolResources>;
  /** Optional callback to batch-check code env file liveness by session */
  checkSessionsAlive?: TCheckSessionsAlive;
  /** Optional callback to load CODE_API_KEY once per request */
  loadCodeApiKey?: TLoadCodeApiKey;
}): Promise<{
  attachments: Array<TFile | undefined>;
  tool_resources: AgentToolResources | undefined;
  provisionState?: ProvisionState;
  warnings: string[];
}> => {
  try {
    /**
     * Array to collect all unique files that will be returned as attachments
     * Files are added from OCR results and attachment promises, with duplicates prevented
     */
    const attachments: Array<TFile> = [];
    /**
     * Set of file IDs already added to the attachments array
     * Used to prevent duplicate files from being added multiple times
     * Pre-populated with files from non-OCR tool_resources to prevent re-adding them
     */
    const attachmentFileIds = new Set<string>();
    /**
     * Set tracking which files have been added to specific tool resource categories
     * Format: "resourceType:fileId" (e.g., "execute_code:file123")
     * Prevents the same file from being added multiple times to the same resource
     */
    const processedResourceFiles = new Set<string>();
    /**
     * The agent's tool resources object that will be updated with categorized files
     * Create a shallow copy first to avoid mutating the original
     */
    const tool_resources: AgentToolResources = { ...(_tool_resources ?? {}) };

    // Deep copy each resource to avoid mutating nested objects/arrays
    for (const [resourceType, resource] of Object.entries(tool_resources)) {
      if (!resource) {
        continue;
      }

      // Deep copy the resource to avoid mutations
      tool_resources[resourceType as keyof AgentToolResources] = {
        ...resource,
        // Deep copy arrays to prevent mutations
        ...(resource.files && { files: [...resource.files] }),
        ...(resource.file_ids && { file_ids: [...resource.file_ids] }),
        ...(resource.vector_store_ids && { vector_store_ids: [...resource.vector_store_ids] }),
      } as AgentBaseResource;

      // Now track existing files
      if (resource.files && Array.isArray(resource.files)) {
        for (const file of resource.files) {
          if (file?.file_id) {
            processedResourceFiles.add(`${resourceType}:${file.file_id}`);
            // Files from non-context resources should not be added to attachments from _attachments
            if (resourceType !== EToolResources.context && resourceType !== EToolResources.ocr) {
              attachmentFileIds.add(file.file_id);
            }
          }
        }
      }
    }

    const isContextEnabled = (
      appConfig?.endpoints?.[EModelEndpoint.agents]?.capabilities ?? []
    ).includes(AgentCapabilities.context);

    const fileIds = tool_resources[EToolResources.context]?.file_ids ?? [];
    const ocrFileIds = tool_resources[EToolResources.ocr]?.file_ids;
    if (ocrFileIds != null) {
      fileIds.push(...ocrFileIds);
      delete tool_resources[EToolResources.ocr];
    }

    if (fileIds.length > 0 && isContextEnabled) {
      delete tool_resources[EToolResources.context];
      let context = await getFiles(
        {
          file_id: { $in: fileIds },
        },
        {},
        {},
      );

      if (filterFiles && req.user?.id && agentId) {
        context = await filterFiles({
          files: context,
          userId: req.user.id,
          role: req.user.role,
          agentId,
        });
      }

      for (const file of context) {
        if (!file?.file_id) {
          continue;
        }

        attachmentFileIds.delete(file.file_id);

        categorizeFileForToolResources({
          file,
          tool_resources,
          requestFileSet,
          processedResourceFiles,
        });

        attachments.push(file);
        attachmentFileIds.add(file.file_id);
      }
    }

    if (!_attachments) {
      return { attachments, tool_resources, warnings: [] };
    }

    const files = await _attachments;

    for (const file of files) {
      if (!file) {
        continue;
      }

      categorizeFileForToolResources({
        file,
        tool_resources,
        requestFileSet,
        processedResourceFiles,
      });

      if (file.file_id && attachmentFileIds.has(file.file_id)) {
        continue;
      }

      attachments.push(file);
      if (file.file_id) {
        attachmentFileIds.add(file.file_id);
      }
    }

    /**
     * Lazy provisioning: instead of provisioning files now, compute which files
     * need provisioning and return that state. Actual provisioning happens at
     * tool invocation time via the ON_TOOL_EXECUTE handler.
     */
    const warnings: string[] = [];
    let provisionState: ProvisionState | undefined;

    if (enabledToolResources && enabledToolResources.size > 0 && attachments.length > 0) {
      const needsCodeEnv = enabledToolResources.has(EToolResources.execute_code);
      const needsVectorDB = enabledToolResources.has(EToolResources.file_search);

      if (needsCodeEnv || needsVectorDB) {
        let codeApiKey: string | undefined;
        if (needsCodeEnv && loadCodeApiKey && req.user?.id) {
          try {
            codeApiKey = await loadCodeApiKey(req.user.id);
          } catch (error) {
            logger.error('[primeResources] Failed to load CODE_API_KEY', error);
            warnings.push('Code execution file provisioning unavailable');
          }
        }

        // Batch staleness check: identify which code env files are still alive
        let aliveFileIds: Set<string> = new Set();
        if (needsCodeEnv && codeApiKey && checkSessionsAlive) {
          const filesWithIdentifiers = attachments.filter(
            (f) => f?.metadata?.fileIdentifier && f.file_id,
          );
          if (filesWithIdentifiers.length > 0) {
            aliveFileIds = await checkSessionsAlive({
              files: filesWithIdentifiers as TFile[],
              apiKey: codeApiKey,
            });
          }
        }

        // Compute which files need provisioning (don't actually provision yet)
        const codeEnvFiles: TFile[] = [];
        const vectorDBFiles: TFile[] = [];

        for (const file of attachments) {
          if (!file?.file_id) {
            continue;
          }

          if (
            needsCodeEnv &&
            codeApiKey &&
            !processedResourceFiles.has(`${EToolResources.execute_code}:${file.file_id}`)
          ) {
            const hasFileIdentifier = !!file.metadata?.fileIdentifier;
            const isStale = hasFileIdentifier && !aliveFileIds.has(file.file_id);

            if (!hasFileIdentifier || isStale) {
              if (isStale) {
                logger.info(
                  `[primeResources] Code env file expired for "${file.filename}" (${file.file_id}), will re-provision on tool use`,
                );
                file.metadata = { ...file.metadata, fileIdentifier: undefined };
              }
              codeEnvFiles.push(file);
            } else {
              // File is alive, categorize it now
              addFileToResource({
                file,
                resourceType: EToolResources.execute_code,
                tool_resources,
                processedResourceFiles,
              });
            }
          }

          const isImage = file.type?.startsWith('image') ?? false;
          if (
            needsVectorDB &&
            !isImage &&
            file.embedded !== true &&
            !processedResourceFiles.has(`${EToolResources.file_search}:${file.file_id}`)
          ) {
            vectorDBFiles.push(file);
          }
        }

        if (codeEnvFiles.length > 0 || vectorDBFiles.length > 0) {
          provisionState = { codeEnvFiles, vectorDBFiles, codeApiKey, aliveFileIds };
        }
      }
    }

    return { attachments, tool_resources, provisionState, warnings };
  } catch (error) {
    logger.error('Error priming resources', error);

    // Safely try to get attachments without rethrowing
    let safeAttachments: Array<TFile | undefined> = [];
    if (_attachments) {
      try {
        const attachmentFiles = await _attachments;
        safeAttachments = (attachmentFiles?.filter((file) => !!file) ?? []) as Array<TFile>;
      } catch (attachmentError) {
        // If attachments promise is also rejected, just use empty array
        logger.error('Error resolving attachments in catch block', attachmentError);
        safeAttachments = [];
      }
    }

    return {
      attachments: safeAttachments,
      tool_resources: _tool_resources,
      provisionState: undefined,
      warnings: [],
    };
  }
};
