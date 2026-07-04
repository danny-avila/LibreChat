const ASSET_RECOVERY_KEY = 'lc-asset-recovery-at';
const RUM_QUEUE_KEY = 'lc-rum-queue';
const MAX_RUM_QUEUE = 20;

function safeNow(targetWindow) {
  return Math.round(targetWindow.performance?.now?.() ?? 0);
}

function safeAttributes(attributes) {
  const output = {};

  Object.keys(attributes || {}).forEach((key) => {
    const value = attributes[key];
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
      return;
    }
    output[key] = value;
  });

  return output;
}

export function installRumBootstrap(targetWindow) {
  const targetDocument = targetWindow.document;
  const targetNavigator = targetWindow.navigator;
  let targetSessionStorage;
  try {
    targetSessionStorage = targetWindow.sessionStorage;
  } catch {
    targetSessionStorage = undefined;
  }

  targetWindow.__lcRumQueue = Array.isArray(targetWindow.__lcRumQueue)
    ? targetWindow.__lcRumQueue
    : [];

  function enqueueRumEvent(event, shouldPersist) {
    if (targetWindow.__lcRumQueue.length >= MAX_RUM_QUEUE) {
      const replaceIndex = targetWindow.__lcRumQueue.findIndex(
        (queuedEvent) => queuedEvent && queuedEvent.type === 'visibility-change',
      );
      targetWindow.__lcRumQueue.splice(replaceIndex === -1 ? 0 : replaceIndex, 1);
    }
    targetWindow.__lcRumQueue.push(event);
    if (shouldPersist !== false) {
      persistRumQueue();
    }
  }

  function recordRumQueueStorageError(operation) {
    try {
      enqueueRumEvent(
        {
          type: 'rum-queue-storage-error',
          at: safeNow(targetWindow),
          visibilityState: targetDocument.visibilityState,
          attributes: { operation },
        },
        false,
      );
    } catch {
      /* Diagnostics should never affect application startup. */
    }
  }

  function persistRumQueue() {
    try {
      if (!targetSessionStorage) {
        throw new Error('sessionStorage unavailable');
      }
      targetSessionStorage.setItem(RUM_QUEUE_KEY, JSON.stringify(targetWindow.__lcRumQueue));
    } catch {
      recordRumQueueStorageError('persist');
    }
  }

  try {
    const persistedQueue = JSON.parse(targetSessionStorage?.getItem(RUM_QUEUE_KEY) || '[]');
    if (Array.isArray(persistedQueue)) {
      targetWindow.__lcRumQueue = persistedQueue
        .concat(targetWindow.__lcRumQueue)
        .slice(-MAX_RUM_QUEUE);
    }
  } catch {
    recordRumQueueStorageError('hydrate');
  }

  targetWindow.__lcRumPush = function (type, attributes) {
    try {
      enqueueRumEvent({
        type,
        at: safeNow(targetWindow),
        visibilityState: targetDocument.visibilityState,
        attributes: safeAttributes(attributes),
      });
    } catch {
      /* Diagnostics should never affect application startup. */
    }
  };

  targetWindow.__lcRumPush('inline-start', {
    prerendering: targetDocument.prerendering === true,
    currentPath: targetWindow.location.pathname,
  });

  targetDocument.addEventListener(
    'visibilitychange',
    () => {
      targetWindow.__lcRumPush('visibility-change', { state: targetDocument.visibilityState });
    },
    true,
  );
  targetWindow.addEventListener(
    'pageshow',
    (event) => {
      targetWindow.__lcRumPush('pageshow', { persisted: event.persisted === true });
    },
    true,
  );

  function shouldRecover() {
    try {
      if (!targetSessionStorage) {
        return false;
      }
      const last = Number(targetSessionStorage.getItem(ASSET_RECOVERY_KEY)) || 0;
      if (Date.now() - last < 60000) {
        return false;
      }
      targetSessionStorage.setItem(ASSET_RECOVERY_KEY, String(Date.now()));
      return true;
    } catch {
      return false;
    }
  }

  targetWindow.__lcRecoverStaleAssets = function () {
    if (!shouldRecover()) {
      return false;
    }

    targetWindow.__lcRumPush('stale-asset-recovery-start');
    const reload = () => {
      targetWindow.__lcRumPush('stale-asset-recovery-reload');
      targetWindow.location.reload();
    };

    if (targetNavigator.serviceWorker) {
      const scopeBase = new URL('./', targetDocument.baseURI || targetWindow.location.href).href;
      targetNavigator.serviceWorker
        .getRegistrations()
        .then((registrations) =>
          Promise.all(
            registrations
              .filter((registration) => registration.scope.indexOf(scopeBase) === 0)
              .map((registration) => registration.unregister()),
          ),
        )
        .then(reload, reload);
    } else {
      reload();
    }
    return true;
  };

  if (targetNavigator.serviceWorker) {
    const controller = targetNavigator.serviceWorker.controller;
    targetWindow.__lcRumPush('sw-controller', {
      controlled: !!controller,
      state: controller && controller.state,
      scriptUrl: controller && controller.scriptURL,
    });
    targetNavigator.serviceWorker.getRegistrations().then(
      (registrations) => {
        targetWindow.__lcRumPush('sw-registrations', {
          count: registrations.length,
          firstScopeUrl: registrations[0] && registrations[0].scope,
        });
      },
      () => {
        targetWindow.__lcRumPush('sw-registrations-error');
      },
    );
    targetNavigator.serviceWorker.addEventListener('controllerchange', () => {
      const nextController = targetNavigator.serviceWorker.controller;
      targetWindow.__lcRumPush('sw-controller-change', {
        state: nextController && nextController.state,
        scriptUrl: nextController && nextController.scriptURL,
      });
    });
    targetNavigator.serviceWorker.addEventListener('message', (event) => {
      if (!event.data || event.data.type !== 'LC_SW_PING') {
        return;
      }
      targetWindow.__lcRumPush('sw-ping');
      const source = event.source || targetNavigator.serviceWorker.controller;
      if (source) {
        source.postMessage({ type: 'LC_SW_PONG' });
        targetWindow.__lcRumPush('sw-pong');
      }
    });
  }

  targetWindow.addEventListener(
    'error',
    (event) => {
      const el = event.target;
      if (!el || !el.tagName) {
        return;
      }
      const failedScript = el.tagName === 'SCRIPT' && el.src;
      const failedPreload =
        el.tagName === 'LINK' && /preload/.test(el.rel || '') && /\.js$/.test(el.href || '');
      if (failedScript || failedPreload) {
        targetWindow.__lcRumPush('asset-load-error', {
          tagName: el.tagName,
          assetUrl: el.src || el.href,
        });
        targetWindow.__lcRecoverStaleAssets();
      }
    },
    true,
  );
  targetWindow.addEventListener('unhandledrejection', (event) => {
    const message = event.reason && event.reason.message;
    if (
      typeof message === 'string' &&
      (message.indexOf('dynamically imported module') !== -1 ||
        message.indexOf('Importing a module script failed') !== -1)
    ) {
      targetWindow.__lcRumPush('dynamic-import-error');
      targetWindow.__lcRecoverStaleAssets();
    }
  });
}
