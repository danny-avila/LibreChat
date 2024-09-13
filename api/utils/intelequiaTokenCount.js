const { getEncoding } = require('js-tiktoken');

function getModelTokenEncoder(model) {
  const o200k_base = [
    'gpt-4o',
    'gpt-4o-mini',
  ];
  const cl100k_base = [
    'gpt-4',
    'gpt4',
    'gpt-3.5-turbo',
    'gpt-3.5',
    'gpt-35-turbo',
    'davinci-002',
    'babbage-002',
    'text-embedding-ada-002',
    'text-embedding-3-small',
    'text-embedding-3-large',
  ];
  const p50k_base = [
    'text-davinci-003',
    'text-davinci-002',
    'code-davinci-002',
    'code-davinci-001',
    'code-cushman-002',
    'code-cushman-001',
    'davinci-codex',
    'cushman-codex',
    'text-davinci-edit-001',
    'code-davinci-edit-001',
  ];
  const r50k_base = [
    'text-davinci-001',
    'text-curie-001',
    'text-babbage-001',
    'text-ada-001',
    'davinci',
    'curie',
    'babbage',
    'ada',
    'text-similarity-davinci-001',
    'text-similarity-curie-001',
    'text-similarity-babbage-001',
    'text-similarity-ada-001',
    'text-search-davinci-doc-001',
    'text-search-curie-doc-001',
    'text-search-babbage-doc-001',
    'text-search-ada-doc-001',
    'code-search-babbage-code-001',
    'code-search-ada-code-001',
  ];

  switch (true) {
    case o200k_base.includes(model):
      return 'o200k_base';
    case cl100k_base.includes(model):
      return 'cl100k_base';
    case p50k_base.includes(model):
      return 'p50k_base';
    case r50k_base.includes(model):
      return 'r50k_base';
    default:
      return 'model not found in supported model list';
  }
}

function intelequiaCountTokens(messages = [""], modelName = 'gpt-3.5-turbo') {
  let modelEncoder = getModelTokenEncoder(modelName);
  let enc = getEncoding(modelEncoder);
  let completionMessage = messages[messages.length - 1] 
  let completionArray = enc.encode(completionMessage);
  let completion = completionArray.length;
  let prompt = 0;

  for (let message of messages) {
    const count = enc.encode(message).length;
    prompt += count;
  }
  
  return {completion: completion, prompt: prompt};
}

module.exports = intelequiaCountTokens;
