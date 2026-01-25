const mongoose = require('mongoose');
const { PromptGroup, Prompt, User } = require('~/db/models');
const { logger } = require('@librechat/data-schemas');
const { SystemRoles } = require('librechat-data-provider');
// Lazy-load PermissionService to break circular dependency
// const { grantPermission } = require('~/server/services/PermissionService');
const { AccessRoleIds, PrincipalType, ResourceType } = require('librechat-data-provider');

const WOODLAND_PROMPT_VERSION = 'v2026.01.24.engine';
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
    tags: ['agent_woodland_product_history'],
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
    oneliner: 'Answer questions one-by-one to identify your model',
    command: 'identify-guided',
    tags: ['agent_woodland_product_history'],
    type: 'chat',
    public: true,
    prompt: "I'd like to identify my old Cyclone Rake model based on its physical features. Can you guide me through the identification process?",
  },
  {
    id: 'prompt_tractor_fitment_setup',
    name: 'Tractor Fitment: Model & Parts',
    category: WOODLAND_CATEGORY,
    oneliner: 'Rep enters make, model, deck; get compatible Cyclone Rake + parts',
    command: 'tractor-fitment',
    tags: ['agent_woodland_tractor'],
    type: 'text',
    public: true,
    placeholders: ['tractor_make', 'tractor_model', 'deck_width'],
    prompt: `You will receive the tractor details in one submission:
  - Tractor make: {{tractor_make}}
  - Tractor model: {{tractor_model}}
  - Deck width (inches): {{deck_width}}

  Return all of the following:
  - The compatible or recommended Cyclone Rake model for this tractor
  - The correct hitch connection kit
  - The deck hose diameter and length needed
  - The mower deck adapter (MDA) model, if required
  - Any installation flags or special requirements
  - Cite the tractor database rows you used`,
  },
  {
    id: 'prompt_tractor_fitment_guided',
    name: 'Tractor Fitment: Guided Match',
    category: WOODLAND_CATEGORY,
    oneliner: 'Answer questions one-by-one to get compatible Cyclone Rake + parts',
    command: 'tractor-fitment-guided',
    tags: ['agent_woodland_tractor'],
    type: 'chat',
    public: true,
    prompt: "I need help finding the right Cyclone Rake model and fitment parts for my tractor. Can you guide me through the matching process?",
  },
  {
    id: 'prompt_engine_history_identify',
    name: 'Engine History: Identify Engine',
    category: WOODLAND_CATEGORY,
    oneliner: 'Find engine specs and history from physical attributes',
    command: 'engine-identify',
    tags: ['agent_woodland_engine_history'],
    type: 'text',
    public: true,
    placeholders: ['rake_model', 'engine_brand', 'horsepower', 'filter_shape', 'engine_code'],
    prompt: `I need help identifying an engine and finding its specifications.

Here's what I can see:
- **Rake Model:** {{rake_model}}
- **Engine Brand:** {{engine_brand}}
- **Horsepower:** {{horsepower}}
- **Filter Shape:** {{filter_shape}}
- **Engine Code:** {{engine_code}}

Please identify the exact engine, show its specifications, and available retrofit kits.`,
  },
  {
    id: 'prompt_engine_history_guided',
    name: 'Engine History: Guided Identification',
    category: WOODLAND_CATEGORY,
    oneliner: 'Answer questions one-by-one to identify your engine',
    command: 'engine-guided',
    tags: ['agent_woodland_engine_history'],
    type: 'chat',
    public: true,
    prompt: "I'd like to identify the engine on my Cyclone Rake and find its specifications. Can you guide me through the identification process?",
  },
  {
    id: 'prompt_catalog_part_lookup',
    name: 'Catalog: Find Part Number',
    category: WOODLAND_CATEGORY,
    oneliner: 'Find a specific part number or SKU for your unit',
    command: 'part-lookup',
    tags: ['agent_woodland_catalog'],
    type: 'text',
    public: true,
    placeholders: ['part_name', 'rake_model'],
    prompt: `I'm looking for a part number for my Cyclone Rake.
- **Part/Component Name:** {{part_name}}
- **My Rake Model:** {{rake_model}}

Please provide the SKU, price, and a link to the catalog page.`,
  },
  {
    id: 'prompt_support_engine_maint',
    name: 'Support: Engine Maintenance',
    category: WOODLAND_CATEGORY,
    oneliner: 'Get step-by-step maintenance guide for your engine',
    command: 'engine-maint',
    tags: ['agent_woodland_support'],
    type: 'text',
    public: true,
    placeholders: ['engine_model'],
    prompt: `I need the maintenance guide for my engine:
- **Engine Model:** {{engine_model}}

Please provide oil type, spark plug specs, and air filter maintenance steps.`,
  },
  {
    id: 'prompt_tractor_compatibility',
    name: 'Tractor: Connection Help',
    category: WOODLAND_CATEGORY,
    oneliner: 'Check if a specific mower/tractor setup is supported',
    command: 'tractor-check',
    tags: ['agent_woodland_tractor'],
    type: 'text',
    public: true,
    placeholders: ['mower_make_model', 'connection_type'],
    prompt: `Can my Cyclone Rake connect to this setup?
- **Mower Make/Model:** {{mower_make_model}}
- **Special Setup:** {{connection_type}} (e.g., Power Flow, Ventrac, Electric)

Please check compatibility and note any special requirements or "Not Recommended" statuses.`,
  },
  {
    id: 'prompt_support_tech_specs',
    name: 'Support: Technical Specs',
    category: WOODLAND_CATEGORY,
    oneliner: 'Get weights, decibel ratings, or fuel specs',
    command: 'tech-specs',
    tags: ['agent_woodland_support'],
    type: 'text',
    public: true,
    placeholders: ['rake_model', 'spec_type'],
    prompt: `I need technical specifications for my unit:
- **Rake Model:** {{rake_model}}
- **Spec Requested:** {{spec_type}} (e.g., Tongue Weight, Decibel Rating, Fuel Type)

Please provide the official rating and any safety guidelines associated with it.`,
  },
  {
    id: 'prompt_support_policy_check',
    name: 'Support: Warranty & Policy',
    category: WOODLAND_CATEGORY,
    oneliner: 'Quick-check for warranty windows or cancellation policies',
    command: 'policy-check',
    tags: ['agent_woodland_support'],
    type: 'text',
    public: true,
    placeholders: ['topic'],
    prompt: `I have a policy question regarding:
- **Topic:** {{topic}} (e.g., Warranty Status, Order Cancellation, Senior Discount)

Please provide the official Woodland policy and relevant help links.`,
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
      authorName: authorName,
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

  const currentLabels = [
    ...(config.tags || []),
    ...(config.placeholders
      ? config.placeholders.map((p) => `placeholder:${p}`)
      : []),
  ].sort().join(',');

  const existingLabels = (productionPrompt?.labels || []).sort().join(',');

  const promptChanged =
    productionPrompt?.prompt !== config.prompt ||
    existingLabels !== currentLabels;
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
