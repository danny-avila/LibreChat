const { zodToJsonSchema } = require('zod-to-json-schema');
const { PromptTemplate } = require('@langchain/core/prompts');
const { JsonKeyOutputFunctionsParser } = require('langchain/output_parsers');
const { LLMChain } = require('langchain/chains');
function getExtractionFunctions(schema) {
  return [
    {
      name: 'information_extraction',
      description: 'Extracts the relevant information from the passage.',
      parameters: {
        type: 'object',
        properties: {
          info: {
            type: 'array',
            items: {
              type: schema.type,
              properties: schema.properties,
              required: schema.required,
            },
          },
        },
        required: ['info'],
      },
    },
  ];
}
const _EXTRACTION_TEMPLATE = `Extract and save the relevant entities mentioned in the following passage together with their properties.

Passage:
{input}
`;
function createExtractionChain(schema, llm, options = {}) {
  const { prompt = PromptTemplate.fromTemplate(_EXTRACTION_TEMPLATE), ...rest } = options;
  const functions = getExtractionFunctions(schema);
  const outputParser = new JsonKeyOutputFunctionsParser({ attrName: 'info' });
  return new LLMChain({
    llm,
    prompt,
    llmKwargs: { functions },
    outputParser,
    tags: ['openai_functions', 'extraction'],
    ...rest,
  });
}
function createExtractionChainFromZod(schema, llm) {
  return createExtractionChain(zodToJsonSchema(schema), llm);
}

module.exports = {
  createExtractionChain,
  createExtractionChainFromZod,
};
