import type { Document, Types } from 'mongoose';
import type {
  ArtifactAppStatus,
  ArtifactAppVisibility,
  ArtifactRuntimeType,
  ArtifactVersionState,
  ArtifactRiskClass,
  ArtifactCostClass,
} from 'librechat-data-provider';

export interface IArtifactAppToolPolicy {
  enabled: boolean;
  allowedServers: string[];
  allowedTools: string[];
  requireConfirmationForWrites: boolean;
}

export interface IArtifactAppMarketplace {
  listed: boolean;
  featured: boolean;
  summary?: string;
  riskClass: ArtifactRiskClass;
  costClass: ArtifactCostClass;
}

export interface IArtifactAppSourceMetadata {
  conversationId?: string;
  messageId?: string;
  originalArtifactId?: string;
}

export interface IArtifactAppReview {
  submittedAt?: Date;
  submittedBy?: string;
  reviewedAt?: Date;
  reviewedBy?: string;
  result?: 'approved' | 'rejected';
  comment?: string;
}

export interface IArtifactApp extends Document {
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

  toolPolicy: IArtifactAppToolPolicy;
  marketplace: IArtifactAppMarketplace;
  sourceMetadata?: IArtifactAppSourceMetadata;
  review?: IArtifactAppReview;

  createdAt: Date;
  updatedAt: Date;
  archivedAt?: Date;
}

export interface IArtifactVersionRuntimeConfig {
  dependencies?: Record<string, string>;
  entryPoint?: string;
  renderMode?: string;
}

export interface IArtifactVersionIntegrity {
  sourceHash: string;
  schemaVersion: number;
}

export interface IArtifactVersionPublication {
  state: ArtifactVersionState;
  releasedBy?: string;
  releasedAt?: Date;
}

export interface IArtifactVersion extends Document {
  artifactVersionId: string;
  artifactAppId: string;
  tenantId?: string;

  versionNumber: number;
  versionLabel?: string;
  changelog?: string;

  artifactType: ArtifactRuntimeType;
  sourceSnapshot: string;

  runtimeConfig: IArtifactVersionRuntimeConfig;
  integrity: IArtifactVersionIntegrity;

  createdBy: string;
  createdAt: Date;

  publication: IArtifactVersionPublication;
}

/** Version-1 create input threaded through the atomic publish transaction. */
export interface CreateArtifactAppInput {
  tenantId?: string;
  createdBy: string;
  title: string;
  description?: string;
  icon?: string;
  category?: string;
  tags?: string[];
  visibility: ArtifactAppVisibility;
  allowEmbed?: boolean;
  allowFork?: boolean;
  allowAnonymousView?: boolean;
  toolPolicy?: Partial<IArtifactAppToolPolicy>;
  marketplace?: Partial<IArtifactAppMarketplace>;
  sourceMetadata?: IArtifactAppSourceMetadata;
  version: CreateArtifactVersionInput;
}

export interface CreateArtifactVersionInput {
  artifactType: ArtifactRuntimeType;
  sourceSnapshot: string;
  runtimeConfig?: IArtifactVersionRuntimeConfig;
  versionLabel?: string;
  changelog?: string;
  createdBy: string;
}

export interface ArtifactAppWithVersion {
  app: IArtifactApp;
  version: IArtifactVersion;
}

export type ArtifactAppQuery = {
  artifactAppId: string;
  tenantId?: string;
};

export type ArtifactVersionQuery = {
  artifactAppId: string;
  artifactVersionId?: string;
  versionNumber?: number;
  tenantId?: string;
};

/** Sole-argument object used to resolve a resource `_id` for ACL checks. */
export type ArtifactAppIdResolution = {
  _id: Types.ObjectId;
  artifactAppId: string;
};
