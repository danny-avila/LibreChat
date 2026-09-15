import { z } from 'zod';
import type { ZodTypeAny } from 'zod';
import type { EndpointContract } from './adapter';
import {
  skillManagementUpdateSchema,
  skillManagementResponseSchema,
  skillSummarySchema,
  skillFileSchema,
  skillFileContentSchema,
  skillFileUpdateSchema,
  skillFrontmatterValueSchema,
} from '../skills/management';
import { agentManagementListSchema, agentManagementErrorSchema } from '../agents/management';

const TAG = 'Skills';
const SECURITY = ['apiKeyBearer', 'oidcBearer'];

const skillListResponseSchema = z.object({
  object: z.literal('list'),
  data: z.array(skillSummarySchema),
  first_id: z.string().nullable(),
  last_id: z.string().nullable(),
  has_more: z.boolean(),
  after: z.string().nullable(),
});
const skillFileListResponseSchema = z.object({
  object: z.literal('list'),
  data: z.array(skillFileSchema),
});
const skillFileUpdatedSchema = z.object({
  relativePath: z.string(),
  bytes: z.number().int().nonnegative(),
});

export const skillComponentSchemas: Record<string, ZodTypeAny> = {
  SkillFrontmatterValue: skillFrontmatterValueSchema,
  Skill: skillManagementResponseSchema,
  SkillList: skillListResponseSchema,
  SkillUpdateRequest: skillManagementUpdateSchema,
  SkillFile: skillFileSchema,
  SkillFileList: skillFileListResponseSchema,
  SkillFileContent: skillFileContentSchema,
  SkillFileUpdateRequest: skillFileUpdateSchema,
  SkillFileUpdated: skillFileUpdatedSchema,
};

const errorResponses = [
  { status: 400, description: 'Invalid request', schema: agentManagementErrorSchema },
  { status: 403, description: 'Permission denied', schema: agentManagementErrorSchema },
  { status: 404, description: 'Not found', schema: agentManagementErrorSchema },
];

export const skillContracts: EndpointContract[] = [
  {
    operationId: 'listSkills',
    method: 'get',
    path: '/skills',
    tags: [TAG],
    summary: 'List skills',
    security: SECURITY,
    query: agentManagementListSchema,
    responses: [
      { status: 200, description: 'A page of skills', schema: skillListResponseSchema },
      ...errorResponses,
    ],
  },
  {
    operationId: 'getSkill',
    method: 'get',
    path: '/skills/{id}',
    tags: [TAG],
    summary: 'Get a skill',
    security: SECURITY,
    pathParams: [{ name: 'id', description: 'The skill id' }],
    responses: [
      { status: 200, description: 'The skill', schema: skillManagementResponseSchema },
      ...errorResponses,
    ],
  },
  {
    operationId: 'updateSkill',
    method: 'patch',
    path: '/skills/{id}',
    tags: [TAG],
    summary: 'Update a skill',
    security: SECURITY,
    pathParams: [{ name: 'id', description: 'The skill id' }],
    body: skillManagementUpdateSchema,
    responses: [
      { status: 200, description: 'The updated skill', schema: skillManagementResponseSchema },
      ...errorResponses,
    ],
  },
  {
    operationId: 'listSkillFiles',
    method: 'get',
    path: '/skills/{id}/files',
    tags: [TAG],
    summary: "List a skill's files",
    security: SECURITY,
    pathParams: [{ name: 'id', description: 'The skill id' }],
    responses: [
      { status: 200, description: "The skill's files", schema: skillFileListResponseSchema },
      ...errorResponses,
    ],
  },
  {
    operationId: 'getSkillFile',
    method: 'get',
    path: '/skills/{id}/files/{relativePath}',
    tags: [TAG],
    summary: "Get a skill's file",
    security: SECURITY,
    pathParams: [
      { name: 'id', description: 'The skill id' },
      { name: 'relativePath', description: 'The file path within the skill' },
    ],
    responses: [
      { status: 200, description: 'The file content', schema: skillFileContentSchema },
      ...errorResponses,
    ],
  },
  {
    operationId: 'updateSkillFile',
    method: 'put',
    path: '/skills/{id}/files/{relativePath}',
    tags: [TAG],
    summary: "Create or update a skill's file",
    security: SECURITY,
    pathParams: [
      { name: 'id', description: 'The skill id' },
      { name: 'relativePath', description: 'The file path within the skill' },
    ],
    body: skillFileUpdateSchema,
    responses: [
      { status: 200, description: 'The file was written', schema: skillFileUpdatedSchema },
      ...errorResponses,
    ],
  },
];
