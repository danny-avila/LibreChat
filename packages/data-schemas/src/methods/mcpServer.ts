import type { Model, RootFilterQuery, Types } from 'mongoose';
import type { MCPServerDocument } from '../types';
import type { MCPOptions } from 'librechat-data-provider';
import logger from '~/config/winston';
import { nanoid } from 'nanoid';

const NORMALIZED_LIMIT_DEFAULT = 20;

/**
 * Escapes special regex characters in a string so they are treated literally.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Generates a URL-friendly server name from a title.
 * Converts to lowercase, replaces spaces with hyphens, removes special characters.
 */
function generateServerNameFromTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '') // Remove special chars except spaces and hyphens
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Remove consecutive hyphens
    .replace(/^-|-$/g, ''); // Trim leading/trailing hyphens

  return slug || 'mcp-server'; // Fallback if empty
}

export function createMCPServerMethods(mongoose: typeof import('mongoose')) {
  /**
   * Finds the next available server name by checking for duplicates.
   * If baseName exists, returns baseName-2, baseName-3, etc.
   */
  async function findNextAvailableServerName(baseName: string): Promise<string> {
    const MCPServer = mongoose.models.MCPServer as Model<MCPServerDocument>;

    // Find all servers with matching base name pattern (baseName or baseName-N)
    const escapedBaseName = escapeRegex(baseName);
    const existing = await MCPServer.find({
      serverName: { $regex: `^${escapedBaseName}(-\\d+)?$` },
    })
      .select('serverName')
      .lean();

    if (existing.length === 0) {
      return baseName;
    }

    // Extract numbers from existing names
    const numbers = existing.map((s) => {
      const match = s.serverName.match(/-(\d+)$/);
      return match ? parseInt(match[1], 10) : 1;
    });

    const maxNumber = Math.max(...numbers);
    return `${baseName}-${maxNumber + 1}`;
  }

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

    // Generate serverName from title, with fallback to nanoid if no title
    let serverName: string;
    if (data.config.title) {
      const baseSlug = generateServerNameFromTitle(data.config.title);
      serverName = await findNextAvailableServerName(baseSlug);
    } else {
      serverName = `mcp-${nanoid(16)}`;
    }

    const newServer = await MCPServer.create({
      serverName,
      config: data.config,
      author: data.author,
    });

    return newServer.toObject() as MCPServerDocument;
  }

  /**
   * Find an MCP server by serverName
   * @param serverName - The MCP server ID
   * @returns The MCP server document or null
   */
  async function findMCPServerById(serverName: string): Promise<MCPServerDocument | null> {
    const MCPServer = mongoose.models.MCPServer as Model<MCPServerDocument>;
    return await MCPServer.findOne({ serverName }).lean();
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
   * @param serverName - The MCP server ID
   * @param updateData - Object containing config to update
   * @returns The updated MCP server document or null
   */
  async function updateMCPServer(
    serverName: string,
    updateData: { config?: MCPOptions },
  ): Promise<MCPServerDocument | null> {
    const MCPServer = mongoose.models.MCPServer as Model<MCPServerDocument>;
    return await MCPServer.findOneAndUpdate(
      { serverName },
      { $set: updateData },
      { new: true, runValidators: true },
    ).lean();
  }

  /**
   * Delete an MCP server
   * @param serverName - The MCP server ID
   * @returns The deleted MCP server document or null
   */
  async function deleteMCPServer(serverName: string): Promise<MCPServerDocument | null> {
    const MCPServer = mongoose.models.MCPServer as Model<MCPServerDocument>;
    return await MCPServer.findOneAndDelete({ serverName }).lean();
  }

  /**
   * Get MCP servers by their serverName strings
   * @param names - Array of serverName strings to fetch
   * @returns Object containing array of MCP server documents
   */
  async function getListMCPServersByNames({ names = [] }: { names: string[] }): Promise<{
    data: MCPServerDocument[];
  }> {
    if (names.length === 0) {
      return { data: [] };
    }
    const MCPServer = mongoose.models.MCPServer as Model<MCPServerDocument>;
    const servers = await MCPServer.find({ serverName: { $in: names } }).lean();
    return { data: servers };
  }

  return {
    createMCPServer,
    findMCPServerById,
    findMCPServerByObjectId,
    findMCPServersByAuthor,
    getListMCPServersByIds,
    getListMCPServersByNames,
    updateMCPServer,
    deleteMCPServer,
  };
}

export type MCPServerMethods = ReturnType<typeof createMCPServerMethods>;
