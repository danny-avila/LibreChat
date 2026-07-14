import { z } from 'zod';

/**
 * Shared types and Zod schemas for the Artifact Apps feature (PLAN.md §6, §8, §9).
 * Consumed by both the backend (packages/api, data-schemas) and the client.
 */

// ===== ENUMS =====

export const artifactAppStatusSchema = z.enum([
  'draft',
  'pending_review',
  'published',
  'suspended',
  'archived',
]);
export type ArtifactAppStatus = z.infer<typeof artifactAppStatusSchema>;

export const artifactAppVisibilitySchema = z.enum(['private', 'restricted', 'tenant', 'public']);
export type ArtifactAppVisibility = z.infer<typeof artifactAppVisibilitySchema>;

export const artifactRuntimeTypeSchema = z.enum(['react', 'html', 'mermaid']);
export type ArtifactRuntimeType = z.infer<typeof artifactRuntimeTypeSchema>;

export const artifactVersionStateSchema = z.enum(['draft', 'released', 'withdrawn']);
export type ArtifactVersionState = z.infer<typeof artifactVersionStateSchema>;

export const artifactRiskClassSchema = z.enum(['none', 'read', 'write', 'external']);
export type ArtifactRiskClass = z.infer<typeof artifactRiskClassSchema>;

export const artifactCostClassSchema = z.enum(['free', 'low', 'medium', 'high']);
export type ArtifactCostClass = z.infer<typeof artifactCostClassSchema>;

// ===== NESTED SCHEMAS =====

export const artifactToolPolicySchema = z.object({
  enabled: z.boolean().default(false),
  allowedServers: z.array(z.string()).default([]),
  allowedTools: z.array(z.string()).default([]),
  requireConfirmationForWrites: z.boolean().default(true),
});
export type ArtifactToolPolicy = z.infer<typeof artifactToolPolicySchema>;

export const artifactMarketplaceSchema = z.object({
  listed: z.boolean().default(false),
  featured: z.boolean().default(false),
  summary: z.string().optional(),
  riskClass: artifactRiskClassSchema.default('none'),
  costClass: artifactCostClassSchema.default('free'),
});
export type ArtifactMarketplace = z.infer<typeof artifactMarketplaceSchema>;

export const artifactSourceMetadataSchema = z.object({
  conversationId: z.string().optional(),
  messageId: z.string().optional(),
  originalArtifactId: z.string().optional(),
});
export type ArtifactSourceMetadata = z.infer<typeof artifactSourceMetadataSchema>;

export const artifactRuntimeConfigSchema = z.object({
  dependencies: z.record(z.string()).optional(),
  entryPoint: z.string().optional(),
  renderMode: z.string().optional(),
});
export type ArtifactRuntimeConfig = z.infer<typeof artifactRuntimeConfigSchema>;

// ===== REQUEST SCHEMAS =====

/** The already-extracted artifact payload sent from the client at publish time. */
export const artifactSnapshotInputSchema = z.object({
  type: artifactRuntimeTypeSchema,
  content: z.string().min(1),
  title: z.string().optional(),
  language: z.string().optional(),
  runtimeConfig: artifactRuntimeConfigSchema.optional(),
});
export type ArtifactSnapshotInput = z.infer<typeof artifactSnapshotInputSchema>;

/** POST /api/artifact-apps */
export const publishArtifactAppSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  icon: z.string().optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  visibility: artifactAppVisibilitySchema.default('private'),
  allowEmbed: z.boolean().optional(),
  allowFork: z.boolean().optional(),
  allowAnonymousView: z.boolean().optional(),
  toolPolicy: artifactToolPolicySchema.partial().optional(),
  marketplace: artifactMarketplaceSchema.partial().optional(),
  artifact: artifactSnapshotInputSchema,
  source: artifactSourceMetadataSchema.optional(),
  changelog: z.string().optional(),
  versionLabel: z.string().optional(),
});
export type TPublishArtifactAppRequest = z.infer<typeof publishArtifactAppSchema>;

/** PATCH /api/artifact-apps/:id */
export const updateArtifactAppSchema = z
  .object({
    title: z.string().min(1).max(200),
    description: z.string().max(2000),
    icon: z.string(),
    category: z.string(),
    tags: z.array(z.string()),
    visibility: artifactAppVisibilitySchema,
    allowEmbed: z.boolean(),
    allowFork: z.boolean(),
    allowAnonymousView: z.boolean(),
    toolPolicy: artifactToolPolicySchema.partial(),
    marketplace: artifactMarketplaceSchema.partial(),
  })
  .partial();
export type TUpdateArtifactAppRequest = z.infer<typeof updateArtifactAppSchema>;

/** POST /api/artifact-apps/:id/versions */
export const createArtifactVersionSchema = z.object({
  artifact: artifactSnapshotInputSchema,
  changelog: z.string().optional(),
  versionLabel: z.string().optional(),
});
export type TCreateArtifactVersionRequest = z.infer<typeof createArtifactVersionSchema>;

// ===== RESPONSE TYPES (client-facing; dates serialized as ISO strings) =====

export interface TArtifactApp {
  artifactAppId: string;
  tenantId?: string;
  title: string;
  description?: string;
  icon?: string;
  category?: string;
  tags?: string[];
  createdBy: string;
  activeVersionId?: string;
  latestVersionNumber: number;
  status: ArtifactAppStatus;
  visibility: ArtifactAppVisibility;
  allowEmbed: boolean;
  allowFork: boolean;
  allowAnonymousView: boolean;
  toolPolicy: ArtifactToolPolicy;
  marketplace: ArtifactMarketplace;
  sourceMetadata?: ArtifactSourceMetadata;
  review?: {
    submittedAt?: string;
    submittedBy?: string;
    reviewedAt?: string;
    reviewedBy?: string;
    result?: 'approved' | 'rejected';
    comment?: string;
  };
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
}

export interface TArtifactVersion {
  artifactVersionId: string;
  artifactAppId: string;
  tenantId?: string;
  versionNumber: number;
  versionLabel?: string;
  changelog?: string;
  artifactType: ArtifactRuntimeType;
  sourceSnapshot: string;
  runtimeConfig: ArtifactRuntimeConfig;
  integrity: {
    sourceHash: string;
    schemaVersion: number;
  };
  createdBy: string;
  createdAt: string;
  publication: {
    state: ArtifactVersionState;
    releasedBy?: string;
    releasedAt?: string;
  };
}

export interface TArtifactAppWithVersion {
  app: TArtifactApp;
  version: TArtifactVersion;
}

export interface TArtifactAppList {
  apps: TArtifactApp[];
}

export interface TArtifactVersionList {
  versions: TArtifactVersion[];
}
