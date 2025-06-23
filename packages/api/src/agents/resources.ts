import { logger } from '@librechat/data-schemas';
import { EModelEndpoint, EToolResources, AgentCapabilities } from 'librechat-data-provider';
import type { AgentToolResources, TFile, AgentBaseResource } from 'librechat-data-provider';
import type { FilterQuery, QueryOptions, ProjectionType } from 'mongoose';
import type { IMongoFile } from '@librechat/data-schemas';
import type { Request as ServerRequest } from 'express';

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
 * Helper function to add a file to a specific tool resource category
 * Prevents duplicate files within the same resource category
 * @param params - Parameters object
 * @param params.file - The file to add to the resource
 * @param params.resourceType - The type of tool resource (e.g., execute_code, file_search, image_edit)
 * @param params.tool_resources - The agent's tool resources object to update
 * @param params.processedResourceFiles - Set tracking processed files per resource type
 */
const addFileToResource = ({
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
  if (file.metadata?.fileIdentifier) {
    addFileToResource({
      file,
      resourceType: EToolResources.execute_code,
      tool_resources,
      processedResourceFiles,
    });
    return;
  }

  if (file.embedded === true) {
    addFileToResource({
      file,
      resourceType: EToolResources.file_search,
      tool_resources,
      processedResourceFiles,
    });
    return;
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
 * 1. Fetches OCR files if OCR is enabled
 * 2. Processes attachment files
 * 3. Categorizes files into appropriate tool resources
 * 4. Prevents duplicate files across all sources
 *
 * @param params - Parameters object
 * @param params.req - Express request object containing app configuration
 * @param params.getFiles - Function to retrieve files from database
 * @param params.requestFileSet - Set of file IDs from the current request
 * @param params.attachments - Promise resolving to array of attachment files
 * @param params.tool_resources - Existing tool resources for the agent
 * @returns Promise resolving to processed attachments and updated tool resources
 */
export const primeResources = async ({
  req,
  getFiles,
  requestFileSet,
  attachments: _attachments,
  tool_resources: _tool_resources,
}: {
  req: ServerRequest;
  requestFileSet: Set<string>;
  attachments: Promise<Array<TFile | null>> | undefined;
  tool_resources: AgentToolResources | undefined;
  getFiles: TGetFiles;
}): Promise<{
  attachments: Array<TFile | undefined> | undefined;
  tool_resources: AgentToolResources | undefined;
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
     * Initialized from input parameter or empty object if not provided
     */
    const tool_resources = _tool_resources ?? {};

    // Track existing files in tool_resources to prevent duplicates within resources
    for (const [resourceType, resource] of Object.entries(tool_resources)) {
      if (resource?.files && Array.isArray(resource.files)) {
        for (const file of resource.files) {
          if (file?.file_id) {
            processedResourceFiles.add(`${resourceType}:${file.file_id}`);
            // Files from non-OCR resources should not be added to attachments from _attachments
            if (resourceType !== EToolResources.ocr) {
              attachmentFileIds.add(file.file_id);
            }
          }
        }
      }
    }

    const isOCREnabled = (req.app.locals?.[EModelEndpoint.agents]?.capabilities ?? []).includes(
      AgentCapabilities.ocr,
    );

    if (tool_resources[EToolResources.ocr]?.file_ids && isOCREnabled) {
      const context = await getFiles(
        {
          file_id: { $in: tool_resources.ocr.file_ids },
        },
        {},
        {},
      );

      for (const file of context) {
        if (!file?.file_id) {
          continue;
        }

        // Clear from attachmentFileIds if it was pre-added
        attachmentFileIds.delete(file.file_id);

        // Add to attachments
        attachments.push(file);
        attachmentFileIds.add(file.file_id);

        // Categorize for tool resources
        categorizeFileForToolResources({
          file,
          tool_resources,
          requestFileSet,
          processedResourceFiles,
        });
      }
    }

    if (!_attachments) {
      return { attachments: attachments.length > 0 ? attachments : undefined, tool_resources };
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

    return { attachments: attachments.length > 0 ? attachments : [], tool_resources };
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
    };
  }
};
