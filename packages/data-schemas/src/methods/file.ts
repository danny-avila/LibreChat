import logger from '../config/winston';
import { EToolResources, FileContext } from 'librechat-data-provider';
import type { FilterQuery, QueryOptions, SortOrder } from 'mongoose';

export interface IFile {
  _id?: unknown;
  file_id: string;
  user: unknown;
  filename: string;
  filepath: string;
  type: string;
  bytes: number;
  embedded?: boolean;
  text?: string;
  context?: string;
  usage?: number;
  metadata?: {
    fileIdentifier?: string;
  };
  temp_file_id?: string;
  updatedAt?: Date;
  expiresAt?: Date;
}

/** Factory function that takes mongoose instance and returns the file methods */
export function createFileMethods(mongoose: typeof import('mongoose')) {
  /**
   * Finds a file by its file_id with additional query options.
   * @param file_id - The unique identifier of the file
   * @param options - Query options for filtering, projection, etc.
   * @returns A promise that resolves to the file document or null
   */
  async function findFileById(
    file_id: string,
    options: Record<string, unknown> = {},
  ): Promise<IFile | null> {
    const File = mongoose.models.File;
    return (await File.findOne({ file_id, ...options }).lean()) as IFile | null;
  }

  /**
   * Retrieves files matching a given filter, sorted by the most recently updated.
   * @param filter - The filter criteria to apply
   * @param _sortOptions - Optional sort parameters
   * @param selectFields - Fields to include/exclude in the query results. Default excludes the 'text' field
   * @param options - Additional query options (userId, agentId for ACL)
   * @returns A promise that resolves to an array of file documents
   */
  async function getFiles(
    filter: FilterQuery<IFile>,
    _sortOptions?: Record<string, SortOrder> | null,
    selectFields: QueryOptions<IFile> | string | null = { text: 0 },
  ): Promise<IFile[]> {
    const File = mongoose.models.File;
    const sortOptions = { updatedAt: -1 as SortOrder, ..._sortOptions };
    return (await File.find(filter).select(selectFields).sort(sortOptions).lean()) as IFile[];
  }

  /**
   * Retrieves tool files (files that are embedded or have a fileIdentifier) from an array of file IDs
   * @param fileIds - Array of file_id strings to search for
   * @param toolResourceSet - Optional filter for tool resources
   * @returns Files that match the criteria
   */
  async function getToolFilesByIds(
    fileIds: string[],
    toolResourceSet?: Set<EToolResources>,
  ): Promise<IFile[]> {
    if (!fileIds || !fileIds.length || !toolResourceSet?.size) {
      return [];
    }

    try {
      const filter: FilterQuery<IFile> = {
        file_id: { $in: fileIds },
        $or: [],
      };

      if (toolResourceSet.has(EToolResources.context)) {
        filter.$or?.push({ text: { $exists: true, $ne: null }, context: FileContext.agents });
      }
      if (toolResourceSet.has(EToolResources.file_search)) {
        filter.$or?.push({ embedded: true });
      }
      if (toolResourceSet.has(EToolResources.execute_code)) {
        filter.$or?.push({ 'metadata.fileIdentifier': { $exists: true } });
      }

      const selectFields = { text: 0 };
      const sortOptions = { updatedAt: -1 as SortOrder };

      return await getFiles(filter, sortOptions, selectFields);
    } catch (error) {
      logger.error('[getToolFilesByIds] Error retrieving tool files:', error);
      throw new Error('Error retrieving tool files');
    }
  }

  /**
   * Creates a new file with a TTL of 1 hour.
   * @param data - The file data to be created, must contain file_id
   * @param disableTTL - Whether to disable the TTL
   * @returns A promise that resolves to the created file document
   */
  async function createFile(data: Partial<IFile>, disableTTL?: boolean): Promise<IFile> {
    const File = mongoose.models.File;
    const fileData: Partial<IFile> = {
      ...data,
      expiresAt: new Date(Date.now() + 3600 * 1000),
    };

    if (disableTTL) {
      delete fileData.expiresAt;
    }

    return (await File.findOneAndUpdate({ file_id: data.file_id }, fileData, {
      new: true,
      upsert: true,
    }).lean()) as IFile;
  }

  /**
   * Updates a file identified by file_id with new data and removes the TTL.
   * @param data - The data to update, must contain file_id
   * @returns A promise that resolves to the updated file document
   */
  async function updateFile(data: Partial<IFile> & { file_id: string }): Promise<IFile> {
    const File = mongoose.models.File;
    const { file_id, ...update } = data;
    const updateOperation = {
      $set: update,
      $unset: { expiresAt: '' },
    };
    return (await File.findOneAndUpdate({ file_id }, updateOperation, {
      new: true,
    }).lean()) as IFile;
  }

  /**
   * Increments the usage of a file identified by file_id.
   * @param data - The data to update, must contain file_id and the increment value for usage
   * @returns A promise that resolves to the updated file document
   */
  async function updateFileUsage(data: { file_id: string; inc?: number }): Promise<IFile | null> {
    const File = mongoose.models.File;
    const { file_id, inc = 1 } = data;
    const updateOperation = {
      $inc: { usage: inc },
      $unset: { expiresAt: '', temp_file_id: '' },
    };
    return (await File.findOneAndUpdate({ file_id }, updateOperation, {
      new: true,
    }).lean()) as IFile | null;
  }

  /**
   * Deletes a file identified by file_id.
   * @param file_id - The unique identifier of the file to delete
   * @returns A promise that resolves to the deleted file document or null
   */
  async function deleteFile(file_id: string): Promise<IFile | null> {
    const File = mongoose.models.File;
    return (await File.findOneAndDelete({ file_id }).lean()) as IFile | null;
  }

  /**
   * Deletes a file identified by a filter.
   * @param filter - The filter criteria to apply
   * @returns A promise that resolves to the deleted file document or null
   */
  async function deleteFileByFilter(filter: FilterQuery<IFile>): Promise<IFile | null> {
    const File = mongoose.models.File;
    return (await File.findOneAndDelete(filter).lean()) as IFile | null;
  }

  /**
   * Deletes multiple files identified by an array of file_ids.
   * @param file_ids - The unique identifiers of the files to delete
   * @param user - Optional user ID to filter by
   * @returns A promise that resolves to the result of the deletion operation
   */
  async function deleteFiles(
    file_ids: string[],
    user?: string,
  ): Promise<{ deletedCount?: number }> {
    const File = mongoose.models.File;
    let deleteQuery: FilterQuery<IFile> = { file_id: { $in: file_ids } };
    if (user) {
      deleteQuery = { user: user };
    }
    return await File.deleteMany(deleteQuery);
  }

  /**
   * Batch updates files with new signed URLs in MongoDB
   * @param updates - Array of updates in the format { file_id, filepath }
   */
  async function batchUpdateFiles(
    updates: Array<{ file_id: string; filepath: string }>,
  ): Promise<void> {
    if (!updates || updates.length === 0) {
      return;
    }

    const File = mongoose.models.File;
    const bulkOperations = updates.map((update) => ({
      updateOne: {
        filter: { file_id: update.file_id },
        update: { $set: { filepath: update.filepath } },
      },
    }));

    const result = await File.bulkWrite(bulkOperations);
    logger.info(`Updated ${result.modifiedCount} files with new S3 URLs`);
  }

  /**
   * Updates usage tracking for multiple files.
   * Processes files and optional fileIds, updating their usage count in the database.
   *
   * @param files - Array of file objects to process
   * @param fileIds - Optional array of file IDs to process
   * @returns Array of updated file documents (with null results filtered out)
   */
  async function updateFilesUsage(
    files: Array<{ file_id: string }>,
    fileIds?: string[],
  ): Promise<IFile[]> {
    const promises: Promise<IFile | null>[] = [];
    const seen = new Set<string>();

    for (const file of files) {
      const { file_id } = file;
      if (seen.has(file_id)) {
        continue;
      }
      seen.add(file_id);
      promises.push(updateFileUsage({ file_id }));
    }

    if (!fileIds) {
      const results = await Promise.all(promises);
      return results.filter((result): result is IFile => result != null);
    }

    for (const file_id of fileIds) {
      if (seen.has(file_id)) {
        continue;
      }
      seen.add(file_id);
      promises.push(updateFileUsage({ file_id }));
    }

    const results = await Promise.all(promises);
    return results.filter((result): result is IFile => result != null);
  }

  return {
    findFileById,
    getFiles,
    getToolFilesByIds,
    createFile,
    updateFile,
    updateFileUsage,
    deleteFile,
    deleteFiles,
    deleteFileByFilter,
    batchUpdateFiles,
    updateFilesUsage,
  };
}

export type FileMethods = ReturnType<typeof createFileMethods>;
