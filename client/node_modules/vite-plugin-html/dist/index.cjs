'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

const ejs = require('ejs');
const dotenvExpand = require('dotenv-expand');
const dotenv = require('dotenv');
const path = require('pathe');
const fse = require('fs-extra');
const vite = require('vite');
const nodeHtmlParser = require('node-html-parser');
const fg = require('fast-glob');
const consola = require('consola');
const colorette = require('colorette');
const history = require('connect-history-api-fallback');
const htmlMinifierTerser = require('html-minifier-terser');
const pluginutils = require('@rollup/pluginutils');

function _interopDefaultLegacy (e) { return e && typeof e === 'object' && 'default' in e ? e["default"] : e; }

function _interopNamespace(e) {
  if (e && e.__esModule) return e;
  const n = Object.create(null);
  if (e) {
    for (const k in e) {
      n[k] = e[k];
    }
  }
  n["default"] = e;
  return n;
}

const dotenv__default = /*#__PURE__*/_interopDefaultLegacy(dotenv);
const path__default = /*#__PURE__*/_interopDefaultLegacy(path);
const fse__default = /*#__PURE__*/_interopDefaultLegacy(fse);
const vite__namespace = /*#__PURE__*/_interopNamespace(vite);
const fg__default = /*#__PURE__*/_interopDefaultLegacy(fg);
const consola__default = /*#__PURE__*/_interopDefaultLegacy(consola);
const history__default = /*#__PURE__*/_interopDefaultLegacy(history);

function loadEnv(mode, envDir, prefix = "") {
  if (mode === "local") {
    throw new Error(`"local" cannot be used as a mode name because it conflicts with the .local postfix for .env files.`);
  }
  const env = {};
  const envFiles = [
    `.env.${mode}.local`,
    `.env.${mode}`,
    `.env.local`,
    `.env`
  ];
  for (const file of envFiles) {
    const path = lookupFile(envDir, [file], true);
    if (path) {
      const parsed = dotenv__default.parse(fse__default.readFileSync(path));
      dotenvExpand.expand({
        parsed,
        ignoreProcessEnv: true
      });
      for (const [key, value] of Object.entries(parsed)) {
        if (key.startsWith(prefix) && env[key] === void 0) {
          env[key] = value;
        } else if (key === "NODE_ENV") {
          process.env.VITE_USER_NODE_ENV = value;
        }
      }
    }
  }
  return env;
}
function lookupFile(dir, formats, pathOnly = false) {
  for (const format of formats) {
    const fullPath = path.join(dir, format);
    if (fse__default.pathExistsSync(fullPath) && fse__default.statSync(fullPath).isFile()) {
      return pathOnly ? fullPath : fse__default.readFileSync(fullPath, "utf-8");
    }
  }
  const parentDir = path.dirname(dir);
  if (parentDir !== dir) {
    return lookupFile(parentDir, formats, pathOnly);
  }
}
async function isDirEmpty(dir) {
  return fse__default.readdir(dir).then((files) => {
    return files.length === 0;
  });
}

const DEFAULT_TEMPLATE = "index.html";
const ignoreDirs = [".", "", "/"];
const bodyInjectRE = /<\/body>/;
function getViteMajorVersion() {
  return vite__namespace?.version ? Number(vite__namespace.version.split(".")[0]) : 2;
}
function createPlugin(userOptions = {}) {
  const {
    entry,
    template = DEFAULT_TEMPLATE,
    pages = [],
    verbose = false
  } = userOptions;
  let viteConfig;
  let env = {};
  const transformIndexHtmlHandler = async (html, ctx) => {
    const url = ctx.filename;
    const base = viteConfig.base;
    const excludeBaseUrl = url.replace(base, "/");
    const htmlName = path__default.relative(process.cwd(), excludeBaseUrl);
    const page = getPage(userOptions, htmlName, viteConfig);
    const { injectOptions = {} } = page;
    const _html = await renderHtml(html, {
      injectOptions,
      viteConfig,
      env,
      entry: page.entry || entry,
      verbose
    });
    const { tags = [] } = injectOptions;
    return {
      html: _html,
      tags
    };
  };
  return {
    name: "vite:html",
    enforce: "pre",
    configResolved(resolvedConfig) {
      viteConfig = resolvedConfig;
      env = loadEnv(viteConfig.mode, viteConfig.root, "");
    },
    config(conf) {
      const input = createInput(userOptions, conf);
      if (input) {
        return {
          build: {
            rollupOptions: {
              input
            }
          }
        };
      }
    },
    configureServer(server) {
      let _pages = [];
      const rewrites = [];
      if (!isMpa(viteConfig)) {
        const template2 = userOptions.template || DEFAULT_TEMPLATE;
        const filename = DEFAULT_TEMPLATE;
        _pages.push({
          filename,
          template: template2
        });
      } else {
        _pages = pages.map((page) => {
          return {
            filename: page.filename || DEFAULT_TEMPLATE,
            template: page.template || DEFAULT_TEMPLATE
          };
        });
      }
      const proxy = viteConfig.server?.proxy ?? {};
      const baseUrl = viteConfig.base ?? "/";
      const keys = Object.keys(proxy);
      let indexPage = null;
      for (const page of _pages) {
        if (page.filename !== "index.html") {
          rewrites.push(createRewire(page.template, page, baseUrl, keys));
        } else {
          indexPage = page;
        }
      }
      if (indexPage) {
        rewrites.push(createRewire("", indexPage, baseUrl, keys));
      }
      server.middlewares.use(history__default({
        disableDotRule: void 0,
        htmlAcceptHeaders: ["text/html", "application/xhtml+xml"],
        rewrites
      }));
    },
    transformIndexHtml: getViteMajorVersion() >= 5 ? {
      order: "pre",
      handler: transformIndexHtmlHandler
    } : {
      enforce: "pre",
      transform: transformIndexHtmlHandler
    },
    async closeBundle() {
      const outputDirs = [];
      if (isMpa(viteConfig) || pages.length) {
        for (const page of pages) {
          const dir = path__default.dirname(page.template);
          if (!ignoreDirs.includes(dir)) {
            outputDirs.push(dir);
          }
        }
      } else {
        const dir = path__default.dirname(template);
        if (!ignoreDirs.includes(dir)) {
          outputDirs.push(dir);
        }
      }
      const cwd = path__default.resolve(viteConfig.root, viteConfig.build.outDir);
      const htmlFiles = await fg__default(outputDirs.map((dir) => `${dir}/*.html`), { cwd: path__default.resolve(cwd), absolute: true });
      await Promise.all(htmlFiles.map((file) => fse__default.move(file, path__default.resolve(cwd, path__default.basename(file)), {
        overwrite: true
      })));
      const htmlDirs = await fg__default(outputDirs.map((dir) => dir), { cwd: path__default.resolve(cwd), onlyDirectories: true, absolute: true });
      await Promise.all(htmlDirs.map(async (item) => {
        const isEmpty = await isDirEmpty(item);
        if (isEmpty) {
          return fse__default.remove(item);
        }
      }));
    }
  };
}
function createInput({ pages = [], template = DEFAULT_TEMPLATE }, viteConfig) {
  const input = {};
  if (isMpa(viteConfig) || pages?.length) {
    const templates = pages.map((page) => page.template);
    templates.forEach((temp) => {
      let dirName = path__default.dirname(temp);
      const file = path__default.basename(temp);
      dirName = dirName.replace(/\s+/g, "").replace(/\//g, "-");
      const key = dirName === "." || dirName === "public" || !dirName ? file.replace(/\.html/, "") : dirName;
      input[key] = path__default.resolve(viteConfig.root, temp);
    });
    return input;
  } else {
    const dir = path__default.dirname(template);
    if (ignoreDirs.includes(dir)) {
      return void 0;
    } else {
      const file = path__default.basename(template);
      const key = file.replace(/\.html/, "");
      return {
        [key]: path__default.resolve(viteConfig.root, template)
      };
    }
  }
}
async function renderHtml(html, config) {
  const { injectOptions, viteConfig, env, entry, verbose } = config;
  const { data, ejsOptions } = injectOptions;
  const ejsData = {
    ...viteConfig?.env ?? {},
    ...viteConfig?.define ?? {},
    ...env || {},
    ...data
  };
  let result = await ejs.render(html, ejsData, ejsOptions);
  if (entry) {
    result = removeEntryScript(result, verbose);
    result = result.replace(bodyInjectRE, `<script type="module" src="${vite.normalizePath(`${entry}`)}"><\/script>
</body>`);
  }
  return result;
}
function getPage({ pages = [], entry, template = DEFAULT_TEMPLATE, inject = {} }, name, viteConfig) {
  let page;
  if (isMpa(viteConfig) || pages?.length) {
    page = getPageConfig(name, pages, DEFAULT_TEMPLATE);
  } else {
    page = createSpaPage(entry, template, inject);
  }
  return page;
}
function isMpa(viteConfig) {
  const input = viteConfig?.build?.rollupOptions?.input ?? void 0;
  return typeof input !== "string" && Object.keys(input || {}).length > 1;
}
function removeEntryScript(html, verbose = false) {
  if (!html) {
    return html;
  }
  const root = nodeHtmlParser.parse(html);
  const scriptNodes = root.querySelectorAll("script[type=module]") || [];
  const removedNode = [];
  scriptNodes.forEach((item) => {
    removedNode.push(item.toString());
    item.parentNode.removeChild(item);
  });
  verbose && removedNode.length && consola__default.warn(`vite-plugin-html: Since you have already configured entry, ${colorette.dim(removedNode.toString())} is deleted. You may also delete it from the index.html.
        `);
  return root.toString();
}
function createSpaPage(entry, template, inject = {}) {
  return {
    entry,
    filename: "index.html",
    template,
    injectOptions: inject
  };
}
function getPageConfig(htmlName, pages, defaultPage) {
  const defaultPageOption = {
    filename: defaultPage,
    template: `./${defaultPage}`
  };
  const page = pages.filter((page2) => {
    return path__default.resolve("/" + page2.template) === path__default.resolve("/" + htmlName);
  })?.[0];
  return page ?? defaultPageOption ?? void 0;
}
function createRewire(reg, page, baseUrl, proxyUrlKeys) {
  return {
    from: new RegExp(`^/${reg}*`),
    to({ parsedUrl }) {
      const pathname = parsedUrl.path;
      const excludeBaseUrl = pathname.replace(baseUrl, "/");
      const template = path__default.resolve(baseUrl, page.template);
      if (excludeBaseUrl.startsWith("/static")) {
        return excludeBaseUrl;
      }
      if (excludeBaseUrl === "/") {
        return template;
      }
      const isApiUrl = proxyUrlKeys.some((item) => pathname.startsWith(path__default.resolve(baseUrl, item)));
      return isApiUrl ? parsedUrl.path : template;
    }
  };
}

const htmlFilter = pluginutils.createFilter(["**/*.html"]);

function getOptions(minify) {
  return {
    collapseWhitespace: minify,
    keepClosingSlash: minify,
    removeComments: minify,
    removeRedundantAttributes: minify,
    removeScriptTypeAttributes: minify,
    removeStyleLinkTypeAttributes: minify,
    useShortDoctype: minify,
    minifyCSS: minify
  };
}
async function minifyHtml(html, minify) {
  if (typeof minify === "boolean" && !minify) {
    return html;
  }
  let minifyOptions = minify;
  if (typeof minify === "boolean" && minify) {
    minifyOptions = getOptions(minify);
  }
  return await htmlMinifierTerser.minify(html, minifyOptions);
}
function createMinifyHtmlPlugin({
  minify = true
} = {}) {
  return {
    name: "vite:minify-html",
    enforce: "post",
    async generateBundle(_, outBundle) {
      if (minify) {
        for (const bundle of Object.values(outBundle)) {
          if (bundle.type === "asset" && htmlFilter(bundle.fileName) && typeof bundle.source === "string") {
            bundle.source = await minifyHtml(bundle.source, minify);
          }
        }
      }
    }
  };
}

consola__default.wrapConsole();
function createHtmlPlugin(userOptions = {}) {
  return [createPlugin(userOptions), createMinifyHtmlPlugin(userOptions)];
}

exports.createHtmlPlugin = createHtmlPlugin;
