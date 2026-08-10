import createPayload from '../src/createPayload';
import { EndpointURLs } from '../src/config';
import { EModelEndpoint } from '../src/schemas';
import type { TSubmission } from '../src/types';

/**
 * Behavior 3.4 — URL and body endpoint identity is exact.
 *
 * A custom endpoint name is admin-chosen free text, so the URL segment must be
 * escaped exactly once. Express decodes `req.params.endpoint` on the way in; a
 * second decode there — or a missing encode here — would silently accept a
 * different endpoint than the one the user selected.
 */

const submissionFor = (endpoint: string, endpointType?: EModelEndpoint) =>
  ({
    conversation: { conversationId: 'convo-1', endpoint, title: 'test' },
    userMessage: { text: 'hello' },
    endpointOption: { endpoint, endpointType, model: 'OpenRouter' },
  }) as unknown as TSubmission;

const agentsBase = EndpointURLs[EModelEndpoint.agents];

describe('createPayload endpoint segment encoding', () => {
  it('encodes a name that needs escaping exactly once', () => {
    const endpoint = 'Team BAML+[v1]';
    const { server } = createPayload(submissionFor(endpoint));

    expect(server).toBe(`${agentsBase}/${encodeURIComponent(endpoint)}`);
    expect(server).toBe(`${agentsBase}/Team%20BAML%2B%5Bv1%5D`);
    expect(decodeURIComponent(server.slice(agentsBase.length + 1))).toBe(endpoint);
  });

  it('round-trips every published name back to its exact identity', () => {
    for (const endpoint of ['Team-BAML', 'Skunkworks [v2]', 'Team BAML+[v1]', 'ünïcode']) {
      const { server } = createPayload(submissionFor(endpoint));
      const segment = server.slice(agentsBase.length + 1);

      expect(segment).toBe(encodeURIComponent(endpoint));
      expect(decodeURIComponent(segment)).toBe(endpoint);
    }
  });

  it('leaves an already-safe name byte-identical', () => {
    const { server } = createPayload(submissionFor('Team-BAML'));

    expect(server).toBe(`${agentsBase}/Team-BAML`);
  });

  it('carries the endpoint through the payload body unencoded', () => {
    const endpoint = 'Team BAML+[v1]';
    const { payload } = createPayload(submissionFor(endpoint));

    expect(payload.endpoint).toBe(endpoint);
  });

  it('leaves the assistants route untouched', () => {
    const { server } = createPayload(
      submissionFor(EModelEndpoint.assistants, EModelEndpoint.assistants),
    );

    expect(server).toBe(EndpointURLs[EModelEndpoint.assistants]);
  });
});
