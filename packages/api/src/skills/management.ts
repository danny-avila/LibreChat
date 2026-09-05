import { z } from 'zod';
import { logger } from '@librechat/data-schemas';
import {
  PermissionBits,
  Permissions,
  PermissionTypes,
  ResourceType,
} from 'librechat-data-provider';
import type { SkillFrontmatterValue } from 'librechat-data-provider';
import type { Request, Response } from 'express';
import type { SkillsHandlers, SkillsHandlersDeps } from './handlers';
import type { AgentManagementReadDeps } from '../agents/reads';
import type { ServerRequest } from '~/types';
import { agentManagementListSchema, mapAgentManagementError } from '../agents/management';
import { checkAccessWithRequestCache } from '../middleware/access';
import { assertSkillFileContentAllowed } from './protection';
import { getDeploymentSkillById } from './deployment';
import { resolveSkillFilePathParam } from './path';

const idSchema = z.string().regex(/^[a-f\d]{24}$/i);
const fields = {
  name: z.string(),
  displayTitle: z.string().optional(),
  description: z.string(),
  category: z.string().optional(),
  alwaysApply: z.boolean().optional(),
};
const frontmatterValue: z.ZodType<SkillFrontmatterValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(frontmatterValue),
    z.record(frontmatterValue),
  ]),
);
export const skillManagementUpdateSchema = z
  .object({
    name: fields.name.optional(),
    displayTitle: fields.displayTitle,
    description: fields.description.optional(),
    category: fields.category,
    alwaysApply: fields.alwaysApply,
    body: z.string().optional(),
    frontmatter: z.record(frontmatterValue).optional(),
    expectedVersion: z.number().int().positive(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 1, 'At least one update field is required');

const summarySchema = z.object({
  ...fields,
  id: idSchema,
  version: z.number().int().positive(),
  fileCount: z.number().int().nonnegative(),
  disableModelInvocation: z.boolean().optional(),
  userInvocable: z.boolean().optional(),
  allowedTools: z.array(z.string()).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export const skillManagementResponseSchema = summarySchema.extend({
  body: z.string(),
  frontmatter: z.record(frontmatterValue).optional(),
});
const fileSchema = z.object({
  relativePath: z.string(),
  filename: z.string(),
  mimeType: z.string(),
  bytes: z.number().int().nonnegative(),
});
const fileContentSchema = fileSchema.extend({
  content: z.string().optional(),
  isBinary: z.boolean(),
});
const fileUpdateSchema = z.object({ content: z.string().max(1024 * 1024) }).strict();
const listSchema = agentManagementListSchema;

type ManagementRequest = Request & Pick<ServerRequest, 'user' | 'config'>;

type SkillHandler = (req: ServerRequest, res: Response) => Promise<Response | undefined>;
type Projector = (body: unknown) => object;
export interface SkillManagementDeps {
  handlers: SkillsHandlers;
  getSkillById: SkillsHandlersDeps['getSkillById'];
  getRoleByName: AgentManagementReadDeps['getRoleByName'];
  checkPermission: AgentManagementReadDeps['checkPermission'];
  saveFile: (input: {
    req: ServerRequest;
    skillId: string;
    relativePath: string;
    content: string;
    mimeType: string;
  }) => Promise<{ relativePath: string; bytes: number }>;
}

function projectSkill(body: unknown, detail: boolean): object {
  const source = z.object({ _id: idSchema }).passthrough().parse(body);
  return (detail ? skillManagementResponseSchema : summarySchema).parse({
    ...source,
    id: source._id,
  });
}
function sendError(
  res: Response,
  code: Parameters<typeof mapAgentManagementError>[0],
  error?: unknown,
) {
  const mapped = mapAgentManagementError(code, error);
  if (code === 'not_found') mapped.body.error.message = 'Skill or file not found';
  return res.status(mapped.status).json(mapped.body);
}

/** Keep browser errors and persistence fields behind the versioned management contract. */
async function runHandler(
  req: ManagementRequest,
  res: Response,
  handler: SkillHandler,
  project: Projector,
) {
  let status = 200;
  let sent = false;
  const adapter = Object.create(res) as Response;
  adapter.status = (value: number) => {
    status = value;
    return adapter;
  };
  adapter.json = (body: unknown) => {
    sent = true;
    if (status >= 200 && status < 300) return res.status(status).json(project(body));
    if (status === 409)
      return res.status(409).json({
        error: {
          code: 'conflict',
          message: 'Skill update conflict; retrieve the latest version and retry',
        },
      });
    if (status === 404) return sendError(res, 'not_found');
    if (status === 400) return sendError(res, 'invalid_request');
    if (status === 401 || status === 403) return sendError(res, 'permission_denied');
    return sendError(res, 'internal_error');
  };
  await handler(req as ServerRequest, adapter);
  return sent ? res : sendError(res, 'internal_error');
}

/** Machine API adapters reuse the browser Skills behavior after principal and resource checks. */
export function createSkillManagementHandlers(deps: SkillManagementDeps) {
  function wrap(
    permission: PermissionBits | undefined,
    operation: (req: ManagementRequest, res: Response) => Promise<Response>,
  ) {
    return async (request: Request, res: Response): Promise<Response> => {
      const req = request as ManagementRequest;
      try {
        if (!req.user?.id || !req.user.tenantId) return sendError(res, 'permission_denied');
        const editing = permission === PermissionBits.EDIT;
        const allowed = await checkAccessWithRequestCache({
          req,
          user: req.user,
          permissionType: PermissionTypes.SKILLS,
          permissions: editing ? [Permissions.USE, Permissions.CREATE] : [Permissions.USE],
          getRoleByName: deps.getRoleByName,
        });
        if (!allowed) return sendError(res, 'permission_denied');
        if (permission !== undefined) {
          if (!idSchema.safeParse(req.params.id).success) return sendError(res, 'not_found');
          const skill = await deps.getSkillById(req.params.id);
          const deployment = getDeploymentSkillById(req.params.id);
          if (!skill || (!deployment && skill.tenantId !== req.user.tenantId))
            return sendError(res, 'not_found');
          if (
            !deployment &&
            !(await deps.checkPermission({
              userId: req.user.id,
              role: req.user.role,
              resourceType: ResourceType.SKILL,
              resourceId: skill._id,
              requiredPermission: permission,
            }))
          )
            return sendError(res, 'not_found');
          if (editing && (deployment || skill.source !== 'inline'))
            return sendError(res, 'permission_denied');
        }
        return await operation(req, res);
      } catch (error) {
        logger.error('[SkillManagement] Request failed', error);
        return sendError(res, 'internal_error');
      }
    };
  }
  return {
    list: wrap(undefined, async (req, res) => {
      const parsed = listSchema.safeParse(req.query);
      if (!parsed.success) return sendError(res, 'invalid_request', parsed.error);
      return runHandler(req, res, deps.handlers.list, (body) => {
        const result = z
          .object({
            skills: z.array(z.unknown()),
            has_more: z.boolean(),
            after: z.string().nullable(),
          })
          .parse(body);
        const data = result.skills.map((skill) => projectSkill(skill, false));
        const ids = result.skills.map((skill) => z.object({ _id: idSchema }).parse(skill)._id);
        return {
          object: 'list',
          data,
          first_id: ids[0] ?? null,
          last_id: ids[ids.length - 1] ?? null,
          has_more: result.has_more,
          after: result.after,
        };
      });
    }),
    get: wrap(PermissionBits.VIEW, (req, res) =>
      runHandler(req, res, deps.handlers.get, (body) => projectSkill(body, true)),
    ),
    update: wrap(PermissionBits.EDIT, async (req, res) => {
      const parsed = skillManagementUpdateSchema.safeParse(req.body);
      if (!parsed.success) return sendError(res, 'invalid_request', parsed.error);
      req.body = parsed.data;
      return runHandler(req, res, deps.handlers.patch, (body) => projectSkill(body, true));
    }),
    listFiles: wrap(PermissionBits.VIEW, (req, res) =>
      runHandler(req, res, deps.handlers.listFiles, (body) => ({
        object: 'list',
        data: z.object({ files: z.array(fileSchema) }).parse(body).files,
      })),
    ),
    getFile: wrap(PermissionBits.VIEW, async (req, res) => {
      if (Object.keys(req.query).length > 0) return sendError(res, 'invalid_request');
      return runHandler(req, res, deps.handlers.downloadFile, (body) =>
        fileContentSchema.parse(body),
      );
    }),
    updateFile: wrap(PermissionBits.EDIT, async (req, res) => {
      const parsed = fileUpdateSchema.safeParse(req.body);
      if (!parsed.success) return sendError(res, 'invalid_request', parsed.error);
      const relativePath = resolveSkillFilePathParam(req.params.relativePath);
      if (relativePath == null || relativePath === 'SKILL.md')
        return sendError(res, 'invalid_request');
      const buffer = Buffer.from(parsed.data.content, 'utf8');
      if (buffer.length > 1024 * 1024 || buffer.includes(0))
        return sendError(res, 'invalid_request');
      try {
        assertSkillFileContentAllowed(req.config?.filters, {
          buffer,
          originalName: relativePath,
          relativePath,
        });
      } catch {
        return sendError(res, 'permission_denied');
      }
      const result = await deps.saveFile({
        req: req as ServerRequest,
        skillId: req.params.id,
        relativePath,
        content: parsed.data.content,
        mimeType: 'text/plain',
      });
      return res.status(200).json({ relativePath: result.relativePath, bytes: result.bytes });
    }),
  };
}
