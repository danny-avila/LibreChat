const mongoose = require('mongoose');
const { Agent, User } = require('~/db/models');
const promptTemplates = require('~/app/clients/agents/Woodland/promptTemplates');
const { AgentCapabilities, EModelEndpoint, SystemRoles } = require('librechat-data-provider');

const WOODLAND_PROMPT_VERSION = 'v2026.01.24';

const DEFAULT_PROVIDER =
  process.env.WOODLAND_AGENT_PROVIDER || EModelEndpoint.azureOpenAI;

const DEFAULT_MODEL =
  process.env.WOODLAND_FUNCTIONS_MODEL ||
  (DEFAULT_PROVIDER === EModelEndpoint.azureOpenAI
    ? process.env.WOODLAND_AZURE_MODEL || 'gpt-4o-mini'
    : process.env.OPENAI_DEFAULT_MODEL || 'gpt-4o-mini');

const WOODLAND_AGENTS = [
  {
    id: 'agent_wpp_orchestrator',
    name: 'WPP Supervisor',
    description: 'Prompt-only router minimizing tool/agent calls for Cyclone Rake support.',
    instructionsKey: 'OrchestratorRouter',
    // Assign domain tools for intelligent routing
    tools: [
      // MCP FAQ search tool
      'searchWoodlandFAQ_mcp_azure-search-faq',
      // Domain tools for routing
      'woodland-ai-search-catalog',
      'woodland-ai-search-cyclopedia',
      'woodland-ai-search-website',
      'woodland-ai-search-cases',
    ],
    // Attach MCP FAQ server
    mcp: ['azure-search-faq'],
    // Do NOT enable chaining to avoid sequential multi-agent loops
    capabilities: [],
    // No attached agents; route via tools only
    agent_ids: [],
    hide_sequential_outputs: true,
    temperature: 0.2,
    recursion_limit: 10,
    conversation_starters: [
      'I need help with my Cyclone Rake',
      'Check if my tractor is compatible',
      'Find a replacement part',
      'How do I maintain my engine?'
    ],
  },
  {
    id: 'agent_woodland_support',
    name: 'Cyclopedia Support Agent',
    description: 'Handles policies, SOPs, warranty, and shipping via CycloneRake.com.',
    instructionsKey: 'CyclopediaSupportAgent',
    tools: ['woodland-ai-search-cyclopedia'],
    temperature: 0,
    conversation_starters: [
      'Engine maintenance guide',
      'Check warranty policy',
      'Shipping and return info'
    ],
  },
  {
    id: 'agent_woodland_tractor',
    name: 'Tractor Fitment Agent',
    description: 'Confirms tractor compatibility and installation requirements.',
    instructionsKey: 'TractorFitmentAgent',
    tools: ['woodland-ai-search-tractor'],
    temperature: 0,
    conversation_starters: [
      'Match my tractor to a Cyclone Rake',
      'What parts do I need for my John Deere?'
    ],
  },
  {
    id: 'agent_woodland_engine_history',
    name: 'Engine History Agent',
    description: 'Surfaces historical engine specifications and change logs for Cyclone Rake units.',
    instructionsKey: 'EngineHistoryAgent',
    tools: ['woodland-ai-search-engine-history'],
    temperature: 0,
    conversation_starters: [
      'Identify my engine specs',
      'Check engine change logs'
    ],
  },
  {
    id: 'agent_woodland_product_history',
    name: 'Product History Agent',
    description: 'Provides historical product specs, timelines, and notable changes for Cyclone Rake models.',
    instructionsKey: 'ProductHistoryAgent',
    tools: ['woodland-ai-search-product-history'],
    temperature: 0,
    conversation_starters: [
      'Identify my old Cyclone Rake',
      'Show me parts for my green tapered bag unit'
    ],
  },
];

const BASE_INSTRUCTIONS = {
  CyclopediaSupportAgent: promptTemplates.cyclopediaSupport,
  TractorFitmentAgent: promptTemplates.tractorFitment,
  EngineHistoryAgent: promptTemplates.engineHistory,
  ProductHistoryAgent: promptTemplates.productHistory,
  SupervisorRouter: promptTemplates.supervisorRouter,
  OrchestratorRouter: promptTemplates.orchestratorRouter,
  CatalogPartsAgent: promptTemplates.catalogParts,
  WebsiteProductAgent: promptTemplates.websiteProduct,
  CasesReferenceAgent: promptTemplates.casesReference,
};

let cachedAuthor;

async function resolveAuthor() {
  if (cachedAuthor) {
    return cachedAuthor;
  }

  const selectFields = ['_id', 'name', 'username', 'email'];

  const formatAuthor = (user) => {
    if (!user?._id) {
      return null;
    }
    const name = user.name || user.username || user.email || 'System';
    return { id: user._id.toString(), name };
  };

  const withId = async (id) => {
    if (!id) {
      return null;
    }
    const user = await User.findById(id, selectFields.join(' ')).lean();
    if (!user) {
      return null;
    }
    return formatAuthor(user);
  };

  const withEmail = async (email) => {
    if (!email) {
      return null;
    }
    const user = await User.findOne({ email }, selectFields.join(' ')).lean();
    if (!user) {
      return null;
    }
    return formatAuthor(user);
  };

  const envId = await withId(process.env.WOODLAND_AGENT_AUTHOR_ID);
  if (envId) {
    cachedAuthor = envId;
    return cachedAuthor;
  }

  const envEmail = await withEmail(process.env.WOODLAND_AGENT_AUTHOR_EMAIL);
  if (envEmail) {
    cachedAuthor = envEmail;
    return cachedAuthor;
  }

  const admin = await User.findOne({ role: SystemRoles.ADMIN }, selectFields.join(' ')).lean();
  if (admin) {
    cachedAuthor = formatAuthor(admin);
    return cachedAuthor;
  }

  const anyUser = await User.findOne({}, selectFields.join(' ')).lean();
  if (anyUser) {
    cachedAuthor = formatAuthor(anyUser);
    return cachedAuthor;
  }

  return null;
}

async function ensureAgent(agentConfig) {
  const existing = await Agent.findOne({ id: agentConfig.id }).lean();
  const authorId = agentConfig.author ? new mongoose.Types.ObjectId(agentConfig.author) : null;

  if (!authorId) {
    throw new Error(`Missing author while seeding agent ${agentConfig.id}`);
  }

  const instructions = BASE_INSTRUCTIONS[agentConfig.instructionsKey] || '';
  const model = agentConfig.model || DEFAULT_MODEL;
  const temperature = typeof agentConfig.temperature === 'number' ? agentConfig.temperature : 0;

  const modelParameters = {
    model,
    temperature,
    prompt_version: WOODLAND_PROMPT_VERSION,
  };

  const provider = agentConfig.provider || DEFAULT_PROVIDER;
  if (provider === EModelEndpoint.azureOpenAI) {
    modelParameters.azureOpenAIApiDeploymentName = agentConfig.deploymentName || model;
  }

  const updateFields = {
    name: agentConfig.name,
    description: agentConfig.description,
    provider,
    instructions,
    tools: agentConfig.tools || [],
    capabilities: agentConfig.capabilities || [],
    model,
    model_parameters: modelParameters,
    author: authorId,
    authorName: agentConfig.authorName,
    hide_sequential_outputs: Boolean(agentConfig.hide_sequential_outputs),
    conversation_starters: agentConfig.conversation_starters || [],
    agent_ids: agentConfig.agent_ids ?? [],
    category: agentConfig.category || existing?.category || 'general',
    mcp: agentConfig.mcp || [],
  };

  if (agentConfig.tool_resources) {
    updateFields.tool_resources = agentConfig.tool_resources;
  }

  const timestamp = new Date();

  if (!existing) {
    const versionEntry = {
      ...updateFields,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    delete versionEntry.author;
    delete versionEntry.authorName;

    await Agent.create({
      id: agentConfig.id,
      ...updateFields,
      versions: [versionEntry],
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    return;
  }

  const shouldAddVersion =
    existing.instructions !== instructions ||
    existing.name !== updateFields.name ||
    existing.description !== updateFields.description ||
    existing.model !== model ||
    JSON.stringify(existing.tools || []) !== JSON.stringify(updateFields.tools) ||
    JSON.stringify(existing.capabilities || []) !== JSON.stringify(updateFields.capabilities) ||
    JSON.stringify(existing.conversation_starters || []) !==
    JSON.stringify(updateFields.conversation_starters || []) ||
    JSON.stringify(existing.agent_ids || []) !== JSON.stringify(updateFields.agent_ids || []) ||
    JSON.stringify(existing.mcp || []) !== JSON.stringify(updateFields.mcp || []);

  const updateQuery = {
    $set: {
      ...updateFields,
      updatedAt: timestamp,
    },
  };

  if (shouldAddVersion) {
    const versionEntry = {
      ...updateFields,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    delete versionEntry.author;
    delete versionEntry.authorName;
    if (!updateQuery.$push) {
      updateQuery.$push = {};
    }
    updateQuery.$push.versions = versionEntry;
  }

  await Agent.updateOne({ _id: existing._id }, updateQuery);
}

async function seedWoodlandAgents() {
  console.info('[WoodlandAgentSeed] Starting agent seeding...');
  const authorInfo = await resolveAuthor();
  if (!authorInfo) {
    console.error('[WoodlandAgentSeed] Skipping agent seeding; no user available to assign as author.');
    return;
  }

  console.info(`[WoodlandAgentSeed] Seeding ${WOODLAND_AGENTS.length} Woodland agents`);
  for (const agent of WOODLAND_AGENTS) {
    try {
      await ensureAgent({ ...agent, author: authorInfo.id, authorName: authorInfo.name });
      console.debug(`[WoodlandAgentSeed] ✓ ${agent.id}`);
    } catch (error) {
      console.error('[WoodlandAgentSeed] Failed to seed agent', agent.id, error);
    }
  }
  console.info('[WoodlandAgentSeed] ✅ Woodland agent seeding complete');

  // Run agent permissions migration after seeding
  try {
    console.info('[WoodlandAgentSeed] Running agent permissions migration...');
    const { migrateAgentPermissionsEnhanced } = require('../../config/migrate-agent-permissions');
    await migrateAgentPermissionsEnhanced({ dryRun: false });
    console.info('[WoodlandAgentSeed] ✅ Agent permissions migration complete');
  } catch (error) {
    console.error('[WoodlandAgentSeed] Agent permissions migration failed:', error);
  }
}

module.exports = {
  seedWoodlandAgents,
};
