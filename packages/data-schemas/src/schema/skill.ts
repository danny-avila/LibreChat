import { Schema } from 'mongoose';
import type { ISkillDocument } from '~/types/skill';

/** Max length for a skill `name` (kebab-case identifier). */
const SKILL_NAME_MAX_LENGTH = 64;

/** Max length for a skill `description`. */
const SKILL_DESCRIPTION_MAX_LENGTH = 1024;

/** Max length for the skill `body` (the SKILL.md content). */
const SKILL_BODY_MAX_LENGTH = 100_000;

/** Max length for the human-friendly `displayTitle`. */
const SKILL_DISPLAY_TITLE_MAX_LENGTH = 128;

const skillNamePattern = /^[a-z0-9][a-z0-9-]*$/;

const skillSchema: Schema<ISkillDocument> = new Schema(
  {
    name: {
      type: String,
      required: true,
      index: true,
      maxlength: [SKILL_NAME_MAX_LENGTH, `Name cannot exceed ${SKILL_NAME_MAX_LENGTH} characters`],
      validate: {
        validator: function (value: string): boolean {
          if (!skillNamePattern.test(value)) {
            return false;
          }
          const lowered = value.toLowerCase();
          return !lowered.includes('anthropic') && !lowered.includes('claude');
        },
        message:
          'Name must be kebab-case (lowercase letters, digits, hyphens) and cannot contain "anthropic" or "claude".',
      },
    },
    displayTitle: {
      type: String,
      maxlength: [
        SKILL_DISPLAY_TITLE_MAX_LENGTH,
        `Display title cannot exceed ${SKILL_DISPLAY_TITLE_MAX_LENGTH} characters`,
      ],
    },
    description: {
      type: String,
      required: true,
      maxlength: [
        SKILL_DESCRIPTION_MAX_LENGTH,
        `Description cannot exceed ${SKILL_DESCRIPTION_MAX_LENGTH} characters`,
      ],
    },
    body: {
      type: String,
      default: '',
      maxlength: [SKILL_BODY_MAX_LENGTH, `Body cannot exceed ${SKILL_BODY_MAX_LENGTH} characters`],
    },
    frontmatter: {
      type: Schema.Types.Mixed,
      default: {},
    },
    category: {
      type: String,
      default: '',
      index: true,
    },
    author: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    authorName: {
      type: String,
      required: true,
    },
    version: {
      type: Number,
      default: 1,
      min: 1,
    },
    source: {
      type: String,
      enum: ['inline', 'github', 'notion'],
      default: 'inline',
    },
    sourceMetadata: {
      type: Schema.Types.Mixed,
    },
    fileCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    tenantId: {
      type: String,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

skillSchema.index({ author: 1, tenantId: 1 });
skillSchema.index({ category: 1, updatedAt: -1 });
skillSchema.index({ updatedAt: -1, _id: 1 });
skillSchema.index({ name: 1, author: 1, tenantId: 1 }, { unique: true });

export default skillSchema;
