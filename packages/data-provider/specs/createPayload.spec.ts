import type { TSubmission } from '../src/types';
import { EModelEndpoint } from '../src/schemas';
import { EndpointURLs } from '../src/config';
import createPayload from '../src/createPayload';

const agentsChatRoot = EndpointURLs[EModelEndpoint.agents];

const makeSubmission = (endpoint: string): TSubmission =>
  ({
    conversation: { conversationId: 'convo-1', endpoint },
    userMessage: { text: 'hello' },
    endpointOption: { endpoint },
  }) as unknown as TSubmission;

describe('createPayload server URL', () => {
  it('builds the chat URL from a plain custom endpoint name', () => {
    const { server } = createPayload(makeSubmission('OpenRouter'));

    expect(server).toBe(`${agentsChatRoot}/OpenRouter`);
  });

  it('percent-encodes a slash so the name stays a single path segment', () => {
    /** A raw `/` would split into an extra path segment and miss the server's
     * `/:endpoint` route, which answers with a generic 404 "Endpoint not found"
     * (danny-avila/LibreChat#15270). */
    const { server } = createPayload(makeSubmission('Company/API'));

    expect(server).toBe(`${agentsChatRoot}/Company%2FAPI`);
    expect(server.slice(agentsChatRoot.length + 1)).not.toContain('/');
  });

  it('round-trips the encoded name back to the configured value', () => {
    const { server } = createPayload(makeSubmission('Company/API'));

    expect(decodeURIComponent(server.slice(agentsChatRoot.length + 1))).toBe('Company/API');
  });

  it('encodes other characters that are unsafe in a path segment', () => {
    const { server } = createPayload(makeSubmission('Team A?v=1#x'));

    expect(server).toBe(`${agentsChatRoot}/Team%20A%3Fv%3D1%23x`);
  });

  it('leaves the endpoint name itself untouched in the payload body', () => {
    const { payload } = createPayload(makeSubmission('Company/API'));

    expect(payload.endpoint).toBe('Company/API');
  });

  it('does not touch the assistants URL, which carries no endpoint segment', () => {
    const { server } = createPayload(makeSubmission(EModelEndpoint.assistants));

    expect(server).toBe(EndpointURLs[EModelEndpoint.assistants]);
  });
});
