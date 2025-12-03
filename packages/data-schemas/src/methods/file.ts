import logger from '../config/winston';
import { EToolResources, FileContext } from 'librechat-data-provider';
import type { FilterQuery, SortOrder, Model } from 'mongoose';
import type { IMongoFile } from '~/types/file';

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
  ): Promise<IMongoFile | null> {
    const File = mongoose.models.File as Model<IMongoFile>;
    return File.findOne({ file_id, ...options }).lean();
  }

  /** Select fields for query projection - 0 to exclude, 1 to include */
  type SelectProjection = Record<string, 0 | 1>;

  /**
   * Retrieves files matching a given filter, sorted by the most recently updated.
   * @param filter - The filter criteria to apply
   * @param _sortOptions - Optional sort parameters
   * @param selectFields - Fields to include/exclude in the query results. Default excludes the 'text' field
   * @param options - Additional query options (userId, agentId for ACL)
   * @returns A promise that resolves to an array of file documents
   */
  async function getFiles(
    filter: FilterQuery<IMongoFile>,
    _sortOptions?: Record<string, SortOrder> | null,
    selectFields?: SelectProjection | string | null,
  ): Promise<IMongoFile[] | null> {
    const File = mongoose.models.File as Model<IMongoFile>;
    const sortOptions = { updatedAt: -1 as SortOrder, ..._sortOptions };
    const query = File.find(filter);
    if (selectFields != null) {
      query.select(selectFields);
    } else {
      query.select({ text: 0 });
    }
    return await query.sort(sortOptions).lean();
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
  ): Promise<IMongoFile[]> {
    if (!fileIds || !fileIds.length || !toolResourceSet?.size) {
      return [];
    }

    try {
      const filter: FilterQuery<IMongoFile> = {
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

      const selectFields: SelectProjection = { text: 0 };
      const sortOptions = { updatedAt: -1 as SortOrder };

      const results = await getFiles(filter, sortOptions, selectFields);
      return results ?? [];
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
  async function createFile(
    data: Partial<IMongoFile>,
    disableTTL?: boolean,
  ): Promise<IMongoFile | null> {
    const File = mongoose.models.File as Model<IMongoFile>;
    const fileData: Partial<IMongoFile> = {
      ...data,
      expiresAt: new Date(Date.now() + 3600 * 1000),
    };

    if (disableTTL) {
      delete fileData.expiresAt;
    }

    return File.findOneAndUpdate({ file_id: data.file_id }, fileData, {
      new: true,
      upsert: true,
    }).lean();
  }

  /**
   * Updates a file identified by file_id with new data and removes the TTL.
   * @param data - The data to update, must contain file_id
   * @returns A promise that resolves to the updated file document
   */
  async function updateFile(
    data: Partial<IMongoFile> & { file_id: string },
  ): Promise<IMongoFile | null> {
    const File = mongoose.models.File as Model<IMongoFile>;
    const { file_id, ...update } = data;
    const updateOperation = {
      $set: update,
      $unset: { expiresAt: '' },
    };
    return File.findOneAndUpdate({ file_id }, updateOperation, {
      new: true,
    }).lean();
  }

  /**
   * Increments the usage of a file identified by file_id.
   * @param data - The data to update, must contain file_id and the increment value for usage
   * @returns A promise that resolves to the updated file document
   */
  async function updateFileUsage(data: {
    file_id: string;
    inc?: number;
  }): Promise<IMongoFile | null> {
    const File = mongoose.models.File as Model<IMongoFile>;
    const { file_id, inc = 1 } = data;
    const updateOperation = {
      $inc: { usage: inc },
      $unset: { expiresAt: '', temp_file_id: '' },
    };
    return File.findOneAndUpdate({ file_id }, updateOperation, {
      new: true,
    }).lean();
  }

  /**
   * Deletes a file identified by file_id.
   * @param file_id - The unique identifier of the file to delete
   * @returns A promise that resolves to the deleted file document or null
   */
  async function deleteFile(file_id: string): Promise<IMongoFile | null> {
    const File = mongoose.models.File as Model<IMongoFile>;
    return File.findOneAndDelete({ file_id }).lean();
  }

  /**
   * Deletes a file identified by a filter.
   * @param filter - The filter criteria to apply
   * @returns A promise that resolves to the deleted file document or null
   */
  async function deleteFileByFilter(filter: FilterQuery<IMongoFile>): Promise<IMongoFile | null> {
    const File = mongoose.models.File as Model<IMongoFile>;
    return File.findOneAndDelete(filter).lean();
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
    const File = mongoose.models.File as Model<IMongoFile>;
    let deleteQuery: FilterQuery<IMongoFile> = { file_id: { $in: file_ids } };
    if (user) {
      deleteQuery = { user: user };
    }
    return File.deleteMany(deleteQuery);
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

    const File = mongoose.models.File as Model<IMongoFile>;
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
  ): Promise<IMongoFile[]> {
    const promises: Promise<IMongoFile | null>[] = [];
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
      return results.filter((result): result is IMongoFile => result != null);
    }

    for (const file_id of fileIds) {
      if (seen.has(file_id)) {
        continue;
      }
      seen.add(file_id);
      promises.push(updateFileUsage({ file_id }));
    }

    const results = await Promise.all(promises);
    return results.filter((result): result is IMongoFile => result != null);
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
