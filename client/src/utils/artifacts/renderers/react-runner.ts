// react-runner.ts
export function reactRunnerMain() {

  const BLOCKED_PROP_NAMES = new Set(['__proto__', 'prototype', 'constructor']);

  const isSafePropName = (name: string) =>
    /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) && !BLOCKED_PROP_NAMES.has(name);

  const isSafeImportName = (name: string) => isSafePropName(name);

  const isSafeRelativeLike = (value: string) =>
    value.startsWith('./') || value.startsWith('../');

  const isSafeVirtualPath = (value: string) =>
    value.startsWith('/') || value.startsWith('@/') || isSafeRelativeLike(value);

  const resolveRelativeImport = (fromPath: string, importPath: string): string | null => {
    if (!isSafeRelativeLike(importPath)) return null;

    const baseDir = fromPath.slice(0, fromPath.lastIndexOf('/'));
    const stack = baseDir.split('/').filter(Boolean);

    for (const part of importPath.split('/')) {
      if (!part || part === '.') continue;
      if (part === '..') {
        if (stack.length === 0) return null;
        stack.pop();
        continue;
      }
      stack.push(part);
    }

    return '/' + stack.join('/');
  };


  const w = window as any;

  const normalizePath = (path: string) =>
    path.replace(/^\.\//, '').replace(/^@\//, '/').replace(/^\/\//, '/');

  const stripExtension = (path: string) =>
    path.replace(/\.(tsx|ts|jsx|js|css)$/, '');

  function buildPathRegistry(files: Record<string, string>) {
    const registry = new Map<string, string>();
    Object.keys(files).forEach((actualPath) => {
      const normalized = normalizePath(actualPath);
      const stripped = stripExtension(normalized);
      const variants = [
        actualPath,
        normalized,
        stripped,
        '/' + normalized,
        '/' + stripped,
        '@/' + normalized.replace(/^\//, ''),
        '@/' + stripped.replace(/^\/+/, ''),
      ];
      variants.forEach((v) => {
        if (!registry.has(v)) registry.set(v, actualPath);
      });
    });
    return registry;
  }

  let activeBlobUrls: string[] = [];
  let activeStyleNodes: HTMLElement[] = [];
  let activeRoot: any = null;
  let activeRenderToken = 0;
  let activeMountEl: HTMLElement | null = null;

  const runnerCleanup = {
    intervals: new Set<number>(),
    timeouts: new Set<number>(),
    rafs: new Set<number>(),
    listeners: [] as Array<{
      target: EventTarget;
      type: string;
      listener: EventListenerOrEventListenerObject;
      options?: boolean | AddEventListenerOptions;
    }>,
  };

  const resetRunnerCleanupState = () => {
    runnerCleanup.intervals.forEach((id) => {
      try {
        clearInterval(id);
      } catch { }
    });
    runnerCleanup.intervals.clear();

    runnerCleanup.timeouts.forEach((id) => {
      try {
        clearTimeout(id);
      } catch { }
    });
    runnerCleanup.timeouts.clear();

    runnerCleanup.rafs.forEach((id) => {
      try {
        cancelAnimationFrame(id);
      } catch { }
    });
    runnerCleanup.rafs.clear();

    runnerCleanup.listeners.forEach(({ target, type, listener, options }) => {
      try {
        target.removeEventListener(type, listener, options);
      } catch { }
    });
    runnerCleanup.listeners = [];
  };

  const cleanupPreviousRender = () => {
    activeRenderToken++;

    if (activeRoot) {
      try {
        activeRoot.unmount();
      } catch { }
      activeRoot = null;
    }

    if (activeMountEl) {
      try {
        activeMountEl.remove();
      } catch { }
      activeMountEl = null;
    }

    activeStyleNodes.forEach((node) => {
      try {
        node.remove();
      } catch { }
    });
    activeStyleNodes = [];

    activeBlobUrls.forEach((url) => {
      try {
        URL.revokeObjectURL(url);
      } catch { }
    });
    activeBlobUrls = [];

    resetRunnerCleanupState();

    delete w.React;
    delete w.__artifactStyleNodes;
  };

  const trackBlobUrl = (url: string) => {
    activeBlobUrls.push(url);
    return url;
  };

  // Optional runner-level tracking hooks. These only affect code executed
  // inside this iframe window and allow cleanup if future runner code uses them.
  // User React code can also benefit if it touches window-level APIs directly.
  const originalSetTimeout = w.setTimeout.bind(window);
  const originalSetInterval = w.setInterval.bind(window);
  const originalRequestAnimationFrame = w.requestAnimationFrame.bind(window);
  const originalAddEventListener = EventTarget.prototype.addEventListener;
  const originalRemoveEventListener = EventTarget.prototype.removeEventListener;

  if (!w.__artifactPatchedGlobals) {
    w.__artifactPatchedGlobals = true;

    w.setTimeout = function (handler: TimerHandler, timeout?: number, ...args: any[]) {
      const id = originalSetTimeout(function (...cbArgs: any[]) {
        runnerCleanup.timeouts.delete(id as number);
        if (typeof handler === 'function') {
          return (handler as any)(...cbArgs);
        }
        return eval(handler as string);
      }, timeout, ...args) as unknown as number;
      runnerCleanup.timeouts.add(id);
      return id;
    };

    w.clearTimeout = function (id: number) {
      runnerCleanup.timeouts.delete(id);
      return clearTimeout(id);
    };

    w.setInterval = function (handler: TimerHandler, timeout?: number, ...args: any[]) {
      const id = originalSetInterval(handler, timeout, ...args) as unknown as number;
      runnerCleanup.intervals.add(id);
      return id;
    };

    w.clearInterval = function (id: number) {
      runnerCleanup.intervals.delete(id);
      return clearInterval(id);
    };

    w.requestAnimationFrame = function (cb: FrameRequestCallback) {
      const id = originalRequestAnimationFrame(function (ts: number) {
        runnerCleanup.rafs.delete(id);
        cb(ts);
      }) as unknown as number;
      runnerCleanup.rafs.add(id);
      return id;
    };

    w.cancelAnimationFrame = function (id: number) {
      runnerCleanup.rafs.delete(id);
      return cancelAnimationFrame(id);
    };

    EventTarget.prototype.addEventListener = function (
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions
    ) {
      const target = this as EventTarget;
      if (
        target === window ||
        target === document ||
        target === document.body ||
        target === document.documentElement
      ) {
        runnerCleanup.listeners.push({ target, type, listener, options });
      }
      return originalAddEventListener.call(target, type, listener, options);
    };

    EventTarget.prototype.removeEventListener = function (
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | EventListenerOptions
    ) {
      const target = this as EventTarget;
      runnerCleanup.listeners = runnerCleanup.listeners.filter(
        (x) =>
          !(
            x.target === target &&
            x.type === type &&
            x.listener === listener &&
            x.options === options
          )
      );
      return originalRemoveEventListener.call(target, type, listener, options);
    };
  }

  w.__getSafeComponent = (comp: any, name: string, mod: any) => {
    if (!isSafePropName(name) && name !== 'default' && name !== '*') {
      return () => null;
    }

    if (comp === undefined && name !== 'default' && name !== '*' && mod && Object.prototype.hasOwnProperty.call(mod, name)) {
      return mod[name];
    }

    if (
      comp === undefined &&
      name !== 'default' &&
      name !== '*' &&
      mod?.default &&
      typeof mod.default === 'object' &&
      Object.prototype.hasOwnProperty.call(mod.default, name)
    ) {
      return mod.default[name];
    }

    if (comp !== undefined && comp !== null) return comp;

    console.warn(`Artifact: Missing export "${name}"`);
    return () => {
      const React = w.React;
      if (!React) return null;
      return React.createElement('div', null, `⚠️ ${name}`);
    };
  };

  async function renderReact(payload: any) {
    cleanupPreviousRender();
    const renderToken = activeRenderToken;

    const { runId, entryKey, files, npmImportMap, isDarkMode } = payload;

    const post = (type: string, extra: Record<string, unknown> = {}) => {
      window.parent.postMessage({ type, runId, ...extra }, '*');
    };

    const ensureCurrent = () => {
      if (renderToken !== activeRenderToken) {
        throw new Error('Stale render aborted.');
      }
    };

    post('progress', { message: 'Booting runtime...' });

    document.documentElement.classList.toggle('dark', !!isDarkMode);

    const rootHost = document.getElementById('root');
    if (!rootHost) {
      post('artifact-error', { error: 'Root element #root not found.' });
      return;
    }

    rootHost.innerHTML = '';
    const mountEl = document.createElement('div');
    mountEl.id = 'artifact-react-mount';
    rootHost.appendChild(mountEl);
    activeMountEl = mountEl;

    post('progress', { message: 'Indexing files...' });
    const pathRegistry = buildPathRegistry(files);
    const blobs: Record<string, string> = {};

    w.__artifactStyleNodes = activeStyleNodes;

    const emptyModuleBlob = trackBlobUrl(
      URL.createObjectURL(
        new Blob(
          [
            `
import React from 'react';
const cn = (...args) => args.filter(Boolean).join(' ');
export const Alert = ({ children, className }) => React.createElement('div', { className: cn("relative w-full rounded-lg border p-4 shadow-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100", className) }, children);
export const AlertTitle = ({ children, className }) => React.createElement('h5', { className: cn("mb-1 font-semibold leading-none tracking-tight", className) }, children);
export const AlertDescription = ({ children, className }) => React.createElement('div', { className: cn("text-sm opacity-90", className) }, children);
export default {};
            `,
          ],
          { type: 'text/javascript' }
        )
      )
    );

    const createCssModule = (code: string, isExternal = false) => {
      const jsCode = isExternal
        ? `
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = ${JSON.stringify(code)};
document.head.appendChild(link);
(window.__artifactStyleNodes || (window.__artifactStyleNodes = [])).push(link);
export default {};
        `
        : `
const style = document.createElement('style');
style.textContent = ${JSON.stringify(code)};
document.head.appendChild(style);
(window.__artifactStyleNodes || (window.__artifactStyleNodes = [])).push(style);
export default {};
        `;

      return trackBlobUrl(
        URL.createObjectURL(new Blob([jsCode], { type: 'text/javascript' }))
      );
    };

    try {
      post('progress', { message: 'Preparing CSS...' });
      Object.keys(files).forEach((path) => {
        if (path.endsWith('.css')) {
          blobs[path] = createCssModule(files[path]);
        } else {
          blobs[path] = 'placeholder';
        }
      });

      const transformFile = (path: string, code: string) => {
        const { code: compiled } = w.Babel.transform(code, {
          filename: path,
          presets: [
            ['env', { modules: false }],
            ['react', { runtime: 'automatic' }],
            'typescript',
          ],
          plugins: [
            function ({ types: t }: any) {
              return {
                visitor: {
                  ImportDeclaration(p: any) {
                    const srcNode = p.node.source;
                    const src = typeof srcNode?.value === 'string' ? srcNode.value : '';

                    if (!src) {
                      throw new Error(`Invalid import source in ${path}`);
                    }

                    // Let core/runtime packages resolve through import maps.
                    if (['react', 'react-dom', 'react-dom/client'].includes(src)) return;

                    const specifiers = Array.isArray(p.node.specifiers) ? p.node.specifiers : [];

                    // Keep namespace imports as-is unless we need to remap local virtual files.
                    const hasNamespaceSpecifier = specifiers.some((s: any) =>
                      t.isImportNamespaceSpecifier(s)
                    );

                    let actualPath: string | undefined;
                    let finalSource: string | undefined;

                    if (src.startsWith('.')) {
                      const resolved = resolveRelativeImport(path, src);
                      if (resolved) {
                        actualPath = pathRegistry.get(resolved);
                      }
                    } else if (src.startsWith('/') || src.startsWith('@/')) {
                      if (!isSafeVirtualPath(src)) {
                        throw new Error(`Unsafe virtual import path: ${src}`);
                      }
                      actualPath = pathRegistry.get(src);
                    }

                    if (actualPath && Object.prototype.hasOwnProperty.call(blobs, actualPath)) {
                      finalSource = blobs[actualPath];
                    } else if (src.endsWith('.css')) {
                      if (src.includes('react-day-picker')) {
                        finalSource = createCssModule(
                          'https://unpkg.com/react-day-picker/dist/style.css',
                          true
                        );
                      } else if (src.startsWith('.') || src.startsWith('/') || src.startsWith('@/')) {
                        // Local CSS import that could not be resolved: replace with inert module.
                        finalSource = trackBlobUrl(
                          URL.createObjectURL(
                            new Blob(['export default {}'], { type: 'text/javascript' })
                          )
                        );
                      } else {
                        // Non-local CSS imports should resolve via import map / runtime if supported.
                        return;
                      }
                    } else if (src.startsWith('.') || src.startsWith('/') || src.startsWith('@/')) {
                      // Unknown local module: fail closed to inert module instead of leaving arbitrary specifier.
                      finalSource = emptyModuleBlob;
                    } else {
                      // Bare package import: leave for import map resolution.
                      return;
                    }

                    p.node.source = t.stringLiteral(finalSource);

                    if (hasNamespaceSpecifier) {
                      return;
                    }

                    if (specifiers.length === 0) {
                      return;
                    }

                    const nsId = p.scope.generateUidIdentifier('ns');
                    const newImport = t.importDeclaration(
                      [t.importNamespaceSpecifier(nsId)],
                      t.stringLiteral(finalSource)
                    );

                    const vars = specifiers.flatMap((spec: any) => {
                      if (t.isImportNamespaceSpecifier(spec)) {
                        return [];
                      }

                      const localName = spec?.local?.name;
                      if (!isSafePropName(localName)) {
                        throw new Error(`Unsafe local import binding: ${String(localName)}`);
                      }

                      let accessor;
                      let importNameStr: string;

                      if (t.isImportDefaultSpecifier(spec)) {
                        accessor = t.memberExpression(nsId, t.identifier('default'));
                        importNameStr = 'default';
                      } else if (t.isImportSpecifier(spec)) {
                        const imported = spec.imported;

                        let importedName: string | null = null;

                        if (t.isIdentifier(imported)) {
                          importedName = imported.name;
                        } else if (t.isStringLiteral(imported)) {
                          importedName = imported.value;
                        }

                        if (!importedName || !isSafeImportName(importedName)) {
                          throw new Error(`Unsafe named import: ${String(importedName)}`);
                        }

                        accessor = t.memberExpression(nsId, t.stringLiteral(importedName), true);
                        importNameStr = importedName;
                      } else {
                        throw new Error(`Unsupported import specifier in ${path}`);
                      }

                      return t.variableDeclaration('const', [
                        t.variableDeclarator(
                          t.identifier(localName),
                          t.callExpression(
                            t.memberExpression(
                              t.identifier('window'),
                              t.identifier('__getSafeComponent')
                            ),
                            [accessor, t.stringLiteral(importNameStr), nsId]
                          )
                        ),
                      ]);
                    });

                    p.replaceWithMultiple([newImport, ...vars]);
                  },
                },
              };
            },
          ],
        });

        return trackBlobUrl(
          URL.createObjectURL(new Blob([compiled], { type: 'text/javascript' }))
        );
      };

      post('progress', { message: `Compiling ${Object.keys(files).length} files...` });
      Object.keys(files).forEach((path) => {
        if (!path.endsWith('.css')) {
          blobs[path] = transformFile(path, files[path]);
        }
      });

      ensureCurrent();

      post('progress', { message: 'Building import map...' });
      const resolvedEntry = blobs[entryKey] || blobs[pathRegistry.get(entryKey) as string];
      if (!resolvedEntry) throw new Error(`Entry file not found: ${entryKey}`);

      const importMap = {
        imports: {
          ...npmImportMap,
          'entry-point': resolvedEntry,
          'react/jsx-runtime':
            npmImportMap['react/jsx-runtime'] || 'https://esm.sh/react@19.2.4/jsx-runtime',
          'react/jsx-dev-runtime':
            npmImportMap['react/jsx-dev-runtime'] || 'https://esm.sh/react@19.2.4/jsx-dev-runtime',
        },
      };

      const oldDynamic = document.getElementById('dynamic-import-map');
      if (oldDynamic) oldDynamic.remove();

      const mapScript = document.createElement('script');
      mapScript.type = 'importmap-shim';
      mapScript.id = 'dynamic-import-map';
      mapScript.textContent = JSON.stringify(importMap);
      document.head.appendChild(mapScript);

      if (w.importShim?.addImportMap) {
        w.importShim.addImportMap(importMap);
      }

      await Promise.resolve();
      ensureCurrent();

      post('progress', { message: 'Loading React runtime...' });
      const { createRoot } = await w.importShim('react-dom/client');
      ensureCurrent();

      const React = await w.importShim('react');
      ensureCurrent();

      w.React = React;

      post('progress', { message: 'Importing entry module...' });
      const mod = await w.importShim('entry-point');
      ensureCurrent();

      const Component =
        mod.default ||
        mod.App ||
        Object.values(mod).find((exp: any) => typeof exp === 'function' && /^[A-Z]/.test(exp.name));

      if (!Component) throw new Error('No default export found.');

      post('progress', { message: 'Rendering component...' });
      activeRoot = createRoot(mountEl);
      activeRoot.render(React.createElement(Component));
      ensureCurrent();

      post('artifact-ready');
    } catch (err) {
      if (String(err) === 'Error: Stale render aborted.') {
        return;
      }
      console.error(err);
      post('artifact-error', { error: String(err) });
    }
  }

  window.addEventListener('beforeunload', cleanupPreviousRender);

  window.addEventListener('message', (e) => {
    try {
      // In sandboxed srcdoc, origin may be "null". Source check is the reliable boundary.
      if (e.source !== window.parent) return;
      const data = e.data;
      if (!data || typeof data !== 'object') return;
      if (data.type !== 'render') return;
      if (!data.payload || typeof data.payload !== 'object') return;

      renderReact(data.payload);
    } catch (err) {
      try {
        window.parent.postMessage({ type: 'artifact-error', error: String(err) }, '*');
      } catch { }
    }
  });

  window.addEventListener('error', (event) => {
    try {
      window.parent.postMessage({ type: 'artifact-error', error: event?.error ? String(event.error) : String(event.message || 'Unknown iframe error') }, '*');
    } catch { }
  });

  window.addEventListener('unhandledrejection', (event) => {
    try {
      window.parent.postMessage(
        {
          type: 'artifact-error',
          error: event?.reason ? String(event.reason) : 'Unhandled promise rejection in artifact runner',
        },
        '*'
      );
    } catch { }
  });
}

export function getReactRunnerScriptTag(): string {
  return `<script type="module">;(${reactRunnerMain.toString()})();</script>`;
}
