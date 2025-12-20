const mongoose = require('mongoose');
const { PromptGroup, Prompt, User } = require('~/db/models');
const { logger } = require('@librechat/data-schemas');
const { SystemRoles } = require('librechat-data-provider');
// Lazy-load PermissionService to break circular dependency
// const { grantPermission } = require('~/server/services/PermissionService');
const { AccessRoleIds, PrincipalType, ResourceType } = require('librechat-data-provider');

const WOODLAND_PROMPT_VERSION = 'v2025.12.20';
const WOODLAND_CATEGORY = 'woodland';

/**
 * Woodland Agent Prompt Templates
 * Product History identification prompts based on 5 key physical attributes
 */
const WOODLAND_PROMPTS = [
  {
    id: 'prompt_product_history_identify',
    name: 'Product History: Identify Model',
    category: WOODLAND_CATEGORY,
    oneliner: 'Find your model and replacement parts from physical attributes',
    command: 'identify-model',
    type: 'text',
    public: true,
    placeholders: ['bag_color', 'bag_shape', 'blower_color', 'intake_diameter', 'engine_info'],
    prompt: `I need help identifying a Cyclone Rake and finding replacement parts.

Here's what I can see on the unit:
- **Bag Color:** {{bag_color}}
- **Bag Shape:** {{bag_shape}}
- **Blower Color:** {{blower_color}}
- **Intake Diameter:** {{intake_diameter}}
- **Engine:** {{engine_info}}

Please identify the model and show me the available replacement parts.`,
  },
  {
    id: 'prompt_product_history_guided',
    name: 'Product History: Guided Identification',
    category: WOODLAND_CATEGORY,
    oneliner: 'Answer 5 simple questions to identify your model',
    command: 'identify-guided',
    type: 'chat',
    public: true,
    prompt: `I need help identifying my Cyclone Rake model. Please guide me through the identification questions.`,
  },
];

let cachedAuthor;

/**
 * Resolve author for prompts (system/admin/env user)
 * Reuses logic from AgentSeed.js
 */
async function resolveAuthor() {
  if (cachedAuthor) {
    return cachedAuthor;
  }

  const selectFields = ['_id', 'name', 'username', 'email'];

  const formatAuthor = (user) => {
    if (!user?._id) {
      return null;
    }
    const name = user.name || user.username || user.email || 'Woodland System';
    return { id: user._id.toString(), name };
  };

  const withId = async (id) => {
    if (!id) {
      return null;
    }
    const user = await User.findById(id, selectFields.join(' ')).lean();
    return user ? formatAuthor(user) : null;
  };

  const withEmail = async (email) => {
    if (!email) {
      return null;
    }
    const user = await User.findOne({ email }, selectFields.join(' ')).lean();
    return user ? formatAuthor(user) : null;
  };

  // Try env vars first
  const envId = await withId(process.env.WOODLAND_PROMPT_AUTHOR_ID);
  if (envId) {
    cachedAuthor = envId;
    return cachedAuthor;
  }

  const envEmail = await withEmail(process.env.WOODLAND_PROMPT_AUTHOR_EMAIL);
  if (envEmail) {
    cachedAuthor = envEmail;
    return cachedAuthor;
  }

  // Fallback to admin
  const admin = await User.findOne({ role: SystemRoles.ADMIN }, selectFields.join(' ')).lean();
  if (admin) {
    cachedAuthor = formatAuthor(admin);
    return cachedAuthor;
  }

  // Last resort: any user
  const anyUser = await User.findOne({}, selectFields.join(' ')).lean();
  if (anyUser) {
    cachedAuthor = formatAuthor(anyUser);
    return cachedAuthor;
  }
  // Auto-create a system user if none exist so seeding doesn't skip
  const systemEmail = process.env.WOODLAND_PROMPT_AUTHOR_EMAIL || process.env.WOODLAND_AGENT_AUTHOR_EMAIL || 'woodland-system@local';
  try {
    const created = await User.create({
      email: systemEmail,
      name: 'Woodland System',
      username: 'woodland-system',
      role: SystemRoles.ADMIN,
    });
    cachedAuthor = formatAuthor(created);
    logger.info('[PromptSeed] Created system author user for seeding');
    return cachedAuthor;
  } catch (e) {
    logger.error('[PromptSeed] Failed to create system author user', e);
    return null;
  }
}

/**
 * Ensure a prompt group exists and is up-to-date
 * Creates new or updates if prompt text changed
 */
async function ensurePromptGroup(config, authorId, authorName) {
  // Lazy-load PermissionService to break circular dependency
  const { grantPermission } = require('~/server/services/PermissionService');
  
  const timestamp = new Date();
  const authorObjectId = new mongoose.Types.ObjectId(authorId);

  // Check if group exists (match by category + command or name)
  const query = config.command
    ? { category: config.category, command: config.command }
    : { name: config.name, category: config.category };

  const existing = await PromptGroup.findOne(query).lean();

  if (!existing) {
    // Create new prompt group & production prompt atomically using pre-generated ID
    logger.info(`[PromptSeed] Creating new prompt: ${config.name}`);
    const productionPromptId = new mongoose.Types.ObjectId();

    // Insert PromptGroup first with productionId pointing to future prompt _id
    const newPromptGroup = await PromptGroup.create({
      name: config.name,
      oneliner: config.oneliner || '',
      category: config.category,
      command: config.command || undefined,
      author: authorObjectId,
      authorName,
      productionId: productionPromptId,
      numberOfGenerations: 0,
      projectIds: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    // Create production prompt with predetermined _id
    await Prompt.create({
      _id: productionPromptId,
      groupId: newPromptGroup._id,
      prompt: config.prompt,
      type: config.type || 'text',
      author: authorObjectId,
      createdAt: timestamp,
      updatedAt: timestamp,
      ...(config.tags || config.placeholders
        ? {
            labels: [
              ...(config.tags || []),
              ...(config.placeholders ? config.placeholders.map((p) => `placeholder:${p}`) : []),
            ],
          }
        : {}),
    });

    logger.info(`[PromptSeed] ✅ Created: ${config.name} (/${config.command || 'no-cmd'})`);
    // Grant PUBLIC view if flagged as public
    if (config.public === true) {
      try {
        await grantPermission({
          principalType: PrincipalType.PUBLIC,
          principalId: null,
          resourceType: ResourceType.PROMPTGROUP,
          resourceId: newPromptGroup._id,
          accessRoleId: AccessRoleIds.PROMPTGROUP_VIEWER,
          grantedBy: authorObjectId,
        });
        logger.info(`[PromptSeed] Granted PUBLIC view for prompt group ${config.name}`);
      } catch (e) {
        logger.error(`[PromptSeed] Failed to grant PUBLIC view for ${config.name}`, e);
      }
    }
    return;
  }

  // Check if prompt text or metadata changed
  const productionPrompt = existing.productionId
    ? await Prompt.findById(existing.productionId).lean()
    : null;

  const promptChanged = productionPrompt?.prompt !== config.prompt;
  const metadataChanged =
    existing.name !== config.name ||
    existing.oneliner !== (config.oneliner || '') ||
    existing.command !== config.command;

  if (promptChanged) {
    // Create new version
    logger.info(`[PromptSeed] Prompt text changed for: ${config.name}`);

    const newPrompt = await Prompt.create({
      groupId: existing._id,
      prompt: config.prompt,
      type: config.type || productionPrompt?.type || 'text',
      author: authorObjectId,
      createdAt: timestamp,
      updatedAt: timestamp,
      ...(config.tags || config.placeholders
        ? {
            labels: [
              ...(config.tags || []),
              ...(config.placeholders ? config.placeholders.map((p) => `placeholder:${p}`) : []),
            ],
          }
        : {}),
    });

    await PromptGroup.findByIdAndUpdate(existing._id, {
      productionId: newPrompt._id,
      updatedAt: timestamp,
    });

    logger.info(`[PromptSeed] ✅ Updated prompt version: ${config.name}`);
  }
  // Ensure PUBLIC view persists for public prompts (idempotent)
  if (config.public === true) {
    try {
      await grantPermission({
        principalType: PrincipalType.PUBLIC,
        principalId: null,
        resourceType: ResourceType.PROMPTGROUP,
        resourceId: existing._id,
        accessRoleId: AccessRoleIds.PROMPTGROUP_VIEWER,
        grantedBy: authorObjectId,
      });
    } catch (e) {
      // Ignore if duplicate or role exists
    }
  }

  if (metadataChanged) {
    // Update group metadata
    await PromptGroup.findByIdAndUpdate(existing._id, {
      name: config.name,
      oneliner: config.oneliner || '',
      command: config.command || undefined,
      updatedAt: timestamp,
    });

    logger.info(`[PromptSeed] ✅ Updated metadata: ${config.name}`);
  }

  if (!promptChanged && !metadataChanged) {
    logger.debug(`[PromptSeed] No changes for: ${config.name}`);
  }
}

/**
 * Seed all Woodland prompts on startup
 * Called from seedDatabase() in models/index.js
 */
async function seedWoodlandPrompts() {
  const authorInfo = await resolveAuthor();
  if (!authorInfo) {
    logger.error('[PromptSeed] Skipping prompt seeding; no user available as author.');
    return;
  }

  logger.info(
    `[PromptSeed] Seeding ${WOODLAND_PROMPTS.length} Woodland prompts (${WOODLAND_PROMPT_VERSION})`,
  );

  for (const config of WOODLAND_PROMPTS) {
    try {
      await ensurePromptGroup(config, authorInfo.id, authorInfo.name);
    } catch (error) {
      logger.error(`[PromptSeed] Failed to seed prompt: ${config.name}`, error);
    }
  }

  logger.info('[PromptSeed] ✅ Woodland prompt seeding complete');
}

module.exports = {
  seedWoodlandPrompts,
  WOODLAND_PROMPTS, // Export for testing
};
