import type { Request, Response } from 'express';
import type { PiiRouteAgent } from './routing';
import { setPiiRoutingDecision } from './context';
import { applyPiiSendAsIsRoute } from './routing';

const makeAgent = (): PiiRouteAgent => ({
  endpoint: 'Presidio-Crusoe',
  agent_ids: [],
  subagentAgentConfigs: [],
  toolDefinitions: [],
  tools: [],
  attachments: [],
  requestAttachments: [],
  agentContextAttachments: [],
  memoryToolsRegistered: false,
  skillCount: 0,
  manualSkillPrimes: [],
  alwaysApplySkillPrimes: [],
  model_parameters: {
    apiKey: 'protected-key',
    configuration: { baseURL: 'http://presidio-gateway:4000/v1' },
  },
});

describe('PII send-as-is routing', () => {
  const makeRequest = (body: Record<string, unknown> = {}): Request =>
    ({ body, path: '/', route: { path: '/:endpoint' } }) as Request;

  beforeEach(() => {
    process.env.PII_SEND_AS_IS_BASE_URL = 'http://send-as-is-gateway:4001/v1';
    process.env.PII_SEND_AS_IS_API_KEY = 'internal-key';
    process.env.PII_SEND_AS_IS_ENDPOINT = 'Presidio-Crusoe';
  });

  afterEach(() => {
    delete process.env.PII_SEND_AS_IS_BASE_URL;
    delete process.env.PII_SEND_AS_IS_API_KEY;
    delete process.env.PII_SEND_AS_IS_ENDPOINT;
  });

  it('does not change routing without a trusted server decision', () => {
    const res = {} as Response;
    const primaryConfig = makeAgent();

    applyPiiSendAsIsRoute({
      req: makeRequest(),
      res,
      primaryConfig,
      connectedAgentCount: 0,
    });

    expect(primaryConfig.model_parameters).toEqual({
      apiKey: 'protected-key',
      configuration: { baseURL: 'http://presidio-gateway:4000/v1' },
    });
  });

  it('applies the internal route after a trusted decision', () => {
    const res = {} as Response;
    const primaryConfig = makeAgent();
    setPiiRoutingDecision(res, { action: 'send_as_is' });

    applyPiiSendAsIsRoute({
      req: makeRequest(),
      res,
      primaryConfig,
      connectedAgentCount: 0,
    });

    expect(primaryConfig.model_parameters).toEqual({
      apiKey: 'internal-key',
      configuration: { baseURL: 'http://send-as-is-gateway:4001/v1' },
    });
  });

  const unsupportedCases: Array<[string, Partial<PiiRouteAgent>, number?]> = [
    ['tools', { toolDefinitions: [{ name: 'calculator' }] }],
    ['files', { requestAttachments: [{ id: 'file-1' }] }],
    ['compatibility attachments', { attachments: [{ id: 'file-2' }] }],
    ['agent context attachments', { agentContextAttachments: [{ id: 'file-3' }] }],
    ['connected agents', {}, 1],
  ];

  it.each(unsupportedCases)(
    'rejects an authorized %s path',
    (_label: string, overrides, connectedAgentCount = 0) => {
      const res = {} as Response;
      const primaryConfig = { ...makeAgent(), ...overrides };
      setPiiRoutingDecision(res, { action: 'send_as_is' });

      expect(() =>
        applyPiiSendAsIsRoute({
          req: makeRequest(),
          res,
          primaryConfig,
          connectedAgentCount,
        }),
      ).toThrow('PII send-as-is is unavailable');
    },
  );

  const unsupportedRequestCases: Array<[string, Record<string, unknown>, string?, string?]> = [
    ['regeneration', { isRegenerate: true }],
    ['continued edit', { isContinued: true }],
    ['edited message', { editedContent: { text: 'edited' } }],
    ['recovered steer continuation', { recoverySteerId: 'steer-1' }],
    ['provider-bound quotes', { quotes: ['quoted content'] }],
    ['resume route', {}, '/resume', '/resume'],
  ];

  it.each(unsupportedRequestCases)(
    'rejects an authorized %s request',
    (_label, body, path = '/', routePath = '/:endpoint') => {
      const req = { body, path, route: { path: routePath } } as Request;
      const res = {} as Response;
      const primaryConfig = makeAgent();
      setPiiRoutingDecision(res, { action: 'send_as_is' });

      expect(() =>
        applyPiiSendAsIsRoute({ req, res, primaryConfig, connectedAgentCount: 0 }),
      ).toThrow('PII send-as-is is unavailable');
    },
  );
});
