import type { TurnFileConsumers } from 'librechat-data-provider';
import { applyTurnTextFallback, resolveAgentDeliveryRouting } from './delivery';

const config = {
  fileConfig: {
    endpoints: {
      openAI: {
        defaultLLMDeliveryPath: { overrides: { 'text/csv': 'none' as const } },
        textFallbackWithoutTools: true,
      },
    },
  },
};
const noReader: TurnFileConsumers = { executeCode: false, fileSearch: false };
const runsCode: TurnFileConsumers = { executeCode: true, fileSearch: false };

describe('resolveAgentDeliveryRouting', () => {
  it('routes under the endpoint an agent names before its provider', () => {
    expect(resolveAgentDeliveryRouting({ agent: { provider: 'openAI' }, config }).endpoint).toBe(
      'openAI',
    );
    expect(
      resolveAgentDeliveryRouting({
        agent: { provider: 'openAI', endpoint: 'Azure Foundry' },
        config,
      }).endpoint,
    ).toBe('Azure Foundry');
  });

  it('routes custom endpoint media by the provider the agent runs as', () => {
    expect(
      resolveAgentDeliveryRouting({
        agent: { provider: 'anthropic', endpoint: 'MyClaude' },
        config,
      }).endpointProvider,
    ).toBe('anthropic');
  });

  it('carries the agent Responses API choice into routing', () => {
    expect(
      resolveAgentDeliveryRouting({
        agent: { provider: 'openAI', model_parameters: { useResponsesApi: true } },
        config,
      }).useResponsesApi,
    ).toBe(true);
  });
});

describe('applyTurnTextFallback', () => {
  const agent = { provider: 'openAI' };
  const csv = {
    file_id: 'csv',
    type: 'text/csv',
    text: 'region,total\nwest,4',
    llmDeliveryPath: 'none',
    metadata: { destinationChosen: false },
  };
  const pdf = { file_id: 'pdf', type: 'application/pdf', llmDeliveryPath: 'provider' };

  it('marks a copy of each file this turn delivers as text, leaving the rest untouched', () => {
    const result = applyTurnTextFallback([csv, pdf], { agent, config, consumers: noReader });

    expect(result[0]).toEqual({ ...csv, llmDeliveryPath: 'text' });
    expect(result[0]).not.toBe(csv);
    expect(result[1]).toBe(pdf);
    expect(csv.llmDeliveryPath).toBe('none');
  });

  it('returns the same array when a tool this turn runs can read every file', () => {
    const files = [csv, pdf];

    expect(applyTurnTextFallback(files, { agent, config, consumers: runsCode })).toBe(files);
  });

  it('marks nothing where the endpoint has not enabled the fallback', () => {
    const files = [csv];
    const disabled = {
      fileConfig: {
        endpoints: {
          openAI: { defaultLLMDeliveryPath: { overrides: { 'text/csv': 'none' as const } } },
        },
      },
    };

    expect(applyTurnTextFallback(files, { agent, config: disabled, consumers: noReader })).toBe(
      files,
    );
  });

  it('reads the opt-in under the custom endpoint an initialized agent names', () => {
    /* After initialization the provider is the backing client and the endpoint keeps the name
     * the upload resolved, so a setting made only on that endpoint still applies. */
    const files = [csv];
    const customOnly = {
      fileConfig: {
        endpoints: {
          MyGateway: {
            defaultLLMDeliveryPath: { overrides: { 'text/csv': 'none' as const } },
            textFallbackWithoutTools: true,
          },
        },
      },
    };

    expect(
      applyTurnTextFallback(files, {
        agent: { provider: 'openAI', endpoint: 'MyGateway' },
        config: customOnly,
        consumers: noReader,
      }),
    ).toEqual([{ ...csv, llmDeliveryPath: 'text' }]);
  });

  it('marks nothing when the agent or the tools it runs are unknown', () => {
    const files = [csv];

    expect(applyTurnTextFallback(files, { config, consumers: noReader })).toBe(files);
    expect(applyTurnTextFallback(files, { agent, config })).toBe(files);
  });

  it('does not mark a tool-routed file that stored no text', () => {
    const files = [{ ...csv, text: undefined }];

    expect(applyTurnTextFallback(files, { agent, config, consumers: noReader })).toBe(files);
  });

  it('does not mark a destination the user chose', () => {
    const files = [{ ...csv, metadata: { destinationChosen: true } }];

    expect(applyTurnTextFallback(files, { agent, config, consumers: noReader })).toBe(files);
  });
});
