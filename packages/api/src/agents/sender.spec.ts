import { EModelEndpoint, getResponseSender, encodeEphemeralAgentId } from 'librechat-data-provider';
import type { TEndpointOption } from 'librechat-data-provider';
import { resolveSender } from './sender';

/** Custom endpoints carry their configured name (e.g. "Together AI") in
 *  `endpoint` at runtime, which `TEndpointOption` types as `EModelEndpoint`. */
const customOption = (model: string): Partial<TEndpointOption> => ({
  endpoint: 'Together AI' as EModelEndpoint,
  endpointType: EModelEndpoint.custom,
  model,
});

describe('resolveSender', () => {
  test('prefers a real agent name over everything else', () => {
    expect(
      resolveSender({
        agent: { id: 'agent_abc123', name: 'My Agent' },
        endpointOption: { endpoint: EModelEndpoint.anthropic },
      }),
    ).toBe('My Agent');
  });

  test('returns an empty-string name as-is, preserving legacy `??` semantics', () => {
    expect(
      resolveSender({
        agent: { id: 'agent_abc123', name: '' },
        endpointOption: { endpoint: EModelEndpoint.anthropic },
      }),
    ).toBe('');
  });

  test('falls back to getResponseSender for a nameless real agent', () => {
    expect(
      resolveSender({
        agent: { id: 'agent_abc123', name: null },
        endpointOption: { endpoint: EModelEndpoint.agents },
      }),
    ).toBe('');
  });

  test('decodes the sender encoded in an ephemeral agent id', () => {
    const id = encodeEphemeralAgentId({
      endpoint: 'Together AI',
      model: 'Qwen/Qwen2.5-72B-Instruct',
      sender: 'Spec Label',
    });
    expect(
      resolveSender({
        agent: { id },
        endpointOption: customOption('Qwen/Qwen2.5-72B-Instruct'),
      }),
    ).toBe('Spec Label');
  });

  test('decodes the sender from an added-agent id with an index suffix', () => {
    const id = encodeEphemeralAgentId({
      endpoint: 'Together AI',
      model: 'mistralai/Mixtral-8x7B-Instruct-v0.1',
      sender: 'Together',
      index: 1,
    });
    expect(
      resolveSender({
        agent: { id },
        endpointOption: customOption('mistralai/Mixtral-8x7B-Instruct-v0.1'),
      }),
    ).toBe('Together');
  });

  test('keeps the family heuristic for a label-less custom endpoint', () => {
    const id = encodeEphemeralAgentId({
      endpoint: 'Together AI',
      model: 'mistralai/Mixtral-8x7B-Instruct-v0.1',
    });
    expect(
      resolveSender({
        agent: { id },
        endpointOption: customOption('mistralai/Mixtral-8x7B-Instruct-v0.1'),
      }),
    ).toBe('Mistral');
  });

  test('keeps the model-derived name for a label-less anthropic agent', () => {
    const id = encodeEphemeralAgentId({
      endpoint: EModelEndpoint.anthropic,
      model: 'claude-sonnet-5',
    });
    expect(
      resolveSender({
        agent: { id },
        endpointOption: { endpoint: EModelEndpoint.anthropic, model: 'claude-sonnet-5' },
      }),
    ).toBe('Claude');
  });

  test('matches getResponseSender exactly for an unknown label-less custom model', () => {
    const id = encodeEphemeralAgentId({
      endpoint: 'Together AI',
      model: 'some-unknown-model',
    });
    const endpointOption = customOption('some-unknown-model');
    expect(resolveSender({ agent: { id }, endpointOption })).toBe(
      getResponseSender(endpointOption),
    );
  });
});
