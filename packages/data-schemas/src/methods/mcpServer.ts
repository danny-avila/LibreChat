import type { Model, RootFilterQuery, Types } from 'mongoose';
import type { MCPServerDocument } from '~/types';
import type { MCPOptions } from 'librechat-data-provider';
import logger from '~/config/winston';
import { nanoid } from 'nanoid';

const NORMALIZED_LIMIT_DEFAULT = 20;

export function createMCPServerMethods(mongoose: typeof import('mongoose')) {
  /**
   * Create a new MCP server
   * @param data - Object containing config (with title, description, url, etc.) and author
   * @returns The created MCP server document
   */
  async function createMCPServer(data: {
    config: MCPOptions;
    author: string | Types.ObjectId;
  }): Promise<MCPServerDocument> {
    const MCPServer = mongoose.models.MCPServer as Model<MCPServerDocument>;

    const mcp_id = `mcp_${nanoid(16)}`;

    const newServer = await MCPServer.create({
      mcp_id,
      config: data.config,
      author: data.author,
    });

    return newServer.toObject() as MCPServerDocument;
  }

  /**
   * Find an MCP server by mcp_id
   * @param mcp_id - The MCP server ID
   * @returns The MCP server document or null
   */
  async function findMCPServerById(mcp_id: string): Promise<MCPServerDocument | null> {
    const MCPServer = mongoose.models.MCPServer as Model<MCPServerDocument>;
    return await MCPServer.findOne({ mcp_id }).lean();
  }

  /**
   * Find an MCP server by MongoDB ObjectId
   * @param _id - The MongoDB ObjectId
   * @returns The MCP server document or null
   */
  async function findMCPServerByObjectId(
    _id: string | Types.ObjectId,
  ): Promise<MCPServerDocument | null> {
    const MCPServer = mongoose.models.MCPServer as Model<MCPServerDocument>;
    return await MCPServer.findById(_id).lean();
  }

  /**
   * Find MCP servers by author
   * @param authorId - The author's ObjectId or string
   * @returns Array of MCP server documents
   */
  async function findMCPServersByAuthor(
    authorId: string | Types.ObjectId,
  ): Promise<MCPServerDocument[]> {
    const MCPServer = mongoose.models.MCPServer as Model<MCPServerDocument>;
    return await MCPServer.find({ author: authorId }).sort({ updatedAt: -1 }).lean();
  }

  /**
   * Get a paginated list of MCP servers by IDs with filtering and search
   * @param ids - Array of ObjectIds to include
   * @param otherParams - Additional filter parameters (e.g., search)
   * @param limit - Page size limit (null for no pagination)
   * @param after - Cursor for pagination
   * @returns Paginated list of MCP servers
   */
  async function getListMCPServersByIds({
    ids = [],
    otherParams = {},
    limit = null,
    after = null,
  }: {
    ids?: Types.ObjectId[];
    otherParams?: RootFilterQuery<MCPServerDocument>;
    limit?: number | null;
    after?: string | null;
  }): Promise<{
    data: MCPServerDocument[];
    has_more: boolean;
    after: string | null;
  }> {
    const MCPServer = mongoose.models.MCPServer as Model<MCPServerDocument>;
    const isPaginated = limit !== null && limit !== undefined;
    const normalizedLimit = isPaginated
      ? Math.min(Math.max(1, parseInt(String(limit)) || NORMALIZED_LIMIT_DEFAULT), 100)
      : null;

    // Build base query combining accessible servers with other filters
    const baseQuery: RootFilterQuery<MCPServerDocument> = { ...otherParams, _id: { $in: ids } };

    // Add cursor condition
    if (after) {
      try {
        const cursor = JSON.parse(Buffer.from(after, 'base64').toString('utf8'));
        const { updatedAt, _id } = cursor;

        const cursorCondition = {
          $or: [
            { updatedAt: { $lt: new Date(updatedAt) } },
            { updatedAt: new Date(updatedAt), _id: { $gt: new mongoose.Types.ObjectId(_id) } },
          ],
        };

        // Merge cursor condition with base query
        if (Object.keys(baseQuery).length > 0) {
          baseQuery.$and = [{ ...baseQuery }, cursorCondition];
          // Remove the original conditions from baseQuery to avoid duplication
          Object.keys(baseQuery).forEach((key) => {
            if (key !== '$and') {
              delete baseQuery[key];
            }
          });
        }
      } catch (error) {
        // Invalid cursor, ignore
        logger.warn('[getListMCPServersByIds] Invalid cursor provided', error);
      }
    }

    if (normalizedLimit === null) {
      // No pagination - return all matching servers
      const servers = await MCPServer.find(baseQuery).sort({ updatedAt: -1, _id: 1 }).lean();

      return {
        data: servers,
        has_more: false,
        after: null,
      };
    }

    // Paginated query - assign to const to help TypeScript
    const servers = await MCPServer.find(baseQuery)
      .sort({ updatedAt: -1, _id: 1 })
      .limit(normalizedLimit + 1)
      .lean();

    const hasMore = servers.length > normalizedLimit;
    const data = hasMore ? servers.slice(0, normalizedLimit) : servers;

    let nextCursor = null;
    if (hasMore && data.length > 0) {
      const lastItem = data[data.length - 1];
      nextCursor = Buffer.from(
        JSON.stringify({
          updatedAt: lastItem.updatedAt,
          _id: lastItem._id,
        }),
      ).toString('base64');
    }

    return {
      data,
      has_more: hasMore,
      after: nextCursor,
    };
  }

  /**
   * Update an MCP server
   * @param mcp_id - The MCP server ID
   * @param updateData - Object containing config to update
   * @returns The updated MCP server document or null
   */
  async function updateMCPServer(
    mcp_id: string,
    updateData: { config?: MCPOptions },
  ): Promise<MCPServerDocument | null> {
    const MCPServer = mongoose.models.MCPServer as Model<MCPServerDocument>;
    return await MCPServer.findOneAndUpdate(
      { mcp_id },
      { $set: updateData },
      { new: true, runValidators: true },
    ).lean();
  }

  /**
   * Delete an MCP server
   * @param mcp_id - The MCP server ID
   * @returns The deleted MCP server document or null
   */
  async function deleteMCPServer(mcp_id: string): Promise<MCPServerDocument | null> {
    const MCPServer = mongoose.models.MCPServer as Model<MCPServerDocument>;
    return await MCPServer.findOneAndDelete({ mcp_id }).lean();
  }

  return {
    createMCPServer,
    findMCPServerById,
    findMCPServerByObjectId,
    findMCPServersByAuthor,
    getListMCPServersByIds,
    updateMCPServer,
    deleteMCPServer,
  };
}

export type MCPServerMethods = ReturnType<typeof createMCPServerMethods>;
