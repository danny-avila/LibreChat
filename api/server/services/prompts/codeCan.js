const DEFAULT_ON_STORAGE_FILE_ID = 'file-CTN168WfihPUgthrxvCQsy';
const CODECAN_MODEL = process.env.CODECAN_OPENAI_MODEL || 'gpt-5-mini';

const DEFAULT_ONTARIO_VECTOR_STORE_ID = 'vs_698b51aa511081919a033eff64f38c97';
const DEFAULT_NATIONAL_VECTOR_STORE_ID = 'vs_693860848bc48191bccb7c1d197f488f';

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
  // Stubs — enable once vector stores exist.
  'british-columbia': {
    id: 'british-columbia',
    displayName: 'British Columbia',
    shortLabel: 'BC Building Code',
    region: 'CA-BC',
    vectorStoreIds: [
      vsId('CODECAN_VS_BRITISH_COLUMBIA', ''),
      vsId('CODECAN_VS_CANADA_FEDERAL', DEFAULT_NATIONAL_VECTOR_STORE_ID),
    ],
    systemPrompt: '',
    starters: [],
    enabled: false,
  },
  alberta: {
    id: 'alberta',
    displayName: 'Alberta',
    shortLabel: 'Alberta Building Code',
    region: 'CA-AB',
    vectorStoreIds: [
      vsId('CODECAN_VS_ALBERTA', ''),
      vsId('CODECAN_VS_CANADA_FEDERAL', DEFAULT_NATIONAL_VECTOR_STORE_ID),
    ],
    systemPrompt: '',
    starters: [],
    enabled: false,
  },
  quebec: {
    id: 'quebec',
    displayName: 'Quebec',
    shortLabel: 'Code de construction du Québec',
    region: 'CA-QC',
    vectorStoreIds: [
      vsId('CODECAN_VS_QUEBEC', ''),
      vsId('CODECAN_VS_CANADA_FEDERAL', DEFAULT_NATIONAL_VECTOR_STORE_ID),
    ],
    systemPrompt: '',
    starters: [],
    enabled: false,
  },
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
