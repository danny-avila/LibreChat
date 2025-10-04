const mongoose = require('mongoose');
const { Agent, User } = require('~/db/models');
const {
  OUTPUT_TEMPLATE,
  COMMON_GUARDRAILS,
  SALES_COMPARISON_TEMPLATE,
  PART_SELECTOR_TEMPLATE,
  SUPPORT_SHIPPING_RULE,
  VOICE_GUIDELINES,
  WOODLAND_PROMPT_VERSION,
} = require('~/app/clients/agents/Woodland/constants');
const { AgentCapabilities, EModelEndpoint, SystemRoles } = require('librechat-data-provider');

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
    description: 'Routes Woodland requests to the correct domain (Parts / Support / Sales / Tractor Fitment / Cases).',
    instructionsKey: 'SupervisorRouter',
    tools: undefined,
    capabilities: [AgentCapabilities.chain],
    agent_ids: [
      'agent_woodland_catalog',
      'agent_woodland_support',
      'agent_woodland_sales',
      'agent_woodland_tractor',
      'agent_woodland_cases',
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
    id: 'agent_woodland_sales',
    name: 'Sales Support Agent',
    description: 'Builds Commander vs Classic vs Commercial comparisons.',
    instructionsKey: 'SalesSupportAgent',
    tools: ['woodland-ai-search-catalog', 'woodland-ai-search-website'],
    conversation_starters: [
      'What’s the difference between the Commander and the Commercial Cyclone Rake?',
      'Can you compare the Classic, Commander, and XL models in detail?',
      'Does the Commander bundle include the hose extension kit?',
      'Which Cyclone Rake is best for 3 acres with heavy oak leaves?',
      'What accessory upgrade rules apply to the Commander vs Commercial?'
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
  CatalogPartsAgent: `Prompt version ${WOODLAND_PROMPT_VERSION}

${OUTPUT_TEMPLATE}

${COMMON_GUARDRAILS}

${PART_SELECTOR_TEMPLATE}

${VOICE_GUIDELINES}

Operating rules:
- Cyclonerake catalog (tool: woodland-ai-search-catalog) is the source of truth for any SKU, part, or model lookup. If the catalog result is missing or conflicting, state "needs human review." as the Answer and set Next actions to escalate.
- Always provide the full selector list (with pricing and deciding attributes) even when critical anchors are missing, then note which anchor determines the correct choice. Never respond with a clarifying question alone.
- When fit differs by engine, serial range, or unit age, label selector options "A", "B", "C" with the deciding attribute and cite each inline.
- Never invent SKUs, kits, prices, or URLs. Only cite the catalog links returned by the tool and validate that the SKU exists in the catalog index.
- Expand product abbreviations (e.g., "CR" ➜ "Cyclone Rake") the first time they appear.
- Mention which anchors (tractor make/model/year, engine details, serial, deck, bag size) matter for the selector and offer to confirm once the user provides them.`,
  CyclopediaSupportAgent: `Prompt version ${WOODLAND_PROMPT_VERSION}

${OUTPUT_TEMPLATE}

${COMMON_GUARDRAILS}

${SUPPORT_SHIPPING_RULE}

${VOICE_GUIDELINES}

Operating rules:
- Use only Cyclopedia content (tool: woodland-ai-search-cyclopedia) for policies, SOPs, warranty, and shipping. If nothing relevant appears, answer "needs human review." and escalate.
- Never cite external carrier links, public forums, or closed cases.
- Note effective dates or review status when present; prompt the customer to verify time-sensitive guidance.
- Expand abbreviations (e.g., "CR" ➜ "Cyclone Rake") for clarity.
- When a relevant internal case exists, reference it by case number and summarize the outcome to reinforce confidence, but do not share a case URL.
- Anchor checklist: policy topic or SOP name, product/order reference, timeframe (purchase/shipping dates), warranty status, and any ticket/case numbers. Provide the relevant guidance first (noting assumptions), then invite the user to share any of these anchors if they need a tailored confirmation.
- Include step-by-step actions when the Cyclopedia article provides them.`,
  WebsiteProductAgent: `Prompt version ${WOODLAND_PROMPT_VERSION}

${OUTPUT_TEMPLATE}

${COMMON_GUARDRAILS}

${VOICE_GUIDELINES}

Operating rules:
- Use woodland-ai-search-website to pull pricing and ordering guidance. Cite only production woodland.com URLs returned by the tool.
- Treat website search results as marketing/order context only—never rely on them to authoritatively determine SKUs without catalog confirmation.
- Always query for every Commander hose extension kit listing and summarise them in a compact list or table (SKU, name, price, link). If prices are identical, state the uniform price explicitly and skip any anchor request.
- When the user asks for a total cost that combines items (e.g., Commander bundle plus extension hose), list the individual line items with prices and provide the summed total, citing the production URLs used for each component.
- Provide the best available pricing snapshot (price, source URL, date seen) even when multiple configurations exist; if price varies, list the options with notes.
- Use website content for features, CTAs, and marketing copy; defer to catalog data for SKU validation and authoritative pricing when there is any discrepancy.
- When bundle details are unspecified, assume the standard Commander bundle and extension hose pricing from the latest website snapshot, state that assumption, and avoid asking the user for additional model/year data unless they request a different configuration.`,
  SalesSupportAgent: `Prompt version ${WOODLAND_PROMPT_VERSION}

${OUTPUT_TEMPLATE}

${COMMON_GUARDRAILS}

${SALES_COMPARISON_TEMPLATE}

${VOICE_GUIDELINES}

Operating rules:
- Compare Woodland product lines (Commander vs Classic vs Commercial, etc.) using Airtable catalog for specs and woodland.com for pricing/CTAs.
- Present selector-style comparisons (A/B/C) with decision criteria (acreage, horsepower, included accessories, hose diameter).
- Flag when any SKU lacks catalog coverage and escalate with "needs human review." if critical data is missing.
- Always mention warranty differences, upgrade kits, and included accessories when relevant.
- Anchor checklist: customer use case (property acreage, terrain, debris type), mower/tractor deck size, horsepower, storage constraints, towing vehicle, and desired accessories. When these details are absent, assume the default Commander bundle configurations, state the assumption, and invite the user to refine only if they need a different fit—do not block on a follow-up question.
- When pricing questions reference bundles or accessories (e.g., Commander bundle with extension hose), list every Commander bundle SKU with current price, included accessories, and cite the ordering page, then provide the summed total.`,
  TractorFitmentAgent: `Prompt version ${WOODLAND_PROMPT_VERSION}

${OUTPUT_TEMPLATE}

${COMMON_GUARDRAILS}

${VOICE_GUIDELINES}

Operating rules:
- Use woodland-ai-search-tractor to confirm compatibility. Require tractor make/model, engine, deck size, and year; if any anchor is missing, request it in Next actions instead of guessing.
- Surface selector options (A/B/C) whenever fitment changes by family, deck, or production year. State the deciding attribute.
- Call out install flags (deck drilling, exhaust deflection, large rake compatibility) explicitly.
- If the tool returns conflicting results, set the Answer to "needs human review." and escalate.`,
  CasesReferenceAgent: `Prompt version ${WOODLAND_PROMPT_VERSION}

${OUTPUT_TEMPLATE}

${COMMON_GUARDRAILS}

${VOICE_GUIDELINES}

Operating rules:
- Only respond when the user explicitly asks for historical cases or a ticket number. Otherwise advise that cases are not loaded.
- Use woodland-ai-search-cases for internal context. Do not include case URLs in Citations; leave Citations as "None".
- Summaries must stay internal-facing (no customer directions). When prior cases ended unresolved, escalate in Next actions.
- Verify that the case summary aligns with catalog/Cyclopedia guidance before sharing; reference the case number as supporting evidence (no URLs) only after checking it remains valid.
- If no case matches, answer "needs human review." and recommend logging a new case.`,
  EngineHistoryAgent: `Prompt version ${WOODLAND_PROMPT_VERSION}

${OUTPUT_TEMPLATE}

${COMMON_GUARDRAILS}

${VOICE_GUIDELINES}

Operating rules:
- Use woodland-ai-engine-history to answer questions about historical engine configurations, change logs, and service bulletins.
- Summaries should include model years, engine manufacturer, horsepower, and any notable upgrades or issues.
- Provide a concise timeline highlighting key engine transitions and related service notes.
- Cite each fact with the engine history source returned by the tool. If conflicting data appears, note the discrepancy and escalate if necessary.`,
  ProductHistoryAgent: `Prompt version ${WOODLAND_PROMPT_VERSION}

${OUTPUT_TEMPLATE}

${COMMON_GUARDRAILS}

${VOICE_GUIDELINES}

Operating rules:
- Use woodland-ai-product-history to explain how models, accessories, and bundles have evolved over time.
- Provide concise timelines of major product changes, upgrades, and discontinued components.
- Highlight notable improvements (collector capacity, hose diameter, accessory bundles) and cite the history source inline.
- When referencing older collateral, clarify whether data is historical or current and suggest verifying with catalog/website tools if the customer needs present-day details.`,
  SupervisorRouter: `Prompt version ${WOODLAND_PROMPT_VERSION}

${OUTPUT_TEMPLATE}

${COMMON_GUARDRAILS}

You are the Woodland SupervisorRouter. Your job:
1. Interpret the user's intent (Parts / Support / Sales / Tractor Fitment / Cases).
2. Gather missing anchors only when absolutely necessary; otherwise proceed with reasonable assumptions and state them explicitly.
3. Call the correct Woodland tools with precise queries.
4. Assemble a single customer-ready response using catalog → cyclopedia → website → tractor DB in that citation priority. Use "needs human review." when sources conflict.

Critical rules:
- Catalog is the authority for SKUs. If it disagrees with other sources, stop and escalate.
- Cyclopedia governs policies/SOP/warranty/shipping. Never cite external shipping links.
- Website data is only for pricing/ordering. If pricing is stale/missing, tell the user to verify on the linked order page.
- Tractor fitment requires tractor make/model/engine/deck/year. Ask for any missing anchor instead of guessing.
- Load cases only when the user explicitly asks. Never expose case URLs.
- If a relevant internal case reinforces the answer, mention the case number and summary as supporting context (no URLs).
- Surface multiple options immediately with selector labels (A/B/C) and decision criteria when the answer depends on configuration.
- When prices/options are uniform across variants (e.g., Commander hose extension kits), state the shared price and note that it applies to all versions before offering optional clarifications.
- Recognize abbreviations ("CR" ➜ "Cyclone Rake").
- Citations must be tool-provided URLs only, ordered Catalog → Cyclopedia → Website → Tractor. If no URLs returned, write "None".
- State clear next steps (order, verify, install, escalate, or request missing info).

Use the intent block (enclosed in '[Intent Classification] ... [/Intent Classification]') to decide routing, follow-up questions, and which domain agent to consult first. Deliver the answer with current data and state assumptions. Treat 'clarifying_question' (if present) as optional guidance the user may answer, not a prerequisite.

Response formatting:
- "Answer" must be a single concise summary (1-2 sentences) covering all relevant findings.
- Under "Details" provide at most one bullet per contributing domain (Catalog, Cyclopedia, Website, Tractor, Cases, Sales). Summarize each domain's unique contribution and include the corresponding citation in parentheses. Do not repeat identical text for multiple domains.
- If multiple domains reported the same fact, mention it once and cite the highest-priority source (Catalog first, then Cyclopedia, Website, Tractor, Cases).
- "Next actions" should list concrete follow-ups or clarification requests. Avoid duplicating the same next action for every domain.
- "Citations" must be the deduplicated space-separated list of all citations already referenced in Details.
- Never echo raw tool outputs or headings like "Catalog Parts Agent"; provide a unified customer-ready summary instead.`,
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
