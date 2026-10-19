import type { TFile, TChatProjectsConfig } from 'librechat-data-provider';
import type { AllMethods } from '@librechat/data-schemas';
import type { ChatProjectTenantSource, ResolvedChatProjectContext } from './context';
import type { CodeOutputStoredFile } from '~/files/code/publication';
import { toCanonicalProjectResource } from './resources';
import { getSafeErrorMetadata } from '~/utils/errors';
import { getChatProjectTenantId } from './context';

export type ProjectOutputRequest = ChatProjectTenantSource & {
  config?: { projects?: Partial<TChatProjectsConfig> };
  chatProjectContext?: ResolvedChatProjectContext | null;
};
type OutputDeps = {
  addGeneratedProjectFile: AllMethods['addGeneratedProjectFile'];
  logger: { warn: (message: string, metadata?: object) => void };
};

/** Serializes this turn's automatic additions without accepting unrelated project changes. */
export function createProjectOutputSaver({ addGeneratedProjectFile, logger }: OutputDeps) {
  const pending = new WeakMap<ProjectOutputRequest, Promise<void>>();
  return async (
    req: ProjectOutputRequest,
    file: CodeOutputStoredFile,
  ): Promise<TFile['projectFile']> => {
    const context = req.chatProjectContext;
    if (req.config?.projects?.codeExecution !== true || context == null) {
      return undefined;
    }
    const projectId = context.projectId;
    const previous = pending.get(req) ?? Promise.resolve();
    const operation = previous.then(async (): Promise<TFile['projectFile']> => {
      if (req.chatProjectContext !== context || !file.conversationId) {
        return { projectId, status: 'failed', code: 'project_changed' };
      }
      try {
        const result = await addGeneratedProjectFile({
          userId: req.user.id,
          tenantId: getChatProjectTenantId(req),
          projectId,
          conversationId: file.conversationId,
          fileId: file.file_id,
          contextRevision: context.contextRevision,
          maxFiles: req.config?.projects?.maxFiles,
        });
        if (!result.ok) {
          return { projectId, status: 'failed', code: result.error.code };
        }
        const { project, file: canonicalFile } = result.value;
        let resources = context.resources;
        // Keep a guidance-only snapshot complete at its own level for approval resumes.
        if (resources.length === new Set(context.file_ids).size) {
          const resource = toCanonicalProjectResource(canonicalFile, true);
          const existingIndex = resources.findIndex((entry) => entry.file_id === resource.file_id);
          const updatedResources = [...resources];
          if (existingIndex < 0) {
            updatedResources.push(resource);
          } else {
            updatedResources[existingIndex] = resource;
          }
          resources = updatedResources;
        }
        context.contextRevision = project.contextRevision ?? 0;
        context.file_ids = [...(project.file_ids ?? [])];
        context.resources = resources;
        return { projectId, status: 'added' };
      } catch (error) {
        logger.warn(
          '[projects] Generated file could not be added to its project',
          getSafeErrorMetadata(error),
        );
        return { projectId, status: 'failed', code: 'project_file_save_failed' };
      }
    });
    const completed = operation.then(
      () => undefined,
      () => undefined,
    );
    pending.set(req, completed);
    try {
      return await operation;
    } finally {
      if (pending.get(req) === completed) {
        pending.delete(req);
      }
    }
  };
}
