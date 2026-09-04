import { EModelEndpoint } from '../src/schemas';
import { defaultModels } from '../src/config';

/**
 * GPT-6 Astra serves tool calls only from the Responses API. The Assistants
 * endpoints do not route through `getOpenAILLMConfig`, so listing it there
 * would offer a configuration the provider rejects.
 */
describe('GPT-6 Astra catalog placement', () => {
  it('is offered on the endpoints that route through the OpenAI config', () => {
    expect(defaultModels[EModelEndpoint.openAI]).toContain('gpt-6-astra');
    expect(defaultModels[EModelEndpoint.agents]).toContain('gpt-6-astra');
  });

  it('is kept out of both Assistants catalogs', () => {
    expect(defaultModels[EModelEndpoint.assistants]).not.toContain('gpt-6-astra');
    expect(defaultModels[EModelEndpoint.azureAssistants]).not.toContain('gpt-6-astra');
  });

  it('does not disturb the rest of the shared OpenAI catalog', () => {
    for (const endpoint of [
      EModelEndpoint.openAI,
      EModelEndpoint.agents,
      EModelEndpoint.assistants,
      EModelEndpoint.azureAssistants,
    ]) {
      expect(defaultModels[endpoint]).toContain('gpt-5.6');
    }
  });
});
