import type { Model, Types } from 'mongoose';
import type { MCPServerDocument } from '~/types';
import type { MCPOptions } from 'librechat-data-provider';
import { nanoid } from 'nanoid';

export function createMCPServerMethods(mongoose: typeof import('mongoose')) {
  /**
   * Create a new MCP server
   * @param data - Object containing title, options, and author
   * @returns The created MCP server document
   */
  async function createMCPServer(data: {
    title: string;
    options: MCPOptions;
    author: string | Types.ObjectId;
  }): Promise<MCPServerDocument> {
    const MCPServer = mongoose.models.MCPServer as Model<MCPServerDocument>;

    const mcp_id = `mcp_${nanoid(16)}`;

    const newServer = await MCPServer.create({
      mcp_id,
      title: data.title,
      options: data.options,
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
   * Find MCP servers by array of ObjectIds
   * @param ids - Array of MongoDB ObjectIds
   * @returns Array of MCP server documents
   */
  async function findMCPServersByIds(
    ids: (string | Types.ObjectId)[],
  ): Promise<MCPServerDocument[]> {
    const MCPServer = mongoose.models.MCPServer as Model<MCPServerDocument>;
    return await MCPServer.find({ _id: { $in: ids } })
      .sort({ updatedAt: -1 })
      .lean();
  }

  /**
   * Update an MCP server
   * @param mcp_id - The MCP server ID
   * @param updateData - Object containing fields to update
   * @returns The updated MCP server document or null
   */
  async function updateMCPServer(
    mcp_id: string,
    updateData: { title?: string; options?: MCPOptions },
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
    findMCPServersByIds,
    updateMCPServer,
    deleteMCPServer,
  };
}

export type MCPServerMethods = ReturnType<typeof createMCPServerMethods>;
