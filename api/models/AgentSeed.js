const mongoose = require('mongoose');
const { Agent, User } = require('~/db/models');
const promptTemplates = require('~/app/clients/agents/Woodland/promptTemplates');
const { AgentCapabilities, EModelEndpoint, SystemRoles } = require('librechat-data-provider');

const WOODLAND_PROMPT_VERSION = 'v2025.03.15';

const DEFAULT_PROVIDER =
  process.env.WOODLAND_AGENT_PROVIDER || EModelEndpoint.azureOpenAI;

const DEFAULT_MODEL =
  process.env.WOODLAND_FUNCTIONS_MODEL ||
  (DEFAULT_PROVIDER === EModelEndpoint.azureOpenAI
    ? process.env.WOODLAND_AZURE_MODEL || 'gpt-4o-mini'
    : process.env.OPENAI_DEFAULT_MODEL || 'gpt-4o-mini');

const WOODLAND_AGENTS = [
  {
    id: 'agent_woodland_supervisor',
    name: 'Woodland Supervisor',
    description: 'Routes Woodland requests across catalog, Cyclopedia, website, and cases responses.',
    instructionsKey: 'SupervisorRouter',
    tools: [
      'woodland-ai-search-catalog',
      'woodland-ai-search-cyclopedia',
      'woodland-ai-search-website',
      'woodland-ai-search-cases',
    ],
    capabilities: [AgentCapabilities.chain],
    agent_ids: [
      'agent_woodland_catalog',
      'agent_woodland_support',
      'agent_woodland_cases',
      'agent_woodland_website',
    ],
    hide_sequential_outputs: true,
    conversation_starters: [
      'Can you recommend the best Cyclone Rake for heavy fall cleanup on 3 acres?',
      'I need help comparing the Classic, Commander, and Commercial models.',
      'What part or accessory should I order to extend my pickup reach?',
      'My engine is surging—can you walk me through the troubleshooting steps?',
      'How long does shipping take during peak fall season?'
    ],
    temperature: 0,
  },
  {
    id: 'agent_woodland_catalog',
    name: 'Catalog Parts Agent',
    description: 'Answers SKU/part/model questions using Airtable catalog data.',
    instructionsKey: 'CatalogPartsAgent',
    tools: ['woodland-ai-search-catalog'],
    conversation_starters: [
      'What impeller options are available for a Commercial Pro?',
      'I need an inlet collar for an XL—what SKU should I order?',
      'Which adapter kit fits a John Deere D130 with a 42-inch deck?',
      'What collector bag fits a 2015 Commander with a Vanguard 8 HP engine?',
      'What section kit do I use to extend a PVP?'
    ],
    temperature: 0,
  },
  {
    id: 'agent_woodland_support',
    name: 'Cyclopedia Support Agent',
    description: 'Handles policies, SOPs, warranty, and shipping via Cyclopedia.',
    instructionsKey: 'CyclopediaSupportAgent',
    tools: ['woodland-ai-search-cyclopedia'],
    conversation_starters: [
      'How do I winterize my Cyclone Rake for storage?',
      'My engine is surging—what should I check first?',
      'What are the steps to install an MDA on a John Deere D130?',
      'How do I replace the dumpling assembly?',
      'What maintenance should I do on a Cyclone Rake CR Pro before fall?'
    ],
    temperature: 0,
  },
  {
    id: 'agent_woodland_tractor',
    name: 'Tractor Fitment Agent',
    description: 'Confirms tractor compatibility and installation requirements.',
    instructionsKey: 'TractorFitmentAgent',
    tools: ['woodland-ai-search-tractor'],
    conversation_starters: [
      'What adapter kit do I need for a John Deere D130 with a 42-inch deck?',
      'Will a Commander work with a 2015 Vanguard 8 HP engine?',
      'Does my mower require deck drilling for the Cyclone Rake MDA?',
      'Which hitch kit fits a Craftsman T260?',
      'Is the Commander compatible with larger hose upgrades?'
    ],
    temperature: 0,
  },
  {
    id: 'agent_woodland_cases',
    name: 'Cases Reference Agent',
    description: 'Summarises internal cases when explicitly requested.',
    instructionsKey: 'CasesReferenceAgent',
    tools: ['woodland-ai-search-cases'],
    conversation_starters: [
      'Do we have a case covering dumpling assembly replacements?',
      'Has anyone resolved Commander hose extension shipping delays?',
      'What was the resolution for case 48213 regarding bag upgrades?',
      'Can you summarize the chassis repair case for the Commercial Pro?',
      'Is there an internal case about surge issues on the Vanguard engine?'
    ],
    temperature: 0,
  },
  {
    id: 'agent_woodland_website',
    name: 'Website Product Agent',
    description: 'Provides pricing and ordering guidance from woodland.com pages.',
    instructionsKey: 'WebsiteProductAgent',
    tools: ['woodland-ai-search-website'],
    conversation_starters: [
      'How much are the Dual Pro Wheels right now?',
      'What’s the price of a hose extension kit for the Commander?',
      'Do the Commander and Commercial Pro collector bags cost the same?',
      'What’s the total price for a Commander bundle with the extension hose?',
      'Is there any financing info for the Commercial bundle?'
    ],
    temperature: 0,
  },
  {
    id: 'agent_woodland_engine_history',
    name: 'Engine History Agent',
    description: 'Surfaces historical engine specifications and change logs for Cyclone Rake units.',
    instructionsKey: 'EngineHistoryAgent',
    tools: ['woodland-ai-engine-history'],
    conversation_starters: [
      'What engines have powered the Commander over the years?',
      'When did the Vanguard upgrade roll out for the Commercial Pro?',
      'Which engines were standard on early CR Pros?',
      'Summarize the engine changes for the Classic model.',
      'What service bulletins affect older Briggs engines?'
    ],
    temperature: 0,
  },
  {
    id: 'agent_woodland_product_history',
    name: 'Product History Agent',
    description: 'Provides historical product specs, timelines, and notable changes for Cyclone Rake models.',
    instructionsKey: 'ProductHistoryAgent',
    tools: ['woodland-ai-product-history'],
    conversation_starters: [
      'How has the Commander evolved over time?',
      'What major upgrades were added to the XL model?',
      'When did the Commercial Pro get larger collectors?',
      'Summarize key design changes to the PVP line.',
      'What accessories were bundled with the CR Pro in 2010?'
    ],
    temperature: 0,
  },
];

const BASE_INSTRUCTIONS = {
  CatalogPartsAgent: promptTemplates.catalogParts,
  CyclopediaSupportAgent: promptTemplates.cyclopediaSupport,
  TractorFitmentAgent: promptTemplates.tractorFitment,
  CasesReferenceAgent: promptTemplates.casesReference,
  EngineHistoryAgent: promptTemplates.engineHistory,
  ProductHistoryAgent: promptTemplates.productHistory,
  WebsiteProductAgent: promptTemplates.websiteProduct,
  SupervisorRouter: promptTemplates.supervisorRouter,
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
    JSON.stringify(existing.agent_ids || []) !== JSON.stringify(updateFields.agent_ids || []);

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
  const authorInfo = await resolveAuthor();
  if (!authorInfo) {
    console.error('[WoodlandAgentSeed] Skipping agent seeding; no user available to assign as author.');
    return;
  }

  for (const agent of WOODLAND_AGENTS) {
    try {
      await ensureAgent({ ...agent, author: authorInfo.id, authorName: authorInfo.name });
    } catch (error) {
      console.error('[WoodlandAgentSeed] Failed to seed agent', agent.id, error);
    }
  }

  try {
    const { migrateAgentPermissionsEnhanced } = require('../../config/migrate-agent-permissions');
    await migrateAgentPermissionsEnhanced({ dryRun: false });
  } catch (error) {
    console.error('[WoodlandAgentSeed] Agent permissions migration failed', error);
  }
}

module.exports = {
  seedWoodlandAgents,
};
