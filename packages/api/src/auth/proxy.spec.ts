import { EnvHttpProxyAgent } from 'undici';
import { getOpenIdProxyDispatcher } from './proxy';

jest.mock('undici', () => ({
  EnvHttpProxyAgent: jest.fn(),
}));

const MockEnvHttpProxyAgent = EnvHttpProxyAgent as jest.MockedClass<typeof EnvHttpProxyAgent>;

describe('getOpenIdProxyDispatcher', () => {
  beforeEach(() => {
    MockEnvHttpProxyAgent.mockClear();
    delete process.env.PROXY;
    delete process.env.NO_PROXY;
    delete process.env.no_proxy;
  });

  afterAll(() => {
    delete process.env.PROXY;
    delete process.env.NO_PROXY;
    delete process.env.no_proxy;
  });

  it('returns undefined when PROXY is not set', () => {
    expect(getOpenIdProxyDispatcher()).toBeUndefined();
    expect(MockEnvHttpProxyAgent).not.toHaveBeenCalled();
  });

  it('creates a NO_PROXY-aware agent for both protocols when PROXY is set', () => {
    process.env.PROXY = 'http://corporate-proxy-create:8080';

    const dispatcher = getOpenIdProxyDispatcher();

    expect(dispatcher).toBeInstanceOf(EnvHttpProxyAgent);
    expect(MockEnvHttpProxyAgent).toHaveBeenCalledWith({
      httpProxy: 'http://corporate-proxy-create:8080',
      httpsProxy: 'http://corporate-proxy-create:8080',
    });
  });

  it('reuses the same agent across calls', () => {
    process.env.PROXY = 'http://corporate-proxy-reuse:8080';
    process.env.NO_PROXY = 'localhost,.internal-domain.com';

    const first = getOpenIdProxyDispatcher();
    const second = getOpenIdProxyDispatcher();

    expect(second).toBe(first);
    expect(MockEnvHttpProxyAgent).toHaveBeenCalledTimes(1);
  });

  it('rebuilds the agent when NO_PROXY changes', () => {
    process.env.PROXY = 'http://corporate-proxy-no-proxy:8080';
    process.env.NO_PROXY = 'localhost';
    getOpenIdProxyDispatcher();

    process.env.NO_PROXY = 'localhost,.internal-domain.com';
    getOpenIdProxyDispatcher();

    expect(MockEnvHttpProxyAgent).toHaveBeenCalledTimes(2);
  });

  it('rebuilds the agent when lowercase no_proxy changes', () => {
    process.env.PROXY = 'http://corporate-proxy-lowercase:8080';
    process.env.no_proxy = 'localhost';
    getOpenIdProxyDispatcher();

    process.env.no_proxy = 'localhost,.internal-domain.com';
    getOpenIdProxyDispatcher();

    expect(MockEnvHttpProxyAgent).toHaveBeenCalledTimes(2);
  });

  it('rebuilds the agent when PROXY changes', () => {
    process.env.PROXY = 'http://corporate-proxy-change:8080';
    getOpenIdProxyDispatcher();

    process.env.PROXY = 'http://other-proxy:3128';
    getOpenIdProxyDispatcher();

    expect(MockEnvHttpProxyAgent).toHaveBeenCalledTimes(2);
  });
});
