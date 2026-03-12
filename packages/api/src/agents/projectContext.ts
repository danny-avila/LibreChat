import mongoose from 'mongoose';
import { logger } from '@librechat/data-schemas';
import type { IUserProjectLean, IProjectMemoryEntry } from '@librechat/data-schemas';

function formatProjectMemory(memory: IProjectMemoryEntry[]): string {
  if (!memory.length) {
    return '';
  }
  return memory.map((entry, i) => `${i + 1}. ${entry.key}: ${entry.value}`).join('\n');
}

export async function getProjectContext(
  userId: string,
  projectId: string,
): Promise<string | null> {
  try {
    const UserProject = mongoose.models.UserProject;
    if (!UserProject) {
      return null;
    }

    const project = (await UserProject.findOne({
      user: userId,
      projectId,
    }).lean()) as IUserProjectLean | null;

    if (!project) {
      return null;
    }

    const parts: string[] = [];

    if (project.instructions) {
      parts.push(`# Project Instructions\n${project.instructions}`);
    }

    if (project.memory?.length) {
      const formatted = formatProjectMemory(project.memory);
      parts.push(`# Project Context\n${formatted}`);
    }

    if (!parts.length) {
      return null;
    }

    return `## Active Project: "${project.name}"\n\n${parts.join('\n\n')}`;
  } catch (error) {
    logger.error('[getProjectContext] Error fetching project context', error);
    return null;
  }
}
