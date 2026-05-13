const DEFAULT_ON_STORAGE_FILE_ID = 'file-CTN168WfihPUgthrxvCQsy';
const CODECAN_MODEL = process.env.CODECAN_OPENAI_MODEL || 'gpt-5-mini';

const DEFAULT_ONTARIO_VECTOR_STORE_ID = 'vs_698b51aa511081919a033eff64f38c97';
const DEFAULT_NATIONAL_VECTOR_STORE_ID = 'vs_693860848bc48191bccb7c1d197f488f';

// Vector store IDs for the remaining provincial/territorial jurisdictions. These start empty
// and are populated either by setting the matching CODECAN_VS_* env var or by editing the
// constants below once create_vector_store.py has produced them. A jurisdiction's `enabled`
// flag is derived from whether its primary vector store ID is set.
const DEFAULT_ALBERTA_VECTOR_STORE_ID = 'vs_6a03c52101948191b953d4fc6093d704';
const DEFAULT_BRITISH_COLUMBIA_VECTOR_STORE_ID = 'vs_6a03c773bd848191b8d6012f6b7949a1';
const DEFAULT_QUEBEC_VECTOR_STORE_ID = 'vs_6a03c802c0f481918018ec9cd3efe222';
const DEFAULT_MANITOBA_VECTOR_STORE_ID = 'vs_6a03c63c82c08191b692d89cbc03bb85';
const DEFAULT_SASKATCHEWAN_VECTOR_STORE_ID = 'vs_6a03c63f7c808191a734f87ed7005682';
const DEFAULT_NOVA_SCOTIA_VECTOR_STORE_ID = 'vs_6a03c6437d6c8191b7168398ba5fe9bb';
const DEFAULT_PRINCE_EDWARD_ISLAND_VECTOR_STORE_ID = 'vs_6a03c64635e081919a1f3e5514ccd23e';
const DEFAULT_NEWFOUNDLAND_VECTOR_STORE_ID = 'vs_6a03c649e5c481919f52a40e10bc0988';
const DEFAULT_YUKON_VECTOR_STORE_ID = 'vs_6a03c64c9f4c81919e6c8524cf4d49c8';
const DEFAULT_NUNAVUT_VECTOR_STORE_ID = 'vs_6a03c64ea3488191b2c8e835d786329d';

const NO_RELEVANT_TEXT =
  'No relevant content found in the building code corpus for the selected jurisdiction.';
// Legacy exports retained for any callers that still import them.
const NO_RELEVANT_ONTARIO_TEXT =
  'No relevant content found in the Ontario Building Code vector store.';
const NO_RELEVANT_NATIONAL_TEXT =
  'No relevant content found in the National Building Code vector store.';

const DEFAULT_MAX_NUM_RESULTS = Number(process.env.CODECAN_FILE_SEARCH_MAX_RESULTS) || 6;

// Reasoning effort for gpt-5-mini on the answer call. The model defaults to 'medium', which on
// our traces was burning ~17s of reasoning time on simple retrieval-grounded Q&A. Drop to 'low'
// to slash that without losing the ability to call file_search.
// Note: 'minimal' is rejected by OpenAI when file_search is present — 'low' is the floor for
// tool-using calls on gpt-5-mini.
// Accepted values: low | medium | high (minimal is invalid for tool calls).
const DEFAULT_REASONING_EFFORT = process.env.CODECAN_REASONING_EFFORT || 'low';

// Output verbosity. 'medium' is the OpenAI default; 'high' produces fuller, more explanatory
// answers (still grounded in retrieved citations).
// Accepted values: low | medium | high.
const DEFAULT_VERBOSITY = process.env.CODECAN_VERBOSITY || 'high';

function vsId(envName, fallback) {
  return process.env[envName] || fallback;
}

function buildProvincialPrompt({ codeName, codeAbbr, citationNote }) {
  const supersession = `The ${codeName} (${codeAbbr}) supersedes the National Building Code (NBC) for this jurisdiction. The retrieval index contains BOTH ${codeAbbr} and NBC content. Always prefer ${codeAbbr} citations when both are relevant; cite NBC only when ${codeAbbr} has no applicable provision.`;
  const corpusNote = citationNote ? `\n\n${citationNote}` : '';
  return `You are CodeCan AI, an expert assistant for building code questions.

${supersession}${corpusNote}

Always call the "file_search" tool before answering the first question in a thread. On follow-up questions in the same thread, you may answer from prior retrieved content without re-searching, but search again if the user's question shifts topic. Base your response only on retrieved content.

When available, quote specific Division, Part, Section, Article, Clause, or Sentence numbers.

Requirements:
1. Provide a clear, concise answer using only retrieved content.
2. Return citations via OpenAI file_citation annotations.
3. Include at least one citation when answering.
4. Do not emit fenced citations blocks.
5. If no relevant content is retrieved, reply exactly: "${NO_RELEVANT_TEXT}".
6. Do not speculate.`;
}

/**
 * Jurisdiction registry. Each entry declares its label, vector stores (province first, federal as
 * fallback in the same file_search call so the model can prefer provincial citations), the system
 * prompt, and starter prompts shown on Landing.
 *
 * `enabled: false` entries are stubs we ship the picker against; they're filtered out of
 * listJurisdictions() until a real vector store is wired up.
 */
const JURISDICTIONS = Object.freeze({
  ontario: {
    id: 'ontario',
    displayName: 'Ontario',
    shortLabel: 'Ontario Building Code',
    region: 'CA-ON',
    vectorStoreIds: [
      vsId('CODECAN_VS_ONTARIO', DEFAULT_ONTARIO_VECTOR_STORE_ID),
      vsId('CODECAN_VS_CANADA_FEDERAL', DEFAULT_NATIONAL_VECTOR_STORE_ID),
    ],
    systemPrompt: `You are CodeCan AI, an expert assistant for building code questions.

The Ontario Building Code (OBC) supersedes the National Building Code (NBC) for this jurisdiction. The retrieval index contains BOTH OBC and NBC content. Always prefer OBC citations when both are relevant; cite NBC only when OBC has no applicable provision.

Always call the "file_search" tool before answering the first question in a thread. On follow-up questions in the same thread, you may answer from prior retrieved content without re-searching, but search again if the user's question shifts topic. Base your response only on retrieved content.

When available, quote specific Division, Part, Section, Article, Clause, or Sentence numbers.

Requirements:
1. Provide a clear, concise answer using only retrieved content.
2. Return citations via OpenAI file_citation annotations.
3. Include at least one citation when answering.
4. Do not emit fenced citations blocks.
5. If no relevant content is retrieved, reply exactly: "${NO_RELEVANT_TEXT}".
6. Do not speculate.`,
    starters: [
      'What is the minimum stair width in a single dwelling?',
      'Do my smoke alarms need to be interconnected?',
      'Maximum joist spacing for a 2x10 deck?',
    ],
    enabled: true,
  },
  'canada-federal': {
    id: 'canada-federal',
    displayName: 'Canada (Federal — NBC)',
    shortLabel: 'National Building Code',
    region: 'CA',
    vectorStoreIds: [vsId('CODECAN_VS_CANADA_FEDERAL', DEFAULT_NATIONAL_VECTOR_STORE_ID)],
    systemPrompt: `You are CodeCan AI, an expert assistant for building code questions.

This jurisdiction uses the National Building Code of Canada (NBC) only.

Always call the "file_search" tool before answering the first question in a thread. On follow-up questions in the same thread, you may answer from prior retrieved content without re-searching, but search again if the user's question shifts topic. Base your response only on retrieved content.

When available, quote specific Division, Part, Section, Article, Clause, or Sentence numbers.

Requirements:
1. Provide a clear, concise answer using only retrieved NBC content.
2. Return citations via OpenAI file_citation annotations.
3. Include at least one citation when answering.
4. Do not emit fenced citations blocks.
5. If no relevant content is retrieved, reply exactly: "${NO_RELEVANT_TEXT}".
6. Do not speculate.`,
    starters: [
      'What does the NBC require for guard heights on a residential balcony?',
      'NBC exit requirements for a small two-storey office?',
      'When is mechanical ventilation required under the NBC?',
    ],
    enabled: true,
  },
  // Provincial/territorial adoptions. Each entry's `enabled` flag is derived from whether its
  // primary vector store id is set — populate via env var or DEFAULT_*_VECTOR_STORE_ID above.
  'british-columbia': (() => {
    const primary = vsId('CODECAN_VS_BRITISH_COLUMBIA', DEFAULT_BRITISH_COLUMBIA_VECTOR_STORE_ID);
    return {
      id: 'british-columbia',
      displayName: 'British Columbia',
      shortLabel: 'BC Building Code',
      region: 'CA-BC',
      vectorStoreIds: [
        primary,
        vsId('CODECAN_VS_CANADA_FEDERAL', DEFAULT_NATIONAL_VECTOR_STORE_ID),
      ],
      systemPrompt: buildProvincialPrompt({
        codeName: 'British Columbia Building Code',
        codeAbbr: 'BCBC',
      }),
      starters: [
        'What does the BCBC require for guard heights in a single-family home?',
        'BCBC energy step code minimums for new houses?',
        'Are interconnected smoke alarms required under the BCBC?',
      ],
      enabled: Boolean(primary),
    };
  })(),
  alberta: (() => {
    const primary = vsId('CODECAN_VS_ALBERTA', DEFAULT_ALBERTA_VECTOR_STORE_ID);
    return {
      id: 'alberta',
      displayName: 'Alberta',
      shortLabel: 'Alberta Building Code',
      region: 'CA-AB',
      vectorStoreIds: [
        primary,
        vsId('CODECAN_VS_CANADA_FEDERAL', DEFAULT_NATIONAL_VECTOR_STORE_ID),
      ],
      systemPrompt: buildProvincialPrompt({
        codeName: 'National Building Code — 2023 Alberta Edition',
        codeAbbr: 'ABC',
      }),
      starters: [
        'What is the minimum stair width in an Alberta single dwelling?',
        'When is sprinklering required in an Alberta multi-residential building?',
        'Alberta requirements for secondary suites?',
      ],
      enabled: Boolean(primary),
    };
  })(),
  quebec: (() => {
    const primary = vsId('CODECAN_VS_QUEBEC', DEFAULT_QUEBEC_VECTOR_STORE_ID);
    return {
      id: 'quebec',
      displayName: 'Quebec',
      shortLabel: 'Code de construction du Québec',
      region: 'CA-QC',
      vectorStoreIds: [
        primary,
        vsId('CODECAN_VS_CANADA_FEDERAL', DEFAULT_NATIONAL_VECTOR_STORE_ID),
      ],
      systemPrompt: buildProvincialPrompt({
        codeName: 'Quebec Construction Code Chapter I — Building',
        codeAbbr: 'QCC',
      }),
      starters: [
        'What does the Quebec Construction Code require for residential exit stairs?',
        'Quebec rules for accessibility in new commercial buildings?',
        'When does the Quebec code require sprinklers in a multi-unit residential building?',
      ],
      enabled: Boolean(primary),
    };
  })(),
  manitoba: (() => {
    const primary = vsId('CODECAN_VS_MANITOBA', DEFAULT_MANITOBA_VECTOR_STORE_ID);
    return {
      id: 'manitoba',
      displayName: 'Manitoba',
      shortLabel: 'Manitoba Building Code',
      region: 'CA-MB',
      vectorStoreIds: [
        primary,
        vsId('CODECAN_VS_CANADA_FEDERAL', DEFAULT_NATIONAL_VECTOR_STORE_ID),
      ],
      systemPrompt: buildProvincialPrompt({
        codeName: 'Manitoba Building Code',
        codeAbbr: 'MBC',
      }),
      starters: [
        'What does the Manitoba Building Code require for basement egress windows?',
        'Manitoba amendments to the NBC for guards and handrails?',
        'When does the Manitoba code require a building permit?',
      ],
      enabled: Boolean(primary),
    };
  })(),
  saskatchewan: (() => {
    const primary = vsId('CODECAN_VS_SASKATCHEWAN', DEFAULT_SASKATCHEWAN_VECTOR_STORE_ID);
    return {
      id: 'saskatchewan',
      displayName: 'Saskatchewan',
      shortLabel: 'Saskatchewan Building Code',
      region: 'CA-SK',
      vectorStoreIds: [
        primary,
        vsId('CODECAN_VS_CANADA_FEDERAL', DEFAULT_NATIONAL_VECTOR_STORE_ID),
      ],
      systemPrompt: buildProvincialPrompt({
        codeName: 'Saskatchewan Construction Codes',
        codeAbbr: 'SBC',
      }),
      starters: [
        'Saskatchewan requirements for stair tread and riser dimensions?',
        'When are firewalls required under the Saskatchewan Building Code?',
        'Saskatchewan rules for radon mitigation in new construction?',
      ],
      enabled: Boolean(primary),
    };
  })(),
  'nova-scotia': (() => {
    const primary = vsId('CODECAN_VS_NOVA_SCOTIA', DEFAULT_NOVA_SCOTIA_VECTOR_STORE_ID);
    return {
      id: 'nova-scotia',
      displayName: 'Nova Scotia',
      shortLabel: 'Nova Scotia Building Code',
      region: 'CA-NS',
      vectorStoreIds: [
        primary,
        vsId('CODECAN_VS_CANADA_FEDERAL', DEFAULT_NATIONAL_VECTOR_STORE_ID),
      ],
      systemPrompt: buildProvincialPrompt({
        codeName: 'Nova Scotia Building Code Regulations',
        codeAbbr: 'NSBC',
      }),
      starters: [
        'Nova Scotia requirements for guard heights on residential decks?',
        'When does the Nova Scotia code require an architect or engineer?',
        'Nova Scotia rules for secondary suites in detached homes?',
      ],
      enabled: Boolean(primary),
    };
  })(),
  'prince-edward-island': (() => {
    const primary = vsId(
      'CODECAN_VS_PRINCE_EDWARD_ISLAND',
      DEFAULT_PRINCE_EDWARD_ISLAND_VECTOR_STORE_ID,
    );
    return {
      id: 'prince-edward-island',
      displayName: 'Prince Edward Island',
      shortLabel: 'PEI Building Code',
      region: 'CA-PE',
      vectorStoreIds: [
        primary,
        vsId('CODECAN_VS_CANADA_FEDERAL', DEFAULT_NATIONAL_VECTOR_STORE_ID),
      ],
      systemPrompt: buildProvincialPrompt({
        codeName: 'PEI Building Code Regulations',
        codeAbbr: 'PEIBC',
      }),
      starters: [
        'PEI requirements for minimum ceiling heights in dwellings?',
        'When does the PEI Building Code Act require a permit?',
        'PEI rules for accessory buildings under 10 m²?',
      ],
      enabled: Boolean(primary),
    };
  })(),
  newfoundland: (() => {
    const primary = vsId('CODECAN_VS_NEWFOUNDLAND', DEFAULT_NEWFOUNDLAND_VECTOR_STORE_ID);
    return {
      id: 'newfoundland',
      displayName: 'Newfoundland and Labrador',
      shortLabel: 'NL Building Code',
      region: 'CA-NL',
      vectorStoreIds: [
        primary,
        vsId('CODECAN_VS_CANADA_FEDERAL', DEFAULT_NATIONAL_VECTOR_STORE_ID),
      ],
      systemPrompt: buildProvincialPrompt({
        codeName: 'Newfoundland and Labrador Fire and Life Safety Guidance',
        codeAbbr: 'NL guidance',
        citationNote:
          'Note: the NL-specific corpus is fire/life-safety guidance only. For substantive technical requirements not addressed by the NL guidance, cite the NBC.',
      }),
      starters: [
        'NL fire and life safety requirements for assembly occupancies?',
        'Where the NL guidance is silent, what does the NBC require for guard heights?',
        'NL rules for emergency lighting in residential buildings?',
      ],
      enabled: Boolean(primary),
    };
  })(),
  yukon: (() => {
    const primary = vsId('CODECAN_VS_YUKON', DEFAULT_YUKON_VECTOR_STORE_ID);
    return {
      id: 'yukon',
      displayName: 'Yukon',
      shortLabel: 'Yukon Building Standards',
      region: 'CA-YT',
      vectorStoreIds: [
        primary,
        vsId('CODECAN_VS_CANADA_FEDERAL', DEFAULT_NATIONAL_VECTOR_STORE_ID),
      ],
      systemPrompt: buildProvincialPrompt({
        codeName: 'Yukon Building Standards Regulation',
        codeAbbr: 'YBS',
      }),
      starters: [
        'Yukon amendments to NBC Part 9.36 (energy efficiency)?',
        'When does the Yukon require a building permit?',
        'Yukon snow load requirements for residential roofs?',
      ],
      enabled: Boolean(primary),
    };
  })(),
  nunavut: (() => {
    const primary = vsId('CODECAN_VS_NUNAVUT', DEFAULT_NUNAVUT_VECTOR_STORE_ID);
    return {
      id: 'nunavut',
      displayName: 'Nunavut',
      shortLabel: 'Nunavut Building Code Regulations',
      region: 'CA-NU',
      vectorStoreIds: [
        primary,
        vsId('CODECAN_VS_CANADA_FEDERAL', DEFAULT_NATIONAL_VECTOR_STORE_ID),
      ],
      systemPrompt: buildProvincialPrompt({
        codeName: 'Nunavut Building Code Regulations',
        codeAbbr: 'NBCR',
      }),
      starters: [
        'Nunavut foundation requirements for permafrost conditions?',
        'When does the Nunavut Building Code require a permit?',
        'Nunavut rules for fire safety in remote-community buildings?',
      ],
      enabled: Boolean(primary),
    };
  })(),
});

const DEFAULT_JURISDICTION_ID = process.env.CODECAN_DEFAULT_JURISDICTION || 'canada-federal';

/**
 * Resolve a jurisdiction id to its registry entry. Falls back to the default jurisdiction when the
 * id is unknown, disabled, or empty.
 */
function getJurisdiction(id) {
  const entry = id ? JURISDICTIONS[id] : null;
  if (entry && entry.enabled !== false) {
    return entry;
  }
  return JURISDICTIONS[DEFAULT_JURISDICTION_ID] || JURISDICTIONS.ontario;
}

function listJurisdictions() {
  return Object.values(JURISDICTIONS)
    .filter((j) => j.enabled !== false)
    .map((j) => ({
      id: j.id,
      displayName: j.displayName,
      shortLabel: j.shortLabel,
      region: j.region,
      starters: j.starters,
    }));
}

// ── Legacy helpers (kept for backwards compatibility with existing imports) ───────────────────

function getCodeCanVectorStoreConfig() {
  return {
    ontarioId: vsId('CODECAN_OPENAI_ONTARIO_VECTOR_STORE_ID', DEFAULT_ONTARIO_VECTOR_STORE_ID),
    nationalId: vsId('CODECAN_OPENAI_NATIONAL_VECTOR_STORE_ID', DEFAULT_NATIONAL_VECTOR_STORE_ID),
  };
}

function getCodeCanVectorStoreIds(stage = 'ontario') {
  // Map legacy `stage` arg ('ontario'|'national') onto the registry.
  const id = stage === 'national' ? 'canada-federal' : 'ontario';
  return getJurisdiction(id).vectorStoreIds;
}

function buildCodeCanSystemPrompt(stage = 'ontario') {
  const id = stage === 'national' ? 'canada-federal' : 'ontario';
  return getJurisdiction(id).systemPrompt;
}

function getCodeCanModel() {
  return CODECAN_MODEL;
}

function getCodeCanFileId() {
  return process.env.CODECAN_OPENAI_FILE_ID || DEFAULT_ON_STORAGE_FILE_ID;
}

module.exports = {
  // Registry API
  JURISDICTIONS,
  DEFAULT_JURISDICTION_ID,
  DEFAULT_MAX_NUM_RESULTS,
  DEFAULT_REASONING_EFFORT,
  DEFAULT_VERBOSITY,
  NO_RELEVANT_TEXT,
  getJurisdiction,
  listJurisdictions,
  // Legacy compatibility
  DEFAULT_ONTARIO_VECTOR_STORE_ID,
  DEFAULT_NATIONAL_VECTOR_STORE_ID,
  NO_RELEVANT_ONTARIO_TEXT,
  NO_RELEVANT_NATIONAL_TEXT,
  getCodeCanModel,
  getCodeCanVectorStoreConfig,
  getCodeCanVectorStoreIds,
  buildCodeCanSystemPrompt,
  getCodeCanFileId,
};
