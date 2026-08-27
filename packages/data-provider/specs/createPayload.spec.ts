import createPayload from '../src/createPayload';
import { EndpointURLs } from '../src/config';
import { EModelEndpoint } from '../src/schemas';
import type * as t from '../src/types';

const makeSubmission = (endpoint: string): t.TSubmission =>
  ({
    conversation: { conversationId: 'conv-1', endpoint },
    userMessage: {
      messageId: 'user-msg-1',
      text: 'Hello',
      sender: 'User',
      isCreatedByUser: true,
    },
    endpointOption: {
      endpoint,
      endpointType: undefined,
    },
  }) as unknown as t.TSubmission;

describe('createPayload', () => {
  describe('server URL resolution', () => {
    it('encodes custom endpoints whose names contain slashes into a single route segment', () => {
      const { server, payload } = createPayload(makeSubmission('Company/API'));

      expect(server).toBe(
        `${EndpointURLs[EModelEndpoint.agents]}/${encodeURIComponent('Company/API')}`,
      );
      expect(server).toBe('/api/agents/chat/Company%2FAPI');
      expect(payload.endpoint).toBe('Company/API');
    });

    it('preserves ordinary custom endpoint names unchanged', () => {
      const { server, payload } = createPayload(makeSubmission('CompanyAPI'));

      expect(server).toBe('/api/agents/chat/CompanyAPI');
      expect(payload.endpoint).toBe('CompanyAPI');
    });
  });
});
