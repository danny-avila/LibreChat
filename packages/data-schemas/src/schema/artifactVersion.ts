import { Schema } from 'mongoose';
import type { IArtifactVersion } from '~/types';

const runtimeConfigSchema = new Schema(
  {
    dependencies: { type: Schema.Types.Mixed, default: undefined },
    entryPoint: { type: String },
    renderMode: { type: String },
  },
  { _id: false },
);

const integritySchema = new Schema(
  {
    sourceHash: { type: String, required: true },
    schemaVersion: { type: Number, required: true },
  },
  { _id: false },
);

const publicationSchema = new Schema(
  {
    state: {
      type: String,
      enum: ['draft', 'released', 'withdrawn'],
      default: 'draft',
    },
    releasedBy: { type: String },
    releasedAt: { type: Date },
  },
  { _id: false },
);

const artifactVersionSchema: Schema<IArtifactVersion> = new Schema<IArtifactVersion>(
  {
    artifactVersionId: {
      type: String,
      required: true,
    },
    artifactAppId: {
      type: String,
      required: true,
    },
    tenantId: {
      type: String,
    },
    versionNumber: {
      type: Number,
      required: true,
    },
    versionLabel: {
      type: String,
    },
    changelog: {
      type: String,
    },
    artifactType: {
      type: String,
      enum: ['react', 'html', 'mermaid'],
      required: true,
    },
    sourceSnapshot: {
      type: String,
      required: true,
    },
    runtimeConfig: {
      type: runtimeConfigSchema,
      default: () => ({}),
    },
    integrity: {
      type: integritySchema,
      required: true,
    },
    createdBy: {
      type: String,
      required: true,
    },
    publication: {
      type: publicationSchema,
      default: () => ({}),
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  },
);

artifactVersionSchema.index(
  { tenantId: 1, artifactAppId: 1, versionNumber: 1 },
  { unique: true },
);
artifactVersionSchema.index({ tenantId: 1, artifactVersionId: 1 }, { unique: true });

export default artifactVersionSchema;
