import type { TurnFileConsumers, TurnDeliveryFile } from 'librechat-data-provider';
import {
  applyTurnDelivery as materializeTurnDelivery,
  resolveTurnDeliveryRouting,
} from './delivery';

function applyTurnDelivery<T extends TurnDeliveryFile>(
  files: T[],
  {
    agent,
    config,
    consumers,
  }: {
    agent?: Parameters<typeof resolveTurnDeliveryRouting>[0]['agent'];
    config?: Parameters<typeof resolveTurnDeliveryRouting>[0]['config'];
    consumers?: TurnFileConsumers;
  },
) {
  return materializeTurnDelivery(files, {
    routing: agent ? resolveTurnDeliveryRouting({ agent, config }) : undefined,
    consumers,
  });
}

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

describe('resolveTurnDeliveryRouting', () => {
  it('routes under the endpoint an agent names before its provider', () => {
    expect(resolveTurnDeliveryRouting({ agent: { provider: 'openAI' }, config }).endpoint).toBe(
      'openAI',
    );
    expect(
      resolveTurnDeliveryRouting({
        agent: { provider: 'openAI', endpoint: 'Azure Foundry' },
        config,
      }).endpoint,
    ).toBe('Azure Foundry');
  });

  it('reads a custom endpoint dialect as upload does, before and after the provider swap', () => {
    /* Initialization first stores the endpoint name in both fields and only later replaces the
     * provider with the backing client, so the dialect has to come from config either way. */
    const declared = {
      ...config,
      endpoints: {
        custom: [{ name: 'MyClaude', provider: 'anthropic' }],
      },
    } as Parameters<typeof resolveTurnDeliveryRouting>[0]['config'];
    const dialect = (agent: { provider: string; endpoint?: string }, routingConfig = declared) =>
      resolveTurnDeliveryRouting({ agent, config: routingConfig }).endpointProvider;

    expect(dialect({ provider: 'MyClaude', endpoint: 'MyClaude' })).toBe('anthropic');
    expect(dialect({ provider: 'anthropic', endpoint: 'MyClaude' })).toBe('anthropic');
    expect(dialect({ provider: 'MyGateway', endpoint: 'MyGateway' }, config)).toBeUndefined();
    expect(dialect({ provider: 'openAI', endpoint: 'MyGateway' }, config)).toBeUndefined();
  });

  it('carries the agent Responses API choice into routing', () => {
    expect(
      resolveTurnDeliveryRouting({
        agent: { provider: 'openAI', model_parameters: { useResponsesApi: true } },
        config,
      }).useResponsesApi,
    ).toBe(true);
  });
});

describe('applyTurnDelivery', () => {
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
    const result = applyTurnDelivery([csv, pdf], { agent, config, consumers: noReader });

    expect(result[0]).toEqual({ ...csv, llmDeliveryPath: 'text' });
    expect(result[0]).not.toBe(csv);
    expect(result[1]).toBe(pdf);
    expect(csv.llmDeliveryPath).toBe('none');
  });

  it('returns the same array when a tool this turn runs can read every file', () => {
    const files = [csv, pdf];

    expect(applyTurnDelivery(files, { agent, config, consumers: runsCode })).toBe(files);
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

    expect(applyTurnDelivery(files, { agent, config: disabled, consumers: noReader })).toBe(files);
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
      applyTurnDelivery(files, {
        agent: { provider: 'openAI', endpoint: 'MyGateway' },
        config: customOnly,
        consumers: noReader,
      }),
    ).toEqual([{ ...csv, llmDeliveryPath: 'text' }]);
  });

  it('marks a stored tool-routed file the endpoint now routes to text, with the fallback off', () => {
    /* Only this mark lets the admission checks and `extractFileContext`, which read the stored
     * route, see the text the resolver now delivers. */
    const rerouted = {
      fileConfig: {
        endpoints: {
          openAI: { defaultLLMDeliveryPath: { overrides: { 'text/csv': 'text' as const } } },
        },
      },
    };

    expect(applyTurnDelivery([csv], { agent, config: rerouted, consumers: runsCode })).toEqual([
      { ...csv, llmDeliveryPath: 'text' },
    ]);
    expect(applyTurnDelivery([csv], { agent, config: rerouted })).toEqual([
      { ...csv, llmDeliveryPath: 'text' },
    ]);
  });

  it('falls back only for a turn whose tools are known', () => {
    const files = [csv];

    expect(applyTurnDelivery(files, { agent, config })).toBe(files);
  });

  it('marks nothing without an agent to route by', () => {
    const files = [csv];

    expect(applyTurnDelivery(files, { config, consumers: noReader })).toBe(files);
  });

  it('leaves a record predating routing to its legacy handling', () => {
    const files = [{ file_id: 'legacy', type: 'text/csv', text: 'region,total' }];

    expect(applyTurnDelivery(files, { agent, config, consumers: noReader })).toBe(files);
  });

  it('does not mark a tool-routed file that stored no text', () => {
    const files = [{ ...csv, text: undefined }];

    expect(applyTurnDelivery(files, { agent, config, consumers: noReader })).toBe(files);
  });

  it('gives a stored tool-routed file the provider route this turn sends it by', () => {
    /* Admission would otherwise skip a record the client then encodes for the provider. */
    const image = {
      file_id: 'image',
      type: 'image/png',
      llmDeliveryPath: 'none',
      metadata: { destinationChosen: false },
    };

    expect(applyTurnDelivery([image], { agent, config, consumers: noReader })).toEqual([
      { ...image, llmDeliveryPath: 'provider' },
    ]);
  });

  it('removes a record this turn leaves to tools from model admission', () => {
    /* Over-admitting cannot pass a limit; dropping a record the client still sends would. */
    const files = [{ ...csv, llmDeliveryPath: 'text' }];

    expect(applyTurnDelivery(files, { agent, config, consumers: runsCode })).toEqual([
      { ...csv, llmDeliveryPath: 'none' },
    ]);
  });

  it('materializes a final text route even without stored text', () => {
    const files = [{ ...pdf, metadata: { destinationChosen: false } }];
    const pdfToText = {
      fileConfig: {
        endpoints: {
          openAI: { defaultLLMDeliveryPath: { overrides: { 'application/pdf': 'text' as const } } },
        },
      },
    };

    expect(applyTurnDelivery(files, { agent, config: pdfToText, consumers: noReader })).toEqual(
      files.map((file) => ({ ...file, llmDeliveryPath: 'text' })),
    );
  });

  it('does not mark a destination the user chose', () => {
    const files = [{ ...csv, metadata: { destinationChosen: true } }];

    expect(applyTurnDelivery(files, { agent, config, consumers: noReader })).toBe(files);
  });
});
