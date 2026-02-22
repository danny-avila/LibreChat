import { Types } from 'mongoose';
import logger from '~/config/winston';
import type { IMemoryDocumentLean, ScopedMemoryResult, GetMemoryDocumentsParams, UpsertMemoryDocumentParams } from '~/types/memoryDocument';
import type { IUserProjectLean } from '~/types/userProject';

export function createMemoryDocumentMethods(mongoose: typeof import('mongoose')) {
  async function getMemoryDocuments({ userId, projectId }: GetMemoryDocumentsParams): Promise<ScopedMemoryResult> {
    try {
      const MemoryDocument = mongoose.models.MemoryDocument;
      const UserProject = mongoose.models.UserProject;

      const filter = projectId
        ? {
            userId,
            $or: [
              { scope: 'global' },
              { scope: 'project', projectId },
            ],
          }
        : { userId, scope: 'global' };

      const docs = (await MemoryDocument.find(filter).lean()) as IMemoryDocumentLean[];

      let globalContent = '';
      let projectContent = '';
      let projectName = '';
      let totalTokens = 0;

      for (const doc of docs) {
        totalTokens += doc.tokenCount || 0;
        if (doc.scope === 'global') {
          globalContent = doc.content;
        } else if (doc.scope === 'project') {
          projectContent = doc.content;
        }
      }

      if (projectId && projectContent) {
        const project = (await UserProject.findById(projectId).lean()) as IUserProjectLean | null;
        if (project) {
          projectName = project.name;
        }
      }

      return { globalContent, projectContent, projectName, totalTokens };
    } catch (error) {
      logger.error('Failed to get memory documents:', error);
      return { globalContent: '', projectContent: '', projectName: '', totalTokens: 0 };
    }
  }

  async function upsertMemoryDocument({
    userId,
    scope,
    projectId,
    content,
    tokenCount,
  }: UpsertMemoryDocumentParams): Promise<IMemoryDocumentLean | null> {
    try {
      const MemoryDocument = mongoose.models.MemoryDocument;
      const filter: Record<string, string | Types.ObjectId | null> = { userId: userId.toString(), scope };
      if (scope === 'project' && projectId) {
        filter.projectId = new Types.ObjectId(projectId.toString());
      } else {
        filter.projectId = null;
      }

      const doc = await MemoryDocument.findOneAndUpdate(
        filter,
        { content, tokenCount },
        { upsert: true, new: true },
      ).lean();

      return doc as IMemoryDocumentLean;
    } catch (error) {
      throw new Error(
        `Failed to upsert memory document: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  async function getMemoryDocumentsByUser(
    userId: string | Types.ObjectId,
  ): Promise<IMemoryDocumentLean[]> {
    try {
      const MemoryDocument = mongoose.models.MemoryDocument;
      return (await MemoryDocument.find({ userId }).lean()) as IMemoryDocumentLean[];
    } catch (error) {
      throw new Error(
        `Failed to get memory documents: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  async function deleteMemoryDocument(
    userId: string | Types.ObjectId,
    scope: 'global' | 'project',
    projectId?: string | Types.ObjectId | null,
  ): Promise<boolean> {
    try {
      const MemoryDocument = mongoose.models.MemoryDocument;
      const filter: Record<string, string | Types.ObjectId | null> = { userId: userId.toString(), scope };
      if (scope === 'project' && projectId) {
        filter.projectId = new Types.ObjectId(projectId.toString());
      } else {
        filter.projectId = null;
      }
      const result = await MemoryDocument.findOneAndDelete(filter);
      return !!result;
    } catch (error) {
      throw new Error(
        `Failed to delete memory document: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  return {
    getMemoryDocuments,
    upsertMemoryDocument,
    getMemoryDocumentsByUser,
    deleteMemoryDocument,
  };
}

export type MemoryDocumentMethods = ReturnType<typeof createMemoryDocumentMethods>;
