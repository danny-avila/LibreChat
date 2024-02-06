'use strict';

const vite = require('vite');
const fs = require('node:fs');
const path = require('node:path');
const node_module = require('node:module');

var _documentCurrentScript = typeof document !== 'undefined' ? document.currentScript : null;
function _interopDefaultCompat (e) { return e && typeof e === 'object' && 'default' in e ? e.default : e; }

const fs__default = /*#__PURE__*/_interopDefaultCompat(fs);
const path__default = /*#__PURE__*/_interopDefaultCompat(path);

const runtimePublicPath = "/@react-refresh";
const _require = node_module.createRequire((typeof document === 'undefined' ? require('u' + 'rl').pathToFileURL(__filename).href : (_documentCurrentScript && _documentCurrentScript.src || new URL('index.cjs', document.baseURI).href)));
const reactRefreshDir = path__default.dirname(
  _require.resolve("react-refresh/package.json")
);
const runtimeFilePath = path__default.join(
  reactRefreshDir,
  "cjs/react-refresh-runtime.development.js"
);
const runtimeCode = `
const exports = {}
${fs__default.readFileSync(runtimeFilePath, "utf-8")}
${fs__default.readFileSync(_require.resolve("./refreshUtils.js"), "utf-8")}
export default exports
`;
const preambleCode = `
import RefreshRuntime from "__BASE__${runtimePublicPath.slice(1)}"
RefreshRuntime.injectIntoGlobalHook(window)
window.$RefreshReg$ = () => {}
window.$RefreshSig$ = () => (type) => type
window.__vite_plugin_react_preamble_installed__ = true
`;
const header = `
import RefreshRuntime from "${runtimePublicPath}";

const inWebWorker = typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope;
let prevRefreshReg;
let prevRefreshSig;

if (import.meta.hot && !inWebWorker) {
  if (!window.__vite_plugin_react_preamble_installed__) {
    throw new Error(
      "@vitejs/plugin-react can't detect preamble. Something is wrong. " +
      "See https://github.com/vitejs/vite-plugin-react/pull/11#discussion_r430879201"
    );
  }

  prevRefreshReg = window.$RefreshReg$;
  prevRefreshSig = window.$RefreshSig$;
  window.$RefreshReg$ = (type, id) => {
    RefreshRuntime.register(type, __SOURCE__ + " " + id)
  };
  window.$RefreshSig$ = RefreshRuntime.createSignatureFunctionForTransform;
}`.replace(/\n+/g, "");
const footer = `
if (import.meta.hot && !inWebWorker) {
  window.$RefreshReg$ = prevRefreshReg;
  window.$RefreshSig$ = prevRefreshSig;

  RefreshRuntime.__hmr_import(import.meta.url).then((currentExports) => {
    RefreshRuntime.registerExportsForReactRefresh(__SOURCE__, currentExports);
    import.meta.hot.accept((nextExports) => {
      if (!nextExports) return;
      const invalidateMessage = RefreshRuntime.validateRefreshBoundaryAndEnqueueUpdate(currentExports, nextExports);
      if (invalidateMessage) import.meta.hot.invalidate(invalidateMessage);
    });
  });
}`;
function addRefreshWrapper(code, id) {
  return header.replace("__SOURCE__", JSON.stringify(id)) + code + footer.replace("__SOURCE__", JSON.stringify(id));
}

let babel;
async function loadBabel() {
  if (!babel) {
    babel = await import('@babel/core');
  }
  return babel;
}
const refreshContentRE = /\$Refresh(?:Reg|Sig)\$\(/;
const defaultIncludeRE = /\.[tj]sx?$/;
const tsRE = /\.tsx?$/;
function viteReact(opts = {}) {
  let devBase = "/";
  const filter = vite.createFilter(opts.include ?? defaultIncludeRE, opts.exclude);
  const jsxImportSource = opts.jsxImportSource ?? "react";
  const jsxImportRuntime = `${jsxImportSource}/jsx-runtime`;
  const jsxImportDevRuntime = `${jsxImportSource}/jsx-dev-runtime`;
  let isProduction = true;
  let projectRoot = process.cwd();
  let skipFastRefresh = false;
  let runPluginOverrides;
  let staticBabelOptions;
  const importReactRE = /\bimport\s+(?:\*\s+as\s+)?React\b/;
  const viteBabel = {
    name: "vite:react-babel",
    enforce: "pre",
    config() {
      if (opts.jsxRuntime === "classic") {
        return {
          esbuild: {
            jsx: "transform"
          }
        };
      } else {
        return {
          esbuild: {
            jsx: "automatic",
            jsxImportSource: opts.jsxImportSource
          },
          optimizeDeps: { esbuildOptions: { jsx: "automatic" } }
        };
      }
    },
    configResolved(config) {
      devBase = config.base;
      projectRoot = config.root;
      isProduction = config.isProduction;
      skipFastRefresh = isProduction || config.command === "build" || config.server.hmr === false;
      if ("jsxPure" in opts) {
        config.logger.warnOnce(
          "[@vitejs/plugin-react] jsxPure was removed. You can configure esbuild.jsxSideEffects directly."
        );
      }
      const hooks = config.plugins.map((plugin) => plugin.api?.reactBabel).filter(defined);
      if (hooks.length > 0) {
        runPluginOverrides = (babelOptions, context) => {
          hooks.forEach((hook) => hook(babelOptions, context, config));
        };
      } else if (typeof opts.babel !== "function") {
        staticBabelOptions = createBabelOptions(opts.babel);
      }
    },
    async transform(code, id, options) {
      if (id.includes("/node_modules/"))
        return;
      const [filepath] = id.split("?");
      if (!filter(filepath))
        return;
      const ssr = options?.ssr === true;
      const babelOptions = (() => {
        if (staticBabelOptions)
          return staticBabelOptions;
        const newBabelOptions = createBabelOptions(
          typeof opts.babel === "function" ? opts.babel(id, { ssr }) : opts.babel
        );
        runPluginOverrides?.(newBabelOptions, { id, ssr });
        return newBabelOptions;
      })();
      const plugins = [...babelOptions.plugins];
      const isJSX = filepath.endsWith("x");
      const useFastRefresh = !skipFastRefresh && !ssr && (isJSX || (opts.jsxRuntime === "classic" ? importReactRE.test(code) : code.includes(jsxImportDevRuntime) || code.includes(jsxImportRuntime)));
      if (useFastRefresh) {
        plugins.push([
          await loadPlugin("react-refresh/babel"),
          { skipEnvCheck: true }
        ]);
      }
      if (opts.jsxRuntime === "classic" && isJSX) {
        if (!isProduction) {
          plugins.push(
            await loadPlugin("@babel/plugin-transform-react-jsx-self"),
            await loadPlugin("@babel/plugin-transform-react-jsx-source")
          );
        }
      }
      if (!plugins.length && !babelOptions.presets.length && !babelOptions.configFile && !babelOptions.babelrc) {
        return;
      }
      const parserPlugins = [...babelOptions.parserOpts.plugins];
      if (!filepath.endsWith(".ts")) {
        parserPlugins.push("jsx");
      }
      if (tsRE.test(filepath)) {
        parserPlugins.push("typescript");
      }
      const babel2 = await loadBabel();
      const result = await babel2.transformAsync(code, {
        ...babelOptions,
        root: projectRoot,
        filename: id,
        sourceFileName: filepath,
        // Required for esbuild.jsxDev to provide correct line numbers
        retainLines: !isProduction && isJSX && opts.jsxRuntime !== "classic",
        parserOpts: {
          ...babelOptions.parserOpts,
          sourceType: "module",
          allowAwaitOutsideFunction: true,
          plugins: parserPlugins
        },
        generatorOpts: {
          ...babelOptions.generatorOpts,
          decoratorsBeforeExport: true
        },
        plugins,
        sourceMaps: true
      });
      if (result) {
        let code2 = result.code;
        if (useFastRefresh && refreshContentRE.test(code2)) {
          code2 = addRefreshWrapper(code2, id);
        }
        return { code: code2, map: result.map };
      }
    }
  };
  const viteReactRefresh = {
    name: "vite:react-refresh",
    enforce: "pre",
    config: (userConfig) => ({
      build: silenceUseClientWarning(userConfig),
      optimizeDeps: {
        // We can't add `react-dom` because the dependency is `react-dom/client`
        // for React 18 while it's `react-dom` for React 17. We'd need to detect
        // what React version the user has installed.
        include: ["react", jsxImportDevRuntime, jsxImportRuntime]
      },
      resolve: {
        dedupe: ["react", "react-dom"]
      }
    }),
    resolveId(id) {
      if (id === runtimePublicPath) {
        return id;
      }
    },
    load(id) {
      if (id === runtimePublicPath) {
        return runtimeCode;
      }
    },
    transformIndexHtml() {
      if (!skipFastRefresh)
        return [
          {
            tag: "script",
            attrs: { type: "module" },
            children: preambleCode.replace(`__BASE__`, devBase)
          }
        ];
    }
  };
  return [viteBabel, viteReactRefresh];
}
viteReact.preambleCode = preambleCode;
const silenceUseClientWarning = (userConfig) => ({
  rollupOptions: {
    onwarn(warning, defaultHandler) {
      if (warning.code === "MODULE_LEVEL_DIRECTIVE" && warning.message.includes("use client")) {
        return;
      }
      if (userConfig.build?.rollupOptions?.onwarn) {
        userConfig.build.rollupOptions.onwarn(warning, defaultHandler);
      } else {
        defaultHandler(warning);
      }
    }
  }
});
const loadedPlugin = /* @__PURE__ */ new Map();
function loadPlugin(path) {
  const cached = loadedPlugin.get(path);
  if (cached)
    return cached;
  const promise = import(path).then((module) => {
    const value = module.default || module;
    loadedPlugin.set(path, value);
    return value;
  });
  loadedPlugin.set(path, promise);
  return promise;
}
function createBabelOptions(rawOptions) {
  var _a;
  const babelOptions = {
    babelrc: false,
    configFile: false,
    ...rawOptions
  };
  babelOptions.plugins || (babelOptions.plugins = []);
  babelOptions.presets || (babelOptions.presets = []);
  babelOptions.overrides || (babelOptions.overrides = []);
  babelOptions.parserOpts || (babelOptions.parserOpts = {});
  (_a = babelOptions.parserOpts).plugins || (_a.plugins = []);
  return babelOptions;
}
function defined(value) {
  return value !== void 0;
}

module.exports = viteReact;
module.exports.default = viteReact;
