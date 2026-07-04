import { installRumBootstrap } from './bootstrap';

type BootstrapTestWindow = {
  __lcRecoverStaleAssets?: () => boolean;
  __lcRumInlineStarted?: boolean;
  __lcRumQueueHydrated?: boolean;
  __lcRumRecoveryGuardInstalled?: boolean;
  __lcRumPush?: unknown;
  __lcRumQueue?: unknown;
};

function bootstrapWindow(): BootstrapTestWindow {
  return window as unknown as BootstrapTestWindow;
}

describe('rum bootstrap', () => {
  beforeEach(() => {
    sessionStorage.clear();
    bootstrapWindow().__lcRumQueue = undefined;
    bootstrapWindow().__lcRumPush = undefined;
    bootstrapWindow().__lcRecoverStaleAssets = undefined;
    bootstrapWindow().__lcRumInlineStarted = undefined;
    bootstrapWindow().__lcRumQueueHydrated = undefined;
    bootstrapWindow().__lcRumRecoveryGuardInstalled = undefined;
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: undefined,
    });
    jest.spyOn(performance, 'now').mockReturnValue(42.4);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('forces the early RUM queue to an array and persists sanitized events', () => {
    bootstrapWindow().__lcRumQueue = 'bad';

    installRumBootstrap(window);
    window.__lcRumPush?.('asset-load-error', {
      assetUrl: '/assets/app.js?token=secret',
      nested: { dropped: true },
      tagName: 'SCRIPT',
    });

    const persistedQueue = JSON.parse(sessionStorage.getItem('lc-rum-queue') || '[]');
    expect(Array.isArray(window.__lcRumQueue)).toBe(true);
    expect(window.__lcRumQueue?.[0]).toEqual(
      expect.objectContaining({
        type: 'inline-start',
        attributes: expect.objectContaining({ currentPath: '/' }),
      }),
    );
    expect(persistedQueue.at(-1)).toEqual({
      type: 'asset-load-error',
      at: 42,
      visibilityState: 'visible',
      attributes: {
        assetUrl: '/assets/app.js?token=secret',
        tagName: 'SCRIPT',
      },
    });
  });

  it('hydrates persisted queue entries before new bootstrap events', () => {
    sessionStorage.setItem(
      'lc-rum-queue',
      JSON.stringify([{ type: 'asset-load-error', attributes: { tagName: 'SCRIPT' } }]),
    );

    installRumBootstrap(window);

    expect(window.__lcRumQueue?.map((event) => event.type)).toEqual([
      'asset-load-error',
      'inline-start',
    ]);
  });

  it('does not duplicate inline guard events when the guard already hydrated the queue', () => {
    const existingRecover = jest.fn(() => false);
    bootstrapWindow().__lcRumQueueHydrated = true;
    bootstrapWindow().__lcRumRecoveryGuardInstalled = true;
    bootstrapWindow().__lcRecoverStaleAssets = existingRecover;
    bootstrapWindow().__lcRumQueue = [
      { type: 'asset-load-error', attributes: { tagName: 'SCRIPT' } },
    ];
    sessionStorage.setItem(
      'lc-rum-queue',
      JSON.stringify([{ type: 'asset-load-error', attributes: { tagName: 'SCRIPT' } }]),
    );

    installRumBootstrap(window);

    expect(window.__lcRumQueue?.map((event) => event.type)).toEqual([
      'asset-load-error',
      'inline-start',
    ]);
    expect(bootstrapWindow().__lcRecoverStaleAssets).toBe(existingRecover);
  });

  it('persists stale-asset recovery diagnostics before unregistering and reloading', () => {
    const getRegistrations = jest.fn(
      () => new Promise<ServiceWorkerRegistration[]>(() => undefined),
    );
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        addEventListener: jest.fn(),
        controller: undefined,
        getRegistrations,
      },
    });

    installRumBootstrap(window);

    expect(bootstrapWindow().__lcRecoverStaleAssets?.()).toBe(true);
    const persistedQueue = JSON.parse(sessionStorage.getItem('lc-rum-queue') || '[]');

    expect(getRegistrations).toHaveBeenCalled();
    expect(persistedQueue).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'stale-asset-recovery-start',
        }),
      ]),
    );
  });
});
