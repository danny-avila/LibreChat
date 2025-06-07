import { logger } from '@librechat/data-schemas';
import { EModelEndpoint, EToolResources, AgentCapabilities } from 'librechat-data-provider';
import type { FilterQuery, QueryOptions, ProjectionType } from 'mongoose';
import type { AgentToolResources, TFile } from 'librechat-data-provider';
import type { IMongoFile } from '@librechat/data-schemas';
import type { Request as ServerRequest } from 'express';

export type TGetFiles = (
  filter: FilterQuery<IMongoFile>,
  _sortOptions: ProjectionType<IMongoFile> | null | undefined,
  selectFields: QueryOptions<IMongoFile> | null | undefined,
) => Promise<Array<TFile>>;

/**
 * @param params
 * @param params.req
 * @param params.attachments
 * @param params.requestFileSet
 * @param params.tool_resources
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
    let attachments: Array<TFile | undefined> | undefined;
    const tool_resources = _tool_resources ?? {};
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
      attachments = (attachments ?? []).concat(context);
    }
    if (!_attachments) {
      return { attachments, tool_resources };
    }
    const files = await _attachments;
    if (!attachments) {
      attachments = [];
    }

    for (const file of files) {
      if (!file) {
        continue;
      }
      if (file.metadata?.fileIdentifier) {
        const execute_code = tool_resources[EToolResources.execute_code] ?? {};
        if (!execute_code.files) {
          tool_resources[EToolResources.execute_code] = { ...execute_code, files: [] };
        }
        tool_resources[EToolResources.execute_code]?.files?.push(file);
      } else if (file.embedded === true) {
        const file_search = tool_resources[EToolResources.file_search] ?? {};
        if (!file_search.files) {
          tool_resources[EToolResources.file_search] = { ...file_search, files: [] };
        }
        tool_resources[EToolResources.file_search]?.files?.push(file);
      } else if (
        requestFileSet.has(file.file_id) &&
        file.type.startsWith('image') &&
        file.height &&
        file.width
      ) {
        const image_edit = tool_resources[EToolResources.image_edit] ?? {};
        if (!image_edit.files) {
          tool_resources[EToolResources.image_edit] = { ...image_edit, files: [] };
        }
        tool_resources[EToolResources.image_edit]?.files?.push(file);
      }

      attachments.push(file);
    }
    return { attachments, tool_resources };
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
