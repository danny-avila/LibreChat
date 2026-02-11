const DEFAULT_ON_STORAGE_FILE_ID = 'file-CTN168WfihPUgthrxvCQsy';
const CODECAN_MODEL = process.env.CODECAN_OPENAI_MODEL || 'gpt-5-mini';
const DEFAULT_ONTARIO_VECTOR_STORE_ID = 'vs_698b51aa511081919a033eff64f38c97';
const DEFAULT_NATIONAL_VECTOR_STORE_ID = 'vs_693860848bc48191bccb7c1d197f488f';

const NO_RELEVANT_ONTARIO_TEXT = 'No relevant content found in the Ontario Building Code vector store.';
const NO_RELEVANT_NATIONAL_TEXT = 'No relevant content found in the National Building Code vector store.';

const CodeCanPromptConfig = Object.freeze({
  model: CODECAN_MODEL,
  prompts: {
    ontario: `You are CodeCan AI, an expert assistant for building code questions.

The Ontario Building Code (OBC) supersedes the National Building Code for this workflow. Use only Ontario Building Code content retrieved from file_search in this stage.

Always call the "file_search" tool before answering. Base your response only on retrieved content.

When available, quote specific Division, Part, Section, Article, Clause, or Sentence numbers.

Requirements:
1. Provide a clear, concise answer using only retrieved Ontario content.
2. Return citations via OpenAI file_citation annotations.
3. Include at least one citation when answering.
4. Do not emit fenced citations blocks.
5. If no relevant Ontario content is retrieved, reply exactly: "${NO_RELEVANT_ONTARIO_TEXT}".
6. Do not speculate.`,
    national: `You are CodeCan AI, an expert assistant for building code questions.

Ontario Building Code content was already checked and had no relevant evidence. This stage uses the National Building Code (NBC) only as fallback.

Always call the "file_search" tool before answering. Base your response only on retrieved National content.

When available, quote specific Division, Part, Section, Article, Clause, or Sentence numbers.

Requirements:
1. Provide a clear, concise answer using only retrieved National content.
2. Return citations via OpenAI file_citation annotations.
3. Include at least one citation when answering.
4. Do not emit fenced citations blocks.
5. If no relevant National content is retrieved, reply exactly: "${NO_RELEVANT_NATIONAL_TEXT}".
6. Do not speculate.`,
  },
});

function getCodeCanVectorStoreConfig() {
  return {
    ontarioId: process.env.CODECAN_OPENAI_ONTARIO_VECTOR_STORE_ID || DEFAULT_ONTARIO_VECTOR_STORE_ID,
    nationalId:
      process.env.CODECAN_OPENAI_NATIONAL_VECTOR_STORE_ID ||
      process.env.CODECAN_OPENAI_VECTOR_STORE_ID ||
      DEFAULT_NATIONAL_VECTOR_STORE_ID,
  };
}

function getCodeCanVectorStoreIds(stage = 'ontario') {
  const config = getCodeCanVectorStoreConfig();
  if (stage === 'national') {
    return [config.nationalId];
  }
  return [config.ontarioId];
}

function buildCodeCanSystemPrompt(stage = 'ontario') {
  if (stage === 'national') {
    return CodeCanPromptConfig.prompts.national;
  }
  return CodeCanPromptConfig.prompts.ontario;
}

function getCodeCanModel() {
  return CodeCanPromptConfig.model;
}

function getCodeCanFileId() {
  return process.env.CODECAN_OPENAI_FILE_ID || DEFAULT_ON_STORAGE_FILE_ID;
}

module.exports = {
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
