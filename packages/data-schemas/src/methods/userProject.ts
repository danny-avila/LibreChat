import crypto from 'crypto';
import type { Types } from 'mongoose';
import type { IUserProjectLean, IProjectMemoryEntry } from '~/types';

export function createUserProjectMethods(mongoose: typeof import('mongoose')) {
  function getModel() {
    return mongoose.models.UserProject;
  }

  async function createUserProject(params: {
    user: string | Types.ObjectId;
    name: string;
    description?: string;
    instructions?: string;
    color?: string;
    icon?: string;
    defaultModel?: string;
    defaultEndpoint?: string;
  }): Promise<IUserProjectLean> {
    const UserProject = getModel();
    const doc = await UserProject.create({
      ...params,
      projectId: crypto.randomUUID(),
    });
    return doc.toObject() as IUserProjectLean;
  }

  async function getUserProjectById(
    user: string | Types.ObjectId,
    projectId: string,
  ): Promise<IUserProjectLean | null> {
    const UserProject = getModel();
    return (await UserProject.findOne({ user, projectId }).lean()) as IUserProjectLean | null;
  }

  async function getUserProjects(
    user: string | Types.ObjectId,
    params?: { cursor?: string; limit?: number; search?: string },
  ): Promise<{ projects: IUserProjectLean[]; nextCursor: string | null }> {
    const UserProject = getModel();
    const limit = Math.min(params?.limit ?? 50, 100);

    const query: Record<string, unknown> = { user };

    if (params?.search) {
      query.name = { $regex: params.search, $options: 'i' };
    }

    if (params?.cursor) {
      const cursorDoc = (await UserProject.findOne({
        user,
        projectId: params.cursor,
      }).lean()) as IUserProjectLean | null;
      if (cursorDoc) {
        query.$or = [
          { updatedAt: { $lt: cursorDoc.updatedAt } },
          { updatedAt: cursorDoc.updatedAt, _id: { $lt: cursorDoc._id } },
        ];
      }
    }

    const projects = await UserProject.find(query)
      .sort({ updatedAt: -1, _id: -1 })
      .limit(limit + 1)
      .lean<IUserProjectLean[]>();

    let nextCursor: string | null = null;
    if (projects.length > limit) {
      const last = projects.pop()!;
      nextCursor = last.projectId;
    }

    return { projects, nextCursor };
  }

  async function updateUserProject(
    user: string | Types.ObjectId,
    projectId: string,
    updates: {
      name?: string;
      description?: string;
      instructions?: string;
      color?: string;
      icon?: string;
      fileIds?: string[];
      memory?: IProjectMemoryEntry[];
      defaultModel?: string;
      defaultEndpoint?: string;
    },
  ): Promise<IUserProjectLean | null> {
    const UserProject = getModel();
    return (await UserProject.findOneAndUpdate(
      { user, projectId },
      { $set: updates },
      { new: true },
    ).lean()) as IUserProjectLean | null;
  }

  async function deleteUserProject(
    user: string | Types.ObjectId,
    projectId: string,
  ): Promise<boolean> {
    const UserProject = getModel();
    const result = await UserProject.findOneAndDelete({ user, projectId });
    return !!result;
  }

  async function addFileToProject(
    user: string | Types.ObjectId,
    projectId: string,
    fileId: string,
  ): Promise<IUserProjectLean | null> {
    const UserProject = getModel();
    return (await UserProject.findOneAndUpdate(
      { user, projectId },
      { $addToSet: { fileIds: fileId } },
      { new: true },
    ).lean()) as IUserProjectLean | null;
  }

  async function removeFileFromProject(
    user: string | Types.ObjectId,
    projectId: string,
    fileId: string,
  ): Promise<IUserProjectLean | null> {
    const UserProject = getModel();
    return (await UserProject.findOneAndUpdate(
      { user, projectId },
      { $pull: { fileIds: fileId } },
      { new: true },
    ).lean()) as IUserProjectLean | null;
  }

  return {
    createUserProject,
    getUserProjectById,
    getUserProjects,
    updateUserProject,
    deleteUserProject,
    addFileToProject,
    removeFileFromProject,
  };
}

export type UserProjectMethods = ReturnType<typeof createUserProjectMethods>;
