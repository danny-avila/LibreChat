const mongoose = require('mongoose');
const { PromptGroup, Prompt, User } = require('~/db/models');
const { logger } = require('@librechat/data-schemas');
const { SystemRoles } = require('librechat-data-provider');
// Lazy-load PermissionService to break circular dependency
// const { grantPermission } = require('~/server/services/PermissionService');
const { AccessRoleIds, PrincipalType, ResourceType } = require('librechat-data-provider');

const WOODLAND_PROMPT_VERSION = 'v2025.11.24';
const WOODLAND_CATEGORY = 'woodland';

/**
 * Woodland Agent Prompt Templates
 * These are seeded as baseline prompts for sales reps to use or customize
 */
const WOODLAND_PROMPTS = [
  /* Simple JSON-provided generic prompts (placeholders + tags) */
  {
    id: 'prompt_generic_configurations_search',
    name: 'All Compatible Configurations',
    category: WOODLAND_CATEGORY,
    oneliner: 'List all Cyclone Rake configurations (Classic/Commander/Commercial Pro) for tractor',
    command: 'configs-search',
    type: 'text',
    placeholders: ['make', 'model', 'deck_size'],
    tags: ['tractor_search'],
    public: true,
    prompt: 'Find all Cyclone Rake configurations compatible with {{make}} {{model}} with a {{deck_size}} deck.'
  },
  {
    id: 'prompt_generic_core_parts_lookup',
    name: 'Core Parts Lookup',
    category: WOODLAND_CATEGORY,
    oneliner: 'Return MDA, hitch, hose, upgrade hose for tractor + deck',
    command: 'core-parts',
    type: 'text',
    placeholders: ['make', 'model', 'deck_size'],
    tags: ['parts'],
    public: true,
    prompt: 'What MDA, hitch, hose, and upgrade hose are correct for {{make}} {{model}} {{deck_size}}?'
  },
  {
    id: 'prompt_tractor_search_generic',
    name: 'Generic Tractor Search',
    category: WOODLAND_CATEGORY,
    oneliner: 'List all Cyclone Rake configurations for a tractor',
    command: 'tractor-search',
    type: 'text',
    prompt: `Find all Cyclone Rake configurations compatible with {{make}} {{model}} with a {{deck_size}} deck.

Output requirements:
1. Compatibility matrix: Classic | Commander | Commercial Pro (yes/no + any notes)
2. Required parts per compatible rake: MDA, hitch, hose, upgrade hose, rubber collar (if applicable)
3. Flags: drilling required, exhaust clearance, special adapter cases
4. Accessory recommendations (only if universally applicable across the compatible rakes)
5. Explicitly mark unknown or missing fields as 'needs manual review'

Rules:
- Use ONLY tool-returned data (do not invent SKUs or URLs)
- If a rake is incompatible, list reason instead of parts
- Group output so a rep can quickly compare models
- Return direct product URLs (validated) alongside each SKU when available.
`,
  },
  {
    id: 'prompt_parts_lookup_generic',
    name: 'Generic Parts Lookup',
    category: WOODLAND_CATEGORY,
    oneliner: 'Return core and upgrade parts for tractor fitment',
    command: 'parts-lookup',
    type: 'text',
    prompt: `What MDA, hitch, hose, and upgrade hose are correct for {{make}} {{model}} {{deck_size}}?

Provide:
1. Core SKU list: MDA | hitch | hose | upgrade hose | rubber collar (if applicable)
2. Direct product URLs (only tool-returned; skip if absent)
3. Installation notes (deck drilling, adapter specifics, clearance warnings)
4. Upgrade justification (why upgrade hose vs standard hose, if present)
5. Accessory upsells (only if directly relevant — e.g., collar prevents wear)

Rules:
- Never guess SKUs; omit with 'not in tool data' if missing
- Prefer OEM over aftermarket; if only aftermarket present, label clearly
- Flag policy conflicts or ambiguous results with 'needs human review'
- Keep output concise: bullet list then optional table.
`,
  },
  {
    id: 'prompt_tractor_quick_fit',
    name: 'Quick Tractor Fitment',
    category: WOODLAND_CATEGORY,
    oneliner: 'Fast tractor compatibility check with make, model, deck, rake',
    command: 'tractor-fit',
    type: 'text',
    prompt: `I need help finding compatible Cyclone Rake parts for my tractor.

Make: {{make}}
Model: {{model}}
Deck Width: {{deck}}"
Rake Model: {{rake}}

Please validate compatibility and provide:
1. Required SKUs (MDA, hitch, hose, rubber collar)
2. Direct product URLs
3. Any accessory recommendations
4. Installation notes if applicable

Use only verified data from the tractor fitment tool.`,
  },
  {
    id: 'prompt_tractor_step_by_step',
    name: 'Guided Tractor Fitment',
    category: WOODLAND_CATEGORY,
    oneliner: 'Step-by-step tractor compatibility with smart guidance',
    command: 'guided-fit',
    type: 'chat',
    prompt: `Help me find the right Cyclone Rake parts for my tractor. Guide me step-by-step:

1. Ask for tractor make (if not provided)
2. Ask for exact model number
3. Ask for deck width
4. Ask for rake model preference (Classic, Commander, Commercial Pro)

After collecting all details, provide:
- Complete parts list with SKUs
- Direct product URLs (verified only)
- Grouped table format if multiple options
- Upgrade hose and rubber collar recommendations
- Clear next steps for ordering

Be conversational but precise. Use only tool-returned URLs.`,
  },
  {
    id: 'prompt_catalog_sku_lookup',
    name: 'Catalog SKU Lookup',
    category: WOODLAND_CATEGORY,
    oneliner: 'Find part numbers and pricing for specific rake models',
    command: 'sku-lookup',
    type: 'text',
    prompt: `Find SKU and pricing information for:

Rake Model: {{rake_name}}
Part Type: {{part_type}}

Please provide:
1. SKU number
2. Current price
3. Compatibility (which rake models it fits)
4. Direct product URL
5. Any policy notes or restrictions

Use the catalog search tool and cite sources.`,
  },
  {
    id: 'prompt_support_troubleshoot',
    name: 'Equipment Troubleshooting',
    category: WOODLAND_CATEGORY,
    oneliner: 'Diagnose and resolve Cyclone Rake issues',
    command: 'troubleshoot',
    type: 'chat',
    prompt: `Help troubleshoot a Cyclone Rake issue:

Model: {{model}}
Issue: {{issue_description}}

Please:
1. Ask clarifying questions about symptoms
2. Reference Cyclopedia for standard troubleshooting steps
3. Provide step-by-step diagnostics
4. Suggest parts if replacement needed (with SKUs)
5. Escalate to support if issue is complex

Be thorough but concise. Prioritize safety.`,
  },
  {
    id: 'prompt_accessory_suggest',
    name: 'Accessory Recommendations',
    category: WOODLAND_CATEGORY,
    oneliner: 'Suggest upgrade hose, collar, and enhancement accessories',
    command: 'accessories',
    type: 'text',
    prompt: `Recommend accessories for this setup:

Tractor: {{make}} {{model}}
Current Rake: {{rake}}
Use Case: {{use_case}}

Suggest:
1. Upgrade hose (if applicable with benefits)
2. Rubber collar (with wear prevention details)
3. Extension kits or sections
4. Any other enhancements

Include SKUs, pricing, and direct URLs. Explain value of each accessory.`,
  },
  {
    id: 'prompt_crm_format',
    name: 'CRM-Friendly Output',
    category: WOODLAND_CATEGORY,
    oneliner: 'Format results for easy copy-paste into CRM notes',
    command: 'crm-format',
    type: 'text',
    prompt: `Format the following fitment query results for CRM:

{{query_details}}

Output format:
- Single compact line: make model deck" rake: MDA | hitch | hose | collar
- Flag any special notes (drilling, exhaust, compatibility issues)
- Include direct URLs in separate section
- Add timestamp and query reference

Keep it concise for quick CRM logging.`,
  },
  {
    id: 'prompt_product_history_combination',
    name: 'Product History by Combination',
    category: WOODLAND_CATEGORY,
    oneliner: 'Search product history using specific rake/engine/bag/blower combinations',
    command: 'product-combo',
    type: 'text',
    public: true,
    prompt: `Search product configuration history for:

Engine Model: {{engine_model}}
Bag Color: {{bag_color}}
Bag Shape: {{bag_shape}}
Blower Color: {{blower_color}}

Find all historical product configurations matching these specifications. Include:
1. All reviewed configurations with these attributes
2. Timeline of changes if multiple revisions exist
3. Related SKUs and part numbers
4. Any superseded or replacement products
5. Special notes about this combination

Use structured filters for accurate results.`,
  },
  {
    id: 'prompt_product_history_attributes',
    name: 'Product Attribute Lookup',
    category: WOODLAND_CATEGORY,
    oneliner: 'Find available colors, shapes, and options for specific rake/engine models',
    command: 'product-attrs',
    type: 'text',
    public: true,
    prompt: `What product options are available for:

Engine Model: {{engine_model}}

Please list options grouped by rake model:
1. Available bag colors for each rake
2. Available bag shapes for each rake
3. Available blower colors for each rake
4. Available deck hose options for each rake
5. Any special configurations or variations

Group results clearly by rake model and option type.`,
  },
  {
    id: 'prompt_engine_history_combination',
    name: 'Engine History by Combination',
    category: WOODLAND_CATEGORY,
    oneliner: 'Search engine configuration history by rake/model/horsepower/filter',
    command: 'engine-combo',
    type: 'text',
    public: true,
    prompt: `Search engine configuration history for:

Engine Model: {{engine_model}}
Horsepower: {{horsepower}}
Filter Shape: {{filter_shape}}
Blower Color: {{blower_color}}

Find all historical engine configurations matching these specifications grouped by rake model. Include:
1. All reviewed engine configurations by rake
2. Timeline of engine changes and revisions per rake
3. When horsepower or filter specifications changed
4. Related part numbers and SKUs
5. Notes about engine transitions

Use structured filters for precise results.`,
  },
  {
    id: 'prompt_engine_history_timeline',
    name: 'Engine Configuration Timeline',
    category: WOODLAND_CATEGORY,
    oneliner: 'Track engine specification changes over time for a rake model',
    command: 'engine-timeline',
    type: 'text',
    public: true,
    prompt: `Show the engine configuration timeline for:

Engine Model: {{engine_model}}

Provide grouped by rake model:
1. Chronological list of all engine changes
2. What changed (horsepower, filter, air filter, blower)
3. When each change occurred
4. Reasons for changes if documented
5. Current vs. previous configurations

Present as a clear timeline with dates, organized by rake model.`,
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
