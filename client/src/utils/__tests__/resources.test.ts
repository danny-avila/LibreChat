import { ResourceType } from 'librechat-data-provider';

describe('agent share URL', () => {
  let base: HTMLBaseElement;
  let browserDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    base = document.createElement('base');
    document.head.prepend(base);
    browserDescriptor = Object.getOwnPropertyDescriptor(process, 'browser');
    Object.defineProperty(process, 'browser', { value: true, configurable: true });
  });

  afterEach(() => {
    base.remove();
    if (browserDescriptor) {
      Object.defineProperty(process, 'browser', browserDescriptor);
    } else {
      Reflect.deleteProperty(process, 'browser');
    }
  });

  it.each([
    [null, ''],
    ['/', ''],
    ['/librechat/', '/librechat'],
    ['/librechat', '/librechat'],
    ['/apps/librechat/', '/apps/librechat'],
  ])('preserves the application path for base href %s', (href, expectedPath) => {
    if (href !== null) {
      base.setAttribute('href', href);
    }

    jest.isolateModules(() => {
      const { getAgentChatUrl, getResourceConfig } =
        jest.requireActual<typeof import('../resources')>('../resources');
      const expectedUrl = `${window.location.origin}${expectedPath}/c/new?agent_id=agent-1`;

      expect(getAgentChatUrl('agent-1')).toBe(expectedUrl);
      expect(getResourceConfig(ResourceType.AGENT)?.getResourceUrl?.('agent-1')).toBe(expectedUrl);
    });
  });

  it('encodes the agent ID without introducing extra query parameters or a fragment', () => {
    base.setAttribute('href', '/librechat/');

    jest.isolateModules(() => {
      const { getAgentChatUrl } = jest.requireActual<typeof import('../resources')>('../resources');
      const agentId = 'agent/1 & more#?';
      const url = new URL(getAgentChatUrl(agentId));

      expect(url.pathname).toBe('/librechat/c/new');
      expect([...url.searchParams]).toEqual([['agent_id', agentId]]);
      expect(url.hash).toBe('');
    });
  });
});
