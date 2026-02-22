import { Types } from 'mongoose';
import type { IUserProjectLean } from '~/types/userProject';

export function createUserProjectMethods(mongoose: typeof import('mongoose')) {
  async function createUserProject(
    userId: string | Types.ObjectId,
    name: string,
    description?: string,
  ): Promise<IUserProjectLean> {
    try {
      const UserProject = mongoose.models.UserProject;
      const doc = await UserProject.create({ userId, name, description });
      return doc.toObject() as IUserProjectLean;
    } catch (error) {
      throw new Error(
        `Failed to create user project: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  async function getUserProjects(
    userId: string | Types.ObjectId,
  ): Promise<IUserProjectLean[]> {
    try {
      const UserProject = mongoose.models.UserProject;
      return (await UserProject.find({ userId }).sort({ updatedAt: -1 }).lean()) as IUserProjectLean[];
    } catch (error) {
      throw new Error(
        `Failed to get user projects: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  async function updateUserProject(
    userId: string | Types.ObjectId,
    projectId: string | Types.ObjectId,
    updates: { name?: string; description?: string },
  ): Promise<IUserProjectLean | null> {
    try {
      const UserProject = mongoose.models.UserProject;
      const doc = await UserProject.findOneAndUpdate(
        { _id: projectId, userId },
        updates,
        { new: true },
      ).lean();
      return doc as IUserProjectLean | null;
    } catch (error) {
      throw new Error(
        `Failed to update user project: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  async function deleteUserProject(
    userId: string | Types.ObjectId,
    projectId: string | Types.ObjectId,
  ): Promise<boolean> {
    try {
      const UserProject = mongoose.models.UserProject;
      const Conversation = mongoose.models.Conversation;
      const MemoryDocument = mongoose.models.MemoryDocument;

      const result = await UserProject.findOneAndDelete({ _id: projectId, userId });
      if (!result) {
        return false;
      }

      await Conversation.updateMany(
        { projectId },
        { $set: { projectId: null } },
      );

      await MemoryDocument.deleteMany({ projectId, scope: 'project' });

      return true;
    } catch (error) {
      throw new Error(
        `Failed to delete user project: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  async function getUserProjectById(
    userId: string | Types.ObjectId,
    projectId: string | Types.ObjectId,
  ): Promise<IUserProjectLean | null> {
    try {
      const UserProject = mongoose.models.UserProject;
      return (await UserProject.findOne({ _id: projectId, userId }).lean()) as IUserProjectLean | null;
    } catch (error) {
      throw new Error(
        `Failed to get user project: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  return {
    createUserProject,
    getUserProjects,
    updateUserProject,
    deleteUserProject,
    getUserProjectById,
  };
}

export type UserProjectMethods = ReturnType<typeof createUserProjectMethods>;
