import { aw as invariant, ax as X, r as reactExports, ay as useIntersectionObserver, j as jsxRuntimeExports, N as global, az as escapeCarriageExports, aA as Anser, aB as LZString, aC as dequal, aD as PREVIEW_LOADED_MESSAGE_TYPE, aE as Nodebox, aF as INJECT_MESSAGE_TYPE, aG as mainExports, aH as mimeDB } from "./vendor.BvsoAGbO.js";
import { D as Decoration, V as ViewPlugin, E as EditorView, k as keymap, s as syntaxHighlighting, c as closeBracketsKeymap, d as defaultKeymap, h as historyKeymap, a as deleteGroupBackward, b as highlightSpecialChars, e as history$1, f as closeBrackets, g as EditorState, i as bracketMatching, j as highlightActiveLine, l as lineNumbers, S as StateEffect, m as EditorSelection, A as Annotation, n as css$1, o as html, p as javascript, H as HighlightStyle, t as tags, q as highlightTree, r as indentMore, u as indentLess } from "./codemirror.lsfbTDax.js";
const scriptRel = "modulepreload";
const assetsURL = function(dep, importerUrl) {
  return new URL(dep, importerUrl).href;
};
const seen = {};
const __vitePreload = function preload(baseModule, deps, importerUrl) {
  let promise = Promise.resolve();
  if (deps && deps.length > 0) {
    let allSettled2 = function(promises) {
      return Promise.all(
        promises.map(
          (p) => Promise.resolve(p).then(
            (value) => ({ status: "fulfilled", value }),
            (reason) => ({ status: "rejected", reason })
          )
        )
      );
    };
    const links = document.getElementsByTagName("link");
    const cspNonceMeta = document.querySelector(
      "meta[property=csp-nonce]"
    );
    const cspNonce = (cspNonceMeta == null ? void 0 : cspNonceMeta.nonce) || (cspNonceMeta == null ? void 0 : cspNonceMeta.getAttribute("nonce"));
    promise = allSettled2(
      deps.map((dep) => {
        dep = assetsURL(dep, importerUrl);
        if (dep in seen) return;
        seen[dep] = true;
        const isCss = dep.endsWith(".css");
        const cssSelector = isCss ? '[rel="stylesheet"]' : "";
        const isBaseRelative = !!importerUrl;
        if (isBaseRelative) {
          for (let i = links.length - 1; i >= 0; i--) {
            const link2 = links[i];
            if (link2.href === dep && (!isCss || link2.rel === "stylesheet")) {
              return;
            }
          }
        } else if (document.querySelector(`link[href="${dep}"]${cssSelector}`)) {
          return;
        }
        const link = document.createElement("link");
        link.rel = isCss ? "stylesheet" : scriptRel;
        if (!isCss) {
          link.as = "script";
        }
        link.crossOrigin = "";
        link.href = dep;
        if (cspNonce) {
          link.setAttribute("nonce", cspNonce);
        }
        document.head.appendChild(link);
        if (isCss) {
          return new Promise((res, rej) => {
            link.addEventListener("load", res);
            link.addEventListener(
              "error",
              () => rej(new Error(`Unable to preload CSS for ${dep}`))
            );
          });
        }
      })
    );
  }
  function handlePreloadError(err) {
    const e = new Event("vite:preloadError", {
      cancelable: true
    });
    e.payload = err;
    window.dispatchEvent(e);
    if (!e.defaultPrevented) {
      throw err;
    }
  }
  return promise.then((res) => {
    for (const item of res || []) {
      if (item.status !== "rejected") continue;
      handlePreloadError(item.reason);
    }
    return baseModule().catch(handlePreloadError);
  });
};
var extendStatics = function(d, b) {
  extendStatics = Object.setPrototypeOf || { __proto__: [] } instanceof Array && function(d2, b2) {
    d2.__proto__ = b2;
  } || function(d2, b2) {
    for (var p in b2) if (Object.prototype.hasOwnProperty.call(b2, p)) d2[p] = b2[p];
  };
  return extendStatics(d, b);
};
function __extends(d, b) {
  if (typeof b !== "function" && b !== null)
    throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
  extendStatics(d, b);
  function __() {
    this.constructor = d;
  }
  d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
}
var __assign$2 = function() {
  __assign$2 = Object.assign || function __assign2(t) {
    for (var s, i = 1, n = arguments.length; i < n; i++) {
      s = arguments[i];
      for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p)) t[p] = s[p];
    }
    return t;
  };
  return __assign$2.apply(this, arguments);
};
function __awaiter$2(thisArg, _arguments, P, generator) {
  function adopt(value) {
    return value instanceof P ? value : new P(function(resolve) {
      resolve(value);
    });
  }
  return new (P || (P = Promise))(function(resolve, reject) {
    function fulfilled(value) {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    }
    function rejected(value) {
      try {
        step(generator["throw"](value));
      } catch (e) {
        reject(e);
      }
    }
    function step(result) {
      result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
    }
    step((generator = generator.apply(thisArg, [])).next());
  });
}
function __generator$2(thisArg, body) {
  var _ = { label: 0, sent: function() {
    if (t[0] & 1) throw t[1];
    return t[1];
  }, trys: [], ops: [] }, f, y, t, g;
  return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() {
    return this;
  }), g;
  function verb(n) {
    return function(v) {
      return step([n, v]);
    };
  }
  function step(op) {
    if (f) throw new TypeError("Generator is already executing.");
    while (_) try {
      if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
      if (y = 0, t) op = [op[0] & 2, t.value];
      switch (op[0]) {
        case 0:
        case 1:
          t = op;
          break;
        case 4:
          _.label++;
          return { value: op[1], done: false };
        case 5:
          _.label++;
          y = op[1];
          op = [0];
          continue;
        case 7:
          op = _.ops.pop();
          _.trys.pop();
          continue;
        default:
          if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) {
            _ = 0;
            continue;
          }
          if (op[0] === 3 && (!t || op[1] > t[0] && op[1] < t[3])) {
            _.label = op[1];
            break;
          }
          if (op[0] === 6 && _.label < t[1]) {
            _.label = t[1];
            t = op;
            break;
          }
          if (t && _.label < t[2]) {
            _.label = t[2];
            _.ops.push(op);
            break;
          }
          if (t[2]) _.ops.pop();
          _.trys.pop();
          continue;
      }
      op = body.call(thisArg, _);
    } catch (e) {
      op = [6, e];
      y = 0;
    } finally {
      f = t = 0;
    }
    if (op[0] & 5) throw op[1];
    return { value: op[0] ? op[1] : void 0, done: true };
  }
}
function __spreadArray$2(to, from, pack) {
  if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
    if (ar || !(i in from)) {
      if (!ar) ar = Array.prototype.slice.call(from, 0, i);
      ar[i] = from[i];
    }
  }
  return to.concat(ar || Array.prototype.slice.call(from));
}
var SandpackLogLevel;
(function(SandpackLogLevel2) {
  SandpackLogLevel2[SandpackLogLevel2["None"] = 0] = "None";
  SandpackLogLevel2[SandpackLogLevel2["Error"] = 10] = "Error";
  SandpackLogLevel2[SandpackLogLevel2["Warning"] = 20] = "Warning";
  SandpackLogLevel2[SandpackLogLevel2["Info"] = 30] = "Info";
  SandpackLogLevel2[SandpackLogLevel2["Debug"] = 40] = "Debug";
})(SandpackLogLevel || (SandpackLogLevel = {}));
var createError = function(message) {
  return "[sandpack-client]: ".concat(message);
};
function nullthrows(value, err) {
  if (err === void 0) {
    err = "Value is nullish";
  }
  invariant(value != null, createError(err));
  return value;
}
var DEPENDENCY_ERROR_MESSAGE = '"dependencies" was not specified - provide either a package.json or a "dependencies" value';
var ENTRY_ERROR_MESSAGE = '"entry" was not specified - provide either a package.json with the "main" field or an "entry" value';
function createPackageJSON(dependencies, devDependencies, entry) {
  if (dependencies === void 0) {
    dependencies = {};
  }
  if (devDependencies === void 0) {
    devDependencies = {};
  }
  if (entry === void 0) {
    entry = "/index.js";
  }
  return JSON.stringify({
    name: "sandpack-project",
    main: entry,
    dependencies,
    devDependencies
  }, null, 2);
}
function addPackageJSONIfNeeded(files, dependencies, devDependencies, entry) {
  var _a2, _b;
  var normalizedFilesPath = normalizePath(files);
  var packageJsonFile = normalizedFilesPath["/package.json"];
  if (!packageJsonFile) {
    nullthrows(dependencies, DEPENDENCY_ERROR_MESSAGE);
    nullthrows(entry, ENTRY_ERROR_MESSAGE);
    normalizedFilesPath["/package.json"] = {
      code: createPackageJSON(dependencies, devDependencies, entry)
    };
    return normalizedFilesPath;
  }
  if (packageJsonFile) {
    var packageJsonContent = JSON.parse(packageJsonFile.code);
    nullthrows(!(!dependencies && !packageJsonContent.dependencies), ENTRY_ERROR_MESSAGE);
    if (dependencies) {
      packageJsonContent.dependencies = __assign$2(__assign$2({}, (_a2 = packageJsonContent.dependencies) !== null && _a2 !== void 0 ? _a2 : {}), dependencies !== null && dependencies !== void 0 ? dependencies : {});
    }
    if (devDependencies) {
      packageJsonContent.devDependencies = __assign$2(__assign$2({}, (_b = packageJsonContent.devDependencies) !== null && _b !== void 0 ? _b : {}), devDependencies !== null && devDependencies !== void 0 ? devDependencies : {});
    }
    if (entry) {
      packageJsonContent.main = entry;
    }
    normalizedFilesPath["/package.json"] = {
      code: JSON.stringify(packageJsonContent, null, 2)
    };
  }
  return normalizedFilesPath;
}
function extractErrorDetails(msg) {
  var _a2;
  if (msg.title === "SyntaxError") {
    var title = msg.title, path = msg.path, message = msg.message, line = msg.line, column = msg.column;
    return { title, path, message, line, column };
  }
  var relevantStackFrame = getRelevantStackFrame((_a2 = msg.payload) === null || _a2 === void 0 ? void 0 : _a2.frames);
  if (!relevantStackFrame) {
    return { message: msg.message };
  }
  var errorInCode = getErrorInOriginalCode(relevantStackFrame);
  var errorLocation = getErrorLocation(relevantStackFrame);
  var errorMessage = formatErrorMessage(relevantStackFrame._originalFileName, msg.message, errorLocation, errorInCode);
  return {
    message: errorMessage,
    title: msg.title,
    path: relevantStackFrame._originalFileName,
    line: relevantStackFrame._originalLineNumber,
    column: relevantStackFrame._originalColumnNumber
  };
}
function getRelevantStackFrame(frames) {
  if (!frames) {
    return;
  }
  return frames.find(function(frame) {
    return !!frame._originalFileName;
  });
}
function getErrorLocation(errorFrame) {
  return errorFrame ? " (".concat(errorFrame._originalLineNumber, ":").concat(errorFrame._originalColumnNumber, ")") : "";
}
function getErrorInOriginalCode(errorFrame) {
  var lastScriptLine = errorFrame._originalScriptCode[errorFrame._originalScriptCode.length - 1];
  var numberOfLineNumberCharacters = lastScriptLine.lineNumber.toString().length;
  var leadingCharacterOffset = 2;
  var barSeparatorCharacterOffset = 3;
  var extraLineLeadingSpaces = leadingCharacterOffset + numberOfLineNumberCharacters + barSeparatorCharacterOffset + errorFrame._originalColumnNumber;
  return errorFrame._originalScriptCode.reduce(function(result, scriptLine) {
    var leadingChar = scriptLine.highlight ? ">" : " ";
    var lineNumber = scriptLine.lineNumber.toString().length === numberOfLineNumberCharacters ? "".concat(scriptLine.lineNumber) : " ".concat(scriptLine.lineNumber);
    var extraLine = scriptLine.highlight ? "\n" + " ".repeat(extraLineLeadingSpaces) + "^" : "";
    return result + // accumulator
    "\n" + leadingChar + // > or " "
    " " + lineNumber + // line number on equal number of characters
    " | " + scriptLine.content + // code
    extraLine;
  }, "");
}
function formatErrorMessage(filePath, message, location, errorInCode) {
  return "".concat(filePath, ": ").concat(message).concat(location, "\n").concat(errorInCode);
}
var normalizePath = function(path) {
  if (typeof path === "string") {
    return path.startsWith("/") ? path : "/".concat(path);
  }
  if (Array.isArray(path)) {
    return path.map(function(p) {
      return p.startsWith("/") ? p : "/".concat(p);
    });
  }
  if (typeof path === "object" && path !== null) {
    return Object.entries(path).reduce(function(acc, _a2) {
      var key = _a2[0], content = _a2[1];
      var fileName = key.startsWith("/") ? key : "/".concat(key);
      acc[fileName] = content;
      return acc;
    }, {});
  }
  return null;
};
function loadSandpackClient(iframeSelector, sandboxSetup, options) {
  var _a2;
  if (options === void 0) {
    options = {};
  }
  return __awaiter$2(this, void 0, void 0, function() {
    var template, Client, _b;
    return __generator$2(this, function(_c2) {
      switch (_c2.label) {
        case 0:
          template = (_a2 = sandboxSetup.template) !== null && _a2 !== void 0 ? _a2 : "parcel";
          _b = template;
          switch (_b) {
            case "node":
              return [3, 1];
            case "static":
              return [3, 3];
          }
          return [3, 5];
        case 1:
          return [4, __vitePreload(() => Promise.resolve().then(() => index$1), true ? void 0 : void 0, import.meta.url).then(function(m) {
            return m.SandpackNode;
          })];
        case 2:
          Client = _c2.sent();
          return [3, 7];
        case 3:
          return [4, __vitePreload(() => Promise.resolve().then(() => index599aeaf7), true ? void 0 : void 0, import.meta.url).then(function(m) {
            return m.SandpackStatic;
          })];
        case 4:
          Client = _c2.sent();
          return [3, 7];
        case 5:
          return [4, __vitePreload(() => Promise.resolve().then(() => index), true ? void 0 : void 0, import.meta.url).then(function(m) {
            return m.SandpackRuntime;
          })];
        case 6:
          Client = _c2.sent();
          _c2.label = 7;
        case 7:
          return [2, new Client(iframeSelector, sandboxSetup, options)];
      }
    });
  });
}
var __assign$1 = function() {
  __assign$1 = Object.assign || function __assign2(t) {
    for (var s, i = 1, n = arguments.length; i < n; i++) {
      s = arguments[i];
      for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p)) t[p] = s[p];
    }
    return t;
  };
  return __assign$1.apply(this, arguments);
};
function __rest$1(s, e) {
  var t = {};
  for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
    t[p] = s[p];
  if (s != null && typeof Object.getOwnPropertySymbols === "function")
    for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
      if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
        t[p[i]] = s[p[i]];
    }
  return t;
}
function __awaiter$1(thisArg, _arguments, P, generator) {
  function adopt(value) {
    return value instanceof P ? value : new P(function(resolve) {
      resolve(value);
    });
  }
  return new (P || (P = Promise))(function(resolve, reject) {
    function fulfilled(value) {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    }
    function rejected(value) {
      try {
        step(generator["throw"](value));
      } catch (e) {
        reject(e);
      }
    }
    function step(result) {
      result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
    }
    step((generator = generator.apply(thisArg, [])).next());
  });
}
function __generator$1(thisArg, body) {
  var _ = { label: 0, sent: function() {
    if (t[0] & 1) throw t[1];
    return t[1];
  }, trys: [], ops: [] }, f, y, t, g;
  return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() {
    return this;
  }), g;
  function verb(n) {
    return function(v) {
      return step([n, v]);
    };
  }
  function step(op) {
    if (f) throw new TypeError("Generator is already executing.");
    while (_) try {
      if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
      if (y = 0, t) op = [op[0] & 2, t.value];
      switch (op[0]) {
        case 0:
        case 1:
          t = op;
          break;
        case 4:
          _.label++;
          return { value: op[1], done: false };
        case 5:
          _.label++;
          y = op[1];
          op = [0];
          continue;
        case 7:
          op = _.ops.pop();
          _.trys.pop();
          continue;
        default:
          if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) {
            _ = 0;
            continue;
          }
          if (op[0] === 3 && (!t || op[1] > t[0] && op[1] < t[3])) {
            _.label = op[1];
            break;
          }
          if (op[0] === 6 && _.label < t[1]) {
            _.label = t[1];
            t = op;
            break;
          }
          if (t && _.label < t[2]) {
            _.label = t[2];
            _.ops.push(op);
            break;
          }
          if (t[2]) _.ops.pop();
          _.trys.pop();
          continue;
      }
      op = body.call(thisArg, _);
    } catch (e) {
      op = [6, e];
      y = 0;
    } finally {
      f = t = 0;
    }
    if (op[0] & 5) throw op[1];
    return { value: op[0] ? op[1] : void 0, done: true };
  }
}
function __spreadArray$1(to, from, pack) {
  if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
    if (ar || !(i in from)) {
      if (!ar) ar = Array.prototype.slice.call(from, 0, i);
      ar[i] = from[i];
    }
  }
  return to.concat(ar || Array.prototype.slice.call(from));
}
var SVG$1 = function(props) {
  return jsxRuntimeExports.jsx("svg", __assign$1({ fill: "currentColor", height: "16", viewBox: "0 0 16 16", width: "16", xmlns: "http://www.w3.org/2000/svg" }, props));
};
var SignInIcon$1 = function() {
  return jsxRuntimeExports.jsxs(SVG$1, { viewBox: "0 0 48 48", children: [jsxRuntimeExports.jsx("title", { children: "Sign in" }), jsxRuntimeExports.jsx("path", { d: "M9 42q-1.2 0-2.1-.9Q6 40.2 6 39V9q0-1.2.9-2.1Q7.8 6 9 6h14.55v3H9v30h14.55v3Zm24.3-9.25-2.15-2.15 5.1-5.1h-17.5v-3h17.4l-5.1-5.1 2.15-2.15 8.8 8.8Z" })] });
};
var SignOutIcon$1 = function() {
  return jsxRuntimeExports.jsxs(SVG$1, { viewBox: "0 0 48 48", children: [jsxRuntimeExports.jsx("title", { children: "Sign out" }), jsxRuntimeExports.jsx("path", { d: "M9 42q-1.2 0-2.1-.9Q6 40.2 6 39V9q0-1.2.9-2.1Q7.8 6 9 6h14.55v3H9v30h14.55v3Zm24.3-9.25-2.15-2.15 5.1-5.1h-17.5v-3h17.4l-5.1-5.1 2.15-2.15 8.8 8.8Z" })] });
};
var RestartIcon$1 = function() {
  return jsxRuntimeExports.jsxs(SVG$1, { fill: "none", stroke: "currentColor", children: [jsxRuntimeExports.jsx("title", { children: "Restart script" }), jsxRuntimeExports.jsx("path", { d: "M8 2C4.68629 2 2 4.68629 2 8C2 10.0946 3.07333 11.9385 4.7 13.0118", strokeLinecap: "round" }), jsxRuntimeExports.jsx("path", { d: "M14.0005 7.9998C14.0005 5.82095 12.8391 3.91335 11.1016 2.8623", strokeLinecap: "round" }), jsxRuntimeExports.jsx("path", { d: "M14.0003 2.3335H11.167C10.8908 2.3335 10.667 2.55735 10.667 2.8335V5.66683", strokeLinecap: "round" }), jsxRuntimeExports.jsx("path", { d: "M1.99967 13.6665L4.83301 13.6665C5.10915 13.6665 5.33301 13.4426 5.33301 13.1665L5.33301 10.3332", strokeLinecap: "round" }), jsxRuntimeExports.jsx("path", { d: "M10 10L12 12L10 14", strokeLinecap: "round", strokeLinejoin: "round" }), jsxRuntimeExports.jsx("path", { d: "M14.667 14L12.667 14", strokeLinecap: "round", strokeLinejoin: "round" })] });
};
var RunIcon$1 = function() {
  return jsxRuntimeExports.jsxs(SVG$1, { children: [jsxRuntimeExports.jsx("title", { children: "Run sandbox" }), jsxRuntimeExports.jsx("path", { d: "M11.0792 8.1078C11.2793 8.25007 11.27 8.55012 11.0616 8.67981L6.02535 11.8135C5.79638 11.956 5.5 11.7913 5.5 11.5216L5.5 8.40703L5.5 4.80661C5.5 4.52735 5.81537 4.36463 6.04296 4.52647L11.0792 8.1078Z" })] });
};
var BackwardIcon$1 = function() {
  return jsxRuntimeExports.jsxs(SVG$1, { children: [jsxRuntimeExports.jsx("title", { children: "Click to go back" }), jsxRuntimeExports.jsx("path", { d: "M9.64645 12.3536C9.84171 12.5488 10.1583 12.5488 10.3536 12.3536C10.5488 12.1583 10.5488 11.8417 10.3536 11.6464L9.64645 12.3536ZM10.3536 4.35355C10.5488 4.15829 10.5488 3.84171 10.3536 3.64644C10.1583 3.45118 9.84171 3.45118 9.64645 3.64644L10.3536 4.35355ZM6.07072 7.92929L5.71716 7.57573L6.07072 7.92929ZM10.3536 11.6464L6.42427 7.71716L5.71716 8.42426L9.64645 12.3536L10.3536 11.6464ZM6.42427 8.28284L10.3536 4.35355L9.64645 3.64644L5.71716 7.57573L6.42427 8.28284ZM6.42427 7.71716C6.58048 7.87337 6.58048 8.12663 6.42427 8.28284L5.71716 7.57573C5.48285 7.81005 5.48285 8.18995 5.71716 8.42426L6.42427 7.71716Z" })] });
};
var ForwardIcon$1 = function() {
  return jsxRuntimeExports.jsxs(SVG$1, { children: [jsxRuntimeExports.jsx("title", { children: "Click to go forward" }), jsxRuntimeExports.jsx("path", { d: "M6.35355 3.64645C6.15829 3.45118 5.84171 3.45118 5.64645 3.64645C5.45118 3.84171 5.45118 4.15829 5.64645 4.35355L6.35355 3.64645ZM5.64645 11.6464C5.45118 11.8417 5.45118 12.1583 5.64645 12.3536C5.84171 12.5488 6.15829 12.5488 6.35355 12.3536L5.64645 11.6464ZM9.92929 8.07071L10.2828 8.42426L9.92929 8.07071ZM5.64645 4.35355L9.57574 8.28284L10.2828 7.57574L6.35355 3.64645L5.64645 4.35355ZM9.57574 7.71716L5.64645 11.6464L6.35355 12.3536L10.2828 8.42426L9.57574 7.71716ZM9.57574 8.28284C9.41952 8.12663 9.41953 7.87337 9.57574 7.71716L10.2828 8.42426C10.5172 8.18995 10.5172 7.81005 10.2828 7.57574L9.57574 8.28284Z" })] });
};
var RefreshIcon$1 = function() {
  return jsxRuntimeExports.jsxs(SVG$1, { children: [jsxRuntimeExports.jsx("title", { children: "Refresh preview" }), jsxRuntimeExports.jsx("path", { clipRule: "evenodd", d: "M3.83325 7.99992C3.83325 5.69867 5.69853 3.83325 7.99934 3.83325C9.81246 3.83325 11.3563 4.99195 11.9285 6.61097C11.9396 6.6425 11.9536 6.67221 11.97 6.69992H8.80005C8.52391 6.69992 8.30005 6.92378 8.30005 7.19992C8.30005 7.47606 8.52391 7.69992 8.80005 7.69992H12.5667C12.8981 7.69992 13.1667 7.43129 13.1667 7.09992V3.33325C13.1667 3.05711 12.9429 2.83325 12.6667 2.83325C12.3906 2.83325 12.1667 3.05711 12.1667 3.33325V4.94608C11.2268 3.66522 9.7106 2.83325 7.99934 2.83325C5.14613 2.83325 2.83325 5.14651 2.83325 7.99992C2.83325 10.8533 5.14613 13.1666 7.99934 13.1666C9.91218 13.1666 11.5815 12.1266 12.474 10.5836C12.6123 10.3446 12.5306 10.0387 12.2915 9.90044C12.0525 9.76218 11.7466 9.84387 11.6084 10.0829C10.8873 11.3296 9.54072 12.1666 7.99934 12.1666C5.69853 12.1666 3.83325 10.3012 3.83325 7.99992Z", fillRule: "evenodd" })] });
};
var CleanIcon$1 = function() {
  return jsxRuntimeExports.jsxs(SVG$1, { fill: "none", stroke: "currentColor", children: [jsxRuntimeExports.jsx("title", { children: "Clean" }), jsxRuntimeExports.jsx("circle", { cx: "7.99998", cy: "8.00004", r: "4.66667", strokeLinecap: "round" }), jsxRuntimeExports.jsx("path", { d: "M4.66669 4.66663L11.3334 11.3333" })] });
};
var ExportIcon$1 = function() {
  return jsxRuntimeExports.jsxs(SVG$1, { fill: "none", stroke: "currentColor", children: [jsxRuntimeExports.jsx("title", { children: "Open on CodeSandbox" }), jsxRuntimeExports.jsx("path", { d: "M6.66665 3.33337H4.33331C3.78103 3.33337 3.33331 3.78109 3.33331 4.33337V11.6667C3.33331 12.219 3.78103 12.6667 4.33331 12.6667H11.6666C12.2189 12.6667 12.6666 12.219 12.6666 11.6667V9.33337", strokeLinecap: "round" }), jsxRuntimeExports.jsx("path", { d: "M10 3.33337H12.5667C12.6219 3.33337 12.6667 3.37815 12.6667 3.43337V6.00004", strokeLinecap: "round" }), jsxRuntimeExports.jsx("path", { d: "M7.33331 8.66668L12.5333 3.46667", strokeLinecap: "round" })] });
};
var CloseIcon$1 = function() {
  return jsxRuntimeExports.jsxs(SVG$1, { stroke: "currentColor", children: [jsxRuntimeExports.jsx("title", { children: "Close file" }), jsxRuntimeExports.jsx("path", { d: "M12 4L4 12", strokeLinecap: "round" }), jsxRuntimeExports.jsx("path", { d: "M4 4L12 12", strokeLinecap: "round" })] });
};
var ConsoleIcon$1 = function() {
  return jsxRuntimeExports.jsxs(SVG$1, { children: [jsxRuntimeExports.jsx("title", { children: "Open browser console" }), jsxRuntimeExports.jsx("path", { d: "M5.65871 3.62037C5.44905 3.44066 5.1334 3.46494 4.95368 3.6746C4.77397 3.88427 4.79825 4.19992 5.00792 4.37963L5.65871 3.62037ZM5.00792 11.6204C4.79825 11.8001 4.77397 12.1157 4.95368 12.3254C5.1334 12.5351 5.44905 12.5593 5.65871 12.3796L5.00792 11.6204ZM9.9114 7.92407L10.2368 7.54445L9.9114 7.92407ZM5.00792 4.37963L9.586 8.3037L10.2368 7.54445L5.65871 3.62037L5.00792 4.37963ZM9.586 7.6963L5.00792 11.6204L5.65871 12.3796L10.2368 8.45555L9.586 7.6963ZM9.586 8.3037C9.39976 8.14407 9.39976 7.85594 9.586 7.6963L10.2368 8.45555C10.5162 8.2161 10.5162 7.7839 10.2368 7.54445L9.586 8.3037Z" }), jsxRuntimeExports.jsx("path", { d: "M10 11.5C9.72386 11.5 9.5 11.7239 9.5 12C9.5 12.2761 9.72386 12.5 10 12.5V11.5ZM14.6667 12.5C14.9428 12.5 15.1667 12.2761 15.1667 12C15.1667 11.7239 14.9428 11.5 14.6667 11.5V12.5ZM10 12.5H14.6667V11.5H10V12.5Z" })] });
};
var _a$a;
var defaultLight$1 = {
  colors: {
    surface1: "#ffffff",
    surface2: "#EFEFEF",
    surface3: "#F3F3F3",
    disabled: "#C5C5C5",
    base: "#323232",
    clickable: "#808080",
    hover: "#4D4D4D",
    accent: "#3973E0",
    error: "#EA3323",
    errorSurface: "#FCF1F0",
    warning: "#6A4516",
    warningSurface: "#FEF2C0"
  },
  syntax: {
    plain: "#151515",
    comment: { color: "#999", fontStyle: "italic" },
    keyword: "#7C5AE3",
    tag: "#0971F1",
    punctuation: "#3B3B3B",
    definition: "#85A600",
    property: "#3B3B3B",
    static: "#3B3B3B",
    string: "#2E6BD0"
  },
  font: {
    body: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol"',
    mono: '"Fira Mono", "DejaVu Sans Mono", Menlo, Consolas, "Liberation Mono", Monaco, "Lucida Console", monospace',
    size: "13px",
    lineHeight: "20px"
  }
};
var defaultDark$1 = {
  colors: {
    surface1: "#151515",
    surface2: "#252525",
    surface3: "#2F2F2F",
    disabled: "#4D4D4D",
    base: "#808080",
    clickable: "#999999",
    hover: "#C5C5C5",
    accent: "#E5E5E5",
    error: "#FFB4A6",
    errorSurface: "#690000",
    warning: "#E7C400",
    warningSurface: "#3A3000"
  },
  syntax: {
    plain: "#FFFFFF",
    comment: { color: "#757575", fontStyle: "italic" },
    keyword: "#77B7D7",
    tag: "#DFAB5C",
    punctuation: "#ffffff",
    definition: "#86D9CA",
    property: "#77B7D7",
    static: "#C64640",
    string: "#977CDC"
  },
  font: {
    body: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol"',
    mono: '"Fira Mono", "DejaVu Sans Mono", Menlo, Consolas, "Liberation Mono", Monaco, "Lucida Console", monospace',
    size: "13px",
    lineHeight: "20px"
  }
};
var SANDPACK_THEMES$1 = {
  light: defaultLight$1,
  dark: defaultDark$1,
  auto: typeof window !== "undefined" ? ((_a$a = window === null || window === void 0 ? void 0 : window.matchMedia) === null || _a$a === void 0 ? void 0 : _a$a.call(window, "(prefers-color-scheme: dark)").matches) ? defaultDark$1 : defaultLight$1 : defaultLight$1
};
var getFileName$1 = function(filePath) {
  var lastIndexOfSlash = filePath.lastIndexOf("/");
  return filePath.slice(lastIndexOfSlash + 1);
};
var calculateNearestUniquePath$1 = function(currentPath, otherPaths) {
  var currentPathParts = (currentPath[0] === "/" ? currentPath.slice(1) : currentPath).split("/");
  var resultPathParts = [];
  if (currentPathParts.length === 1) {
    resultPathParts.unshift(currentPathParts[0]);
  } else {
    for (var fileIndex = 0; fileIndex < otherPaths.length; fileIndex++) {
      var otherPathParts = otherPaths[fileIndex].split("/");
      for (var partsFromEnd = 1; partsFromEnd <= currentPathParts.length; partsFromEnd++) {
        var currentPathPart = currentPathParts[currentPathParts.length - partsFromEnd];
        var otherPathPart = otherPathParts[otherPathParts.length - partsFromEnd];
        if (resultPathParts.length < partsFromEnd) {
          resultPathParts.unshift(currentPathPart);
        }
        if (currentPathPart !== otherPathPart) {
          break;
        }
      }
    }
  }
  if (resultPathParts.length < currentPathParts.length) {
    resultPathParts.unshift("..");
  }
  return resultPathParts.join("/");
};
var isDarkColor$1 = function(color2) {
  var r = 0;
  var g = 0;
  var b = 0;
  if (color2.startsWith("#")) {
    if (color2.length < 7) {
      return true;
    }
    r = parseInt(color2.substr(1, 2), 16);
    g = parseInt(color2.substr(3, 2), 16);
    b = parseInt(color2.substr(5, 2), 16);
  } else {
    var rgbValues = color2.replace("rgb(", "").replace("rgba(", "").replace(")", "").split(",");
    if (rgbValues.length < 3) {
      return true;
    }
    r = parseInt(rgbValues[0], 10);
    g = parseInt(rgbValues[1], 10);
    b = parseInt(rgbValues[2], 10);
  }
  var yiq = (r * 299 + g * 587 + b * 114) / 1e3;
  return yiq < 128;
};
var lastCount$1 = 0;
var generateRandomId$2 = function() {
  var random = +(Date.now().toString(10).substr(0, 4) + lastCount$1++);
  return random.toString(16);
};
var _a$9;
var THEME_PREFIX$1 = "sp";
var createTheme$1 = (_a$9 = X({
  prefix: THEME_PREFIX$1
}), _a$9.createTheme), css = _a$9.css;
_a$9.getCssText;
var keyframes$1 = _a$9.keyframes;
var defaultVariables$1 = {
  space: new Array(11).fill(" ").reduce(function(acc, _, index2) {
    var _a2;
    return __assign$1(__assign$1({}, acc), (_a2 = {}, _a2[index2 + 1] = "".concat((index2 + 1) * 4, "px"), _a2));
  }, {}),
  border: { radius: "4px" },
  layout: { height: "300px", headerHeight: "40px" },
  transitions: { default: "150ms ease" },
  zIndices: {
    base: "1",
    overlay: "2",
    top: "3"
  }
};
var standardizeStitchesTheme$1 = function(theme) {
  var syntaxEntries = Object.entries(theme.syntax);
  var syntax = syntaxEntries.reduce(function(tokenAcc, _a2) {
    var _b;
    var tokenName = _a2[0], tokenValue = _a2[1];
    var newValues = (_b = {}, _b["color-".concat(tokenName)] = tokenValue, _b);
    if (typeof tokenValue === "object") {
      newValues = Object.entries(tokenValue).reduce(function(valueAcc, _a3) {
        var _b2;
        var styleProp = _a3[0], styleValue = _a3[1];
        return __assign$1(__assign$1({}, valueAcc), (_b2 = {}, _b2["".concat(styleProp, "-").concat(tokenName)] = styleValue, _b2));
      }, {});
    }
    return __assign$1(__assign$1({}, tokenAcc), newValues);
  }, {});
  return __assign$1(__assign$1({}, defaultVariables$1), { colors: theme.colors, font: theme.font, syntax });
};
var standardizeTheme$1 = function(inputTheme) {
  var _a2, _b, _c2, _d, _e;
  if (inputTheme === void 0) {
    inputTheme = "light";
  }
  var defaultLightThemeKey = "default";
  if (typeof inputTheme === "string") {
    var predefinedTheme = SANDPACK_THEMES$1[inputTheme];
    if (!predefinedTheme) {
      throw new Error("[sandpack-react]: invalid theme '".concat(inputTheme, "' provided."));
    }
    return {
      theme: predefinedTheme,
      id: inputTheme,
      mode: isDarkColor$1(predefinedTheme.colors.surface1) ? "dark" : "light"
    };
  }
  var mode = isDarkColor$1((_b = (_a2 = inputTheme === null || inputTheme === void 0 ? void 0 : inputTheme.colors) === null || _a2 === void 0 ? void 0 : _a2.surface1) !== null && _b !== void 0 ? _b : defaultLight$1.colors.surface1) ? "dark" : "light";
  var baseTheme = mode === "dark" ? defaultDark$1 : defaultLight$1;
  var colorsByMode = __assign$1(__assign$1({}, baseTheme.colors), (_c2 = inputTheme === null || inputTheme === void 0 ? void 0 : inputTheme.colors) !== null && _c2 !== void 0 ? _c2 : {});
  var syntaxByMode = __assign$1(__assign$1({}, baseTheme.syntax), (_d = inputTheme === null || inputTheme === void 0 ? void 0 : inputTheme.syntax) !== null && _d !== void 0 ? _d : {});
  var fontByMode = __assign$1(__assign$1({}, baseTheme.font), (_e = inputTheme === null || inputTheme === void 0 ? void 0 : inputTheme.font) !== null && _e !== void 0 ? _e : {});
  var theme = {
    colors: colorsByMode,
    syntax: syntaxByMode,
    font: fontByMode
  };
  var id = inputTheme ? simpleHashFunction$1(JSON.stringify(theme)) : defaultLightThemeKey;
  return {
    theme,
    id: "sp-".concat(id),
    mode
  };
};
var simpleHashFunction$1 = function(str) {
  var hash = 0;
  for (var i = 0; i < str.length; hash &= hash) {
    hash = 31 * hash + str.charCodeAt(i++);
  }
  return Math.abs(hash);
};
var fakeCss$1 = function() {
  return "";
};
fakeCss$1.toString = fakeCss$1;
var ClassNamesContext$1 = reactExports.createContext({});
var ClassNamesProvider$1 = function(_a2) {
  var children = _a2.children, classes = _a2.classes;
  return jsxRuntimeExports.jsx(ClassNamesContext$1.Provider, { value: classes || {}, children });
};
var useClassNames$1 = function() {
  var contextClassNames = reactExports.useContext(ClassNamesContext$1);
  return function sandpackClassNames(customClassName, allClassNames) {
    if (allClassNames === void 0) {
      allClassNames = [];
    }
    var custom = "".concat(THEME_PREFIX$1, "-").concat(customClassName);
    return joinClassNames$1.apply(void 0, __spreadArray$1(__spreadArray$1([], allClassNames, false), [custom, contextClassNames[custom]], false));
  };
};
var joinClassNames$1 = function() {
  var args = [];
  for (var _i = 0; _i < arguments.length; _i++) {
    args[_i] = arguments[_i];
  }
  return args.filter(Boolean).join(" ");
};
var wrapperClassName$3$1 = css({
  all: "initial",
  fontSize: "$font$size",
  fontFamily: "$font$body",
  display: "block",
  boxSizing: "border-box",
  textRendering: "optimizeLegibility",
  WebkitTapHighlightColor: "transparent",
  WebkitFontSmoothing: "subpixel-antialiased",
  variants: {
    variant: {
      dark: { colorScheme: "dark" },
      light: { colorScheme: "light" }
    }
  },
  "@media screen and (min-resolution: 2dppx)": {
    WebkitFontSmoothing: "antialiased",
    MozOsxFontSmoothing: "grayscale"
  },
  "*": { boxSizing: "border-box" },
  ".sp-wrapper:focus": { outline: "0" }
});
var SandpackThemeContext$1 = reactExports.createContext({
  theme: defaultLight$1,
  id: "light",
  mode: "light"
});
var SandpackThemeProvider$1 = function(_a2) {
  var themeFromProps = _a2.theme, children = _a2.children, className = _a2.className, props = __rest$1(_a2, ["theme", "children", "className"]);
  var _b = reactExports.useState(themeFromProps), prefferedTheme = _b[0], setPreferredTheme = _b[1];
  var _c2 = standardizeTheme$1(prefferedTheme), theme = _c2.theme, id = _c2.id, mode = _c2.mode;
  var classNames = useClassNames$1();
  var themeClassName = reactExports.useMemo(function() {
    return createTheme$1(id, standardizeStitchesTheme$1(theme));
  }, [theme, id]);
  reactExports.useEffect(function() {
    if (themeFromProps !== "auto") {
      setPreferredTheme(themeFromProps);
      return;
    }
    var colorSchemeChange = function(_a3) {
      var matches = _a3.matches;
      setPreferredTheme(matches ? "dark" : "light");
    };
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", colorSchemeChange);
    return function() {
      window.matchMedia("(prefers-color-scheme: dark)").removeEventListener("change", colorSchemeChange);
    };
  }, [themeFromProps]);
  return jsxRuntimeExports.jsx(SandpackThemeContext$1.Provider, { value: { theme, id, mode }, children: jsxRuntimeExports.jsx("div", __assign$1({ className: classNames("wrapper", [
    themeClassName,
    wrapperClassName$3$1({ variant: mode }),
    className
  ]) }, props, { children })) });
};
SandpackThemeContext$1.Consumer;
var commonFiles$1 = {
  "/styles.css": {
    code: "body {\n  font-family: sans-serif;\n  -webkit-font-smoothing: auto;\n  -moz-font-smoothing: auto;\n  -moz-osx-font-smoothing: grayscale;\n  font-smoothing: auto;\n  text-rendering: optimizeLegibility;\n  font-smooth: always;\n  -webkit-tap-highlight-color: transparent;\n  -webkit-touch-callout: none;\n}\n\nh1 {\n  font-size: 1.5rem;\n}"
  }
};
var ASTRO_TEMPLATE$1 = {
  files: {
    "/src/styles.css": commonFiles$1["/styles.css"],
    "/src/pages/index.astro": {
      code: '---\nimport "../styles.css";\nconst data = "world";\n---\n\n<h1>Hello {data}</h1>\n\n<style>\n  h1 {\n    font-size: 1.5rem;\n  }\n</style>'
    },
    ".env": {
      code: 'ASTRO_TELEMETRY_DISABLED="1"'
    },
    "/package.json": {
      code: JSON.stringify({
        dependencies: {
          astro: "^1.6.12",
          "esbuild-wasm": "^0.15.16"
        },
        scripts: {
          dev: "astro dev",
          start: "astro dev",
          build: "astro build",
          preview: "astro preview",
          astro: "astro"
        }
      })
    }
  },
  main: "/src/pages/index.astro",
  environment: "node"
};
var NEXTJS_TEMPLATE$1 = {
  files: __assign$1(__assign$1({}, commonFiles$1), { "/pages/_app.js": {
    code: "import '../styles.css'\n\nexport default function MyApp({ Component, pageProps }) {\n  return <Component {...pageProps} />\n}"
  }, "/pages/index.js": {
    code: 'export default function Home({ data }) {\n  return (\n    <div>\n      <h1>Hello {data}</h1>\n    </div>\n  );\n}\n  \nexport function getServerSideProps() {\n  return {\n    props: { data: "world" },\n  }\n}\n'
  }, "/next.config.js": {
    code: "/** @type {import('next').NextConfig} */\nconst nextConfig = {\n  reactStrictMode: true,\n  swcMinify: true,\n}\n\nmodule.exports = nextConfig\n"
  }, "/package.json": {
    code: JSON.stringify({
      name: "my-app",
      version: "0.1.0",
      private: true,
      scripts: {
        dev: "NEXT_TELEMETRY_DISABLED=1 next dev",
        build: "next build",
        start: "next start",
        lint: "next lint"
      },
      dependencies: {
        next: "12.1.6",
        react: "18.2.0",
        "react-dom": "18.2.0",
        "@next/swc-wasm-nodejs": "12.1.6"
      }
    })
  } }),
  main: "/pages/index.js",
  environment: "node"
};
var NODE_TEMPLATE$1 = {
  files: {
    "/index.js": {
      code: "const http = require('http');\n\nconst hostname = '127.0.0.1';\nconst port = 3000;\n\nconst server = http.createServer((req, res) => {\n  res.statusCode = 200;\n  res.setHeader('Content-Type', 'text/html');\n  res.end('Hello world');\n});\n\nserver.listen(port, hostname, () => {\n  console.log(`Server running at http://${hostname}:${port}/`);\n});"
    },
    "/package.json": {
      code: JSON.stringify({
        dependencies: {},
        scripts: { start: "node index.js" },
        main: "index.js"
      })
    }
  },
  main: "/index.js",
  environment: "node"
};
var VITE_TEMPLATE$1 = {
  files: __assign$1(__assign$1({}, commonFiles$1), { "/index.js": {
    code: 'import "./styles.css";\n\ndocument.getElementById("app").innerHTML = `\n<h1>Hello world</h1>\n`;\n'
  }, "/index.html": {
    code: '<!DOCTYPE html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>Vite App</title>\n  </head>\n  <body>\n    <div id="app"></div>\n    <script type="module" src="/index.js"><\/script>\n  </body>\n</html>\n'
  }, "/package.json": {
    code: JSON.stringify({
      scripts: {
        dev: "vite",
        build: "vite build",
        preview: "vite preview"
      },
      devDependencies: {
        vite: "4.1.4",
        "esbuild-wasm": "0.17.12"
      }
    })
  } }),
  main: "/index.js",
  environment: "node"
};
var VITE_PREACT_TEMPLATE$1 = {
  files: __assign$1(__assign$1({}, commonFiles$1), { "/App.jsx": {
    code: 'export default function App() {\n  const data = "world"\n\n  return <h1>Hello {data}</h1>\n}\n'
  }, "/index.jsx": {
    code: 'import { render } from "preact";\nimport "./styles.css";\n\nimport App from "./App";\n\nconst root = document.getElementById("root");\nrender(<App />, root);\n'
  }, "/index.html": {
    code: '<!DOCTYPE html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>Vite App</title>\n  </head>\n  <body>\n    <div id="root"></div>\n    <script type="module" src="/index.jsx"><\/script>\n  </body>\n</html>\n'
  }, "/package.json": {
    code: JSON.stringify({
      scripts: {
        dev: "vite",
        build: "vite build",
        preview: "vite preview"
      },
      dependencies: {
        preact: "^10.16.0"
      },
      devDependencies: {
        "@preact/preset-vite": "^2.5.0",
        vite: "4.1.4",
        "esbuild-wasm": "0.17.12"
      }
    })
  }, "/vite.config.js": {
    code: `import { defineConfig } from "vite";
import preact from '@preact/preset-vite'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [preact()],
});
`
  } }),
  main: "/App.jsx",
  environment: "node"
};
var VITE_PREACT_TS_TEMPLATE$1 = {
  files: __assign$1(__assign$1({}, commonFiles$1), { "/App.tsx": {
    code: 'export default function App() {\n  const data: string = "world"\n\n  return <h1>Hello {data}</h1>\n}\n'
  }, "/index.tsx": {
    code: 'import { render } from "preact";\nimport "./styles.css";\n\nimport App from "./App";\n\nconst root = document.getElementById("root") as HTMLElement;\nrender(<App />, root);\n'
  }, "/index.html": {
    code: '<!DOCTYPE html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>Vite App</title>\n  </head>\n  <body>\n    <div id="root"></div>\n    <script type="module" src="/index.tsx"><\/script>\n  </body>\n</html>\n'
  }, "/tsconfig.json": {
    code: JSON.stringify({
      compilerOptions: {
        target: "ESNext",
        useDefineForClassFields: true,
        lib: ["DOM", "DOM.Iterable", "ESNext"],
        allowJs: false,
        skipLibCheck: true,
        esModuleInterop: false,
        allowSyntheticDefaultImports: true,
        strict: true,
        forceConsistentCasingInFileNames: true,
        module: "ESNext",
        moduleResolution: "Node",
        resolveJsonModule: true,
        isolatedModules: true,
        noEmit: true,
        jsx: "react-jsx",
        jsxImportSource: "preact"
      },
      include: ["src"],
      references: [{ path: "./tsconfig.node.json" }]
    }, null, 2)
  }, "/tsconfig.node.json": {
    code: JSON.stringify({
      compilerOptions: {
        composite: true,
        module: "ESNext",
        moduleResolution: "Node",
        allowSyntheticDefaultImports: true
      },
      include: ["vite.config.ts"]
    }, null, 2)
  }, "/package.json": {
    code: JSON.stringify({
      scripts: {
        dev: "vite",
        build: "tsc && vite build",
        preview: "vite preview"
      },
      dependencies: {
        preact: "^10.16.0"
      },
      devDependencies: {
        "@preact/preset-vite": "^2.5.0",
        typescript: "^4.9.5",
        vite: "4.1.4",
        "esbuild-wasm": "^0.17.12"
      }
    }, null, 2)
  }, "/vite-env.d.ts": {
    code: '/// <reference types="vite/client" />'
  }, "/vite.config.ts": {
    code: "import { defineConfig } from 'vite'\nimport preact from '@preact/preset-vite'\n\n// https://vitejs.dev/config/\nexport default defineConfig({\n  plugins: [preact()],\n})\n"
  } }),
  main: "/App.tsx",
  environment: "node"
};
var VITE_REACT_TEMPLATE$1 = {
  files: __assign$1(__assign$1({}, commonFiles$1), { "/App.jsx": {
    code: 'export default function App() {\n  const data = "world"\n\n  return <h1>Hello {data}</h1>\n}\n'
  }, "/index.jsx": {
    code: 'import { StrictMode } from "react";\nimport { createRoot } from "react-dom/client";\nimport "./styles.css";\n\nimport App from "./App";\n\nconst root = createRoot(document.getElementById("root"));\nroot.render(\n  <StrictMode>\n    <App />\n  </StrictMode>\n);'
  }, "/index.html": {
    code: '<!DOCTYPE html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>Vite App</title>\n  </head>\n  <body>\n    <div id="root"></div>\n    <script type="module" src="/index.jsx"><\/script>\n  </body>\n</html>\n'
  }, "/package.json": {
    code: JSON.stringify({
      scripts: {
        dev: "vite",
        build: "vite build",
        preview: "vite preview"
      },
      dependencies: {
        react: "^18.2.0",
        "react-dom": "^18.2.0"
      },
      devDependencies: {
        "@vitejs/plugin-react": "3.1.0",
        vite: "4.1.4",
        "esbuild-wasm": "0.17.12"
      }
    })
  }, "/vite.config.js": {
    code: 'import { defineConfig } from "vite";\nimport react from "@vitejs/plugin-react";\n\n// https://vitejs.dev/config/\nexport default defineConfig({\n  plugins: [react()],\n});\n'
  } }),
  main: "/App.jsx",
  environment: "node"
};
var VITE_REACT_TS_TEMPLATE$1 = {
  files: __assign$1(__assign$1({}, commonFiles$1), { "/App.tsx": {
    code: 'export default function App() {\n  const data: string = "world"\n\n  return <h1>Hello {data}</h1>\n}\n'
  }, "/index.tsx": {
    code: 'import { StrictMode } from "react";\nimport { createRoot } from "react-dom/client";\nimport "./styles.css";\n\nimport App from "./App";\nimport React from "react";\n\nconst root = createRoot(document.getElementById("root") as HTMLElement);\nroot.render(\n  <StrictMode>\n    <App />\n  </StrictMode>\n);\n'
  }, "/index.html": {
    code: '<!DOCTYPE html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>Vite App</title>\n  </head>\n  <body>\n    <div id="root"></div>\n    <script type="module" src="/index.tsx"><\/script>\n  </body>\n</html>\n'
  }, "/tsconfig.json": {
    code: JSON.stringify({
      compilerOptions: {
        target: "ESNext",
        useDefineForClassFields: true,
        lib: ["DOM", "DOM.Iterable", "ESNext"],
        allowJs: false,
        skipLibCheck: true,
        esModuleInterop: false,
        allowSyntheticDefaultImports: true,
        strict: true,
        forceConsistentCasingInFileNames: true,
        module: "ESNext",
        moduleResolution: "Node",
        resolveJsonModule: true,
        isolatedModules: true,
        noEmit: true,
        jsx: "react-jsx"
      },
      include: ["src"],
      references: [{ path: "./tsconfig.node.json" }]
    }, null, 2)
  }, "/tsconfig.node.json": {
    code: JSON.stringify({
      compilerOptions: {
        composite: true,
        module: "ESNext",
        moduleResolution: "Node",
        allowSyntheticDefaultImports: true
      },
      include: ["vite.config.ts"]
    }, null, 2)
  }, "/package.json": {
    code: JSON.stringify({
      scripts: {
        dev: "vite",
        build: "tsc && vite build",
        preview: "vite preview"
      },
      dependencies: {
        react: "^18.2.0",
        "react-dom": "^18.2.0"
      },
      devDependencies: {
        "@types/react": "^18.0.28",
        "@types/react-dom": "^18.0.11",
        "@vitejs/plugin-react": "^3.1.0",
        typescript: "^4.9.5",
        vite: "4.1.4",
        "esbuild-wasm": "^0.17.12"
      }
    }, null, 2)
  }, "/vite-env.d.ts": {
    code: '/// <reference types="vite/client" />'
  }, "/vite.config.ts": {
    code: "import { defineConfig } from 'vite'\nimport react from '@vitejs/plugin-react'\n\n// https://vitejs.dev/config/\nexport default defineConfig({\n  plugins: [react()],\n})\n"
  } }),
  main: "/App.tsx",
  environment: "node"
};
var VITE_SVELTE_TEMPLATE$1 = {
  files: {
    "/src/styles.css": commonFiles$1["/styles.css"],
    "/src/App.svelte": {
      code: '<script>\nconst data = "world";\n<\/script>\n\n<h1>Hello {data}</h1>\n\n<style>\nh1 {\n  font-size: 1.5rem;\n}\n</style>'
    },
    "/src/main.js": {
      code: `import App from './App.svelte'
import "./styles.css"

const app = new App({
  target: document.getElementById('app'),
})

export default app`
    },
    "/index.html": {
      code: '<!DOCTYPE html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>Vite App</title>\n  </head>\n  <body>\n    <div id="app"></div>\n    <script type="module" src="/src/main.js"><\/script>\n  </body>\n</html>\n'
    },
    "/vite.config.js": {
      code: "import { defineConfig } from 'vite'\nimport { svelte } from '@sveltejs/vite-plugin-svelte'\n\n// https://vitejs.dev/config/\nexport default defineConfig({\n  plugins: [svelte()],\n})"
    },
    "/package.json": {
      code: JSON.stringify({
        type: "module",
        scripts: {
          dev: "vite"
        },
        devDependencies: {
          "@sveltejs/vite-plugin-svelte": "^2.0.2",
          svelte: "^3.55.1",
          vite: "4.0.4",
          "esbuild-wasm": "^0.17.12"
        }
      })
    }
  },
  main: "/src/App.svelte",
  environment: "node"
};
var VITE_SVELTE_TS_TEMPLATE$1 = {
  files: {
    "/src/styles.css": commonFiles$1["/styles.css"],
    "/src/App.svelte": {
      code: '<script lang="ts">\nconst data: string = "world";\n<\/script>\n\n<h1>Hello {data}</h1>\n\n<style>\nh1 {\n  font-size: 1.5rem;\n}\n</style>'
    },
    "/src/main.ts": {
      code: `import App from './App.svelte'
import "./styles.css"

const app = new App({
  target: document.getElementById('app'),
})

export default app`
    },
    "/index.html": {
      code: '<!DOCTYPE html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>Vite App</title>\n  </head>\n  <body>\n    <div id="app"></div>\n    <script type="module" src="/src/main.ts"><\/script>\n  </body>\n</html>\n'
    },
    "/vite-env.d.ts": {
      code: '/// <reference types="svelte" />\n/// <reference types="vite/client" />'
    },
    "svelte.config.js": {
      code: "import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'\n\nexport default {\n  // Consult https://svelte.dev/docs#compile-time-svelte-preprocess\n  // for more information about preprocessors\n  preprocess: vitePreprocess(),\n}\n"
    },
    "/vite.config.ts": {
      code: "import { defineConfig } from 'vite'\nimport { svelte } from '@sveltejs/vite-plugin-svelte'\n\n// https://vitejs.dev/config/\nexport default defineConfig({\n  plugins: [svelte()],\n})"
    },
    "tsconfig.json": {
      code: JSON.stringify({
        extends: "@tsconfig/svelte/tsconfig.json",
        compilerOptions: {
          target: "ESNext",
          useDefineForClassFields: true,
          module: "ESNext",
          resolveJsonModule: true,
          allowJs: true,
          checkJs: true,
          isolatedModules: true
        },
        include: [
          "src/**/*.d.ts",
          "src/**/*.ts",
          "src/**/*.js",
          "src/**/*.svelte"
        ],
        references: [{ path: "./tsconfig.node.json" }]
      }, null, 2)
    },
    "tsconfig.node.json": {
      code: JSON.stringify({
        compilerOptions: {
          composite: true,
          module: "ESNext",
          moduleResolution: "Node"
        },
        include: ["vite.config.ts"]
      }, null, 2)
    },
    "/package.json": {
      code: JSON.stringify({
        type: "module",
        scripts: {
          dev: "vite"
        },
        devDependencies: {
          "@sveltejs/vite-plugin-svelte": "^2.0.2",
          "@tsconfig/svelte": "^3.0.0",
          svelte: "^3.55.1",
          "svelte-check": "^2.10.3",
          tslib: "^2.5.0",
          vite: "4.1.4",
          "esbuild-wasm": "^0.17.12"
        }
      }, null, 2)
    }
  },
  main: "/src/App.svelte",
  environment: "node"
};
var VITE_VUE_TEMPLATE$1 = {
  files: {
    "/src/styles.css": commonFiles$1["/styles.css"],
    "/src/App.vue": {
      code: '<script setup>\nimport { ref } from "vue";\n\nconst data = ref("world");\n<\/script>\n\n<template>\n  <h1>Hello {{ data }}</h1>\n</template>\n\n<style>\nh1 {\n  font-size: 1.5rem;\n}\n</style>'
    },
    "/src/main.js": {
      code: `import { createApp } from 'vue'
import App from './App.vue'
import "./styles.css"
            
createApp(App).mount('#app')            
`
    },
    "/index.html": {
      code: '<!DOCTYPE html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>Vite App</title>\n  </head>\n  <body>\n    <div id="app"></div>\n    <script type="module" src="/src/main.js"><\/script>\n  </body>\n</html>\n'
    },
    "/vite.config.js": {
      code: "import { defineConfig } from 'vite'\nimport vue from '@vitejs/plugin-vue'\n\n// https://vitejs.dev/config/\nexport default defineConfig({\n  plugins: [vue()]\n})\n"
    },
    "/package.json": {
      code: JSON.stringify({
        scripts: {
          dev: "vite",
          build: "vite build",
          preview: "vite preview"
        },
        dependencies: {
          vue: "^3.2.45"
        },
        devDependencies: {
          "@vitejs/plugin-vue": "3.2.0",
          vite: "4.1.4",
          "esbuild-wasm": "0.17.12"
        }
      })
    }
  },
  main: "/src/App.vue",
  environment: "node"
};
var VITE_VUE_TS_TEMPLATE$1 = {
  files: {
    "/src/styles.css": commonFiles$1["/styles.css"],
    "/src/App.vue": {
      code: '<script setup lang="ts">\nimport { ref } from "vue";\n\nconst data = ref<string>("world");\n<\/script>\n\n<template>\n  <h1>Hello {{ data }}</h1>\n</template>\n\n<style>\nh1 {\n  font-size: 1.5rem;\n}\n</style>'
    },
    "/src/main.ts": {
      code: `import { createApp } from 'vue'
import App from './App.vue'
import "./styles.css"

createApp(App).mount('#app')
`
    },
    "/index.html": {
      code: '<!DOCTYPE html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>Vite App</title>\n  </head>\n  <body>\n    <div id="app"></div>\n    <script type="module" src="/src/main.ts"><\/script>\n  </body>\n</html>\n'
    },
    "/vite-env.d.ts": {
      code: '/// <reference types="vite/client" />'
    },
    "/vite.config.ts": {
      code: "import { defineConfig } from 'vite'\nimport vue from '@vitejs/plugin-vue'\n\n// https://vitejs.dev/config/\nexport default defineConfig({\n  plugins: [vue()]\n})\n"
    },
    "tsconfig.json": {
      code: JSON.stringify({
        compilerOptions: {
          target: "ESNext",
          useDefineForClassFields: true,
          module: "ESNext",
          moduleResolution: "Node",
          strict: true,
          jsx: "preserve",
          resolveJsonModule: true,
          isolatedModules: true,
          esModuleInterop: true,
          lib: ["ESNext", "DOM"],
          skipLibCheck: true,
          noEmit: true
        },
        include: [
          "src/**/*.ts",
          "src/**/*.d.ts",
          "src/**/*.tsx",
          "src/**/*.vue"
        ],
        references: [{ path: "./tsconfig.node.json" }]
      }, null, 2)
    },
    "tsconfig.node.json": {
      code: JSON.stringify({
        compilerOptions: {
          composite: true,
          module: "ESNext",
          moduleResolution: "Node",
          allowSyntheticDefaultImports: true
        },
        include: ["vite.config.ts"]
      }, null, 2)
    },
    "/package.json": {
      code: JSON.stringify({
        scripts: {
          dev: "vite",
          build: "tsc && vite build",
          preview: "vite preview"
        },
        dependencies: {
          vue: "^3.2.47"
        },
        devDependencies: {
          "@vitejs/plugin-vue": "^4.0.0",
          vite: "4.1.4",
          "vue-tsc": "^1.2.0",
          typescript: "^4.9.5",
          "esbuild-wasm": "^0.17.12"
        }
      }, null, 2)
    }
  },
  main: "/src/App.vue",
  environment: "node"
};
var ANGULAR_TEMPLATE$1 = {
  files: {
    "/src/app/app.component.css": commonFiles$1["/styles.css"],
    "/src/app/app.component.html": {
      code: "<div>\n<h1>{{ helloWorld }}</h1>\n</div>     \n"
    },
    "/src/app/app.component.ts": {
      code: 'import { Component } from "@angular/core";\n\n@Component({\n  selector: "app-root",\n  templateUrl: "./app.component.html",\n  styleUrls: ["./app.component.css"]\n})\nexport class AppComponent {\n  helloWorld = "Hello world";\n}           \n'
    },
    "/src/app/app.module.ts": {
      code: 'import { BrowserModule } from "@angular/platform-browser";\nimport { NgModule } from "@angular/core";\n      \nimport { AppComponent } from "./app.component";\n      \n@NgModule({\n  declarations: [AppComponent],\n  imports: [BrowserModule],\n  providers: [],\n  bootstrap: [AppComponent]\n})\nexport class AppModule {}       \n'
    },
    "/src/index.html": {
      code: '<!doctype html>\n<html lang="en">\n      \n<head>\n  <meta charset="utf-8">\n  <title>Angular</title>\n  <base href="/">\n      \n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <link rel="icon" type="image/x-icon" href="favicon.ico">\n</head>\n      \n<body>\n   <app-root></app-root>\n</body>\n      \n</html>\n'
    },
    "/src/main.ts": {
      code: 'import { enableProdMode } from "@angular/core";\nimport { platformBrowserDynamic } from "@angular/platform-browser-dynamic";\n      \nimport { AppModule } from "./app/app.module";      \n\nplatformBrowserDynamic()\n  .bootstrapModule(AppModule)\n  .catch(err => console.log(err));\n      \n'
    },
    "/src/polyfills.ts": {
      code: 'import "core-js/proposals/reflect-metadata";   \n      import "zone.js/dist/zone";\n'
    },
    "/package.json": {
      code: JSON.stringify({
        dependencies: {
          "@angular/core": "^11.2.0",
          "@angular/platform-browser": "^11.2.0",
          "@angular/platform-browser-dynamic": "^11.2.0",
          "@angular/common": "^11.2.0",
          "@angular/compiler": "^11.2.0",
          "zone.js": "0.11.3",
          "core-js": "3.8.3",
          rxjs: "6.6.3"
        },
        main: "/src/main.ts"
      })
    }
  },
  main: "/src/app/app.component.ts",
  environment: "angular-cli"
};
var REACT_TEMPLATE$1 = {
  files: __assign$1(__assign$1({}, commonFiles$1), { "/App.js": {
    code: "export default function App() {\n  return <h1>Hello world</h1>\n}\n"
  }, "/index.js": {
    code: 'import React, { StrictMode } from "react";\nimport { createRoot } from "react-dom/client";\nimport "./styles.css";\n\nimport App from "./App";\n\nconst root = createRoot(document.getElementById("root"));\nroot.render(\n  <StrictMode>\n    <App />\n  </StrictMode>\n);'
  }, "/public/index.html": {
    code: '<!DOCTYPE html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8">\n    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n    <title>Document</title>\n  </head>\n  <body>\n    <div id="root"></div>\n  </body>\n</html>'
  }, "/package.json": {
    code: JSON.stringify({
      dependencies: {
        react: "^18.0.0",
        "react-dom": "^18.0.0",
        "react-scripts": "^5.0.0"
      },
      main: "/index.js"
    })
  } }),
  main: "/App.js",
  environment: "create-react-app"
};
var REACT_TYPESCRIPT_TEMPLATE$1 = {
  files: __assign$1(__assign$1({}, commonFiles$1), { "tsconfig.json": {
    code: '{\n  "include": [\n    "./**/*"\n  ],\n  "compilerOptions": {\n    "strict": true,\n    "esModuleInterop": true,\n    "lib": [ "dom", "es2015" ],\n    "jsx": "react-jsx"\n  }\n}'
  }, "/App.tsx": {
    code: "export default function App(): JSX.Element {\n  return <h1>Hello world</h1>\n}\n"
  }, "/index.tsx": {
    code: 'import React, { StrictMode } from "react";\nimport { createRoot } from "react-dom/client";\nimport "./styles.css";\n\nimport App from "./App";\n\nconst root = createRoot(document.getElementById("root"));\nroot.render(\n  <StrictMode>\n    <App />\n  </StrictMode>\n);'
  }, "/public/index.html": {
    code: '<!DOCTYPE html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8">\n    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n    <title>Document</title>\n  </head>\n  <body>\n    <div id="root"></div>\n  </body>\n</html>'
  }, "/package.json": {
    code: JSON.stringify({
      dependencies: {
        react: "^18.0.0",
        "react-dom": "^18.0.0",
        "react-scripts": "^4.0.0"
      },
      devDependencies: {
        "@types/react": "^18.0.0",
        "@types/react-dom": "^18.0.0",
        typescript: "^4.0.0"
      },
      main: "/index.tsx"
    })
  } }),
  main: "/App.tsx",
  environment: "create-react-app"
};
var SOLID_TEMPLATE$1 = {
  files: __assign$1(__assign$1({}, commonFiles$1), { "/App.tsx": {
    code: 'import { Component } from "solid-js";\n\nconst App: Component = () => {\n  return <h1>Hello world</h1>\n};\n\nexport default App;'
  }, "/index.tsx": {
    code: 'import { render } from "solid-js/web";\nimport App from "./App";\n\nimport "./styles.css";\n\nrender(() => <App />, document.getElementById("app"));'
  }, "/index.html": {
    code: '<html>\n<head>\n  <title>Parcel Sandbox</title>\n  <meta charset="UTF-8" />\n</head>\n<body>\n  <div id="app"></div>\n  <script src="src/index.tsx"><\/script>\n</body>\n</html>'
  }, "/package.json": {
    code: JSON.stringify({
      dependencies: {
        "solid-js": "1.3.15"
      },
      main: "/index.tsx"
    })
  } }),
  main: "/App.tsx",
  environment: "solid"
};
var SVELTE_TEMPLATE$1 = {
  files: __assign$1(__assign$1({}, commonFiles$1), { "/App.svelte": {
    code: "<style>\n  h1 {\n    font-size: 1.5rem;\n  }\n</style>\n\n<script>\n  let name = 'world';\n<\/script>\n\n<main>\n  <h1>Hello {name}</h1>\n</main>"
  }, "/index.js": {
    code: 'import App from "./App.svelte";\nimport "./styles.css";\n\nconst app = new App({\n  target: document.body\n});\n\nexport default app;\n      '
  }, "/public/index.html": {
    code: '<!DOCTYPE html>\n<html>\n  <head>\n    <meta charset="utf8" />\n    <meta name="viewport" content="width=device-width" />\n\n    <title>Svelte app</title>\n\n    <link rel="stylesheet" href="public/bundle.css" />\n  </head>\n\n  <body>\n    <script src="bundle.js"><\/script>\n  </body>\n</html>'
  }, "/package.json": {
    code: JSON.stringify({
      dependencies: {
        svelte: "^3.0.0"
      },
      main: "/index.js"
    })
  } }),
  main: "/App.svelte",
  environment: "svelte"
};
var TEST_TYPESCRIPT_TEMPLATE$1 = {
  files: {
    "tsconfig.json": {
      code: '{\n  "include": [\n    "./**/*"\n  ],\n  "compilerOptions": {\n    "strict": true,\n    "esModuleInterop": true,\n    "lib": [ "dom", "es2015" ],\n    "jsx": "react-jsx"\n  }\n}'
    },
    "/add.ts": {
      code: "export const add = (a: number, b: number): number => a + b;"
    },
    "/add.test.ts": {
      code: "import { add } from './add';\n\ndescribe('add', () => {\n  test('Commutative Law of Addition', () => {\n    expect(add(1, 2)).toBe(add(2, 1));\n  });\n});"
    },
    "package.json": {
      code: JSON.stringify({
        dependencies: {},
        devDependencies: { typescript: "^4.0.0" },
        main: "/add.ts"
      })
    }
  },
  main: "/add.test.ts",
  environment: "parcel",
  mode: "tests"
};
var VANILLA_TEMPLATE$1 = {
  files: __assign$1(__assign$1({}, commonFiles$1), { "/index.js": {
    code: 'import "./styles.css";\n\ndocument.getElementById("app").innerHTML = `\n<h1>Hello world</h1>\n`;\n'
  }, "/index.html": {
    code: '<!DOCTYPE html>\n<html>\n\n<head>\n  <title>Parcel Sandbox</title>\n  <meta charset="UTF-8" />\n</head>\n\n<body>\n  <div id="app"></div>\n\n  <script src="index.js">\n  <\/script>\n</body>\n\n</html>'
  }, "/package.json": {
    code: JSON.stringify({
      dependencies: {},
      main: "/index.js"
    })
  } }),
  main: "/index.js",
  environment: "parcel"
};
var VANILLA_TYPESCRIPT_TEMPLATE$1 = {
  files: __assign$1(__assign$1({}, commonFiles$1), { "tsconfig.json": {
    code: '{\n  "compilerOptions": {\n    "strict": true,\n    "module": "commonjs",\n    "jsx": "preserve",\n    "esModuleInterop": true,\n    "sourceMap": true,\n    "allowJs": true,\n    "lib": [\n      "es6",\n      "dom"\n    ],\n    "rootDir": "src",\n    "moduleResolution": "node"\n  }\n}'
  }, "/index.ts": {
    code: 'import "./styles.css";\n\ndocument.getElementById("app").innerHTML = `\n<h1>Hello world</h1>\n`;\n'
  }, "/index.html": {
    code: '<!DOCTYPE html>\n<html>\n\n<head>\n  <title>Parcel Sandbox</title>\n  <meta charset="UTF-8" />\n</head>\n\n<body>\n  <div id="app"></div>\n\n  <script src="index.ts">\n  <\/script>\n</body>\n\n</html>'
  }, "/package.json": {
    code: JSON.stringify({
      dependencies: {},
      devDependencies: {
        typescript: "^4.0.0"
      },
      main: "/index.ts"
    })
  } }),
  main: "/index.ts",
  environment: "parcel"
};
var VUE_TEMPLATE$1 = {
  files: {
    "/src/styles.css": commonFiles$1["/styles.css"],
    "/src/App.vue": {
      code: "<template>\n  <h1>Hello {{ msg }}</h1>\n</template>\n\n<script setup>\nimport { ref } from 'vue';\nconst msg = ref('world');\n<\/script>"
    },
    "/src/main.js": {
      code: `import { createApp } from 'vue'
import App from './App.vue'
import "./styles.css";

createApp(App).mount('#app')
`
    },
    "/public/index.html": {
      code: `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <meta name="viewport" content="width=device-width,initial-scale=1.0" />
    <title>codesandbox</title>
  </head>
  <body>
    <noscript>
      <strong
        >We're sorry but codesandbox doesn't work properly without JavaScript
        enabled. Please enable it to continue.</strong
      >
    </noscript>
    <div id="app"></div>
    <!-- built files will be auto injected -->
  </body>
</html>
`
    },
    "/package.json": {
      code: JSON.stringify({
        name: "vue3",
        version: "0.1.0",
        private: true,
        main: "/src/main.js",
        scripts: {
          serve: "vue-cli-service serve",
          build: "vue-cli-service build"
        },
        dependencies: {
          "core-js": "^3.26.1",
          vue: "^3.2.45"
        },
        devDependencies: {
          "@vue/cli-plugin-babel": "^5.0.8",
          "@vue/cli-service": "^5.0.8"
        }
      })
    }
  },
  main: "/src/App.vue",
  environment: "vue-cli"
};
var VUE_TS_TEMPLATE$1 = {
  files: {
    "/src/styles.css": commonFiles$1["/styles.css"],
    "/src/App.vue": {
      code: `<template>
  <h1>Hello {{ msg }}</h1>
</template>

<script setup lang="ts">
import { ref } from 'vue';
const msg = ref<string>('world');
<\/script>`
    },
    "/src/main.ts": {
      code: `import { createApp } from 'vue'
import App from './App.vue'
import "./styles.css";

createApp(App).mount('#app')
`
    },
    "/src/shims-vue.d.ts": '/* eslint-disable */\ndeclare module "*.vue" {\n  import type { DefineComponent } from "vue";\n  const component: DefineComponent<{}, {}, any>;\n  export default component;\n}',
    "/public/index.html": {
      code: `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <meta name="viewport" content="width=device-width,initial-scale=1.0" />
    <title>codesandbox</title>
  </head>
  <body>
    <noscript>
      <strong
        >We're sorry but codesandbox doesn't work properly without JavaScript
        enabled. Please enable it to continue.</strong
      >
    </noscript>
    <div id="app"></div>
    <!-- built files will be auto injected -->
  </body>
</html>
`
    },
    "/package.json": {
      code: JSON.stringify({
        name: "vue3-ts",
        version: "0.1.0",
        private: true,
        main: "/src/main.ts",
        scripts: {
          serve: "vue-cli-service serve",
          build: "vue-cli-service build"
        },
        dependencies: {
          "core-js": "^3.26.1",
          vue: "^3.2.45"
        },
        devDependencies: {
          "@vue/cli-plugin-babel": "^5.0.8",
          "@vue/cli-plugin-typescript": "^5.0.8",
          "@vue/cli-service": "^5.0.8",
          typescript: "^4.9.3"
        }
      })
    },
    "/tsconfig.json": {
      code: JSON.stringify({
        compilerOptions: {
          target: "esnext",
          module: "esnext",
          strict: true,
          jsx: "preserve",
          moduleResolution: "node",
          experimentalDecorators: true,
          skipLibCheck: true,
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
          forceConsistentCasingInFileNames: true,
          useDefineForClassFields: true,
          sourceMap: false,
          baseUrl: ".",
          types: ["webpack-env"],
          paths: {
            "@/*": ["src/*"]
          },
          lib: ["esnext", "dom", "dom.iterable", "scripthost"]
        },
        include: [
          "src/**/*.ts",
          "src/**/*.tsx",
          "src/**/*.vue",
          "tests/**/*.ts",
          "tests/**/*.tsx"
        ],
        exclude: ["node_modules"]
      })
    }
  },
  main: "/src/App.vue",
  environment: "vue-cli"
};
var STATIC_TEMPLATE$1 = {
  files: __assign$1(__assign$1({}, commonFiles$1), { "/index.html": {
    code: '<!DOCTYPE html>\n<html>\n\n<head>\n  <title>Parcel Sandbox</title>\n  <meta charset="UTF-8" />\n  <link rel="stylesheet" href="/styles.css" />\n</head>\n\n<body>\n  <h1>Hello world</h1>\n</body>\n\n</html>'
  }, "/package.json": {
    code: JSON.stringify({
      dependencies: {},
      main: "/index.html"
    })
  } }),
  main: "/index.html",
  environment: "static"
};
var SANDBOX_TEMPLATES$1 = {
  static: STATIC_TEMPLATE$1,
  angular: ANGULAR_TEMPLATE$1,
  react: REACT_TEMPLATE$1,
  "react-ts": REACT_TYPESCRIPT_TEMPLATE$1,
  solid: SOLID_TEMPLATE$1,
  svelte: SVELTE_TEMPLATE$1,
  "test-ts": TEST_TYPESCRIPT_TEMPLATE$1,
  "vanilla-ts": VANILLA_TYPESCRIPT_TEMPLATE$1,
  vanilla: VANILLA_TEMPLATE$1,
  vue: VUE_TEMPLATE$1,
  "vue-ts": VUE_TS_TEMPLATE$1,
  node: NODE_TEMPLATE$1,
  nextjs: NEXTJS_TEMPLATE$1,
  vite: VITE_TEMPLATE$1,
  "vite-react": VITE_REACT_TEMPLATE$1,
  "vite-react-ts": VITE_REACT_TS_TEMPLATE$1,
  "vite-preact": VITE_PREACT_TEMPLATE$1,
  "vite-preact-ts": VITE_PREACT_TS_TEMPLATE$1,
  "vite-vue": VITE_VUE_TEMPLATE$1,
  "vite-vue-ts": VITE_VUE_TS_TEMPLATE$1,
  "vite-svelte": VITE_SVELTE_TEMPLATE$1,
  "vite-svelte-ts": VITE_SVELTE_TS_TEMPLATE$1,
  astro: ASTRO_TEMPLATE$1
};
var getSandpackStateFromProps$1 = function(props) {
  var _a2, _b, _c2, _d, _e, _f;
  var normalizedFilesPath = normalizePath(props.files);
  var projectSetup = combineTemplateFilesToSetup$1({
    template: props.template,
    customSetup: props.customSetup,
    files: normalizedFilesPath
  });
  var visibleFiles = normalizePath((_b = (_a2 = props.options) === null || _a2 === void 0 ? void 0 : _a2.visibleFiles) !== null && _b !== void 0 ? _b : []);
  var activeFile = ((_c2 = props.options) === null || _c2 === void 0 ? void 0 : _c2.activeFile) ? resolveFile$1((_d = props.options) === null || _d === void 0 ? void 0 : _d.activeFile, projectSetup.files) : void 0;
  if (visibleFiles.length === 0 && normalizedFilesPath) {
    Object.keys(normalizedFilesPath).forEach(function(filePath) {
      var file = normalizedFilesPath[filePath];
      if (typeof file === "string") {
        visibleFiles.push(filePath);
        return;
      }
      if (!activeFile && file.active) {
        activeFile = filePath;
        if (file.hidden === true) {
          visibleFiles.push(filePath);
        }
      }
      if (!file.hidden) {
        visibleFiles.push(filePath);
      }
    });
  }
  if (visibleFiles.length === 0) {
    visibleFiles = [projectSetup.main];
  }
  if (projectSetup.entry && !projectSetup.files[projectSetup.entry]) {
    projectSetup.entry = resolveFile$1(projectSetup.entry, projectSetup.files);
  }
  if (!activeFile && projectSetup.main) {
    activeFile = projectSetup.main;
  }
  if (!activeFile || !projectSetup.files[activeFile]) {
    activeFile = visibleFiles[0];
  }
  if (!visibleFiles.includes(activeFile)) {
    visibleFiles.push(activeFile);
  }
  var files = addPackageJSONIfNeeded(projectSetup.files, (_e = projectSetup.dependencies) !== null && _e !== void 0 ? _e : {}, (_f = projectSetup.devDependencies) !== null && _f !== void 0 ? _f : {}, projectSetup.entry);
  var existOpenPath = visibleFiles.filter(function(path) {
    return files[path];
  });
  return {
    visibleFiles: existOpenPath,
    /* eslint-disable-next-line @typescript-eslint/no-non-null-assertion */
    activeFile,
    files,
    environment: projectSetup.environment,
    shouldUpdatePreview: true
  };
};
var resolveFile$1 = function(path, files) {
  var normalizedFilesPath = normalizePath(files);
  var normalizedPath = normalizePath(path);
  if (normalizedPath in normalizedFilesPath) {
    return normalizedPath;
  }
  if (!path) {
    return null;
  }
  var resolvedPath = null;
  var index2 = 0;
  var strategies = [".js", ".jsx", ".ts", ".tsx"];
  while (!resolvedPath && index2 < strategies.length) {
    var removeExtension = normalizedPath.split(".")[0];
    var attemptPath = "".concat(removeExtension).concat(strategies[index2]);
    if (normalizedFilesPath[attemptPath] !== void 0) {
      resolvedPath = attemptPath;
    }
    index2++;
  }
  return resolvedPath;
};
var combineTemplateFilesToSetup$1 = function(_a2) {
  var files = _a2.files, template = _a2.template, customSetup = _a2.customSetup;
  if (!template) {
    if (!customSetup) {
      var defaultTemplate = SANDBOX_TEMPLATES$1.vanilla;
      return __assign$1(__assign$1({}, defaultTemplate), { files: __assign$1(__assign$1({}, defaultTemplate.files), convertedFilesToBundlerFiles$1(files)) });
    }
    if (!files || Object.keys(files).length === 0) {
      throw new Error("[sandpack-react]: without a template, you must pass at least one file");
    }
    return __assign$1(__assign$1({}, customSetup), { files: convertedFilesToBundlerFiles$1(files) });
  }
  var baseTemplate = SANDBOX_TEMPLATES$1[template];
  if (!baseTemplate) {
    throw new Error('[sandpack-react]: invalid template "'.concat(template, '" provided'));
  }
  if (!customSetup && !files) {
    return baseTemplate;
  }
  return {
    /**
     * The input setup might have files in the simple form Record<string, string>
     * so we convert them to the sandbox template format
     */
    files: convertedFilesToBundlerFiles$1(__assign$1(__assign$1({}, baseTemplate.files), files)),
    /**
     * Merge template dependencies and user custom dependencies.
     * As a rule, the custom dependencies must overwrite the template ones.
     */
    dependencies: __assign$1(__assign$1({}, baseTemplate.dependencies), customSetup === null || customSetup === void 0 ? void 0 : customSetup.dependencies),
    devDependencies: __assign$1(__assign$1({}, baseTemplate.devDependencies), customSetup === null || customSetup === void 0 ? void 0 : customSetup.devDependencies),
    entry: normalizePath(customSetup === null || customSetup === void 0 ? void 0 : customSetup.entry),
    main: baseTemplate.main,
    environment: (customSetup === null || customSetup === void 0 ? void 0 : customSetup.environment) || baseTemplate.environment
  };
};
var convertedFilesToBundlerFiles$1 = function(files) {
  if (!files)
    return {};
  return Object.keys(files).reduce(function(acc, key) {
    if (typeof files[key] === "string") {
      acc[key] = { code: files[key] };
    } else {
      acc[key] = files[key];
    }
    return acc;
  }, {});
};
var useAppState$1 = function(props, files) {
  var _a2 = reactExports.useState({
    editorState: "pristine"
  }), state = _a2[0], setState = _a2[1];
  var originalStateFromProps = getSandpackStateFromProps$1(props);
  var editorState = dequal(originalStateFromProps.files, files) ? "pristine" : "dirty";
  if (editorState !== state.editorState) {
    setState(function(prev) {
      return __assign$1(__assign$1({}, prev), { editorState });
    });
  }
  return state;
};
var useSandpackId$1 = function() {
  if (typeof reactExports.useId === "function") {
    return reactExports.useId();
  } else {
    return generateRandomId$2();
  }
};
var MAX_ID_LENGTH$1 = 9;
var sandpackClientVersion$1 = "2.19.8";
var useAsyncSandpackId$1 = function(files) {
  if (typeof reactExports.useId === "function") {
    var reactDomId_1 = reactExports.useId();
    return function() {
      return __awaiter$1(void 0, void 0, void 0, function() {
        var allCode, sha;
        return __generator$1(this, function(_a2) {
          switch (_a2.label) {
            case 0:
              allCode = Object.entries(files).map(function(path, code) {
                return path + "|" + code;
              }).join("|||");
              return [4, generateShortId$1(allCode + reactDomId_1 + sandpackClientVersion$1)];
            case 1:
              sha = _a2.sent();
              return [2, ensureLength$1(sha.replace(/:/g, "sp").replace(/[^a-zA-Z]/g, ""), MAX_ID_LENGTH$1)];
          }
        });
      });
    };
  } else {
    return function() {
      return ensureLength$1(generateRandomId$2(), MAX_ID_LENGTH$1);
    };
  }
};
function ensureLength$1(str, length) {
  if (str.length > length) {
    return str.slice(0, length);
  } else {
    return str.padEnd(length, "s");
  }
}
function generateShortId$1(input) {
  return __awaiter$1(this, void 0, void 0, function() {
    var encoder, data, hashBuffer, hashArray;
    return __generator$1(this, function(_a2) {
      switch (_a2.label) {
        case 0:
          encoder = new TextEncoder();
          data = encoder.encode(input);
          return [4, crypto.subtle.digest("SHA-256", data)];
        case 1:
          hashBuffer = _a2.sent();
          hashArray = Array.from(new Uint8Array(hashBuffer));
          return [2, btoa(String.fromCharCode.apply(String, hashArray))];
      }
    });
  });
}
var BUNDLER_TIMEOUT$1 = 4e4;
var useClient$1 = function(_a2, filesState) {
  var _b, _c2, _d;
  var options = _a2.options, customSetup = _a2.customSetup, teamId = _a2.teamId, sandboxId = _a2.sandboxId;
  options !== null && options !== void 0 ? options : options = {};
  customSetup !== null && customSetup !== void 0 ? customSetup : customSetup = {};
  var initModeFromProps = (options === null || options === void 0 ? void 0 : options.initMode) || "lazy";
  var _e = reactExports.useState({
    startRoute: options === null || options === void 0 ? void 0 : options.startRoute,
    bundlerState: void 0,
    error: null,
    initMode: initModeFromProps,
    reactDevTools: void 0,
    status: ((_b = options === null || options === void 0 ? void 0 : options.autorun) !== null && _b !== void 0 ? _b : true) ? "initial" : "idle"
  }), state = _e[0], setState = _e[1];
  var intersectionObserverCallback = reactExports.useRef();
  var intersectionObserver = reactExports.useRef(null);
  var lazyAnchorRef = reactExports.useRef(null);
  var registeredIframes = reactExports.useRef({});
  var clients = reactExports.useRef({});
  var timeoutHook = reactExports.useRef(null);
  var unsubscribeClientListeners = reactExports.useRef({});
  var unsubscribe = reactExports.useRef();
  var queuedListeners = reactExports.useRef({ global: {} });
  var debounceHook = reactExports.useRef();
  var prevEnvironment = reactExports.useRef(filesState.environment);
  var asyncSandpackId = useAsyncSandpackId$1(filesState.files);
  var createClient = reactExports.useCallback(function(iframe, clientId, clientPropsOverride) {
    return __awaiter$1(void 0, void 0, void 0, function() {
      var timeOut, shouldSetTimeout, getStableServiceWorkerId, client, _a3, _b2, globalListeners;
      var _c3;
      var _d2, _e2, _f;
      return __generator$1(this, function(_g) {
        switch (_g.label) {
          case 0:
            if (clients.current[clientId]) {
              clients.current[clientId].destroy();
            }
            options !== null && options !== void 0 ? options : options = {};
            customSetup !== null && customSetup !== void 0 ? customSetup : customSetup = {};
            timeOut = (_d2 = options === null || options === void 0 ? void 0 : options.bundlerTimeOut) !== null && _d2 !== void 0 ? _d2 : BUNDLER_TIMEOUT$1;
            if (timeoutHook.current) {
              clearTimeout(timeoutHook.current);
            }
            shouldSetTimeout = typeof unsubscribe.current !== "function";
            if (shouldSetTimeout) {
              timeoutHook.current = setTimeout(function() {
                unregisterAllClients();
                setState(function(prev) {
                  return __assign$1(__assign$1({}, prev), { status: "timeout" });
                });
              }, timeOut);
            }
            getStableServiceWorkerId = function() {
              return __awaiter$1(void 0, void 0, void 0, function() {
                var key, fixedId;
                return __generator$1(this, function(_a4) {
                  switch (_a4.label) {
                    case 0:
                      if (!(options === null || options === void 0 ? void 0 : options.experimental_enableStableServiceWorkerId)) return [3, 3];
                      key = "SANDPACK_INTERNAL:URL-CONSISTENT-ID";
                      fixedId = localStorage.getItem(key);
                      if (!!fixedId) return [3, 2];
                      return [4, asyncSandpackId()];
                    case 1:
                      fixedId = _a4.sent();
                      localStorage.setItem(key, fixedId);
                      _a4.label = 2;
                    case 2:
                      return [2, fixedId];
                    case 3:
                      return [4, asyncSandpackId()];
                    case 4:
                      return [2, _a4.sent()];
                  }
                });
              });
            };
            _a3 = loadSandpackClient;
            _b2 = [
              iframe,
              {
                files: filesState.files,
                template: filesState.environment
              }
            ];
            _c3 = {
              externalResources: options.externalResources,
              bundlerURL: options.bundlerURL,
              startRoute: (_e2 = clientPropsOverride === null || clientPropsOverride === void 0 ? void 0 : clientPropsOverride.startRoute) !== null && _e2 !== void 0 ? _e2 : options.startRoute,
              fileResolver: options.fileResolver,
              skipEval: (_f = options.skipEval) !== null && _f !== void 0 ? _f : false,
              logLevel: options.logLevel,
              showOpenInCodeSandbox: false,
              showErrorScreen: true,
              showLoadingScreen: false,
              reactDevTools: state.reactDevTools,
              customNpmRegistries: customSetup === null || customSetup === void 0 ? void 0 : customSetup.npmRegistries,
              teamId,
              experimental_enableServiceWorker: !!(options === null || options === void 0 ? void 0 : options.experimental_enableServiceWorker)
            };
            return [4, getStableServiceWorkerId()];
          case 1:
            return [4, _a3.apply(void 0, _b2.concat([(_c3.experimental_stableServiceWorkerId = _g.sent(), _c3.sandboxId = sandboxId, _c3)]))];
          case 2:
            client = _g.sent();
            if (typeof unsubscribe.current !== "function") {
              unsubscribe.current = client.listen(handleMessage);
            }
            unsubscribeClientListeners.current[clientId] = unsubscribeClientListeners.current[clientId] || {};
            if (queuedListeners.current[clientId]) {
              Object.keys(queuedListeners.current[clientId]).forEach(function(listenerId) {
                var listener = queuedListeners.current[clientId][listenerId];
                var unsubscribe2 = client.listen(listener);
                unsubscribeClientListeners.current[clientId][listenerId] = unsubscribe2;
              });
              queuedListeners.current[clientId] = {};
            }
            globalListeners = Object.entries(queuedListeners.current.global);
            globalListeners.forEach(function(_a4) {
              var listenerId = _a4[0], listener = _a4[1];
              var unsubscribe2 = client.listen(listener);
              unsubscribeClientListeners.current[clientId][listenerId] = unsubscribe2;
            });
            clients.current[clientId] = client;
            return [
              2
              /*return*/
            ];
        }
      });
    });
  }, [filesState.environment, filesState.files, state.reactDevTools]);
  var unregisterAllClients = reactExports.useCallback(function() {
    Object.keys(clients.current).map(unregisterBundler);
    if (typeof unsubscribe.current === "function") {
      unsubscribe.current();
      unsubscribe.current = void 0;
    }
  }, []);
  var runSandpack = reactExports.useCallback(function() {
    return __awaiter$1(void 0, void 0, void 0, function() {
      return __generator$1(this, function(_a3) {
        switch (_a3.label) {
          case 0:
            return [4, Promise.all(Object.entries(registeredIframes.current).map(function(_a4) {
              var clientId = _a4[0], _b2 = _a4[1], iframe = _b2.iframe, _c3 = _b2.clientPropsOverride, clientPropsOverride = _c3 === void 0 ? {} : _c3;
              return __awaiter$1(void 0, void 0, void 0, function() {
                return __generator$1(this, function(_d2) {
                  switch (_d2.label) {
                    case 0:
                      return [4, createClient(iframe, clientId, clientPropsOverride)];
                    case 1:
                      _d2.sent();
                      return [
                        2
                        /*return*/
                      ];
                  }
                });
              });
            }))];
          case 1:
            _a3.sent();
            setState(function(prev) {
              return __assign$1(__assign$1({}, prev), { error: null, status: "running" });
            });
            return [
              2
              /*return*/
            ];
        }
      });
    });
  }, [createClient]);
  intersectionObserverCallback.current = function(entries2) {
    if (entries2.some(function(entry) {
      return entry.isIntersecting;
    })) {
      runSandpack();
    } else {
      unregisterAllClients();
    }
  };
  var initializeSandpackIframe = reactExports.useCallback(function() {
    var _a3, _b2, _c3;
    var autorun = (_a3 = options === null || options === void 0 ? void 0 : options.autorun) !== null && _a3 !== void 0 ? _a3 : true;
    if (!autorun) {
      return;
    }
    var observerOptions = (_b2 = options === null || options === void 0 ? void 0 : options.initModeObserverOptions) !== null && _b2 !== void 0 ? _b2 : {
      rootMargin: "1000px 0px"
    };
    if (intersectionObserver.current && lazyAnchorRef.current) {
      (_c3 = intersectionObserver.current) === null || _c3 === void 0 ? void 0 : _c3.unobserve(lazyAnchorRef.current);
    }
    if (lazyAnchorRef.current && state.initMode === "lazy") {
      intersectionObserver.current = new IntersectionObserver(function(entries2) {
        var _a4, _b3;
        if (entries2.some(function(entry) {
          return entry.isIntersecting;
        })) {
          if (entries2.some(function(entry) {
            return entry.isIntersecting;
          }) && lazyAnchorRef.current) {
            (_a4 = intersectionObserverCallback.current) === null || _a4 === void 0 ? void 0 : _a4.call(intersectionObserverCallback, entries2);
            (_b3 = intersectionObserver.current) === null || _b3 === void 0 ? void 0 : _b3.unobserve(lazyAnchorRef.current);
          }
        }
      }, observerOptions);
      intersectionObserver.current.observe(lazyAnchorRef.current);
    } else if (lazyAnchorRef.current && state.initMode === "user-visible") {
      intersectionObserver.current = new IntersectionObserver(function(entries2) {
        var _a4;
        (_a4 = intersectionObserverCallback.current) === null || _a4 === void 0 ? void 0 : _a4.call(intersectionObserverCallback, entries2);
      }, observerOptions);
      intersectionObserver.current.observe(lazyAnchorRef.current);
    } else {
      runSandpack();
    }
  }, [
    options === null || options === void 0 ? void 0 : options.autorun,
    options === null || options === void 0 ? void 0 : options.initModeObserverOptions,
    runSandpack,
    state.initMode,
    unregisterAllClients
  ]);
  var registerBundler = reactExports.useCallback(function(iframe, clientId, clientPropsOverride) {
    return __awaiter$1(void 0, void 0, void 0, function() {
      return __generator$1(this, function(_a3) {
        switch (_a3.label) {
          case 0:
            registeredIframes.current[clientId] = {
              iframe,
              clientPropsOverride
            };
            if (!(state.status === "running")) return [3, 2];
            return [4, createClient(iframe, clientId, clientPropsOverride)];
          case 1:
            _a3.sent();
            _a3.label = 2;
          case 2:
            return [
              2
              /*return*/
            ];
        }
      });
    });
  }, [createClient, state.status]);
  var unregisterBundler = function(clientId) {
    var _a3, _b2;
    var client = clients.current[clientId];
    if (client) {
      client.destroy();
      (_a3 = client.iframe.contentWindow) === null || _a3 === void 0 ? void 0 : _a3.location.replace("about:blank");
      client.iframe.removeAttribute("src");
      delete clients.current[clientId];
    } else {
      delete registeredIframes.current[clientId];
    }
    if (timeoutHook.current) {
      clearTimeout(timeoutHook.current);
    }
    var unsubscribeQueuedClients = Object.values((_b2 = unsubscribeClientListeners.current[clientId]) !== null && _b2 !== void 0 ? _b2 : {});
    unsubscribeQueuedClients.forEach(function(listenerOfClient) {
      var listenerFunctions = Object.values(listenerOfClient);
      listenerFunctions.forEach(function(unsubscribe2) {
        return unsubscribe2();
      });
    });
    var status = Object.keys(clients.current).length > 0 ? "running" : "idle";
    setState(function(prev) {
      return __assign$1(__assign$1({}, prev), { status });
    });
  };
  var handleMessage = function(msg) {
    if (msg.type === "start") {
      setState(function(prev) {
        return __assign$1(__assign$1({}, prev), { error: null });
      });
    } else if (msg.type === "state") {
      setState(function(prev) {
        return __assign$1(__assign$1({}, prev), { bundlerState: msg.state });
      });
    } else if (msg.type === "done" && !msg.compilatonError || msg.type === "connected") {
      if (timeoutHook.current) {
        clearTimeout(timeoutHook.current);
      }
      setState(function(prev) {
        return __assign$1(__assign$1({}, prev), { error: null });
      });
    } else if (msg.type === "action" && msg.action === "show-error") {
      if (timeoutHook.current) {
        clearTimeout(timeoutHook.current);
      }
      setState(function(prev) {
        return __assign$1(__assign$1({}, prev), { error: extractErrorDetails(msg) });
      });
    } else if (msg.type === "action" && msg.action === "notification" && msg.notificationType === "error") {
      setState(function(prev) {
        return __assign$1(__assign$1({}, prev), { error: { message: msg.title } });
      });
    }
  };
  var registerReactDevTools = function(value) {
    setState(function(prev) {
      return __assign$1(__assign$1({}, prev), { reactDevTools: value });
    });
  };
  var recompileMode = (_c2 = options === null || options === void 0 ? void 0 : options.recompileMode) !== null && _c2 !== void 0 ? _c2 : "delayed";
  var recompileDelay = (_d = options === null || options === void 0 ? void 0 : options.recompileDelay) !== null && _d !== void 0 ? _d : 200;
  var dispatchMessage = function(message, clientId) {
    if (state.status !== "running") {
      console.warn("[sandpack-react]: dispatch cannot be called while in idle mode");
      return;
    }
    if (clientId) {
      clients.current[clientId].dispatch(message);
    } else {
      Object.values(clients.current).forEach(function(client) {
        client.dispatch(message);
      });
    }
  };
  var addListener = function(listener, clientId) {
    if (clientId) {
      if (clients.current[clientId]) {
        var unsubscribeListener = clients.current[clientId].listen(listener);
        return unsubscribeListener;
      } else {
        var listenerId_1 = generateRandomId$2();
        queuedListeners.current[clientId] = queuedListeners.current[clientId] || {};
        unsubscribeClientListeners.current[clientId] = unsubscribeClientListeners.current[clientId] || {};
        queuedListeners.current[clientId][listenerId_1] = listener;
        var unsubscribeListener = function() {
          if (queuedListeners.current[clientId][listenerId_1]) {
            delete queuedListeners.current[clientId][listenerId_1];
          } else if (unsubscribeClientListeners.current[clientId][listenerId_1]) {
            unsubscribeClientListeners.current[clientId][listenerId_1]();
            delete unsubscribeClientListeners.current[clientId][listenerId_1];
          }
        };
        return unsubscribeListener;
      }
    } else {
      var listenerId_2 = generateRandomId$2();
      queuedListeners.current.global[listenerId_2] = listener;
      var clientsList = Object.values(clients.current);
      var currentClientUnsubscribeListeners_1 = clientsList.map(function(client) {
        return client.listen(listener);
      });
      var unsubscribeListener = function() {
        currentClientUnsubscribeListeners_1.forEach(function(unsubscribe2) {
          return unsubscribe2();
        });
        delete queuedListeners.current.global[listenerId_2];
        Object.values(unsubscribeClientListeners.current).forEach(function(client) {
          var _a3;
          (_a3 = client === null || client === void 0 ? void 0 : client[listenerId_2]) === null || _a3 === void 0 ? void 0 : _a3.call(client);
        });
      };
      return unsubscribeListener;
    }
  };
  reactExports.useEffect(function watchFileChanges() {
    if (state.status !== "running" || !filesState.shouldUpdatePreview) {
      return;
    }
    if (prevEnvironment.current !== filesState.environment) {
      prevEnvironment.current = filesState.environment;
      Object.entries(clients.current).forEach(function(_a3) {
        var key = _a3[0], client = _a3[1];
        registerBundler(client.iframe, key);
      });
    }
    if (recompileMode === "immediate") {
      Object.values(clients.current).forEach(function(client) {
        if (client.status === "done") {
          client.updateSandbox({
            files: filesState.files,
            template: filesState.environment
          });
        }
      });
    }
    if (recompileMode === "delayed") {
      if (typeof window === "undefined")
        return;
      window.clearTimeout(debounceHook.current);
      debounceHook.current = window.setTimeout(function() {
        Object.values(clients.current).forEach(function(client) {
          if (client.status === "done") {
            client.updateSandbox({
              files: filesState.files,
              template: filesState.environment
            });
          }
        });
      }, recompileDelay);
    }
    return function() {
      window.clearTimeout(debounceHook.current);
    };
  }, [
    filesState.files,
    filesState.environment,
    filesState.shouldUpdatePreview,
    recompileDelay,
    recompileMode,
    registerBundler,
    state.status
  ]);
  reactExports.useEffect(function watchInitMode() {
    if (initModeFromProps !== state.initMode) {
      setState(function(prev) {
        return __assign$1(__assign$1({}, prev), { initMode: initModeFromProps });
      });
      initializeSandpackIframe();
    }
  }, [initModeFromProps, initializeSandpackIframe, state.initMode]);
  reactExports.useEffect(function() {
    return function unmountClient() {
      if (typeof unsubscribe.current === "function") {
        unsubscribe.current();
      }
      if (timeoutHook.current) {
        clearTimeout(timeoutHook.current);
      }
      if (debounceHook.current) {
        clearTimeout(debounceHook.current);
      }
      if (intersectionObserver.current) {
        intersectionObserver.current.disconnect();
      }
    };
  }, []);
  return [
    state,
    {
      clients: clients.current,
      initializeSandpackIframe,
      runSandpack,
      registerBundler,
      unregisterBundler,
      registerReactDevTools,
      addListener,
      dispatchMessage,
      lazyAnchorRef,
      unsubscribeClientListenersRef: unsubscribeClientListeners,
      queuedListenersRef: queuedListeners
    }
  ];
};
var useFiles$1 = function(props) {
  var originalStateFromProps = getSandpackStateFromProps$1(props);
  var _a2 = reactExports.useState(originalStateFromProps), state = _a2[0], setState = _a2[1];
  var isMountedRef = reactExports.useRef(false);
  reactExports.useEffect(function() {
    if (isMountedRef.current) {
      setState(getSandpackStateFromProps$1(props));
    } else {
      isMountedRef.current = true;
    }
  }, [props.files, props.customSetup, props.template]);
  var updateFile = function(pathOrFiles, code, shouldUpdatePreview) {
    if (shouldUpdatePreview === void 0) {
      shouldUpdatePreview = true;
    }
    setState(function(prev) {
      var _a3;
      var files = prev.files;
      if (typeof pathOrFiles === "string" && typeof code === "string") {
        files = __assign$1(__assign$1({}, files), (_a3 = {}, _a3[pathOrFiles] = __assign$1(__assign$1({}, files[pathOrFiles]), { code }), _a3));
      } else if (typeof pathOrFiles === "object") {
        files = __assign$1(__assign$1({}, files), convertedFilesToBundlerFiles$1(pathOrFiles));
      }
      return __assign$1(__assign$1({}, prev), { files: normalizePath(files), shouldUpdatePreview });
    });
  };
  var operations = {
    openFile: function(path) {
      setState(function(_a3) {
        var visibleFiles = _a3.visibleFiles, rest = __rest$1(_a3, ["visibleFiles"]);
        var newPaths = visibleFiles.includes(path) ? visibleFiles : __spreadArray$1(__spreadArray$1([], visibleFiles, true), [path], false);
        return __assign$1(__assign$1({}, rest), { activeFile: path, visibleFiles: newPaths });
      });
    },
    resetFile: function(path) {
      setState(function(prevState) {
        var _a3;
        return __assign$1(__assign$1({}, prevState), { files: __assign$1(__assign$1({}, prevState.files), (_a3 = {}, _a3[path] = originalStateFromProps.files[path], _a3)) });
      });
    },
    resetAllFiles: function() {
      setState(function(prev) {
        return __assign$1(__assign$1({}, prev), { files: originalStateFromProps.files });
      });
    },
    setActiveFile: function(activeFile) {
      if (state.files[activeFile]) {
        setState(function(prev) {
          return __assign$1(__assign$1({}, prev), { activeFile });
        });
      }
    },
    updateCurrentFile: function(code, shouldUpdatePreview) {
      if (shouldUpdatePreview === void 0) {
        shouldUpdatePreview = true;
      }
      updateFile(state.activeFile, code, shouldUpdatePreview);
    },
    updateFile,
    addFile: updateFile,
    closeFile: function(path) {
      if (state.visibleFiles.length === 1) {
        return;
      }
      setState(function(_a3) {
        var visibleFiles = _a3.visibleFiles, activeFile = _a3.activeFile, prev = __rest$1(_a3, ["visibleFiles", "activeFile"]);
        var indexOfRemovedPath = visibleFiles.indexOf(path);
        var newPaths = visibleFiles.filter(function(openPath) {
          return openPath !== path;
        });
        return __assign$1(__assign$1({}, prev), { activeFile: path === activeFile ? indexOfRemovedPath === 0 ? visibleFiles[1] : visibleFiles[indexOfRemovedPath - 1] : activeFile, visibleFiles: newPaths });
      });
    },
    deleteFile: function(path, shouldUpdatePreview) {
      if (shouldUpdatePreview === void 0) {
        shouldUpdatePreview = true;
      }
      setState(function(_a3) {
        var visibleFiles = _a3.visibleFiles, files = _a3.files, activeFile = _a3.activeFile, rest = __rest$1(_a3, ["visibleFiles", "files", "activeFile"]);
        var newFiles = __assign$1({}, files);
        delete newFiles[path];
        var remainingVisibleFiles = visibleFiles.filter(function(openPath) {
          return openPath !== path;
        });
        var deletedLastVisibleFile = remainingVisibleFiles.length === 0;
        if (deletedLastVisibleFile) {
          var nextFile = Object.keys(files)[Object.keys(files).length - 1];
          return __assign$1(__assign$1({}, rest), { visibleFiles: [nextFile], activeFile: nextFile, files: newFiles, shouldUpdatePreview });
        }
        return __assign$1(__assign$1({}, rest), { visibleFiles: remainingVisibleFiles, activeFile: path === activeFile ? remainingVisibleFiles[remainingVisibleFiles.length - 1] : activeFile, files: newFiles, shouldUpdatePreview });
      });
    }
  };
  return [
    __assign$1(__assign$1({}, state), { visibleFilesFromProps: originalStateFromProps.visibleFiles }),
    operations
  ];
};
var Sandpack$1$1 = reactExports.createContext(null);
var SandpackProvider$1 = function(props) {
  var _a2, _b, _c2;
  var children = props.children, options = props.options, style = props.style, className = props.className, theme = props.theme;
  var _d = useFiles$1(props), fileState = _d[0], fileOperations = _d[1];
  var _e = useClient$1(props, fileState), clientState = _e[0], _f = _e[1], dispatchMessage = _f.dispatchMessage, addListener = _f.addListener, clientOperations = __rest$1(_f, ["dispatchMessage", "addListener"]);
  var appState = useAppState$1(props, fileState.files);
  reactExports.useEffect(function() {
    clientOperations.initializeSandpackIframe();
  }, []);
  return jsxRuntimeExports.jsx(Sandpack$1$1.Provider, { value: __assign$1(__assign$1(__assign$1(__assign$1(__assign$1(__assign$1({}, fileState), clientState), appState), fileOperations), clientOperations), { autoReload: (_b = (_a2 = props.options) === null || _a2 === void 0 ? void 0 : _a2.autoReload) !== null && _b !== void 0 ? _b : true, teamId: props === null || props === void 0 ? void 0 : props.teamId, exportOptions: (_c2 = props === null || props === void 0 ? void 0 : props.customSetup) === null || _c2 === void 0 ? void 0 : _c2.exportOptions, listen: addListener, dispatch: dispatchMessage }), children: jsxRuntimeExports.jsx(ClassNamesProvider$1, { classes: options === null || options === void 0 ? void 0 : options.classes, children: jsxRuntimeExports.jsx(SandpackThemeProvider$1, { className, style, theme, children }) }) });
};
Sandpack$1$1.Consumer;
function useSandpack$1() {
  var sandpack = reactExports.useContext(Sandpack$1$1);
  if (sandpack === null) {
    throw new Error('[sandpack-react]: "useSandpack" must be wrapped by a "SandpackProvider"');
  }
  var dispatch = sandpack.dispatch, listen = sandpack.listen, rest = __rest$1(sandpack, ["dispatch", "listen"]);
  return {
    sandpack: __assign$1({}, rest),
    dispatch,
    listen
  };
}
var useActiveCode$1 = function() {
  var _a2, _b, _c2;
  var sandpack = useSandpack$1().sandpack;
  return {
    code: (_a2 = sandpack.files[sandpack.activeFile]) === null || _a2 === void 0 ? void 0 : _a2.code,
    readOnly: (_c2 = (_b = sandpack.files[sandpack.activeFile]) === null || _b === void 0 ? void 0 : _b.readOnly) !== null && _c2 !== void 0 ? _c2 : false,
    updateCode: sandpack.updateCurrentFile
  };
};
var _a$8, _b$2, _c;
var iconStandaloneClassName$1 = css({
  svg: { margin: "auto" }
});
var buttonClassName$1 = css((_a$8 = {
  appearance: "none",
  outline: "none",
  display: "flex",
  alignItems: "center",
  fontSize: "inherit",
  fontFamily: "inherit",
  backgroundColor: "transparent",
  transition: "color $default, background $default",
  cursor: "pointer",
  color: "$colors$clickable",
  border: 0,
  textDecoration: "none",
  "&:disabled": { color: "$colors$disabled" },
  "&:hover:not(:disabled,[data-active='true'])": { color: "$colors$hover" },
  '&[data-active="true"]': { color: "$colors$accent" },
  svg: {
    minWidth: "$space$4",
    width: "$space$4",
    height: "$space$4"
  }
}, _a$8["&.".concat(iconStandaloneClassName$1)] = {
  padding: "$space$1",
  height: "$space$7",
  display: "flex"
}, // If there's a children besides the icon
_a$8["&.".concat(iconStandaloneClassName$1, "&:not(:has(span))")] = {
  width: "$space$7"
}, _a$8["&.".concat(iconStandaloneClassName$1, "&:has(svg + span)")] = {
  paddingRight: "$space$3",
  paddingLeft: "$space$2",
  gap: "$space$1"
}, _a$8));
var roundedButtonClassName$1 = css({
  backgroundColor: "$colors$surface2",
  borderRadius: "99999px",
  border: "1px solid $colors$surface3",
  '&[data-active="true"]': {
    color: "$colors$surface1",
    background: "$colors$accent"
  },
  "&:hover:not(:disabled,[data-active='true'])": {
    backgroundColor: "$colors$surface3"
  }
});
var iconClassName$1 = css({ padding: 0 });
var fadeIn = keyframes$1({
  "0%": {
    opacity: 0
  },
  "100%": {
    opacity: 1
  }
});
var absoluteClassName$1 = css({
  position: "absolute",
  bottom: "0",
  left: "0",
  right: "0",
  top: "0",
  margin: "0",
  overflow: "auto",
  height: "100%",
  zIndex: "$top"
});
var errorClassName$1 = css((_b$2 = {
  whiteSpace: "pre-wrap",
  padding: "$space$10",
  backgroundColor: "$colors$surface1",
  display: "flex",
  gap: "$space$2",
  flexDirection: "column"
}, _b$2[".".concat(buttonClassName$1)] = {
  width: "auto",
  gap: "$space$2",
  padding: "0 $space$3 0 $space$2",
  marginTop: "$space$1"
}, _b$2.variants = {
  solidBg: {
    true: {
      backgroundColor: "$colors$errorSurface"
    }
  }
}, _b$2));
var errorBundlerClassName$1 = css((_c = {
  padding: "$space$10",
  backgroundColor: "$colors$surface1"
}, _c[".".concat(buttonClassName$1)] = {
  marginTop: "$space$6",
  width: "auto",
  gap: "$space$2",
  padding: "0 $space$3 0 $space$2"
}, _c));
var errorMessageClassName$1 = css({
  animation: "".concat(fadeIn, " 150ms ease"),
  color: "$colors$error",
  display: "flex",
  flexDirection: "column",
  gap: "$space$3",
  variants: {
    errorCode: { true: { fontFamily: "$font$mono" } }
  },
  a: {
    color: "inherit"
  },
  p: {
    margin: 0
  }
});
var _a$7;
var tabsClassName$1 = css({
  borderBottom: "1px solid $colors$surface2",
  background: "$colors$surface1"
});
var tabsScrollableClassName$1 = css({
  padding: "0 $space$2",
  overflow: "auto",
  display: "flex",
  flexWrap: "nowrap",
  alignItems: "stretch",
  minHeight: "40px",
  marginBottom: "-1px"
});
var tabContainer$1 = css({
  display: "flex",
  alignItems: "center",
  outline: "none",
  position: "relative",
  paddingRight: "20px",
  margin: "1px 0",
  "&:has(button:focus)": {
    outline: "$colors$accent auto 1px"
  }
});
var closeButtonClassName$1 = css({
  padding: "0 $space$1 0 $space$1",
  borderRadius: "$border$radius",
  marginLeft: "$space$1",
  width: "$space$5",
  visibility: "hidden",
  cursor: "pointer",
  position: "absolute",
  right: "0px",
  svg: {
    width: "$space$3",
    height: "$space$3",
    display: "block",
    position: "relative",
    top: 1
  }
});
var tabButton$1 = css((_a$7 = {
  padding: "0 $space$2",
  height: "$layout$headerHeight",
  whiteSpace: "nowrap",
  "&:focus": {
    outline: "none"
  }
}, _a$7["&:hover ~ .".concat(closeButtonClassName$1)] = { visibility: "visible" }, _a$7));
var FileTabs$1 = function(_a2) {
  var closableTabs = _a2.closableTabs, className = _a2.className, activeFileUniqueId = _a2.activeFileUniqueId, props = __rest$1(_a2, ["closableTabs", "className", "activeFileUniqueId"]);
  var sandpack = useSandpack$1().sandpack;
  var classNames = useClassNames$1();
  var activeFile = sandpack.activeFile, visibleFiles = sandpack.visibleFiles, setActiveFile = sandpack.setActiveFile;
  var _b = reactExports.useState(null), hoveredIndex = _b[0], setIsHoveredIndex = _b[1];
  var getTriggerText = function(currentPath) {
    var documentFileName = getFileName$1(currentPath);
    var pathsWithDuplicateFileNames = visibleFiles.reduce(function(prev, curr) {
      if (curr === currentPath) {
        return prev;
      }
      var fileName = getFileName$1(curr);
      if (fileName === documentFileName) {
        prev.push(curr);
        return prev;
      }
      return prev;
    }, []);
    if (pathsWithDuplicateFileNames.length === 0) {
      return documentFileName;
    } else {
      return calculateNearestUniquePath$1(currentPath, pathsWithDuplicateFileNames);
    }
  };
  var onKeyDown = function(_a3) {
    var _b2, _c2, _d, _e;
    var e = _a3.e, index2 = _a3.index;
    var target = e.currentTarget;
    switch (e.key) {
      case "ArrowLeft":
        {
          var leftSibling = target.previousElementSibling;
          if (leftSibling) {
            (_b2 = leftSibling.querySelector("button")) === null || _b2 === void 0 ? void 0 : _b2.focus();
            setActiveFile(visibleFiles[index2 - 1]);
          }
        }
        break;
      case "ArrowRight":
        {
          var rightSibling = target.nextElementSibling;
          if (rightSibling) {
            (_c2 = rightSibling.querySelector("button")) === null || _c2 === void 0 ? void 0 : _c2.focus();
            setActiveFile(visibleFiles[index2 + 1]);
          }
        }
        break;
      case "Home": {
        var parent_1 = target.parentElement;
        var firstChild = parent_1.firstElementChild;
        (_d = firstChild.querySelector("button")) === null || _d === void 0 ? void 0 : _d.focus();
        setActiveFile(visibleFiles[0]);
        break;
      }
      case "End": {
        var parent_2 = target.parentElement;
        var lastChild = parent_2.lastElementChild;
        (_e = lastChild.querySelector("button")) === null || _e === void 0 ? void 0 : _e.focus();
        setActiveFile(visibleFiles[-1]);
        break;
      }
    }
  };
  return jsxRuntimeExports.jsx("div", __assign$1({ className: classNames("tabs", [tabsClassName$1, className]), translate: "no" }, props, { children: jsxRuntimeExports.jsx("div", { "aria-label": "Select active file", className: classNames("tabs-scrollable-container", [
    tabsScrollableClassName$1
  ]), role: "tablist", children: visibleFiles.map(function(filePath, index2) {
    return jsxRuntimeExports.jsxs("div", { "aria-controls": "".concat(filePath, "-").concat(activeFileUniqueId, "-tab-panel"), "aria-selected": filePath === activeFile, className: classNames("tab-container", [tabContainer$1]), onKeyDown: function(e) {
      return onKeyDown({ e, index: index2 });
    }, onMouseEnter: function() {
      return setIsHoveredIndex(index2);
    }, onMouseLeave: function() {
      return setIsHoveredIndex(null);
    }, role: "tab", children: [jsxRuntimeExports.jsx("button", { className: classNames("tab-button", [buttonClassName$1, tabButton$1]), "data-active": filePath === activeFile, id: "".concat(filePath, "-").concat(activeFileUniqueId, "-tab"), onClick: function() {
      return setActiveFile(filePath);
    }, tabIndex: filePath === activeFile ? 0 : -1, title: filePath, type: "button", children: getTriggerText(filePath) }), closableTabs && visibleFiles.length > 1 && jsxRuntimeExports.jsx("span", { className: classNames("close-button", [closeButtonClassName$1]), onClick: function(ev) {
      ev.stopPropagation();
      sandpack.closeFile(filePath);
    }, style: {
      visibility: filePath === activeFile || hoveredIndex === index2 ? "visible" : "hidden"
    }, tabIndex: filePath === activeFile ? 0 : -1, children: jsxRuntimeExports.jsx(CloseIcon$1, {}) })] }, filePath);
  }) }) }));
};
var RoundedButton$1 = function(_a2) {
  var onClick = _a2.onClick, className = _a2.className, children = _a2.children;
  var classNames = useClassNames$1();
  return jsxRuntimeExports.jsx("button", { className: classNames("button", [
    classNames("icon-standalone"),
    buttonClassName$1,
    iconStandaloneClassName$1,
    roundedButtonClassName$1,
    className
  ]), onClick, type: "button", children });
};
var runButtonClassName$1 = css({
  position: "absolute",
  bottom: "$space$2",
  right: "$space$2",
  paddingRight: "$space$3"
});
var RunButton$1$1 = function(_a2) {
  _a2.className;
  var onClick = _a2.onClick, props = __rest$1(_a2, ["className", "onClick"]);
  var sandpack = useSandpack$1().sandpack;
  return jsxRuntimeExports.jsxs(RoundedButton$1, __assign$1({ className: runButtonClassName$1.toString(), onClick: function(event) {
    sandpack.runSandpack();
    onClick === null || onClick === void 0 ? void 0 : onClick(event);
  } }, props, { children: [jsxRuntimeExports.jsx(RunIcon$1, {}), jsxRuntimeExports.jsx("span", { children: "Run" })] }));
};
var _a$6;
var stackClassName$1 = css((_a$6 = {
  display: "flex",
  flexDirection: "column",
  width: "100%",
  position: "relative",
  backgroundColor: "$colors$surface1",
  gap: 1
}, _a$6["&:has(.".concat(THEME_PREFIX$1, "-stack)")] = {
  backgroundColor: "$colors$surface2"
}, _a$6));
var SandpackStack$1 = function(_a2) {
  var className = _a2.className, props = __rest$1(_a2, ["className"]);
  var classNames = useClassNames$1();
  return jsxRuntimeExports.jsx("div", __assign$1({ className: classNames("stack", [stackClassName$1, className]) }, props));
};
var useSandpackTheme$1 = function() {
  var _a2 = reactExports.useContext(SandpackThemeContext$1), theme = _a2.theme, id = _a2.id, mode = _a2.mode;
  return { theme, themeId: id, themeMode: mode };
};
var shallowEqual$1 = function(a, b) {
  if (a.length !== b.length)
    return false;
  var result = true;
  for (var index2 = 0; index2 < a.length; index2++) {
    if (a[index2] !== b[index2]) {
      result = false;
      break;
    }
  }
  return result;
};
var getCodeMirrorPosition$1 = function(doc, _a2) {
  var line = _a2.line, column = _a2.column;
  return doc.line(line).from + (column !== null && column !== void 0 ? column : 0) - 1;
};
var getEditorTheme$1 = function() {
  return EditorView.theme({
    "&": {
      backgroundColor: "var(--".concat(THEME_PREFIX$1, "-colors-surface1)"),
      color: "var(--".concat(THEME_PREFIX$1, "-syntax-color-plain)"),
      height: "100%"
    },
    ".cm-matchingBracket, .cm-nonmatchingBracket, &.cm-focused .cm-matchingBracket, &.cm-focused .cm-nonmatchingBracket": {
      color: "inherit",
      backgroundColor: "rgba(128,128,128,.25)",
      backgroundBlendMode: "difference"
    },
    "&.cm-editor.cm-focused": {
      outline: "none"
    },
    "& .cm-activeLine": {
      backgroundColor: "transparent"
    },
    "&.cm-editor.cm-focused .cm-activeLine": {
      backgroundColor: "var(--".concat(THEME_PREFIX$1, "-colors-surface3)"),
      borderRadius: "var(--".concat(THEME_PREFIX$1, "-border-radius)")
    },
    ".cm-errorLine": {
      backgroundColor: "var(--".concat(THEME_PREFIX$1, "-colors-errorSurface)"),
      borderRadius: "var(--".concat(THEME_PREFIX$1, "-border-radius)")
    },
    ".cm-content": {
      caretColor: "var(--".concat(THEME_PREFIX$1, "-colors-accent)"),
      padding: "0 var(--".concat(THEME_PREFIX$1, "-space-4)")
    },
    ".cm-scroller": {
      fontFamily: "var(--".concat(THEME_PREFIX$1, "-font-mono)"),
      lineHeight: "var(--".concat(THEME_PREFIX$1, "-font-lineHeight)")
    },
    ".cm-gutters": {
      backgroundColor: "var(--".concat(THEME_PREFIX$1, "-colors-surface1)"),
      color: "var(--".concat(THEME_PREFIX$1, "-colors-disabled)"),
      border: "none",
      paddingLeft: "var(--".concat(THEME_PREFIX$1, "-space-1)")
    },
    ".cm-gutter.cm-lineNumbers": {
      fontSize: ".6em"
    },
    ".cm-lineNumbers .cm-gutterElement": {
      lineHeight: "var(--".concat(THEME_PREFIX$1, "-font-lineHeight)"),
      minWidth: "var(--".concat(THEME_PREFIX$1, "-space-5)")
    },
    ".cm-content .cm-line": { paddingLeft: "var(--".concat(THEME_PREFIX$1, "-space-1)") },
    ".cm-content.cm-readonly .cm-line": { paddingLeft: 0 }
  });
};
var classNameToken$1 = function(name) {
  return "".concat(THEME_PREFIX$1, "-syntax-").concat(name);
};
var styleTokens = function() {
  var syntaxHighLightTokens = [
    "string",
    "plain",
    "comment",
    "keyword",
    "definition",
    "punctuation",
    "property",
    "tag",
    "static"
  ];
  return syntaxHighLightTokens.reduce(function(acc, token) {
    var _a2;
    return __assign$1(__assign$1({}, acc), (_a2 = {}, _a2[".".concat(classNameToken$1(token))] = {
      color: "$syntax$color$".concat(token),
      fontStyle: "$syntax$fontStyle$".concat(token)
    }, _a2));
  }, {});
};
var getSyntaxHighlight$1 = function(theme) {
  return HighlightStyle.define([
    { tag: tags.link, textDecoration: "underline" },
    { tag: tags.emphasis, fontStyle: "italic" },
    { tag: tags.strong, fontWeight: "bold" },
    {
      tag: tags.keyword,
      class: classNameToken$1("keyword")
    },
    {
      tag: [tags.atom, tags.number, tags.bool],
      class: classNameToken$1("static")
    },
    {
      tag: tags.variableName,
      class: classNameToken$1("plain")
    },
    {
      // Standard tags, e.g <h1 />
      tag: tags.standard(tags.tagName),
      class: classNameToken$1("tag")
    },
    {
      tag: [
        // Highlight function call
        tags.function(tags.variableName),
        // Highlight function definition differently (eg: functional component def in React)
        tags.definition(tags.function(tags.variableName)),
        // "Custom tags", meaning React component
        tags.tagName
      ],
      class: classNameToken$1("definition")
    },
    {
      tag: tags.propertyName,
      class: classNameToken$1("property")
    },
    {
      tag: [tags.literal, tags.inserted],
      class: classNameToken$1(theme.syntax.string ? "string" : "static")
    },
    {
      tag: tags.punctuation,
      class: classNameToken$1("punctuation")
    },
    {
      tag: [tags.comment, tags.quote],
      class: classNameToken$1("comment")
    }
  ]);
};
var getLanguageFromFile$1 = function(filePath, fileType, additionalLanguages) {
  if (!filePath && !fileType)
    return "javascript";
  var extension = fileType;
  if (!extension && filePath) {
    var extensionDotIndex = filePath.lastIndexOf(".");
    extension = filePath.slice(extensionDotIndex + 1);
  }
  for (var _i = 0, additionalLanguages_1 = additionalLanguages; _i < additionalLanguages_1.length; _i++) {
    var additionalLanguage = additionalLanguages_1[_i];
    if (extension === additionalLanguage.name || additionalLanguage.extensions.includes(extension || "")) {
      return additionalLanguage.name;
    }
  }
  switch (extension) {
    case "ts":
    case "tsx":
      return "typescript";
    case "html":
    case "svelte":
    case "vue":
    case "astro":
      return "html";
    case "css":
    case "less":
    case "scss":
      return "css";
    case "js":
    case "jsx":
    case "json":
    default:
      return "javascript";
  }
};
var getCodeMirrorLanguage$1 = function(extension, additionalLanguages) {
  var options = {
    javascript: javascript({ jsx: true, typescript: false }),
    typescript: javascript({ jsx: true, typescript: true }),
    html: html(),
    css: css$1()
  };
  for (var _i = 0, additionalLanguages_2 = additionalLanguages; _i < additionalLanguages_2.length; _i++) {
    var additionalLanguage = additionalLanguages_2[_i];
    if (extension === additionalLanguage.name) {
      return additionalLanguage.language;
    }
  }
  return options[extension];
};
var useCombinedRefs$1 = function() {
  var refs = [];
  for (var _i = 0; _i < arguments.length; _i++) {
    refs[_i] = arguments[_i];
  }
  return reactExports.useCallback(
    function(element) {
      return refs.forEach(function(ref) {
        if (!ref) {
          return;
        }
        if (typeof ref === "function") {
          return ref(element);
        }
        ref.current = element;
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    refs
  );
};
function highlightDecorators$1(positions) {
  return ViewPlugin.fromClass(
    /** @class */
    function() {
      function class_1(view) {
        this.decorations = this.getDecoration(view);
      }
      class_1.prototype.update = function(update) {
        return;
      };
      class_1.prototype.getDecoration = function(view) {
        if (!positions)
          return Decoration.none;
        var rangesDecorators = positions.map(function(item) {
          var _a2, _b, _c2;
          var lineDeco2 = Decoration.line({
            attributes: { class: (_a2 = item.className) !== null && _a2 !== void 0 ? _a2 : "" }
          });
          var markDeco = Decoration.mark({
            class: (_b = item.className) !== null && _b !== void 0 ? _b : "",
            attributes: (_c2 = item.elementAttributes) !== null && _c2 !== void 0 ? _c2 : void 0
          });
          var positionLineStart = getCodeMirrorPosition$1(view.state.doc, {
            line: item.line,
            column: item.startColumn
          }) + 1;
          if (item.startColumn && item.endColumn) {
            var positionLineEnd = getCodeMirrorPosition$1(view.state.doc, {
              line: item.line,
              column: item.endColumn
            }) + 1;
            return markDeco.range(positionLineStart, positionLineEnd);
          }
          return lineDeco2.range(positionLineStart);
        });
        return Decoration.set(rangesDecorators);
      };
      return class_1;
    }(),
    {
      decorations: function(v) {
        return v.decorations;
      }
    }
  );
}
function highlightInlineError$1() {
  return activeLineHighlighter$1;
}
var lineDeco$1 = Decoration.line({ attributes: { class: "cm-errorLine" } });
var activeLineHighlighter$1 = ViewPlugin.fromClass(
  /** @class */
  function() {
    function class_1() {
      this.decorations = Decoration.none;
    }
    class_1.prototype.update = function(update) {
      var _this = this;
      update.transactions.forEach(function(trans) {
        var errorValue = trans.annotation("show-error");
        if (errorValue !== void 0) {
          var position = getCodeMirrorPosition$1(update.view.state.doc, {
            line: errorValue
          }) + 1;
          _this.decorations = Decoration.set([lineDeco$1.range(position)]);
        } else if (trans.annotation("remove-errors")) {
          _this.decorations = Decoration.none;
        }
      });
    };
    return class_1;
  }(),
  {
    decorations: function(v) {
      return v.decorations;
    }
  }
);
var _a$5, _b$1;
var placeholderClassName$1 = css({
  margin: "0",
  display: "block",
  fontFamily: "$font$mono",
  fontSize: "$font$size",
  color: "$syntax$color$plain",
  lineHeight: "$font$lineHeight"
});
var tokensClassName$1 = css(styleTokens());
var editorClassName$1 = css((_a$5 = {
  flex: 1,
  position: "relative",
  overflow: "auto",
  background: "$colors$surface1",
  ".cm-scroller": {
    padding: "$space$4 0"
  }
}, _a$5[".".concat(placeholderClassName$1)] = {
  padding: "$space$4 0"
}, /**
 * For iOS: prevent browser zoom when clicking on sandbox.
 * Does NOT apply to code blocks.
 */
_a$5["@media screen and (max-width: 768px)"] = {
  "@supports (-webkit-overflow-scrolling: touch)": {
    ".cm-content": { fontSize: "16px" }
  }
}, _a$5));
var cmClassName$1 = css({
  margin: "0",
  outline: "none",
  height: "100%"
});
var readOnlyClassName$1 = css((_b$1 = {
  fontFamily: "$font$mono",
  fontSize: "0.8em",
  position: "absolute",
  right: "$space$2",
  bottom: "$space$2",
  zIndex: "$top",
  color: "$colors$clickable",
  backgroundColor: "$colors$surface2",
  borderRadius: "99999px",
  padding: "calc($space$1 / 2) $space$2"
}, _b$1["& + .".concat(buttonClassName$1)] = {
  right: "calc($space$11 * 2)"
}, _b$1));
var useSyntaxHighlight$1 = function(_a2) {
  var langSupport = _a2.langSupport, highlightTheme = _a2.highlightTheme, _b = _a2.code, code = _b === void 0 ? "" : _b;
  var tree = langSupport.language.parser.parse(code);
  var offSet = 0;
  var codeElementsRender = [];
  var addElement = function(to, className) {
    if (to > offSet) {
      var children = code.slice(offSet, to);
      codeElementsRender.push(className ? reactExports.createElement("span", {
        children,
        className,
        key: "".concat(to).concat(offSet)
      }) : children);
      offSet = to;
    }
  };
  highlightTree(tree, highlightTheme, function(from, to, className) {
    addElement(from, "");
    addElement(to, className);
  });
  if (offSet < code.length && (code === null || code === void 0 ? void 0 : code.includes("\n"))) {
    codeElementsRender.push("\n\n");
  }
  return codeElementsRender;
};
var CodeMirror$1 = reactExports.forwardRef(function(_a2, ref) {
  var _b = _a2.code, code = _b === void 0 ? "" : _b, filePath = _a2.filePath, fileType = _a2.fileType, onCodeUpdate = _a2.onCodeUpdate, _c2 = _a2.showLineNumbers, showLineNumbers = _c2 === void 0 ? false : _c2, _d = _a2.showInlineErrors, showInlineErrors = _d === void 0 ? false : _d, _e = _a2.wrapContent, wrapContent = _e === void 0 ? false : _e, _f = _a2.editorState, editorState = _f === void 0 ? "pristine" : _f, _g = _a2.readOnly, readOnly = _g === void 0 ? false : _g, _h = _a2.showReadOnly, showReadOnly = _h === void 0 ? true : _h, decorators = _a2.decorators, _j = _a2.initMode, initMode = _j === void 0 ? "lazy" : _j, _k = _a2.extensions, extensions = _k === void 0 ? [] : _k, _l = _a2.extensionsKeymap, extensionsKeymap = _l === void 0 ? [] : _l, _m = _a2.additionalLanguages, additionalLanguages = _m === void 0 ? [] : _m;
  var wrapper = reactExports.useRef(null);
  var combinedRef = useCombinedRefs$1(wrapper, ref);
  var cmView = reactExports.useRef();
  var _o = useSandpackTheme$1(), theme = _o.theme, themeId = _o.themeId;
  var _p = reactExports.useState(code), internalCode = _p[0], setInternalCode = _p[1];
  var _q = reactExports.useState(initMode === "immediate"), shouldInitEditor = _q[0], setShouldInitEditor = _q[1];
  var classNames = useClassNames$1();
  var _r = useSandpack$1(), listen = _r.listen, autoReload = _r.sandpack.autoReload;
  var prevExtension = reactExports.useRef([]);
  var prevExtensionKeymap = reactExports.useRef([]);
  var isIntersecting = useIntersectionObserver(wrapper, {
    rootMargin: "600px 0px",
    threshold: 0.2
  }).isIntersecting;
  reactExports.useImperativeHandle(ref, function() {
    return {
      getCodemirror: function() {
        return cmView.current;
      }
    };
  });
  reactExports.useEffect(function() {
    var mode = initMode === "lazy" || initMode === "user-visible";
    if (mode && isIntersecting) {
      setShouldInitEditor(true);
    }
  }, [initMode, isIntersecting]);
  var languageExtension = getLanguageFromFile$1(filePath, fileType, additionalLanguages);
  var langSupport = getCodeMirrorLanguage$1(languageExtension, additionalLanguages);
  var highlightTheme = getSyntaxHighlight$1(theme);
  var syntaxHighlightRender = useSyntaxHighlight$1({
    langSupport,
    highlightTheme,
    code
  });
  var sortedDecorators = reactExports.useMemo(function() {
    return decorators ? decorators.sort(function(d1, d2) {
      return d1.line - d2.line;
    }) : decorators;
  }, [decorators]);
  var useStaticReadOnly = readOnly && (decorators === null || decorators === void 0 ? void 0 : decorators.length) === 0;
  reactExports.useEffect(function() {
    if (!wrapper.current || !shouldInitEditor || useStaticReadOnly) {
      return;
    }
    var parentDiv = wrapper.current;
    var existingPlaceholder = parentDiv.querySelector(".sp-pre-placeholder");
    if (existingPlaceholder) {
      parentDiv.removeChild(existingPlaceholder);
    }
    var view = new EditorView({
      doc: code,
      extensions: [],
      parent: parentDiv
    });
    view.contentDOM.setAttribute("data-gramm", "false");
    view.contentDOM.setAttribute("data-lt-active", "false");
    view.contentDOM.setAttribute("aria-label", filePath ? "Code Editor for ".concat(getFileName$1(filePath)) : "Code Editor");
    view.contentDOM.setAttribute("tabIndex", "-1");
    cmView.current = view;
    return function() {
      var _a3;
      (_a3 = cmView.current) === null || _a3 === void 0 ? void 0 : _a3.destroy();
    };
  }, [shouldInitEditor, readOnly, useStaticReadOnly]);
  reactExports.useEffect(function() {
    if (useStaticReadOnly) {
      return;
    }
    if (cmView.current) {
      var customCommandsKeymap = [
        {
          key: "Tab",
          run: function(view) {
            var _a3, _b2;
            indentMore(view);
            var customKey = extensionsKeymap.find(function(_a4) {
              var key = _a4.key;
              return key === "Tab";
            });
            return (_b2 = (_a3 = customKey === null || customKey === void 0 ? void 0 : customKey.run) === null || _a3 === void 0 ? void 0 : _a3.call(customKey, view)) !== null && _b2 !== void 0 ? _b2 : true;
          }
        },
        {
          key: "Shift-Tab",
          run: function(view) {
            var _a3, _b2;
            indentLess({ state: view.state, dispatch: view.dispatch });
            var customKey = extensionsKeymap.find(function(_a4) {
              var key = _a4.key;
              return key === "Shift-Tab";
            });
            return (_b2 = (_a3 = customKey === null || customKey === void 0 ? void 0 : customKey.run) === null || _a3 === void 0 ? void 0 : _a3.call(customKey, view)) !== null && _b2 !== void 0 ? _b2 : true;
          }
        },
        {
          key: "Escape",
          run: function() {
            if (readOnly)
              return true;
            if (wrapper.current) {
              wrapper.current.focus();
            }
            return true;
          }
        },
        {
          key: "mod-Backspace",
          run: deleteGroupBackward
        }
      ];
      var extensionList = __spreadArray$1(__spreadArray$1([
        highlightSpecialChars(),
        history$1(),
        closeBrackets()
      ], extensions, true), [
        keymap.of(__spreadArray$1(__spreadArray$1(__spreadArray$1(__spreadArray$1(__spreadArray$1([], closeBracketsKeymap, true), defaultKeymap, true), historyKeymap, true), customCommandsKeymap, true), extensionsKeymap, true)),
        langSupport,
        getEditorTheme$1(),
        syntaxHighlighting(highlightTheme),
        EditorView.updateListener.of(function(update) {
          if (update.docChanged) {
            var newCode = update.state.doc.toString();
            setInternalCode(newCode);
            onCodeUpdate === null || onCodeUpdate === void 0 ? void 0 : onCodeUpdate(newCode);
          }
        })
      ], false);
      if (readOnly) {
        extensionList.push(EditorState.readOnly.of(true));
        extensionList.push(EditorView.editable.of(false));
      } else {
        extensionList.push(bracketMatching());
        extensionList.push(highlightActiveLine());
      }
      if (sortedDecorators) {
        extensionList.push(highlightDecorators$1(sortedDecorators));
      }
      if (wrapContent) {
        extensionList.push(EditorView.lineWrapping);
      }
      if (showLineNumbers) {
        extensionList.push(lineNumbers());
      }
      if (showInlineErrors) {
        extensionList.push(highlightInlineError$1());
      }
      cmView.current.dispatch({
        effects: StateEffect.reconfigure.of(extensionList)
      });
    }
  }, [
    shouldInitEditor,
    sortedDecorators,
    showLineNumbers,
    wrapContent,
    themeId,
    readOnly,
    useStaticReadOnly,
    autoReload
  ]);
  reactExports.useEffect(function applyExtensions() {
    var view = cmView.current;
    var dependenciesAreDiff = !shallowEqual$1(extensions, prevExtension.current) || !shallowEqual$1(extensionsKeymap, prevExtensionKeymap.current);
    if (view && dependenciesAreDiff) {
      view.dispatch({
        effects: StateEffect.appendConfig.of(extensions)
      });
      view.dispatch({
        effects: StateEffect.appendConfig.of(keymap.of(__spreadArray$1([], extensionsKeymap, true)))
      });
      prevExtension.current = extensions;
      prevExtensionKeymap.current = extensionsKeymap;
    }
  }, [extensions, extensionsKeymap]);
  reactExports.useEffect(function() {
    if (cmView.current && editorState === "dirty" && window.matchMedia("(min-width: 768px)").matches) {
      cmView.current.contentDOM.focus();
    }
  }, []);
  reactExports.useEffect(function() {
    if (cmView.current && typeof code === "string" && code !== internalCode) {
      var view = cmView.current;
      var selection = view.state.selection.ranges.some(function(_a3) {
        var to = _a3.to, from = _a3.from;
        return to > code.length || from > code.length;
      }) ? EditorSelection.cursor(code.length) : view.state.selection;
      var changes = { from: 0, to: view.state.doc.length, insert: code };
      view.dispatch({ changes, selection });
    }
  }, [code]);
  reactExports.useEffect(function messageToInlineError() {
    if (!showInlineErrors)
      return;
    var unsubscribe = listen(function(message) {
      var view = cmView.current;
      if (message.type === "success") {
        view === null || view === void 0 ? void 0 : view.dispatch({
          // @ts-ignore
          annotations: [new Annotation("remove-errors", true)]
        });
      } else if (message.type === "action" && message.action === "show-error" && message.path === filePath && message.line) {
        view === null || view === void 0 ? void 0 : view.dispatch({
          // @ts-ignore
          annotations: [new Annotation("show-error", message.line)]
        });
      }
    });
    return function() {
      return unsubscribe();
    };
  }, [listen, showInlineErrors]);
  var handleContainerKeyDown = function(evt) {
    if (evt.key === "Enter" && cmView.current) {
      evt.preventDefault();
      cmView.current.contentDOM.focus();
    }
  };
  var gutterLineOffset = function() {
    var offset = 4;
    if (showLineNumbers) {
      offset += 6;
    }
    if (!readOnly) {
      offset += 1;
    }
    return "var(--".concat(THEME_PREFIX$1, "-space-").concat(offset, ")");
  };
  if (useStaticReadOnly) {
    return jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [jsxRuntimeExports.jsx("pre", { ref: combinedRef, className: classNames("cm", [
      classNames(editorState),
      classNames(languageExtension),
      cmClassName$1,
      tokensClassName$1
    ]), translate: "no", children: jsxRuntimeExports.jsx("code", { className: classNames("pre-placeholder", [placeholderClassName$1]), style: { marginLeft: gutterLineOffset() }, children: syntaxHighlightRender }) }), readOnly && showReadOnly && jsxRuntimeExports.jsx("span", __assign$1({ className: classNames("read-only", [readOnlyClassName$1]) }, {}, { children: "Read-only" }))] });
  }
  return jsxRuntimeExports.jsx("div", { ref: combinedRef, "aria-autocomplete": "list", "aria-label": filePath ? "Code Editor for ".concat(getFileName$1(filePath)) : "Code Editor", "aria-multiline": "true", className: classNames("cm", [
    classNames(editorState),
    classNames(languageExtension),
    cmClassName$1,
    tokensClassName$1
  ]), onKeyDown: handleContainerKeyDown, role: "textbox", tabIndex: 0, translate: "no", suppressHydrationWarning: true, children: jsxRuntimeExports.jsx("pre", { className: classNames("pre-placeholder", [placeholderClassName$1]), style: { marginLeft: gutterLineOffset() }, children: syntaxHighlightRender }) });
});
var SandpackCodeEditor = reactExports.forwardRef(function(_a2, ref) {
  var showTabs = _a2.showTabs, _b = _a2.showLineNumbers, showLineNumbers = _b === void 0 ? false : _b, _c2 = _a2.showInlineErrors, showInlineErrors = _c2 === void 0 ? false : _c2, _d = _a2.showRunButton, showRunButton = _d === void 0 ? true : _d, _e = _a2.wrapContent, wrapContent = _e === void 0 ? false : _e, _f = _a2.closableTabs, closableTabs = _f === void 0 ? false : _f, initMode = _a2.initMode, extensions = _a2.extensions, extensionsKeymap = _a2.extensionsKeymap, readOnly = _a2.readOnly, showReadOnly = _a2.showReadOnly, additionalLanguages = _a2.additionalLanguages, className = _a2.className, props = __rest$1(_a2, ["showTabs", "showLineNumbers", "showInlineErrors", "showRunButton", "wrapContent", "closableTabs", "initMode", "extensions", "extensionsKeymap", "readOnly", "showReadOnly", "additionalLanguages", "className"]);
  var sandpack = useSandpack$1().sandpack;
  var _g = useActiveCode$1(), code = _g.code, updateCode = _g.updateCode, readOnlyFile = _g.readOnly;
  var activeFile = sandpack.activeFile, status = sandpack.status, editorState = sandpack.editorState;
  var shouldShowTabs = showTabs !== null && showTabs !== void 0 ? showTabs : sandpack.visibleFiles.length > 1;
  var classNames = useClassNames$1();
  var handleCodeUpdate = function(newCode, shouldUpdatePreview) {
    if (shouldUpdatePreview === void 0) {
      shouldUpdatePreview = true;
    }
    updateCode(newCode, shouldUpdatePreview);
  };
  var activeFileUniqueId = useSandpackId$1();
  return jsxRuntimeExports.jsxs(SandpackStack$1, __assign$1({ className: classNames("editor", [className]) }, props, { children: [shouldShowTabs && jsxRuntimeExports.jsx(FileTabs$1, { activeFileUniqueId, closableTabs }), jsxRuntimeExports.jsxs("div", { "aria-labelledby": "".concat(activeFile, "-").concat(activeFileUniqueId, "-tab"), className: classNames("code-editor", [editorClassName$1]), id: "".concat(activeFile, "-").concat(activeFileUniqueId, "-tab-panel"), role: "tabpanel", children: [jsxRuntimeExports.jsx(CodeMirror$1, { ref, additionalLanguages, code, editorState, extensions, extensionsKeymap, filePath: activeFile, initMode: initMode || sandpack.initMode, onCodeUpdate: function(newCode) {
    var _a3;
    return handleCodeUpdate(newCode, (_a3 = sandpack.autoReload) !== null && _a3 !== void 0 ? _a3 : true);
  }, readOnly: readOnly || readOnlyFile, showInlineErrors, showLineNumbers, showReadOnly, wrapContent }, activeFile), showRunButton && (!sandpack.autoReload || status === "idle") ? jsxRuntimeExports.jsx(RunButton$1$1, {}) : null] })] }));
});
reactExports.forwardRef(function(_a2, ref) {
  var showTabs = _a2.showTabs, showLineNumbers = _a2.showLineNumbers, decorators = _a2.decorators, propCode = _a2.code, initMode = _a2.initMode, wrapContent = _a2.wrapContent, additionalLanguages = _a2.additionalLanguages, props = __rest$1(_a2, ["showTabs", "showLineNumbers", "decorators", "code", "initMode", "wrapContent", "additionalLanguages"]);
  var sandpack = useSandpack$1().sandpack;
  var code = useActiveCode$1().code;
  var classNames = useClassNames$1();
  var shouldShowTabs = showTabs !== null && showTabs !== void 0 ? showTabs : sandpack.visibleFiles.length > 1;
  var activeFileUniqueId = useSandpackId$1();
  return jsxRuntimeExports.jsxs(SandpackStack$1, __assign$1({ className: classNames("editor-viewer") }, props, { children: [shouldShowTabs ? jsxRuntimeExports.jsx(FileTabs$1, { activeFileUniqueId }) : null, jsxRuntimeExports.jsx("div", { "aria-labelledby": "".concat(sandpack.activeFile, "-").concat(activeFileUniqueId, "-tab"), className: classNames("code-editor", [editorClassName$1]), id: "".concat(sandpack.activeFile, "-").concat(activeFileUniqueId, "-tab-panel"), role: "tabpanel", children: jsxRuntimeExports.jsx(CodeMirror$1, { ref, additionalLanguages, code: propCode !== null && propCode !== void 0 ? propCode : code, decorators, filePath: sandpack.activeFile, initMode: initMode || sandpack.initMode, showLineNumbers, showReadOnly: false, wrapContent, readOnly: true }) }), sandpack.status === "idle" ? jsxRuntimeExports.jsx(RunButton$1$1, {}) : null] }));
});
var _a$4, _b$3;
var layoutClassName$1 = css((_a$4 = {
  border: "1px solid $colors$surface2",
  display: "flex",
  flexWrap: "wrap",
  alignItems: "stretch",
  borderRadius: "$border$radius",
  overflow: "hidden",
  position: "relative",
  backgroundColor: "$colors$surface2",
  gap: 1
}, _a$4["> .".concat(stackClassName$1)] = {
  flexGrow: 1,
  flexShrink: 1,
  flexBasis: "0",
  height: "$layout$height",
  overflow: "hidden",
  "@media print": {
    height: "auto",
    display: "block"
  },
  "@media screen and (max-width: 768px)": (_b$3 = {}, _b$3["&:not(.".concat(THEME_PREFIX$1, "-preview, .").concat(THEME_PREFIX$1, "-editor, .").concat(THEME_PREFIX$1, "-preset-column)")] = {
    height: "calc($layout$height / 2)"
  }, /* triggers the layout break at the 768px breakpoint, not when the component is less then 700px */
  _b$3.minWidth = "100%;", _b$3)
}, _a$4["> .".concat(THEME_PREFIX$1, "-file-explorer")] = {
  flex: 0.2,
  minWidth: 200,
  "@media screen and (max-width: 768px)": {
    flex: 1
  }
}, _a$4));
reactExports.forwardRef(function(_a2, ref) {
  var children = _a2.children, className = _a2.className, props = __rest$1(_a2, ["children", "className"]);
  var sandpack = useSandpack$1().sandpack;
  var classNames = useClassNames$1();
  var combinedRef = useCombinedRefs$1(sandpack.lazyAnchorRef, ref);
  return jsxRuntimeExports.jsx("div", __assign$1({ ref: combinedRef, className: classNames("layout", [layoutClassName$1, className]) }, props, { children }));
});
var useErrorMessage$1 = function() {
  var _a2;
  var sandpack = useSandpack$1().sandpack;
  var error = sandpack.error;
  return (_a2 = error === null || error === void 0 ? void 0 : error.message) !== null && _a2 !== void 0 ? _a2 : null;
};
var FADE_ANIMATION_DURATION$1 = 200;
var useLoadingOverlayState$1 = function(clientId, externalLoading) {
  var _a2 = useSandpack$1(), sandpack = _a2.sandpack, listen = _a2.listen;
  var _b = reactExports.useState("LOADING"), state = _b[0], setState = _b[1];
  reactExports.useEffect(function() {
    var unsubscribe = listen(function(message) {
      if (message.type === "start" && message.firstLoad === true) {
        setState("LOADING");
      }
      if (message.type === "done") {
        setState(function(prev) {
          return prev === "LOADING" ? "PRE_FADING" : "HIDDEN";
        });
      }
    }, clientId);
    return function() {
      unsubscribe();
    };
  }, [clientId, sandpack.status === "idle"]);
  reactExports.useEffect(function() {
    var fadeTimeout;
    if (state === "PRE_FADING" && !externalLoading) {
      setState("FADING");
    } else if (state === "FADING") {
      fadeTimeout = setTimeout(function() {
        return setState("HIDDEN");
      }, FADE_ANIMATION_DURATION$1);
    }
    return function() {
      clearTimeout(fadeTimeout);
    };
  }, [state, externalLoading]);
  if (sandpack.status === "timeout") {
    return "TIMEOUT";
  }
  if (sandpack.status !== "running") {
    return "HIDDEN";
  }
  return state;
};
var useSandpackNavigation$1 = function(clientId) {
  var dispatch = useSandpack$1().dispatch;
  return {
    refresh: function() {
      return dispatch({ type: "refresh" }, clientId);
    },
    back: function() {
      return dispatch({ type: "urlback" }, clientId);
    },
    forward: function() {
      return dispatch({ type: "urlforward" }, clientId);
    }
  };
};
var useSandpackClient$1 = function(clientPropsOverride) {
  var _a2 = useSandpack$1(), sandpack = _a2.sandpack, listen = _a2.listen, dispatch = _a2.dispatch;
  var iframeRef = reactExports.useRef(null);
  var clientId = reactExports.useRef(generateRandomId$2());
  reactExports.useEffect(function() {
    var iframeElement = iframeRef.current;
    var clientIdValue = clientId.current;
    if (iframeElement !== null) {
      sandpack.registerBundler(iframeElement, clientIdValue, clientPropsOverride);
    }
    return function() {
      return sandpack.unregisterBundler(clientIdValue);
    };
  }, []);
  var getClient = function() {
    return sandpack.clients[clientId.current] || null;
  };
  return {
    sandpack,
    getClient,
    clientId: clientId.current,
    iframe: iframeRef,
    listen: function(listener) {
      return listen(listener, clientId.current);
    },
    dispatch: function(message) {
      return dispatch(message, clientId.current);
    }
  };
};
var useSandpackShell$1 = function(clientId) {
  var dispatch = useSandpack$1().dispatch;
  return {
    restart: function() {
      return dispatch({ type: "shell/restart" }, clientId);
    },
    openPreview: function() {
      return dispatch({ type: "shell/openPreview" }, clientId);
    }
  };
};
var mapProgressMessage$1 = function(originalMessage, firstTotalPending) {
  var _a2;
  switch (originalMessage.state) {
    case "downloading_manifest":
      return "[1/3] Downloading manifest";
    case "downloaded_module":
      return "[2/3] Downloaded ".concat(originalMessage.name, " (").concat(firstTotalPending - originalMessage.totalPending, "/").concat(firstTotalPending, ")");
    case "starting_command":
      return "[3/3] Starting command";
    case "command_running":
      return '[3/3] Running "'.concat((_a2 = originalMessage.command) === null || _a2 === void 0 ? void 0 : _a2.trim(), '"');
  }
};
var useSandpackPreviewProgress$1 = function(props) {
  var _a2 = reactExports.useState(false), isReady = _a2[0], setIsReady = _a2[1];
  var _b = reactExports.useState(), totalDependencies = _b[0], setTotalDependencies = _b[1];
  var _c2 = reactExports.useState(null), loadingMessage = _c2[0], setLoadingMessage = _c2[1];
  var timeout = props === null || props === void 0 ? void 0 : props.timeout;
  var clientId = props === null || props === void 0 ? void 0 : props.clientId;
  var listen = useSandpack$1().listen;
  reactExports.useEffect(function() {
    var timer;
    var unsubscribe = listen(function(message) {
      if (message.type === "start" && message.firstLoad) {
        setIsReady(false);
      }
      if (timeout) {
        timer = setTimeout(function() {
          setLoadingMessage(null);
        }, timeout);
      }
      if (message.type === "dependencies") {
        setLoadingMessage(function() {
          switch (message.data.state) {
            case "downloading_manifest":
              return "[1/3] Downloading manifest";
            case "downloaded_module":
              return "[2/3] Downloaded ".concat(message.data.name, " (").concat(message.data.progress, "/").concat(message.data.total, ")");
            case "starting":
              return "[3/3] Starting";
          }
          return null;
        });
      } else if (message.type === "shell/progress" && !isReady) {
        if (!totalDependencies && message.data.state === "downloaded_module") {
          setTotalDependencies(message.data.totalPending);
        }
        if (totalDependencies !== void 0) {
          setLoadingMessage(mapProgressMessage$1(message.data, totalDependencies));
        }
      }
      if (message.type === "done" && message.compilatonError === false) {
        setLoadingMessage(null);
        setIsReady(true);
        clearTimeout(timer);
      }
    }, clientId);
    return function() {
      if (timer) {
        clearTimeout(timer);
      }
      unsubscribe();
    };
  }, [clientId, isReady, totalDependencies, timeout]);
  return loadingMessage;
};
var MAX_MESSAGE_COUNT$1$1 = 400 * 2;
var useSandpackShellStdout$1 = function(_a2) {
  var clientId = _a2.clientId, _b = _a2.maxMessageCount, maxMessageCount = _b === void 0 ? MAX_MESSAGE_COUNT$1$1 : _b;
  _a2.resetOnPreviewRestart;
  var _d = reactExports.useState([]), logs = _d[0], setLogs = _d[1];
  var listen = useSandpack$1().listen;
  reactExports.useEffect(function() {
    var unsubscribe = listen(function(message) {
      if (message.type === "start") {
        setLogs([]);
      } else if (message.type === "stdout" && message.payload.data && Boolean(message.payload.data.trim())) {
        setLogs(function(prev) {
          var messages = __spreadArray$1(__spreadArray$1([], prev, true), [
            { data: message.payload.data, id: generateRandomId$2() }
          ], false);
          while (messages.length > maxMessageCount) {
            messages.shift();
          }
          return messages;
        });
      }
    }, clientId);
    return unsubscribe;
  }, [maxMessageCount, clientId]);
  return { logs, reset: function() {
    return setLogs([]);
  } };
};
var mapBundlerErrors$1 = function(originalMessage) {
  var errorMessage = originalMessage.replace("[sandpack-client]: ", "");
  if (/process.exit/.test(errorMessage)) {
    var exitCode = errorMessage.match(/process.exit\((\d+)\)/);
    if (!exitCode)
      return errorMessage;
    if (Number(exitCode[1]) === 0) {
      return "Server is not running, would you like to start it again?";
    }
    return "Server has crashed with status code ".concat(exitCode[1], ", would you like to restart the server?");
  }
  return errorMessage;
};
var ErrorOverlay$1 = function(props) {
  var children = props.children, className = props.className, otherProps = __rest$1(props, ["children", "className"]);
  var errorMessage = useErrorMessage$1();
  var restart = useSandpackShell$1().restart;
  var classNames = useClassNames$1();
  var _a2 = useSandpack$1().sandpack, runSandpack = _a2.runSandpack, teamId = _a2.teamId;
  var dispatch = useSandpack$1().dispatch;
  if (!errorMessage && !children) {
    return null;
  }
  var isSandpackBundlerError = errorMessage === null || errorMessage === void 0 ? void 0 : errorMessage.startsWith("[sandpack-client]");
  var privateDependencyError = errorMessage === null || errorMessage === void 0 ? void 0 : errorMessage.includes("NPM_REGISTRY_UNAUTHENTICATED_REQUEST");
  var onSignIn = function() {
    if (teamId) {
      dispatch({ type: "sign-in", teamId });
    }
  };
  if (privateDependencyError) {
    return jsxRuntimeExports.jsxs("div", __assign$1({ className: classNames("overlay", [
      classNames("error"),
      absoluteClassName$1,
      errorBundlerClassName$1,
      className
    ]) }, props, { children: [jsxRuntimeExports.jsx("p", { className: classNames("error-message", [errorMessageClassName$1]), children: jsxRuntimeExports.jsx("strong", { children: "Unable to fetch required dependency." }) }), jsxRuntimeExports.jsx("div", { className: classNames("error-message", [errorMessageClassName$1]), children: jsxRuntimeExports.jsxs("p", { children: ["Authentication required. Please sign in to your account (make sure to allow pop-ups to this page) and try again. If the issue persists, contact", " ", jsxRuntimeExports.jsx("a", { href: "mailto:hello@codesandbox.io?subject=Sandpack Timeout Error", children: "support" }), " ", "for further assistance."] }) }), jsxRuntimeExports.jsx("div", { children: jsxRuntimeExports.jsxs("button", { className: classNames("button", [
      buttonClassName$1,
      iconStandaloneClassName$1,
      roundedButtonClassName$1
    ]), onClick: onSignIn, children: [jsxRuntimeExports.jsx(SignInIcon$1, {}), jsxRuntimeExports.jsx("span", { children: "Sign in" })] }) })] }));
  }
  if (isSandpackBundlerError && errorMessage) {
    return jsxRuntimeExports.jsx("div", __assign$1({ className: classNames("overlay", [
      classNames("error"),
      absoluteClassName$1,
      errorBundlerClassName$1,
      className
    ]) }, otherProps, { children: jsxRuntimeExports.jsxs("div", { className: classNames("error-message", [errorMessageClassName$1]), children: [jsxRuntimeExports.jsx("p", { className: classNames("error-title", [css({ fontWeight: "bold" })]), children: "Couldn't connect to server" }), jsxRuntimeExports.jsx("p", { children: mapBundlerErrors$1(errorMessage) }), jsxRuntimeExports.jsx("div", { children: jsxRuntimeExports.jsxs("button", { className: classNames("button", [
      classNames("icon-standalone"),
      buttonClassName$1,
      iconStandaloneClassName$1,
      roundedButtonClassName$1
    ]), onClick: function() {
      restart();
      runSandpack();
    }, title: "Restart script", type: "button", children: [jsxRuntimeExports.jsx(RestartIcon$1, {}), " ", jsxRuntimeExports.jsx("span", { children: "Restart" })] }) })] }) }));
  }
  return jsxRuntimeExports.jsxs("div", __assign$1({ className: classNames("overlay", [
    classNames("error"),
    absoluteClassName$1,
    errorClassName$1({ solidBg: true }),
    className
  ]), translate: "no" }, otherProps, { children: [jsxRuntimeExports.jsx("p", { className: classNames("error-message", [errorMessageClassName$1]), children: jsxRuntimeExports.jsx("strong", { children: "Something went wrong" }) }), jsxRuntimeExports.jsx("p", { className: classNames("error-message", [
    errorMessageClassName$1({ errorCode: true })
  ]), children: errorMessage || children })] }));
};
function ansiToJSON$1(input, use_classes) {
  if (use_classes === void 0) {
    use_classes = false;
  }
  input = escapeCarriageExports.escapeCarriageReturn(fixBackspace$1(input));
  return Anser.ansiToJson(input, {
    json: true,
    remove_empty: true,
    use_classes
  });
}
function createClass$1(bundle) {
  var classNames = "";
  if (bundle.bg) {
    classNames += "".concat(bundle.bg, "-bg ");
  }
  if (bundle.fg) {
    classNames += "".concat(bundle.fg, "-fg ");
  }
  if (bundle.decoration) {
    classNames += "ansi-".concat(bundle.decoration, " ");
  }
  if (classNames === "") {
    return null;
  }
  classNames = classNames.substring(0, classNames.length - 1);
  return classNames;
}
function createStyle$1(bundle) {
  var style = {};
  if (bundle.bg) {
    style.backgroundColor = "rgb(".concat(bundle.bg, ")");
  }
  if (bundle.fg) {
    style.color = "rgb(".concat(bundle.fg, ")");
  }
  switch (bundle.decoration) {
    case "bold":
      style.fontWeight = "bold";
      break;
    case "dim":
      style.opacity = "0.5";
      break;
    case "italic":
      style.fontStyle = "italic";
      break;
    case "hidden":
      style.visibility = "hidden";
      break;
    case "strikethrough":
      style.textDecoration = "line-through";
      break;
    case "underline":
      style.textDecoration = "underline";
      break;
    case "blink":
      style.textDecoration = "blink";
      break;
  }
  return style;
}
function convertBundleIntoReact$1(linkify, useClasses, bundle, key) {
  var style = useClasses ? null : createStyle$1(bundle);
  var className = useClasses ? createClass$1(bundle) : null;
  if (!linkify) {
    return reactExports.createElement("span", { style, key, className }, bundle.content);
  }
  var content = [];
  var linkRegex = /(\s|^)(https?:\/\/(?:www\.|(?!www))[^\s.]+\.[^\s]{2,}|www\.[^\s]+\.[^\s]{2,})/g;
  var index2 = 0;
  var match;
  while ((match = linkRegex.exec(bundle.content)) !== null) {
    var pre = match[1], url = match[2];
    var startIndex = match.index + pre.length;
    if (startIndex > index2) {
      content.push(bundle.content.substring(index2, startIndex));
    }
    var href = url.startsWith("www.") ? "http://".concat(url) : url;
    content.push(reactExports.createElement("a", {
      key: index2,
      href,
      target: "_blank"
    }, "".concat(url)));
    index2 = linkRegex.lastIndex;
  }
  if (index2 < bundle.content.length) {
    content.push(bundle.content.substring(index2));
  }
  return reactExports.createElement("span", { style, key, className }, content);
}
function Ansi$1(props) {
  var className = props.className, useClasses = props.useClasses, children = props.children, linkify = props.linkify;
  return reactExports.createElement("code", { className }, ansiToJSON$1(children !== null && children !== void 0 ? children : "", useClasses !== null && useClasses !== void 0 ? useClasses : false).map(convertBundleIntoReact$1.bind(null, linkify !== null && linkify !== void 0 ? linkify : false, useClasses !== null && useClasses !== void 0 ? useClasses : false)));
}
function fixBackspace$1(txt) {
  var tmp = txt;
  do {
    txt = tmp;
    tmp = txt.replace(/[^\n]\x08/gm, "");
  } while (tmp.length < txt.length);
  return txt;
}
var StdoutList$1 = function(_a2) {
  var data = _a2.data;
  var classNames = useClassNames$1();
  return jsxRuntimeExports.jsx(jsxRuntimeExports.Fragment, { children: data.map(function(_a3) {
    var data2 = _a3.data, id = _a3.id;
    return jsxRuntimeExports.jsx("div", { className: classNames("console-item", [consoleItemClassName$1$1]), children: jsxRuntimeExports.jsx(Ansi$1, { children: data2 }) }, id);
  }) });
};
var consoleItemClassName$1$1 = css({
  width: "100%",
  padding: "$space$3 $space$2",
  fontSize: ".85em",
  position: "relative",
  whiteSpace: "pre",
  "&:not(:first-child):after": {
    content: "",
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    background: "$colors$surface3"
  }
});
var getParameters$1 = function(parameters) {
  return LZString.compressToBase64(JSON.stringify(parameters)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
var CSB_URL$1 = "https://codesandbox.io/api/v1/sandboxes/define";
var getFileParameters$1 = function(files, environment) {
  var normalizedFiles = Object.keys(files).reduce(function(prev, next) {
    var _a2;
    var fileName = next.replace("/", "");
    var value = {
      content: files[next].code,
      isBinary: false
    };
    return __assign$1(__assign$1({}, prev), (_a2 = {}, _a2[fileName] = value, _a2));
  }, {});
  return getParameters$1(__assign$1({ files: normalizedFiles }, environment ? { template: environment } : null));
};
var UnstyledOpenInCodeSandboxButton$1 = function(props) {
  var sandpack = useSandpack$1().sandpack;
  if (sandpack.exportOptions) {
    return jsxRuntimeExports.jsx(ExportToWorkspaceButton$1, __assign$1({ state: sandpack }, props));
  }
  return jsxRuntimeExports.jsx(RegularExportButton$1, __assign$1({ state: sandpack }, props));
};
var ExportToWorkspaceButton$1 = function(_a2) {
  var children = _a2.children, state = _a2.state, props = __rest$1(_a2, ["children", "state"]);
  var submit = function() {
    return __awaiter$1(void 0, void 0, void 0, function() {
      var normalizedFiles, response, data;
      var _a3;
      return __generator$1(this, function(_b) {
        switch (_b.label) {
          case 0:
            if (!((_a3 = state.exportOptions) === null || _a3 === void 0 ? void 0 : _a3.apiToken)) {
              throw new Error("Missing `apiToken` property");
            }
            normalizedFiles = Object.keys(state.files).reduce(function(prev, next) {
              var _a4;
              var fileName = next.replace("/", "");
              return __assign$1(__assign$1({}, prev), (_a4 = {}, _a4[fileName] = state.files[next], _a4));
            }, {});
            return [4, fetch("https://api.codesandbox.io/sandbox", {
              method: "POST",
              body: JSON.stringify({
                template: state.environment,
                files: normalizedFiles,
                privacy: state.exportOptions.privacy === "public" ? 0 : 2
              }),
              headers: {
                Authorization: "Bearer ".concat(state.exportOptions.apiToken),
                "Content-Type": "application/json",
                "X-CSB-API-Version": "2023-07-01"
              }
            })];
          case 1:
            response = _b.sent();
            return [4, response.json()];
          case 2:
            data = _b.sent();
            window.open("https://codesandbox.io/p/sandbox/".concat(data.data.alias, "?file=/").concat(state.activeFile, "&utm-source=storybook-addon"), "_blank");
            return [
              2
              /*return*/
            ];
        }
      });
    });
  };
  return jsxRuntimeExports.jsx("button", __assign$1({ onClick: submit, title: "Export to workspace in CodeSandbox", type: "button" }, props, { children }));
};
var RegularExportButton$1 = function(_a2) {
  var _b, _c2, _d;
  var children = _a2.children, state = _a2.state, props = __rest$1(_a2, ["children", "state"]);
  var formRef = reactExports.useRef(null);
  var _e = reactExports.useState(), paramsValues = _e[0], setParamsValues = _e[1];
  reactExports.useEffect(function debounce() {
    var timer = setTimeout(function() {
      var params = getFileParameters$1(state.files, state.environment);
      var searchParams = new URLSearchParams({
        parameters: params,
        query: new URLSearchParams({
          file: state.activeFile,
          utm_medium: "sandpack"
        }).toString()
      });
      setParamsValues(searchParams);
    }, 600);
    return function() {
      clearTimeout(timer);
    };
  }, [state.activeFile, state.environment, state.files]);
  if (((_d = (_c2 = (_b = paramsValues === null || paramsValues === void 0 ? void 0 : paramsValues.get) === null || _b === void 0 ? void 0 : _b.call(paramsValues, "parameters")) === null || _c2 === void 0 ? void 0 : _c2.length) !== null && _d !== void 0 ? _d : 0) > 1500) {
    return jsxRuntimeExports.jsxs("button", __assign$1({ onClick: function() {
      var _a3;
      return (_a3 = formRef.current) === null || _a3 === void 0 ? void 0 : _a3.submit();
    }, title: "Open in CodeSandbox", type: "button" }, props, { children: [jsxRuntimeExports.jsxs("form", { ref: formRef, action: CSB_URL$1, method: "POST", style: { visibility: "hidden" }, target: "_blank", children: [jsxRuntimeExports.jsx("input", { name: "environment", type: "hidden", value: state.environment === "node" ? "server" : state.environment }), Array.from(paramsValues, function(_a3) {
      var key = _a3[0], value = _a3[1];
      return jsxRuntimeExports.jsx("input", { name: key, type: "hidden", value }, key);
    })] }), children] }));
  }
  return jsxRuntimeExports.jsx("a", __assign$1({ href: "".concat(CSB_URL$1, "?").concat(paramsValues === null || paramsValues === void 0 ? void 0 : paramsValues.toString(), "&environment=").concat(state.environment === "node" ? "server" : state.environment), rel: "noreferrer noopener", target: "_blank", title: "Open in CodeSandbox" }, props, { children }));
};
var OpenInCodeSandboxButton$1 = function() {
  var classNames = useClassNames$1();
  return jsxRuntimeExports.jsxs(UnstyledOpenInCodeSandboxButton$1, { className: classNames("button", [
    classNames("icon-standalone"),
    buttonClassName$1,
    iconStandaloneClassName$1,
    roundedButtonClassName$1
  ]), children: [jsxRuntimeExports.jsx(ExportIcon$1, {}), jsxRuntimeExports.jsx("span", { children: "Open Sandbox" })] });
};
var _a$3;
var cubeClassName$1 = css({
  transform: "translate(-4px, 9px) scale(0.13, 0.13)",
  "*": { position: "absolute", width: "96px", height: "96px" }
});
var wrapperClassName$2$1 = css((_a$3 = {
  position: "absolute",
  right: "$space$2",
  bottom: "$space$2",
  zIndex: "$top",
  width: "32px",
  height: "32px",
  borderRadius: "$border$radius"
}, _a$3[".".concat(cubeClassName$1)] = { display: "flex" }, _a$3[".sp-button.".concat(buttonClassName$1)] = { display: "none" }, _a$3["&:hover .sp-button.".concat(buttonClassName$1)] = { display: "flex" }, _a$3["&:hover .sp-button.".concat(buttonClassName$1, " > span")] = { display: "none" }, _a$3["&:hover .".concat(cubeClassName$1)] = { display: "none" }, _a$3));
var cubeRotate = keyframes$1({
  "0%": {
    transform: "rotateX(-25.5deg) rotateY(45deg)"
  },
  "100%": {
    transform: "rotateX(-25.5deg) rotateY(405deg)"
  }
});
var sidesClassNames$1 = css({
  animation: "".concat(cubeRotate, " 1s linear infinite"),
  animationFillMode: "forwards",
  transformStyle: "preserve-3d",
  transform: "rotateX(-25.5deg) rotateY(45deg)",
  "*": {
    border: "10px solid $colors$clickable",
    borderRadius: "8px",
    background: "$colors$surface1"
  },
  ".top": {
    transform: "rotateX(90deg) translateZ(44px)",
    transformOrigin: "50% 50%"
  },
  ".bottom": {
    transform: "rotateX(-90deg) translateZ(44px)",
    transformOrigin: "50% 50%"
  },
  ".front": {
    transform: "rotateY(0deg) translateZ(44px)",
    transformOrigin: "50% 50%"
  },
  ".back": {
    transform: "rotateY(-180deg) translateZ(44px)",
    transformOrigin: "50% 50%"
  },
  ".left": {
    transform: "rotateY(-90deg) translateZ(44px)",
    transformOrigin: "50% 50%"
  },
  ".right": {
    transform: "rotateY(90deg) translateZ(44px)",
    transformOrigin: "50% 50%"
  }
});
var Loading$1 = function(_a2) {
  var className = _a2.className, showOpenInCodeSandbox = _a2.showOpenInCodeSandbox, props = __rest$1(_a2, ["className", "showOpenInCodeSandbox"]);
  var classNames = useClassNames$1();
  return jsxRuntimeExports.jsxs("div", __assign$1({ className: classNames("cube-wrapper", [wrapperClassName$2$1, className]), title: "Open in CodeSandbox" }, props, { children: [showOpenInCodeSandbox && jsxRuntimeExports.jsx(OpenInCodeSandboxButton$1, {}), jsxRuntimeExports.jsx("div", { className: classNames("cube", [cubeClassName$1]), children: jsxRuntimeExports.jsxs("div", { className: classNames("sides", [sidesClassNames$1]), children: [jsxRuntimeExports.jsx("div", { className: "top" }), jsxRuntimeExports.jsx("div", { className: "right" }), jsxRuntimeExports.jsx("div", { className: "bottom" }), jsxRuntimeExports.jsx("div", { className: "left" }), jsxRuntimeExports.jsx("div", { className: "front" }), jsxRuntimeExports.jsx("div", { className: "back" })] }) })] }));
};
var loadingClassName$1 = css({
  backgroundColor: "$colors$surface1"
});
var LoadingOverlay$1 = function(_a2) {
  var clientId = _a2.clientId, loading = _a2.loading, className = _a2.className, style = _a2.style, showOpenInCodeSandbox = _a2.showOpenInCodeSandbox, props = __rest$1(_a2, ["clientId", "loading", "className", "style", "showOpenInCodeSandbox"]);
  var classNames = useClassNames$1();
  var _b = useSandpack$1().sandpack, runSandpack = _b.runSandpack, environment = _b.environment;
  var _c2 = reactExports.useState(false), shouldShowStdout = _c2[0], setShouldShowStdout = _c2[1];
  var loadingOverlayState = useLoadingOverlayState$1(clientId, loading);
  var progressMessage = useSandpackPreviewProgress$1({ clientId });
  var stdoutData = useSandpackShellStdout$1({ clientId }).logs;
  reactExports.useEffect(function() {
    var timer;
    if (progressMessage === null || progressMessage === void 0 ? void 0 : progressMessage.includes("Running")) {
      timer = setTimeout(function() {
        setShouldShowStdout(true);
      }, 3e3);
    }
    return function() {
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [progressMessage]);
  if (loadingOverlayState === "HIDDEN") {
    return null;
  }
  if (loadingOverlayState === "TIMEOUT") {
    return jsxRuntimeExports.jsx("div", __assign$1({ className: classNames("overlay", [
      classNames("error"),
      absoluteClassName$1,
      errorClassName$1,
      errorBundlerClassName$1,
      className
    ]) }, props, { children: jsxRuntimeExports.jsxs("div", { className: classNames("error-message", [errorMessageClassName$1]), children: [jsxRuntimeExports.jsx("p", { className: classNames("error-title", [css({ fontWeight: "bold" })]), children: "Couldn't connect to server" }), jsxRuntimeExports.jsx("div", { className: classNames("error-message", [errorMessageClassName$1]), children: jsxRuntimeExports.jsxs("p", { children: ["This means sandpack cannot connect to the runtime or your network is having some issues. Please check the network tab in your browser and try again. If the problem persists, report it via", " ", jsxRuntimeExports.jsx("a", { href: "mailto:hello@codesandbox.io?subject=Sandpack Timeout Error", children: "email" }), " ", "or submit an issue on", " ", jsxRuntimeExports.jsx("a", { href: "https://github.com/codesandbox/sandpack/issues", rel: "noreferrer noopener", target: "_blank", children: "GitHub." })] }) }), jsxRuntimeExports.jsxs("p", { className: classNames("error-message", [
      errorMessageClassName$1({ errorCode: true })
    ]), children: ["ENV: ", environment, jsxRuntimeExports.jsx("br", {}), "ERROR: TIME_OUT"] }), jsxRuntimeExports.jsx("div", { children: jsxRuntimeExports.jsxs("button", { className: classNames("button", [
      classNames("icon-standalone"),
      buttonClassName$1,
      iconStandaloneClassName$1,
      roundedButtonClassName$1
    ]), onClick: runSandpack, title: "Restart script", type: "button", children: [jsxRuntimeExports.jsx(RestartIcon$1, {}), " ", jsxRuntimeExports.jsx("span", { children: "Try again" })] }) })] }) }));
  }
  var stillLoading = loadingOverlayState === "LOADING" || loadingOverlayState === "PRE_FADING";
  return jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [jsxRuntimeExports.jsxs("div", __assign$1({ className: classNames("overlay", [
    classNames("loading"),
    absoluteClassName$1,
    loadingClassName$1,
    className
  ]), style: __assign$1(__assign$1({}, style), { opacity: stillLoading ? 1 : 0, transition: "opacity ".concat(FADE_ANIMATION_DURATION$1, "ms ease-out") }) }, props, { children: [shouldShowStdout && jsxRuntimeExports.jsx("div", { className: stdoutPreview$1.toString(), children: jsxRuntimeExports.jsx(StdoutList$1, { data: stdoutData }) }), jsxRuntimeExports.jsx(Loading$1, { showOpenInCodeSandbox })] })), progressMessage && jsxRuntimeExports.jsx("div", { className: progressClassName$1$1.toString(), children: jsxRuntimeExports.jsx("p", { children: progressMessage }) })] });
};
var stdoutPreview$1 = css({
  position: "absolute",
  left: 0,
  right: 0,
  bottom: "$space$8",
  overflow: "auto",
  opacity: 0.5,
  overflowX: "hidden"
});
var progressClassName$1$1 = css({
  position: "absolute",
  left: "$space$5",
  bottom: "$space$4",
  zIndex: "$top",
  color: "$colors$clickable",
  animation: "".concat(fadeIn, " 150ms ease"),
  fontFamily: "$font$mono",
  fontSize: ".8em",
  width: "75%",
  p: {
    whiteSpace: "nowrap",
    margin: 0,
    textOverflow: "ellipsis",
    overflow: "hidden"
  }
});
var DependenciesProgress$1 = function(_a2) {
  var clientId = _a2.clientId;
  var progressMessage = useSandpackPreviewProgress$1({
    timeout: 3e3,
    clientId
  });
  if (!progressMessage) {
    return null;
  }
  return jsxRuntimeExports.jsx("div", { className: progressClassName$2.toString(), children: jsxRuntimeExports.jsx("p", { children: progressMessage }) });
};
var progressClassName$2 = css({
  position: "absolute",
  left: "$space$5",
  bottom: "$space$4",
  zIndex: "$top",
  color: "$colors$clickable",
  animation: "".concat(fadeIn, " 150ms ease"),
  fontFamily: "$font$mono",
  fontSize: ".8em",
  width: "75%",
  p: {
    whiteSpace: "nowrap",
    margin: 0,
    textOverflow: "ellipsis",
    overflow: "hidden"
  }
});
css({
  borderRadius: "0",
  width: "100%",
  padding: 0,
  marginBottom: "$space$2",
  span: {
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    overflow: "hidden"
  },
  svg: {
    marginRight: "$space$1"
  }
});
css({
  padding: "$space$3",
  overflow: "auto",
  height: "100%"
});
var splitUrl$1 = function(url) {
  var match = url.match(/(https?:\/\/.*?)\//);
  if (match && match[1]) {
    return [match[1], url.replace(match[1], "")];
  }
  return [url, "/"];
};
var navigatorClassName$1 = css({
  display: "flex",
  alignItems: "center",
  height: "$layout$headerHeight",
  borderBottom: "1px solid $colors$surface2",
  padding: "$space$3 $space$2",
  background: "$colors$surface1"
});
var inputClassName$1 = css({
  backgroundColor: "$colors$surface2",
  color: "$colors$clickable",
  padding: "$space$1 $space$3",
  borderRadius: "99999px",
  border: "1px solid $colors$surface2",
  height: "24px",
  lineHeight: "24px",
  fontSize: "inherit",
  outline: "none",
  flex: 1,
  marginLeft: "$space$4",
  width: "0",
  transition: "background $transitions$default",
  "&:hover": {
    backgroundColor: "$colors$surface3"
  },
  "&:focus": {
    backgroundColor: "$surface1",
    border: "1px solid $colors$accent",
    color: "$colors$base"
  }
});
var Navigator$1 = function(_a2) {
  var _b;
  var clientId = _a2.clientId, onURLChange = _a2.onURLChange, className = _a2.className, startRoute = _a2.startRoute, props = __rest$1(_a2, ["clientId", "onURLChange", "className", "startRoute"]);
  var _c2 = reactExports.useState(""), baseUrl = _c2[0], setBaseUrl = _c2[1];
  var _d = useSandpack$1(), sandpack = _d.sandpack, dispatch = _d.dispatch, listen = _d.listen;
  var _e = reactExports.useState((_b = startRoute !== null && startRoute !== void 0 ? startRoute : sandpack.startRoute) !== null && _b !== void 0 ? _b : "/"), relativeUrl = _e[0], setRelativeUrl = _e[1];
  var _f = reactExports.useState(false), backEnabled = _f[0], setBackEnabled = _f[1];
  var _g = reactExports.useState(false), forwardEnabled = _g[0], setForwardEnabled = _g[1];
  var classNames = useClassNames$1();
  reactExports.useEffect(function() {
    var unsub = listen(function(message) {
      if (message.type === "urlchange") {
        var url = message.url, back = message.back, forward = message.forward;
        var _a3 = splitUrl$1(url), newBaseUrl = _a3[0], newRelativeUrl = _a3[1];
        setBaseUrl(newBaseUrl);
        setRelativeUrl(newRelativeUrl);
        setBackEnabled(back);
        setForwardEnabled(forward);
      }
    }, clientId);
    return function() {
      return unsub();
    };
  }, []);
  var handleInputChange = function(e) {
    var path = e.target.value.startsWith("/") ? e.target.value : "/".concat(e.target.value);
    setRelativeUrl(path);
  };
  var handleKeyDown = function(e) {
    if (e.code === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      if (typeof onURLChange === "function") {
        onURLChange(baseUrl + e.currentTarget.value);
      }
    }
  };
  var handleRefresh = function() {
    dispatch({ type: "refresh" });
  };
  var handleBack = function() {
    dispatch({ type: "urlback" });
  };
  var handleForward = function() {
    dispatch({ type: "urlforward" });
  };
  var buttonsClassNames = classNames("button", [
    classNames("icon"),
    buttonClassName$1,
    iconClassName$1,
    css({
      minWidth: "$space$6",
      justifyContent: "center"
    })
  ]);
  return jsxRuntimeExports.jsxs("div", __assign$1({ className: classNames("navigator", [navigatorClassName$1, className]) }, props, { children: [jsxRuntimeExports.jsx("button", { "aria-label": "Go back one page", className: buttonsClassNames, disabled: !backEnabled, onClick: handleBack, type: "button", children: jsxRuntimeExports.jsx(BackwardIcon$1, {}) }), jsxRuntimeExports.jsx("button", { "aria-label": "Go forward one page", className: buttonsClassNames, disabled: !forwardEnabled, onClick: handleForward, type: "button", children: jsxRuntimeExports.jsx(ForwardIcon$1, {}) }), jsxRuntimeExports.jsx("button", { "aria-label": "Refresh page", className: buttonsClassNames, onClick: handleRefresh, type: "button", children: jsxRuntimeExports.jsx(RefreshIcon$1, {}) }), jsxRuntimeExports.jsx("input", { "aria-label": "Current Sandpack URL", className: classNames("input", [inputClassName$1]), name: "Current Sandpack URL", onChange: handleInputChange, onKeyDown: handleKeyDown, type: "text", value: relativeUrl })] }));
};
var _a$2$1;
var previewClassName$1 = css((_a$2$1 = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  background: "white",
  overflow: "auto",
  position: "relative"
}, _a$2$1[".".concat(THEME_PREFIX$1, "-bridge-frame")] = {
  border: 0,
  position: "absolute",
  left: "$space$2",
  bottom: "$space$2",
  zIndex: "$top",
  height: 12,
  width: "30%",
  mixBlendMode: "multiply",
  pointerEvents: "none"
}, _a$2$1));
var previewIframe$1 = css({
  border: "0",
  outline: "0",
  width: "100%",
  height: "100%",
  minHeight: "160px",
  maxHeight: "2000px",
  flex: 1
});
var previewActionsClassName$1$1 = css({
  display: "flex",
  position: "absolute",
  bottom: "$space$2",
  right: "$space$2",
  zIndex: "$overlay",
  gap: "$space$2"
});
reactExports.forwardRef(function(_a2, ref) {
  var _b = _a2.showNavigator, showNavigator = _b === void 0 ? false : _b, _c2 = _a2.showRefreshButton, showRefreshButton = _c2 === void 0 ? true : _c2, _d = _a2.showOpenInCodeSandbox, showOpenInCodeSandbox = _d === void 0 ? true : _d, _e = _a2.showSandpackErrorOverlay, showSandpackErrorOverlay = _e === void 0 ? true : _e;
  _a2.showOpenNewtab;
  var _g = _a2.showRestartButton, showRestartButton = _g === void 0 ? true : _g, _h = _a2.actionsChildren, actionsChildren = _h === void 0 ? jsxRuntimeExports.jsx(jsxRuntimeExports.Fragment, {}) : _h, children = _a2.children, className = _a2.className, _j = _a2.startRoute, startRoute = _j === void 0 ? "/" : _j, props = __rest$1(_a2, ["showNavigator", "showRefreshButton", "showOpenInCodeSandbox", "showSandpackErrorOverlay", "showOpenNewtab", "showRestartButton", "actionsChildren", "children", "className", "startRoute"]);
  var _k = useSandpackClient$1({ startRoute }), sandpack = _k.sandpack, listen = _k.listen, iframe = _k.iframe, getClient = _k.getClient, clientId = _k.clientId, dispatch = _k.dispatch;
  var _l = reactExports.useState(null), iframeComputedHeight = _l[0], setComputedAutoHeight = _l[1];
  var status = sandpack.status;
  var refresh = useSandpackNavigation$1(clientId).refresh;
  var restart = useSandpackShell$1(clientId).restart;
  var classNames = useClassNames$1();
  reactExports.useEffect(function() {
    var unsubscribe = listen(function(message) {
      if (message.type === "resize") {
        setComputedAutoHeight(message.height);
      }
    });
    return unsubscribe;
  }, []);
  reactExports.useImperativeHandle(ref, function() {
    return {
      clientId,
      getClient
    };
  }, [getClient, clientId]);
  var handleNewURL = function(newUrl) {
    if (!iframe.current) {
      return;
    }
    iframe.current.src = newUrl;
  };
  return jsxRuntimeExports.jsxs(SandpackStack$1, __assign$1({ className: classNames("preview", [className]) }, props, { children: [showNavigator && jsxRuntimeExports.jsx(Navigator$1, { clientId, onURLChange: handleNewURL, startRoute }), jsxRuntimeExports.jsxs("div", { className: classNames("preview-container", [previewClassName$1]), children: [jsxRuntimeExports.jsx("iframe", { ref: iframe, className: classNames("preview-iframe", [previewIframe$1]), style: {
    // set height based on the content only in auto mode
    // and when the computed height was returned by the bundler
    height: iframeComputedHeight ? iframeComputedHeight : void 0
  }, title: "Sandpack Preview" }), jsxRuntimeExports.jsxs("div", { className: classNames("preview-actions", [previewActionsClassName$1$1]), children: [actionsChildren, showRestartButton && sandpack.environment === "node" && jsxRuntimeExports.jsx(RoundedButton$1, { onClick: restart, children: jsxRuntimeExports.jsx(RestartIcon$1, {}) }), !showNavigator && showRefreshButton && status === "running" && jsxRuntimeExports.jsx(RoundedButton$1, { onClick: refresh, children: jsxRuntimeExports.jsx(RefreshIcon$1, {}) }), sandpack.teamId && jsxRuntimeExports.jsx("button", { className: classNames("button", [
    classNames("icon-standalone"),
    buttonClassName$1,
    iconStandaloneClassName$1,
    roundedButtonClassName$1
  ]), onClick: function() {
    return dispatch({ type: "sign-out" });
  }, title: "Sign out", type: "button", children: jsxRuntimeExports.jsx(SignOutIcon$1, {}) }), showOpenInCodeSandbox && jsxRuntimeExports.jsx(OpenInCodeSandboxButton$1, {})] }), jsxRuntimeExports.jsx(LoadingOverlay$1, { clientId, showOpenInCodeSandbox }), showSandpackErrorOverlay && jsxRuntimeExports.jsx(ErrorOverlay$1, {}), children] })] }));
});
var _a$1$2;
css((_a$1$2 = {
  display: "flex",
  flexDirection: "column",
  width: "100%",
  position: "relative",
  overflow: "auto",
  minHeight: "160px",
  flex: 1
}, _a$1$2[".".concat(THEME_PREFIX$1, "-stack")] = {
  height: "100%"
}, _a$1$2));
css({
  justifyContent: "space-between",
  borderBottom: "1px solid $colors$surface2",
  padding: "0 $space$2",
  fontFamily: "$font$mono",
  height: "$layout$headerHeight",
  minHeight: "$layout$headerHeight",
  overflowX: "auto",
  whiteSpace: "nowrap"
});
css({
  display: "flex",
  flexDirection: "row",
  alignItems: "center",
  gap: "$space$2"
});
var color = css({
  variants: {
    status: {
      pass: { color: "var(--test-pass)" },
      fail: { color: "var(--test-fail)" },
      skip: { color: "var(--test-skip)" },
      title: { color: "var(--test-title)" }
    }
  }
});
color({ status: "pass" });
color({ status: "fail" });
color({ status: "skip" });
color({ status: "title" });
var background = css({
  variants: {
    status: {
      pass: { background: "var(--test-pass)", color: "$colors$surface1" },
      fail: { background: "var(--test-fail)", color: "$colors$surface1" },
      run: { background: "var(--test-run)", color: "$colors$surface1" }
    }
  }
});
background({ status: "run" });
background({ status: "pass" });
background({ status: "fail" });
css({
  marginLeft: "$space$4"
});
css({
  marginBottom: "$space$2",
  color: "$colors$clickable"
});
css({
  marginBottom: "$space$2",
  color: "$colors$hover"
});
css({
  marginLeft: "$space$2"
});
css({
  marginRight: "$space$2"
});
css({
  color: "$colors$hover",
  marginBottom: "$space$2"
});
css({
  marginLeft: "$space$4"
});
css({
  color: "$colors$hover",
  fontSize: "$font$size",
  padding: "$space$2",
  whiteSpace: "pre-wrap"
});
css({
  display: "flex",
  flexDirection: "row",
  alignItems: "center",
  marginBottom: "$space$2"
});
css({
  marginBottom: "$space$2"
});
css({
  fontWeight: "bold"
});
css({
  borderRadius: "calc($border$radius / 2)"
});
css({
  padding: "$space$1 $space$2",
  fontFamily: "$font$mono",
  textTransform: "uppercase",
  marginRight: "$space$2"
});
css({
  fontFamily: "$font$mono",
  cursor: "pointer",
  display: "inline-block"
});
css({
  color: "$colors$clickable",
  textDecorationStyle: "dotted",
  textDecorationLine: "underline"
});
css({
  color: "$colors$hover",
  fontWeight: "bold",
  textDecorationStyle: "dotted",
  textDecorationLine: "underline"
});
css({
  marginBottom: "$space$2"
});
css({
  fontWeight: "bold",
  color: "$colors$hover",
  whiteSpace: "pre-wrap"
});
css({
  fontWeight: "bold",
  color: "$colors$clickable"
});
css({
  display: "flex",
  position: "absolute",
  bottom: "$space$2",
  right: "$space$2",
  zIndex: "$overlay",
  "> *": { marginLeft: "$space$2" }
});
css({
  padding: "$space$4",
  height: "100%",
  overflow: "auto",
  display: "flex",
  flexDirection: "column",
  position: "relative",
  fontFamily: "$font$mono"
});
css({
  fontWeight: "bold",
  color: "$colors$base"
});
var SYNTAX_ERROR_PATTERN$1 = ["SyntaxError: ", "Error in sandbox:"];
var CLEAR_LOG$1 = {
  id: "random",
  method: "clear",
  data: ["Console was cleared"]
};
var TRANSFORMED_TYPE_KEY$1 = "@t";
var TRANSFORMED_TYPE_KEY_ALTERNATE$1 = "#@t";
var CIRCULAR_REF_KEY$1 = "@r";
var MAX_LENGTH_STRING$1 = 1e4;
var MAX_NEST_LEVEL$1 = 2;
var MAX_KEYS$1 = 400;
var MAX_MESSAGE_COUNT$2 = MAX_KEYS$1 * 2;
var GLOBAL$1 = function getGlobal() {
  if (typeof globalThis !== "undefined")
    return globalThis;
  if (typeof window !== "undefined")
    return window;
  if (typeof global !== "undefined")
    return global;
  if (typeof self !== "undefined")
    return self;
  throw Error("Unable to locate global object");
}();
var ARRAY_BUFFER_SUPPORTED$1 = typeof ArrayBuffer === "function";
var MAP_SUPPORTED$1 = typeof Map === "function";
var SET_SUPPORTED$1 = typeof Set === "function";
var Arithmetic$1;
(function(Arithmetic2) {
  Arithmetic2[Arithmetic2["infinity"] = 0] = "infinity";
  Arithmetic2[Arithmetic2["minusInfinity"] = 1] = "minusInfinity";
  Arithmetic2[Arithmetic2["minusZero"] = 2] = "minusZero";
})(Arithmetic$1 || (Arithmetic$1 = {}));
var transformers$1 = {
  Arithmetic: function(data) {
    if (data === Arithmetic$1.infinity)
      return Infinity;
    if (data === Arithmetic$1.minusInfinity)
      return -Infinity;
    if (data === Arithmetic$1.minusZero)
      return -0;
    return data;
  },
  HTMLElement: function(data) {
    var sandbox = document.implementation.createHTMLDocument("sandbox");
    try {
      var element = sandbox.createElement(data.tagName);
      element.innerHTML = data.innerHTML;
      for (var _i = 0, _a2 = Object.keys(data.attributes); _i < _a2.length; _i++) {
        var attribute = _a2[_i];
        try {
          element.setAttribute(attribute, data.attributes[attribute]);
        } catch (_b) {
        }
      }
      return element;
    } catch (e) {
      return data;
    }
  },
  Function: function(data) {
    var tempFun = function() {
    };
    Object.defineProperty(tempFun, "toString", {
      value: function() {
        return "function ".concat(data.name, "() {").concat(data.body, "}");
      }
    });
    return tempFun;
  },
  "[[NaN]]": function() {
    return NaN;
  },
  "[[undefined]]": function() {
    return void 0;
  },
  "[[Date]]": function(val) {
    var date = /* @__PURE__ */ new Date();
    date.setTime(val);
    return date;
  },
  "[[RegExp]]": function(val) {
    return new RegExp(val.src, val.flags);
  },
  "[[Error]]": function(val) {
    var Ctor = GLOBAL$1[val.name] || Error;
    var err = new Ctor(val.message);
    err.stack = val.stack;
    return err;
  },
  "[[ArrayBuffer]]": function(val) {
    if (ARRAY_BUFFER_SUPPORTED$1) {
      var buffer = new ArrayBuffer(val.length);
      var view = new Int8Array(buffer);
      view.set(val);
      return buffer;
    }
    return val;
  },
  "[[TypedArray]]": function(val) {
    return typeof GLOBAL$1[val.ctorName] === "function" ? new GLOBAL$1[val.ctorName](val.arr) : val.arr;
  },
  "[[Map]]": function(val) {
    if (MAP_SUPPORTED$1) {
      var map = /* @__PURE__ */ new Map();
      for (var i = 0; i < val.length; i += 2)
        map.set(val[i], val[i + 1]);
      return map;
    }
    var kvArr = [];
    for (var j = 0; j < val.length; j += 2)
      kvArr.push([val[i], val[i + 1]]);
    return kvArr;
  },
  "[[Set]]": function(val) {
    if (SET_SUPPORTED$1) {
      var set = /* @__PURE__ */ new Set();
      for (var i = 0; i < val.length; i++)
        set.add(val[i]);
      return set;
    }
    return val;
  }
};
var formatSymbols$1 = function(message) {
  var _a2;
  if (typeof message === "string" || typeof message === "number" || message === null) {
    return message;
  } else if (Array.isArray(message)) {
    return message.map(formatSymbols$1);
  } else if (typeof message == "object" && TRANSFORMED_TYPE_KEY$1 in message) {
    var type = message[TRANSFORMED_TYPE_KEY$1];
    var transform = transformers$1[type];
    return transform(message.data);
  } else if (typeof message == "object" && TRANSFORMED_TYPE_KEY_ALTERNATE$1 in message) {
    var type = message[TRANSFORMED_TYPE_KEY_ALTERNATE$1];
    var transform = transformers$1[type];
    return transform(message.data);
  } else if (typeof message == "object" && ((_a2 = message.constructor) === null || _a2 === void 0 ? void 0 : _a2.name) === "NodeList") {
    var NodeList_1 = {};
    Object.entries(message).forEach(function(_a3) {
      var key = _a3[0], value = _a3[1];
      NodeList_1[key] = formatSymbols$1(value);
    });
    return NodeList_1;
  }
  return message;
};
var arrayToString$1 = function(output, references, level) {
  var mergeArray = output.reduce(function(acc, curr, index2) {
    return "".concat(acc).concat(index2 ? ", " : "").concat(fromConsoleToString$1(curr, references, level));
  }, "");
  return "[".concat(mergeArray, "]");
};
var objectToString$1 = function(output, references, level) {
  var constructorName = output.constructor.name !== "Object" ? "".concat(output.constructor.name, " ") : "";
  if (level > MAX_NEST_LEVEL$1) {
    return constructorName;
  }
  var entries2 = Object.entries(output);
  var formattedObject = Object.entries(output).reduce(function(acc, _a2, index2) {
    var key = _a2[0], value = _a2[1];
    var comma = index2 === 0 ? "" : ", ";
    var breakLine = entries2.length > 10 ? "\n  " : "";
    var formatted = fromConsoleToString$1(value, references, level);
    if (index2 === MAX_KEYS$1) {
      return acc + breakLine + "...";
    } else if (index2 > MAX_KEYS$1) {
      return acc;
    }
    return acc + "".concat(comma).concat(breakLine).concat(key, ": ") + formatted;
  }, "");
  return "".concat(constructorName, "{ ").concat(formattedObject).concat(entries2.length > 10 ? "\n" : " ", "}");
};
var fromConsoleToString$1 = function(message, references, level) {
  var _a2;
  if (level === void 0) {
    level = 0;
  }
  try {
    var output_1 = formatSymbols$1(message);
    if (Array.isArray(output_1)) {
      return arrayToString$1(output_1, references, level + 1);
    }
    switch (typeof output_1) {
      case "string":
        return '"'.concat(output_1, '"').slice(0, MAX_LENGTH_STRING$1);
      case "number":
      case "function":
      case "symbol":
        return output_1.toString();
      case "boolean":
        return String(output_1);
      case "undefined":
        return "undefined";
      case "object":
      default:
        if (output_1 instanceof RegExp || output_1 instanceof Error || output_1 instanceof Date) {
          return output_1.toString();
        }
        if (output_1 === null) {
          return String(null);
        }
        if (output_1 instanceof HTMLElement) {
          return output_1.outerHTML.slice(0, MAX_LENGTH_STRING$1);
        }
        if (Object.entries(output_1).length === 0) {
          return "{}";
        }
        if (CIRCULAR_REF_KEY$1 in output_1) {
          if (level > MAX_NEST_LEVEL$1) {
            return "Unable to print information";
          }
          var newMessage = references[output_1[CIRCULAR_REF_KEY$1]];
          return fromConsoleToString$1(newMessage, references, level + 1);
        }
        if (((_a2 = output_1.constructor) === null || _a2 === void 0 ? void 0 : _a2.name) === "NodeList") {
          var length_1 = output_1.length;
          var nodes = new Array(length_1).fill(null).map(function(_, index2) {
            return fromConsoleToString$1(output_1[index2], references);
          });
          return "NodeList(".concat(output_1.length, ")[").concat(nodes, "]");
        }
        return objectToString$1(output_1, references, level + 1);
    }
  } catch (_b) {
    return "Unable to print information";
  }
};
var getType = function(message) {
  switch (message) {
    case "warn":
      return "warning";
    case "clear":
      return "clear";
    case "error":
      return "error";
    case "log":
    case "info":
    default:
      return "info";
  }
};
var _a$b;
var ConsoleList$1 = function(_a2) {
  var data = _a2.data;
  var classNames = useClassNames$1();
  return jsxRuntimeExports.jsx(jsxRuntimeExports.Fragment, { children: data.map(function(_a3, logIndex, references) {
    var data2 = _a3.data, id = _a3.id, method = _a3.method;
    if (!data2)
      return null;
    if (Array.isArray(data2)) {
      return jsxRuntimeExports.jsx(reactExports.Fragment, { children: data2.map(function(msg, msgIndex) {
        var fixReferences = references.slice(logIndex, references.length);
        return jsxRuntimeExports.jsx("div", { className: classNames("console-item", [
          consoleItemClassName$2({ variant: getType(method) })
        ]), children: jsxRuntimeExports.jsx(CodeMirror$1, { code: method === "clear" ? msg : fromConsoleToString$1(msg, fixReferences), fileType: "js", initMode: "user-visible", showReadOnly: false, readOnly: true, wrapContent: true }) }, "".concat(id, "-").concat(msgIndex));
      }) }, id);
    }
    return null;
  }) });
};
var consoleItemClassName$2 = css((_a$b = {
  width: "100%",
  padding: "$space$3 $space$2",
  fontSize: ".8em",
  position: "relative",
  "&:not(:first-child):after": {
    content: "",
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    background: "$colors$surface3"
  },
  /**
   * Editor reset
   */
  ".sp-cm": {
    padding: 0
  },
  ".cm-editor": {
    background: "none"
  },
  ".cm-content": {
    padding: 0
  }
}, _a$b[".".concat(THEME_PREFIX$1, "-pre-placeholder")] = {
  margin: "0 !important",
  fontSize: "1em"
}, _a$b.variants = {
  variant: {
    error: {
      color: "$colors$error",
      background: "$colors$errorSurface",
      "&:not(:first-child):after": {
        background: "$colors$error",
        opacity: 0.07
      }
    },
    warning: {
      color: "$colors$warning",
      background: "$colors$warningSurface",
      "&:not(:first-child):after": {
        background: "$colors$warning",
        opacity: 0.07
      }
    },
    clear: {
      fontStyle: "italic"
    },
    info: {}
  }
}, _a$b));
var wrapperClassName$1 = css({
  justifyContent: "space-between",
  borderBottom: "1px solid $colors$surface2",
  padding: "0 $space$2",
  fontFamily: "$font$mono",
  height: "$layout$headerHeight",
  minHeight: "$layout$headerHeight",
  overflowX: "auto",
  whiteSpace: "nowrap"
});
var flexClassName$1 = css({
  display: "flex",
  flexDirection: "row",
  alignItems: "center",
  gap: "$space$2"
});
var Header$1 = function(_a2) {
  var currentTab = _a2.currentTab, setCurrentTab = _a2.setCurrentTab, node = _a2.node;
  var classNames = useClassNames$1();
  var buttonsClassName = classNames("console-header-button", [
    buttonClassName$1,
    roundedButtonClassName$1,
    css({ padding: "$space$1 $space$3" })
  ]);
  return jsxRuntimeExports.jsxs("div", { className: classNames("console-header", [
    wrapperClassName$1,
    flexClassName$1
  ]), children: [jsxRuntimeExports.jsxs("p", { className: classNames("console-header-title", [
    css({
      lineHeight: 1,
      margin: 0,
      color: "$colors$base",
      fontSize: "$font$size",
      display: "flex",
      alignItems: "center",
      gap: "$space$2"
    })
  ]), children: [jsxRuntimeExports.jsx(ConsoleIcon$1, {}), jsxRuntimeExports.jsx("span", { children: "Terminal" })] }), node && jsxRuntimeExports.jsxs("div", { className: classNames("console-header-actions", [flexClassName$1]), children: [jsxRuntimeExports.jsx("button", { className: buttonsClassName, "data-active": currentTab === "server", onClick: function() {
    return setCurrentTab("server");
  }, type: "button", children: "Server" }), jsxRuntimeExports.jsx("button", { className: buttonsClassName, "data-active": currentTab === "client", onClick: function() {
    return setCurrentTab("client");
  }, type: "button", children: "Client" })] })] });
};
var useSandpackConsole$1 = function(_a2) {
  var clientId = _a2.clientId, _b = _a2.maxMessageCount, maxMessageCount = _b === void 0 ? MAX_MESSAGE_COUNT$2 : _b, _c2 = _a2.showSyntaxError, showSyntaxError = _c2 === void 0 ? false : _c2, _d = _a2.resetOnPreviewRestart, resetOnPreviewRestart = _d === void 0 ? false : _d;
  var _e = reactExports.useState([]), logs = _e[0], setLogs = _e[1];
  var listen = useSandpack$1().listen;
  reactExports.useEffect(function() {
    var unsubscribe = listen(function(message) {
      if (resetOnPreviewRestart && message.type === "start") {
        setLogs([]);
      } else if (message.type === "console" && message.codesandbox) {
        var payloadLog = Array.isArray(message.log) ? message.log : [message.log];
        if (payloadLog.find(function(_a3) {
          var method = _a3.method;
          return method === "clear";
        })) {
          return setLogs([CLEAR_LOG$1]);
        }
        var logsMessages_1 = showSyntaxError ? payloadLog : payloadLog.filter(function(messageItem) {
          var _a3, _b2, _c3;
          var messagesWithoutSyntaxErrors = (_c3 = (_b2 = (_a3 = messageItem === null || messageItem === void 0 ? void 0 : messageItem.data) === null || _a3 === void 0 ? void 0 : _a3.filter) === null || _b2 === void 0 ? void 0 : _b2.call(_a3, function(dataItem) {
            if (typeof dataItem !== "string")
              return true;
            var matches = SYNTAX_ERROR_PATTERN$1.filter(function(lookFor) {
              return dataItem.startsWith(lookFor);
            });
            return matches.length === 0;
          })) !== null && _c3 !== void 0 ? _c3 : [];
          return messagesWithoutSyntaxErrors.length > 0;
        });
        if (!logsMessages_1)
          return;
        setLogs(function(prev) {
          var messages = __spreadArray$1(__spreadArray$1([], prev, true), logsMessages_1, true).filter(function(value, index2, self2) {
            return index2 === self2.findIndex(function(s) {
              return s.id === value.id;
            });
          });
          while (messages.length > maxMessageCount) {
            messages.shift();
          }
          return messages;
        });
      }
    }, clientId);
    return unsubscribe;
  }, [showSyntaxError, maxMessageCount, clientId, resetOnPreviewRestart]);
  return { logs, reset: function() {
    return setLogs([]);
  } };
};
reactExports.forwardRef(function(_a2, ref) {
  var _b;
  var _c2 = _a2.showHeader, showHeader = _c2 === void 0 ? true : _c2, _d = _a2.showSyntaxError, showSyntaxError = _d === void 0 ? false : _d, maxMessageCount = _a2.maxMessageCount, onLogsChange = _a2.onLogsChange, className = _a2.className;
  _a2.showSetupProgress;
  var _f = _a2.showResetConsoleButton, showResetConsoleButton = _f === void 0 ? true : _f, _g = _a2.showRestartButton, showRestartButton = _g === void 0 ? true : _g, _h = _a2.resetOnPreviewRestart, resetOnPreviewRestart = _h === void 0 ? false : _h, _j = _a2.actionsChildren, actionsChildren = _j === void 0 ? jsxRuntimeExports.jsx(jsxRuntimeExports.Fragment, {}) : _j, _k = _a2.standalone, standalone = _k === void 0 ? false : _k, props = __rest$1(_a2, ["showHeader", "showSyntaxError", "maxMessageCount", "onLogsChange", "className", "showSetupProgress", "showResetConsoleButton", "showRestartButton", "resetOnPreviewRestart", "actionsChildren", "standalone"]);
  var environment = useSandpack$1().sandpack.environment;
  var _l = useSandpackClient$1(), iframe = _l.iframe, internalClientId = _l.clientId;
  var restart = useSandpackShell$1().restart;
  var _m = reactExports.useState(environment === "node" ? "server" : "client"), currentTab = _m[0], setCurrentTab = _m[1];
  var clientId = standalone ? internalClientId : void 0;
  var _o = useSandpackConsole$1({
    maxMessageCount,
    showSyntaxError,
    resetOnPreviewRestart,
    clientId
  }), consoleData = _o.logs, resetConsole = _o.reset;
  var _p = useSandpackShellStdout$1({
    maxMessageCount,
    resetOnPreviewRestart,
    clientId
  }), stdoutData = _p.logs, resetStdout = _p.reset;
  var wrapperRef = reactExports.useRef(null);
  reactExports.useEffect(function() {
    onLogsChange === null || onLogsChange === void 0 ? void 0 : onLogsChange(consoleData);
    if (wrapperRef.current) {
      wrapperRef.current.scrollTop = wrapperRef.current.scrollHeight;
    }
  }, [onLogsChange, consoleData, stdoutData, currentTab]);
  var isServerTab = currentTab === "server";
  var isNodeEnvironment = environment === "node";
  reactExports.useImperativeHandle(ref, function() {
    return {
      reset: function() {
        resetConsole();
        resetStdout();
      }
    };
  });
  var classNames = useClassNames$1();
  return jsxRuntimeExports.jsxs(SandpackStack$1, __assign$1({ className: classNames("console", [
    css((_b = {
      height: "100%",
      background: "$surface1",
      iframe: { display: "none" }
    }, _b[".".concat(THEME_PREFIX$1, "-bridge-frame")] = {
      display: "block",
      border: 0,
      position: "absolute",
      left: "$space$2",
      bottom: "$space$2",
      zIndex: "$top",
      height: 12,
      width: "30%",
      mixBlendMode: "multiply",
      pointerEvents: "none"
    }, _b)),
    className
  ]) }, props, { children: [showHeader && isNodeEnvironment && jsxRuntimeExports.jsx(Header$1, { currentTab, node: isNodeEnvironment, setCurrentTab }), jsxRuntimeExports.jsx("div", { ref: wrapperRef, className: classNames("console-list", [
    css({ overflow: "auto", scrollBehavior: "smooth" })
  ]), children: isServerTab ? jsxRuntimeExports.jsx(StdoutList$1, { data: stdoutData }) : jsxRuntimeExports.jsx(ConsoleList$1, { data: consoleData }) }), jsxRuntimeExports.jsxs("div", { className: classNames("console-actions", [
    css({
      position: "absolute",
      bottom: "$space$2",
      right: "$space$2",
      display: "flex",
      gap: "$space$2"
    })
  ]), children: [actionsChildren, showRestartButton && isServerTab && jsxRuntimeExports.jsx(RoundedButton$1, { onClick: function() {
    restart();
    resetConsole();
    resetStdout();
  }, children: jsxRuntimeExports.jsx(RestartIcon$1, {}) }), showResetConsoleButton && jsxRuntimeExports.jsx(RoundedButton$1, { onClick: function() {
    if (currentTab === "client") {
      resetConsole();
    } else {
      resetStdout();
    }
  }, children: jsxRuntimeExports.jsx(CleanIcon$1, {}) })] }), standalone && jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [jsxRuntimeExports.jsx(DependenciesProgress$1, { clientId }), jsxRuntimeExports.jsx("iframe", { ref: iframe })] })] }));
});
css({
  position: "absolute",
  zIndex: "$top",
  variants: {
    direction: {
      vertical: {
        right: 0,
        left: 0,
        height: 10,
        cursor: "ns-resize"
      },
      horizontal: {
        top: 0,
        bottom: 0,
        width: 10,
        cursor: "ew-resize"
      }
    }
  },
  "@media screen and (max-width: 768px)": {
    display: "none"
  }
});
css({
  position: "relative",
  strong: {
    background: "$colors$clickable",
    color: "$colors$surface1",
    minWidth: 12,
    height: 12,
    padding: "0 2px",
    borderRadius: 12,
    fontSize: 8,
    lineHeight: "12px",
    position: "absolute",
    top: 0,
    right: 0,
    fontWeight: "normal"
  }
});
css({
  width: "100%",
  overflow: "hidden"
});
css({
  flexDirection: "row-reverse",
  "@media screen and (max-width: 768px)": {
    flexFlow: "wrap-reverse !important",
    flexDirection: "initial"
  }
});
var define_process_env_default = {};
var __assign = function() {
  __assign = Object.assign || function __assign2(t) {
    for (var s, i = 1, n = arguments.length; i < n; i++) {
      s = arguments[i];
      for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p)) t[p] = s[p];
    }
    return t;
  };
  return __assign.apply(this, arguments);
};
function __rest(s, e) {
  var t = {};
  for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0) t[p] = s[p];
  if (s != null && typeof Object.getOwnPropertySymbols === "function") for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
    if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i])) t[p[i]] = s[p[i]];
  }
  return t;
}
function __awaiter(thisArg, _arguments, P, generator) {
  function adopt(value) {
    return value instanceof P ? value : new P(function(resolve) {
      resolve(value);
    });
  }
  return new (P || (P = Promise))(function(resolve, reject) {
    function fulfilled(value) {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    }
    function rejected(value) {
      try {
        step(generator["throw"](value));
      } catch (e) {
        reject(e);
      }
    }
    function step(result) {
      result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
    }
    step((generator = generator.apply(thisArg, [])).next());
  });
}
function __generator(thisArg, body) {
  var _ = {
    label: 0,
    sent: function() {
      if (t[0] & 1) throw t[1];
      return t[1];
    },
    trys: [],
    ops: []
  }, f, y, t, g;
  return g = {
    next: verb(0),
    "throw": verb(1),
    "return": verb(2)
  }, typeof Symbol === "function" && (g[Symbol.iterator] = function() {
    return this;
  }), g;
  function verb(n) {
    return function(v) {
      return step([n, v]);
    };
  }
  function step(op) {
    if (f) throw new TypeError("Generator is already executing.");
    while (_) try {
      if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
      if (y = 0, t) op = [op[0] & 2, t.value];
      switch (op[0]) {
        case 0:
        case 1:
          t = op;
          break;
        case 4:
          _.label++;
          return {
            value: op[1],
            done: false
          };
        case 5:
          _.label++;
          y = op[1];
          op = [0];
          continue;
        case 7:
          op = _.ops.pop();
          _.trys.pop();
          continue;
        default:
          if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) {
            _ = 0;
            continue;
          }
          if (op[0] === 3 && (!t || op[1] > t[0] && op[1] < t[3])) {
            _.label = op[1];
            break;
          }
          if (op[0] === 6 && _.label < t[1]) {
            _.label = t[1];
            t = op;
            break;
          }
          if (t && _.label < t[2]) {
            _.label = t[2];
            _.ops.push(op);
            break;
          }
          if (t[2]) _.ops.pop();
          _.trys.pop();
          continue;
      }
      op = body.call(thisArg, _);
    } catch (e) {
      op = [6, e];
      y = 0;
    } finally {
      f = t = 0;
    }
    if (op[0] & 5) throw op[1];
    return {
      value: op[0] ? op[1] : void 0,
      done: true
    };
  }
}
function __spreadArray(to, from, pack) {
  if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
    if (ar || !(i in from)) {
      if (!ar) ar = Array.prototype.slice.call(from, 0, i);
      ar[i] = from[i];
    }
  }
  return to.concat(ar || Array.prototype.slice.call(from));
}
var SVG = function(props) {
  return jsxRuntimeExports.jsx("svg", __assign({
    fill: "currentColor",
    height: "16",
    viewBox: "0 0 16 16",
    width: "16",
    xmlns: "http://www.w3.org/2000/svg"
  }, props));
};
var SignInIcon = function() {
  return jsxRuntimeExports.jsxs(SVG, {
    viewBox: "0 0 48 48",
    children: [jsxRuntimeExports.jsx("title", {
      children: "Sign in"
    }), jsxRuntimeExports.jsx("path", {
      d: "M9 42q-1.2 0-2.1-.9Q6 40.2 6 39V9q0-1.2.9-2.1Q7.8 6 9 6h14.55v3H9v30h14.55v3Zm24.3-9.25-2.15-2.15 5.1-5.1h-17.5v-3h17.4l-5.1-5.1 2.15-2.15 8.8 8.8Z"
    })]
  });
};
var SignOutIcon = function() {
  return jsxRuntimeExports.jsxs(SVG, {
    viewBox: "0 0 48 48",
    children: [jsxRuntimeExports.jsx("title", {
      children: "Sign out"
    }), jsxRuntimeExports.jsx("path", {
      d: "M9 42q-1.2 0-2.1-.9Q6 40.2 6 39V9q0-1.2.9-2.1Q7.8 6 9 6h14.55v3H9v30h14.55v3Zm24.3-9.25-2.15-2.15 5.1-5.1h-17.5v-3h17.4l-5.1-5.1 2.15-2.15 8.8 8.8Z"
    })]
  });
};
var RestartIcon = function() {
  return jsxRuntimeExports.jsxs(SVG, {
    fill: "none",
    stroke: "currentColor",
    children: [jsxRuntimeExports.jsx("title", {
      children: "Restart script"
    }), jsxRuntimeExports.jsx("path", {
      d: "M8 2C4.68629 2 2 4.68629 2 8C2 10.0946 3.07333 11.9385 4.7 13.0118",
      strokeLinecap: "round"
    }), jsxRuntimeExports.jsx("path", {
      d: "M14.0005 7.9998C14.0005 5.82095 12.8391 3.91335 11.1016 2.8623",
      strokeLinecap: "round"
    }), jsxRuntimeExports.jsx("path", {
      d: "M14.0003 2.3335H11.167C10.8908 2.3335 10.667 2.55735 10.667 2.8335V5.66683",
      strokeLinecap: "round"
    }), jsxRuntimeExports.jsx("path", {
      d: "M1.99967 13.6665L4.83301 13.6665C5.10915 13.6665 5.33301 13.4426 5.33301 13.1665L5.33301 10.3332",
      strokeLinecap: "round"
    }), jsxRuntimeExports.jsx("path", {
      d: "M10 10L12 12L10 14",
      strokeLinecap: "round",
      strokeLinejoin: "round"
    }), jsxRuntimeExports.jsx("path", {
      d: "M14.667 14L12.667 14",
      strokeLinecap: "round",
      strokeLinejoin: "round"
    })]
  });
};
var RunIcon = function() {
  return jsxRuntimeExports.jsxs(SVG, {
    children: [jsxRuntimeExports.jsx("title", {
      children: "Run sandbox"
    }), jsxRuntimeExports.jsx("path", {
      d: "M11.0792 8.1078C11.2793 8.25007 11.27 8.55012 11.0616 8.67981L6.02535 11.8135C5.79638 11.956 5.5 11.7913 5.5 11.5216L5.5 8.40703L5.5 4.80661C5.5 4.52735 5.81537 4.36463 6.04296 4.52647L11.0792 8.1078Z"
    })]
  });
};
var BackwardIcon = function() {
  return jsxRuntimeExports.jsxs(SVG, {
    children: [jsxRuntimeExports.jsx("title", {
      children: "Click to go back"
    }), jsxRuntimeExports.jsx("path", {
      d: "M9.64645 12.3536C9.84171 12.5488 10.1583 12.5488 10.3536 12.3536C10.5488 12.1583 10.5488 11.8417 10.3536 11.6464L9.64645 12.3536ZM10.3536 4.35355C10.5488 4.15829 10.5488 3.84171 10.3536 3.64644C10.1583 3.45118 9.84171 3.45118 9.64645 3.64644L10.3536 4.35355ZM6.07072 7.92929L5.71716 7.57573L6.07072 7.92929ZM10.3536 11.6464L6.42427 7.71716L5.71716 8.42426L9.64645 12.3536L10.3536 11.6464ZM6.42427 8.28284L10.3536 4.35355L9.64645 3.64644L5.71716 7.57573L6.42427 8.28284ZM6.42427 7.71716C6.58048 7.87337 6.58048 8.12663 6.42427 8.28284L5.71716 7.57573C5.48285 7.81005 5.48285 8.18995 5.71716 8.42426L6.42427 7.71716Z"
    })]
  });
};
var ForwardIcon = function() {
  return jsxRuntimeExports.jsxs(SVG, {
    children: [jsxRuntimeExports.jsx("title", {
      children: "Click to go forward"
    }), jsxRuntimeExports.jsx("path", {
      d: "M6.35355 3.64645C6.15829 3.45118 5.84171 3.45118 5.64645 3.64645C5.45118 3.84171 5.45118 4.15829 5.64645 4.35355L6.35355 3.64645ZM5.64645 11.6464C5.45118 11.8417 5.45118 12.1583 5.64645 12.3536C5.84171 12.5488 6.15829 12.5488 6.35355 12.3536L5.64645 11.6464ZM9.92929 8.07071L10.2828 8.42426L9.92929 8.07071ZM5.64645 4.35355L9.57574 8.28284L10.2828 7.57574L6.35355 3.64645L5.64645 4.35355ZM9.57574 7.71716L5.64645 11.6464L6.35355 12.3536L10.2828 8.42426L9.57574 7.71716ZM9.57574 8.28284C9.41952 8.12663 9.41953 7.87337 9.57574 7.71716L10.2828 8.42426C10.5172 8.18995 10.5172 7.81005 10.2828 7.57574L9.57574 8.28284Z"
    })]
  });
};
var RefreshIcon = function() {
  return jsxRuntimeExports.jsxs(SVG, {
    children: [jsxRuntimeExports.jsx("title", {
      children: "Refresh preview"
    }), jsxRuntimeExports.jsx("path", {
      clipRule: "evenodd",
      d: "M3.83325 7.99992C3.83325 5.69867 5.69853 3.83325 7.99934 3.83325C9.81246 3.83325 11.3563 4.99195 11.9285 6.61097C11.9396 6.6425 11.9536 6.67221 11.97 6.69992H8.80005C8.52391 6.69992 8.30005 6.92378 8.30005 7.19992C8.30005 7.47606 8.52391 7.69992 8.80005 7.69992H12.5667C12.8981 7.69992 13.1667 7.43129 13.1667 7.09992V3.33325C13.1667 3.05711 12.9429 2.83325 12.6667 2.83325C12.3906 2.83325 12.1667 3.05711 12.1667 3.33325V4.94608C11.2268 3.66522 9.7106 2.83325 7.99934 2.83325C5.14613 2.83325 2.83325 5.14651 2.83325 7.99992C2.83325 10.8533 5.14613 13.1666 7.99934 13.1666C9.91218 13.1666 11.5815 12.1266 12.474 10.5836C12.6123 10.3446 12.5306 10.0387 12.2915 9.90044C12.0525 9.76218 11.7466 9.84387 11.6084 10.0829C10.8873 11.3296 9.54072 12.1666 7.99934 12.1666C5.69853 12.1666 3.83325 10.3012 3.83325 7.99992Z",
      fillRule: "evenodd"
    })]
  });
};
var CleanIcon = function() {
  return jsxRuntimeExports.jsxs(SVG, {
    fill: "none",
    stroke: "currentColor",
    children: [jsxRuntimeExports.jsx("title", {
      children: "Clean"
    }), jsxRuntimeExports.jsx("circle", {
      cx: "7.99998",
      cy: "8.00004",
      r: "4.66667",
      strokeLinecap: "round"
    }), jsxRuntimeExports.jsx("path", {
      d: "M4.66669 4.66663L11.3334 11.3333"
    })]
  });
};
var ExportIcon = function() {
  return jsxRuntimeExports.jsxs(SVG, {
    fill: "none",
    stroke: "currentColor",
    children: [jsxRuntimeExports.jsx("title", {
      children: "Open on CodeSandbox"
    }), jsxRuntimeExports.jsx("path", {
      d: "M6.66665 3.33337H4.33331C3.78103 3.33337 3.33331 3.78109 3.33331 4.33337V11.6667C3.33331 12.219 3.78103 12.6667 4.33331 12.6667H11.6666C12.2189 12.6667 12.6666 12.219 12.6666 11.6667V9.33337",
      strokeLinecap: "round"
    }), jsxRuntimeExports.jsx("path", {
      d: "M10 3.33337H12.5667C12.6219 3.33337 12.6667 3.37815 12.6667 3.43337V6.00004",
      strokeLinecap: "round"
    }), jsxRuntimeExports.jsx("path", {
      d: "M7.33331 8.66668L12.5333 3.46667",
      strokeLinecap: "round"
    })]
  });
};
var CloseIcon = function() {
  return jsxRuntimeExports.jsxs(SVG, {
    stroke: "currentColor",
    children: [jsxRuntimeExports.jsx("title", {
      children: "Close file"
    }), jsxRuntimeExports.jsx("path", {
      d: "M12 4L4 12",
      strokeLinecap: "round"
    }), jsxRuntimeExports.jsx("path", {
      d: "M4 4L12 12",
      strokeLinecap: "round"
    })]
  });
};
var ConsoleIcon = function() {
  return jsxRuntimeExports.jsxs(SVG, {
    children: [jsxRuntimeExports.jsx("title", {
      children: "Open browser console"
    }), jsxRuntimeExports.jsx("path", {
      d: "M5.65871 3.62037C5.44905 3.44066 5.1334 3.46494 4.95368 3.6746C4.77397 3.88427 4.79825 4.19992 5.00792 4.37963L5.65871 3.62037ZM5.00792 11.6204C4.79825 11.8001 4.77397 12.1157 4.95368 12.3254C5.1334 12.5351 5.44905 12.5593 5.65871 12.3796L5.00792 11.6204ZM9.9114 7.92407L10.2368 7.54445L9.9114 7.92407ZM5.00792 4.37963L9.586 8.3037L10.2368 7.54445L5.65871 3.62037L5.00792 4.37963ZM9.586 7.6963L5.00792 11.6204L5.65871 12.3796L10.2368 8.45555L9.586 7.6963ZM9.586 8.3037C9.39976 8.14407 9.39976 7.85594 9.586 7.6963L10.2368 8.45555C10.5162 8.2161 10.5162 7.7839 10.2368 7.54445L9.586 8.3037Z"
    }), jsxRuntimeExports.jsx("path", {
      d: "M10 11.5C9.72386 11.5 9.5 11.7239 9.5 12C9.5 12.2761 9.72386 12.5 10 12.5V11.5ZM14.6667 12.5C14.9428 12.5 15.1667 12.2761 15.1667 12C15.1667 11.7239 14.9428 11.5 14.6667 11.5V12.5ZM10 12.5H14.6667V11.5H10V12.5Z"
    })]
  });
};
var _a$1$1;
var defaultLight = {
  colors: {
    surface1: "#ffffff",
    surface2: "#EFEFEF",
    surface3: "#F3F3F3",
    disabled: "#C5C5C5",
    base: "#323232",
    clickable: "#808080",
    hover: "#4D4D4D",
    accent: "#3973E0",
    error: "#EA3323",
    errorSurface: "#FCF1F0",
    warning: "#6A4516",
    warningSurface: "#FEF2C0"
  },
  syntax: {
    plain: "#151515",
    comment: {
      color: "#999",
      fontStyle: "italic"
    },
    keyword: "#7C5AE3",
    tag: "#0971F1",
    punctuation: "#3B3B3B",
    definition: "#85A600",
    property: "#3B3B3B",
    static: "#3B3B3B",
    string: "#2E6BD0"
  },
  font: {
    body: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol"',
    mono: '"Fira Mono", "DejaVu Sans Mono", Menlo, Consolas, "Liberation Mono", Monaco, "Lucida Console", monospace',
    size: "13px",
    lineHeight: "20px"
  }
};
var defaultDark = {
  colors: {
    surface1: "#151515",
    surface2: "#252525",
    surface3: "#2F2F2F",
    disabled: "#4D4D4D",
    base: "#808080",
    clickable: "#999999",
    hover: "#C5C5C5",
    accent: "#E5E5E5",
    error: "#FFB4A6",
    errorSurface: "#690000",
    warning: "#E7C400",
    warningSurface: "#3A3000"
  },
  syntax: {
    plain: "#FFFFFF",
    comment: {
      color: "#757575",
      fontStyle: "italic"
    },
    keyword: "#77B7D7",
    tag: "#DFAB5C",
    punctuation: "#ffffff",
    definition: "#86D9CA",
    property: "#77B7D7",
    static: "#C64640",
    string: "#977CDC"
  },
  font: {
    body: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol"',
    mono: '"Fira Mono", "DejaVu Sans Mono", Menlo, Consolas, "Liberation Mono", Monaco, "Lucida Console", monospace',
    size: "13px",
    lineHeight: "20px"
  }
};
var SANDPACK_THEMES = {
  light: defaultLight,
  dark: defaultDark,
  auto: typeof window !== "undefined" ? ((_a$1$1 = window === null || window === void 0 ? void 0 : window.matchMedia) === null || _a$1$1 === void 0 ? void 0 : _a$1$1.call(window, "(prefers-color-scheme: dark)").matches) ? defaultDark : defaultLight : defaultLight
};
var getFileName = function(filePath) {
  var lastIndexOfSlash = filePath.lastIndexOf("/");
  return filePath.slice(lastIndexOfSlash + 1);
};
var calculateNearestUniquePath = function(currentPath, otherPaths) {
  var currentPathParts = (currentPath[0] === "/" ? currentPath.slice(1) : currentPath).split("/");
  var resultPathParts = [];
  if (currentPathParts.length === 1) {
    resultPathParts.unshift(currentPathParts[0]);
  } else {
    for (var fileIndex = 0; fileIndex < otherPaths.length; fileIndex++) {
      var otherPathParts = otherPaths[fileIndex].split("/");
      for (var partsFromEnd = 1; partsFromEnd <= currentPathParts.length; partsFromEnd++) {
        var currentPathPart = currentPathParts[currentPathParts.length - partsFromEnd];
        var otherPathPart = otherPathParts[otherPathParts.length - partsFromEnd];
        if (resultPathParts.length < partsFromEnd) {
          resultPathParts.unshift(currentPathPart);
        }
        if (currentPathPart !== otherPathPart) {
          break;
        }
      }
    }
  }
  if (resultPathParts.length < currentPathParts.length) {
    resultPathParts.unshift("..");
  }
  return resultPathParts.join("/");
};
var isDarkColor = function(color2) {
  var r = 0;
  var g = 0;
  var b = 0;
  if (color2.startsWith("#")) {
    if (color2.length < 7) {
      return true;
    }
    r = parseInt(color2.substr(1, 2), 16);
    g = parseInt(color2.substr(3, 2), 16);
    b = parseInt(color2.substr(5, 2), 16);
  } else {
    var rgbValues = color2.replace("rgb(", "").replace("rgba(", "").replace(")", "").split(",");
    if (rgbValues.length < 3) {
      return true;
    }
    r = parseInt(rgbValues[0], 10);
    g = parseInt(rgbValues[1], 10);
    b = parseInt(rgbValues[2], 10);
  }
  var yiq = (r * 299 + g * 587 + b * 114) / 1e3;
  return yiq < 128;
};
var lastCount = 0;
var generateRandomId$1 = function() {
  var random = +(Date.now().toString(10).substr(0, 4) + lastCount++);
  return random.toString(16);
};
var toString = function() {
  return "";
};
var doubleToString = function() {
  return toString;
};
var defineProperty = Object.getOwnPropertyDescriptors({
  toString
});
Object.defineProperties(toString, defineProperty);
Object.defineProperties(doubleToString, defineProperty);
var createStitchesMock = {
  createTheme: toString,
  css: doubleToString,
  getCssText: toString,
  keyframes: doubleToString
};
var _a$2;
var THEME_PREFIX = "sp";
var createTheme = (_a$2 = createStitchesMock, _a$2.createTheme);
_a$2.getCssText;
var keyframes = _a$2.keyframes;
var defaultVariables = {
  space: new Array(11).fill(" ").reduce(function(acc, _, index2) {
    var _a2;
    return __assign(__assign({}, acc), (_a2 = {}, _a2[index2 + 1] = "".concat((index2 + 1) * 4, "px"), _a2));
  }, {}),
  border: {
    radius: "4px"
  },
  layout: {
    height: "300px",
    headerHeight: "40px"
  },
  transitions: {
    default: "150ms ease"
  },
  zIndices: {
    base: "1",
    overlay: "2",
    top: "3"
  }
};
var standardizeStitchesTheme = function(theme) {
  var syntaxEntries = Object.entries(theme.syntax);
  var syntax = syntaxEntries.reduce(function(tokenAcc, _a2) {
    var _b;
    var tokenName = _a2[0], tokenValue = _a2[1];
    var newValues = (_b = {}, _b["color-".concat(tokenName)] = tokenValue, _b);
    if (typeof tokenValue === "object") {
      newValues = Object.entries(tokenValue).reduce(function(valueAcc, _a3) {
        var _b2;
        var styleProp = _a3[0], styleValue = _a3[1];
        return __assign(__assign({}, valueAcc), (_b2 = {}, _b2["".concat(styleProp, "-").concat(tokenName)] = styleValue, _b2));
      }, {});
    }
    return __assign(__assign({}, tokenAcc), newValues);
  }, {});
  return __assign(__assign({}, defaultVariables), {
    colors: theme.colors,
    font: theme.font,
    syntax
  });
};
var standardizeTheme = function(inputTheme) {
  var _a2, _b, _c2, _d, _e;
  if (inputTheme === void 0) {
    inputTheme = "light";
  }
  var defaultLightThemeKey = "default";
  if (typeof inputTheme === "string") {
    var predefinedTheme = SANDPACK_THEMES[inputTheme];
    if (!predefinedTheme) {
      throw new Error("[sandpack-react]: invalid theme '".concat(inputTheme, "' provided."));
    }
    return {
      theme: predefinedTheme,
      id: inputTheme,
      mode: isDarkColor(predefinedTheme.colors.surface1) ? "dark" : "light"
    };
  }
  var mode = isDarkColor((_b = (_a2 = inputTheme === null || inputTheme === void 0 ? void 0 : inputTheme.colors) === null || _a2 === void 0 ? void 0 : _a2.surface1) !== null && _b !== void 0 ? _b : defaultLight.colors.surface1) ? "dark" : "light";
  var baseTheme = mode === "dark" ? defaultDark : defaultLight;
  var colorsByMode = __assign(__assign({}, baseTheme.colors), (_c2 = inputTheme === null || inputTheme === void 0 ? void 0 : inputTheme.colors) !== null && _c2 !== void 0 ? _c2 : {});
  var syntaxByMode = __assign(__assign({}, baseTheme.syntax), (_d = inputTheme === null || inputTheme === void 0 ? void 0 : inputTheme.syntax) !== null && _d !== void 0 ? _d : {});
  var fontByMode = __assign(__assign({}, baseTheme.font), (_e = inputTheme === null || inputTheme === void 0 ? void 0 : inputTheme.font) !== null && _e !== void 0 ? _e : {});
  var theme = {
    colors: colorsByMode,
    syntax: syntaxByMode,
    font: fontByMode
  };
  var id = inputTheme ? simpleHashFunction(JSON.stringify(theme)) : defaultLightThemeKey;
  return {
    theme,
    id: "sp-".concat(id),
    mode
  };
};
var simpleHashFunction = function(str) {
  var hash = 0;
  for (var i = 0; i < str.length; hash &= hash) {
    hash = 31 * hash + str.charCodeAt(i++);
  }
  return Math.abs(hash);
};
var fakeCss = function() {
  return "";
};
fakeCss.toString = fakeCss;
var ClassNamesContext = reactExports.createContext({});
var ClassNamesProvider = function(_a2) {
  var children = _a2.children, classes = _a2.classes;
  return jsxRuntimeExports.jsx(ClassNamesContext.Provider, {
    value: classes || {},
    children
  });
};
var useClassNames = function() {
  var contextClassNames = reactExports.useContext(ClassNamesContext);
  return function sandpackClassNames(customClassName, allClassNames) {
    if (allClassNames === void 0) {
      allClassNames = [];
    }
    var custom = "".concat(THEME_PREFIX, "-").concat(customClassName);
    return joinClassNames.apply(void 0, __spreadArray(__spreadArray([], allClassNames, false), [custom, contextClassNames[custom]], false));
  };
};
var joinClassNames = function() {
  var args = [];
  for (var _i = 0; _i < arguments.length; _i++) {
    args[_i] = arguments[_i];
  }
  return args.filter(Boolean).join(" ");
};
var wrapperClassName$3 = fakeCss;
var SandpackThemeContext = reactExports.createContext({
  theme: defaultLight,
  id: "light",
  mode: "light"
});
var SandpackThemeProvider = function(_a2) {
  var themeFromProps = _a2.theme, children = _a2.children, className = _a2.className, props = __rest(_a2, ["theme", "children", "className"]);
  var _b = reactExports.useState(themeFromProps), prefferedTheme = _b[0], setPreferredTheme = _b[1];
  var _c2 = standardizeTheme(prefferedTheme), theme = _c2.theme, id = _c2.id, mode = _c2.mode;
  var classNames = useClassNames();
  var themeClassName = reactExports.useMemo(function() {
    return createTheme(id, standardizeStitchesTheme(theme));
  }, [theme, id]);
  reactExports.useEffect(function() {
    if (themeFromProps !== "auto") {
      setPreferredTheme(themeFromProps);
      return;
    }
    var colorSchemeChange = function(_a3) {
      var matches = _a3.matches;
      setPreferredTheme(matches ? "dark" : "light");
    };
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", colorSchemeChange);
    return function() {
      window.matchMedia("(prefers-color-scheme: dark)").removeEventListener("change", colorSchemeChange);
    };
  }, [themeFromProps]);
  return jsxRuntimeExports.jsx(SandpackThemeContext.Provider, {
    value: {
      theme,
      id,
      mode
    },
    children: jsxRuntimeExports.jsx("div", __assign({
      className: classNames("wrapper", [themeClassName, wrapperClassName$3(), className])
    }, props, {
      children
    }))
  });
};
SandpackThemeContext.Consumer;
var commonFiles = {
  "/styles.css": {
    code: "body {\n  font-family: sans-serif;\n  -webkit-font-smoothing: auto;\n  -moz-font-smoothing: auto;\n  -moz-osx-font-smoothing: grayscale;\n  font-smoothing: auto;\n  text-rendering: optimizeLegibility;\n  font-smooth: always;\n  -webkit-tap-highlight-color: transparent;\n  -webkit-touch-callout: none;\n}\n\nh1 {\n  font-size: 1.5rem;\n}"
  }
};
var ASTRO_TEMPLATE = {
  files: {
    "/src/styles.css": commonFiles["/styles.css"],
    "/src/pages/index.astro": {
      code: '---\nimport "../styles.css";\nconst data = "world";\n---\n\n<h1>Hello {data}</h1>\n\n<style>\n  h1 {\n    font-size: 1.5rem;\n  }\n</style>'
    },
    ".env": {
      code: 'ASTRO_TELEMETRY_DISABLED="1"'
    },
    "/package.json": {
      code: JSON.stringify({
        dependencies: {
          astro: "^1.6.12",
          "esbuild-wasm": "^0.15.16"
        },
        scripts: {
          dev: "astro dev",
          start: "astro dev",
          build: "astro build",
          preview: "astro preview",
          astro: "astro"
        }
      })
    }
  },
  main: "/src/pages/index.astro",
  environment: "node"
};
var NEXTJS_TEMPLATE = {
  files: __assign(__assign({}, commonFiles), {
    "/pages/_app.js": {
      code: "import '../styles.css'\n\nexport default function MyApp({ Component, pageProps }) {\n  return <Component {...pageProps} />\n}"
    },
    "/pages/index.js": {
      code: 'export default function Home({ data }) {\n  return (\n    <div>\n      <h1>Hello {data}</h1>\n    </div>\n  );\n}\n  \nexport function getServerSideProps() {\n  return {\n    props: { data: "world" },\n  }\n}\n'
    },
    "/next.config.js": {
      code: "/** @type {import('next').NextConfig} */\nconst nextConfig = {\n  reactStrictMode: true,\n  swcMinify: true,\n}\n\nmodule.exports = nextConfig\n"
    },
    "/package.json": {
      code: JSON.stringify({
        name: "my-app",
        version: "0.1.0",
        private: true,
        scripts: {
          dev: "NEXT_TELEMETRY_DISABLED=1 next dev",
          build: "next build",
          start: "next start",
          lint: "next lint"
        },
        dependencies: {
          next: "12.1.6",
          react: "18.2.0",
          "react-dom": "18.2.0",
          "@next/swc-wasm-nodejs": "12.1.6"
        }
      })
    }
  }),
  main: "/pages/index.js",
  environment: "node"
};
var NODE_TEMPLATE = {
  files: {
    "/index.js": {
      code: "const http = require('http');\n\nconst hostname = '127.0.0.1';\nconst port = 3000;\n\nconst server = http.createServer((req, res) => {\n  res.statusCode = 200;\n  res.setHeader('Content-Type', 'text/html');\n  res.end('Hello world');\n});\n\nserver.listen(port, hostname, () => {\n  console.log(`Server running at http://${hostname}:${port}/`);\n});"
    },
    "/package.json": {
      code: JSON.stringify({
        dependencies: {},
        scripts: {
          start: "node index.js"
        },
        main: "index.js"
      })
    }
  },
  main: "/index.js",
  environment: "node"
};
var VITE_TEMPLATE = {
  files: __assign(__assign({}, commonFiles), {
    "/index.js": {
      code: 'import "./styles.css";\n\ndocument.getElementById("app").innerHTML = `\n<h1>Hello world</h1>\n`;\n'
    },
    "/index.html": {
      code: '<!DOCTYPE html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>Vite App</title>\n  </head>\n  <body>\n    <div id="app"></div>\n    <script type="module" src="/index.js"><\/script>\n  </body>\n</html>\n'
    },
    "/package.json": {
      code: JSON.stringify({
        scripts: {
          dev: "vite",
          build: "vite build",
          preview: "vite preview"
        },
        devDependencies: {
          vite: "4.1.4",
          "esbuild-wasm": "0.17.12"
        }
      })
    }
  }),
  main: "/index.js",
  environment: "node"
};
var VITE_PREACT_TEMPLATE = {
  files: __assign(__assign({}, commonFiles), {
    "/App.jsx": {
      code: 'export default function App() {\n  const data = "world"\n\n  return <h1>Hello {data}</h1>\n}\n'
    },
    "/index.jsx": {
      code: 'import { render } from "preact";\nimport "./styles.css";\n\nimport App from "./App";\n\nconst root = document.getElementById("root");\nrender(<App />, root);\n'
    },
    "/index.html": {
      code: '<!DOCTYPE html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>Vite App</title>\n  </head>\n  <body>\n    <div id="root"></div>\n    <script type="module" src="/index.jsx"><\/script>\n  </body>\n</html>\n'
    },
    "/package.json": {
      code: JSON.stringify({
        scripts: {
          dev: "vite",
          build: "vite build",
          preview: "vite preview"
        },
        dependencies: {
          preact: "^10.16.0"
        },
        devDependencies: {
          "@preact/preset-vite": "^2.5.0",
          vite: "4.1.4",
          "esbuild-wasm": "0.17.12"
        }
      })
    },
    "/vite.config.js": {
      code: `import { defineConfig } from "vite";
import preact from '@preact/preset-vite'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [preact()],
});
`
    }
  }),
  main: "/App.jsx",
  environment: "node"
};
var VITE_PREACT_TS_TEMPLATE = {
  files: __assign(__assign({}, commonFiles), {
    "/App.tsx": {
      code: 'export default function App() {\n  const data: string = "world"\n\n  return <h1>Hello {data}</h1>\n}\n'
    },
    "/index.tsx": {
      code: 'import { render } from "preact";\nimport "./styles.css";\n\nimport App from "./App";\n\nconst root = document.getElementById("root") as HTMLElement;\nrender(<App />, root);\n'
    },
    "/index.html": {
      code: '<!DOCTYPE html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>Vite App</title>\n  </head>\n  <body>\n    <div id="root"></div>\n    <script type="module" src="/index.tsx"><\/script>\n  </body>\n</html>\n'
    },
    "/tsconfig.json": {
      code: JSON.stringify({
        compilerOptions: {
          target: "ESNext",
          useDefineForClassFields: true,
          lib: ["DOM", "DOM.Iterable", "ESNext"],
          allowJs: false,
          skipLibCheck: true,
          esModuleInterop: false,
          allowSyntheticDefaultImports: true,
          strict: true,
          forceConsistentCasingInFileNames: true,
          module: "ESNext",
          moduleResolution: "Node",
          resolveJsonModule: true,
          isolatedModules: true,
          noEmit: true,
          jsx: "react-jsx",
          jsxImportSource: "preact"
        },
        include: ["src"],
        references: [{
          path: "./tsconfig.node.json"
        }]
      }, null, 2)
    },
    "/tsconfig.node.json": {
      code: JSON.stringify({
        compilerOptions: {
          composite: true,
          module: "ESNext",
          moduleResolution: "Node",
          allowSyntheticDefaultImports: true
        },
        include: ["vite.config.ts"]
      }, null, 2)
    },
    "/package.json": {
      code: JSON.stringify({
        scripts: {
          dev: "vite",
          build: "tsc && vite build",
          preview: "vite preview"
        },
        dependencies: {
          preact: "^10.16.0"
        },
        devDependencies: {
          "@preact/preset-vite": "^2.5.0",
          typescript: "^4.9.5",
          vite: "4.1.4",
          "esbuild-wasm": "^0.17.12"
        }
      }, null, 2)
    },
    "/vite-env.d.ts": {
      code: '/// <reference types="vite/client" />'
    },
    "/vite.config.ts": {
      code: "import { defineConfig } from 'vite'\nimport preact from '@preact/preset-vite'\n\n// https://vitejs.dev/config/\nexport default defineConfig({\n  plugins: [preact()],\n})\n"
    }
  }),
  main: "/App.tsx",
  environment: "node"
};
var VITE_REACT_TEMPLATE = {
  files: __assign(__assign({}, commonFiles), {
    "/App.jsx": {
      code: 'export default function App() {\n  const data = "world"\n\n  return <h1>Hello {data}</h1>\n}\n'
    },
    "/index.jsx": {
      code: 'import { StrictMode } from "react";\nimport { createRoot } from "react-dom/client";\nimport "./styles.css";\n\nimport App from "./App";\n\nconst root = createRoot(document.getElementById("root"));\nroot.render(\n  <StrictMode>\n    <App />\n  </StrictMode>\n);'
    },
    "/index.html": {
      code: '<!DOCTYPE html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>Vite App</title>\n  </head>\n  <body>\n    <div id="root"></div>\n    <script type="module" src="/index.jsx"><\/script>\n  </body>\n</html>\n'
    },
    "/package.json": {
      code: JSON.stringify({
        scripts: {
          dev: "vite",
          build: "vite build",
          preview: "vite preview"
        },
        dependencies: {
          react: "^18.2.0",
          "react-dom": "^18.2.0"
        },
        devDependencies: {
          "@vitejs/plugin-react": "3.1.0",
          vite: "4.1.4",
          "esbuild-wasm": "0.17.12"
        }
      })
    },
    "/vite.config.js": {
      code: 'import { defineConfig } from "vite";\nimport react from "@vitejs/plugin-react";\n\n// https://vitejs.dev/config/\nexport default defineConfig({\n  plugins: [react()],\n});\n'
    }
  }),
  main: "/App.jsx",
  environment: "node"
};
var VITE_REACT_TS_TEMPLATE = {
  files: __assign(__assign({}, commonFiles), {
    "/App.tsx": {
      code: 'export default function App() {\n  const data: string = "world"\n\n  return <h1>Hello {data}</h1>\n}\n'
    },
    "/index.tsx": {
      code: 'import { StrictMode } from "react";\nimport { createRoot } from "react-dom/client";\nimport "./styles.css";\n\nimport App from "./App";\nimport React from "react";\n\nconst root = createRoot(document.getElementById("root") as HTMLElement);\nroot.render(\n  <StrictMode>\n    <App />\n  </StrictMode>\n);\n'
    },
    "/index.html": {
      code: '<!DOCTYPE html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>Vite App</title>\n  </head>\n  <body>\n    <div id="root"></div>\n    <script type="module" src="/index.tsx"><\/script>\n  </body>\n</html>\n'
    },
    "/tsconfig.json": {
      code: JSON.stringify({
        compilerOptions: {
          target: "ESNext",
          useDefineForClassFields: true,
          lib: ["DOM", "DOM.Iterable", "ESNext"],
          allowJs: false,
          skipLibCheck: true,
          esModuleInterop: false,
          allowSyntheticDefaultImports: true,
          strict: true,
          forceConsistentCasingInFileNames: true,
          module: "ESNext",
          moduleResolution: "Node",
          resolveJsonModule: true,
          isolatedModules: true,
          noEmit: true,
          jsx: "react-jsx"
        },
        include: ["src"],
        references: [{
          path: "./tsconfig.node.json"
        }]
      }, null, 2)
    },
    "/tsconfig.node.json": {
      code: JSON.stringify({
        compilerOptions: {
          composite: true,
          module: "ESNext",
          moduleResolution: "Node",
          allowSyntheticDefaultImports: true
        },
        include: ["vite.config.ts"]
      }, null, 2)
    },
    "/package.json": {
      code: JSON.stringify({
        scripts: {
          dev: "vite",
          build: "tsc && vite build",
          preview: "vite preview"
        },
        dependencies: {
          react: "^18.2.0",
          "react-dom": "^18.2.0"
        },
        devDependencies: {
          "@types/react": "^18.0.28",
          "@types/react-dom": "^18.0.11",
          "@vitejs/plugin-react": "^3.1.0",
          typescript: "^4.9.5",
          vite: "4.1.4",
          "esbuild-wasm": "^0.17.12"
        }
      }, null, 2)
    },
    "/vite-env.d.ts": {
      code: '/// <reference types="vite/client" />'
    },
    "/vite.config.ts": {
      code: "import { defineConfig } from 'vite'\nimport react from '@vitejs/plugin-react'\n\n// https://vitejs.dev/config/\nexport default defineConfig({\n  plugins: [react()],\n})\n"
    }
  }),
  main: "/App.tsx",
  environment: "node"
};
var VITE_SVELTE_TEMPLATE = {
  files: {
    "/src/styles.css": commonFiles["/styles.css"],
    "/src/App.svelte": {
      code: '<script>\nconst data = "world";\n<\/script>\n\n<h1>Hello {data}</h1>\n\n<style>\nh1 {\n  font-size: 1.5rem;\n}\n</style>'
    },
    "/src/main.js": {
      code: `import App from './App.svelte'
import "./styles.css"

const app = new App({
  target: document.getElementById('app'),
})

export default app`
    },
    "/index.html": {
      code: '<!DOCTYPE html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>Vite App</title>\n  </head>\n  <body>\n    <div id="app"></div>\n    <script type="module" src="/src/main.js"><\/script>\n  </body>\n</html>\n'
    },
    "/vite.config.js": {
      code: "import { defineConfig } from 'vite'\nimport { svelte } from '@sveltejs/vite-plugin-svelte'\n\n// https://vitejs.dev/config/\nexport default defineConfig({\n  plugins: [svelte()],\n})"
    },
    "/package.json": {
      code: JSON.stringify({
        type: "module",
        scripts: {
          dev: "vite"
        },
        devDependencies: {
          "@sveltejs/vite-plugin-svelte": "^2.0.2",
          svelte: "^3.55.1",
          vite: "4.0.4",
          "esbuild-wasm": "^0.17.12"
        }
      })
    }
  },
  main: "/src/App.svelte",
  environment: "node"
};
var VITE_SVELTE_TS_TEMPLATE = {
  files: {
    "/src/styles.css": commonFiles["/styles.css"],
    "/src/App.svelte": {
      code: '<script lang="ts">\nconst data: string = "world";\n<\/script>\n\n<h1>Hello {data}</h1>\n\n<style>\nh1 {\n  font-size: 1.5rem;\n}\n</style>'
    },
    "/src/main.ts": {
      code: `import App from './App.svelte'
import "./styles.css"

const app = new App({
  target: document.getElementById('app'),
})

export default app`
    },
    "/index.html": {
      code: '<!DOCTYPE html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>Vite App</title>\n  </head>\n  <body>\n    <div id="app"></div>\n    <script type="module" src="/src/main.ts"><\/script>\n  </body>\n</html>\n'
    },
    "/vite-env.d.ts": {
      code: '/// <reference types="svelte" />\n/// <reference types="vite/client" />'
    },
    "svelte.config.js": {
      code: "import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'\n\nexport default {\n  // Consult https://svelte.dev/docs#compile-time-svelte-preprocess\n  // for more information about preprocessors\n  preprocess: vitePreprocess(),\n}\n"
    },
    "/vite.config.ts": {
      code: "import { defineConfig } from 'vite'\nimport { svelte } from '@sveltejs/vite-plugin-svelte'\n\n// https://vitejs.dev/config/\nexport default defineConfig({\n  plugins: [svelte()],\n})"
    },
    "tsconfig.json": {
      code: JSON.stringify({
        extends: "@tsconfig/svelte/tsconfig.json",
        compilerOptions: {
          target: "ESNext",
          useDefineForClassFields: true,
          module: "ESNext",
          resolveJsonModule: true,
          allowJs: true,
          checkJs: true,
          isolatedModules: true
        },
        include: ["src/**/*.d.ts", "src/**/*.ts", "src/**/*.js", "src/**/*.svelte"],
        references: [{
          path: "./tsconfig.node.json"
        }]
      }, null, 2)
    },
    "tsconfig.node.json": {
      code: JSON.stringify({
        compilerOptions: {
          composite: true,
          module: "ESNext",
          moduleResolution: "Node"
        },
        include: ["vite.config.ts"]
      }, null, 2)
    },
    "/package.json": {
      code: JSON.stringify({
        type: "module",
        scripts: {
          dev: "vite"
        },
        devDependencies: {
          "@sveltejs/vite-plugin-svelte": "^2.0.2",
          "@tsconfig/svelte": "^3.0.0",
          svelte: "^3.55.1",
          "svelte-check": "^2.10.3",
          tslib: "^2.5.0",
          vite: "4.1.4",
          "esbuild-wasm": "^0.17.12"
        }
      }, null, 2)
    }
  },
  main: "/src/App.svelte",
  environment: "node"
};
var VITE_VUE_TEMPLATE = {
  files: {
    "/src/styles.css": commonFiles["/styles.css"],
    "/src/App.vue": {
      code: '<script setup>\nimport { ref } from "vue";\n\nconst data = ref("world");\n<\/script>\n\n<template>\n  <h1>Hello {{ data }}</h1>\n</template>\n\n<style>\nh1 {\n  font-size: 1.5rem;\n}\n</style>'
    },
    "/src/main.js": {
      code: `import { createApp } from 'vue'
import App from './App.vue'
import "./styles.css"
            
createApp(App).mount('#app')            
`
    },
    "/index.html": {
      code: '<!DOCTYPE html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>Vite App</title>\n  </head>\n  <body>\n    <div id="app"></div>\n    <script type="module" src="/src/main.js"><\/script>\n  </body>\n</html>\n'
    },
    "/vite.config.js": {
      code: "import { defineConfig } from 'vite'\nimport vue from '@vitejs/plugin-vue'\n\n// https://vitejs.dev/config/\nexport default defineConfig({\n  plugins: [vue()]\n})\n"
    },
    "/package.json": {
      code: JSON.stringify({
        scripts: {
          dev: "vite",
          build: "vite build",
          preview: "vite preview"
        },
        dependencies: {
          vue: "^3.2.45"
        },
        devDependencies: {
          "@vitejs/plugin-vue": "3.2.0",
          vite: "4.1.4",
          "esbuild-wasm": "0.17.12"
        }
      })
    }
  },
  main: "/src/App.vue",
  environment: "node"
};
var VITE_VUE_TS_TEMPLATE = {
  files: {
    "/src/styles.css": commonFiles["/styles.css"],
    "/src/App.vue": {
      code: '<script setup lang="ts">\nimport { ref } from "vue";\n\nconst data = ref<string>("world");\n<\/script>\n\n<template>\n  <h1>Hello {{ data }}</h1>\n</template>\n\n<style>\nh1 {\n  font-size: 1.5rem;\n}\n</style>'
    },
    "/src/main.ts": {
      code: `import { createApp } from 'vue'
import App from './App.vue'
import "./styles.css"

createApp(App).mount('#app')
`
    },
    "/index.html": {
      code: '<!DOCTYPE html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>Vite App</title>\n  </head>\n  <body>\n    <div id="app"></div>\n    <script type="module" src="/src/main.ts"><\/script>\n  </body>\n</html>\n'
    },
    "/vite-env.d.ts": {
      code: '/// <reference types="vite/client" />'
    },
    "/vite.config.ts": {
      code: "import { defineConfig } from 'vite'\nimport vue from '@vitejs/plugin-vue'\n\n// https://vitejs.dev/config/\nexport default defineConfig({\n  plugins: [vue()]\n})\n"
    },
    "tsconfig.json": {
      code: JSON.stringify({
        compilerOptions: {
          target: "ESNext",
          useDefineForClassFields: true,
          module: "ESNext",
          moduleResolution: "Node",
          strict: true,
          jsx: "preserve",
          resolveJsonModule: true,
          isolatedModules: true,
          esModuleInterop: true,
          lib: ["ESNext", "DOM"],
          skipLibCheck: true,
          noEmit: true
        },
        include: ["src/**/*.ts", "src/**/*.d.ts", "src/**/*.tsx", "src/**/*.vue"],
        references: [{
          path: "./tsconfig.node.json"
        }]
      }, null, 2)
    },
    "tsconfig.node.json": {
      code: JSON.stringify({
        compilerOptions: {
          composite: true,
          module: "ESNext",
          moduleResolution: "Node",
          allowSyntheticDefaultImports: true
        },
        include: ["vite.config.ts"]
      }, null, 2)
    },
    "/package.json": {
      code: JSON.stringify({
        scripts: {
          dev: "vite",
          build: "tsc && vite build",
          preview: "vite preview"
        },
        dependencies: {
          vue: "^3.2.47"
        },
        devDependencies: {
          "@vitejs/plugin-vue": "^4.0.0",
          vite: "4.1.4",
          "vue-tsc": "^1.2.0",
          typescript: "^4.9.5",
          "esbuild-wasm": "^0.17.12"
        }
      }, null, 2)
    }
  },
  main: "/src/App.vue",
  environment: "node"
};
var ANGULAR_TEMPLATE = {
  files: {
    "/src/app/app.component.css": commonFiles["/styles.css"],
    "/src/app/app.component.html": {
      code: "<div>\n<h1>{{ helloWorld }}</h1>\n</div>     \n"
    },
    "/src/app/app.component.ts": {
      code: 'import { Component } from "@angular/core";\n\n@Component({\n  selector: "app-root",\n  templateUrl: "./app.component.html",\n  styleUrls: ["./app.component.css"]\n})\nexport class AppComponent {\n  helloWorld = "Hello world";\n}           \n'
    },
    "/src/app/app.module.ts": {
      code: 'import { BrowserModule } from "@angular/platform-browser";\nimport { NgModule } from "@angular/core";\n      \nimport { AppComponent } from "./app.component";\n      \n@NgModule({\n  declarations: [AppComponent],\n  imports: [BrowserModule],\n  providers: [],\n  bootstrap: [AppComponent]\n})\nexport class AppModule {}       \n'
    },
    "/src/index.html": {
      code: '<!doctype html>\n<html lang="en">\n      \n<head>\n  <meta charset="utf-8">\n  <title>Angular</title>\n  <base href="/">\n      \n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <link rel="icon" type="image/x-icon" href="favicon.ico">\n</head>\n      \n<body>\n   <app-root></app-root>\n</body>\n      \n</html>\n'
    },
    "/src/main.ts": {
      code: 'import { enableProdMode } from "@angular/core";\nimport { platformBrowserDynamic } from "@angular/platform-browser-dynamic";\n      \nimport { AppModule } from "./app/app.module";      \n\nplatformBrowserDynamic()\n  .bootstrapModule(AppModule)\n  .catch(err => console.log(err));\n      \n'
    },
    "/src/polyfills.ts": {
      code: 'import "core-js/proposals/reflect-metadata";   \n      import "zone.js/dist/zone";\n'
    },
    "/package.json": {
      code: JSON.stringify({
        dependencies: {
          "@angular/core": "^11.2.0",
          "@angular/platform-browser": "^11.2.0",
          "@angular/platform-browser-dynamic": "^11.2.0",
          "@angular/common": "^11.2.0",
          "@angular/compiler": "^11.2.0",
          "zone.js": "0.11.3",
          "core-js": "3.8.3",
          rxjs: "6.6.3"
        },
        main: "/src/main.ts"
      })
    }
  },
  main: "/src/app/app.component.ts",
  environment: "angular-cli"
};
var REACT_TEMPLATE = {
  files: __assign(__assign({}, commonFiles), {
    "/App.js": {
      code: "export default function App() {\n  return <h1>Hello world</h1>\n}\n"
    },
    "/index.js": {
      code: 'import React, { StrictMode } from "react";\nimport { createRoot } from "react-dom/client";\nimport "./styles.css";\n\nimport App from "./App";\n\nconst root = createRoot(document.getElementById("root"));\nroot.render(\n  <StrictMode>\n    <App />\n  </StrictMode>\n);'
    },
    "/public/index.html": {
      code: '<!DOCTYPE html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8">\n    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n    <title>Document</title>\n  </head>\n  <body>\n    <div id="root"></div>\n  </body>\n</html>'
    },
    "/package.json": {
      code: JSON.stringify({
        dependencies: {
          react: "^18.0.0",
          "react-dom": "^18.0.0",
          "react-scripts": "^5.0.0"
        },
        main: "/index.js"
      })
    }
  }),
  main: "/App.js",
  environment: "create-react-app"
};
var REACT_TYPESCRIPT_TEMPLATE = {
  files: __assign(__assign({}, commonFiles), {
    "tsconfig.json": {
      code: '{\n  "include": [\n    "./**/*"\n  ],\n  "compilerOptions": {\n    "strict": true,\n    "esModuleInterop": true,\n    "lib": [ "dom", "es2015" ],\n    "jsx": "react-jsx"\n  }\n}'
    },
    "/App.tsx": {
      code: "export default function App(): JSX.Element {\n  return <h1>Hello world</h1>\n}\n"
    },
    "/index.tsx": {
      code: 'import React, { StrictMode } from "react";\nimport { createRoot } from "react-dom/client";\nimport "./styles.css";\n\nimport App from "./App";\n\nconst root = createRoot(document.getElementById("root"));\nroot.render(\n  <StrictMode>\n    <App />\n  </StrictMode>\n);'
    },
    "/public/index.html": {
      code: '<!DOCTYPE html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8">\n    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n    <title>Document</title>\n  </head>\n  <body>\n    <div id="root"></div>\n  </body>\n</html>'
    },
    "/package.json": {
      code: JSON.stringify({
        dependencies: {
          react: "^18.0.0",
          "react-dom": "^18.0.0",
          "react-scripts": "^4.0.0"
        },
        devDependencies: {
          "@types/react": "^18.0.0",
          "@types/react-dom": "^18.0.0",
          typescript: "^4.0.0"
        },
        main: "/index.tsx"
      })
    }
  }),
  main: "/App.tsx",
  environment: "create-react-app"
};
var SOLID_TEMPLATE = {
  files: __assign(__assign({}, commonFiles), {
    "/App.tsx": {
      code: 'import { Component } from "solid-js";\n\nconst App: Component = () => {\n  return <h1>Hello world</h1>\n};\n\nexport default App;'
    },
    "/index.tsx": {
      code: 'import { render } from "solid-js/web";\nimport App from "./App";\n\nimport "./styles.css";\n\nrender(() => <App />, document.getElementById("app"));'
    },
    "/index.html": {
      code: '<html>\n<head>\n  <title>Parcel Sandbox</title>\n  <meta charset="UTF-8" />\n</head>\n<body>\n  <div id="app"></div>\n  <script src="src/index.tsx"><\/script>\n</body>\n</html>'
    },
    "/package.json": {
      code: JSON.stringify({
        dependencies: {
          "solid-js": "1.3.15"
        },
        main: "/index.tsx"
      })
    }
  }),
  main: "/App.tsx",
  environment: "solid"
};
var SVELTE_TEMPLATE = {
  files: __assign(__assign({}, commonFiles), {
    "/App.svelte": {
      code: "<style>\n  h1 {\n    font-size: 1.5rem;\n  }\n</style>\n\n<script>\n  let name = 'world';\n<\/script>\n\n<main>\n  <h1>Hello {name}</h1>\n</main>"
    },
    "/index.js": {
      code: 'import App from "./App.svelte";\nimport "./styles.css";\n\nconst app = new App({\n  target: document.body\n});\n\nexport default app;\n      '
    },
    "/public/index.html": {
      code: '<!DOCTYPE html>\n<html>\n  <head>\n    <meta charset="utf8" />\n    <meta name="viewport" content="width=device-width" />\n\n    <title>Svelte app</title>\n\n    <link rel="stylesheet" href="public/bundle.css" />\n  </head>\n\n  <body>\n    <script src="bundle.js"><\/script>\n  </body>\n</html>'
    },
    "/package.json": {
      code: JSON.stringify({
        dependencies: {
          svelte: "^3.0.0"
        },
        main: "/index.js"
      })
    }
  }),
  main: "/App.svelte",
  environment: "svelte"
};
var TEST_TYPESCRIPT_TEMPLATE = {
  files: {
    "tsconfig.json": {
      code: '{\n  "include": [\n    "./**/*"\n  ],\n  "compilerOptions": {\n    "strict": true,\n    "esModuleInterop": true,\n    "lib": [ "dom", "es2015" ],\n    "jsx": "react-jsx"\n  }\n}'
    },
    "/add.ts": {
      code: "export const add = (a: number, b: number): number => a + b;"
    },
    "/add.test.ts": {
      code: "import { add } from './add';\n\ndescribe('add', () => {\n  test('Commutative Law of Addition', () => {\n    expect(add(1, 2)).toBe(add(2, 1));\n  });\n});"
    },
    "package.json": {
      code: JSON.stringify({
        dependencies: {},
        devDependencies: {
          typescript: "^4.0.0"
        },
        main: "/add.ts"
      })
    }
  },
  main: "/add.test.ts",
  environment: "parcel",
  mode: "tests"
};
var VANILLA_TEMPLATE = {
  files: __assign(__assign({}, commonFiles), {
    "/index.js": {
      code: 'import "./styles.css";\n\ndocument.getElementById("app").innerHTML = `\n<h1>Hello world</h1>\n`;\n'
    },
    "/index.html": {
      code: '<!DOCTYPE html>\n<html>\n\n<head>\n  <title>Parcel Sandbox</title>\n  <meta charset="UTF-8" />\n</head>\n\n<body>\n  <div id="app"></div>\n\n  <script src="index.js">\n  <\/script>\n</body>\n\n</html>'
    },
    "/package.json": {
      code: JSON.stringify({
        dependencies: {},
        main: "/index.js"
      })
    }
  }),
  main: "/index.js",
  environment: "parcel"
};
var VANILLA_TYPESCRIPT_TEMPLATE = {
  files: __assign(__assign({}, commonFiles), {
    "tsconfig.json": {
      code: '{\n  "compilerOptions": {\n    "strict": true,\n    "module": "commonjs",\n    "jsx": "preserve",\n    "esModuleInterop": true,\n    "sourceMap": true,\n    "allowJs": true,\n    "lib": [\n      "es6",\n      "dom"\n    ],\n    "rootDir": "src",\n    "moduleResolution": "node"\n  }\n}'
    },
    "/index.ts": {
      code: 'import "./styles.css";\n\ndocument.getElementById("app").innerHTML = `\n<h1>Hello world</h1>\n`;\n'
    },
    "/index.html": {
      code: '<!DOCTYPE html>\n<html>\n\n<head>\n  <title>Parcel Sandbox</title>\n  <meta charset="UTF-8" />\n</head>\n\n<body>\n  <div id="app"></div>\n\n  <script src="index.ts">\n  <\/script>\n</body>\n\n</html>'
    },
    "/package.json": {
      code: JSON.stringify({
        dependencies: {},
        devDependencies: {
          typescript: "^4.0.0"
        },
        main: "/index.ts"
      })
    }
  }),
  main: "/index.ts",
  environment: "parcel"
};
var VUE_TEMPLATE = {
  files: {
    "/src/styles.css": commonFiles["/styles.css"],
    "/src/App.vue": {
      code: "<template>\n  <h1>Hello {{ msg }}</h1>\n</template>\n\n<script setup>\nimport { ref } from 'vue';\nconst msg = ref('world');\n<\/script>"
    },
    "/src/main.js": {
      code: `import { createApp } from 'vue'
import App from './App.vue'
import "./styles.css";

createApp(App).mount('#app')
`
    },
    "/public/index.html": {
      code: `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <meta name="viewport" content="width=device-width,initial-scale=1.0" />
    <title>codesandbox</title>
  </head>
  <body>
    <noscript>
      <strong
        >We're sorry but codesandbox doesn't work properly without JavaScript
        enabled. Please enable it to continue.</strong
      >
    </noscript>
    <div id="app"></div>
    <!-- built files will be auto injected -->
  </body>
</html>
`
    },
    "/package.json": {
      code: JSON.stringify({
        name: "vue3",
        version: "0.1.0",
        private: true,
        main: "/src/main.js",
        scripts: {
          serve: "vue-cli-service serve",
          build: "vue-cli-service build"
        },
        dependencies: {
          "core-js": "^3.26.1",
          vue: "^3.2.45"
        },
        devDependencies: {
          "@vue/cli-plugin-babel": "^5.0.8",
          "@vue/cli-service": "^5.0.8"
        }
      })
    }
  },
  main: "/src/App.vue",
  environment: "vue-cli"
};
var VUE_TS_TEMPLATE = {
  files: {
    "/src/styles.css": commonFiles["/styles.css"],
    "/src/App.vue": {
      code: `<template>
  <h1>Hello {{ msg }}</h1>
</template>

<script setup lang="ts">
import { ref } from 'vue';
const msg = ref<string>('world');
<\/script>`
    },
    "/src/main.ts": {
      code: `import { createApp } from 'vue'
import App from './App.vue'
import "./styles.css";

createApp(App).mount('#app')
`
    },
    "/src/shims-vue.d.ts": '/* eslint-disable */\ndeclare module "*.vue" {\n  import type { DefineComponent } from "vue";\n  const component: DefineComponent<{}, {}, any>;\n  export default component;\n}',
    "/public/index.html": {
      code: `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <meta name="viewport" content="width=device-width,initial-scale=1.0" />
    <title>codesandbox</title>
  </head>
  <body>
    <noscript>
      <strong
        >We're sorry but codesandbox doesn't work properly without JavaScript
        enabled. Please enable it to continue.</strong
      >
    </noscript>
    <div id="app"></div>
    <!-- built files will be auto injected -->
  </body>
</html>
`
    },
    "/package.json": {
      code: JSON.stringify({
        name: "vue3-ts",
        version: "0.1.0",
        private: true,
        main: "/src/main.ts",
        scripts: {
          serve: "vue-cli-service serve",
          build: "vue-cli-service build"
        },
        dependencies: {
          "core-js": "^3.26.1",
          vue: "^3.2.45"
        },
        devDependencies: {
          "@vue/cli-plugin-babel": "^5.0.8",
          "@vue/cli-plugin-typescript": "^5.0.8",
          "@vue/cli-service": "^5.0.8",
          typescript: "^4.9.3"
        }
      })
    },
    "/tsconfig.json": {
      code: JSON.stringify({
        compilerOptions: {
          target: "esnext",
          module: "esnext",
          strict: true,
          jsx: "preserve",
          moduleResolution: "node",
          experimentalDecorators: true,
          skipLibCheck: true,
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
          forceConsistentCasingInFileNames: true,
          useDefineForClassFields: true,
          sourceMap: false,
          baseUrl: ".",
          types: ["webpack-env"],
          paths: {
            "@/*": ["src/*"]
          },
          lib: ["esnext", "dom", "dom.iterable", "scripthost"]
        },
        include: ["src/**/*.ts", "src/**/*.tsx", "src/**/*.vue", "tests/**/*.ts", "tests/**/*.tsx"],
        exclude: ["node_modules"]
      })
    }
  },
  main: "/src/App.vue",
  environment: "vue-cli"
};
var STATIC_TEMPLATE = {
  files: __assign(__assign({}, commonFiles), {
    "/index.html": {
      code: '<!DOCTYPE html>\n<html>\n\n<head>\n  <title>Parcel Sandbox</title>\n  <meta charset="UTF-8" />\n  <link rel="stylesheet" href="/styles.css" />\n</head>\n\n<body>\n  <h1>Hello world</h1>\n</body>\n\n</html>'
    },
    "/package.json": {
      code: JSON.stringify({
        dependencies: {},
        main: "/index.html"
      })
    }
  }),
  main: "/index.html",
  environment: "static"
};
var SANDBOX_TEMPLATES = {
  static: STATIC_TEMPLATE,
  angular: ANGULAR_TEMPLATE,
  react: REACT_TEMPLATE,
  "react-ts": REACT_TYPESCRIPT_TEMPLATE,
  solid: SOLID_TEMPLATE,
  svelte: SVELTE_TEMPLATE,
  "test-ts": TEST_TYPESCRIPT_TEMPLATE,
  "vanilla-ts": VANILLA_TYPESCRIPT_TEMPLATE,
  vanilla: VANILLA_TEMPLATE,
  vue: VUE_TEMPLATE,
  "vue-ts": VUE_TS_TEMPLATE,
  node: NODE_TEMPLATE,
  nextjs: NEXTJS_TEMPLATE,
  vite: VITE_TEMPLATE,
  "vite-react": VITE_REACT_TEMPLATE,
  "vite-react-ts": VITE_REACT_TS_TEMPLATE,
  "vite-preact": VITE_PREACT_TEMPLATE,
  "vite-preact-ts": VITE_PREACT_TS_TEMPLATE,
  "vite-vue": VITE_VUE_TEMPLATE,
  "vite-vue-ts": VITE_VUE_TS_TEMPLATE,
  "vite-svelte": VITE_SVELTE_TEMPLATE,
  "vite-svelte-ts": VITE_SVELTE_TS_TEMPLATE,
  astro: ASTRO_TEMPLATE
};
var getSandpackStateFromProps = function(props) {
  var _a2, _b, _c2, _d, _e, _f;
  var normalizedFilesPath = normalizePath(props.files);
  var projectSetup = combineTemplateFilesToSetup({
    template: props.template,
    customSetup: props.customSetup,
    files: normalizedFilesPath
  });
  var visibleFiles = normalizePath((_b = (_a2 = props.options) === null || _a2 === void 0 ? void 0 : _a2.visibleFiles) !== null && _b !== void 0 ? _b : []);
  var activeFile = ((_c2 = props.options) === null || _c2 === void 0 ? void 0 : _c2.activeFile) ? resolveFile((_d = props.options) === null || _d === void 0 ? void 0 : _d.activeFile, projectSetup.files) : void 0;
  if (visibleFiles.length === 0 && normalizedFilesPath) {
    Object.keys(normalizedFilesPath).forEach(function(filePath) {
      var file = normalizedFilesPath[filePath];
      if (typeof file === "string") {
        visibleFiles.push(filePath);
        return;
      }
      if (!activeFile && file.active) {
        activeFile = filePath;
        if (file.hidden === true) {
          visibleFiles.push(filePath);
        }
      }
      if (!file.hidden) {
        visibleFiles.push(filePath);
      }
    });
  }
  if (visibleFiles.length === 0) {
    visibleFiles = [projectSetup.main];
  }
  if (projectSetup.entry && !projectSetup.files[projectSetup.entry]) {
    projectSetup.entry = resolveFile(projectSetup.entry, projectSetup.files);
  }
  if (!activeFile && projectSetup.main) {
    activeFile = projectSetup.main;
  }
  if (!activeFile || !projectSetup.files[activeFile]) {
    activeFile = visibleFiles[0];
  }
  if (!visibleFiles.includes(activeFile)) {
    visibleFiles.push(activeFile);
  }
  var files = addPackageJSONIfNeeded(projectSetup.files, (_e = projectSetup.dependencies) !== null && _e !== void 0 ? _e : {}, (_f = projectSetup.devDependencies) !== null && _f !== void 0 ? _f : {}, projectSetup.entry);
  var existOpenPath = visibleFiles.filter(function(path) {
    return files[path];
  });
  return {
    visibleFiles: existOpenPath,
    activeFile,
    files,
    environment: projectSetup.environment,
    shouldUpdatePreview: true
  };
};
var resolveFile = function(path, files) {
  var normalizedFilesPath = normalizePath(files);
  var normalizedPath = normalizePath(path);
  if (normalizedPath in normalizedFilesPath) {
    return normalizedPath;
  }
  if (!path) {
    return null;
  }
  var resolvedPath = null;
  var index2 = 0;
  var strategies = [".js", ".jsx", ".ts", ".tsx"];
  while (!resolvedPath && index2 < strategies.length) {
    var removeExtension = normalizedPath.split(".")[0];
    var attemptPath = "".concat(removeExtension).concat(strategies[index2]);
    if (normalizedFilesPath[attemptPath] !== void 0) {
      resolvedPath = attemptPath;
    }
    index2++;
  }
  return resolvedPath;
};
var combineTemplateFilesToSetup = function(_a2) {
  var files = _a2.files, template = _a2.template, customSetup = _a2.customSetup;
  if (!template) {
    if (!customSetup) {
      var defaultTemplate = SANDBOX_TEMPLATES.vanilla;
      return __assign(__assign({}, defaultTemplate), {
        files: __assign(__assign({}, defaultTemplate.files), convertedFilesToBundlerFiles(files))
      });
    }
    if (!files || Object.keys(files).length === 0) {
      throw new Error("[sandpack-react]: without a template, you must pass at least one file");
    }
    return __assign(__assign({}, customSetup), {
      files: convertedFilesToBundlerFiles(files)
    });
  }
  var baseTemplate = SANDBOX_TEMPLATES[template];
  if (!baseTemplate) {
    throw new Error('[sandpack-react]: invalid template "'.concat(template, '" provided'));
  }
  if (!customSetup && !files) {
    return baseTemplate;
  }
  return {
    files: convertedFilesToBundlerFiles(__assign(__assign({}, baseTemplate.files), files)),
    dependencies: __assign(__assign({}, baseTemplate.dependencies), customSetup === null || customSetup === void 0 ? void 0 : customSetup.dependencies),
    devDependencies: __assign(__assign({}, baseTemplate.devDependencies), customSetup === null || customSetup === void 0 ? void 0 : customSetup.devDependencies),
    entry: normalizePath(customSetup === null || customSetup === void 0 ? void 0 : customSetup.entry),
    main: baseTemplate.main,
    environment: (customSetup === null || customSetup === void 0 ? void 0 : customSetup.environment) || baseTemplate.environment
  };
};
var convertedFilesToBundlerFiles = function(files) {
  if (!files) return {};
  return Object.keys(files).reduce(function(acc, key) {
    if (typeof files[key] === "string") {
      acc[key] = {
        code: files[key]
      };
    } else {
      acc[key] = files[key];
    }
    return acc;
  }, {});
};
var useAppState = function(props, files) {
  var _a2 = reactExports.useState({
    editorState: "pristine"
  }), state = _a2[0], setState = _a2[1];
  var originalStateFromProps = getSandpackStateFromProps(props);
  var editorState = dequal(originalStateFromProps.files, files) ? "pristine" : "dirty";
  if (editorState !== state.editorState) {
    setState(function(prev) {
      return __assign(__assign({}, prev), {
        editorState
      });
    });
  }
  return state;
};
var useSandpackId = function() {
  if (typeof reactExports.useId === "function") {
    return reactExports.useId();
  } else {
    return generateRandomId$1();
  }
};
var MAX_ID_LENGTH = 9;
var sandpackClientVersion = define_process_env_default.SANDPACK_CLIENT_VERSION;
var useAsyncSandpackId = function(files) {
  if (typeof reactExports.useId === "function") {
    var reactDomId_1 = reactExports.useId();
    return function() {
      return __awaiter(void 0, void 0, void 0, function() {
        var allCode, sha;
        return __generator(this, function(_a2) {
          switch (_a2.label) {
            case 0:
              allCode = Object.entries(files).map(function(path, code) {
                return path + "|" + code;
              }).join("|||");
              return [4, generateShortId(allCode + reactDomId_1 + sandpackClientVersion)];
            case 1:
              sha = _a2.sent();
              return [2, ensureLength(sha.replace(/:/g, "sp").replace(/[^a-zA-Z]/g, ""), MAX_ID_LENGTH)];
          }
        });
      });
    };
  } else {
    return function() {
      return ensureLength(generateRandomId$1(), MAX_ID_LENGTH);
    };
  }
};
function ensureLength(str, length) {
  if (str.length > length) {
    return str.slice(0, length);
  } else {
    return str.padEnd(length, "s");
  }
}
function generateShortId(input) {
  return __awaiter(this, void 0, void 0, function() {
    var encoder, data, hashBuffer, hashArray;
    return __generator(this, function(_a2) {
      switch (_a2.label) {
        case 0:
          encoder = new TextEncoder();
          data = encoder.encode(input);
          return [4, crypto.subtle.digest("SHA-256", data)];
        case 1:
          hashBuffer = _a2.sent();
          hashArray = Array.from(new Uint8Array(hashBuffer));
          return [2, btoa(String.fromCharCode.apply(String, hashArray))];
      }
    });
  });
}
var BUNDLER_TIMEOUT = 4e4;
var useClient = function(_a2, filesState) {
  var _b, _c2, _d;
  var options = _a2.options, customSetup = _a2.customSetup, teamId = _a2.teamId, sandboxId = _a2.sandboxId;
  options !== null && options !== void 0 ? options : options = {};
  customSetup !== null && customSetup !== void 0 ? customSetup : customSetup = {};
  var initModeFromProps = (options === null || options === void 0 ? void 0 : options.initMode) || "lazy";
  var _e = reactExports.useState({
    startRoute: options === null || options === void 0 ? void 0 : options.startRoute,
    bundlerState: void 0,
    error: null,
    initMode: initModeFromProps,
    reactDevTools: void 0,
    status: ((_b = options === null || options === void 0 ? void 0 : options.autorun) !== null && _b !== void 0 ? _b : true) ? "initial" : "idle"
  }), state = _e[0], setState = _e[1];
  var intersectionObserverCallback = reactExports.useRef();
  var intersectionObserver = reactExports.useRef(null);
  var lazyAnchorRef = reactExports.useRef(null);
  var registeredIframes = reactExports.useRef({});
  var clients = reactExports.useRef({});
  var timeoutHook = reactExports.useRef(null);
  var unsubscribeClientListeners = reactExports.useRef({});
  var unsubscribe = reactExports.useRef();
  var queuedListeners = reactExports.useRef({
    global: {}
  });
  var debounceHook = reactExports.useRef();
  var prevEnvironment = reactExports.useRef(filesState.environment);
  var asyncSandpackId = useAsyncSandpackId(filesState.files);
  var createClient = reactExports.useCallback(function(iframe, clientId, clientPropsOverride) {
    return __awaiter(void 0, void 0, void 0, function() {
      var timeOut, shouldSetTimeout, getStableServiceWorkerId, client, _a3, _b2, globalListeners;
      var _c22;
      var _d2, _e2, _f;
      return __generator(this, function(_g) {
        switch (_g.label) {
          case 0:
            if (clients.current[clientId]) {
              clients.current[clientId].destroy();
            }
            options !== null && options !== void 0 ? options : options = {};
            customSetup !== null && customSetup !== void 0 ? customSetup : customSetup = {};
            timeOut = (_d2 = options === null || options === void 0 ? void 0 : options.bundlerTimeOut) !== null && _d2 !== void 0 ? _d2 : BUNDLER_TIMEOUT;
            if (timeoutHook.current) {
              clearTimeout(timeoutHook.current);
            }
            shouldSetTimeout = typeof unsubscribe.current !== "function";
            if (shouldSetTimeout) {
              timeoutHook.current = setTimeout(function() {
                unregisterAllClients();
                setState(function(prev) {
                  return __assign(__assign({}, prev), {
                    status: "timeout"
                  });
                });
              }, timeOut);
            }
            getStableServiceWorkerId = function() {
              return __awaiter(void 0, void 0, void 0, function() {
                var key, fixedId;
                return __generator(this, function(_a4) {
                  switch (_a4.label) {
                    case 0:
                      if (!(options === null || options === void 0 ? void 0 : options.experimental_enableStableServiceWorkerId)) return [3, 3];
                      key = "SANDPACK_INTERNAL:URL-CONSISTENT-ID";
                      fixedId = localStorage.getItem(key);
                      if (!!fixedId) return [3, 2];
                      return [4, asyncSandpackId()];
                    case 1:
                      fixedId = _a4.sent();
                      localStorage.setItem(key, fixedId);
                      _a4.label = 2;
                    case 2:
                      return [2, fixedId];
                    case 3:
                      return [4, asyncSandpackId()];
                    case 4:
                      return [2, _a4.sent()];
                  }
                });
              });
            };
            _a3 = loadSandpackClient;
            _b2 = [iframe, {
              files: filesState.files,
              template: filesState.environment
            }];
            _c22 = {
              externalResources: options.externalResources,
              bundlerURL: options.bundlerURL,
              startRoute: (_e2 = clientPropsOverride === null || clientPropsOverride === void 0 ? void 0 : clientPropsOverride.startRoute) !== null && _e2 !== void 0 ? _e2 : options.startRoute,
              fileResolver: options.fileResolver,
              skipEval: (_f = options.skipEval) !== null && _f !== void 0 ? _f : false,
              logLevel: options.logLevel,
              showOpenInCodeSandbox: false,
              showErrorScreen: true,
              showLoadingScreen: false,
              reactDevTools: state.reactDevTools,
              customNpmRegistries: customSetup === null || customSetup === void 0 ? void 0 : customSetup.npmRegistries,
              teamId,
              experimental_enableServiceWorker: !!(options === null || options === void 0 ? void 0 : options.experimental_enableServiceWorker)
            };
            return [4, getStableServiceWorkerId()];
          case 1:
            return [4, _a3.apply(void 0, _b2.concat([(_c22.experimental_stableServiceWorkerId = _g.sent(), _c22.sandboxId = sandboxId, _c22)]))];
          case 2:
            client = _g.sent();
            if (typeof unsubscribe.current !== "function") {
              unsubscribe.current = client.listen(handleMessage);
            }
            unsubscribeClientListeners.current[clientId] = unsubscribeClientListeners.current[clientId] || {};
            if (queuedListeners.current[clientId]) {
              Object.keys(queuedListeners.current[clientId]).forEach(function(listenerId) {
                var listener = queuedListeners.current[clientId][listenerId];
                var unsubscribe2 = client.listen(listener);
                unsubscribeClientListeners.current[clientId][listenerId] = unsubscribe2;
              });
              queuedListeners.current[clientId] = {};
            }
            globalListeners = Object.entries(queuedListeners.current.global);
            globalListeners.forEach(function(_a4) {
              var listenerId = _a4[0], listener = _a4[1];
              var unsubscribe2 = client.listen(listener);
              unsubscribeClientListeners.current[clientId][listenerId] = unsubscribe2;
            });
            clients.current[clientId] = client;
            return [2];
        }
      });
    });
  }, [filesState.environment, filesState.files, state.reactDevTools]);
  var unregisterAllClients = reactExports.useCallback(function() {
    Object.keys(clients.current).map(unregisterBundler);
    if (typeof unsubscribe.current === "function") {
      unsubscribe.current();
      unsubscribe.current = void 0;
    }
  }, []);
  var runSandpack = reactExports.useCallback(function() {
    return __awaiter(void 0, void 0, void 0, function() {
      return __generator(this, function(_a3) {
        switch (_a3.label) {
          case 0:
            return [4, Promise.all(Object.entries(registeredIframes.current).map(function(_a4) {
              var clientId = _a4[0], _b2 = _a4[1], iframe = _b2.iframe, _c22 = _b2.clientPropsOverride, clientPropsOverride = _c22 === void 0 ? {} : _c22;
              return __awaiter(void 0, void 0, void 0, function() {
                return __generator(this, function(_d2) {
                  switch (_d2.label) {
                    case 0:
                      return [4, createClient(iframe, clientId, clientPropsOverride)];
                    case 1:
                      _d2.sent();
                      return [2];
                  }
                });
              });
            }))];
          case 1:
            _a3.sent();
            setState(function(prev) {
              return __assign(__assign({}, prev), {
                error: null,
                status: "running"
              });
            });
            return [2];
        }
      });
    });
  }, [createClient]);
  intersectionObserverCallback.current = function(entries2) {
    if (entries2.some(function(entry) {
      return entry.isIntersecting;
    })) {
      runSandpack();
    } else {
      unregisterAllClients();
    }
  };
  var initializeSandpackIframe = reactExports.useCallback(function() {
    var _a3, _b2, _c22;
    var autorun = (_a3 = options === null || options === void 0 ? void 0 : options.autorun) !== null && _a3 !== void 0 ? _a3 : true;
    if (!autorun) {
      return;
    }
    var observerOptions = (_b2 = options === null || options === void 0 ? void 0 : options.initModeObserverOptions) !== null && _b2 !== void 0 ? _b2 : {
      rootMargin: "1000px 0px"
    };
    if (intersectionObserver.current && lazyAnchorRef.current) {
      (_c22 = intersectionObserver.current) === null || _c22 === void 0 ? void 0 : _c22.unobserve(lazyAnchorRef.current);
    }
    if (lazyAnchorRef.current && state.initMode === "lazy") {
      intersectionObserver.current = new IntersectionObserver(function(entries2) {
        var _a4, _b3;
        if (entries2.some(function(entry) {
          return entry.isIntersecting;
        })) {
          if (entries2.some(function(entry) {
            return entry.isIntersecting;
          }) && lazyAnchorRef.current) {
            (_a4 = intersectionObserverCallback.current) === null || _a4 === void 0 ? void 0 : _a4.call(intersectionObserverCallback, entries2);
            (_b3 = intersectionObserver.current) === null || _b3 === void 0 ? void 0 : _b3.unobserve(lazyAnchorRef.current);
          }
        }
      }, observerOptions);
      intersectionObserver.current.observe(lazyAnchorRef.current);
    } else if (lazyAnchorRef.current && state.initMode === "user-visible") {
      intersectionObserver.current = new IntersectionObserver(function(entries2) {
        var _a4;
        (_a4 = intersectionObserverCallback.current) === null || _a4 === void 0 ? void 0 : _a4.call(intersectionObserverCallback, entries2);
      }, observerOptions);
      intersectionObserver.current.observe(lazyAnchorRef.current);
    } else {
      runSandpack();
    }
  }, [options === null || options === void 0 ? void 0 : options.autorun, options === null || options === void 0 ? void 0 : options.initModeObserverOptions, runSandpack, state.initMode, unregisterAllClients]);
  var registerBundler = reactExports.useCallback(function(iframe, clientId, clientPropsOverride) {
    return __awaiter(void 0, void 0, void 0, function() {
      return __generator(this, function(_a3) {
        switch (_a3.label) {
          case 0:
            registeredIframes.current[clientId] = {
              iframe,
              clientPropsOverride
            };
            if (!(state.status === "running")) return [3, 2];
            return [4, createClient(iframe, clientId, clientPropsOverride)];
          case 1:
            _a3.sent();
            _a3.label = 2;
          case 2:
            return [2];
        }
      });
    });
  }, [createClient, state.status]);
  var unregisterBundler = function(clientId) {
    var _a3, _b2;
    var client = clients.current[clientId];
    if (client) {
      client.destroy();
      (_a3 = client.iframe.contentWindow) === null || _a3 === void 0 ? void 0 : _a3.location.replace("about:blank");
      client.iframe.removeAttribute("src");
      delete clients.current[clientId];
    } else {
      delete registeredIframes.current[clientId];
    }
    if (timeoutHook.current) {
      clearTimeout(timeoutHook.current);
    }
    var unsubscribeQueuedClients = Object.values((_b2 = unsubscribeClientListeners.current[clientId]) !== null && _b2 !== void 0 ? _b2 : {});
    unsubscribeQueuedClients.forEach(function(listenerOfClient) {
      var listenerFunctions = Object.values(listenerOfClient);
      listenerFunctions.forEach(function(unsubscribe2) {
        return unsubscribe2();
      });
    });
    var status = Object.keys(clients.current).length > 0 ? "running" : "idle";
    setState(function(prev) {
      return __assign(__assign({}, prev), {
        status
      });
    });
  };
  var handleMessage = function(msg) {
    if (msg.type === "start") {
      setState(function(prev) {
        return __assign(__assign({}, prev), {
          error: null
        });
      });
    } else if (msg.type === "state") {
      setState(function(prev) {
        return __assign(__assign({}, prev), {
          bundlerState: msg.state
        });
      });
    } else if (msg.type === "done" && !msg.compilatonError || msg.type === "connected") {
      if (timeoutHook.current) {
        clearTimeout(timeoutHook.current);
      }
      setState(function(prev) {
        return __assign(__assign({}, prev), {
          error: null
        });
      });
    } else if (msg.type === "action" && msg.action === "show-error") {
      if (timeoutHook.current) {
        clearTimeout(timeoutHook.current);
      }
      setState(function(prev) {
        return __assign(__assign({}, prev), {
          error: extractErrorDetails(msg)
        });
      });
    } else if (msg.type === "action" && msg.action === "notification" && msg.notificationType === "error") {
      setState(function(prev) {
        return __assign(__assign({}, prev), {
          error: {
            message: msg.title
          }
        });
      });
    }
  };
  var registerReactDevTools = function(value) {
    setState(function(prev) {
      return __assign(__assign({}, prev), {
        reactDevTools: value
      });
    });
  };
  var recompileMode = (_c2 = options === null || options === void 0 ? void 0 : options.recompileMode) !== null && _c2 !== void 0 ? _c2 : "delayed";
  var recompileDelay = (_d = options === null || options === void 0 ? void 0 : options.recompileDelay) !== null && _d !== void 0 ? _d : 200;
  var dispatchMessage = function(message, clientId) {
    if (state.status !== "running") {
      console.warn("[sandpack-react]: dispatch cannot be called while in idle mode");
      return;
    }
    if (clientId) {
      clients.current[clientId].dispatch(message);
    } else {
      Object.values(clients.current).forEach(function(client) {
        client.dispatch(message);
      });
    }
  };
  var addListener = function(listener, clientId) {
    if (clientId) {
      if (clients.current[clientId]) {
        var unsubscribeListener = clients.current[clientId].listen(listener);
        return unsubscribeListener;
      } else {
        var listenerId_1 = generateRandomId$1();
        queuedListeners.current[clientId] = queuedListeners.current[clientId] || {};
        unsubscribeClientListeners.current[clientId] = unsubscribeClientListeners.current[clientId] || {};
        queuedListeners.current[clientId][listenerId_1] = listener;
        var unsubscribeListener = function() {
          if (queuedListeners.current[clientId][listenerId_1]) {
            delete queuedListeners.current[clientId][listenerId_1];
          } else if (unsubscribeClientListeners.current[clientId][listenerId_1]) {
            unsubscribeClientListeners.current[clientId][listenerId_1]();
            delete unsubscribeClientListeners.current[clientId][listenerId_1];
          }
        };
        return unsubscribeListener;
      }
    } else {
      var listenerId_2 = generateRandomId$1();
      queuedListeners.current.global[listenerId_2] = listener;
      var clientsList = Object.values(clients.current);
      var currentClientUnsubscribeListeners_1 = clientsList.map(function(client) {
        return client.listen(listener);
      });
      var unsubscribeListener = function() {
        currentClientUnsubscribeListeners_1.forEach(function(unsubscribe2) {
          return unsubscribe2();
        });
        delete queuedListeners.current.global[listenerId_2];
        Object.values(unsubscribeClientListeners.current).forEach(function(client) {
          var _a3;
          (_a3 = client === null || client === void 0 ? void 0 : client[listenerId_2]) === null || _a3 === void 0 ? void 0 : _a3.call(client);
        });
      };
      return unsubscribeListener;
    }
  };
  reactExports.useEffect(function watchFileChanges() {
    if (state.status !== "running" || !filesState.shouldUpdatePreview) {
      return;
    }
    if (prevEnvironment.current !== filesState.environment) {
      prevEnvironment.current = filesState.environment;
      Object.entries(clients.current).forEach(function(_a3) {
        var key = _a3[0], client = _a3[1];
        registerBundler(client.iframe, key);
      });
    }
    if (recompileMode === "immediate") {
      Object.values(clients.current).forEach(function(client) {
        if (client.status === "done") {
          client.updateSandbox({
            files: filesState.files,
            template: filesState.environment
          });
        }
      });
    }
    if (recompileMode === "delayed") {
      if (typeof window === "undefined") return;
      window.clearTimeout(debounceHook.current);
      debounceHook.current = window.setTimeout(function() {
        Object.values(clients.current).forEach(function(client) {
          if (client.status === "done") {
            client.updateSandbox({
              files: filesState.files,
              template: filesState.environment
            });
          }
        });
      }, recompileDelay);
    }
    return function() {
      window.clearTimeout(debounceHook.current);
    };
  }, [filesState.files, filesState.environment, filesState.shouldUpdatePreview, recompileDelay, recompileMode, registerBundler, state.status]);
  reactExports.useEffect(function watchInitMode() {
    if (initModeFromProps !== state.initMode) {
      setState(function(prev) {
        return __assign(__assign({}, prev), {
          initMode: initModeFromProps
        });
      });
      initializeSandpackIframe();
    }
  }, [initModeFromProps, initializeSandpackIframe, state.initMode]);
  reactExports.useEffect(function() {
    return function unmountClient() {
      if (typeof unsubscribe.current === "function") {
        unsubscribe.current();
      }
      if (timeoutHook.current) {
        clearTimeout(timeoutHook.current);
      }
      if (debounceHook.current) {
        clearTimeout(debounceHook.current);
      }
      if (intersectionObserver.current) {
        intersectionObserver.current.disconnect();
      }
    };
  }, []);
  return [state, {
    clients: clients.current,
    initializeSandpackIframe,
    runSandpack,
    registerBundler,
    unregisterBundler,
    registerReactDevTools,
    addListener,
    dispatchMessage,
    lazyAnchorRef,
    unsubscribeClientListenersRef: unsubscribeClientListeners,
    queuedListenersRef: queuedListeners
  }];
};
var useFiles = function(props) {
  var originalStateFromProps = getSandpackStateFromProps(props);
  var _a2 = reactExports.useState(originalStateFromProps), state = _a2[0], setState = _a2[1];
  var isMountedRef = reactExports.useRef(false);
  reactExports.useEffect(function() {
    if (isMountedRef.current) {
      setState(getSandpackStateFromProps(props));
    } else {
      isMountedRef.current = true;
    }
  }, [props.files, props.customSetup, props.template]);
  var updateFile = function(pathOrFiles, code, shouldUpdatePreview) {
    if (shouldUpdatePreview === void 0) {
      shouldUpdatePreview = true;
    }
    setState(function(prev) {
      var _a3;
      var files = prev.files;
      if (typeof pathOrFiles === "string" && typeof code === "string") {
        files = __assign(__assign({}, files), (_a3 = {}, _a3[pathOrFiles] = __assign(__assign({}, files[pathOrFiles]), {
          code
        }), _a3));
      } else if (typeof pathOrFiles === "object") {
        files = __assign(__assign({}, files), convertedFilesToBundlerFiles(pathOrFiles));
      }
      return __assign(__assign({}, prev), {
        files: normalizePath(files),
        shouldUpdatePreview
      });
    });
  };
  var operations = {
    openFile: function(path) {
      setState(function(_a3) {
        var visibleFiles = _a3.visibleFiles, rest = __rest(_a3, ["visibleFiles"]);
        var newPaths = visibleFiles.includes(path) ? visibleFiles : __spreadArray(__spreadArray([], visibleFiles, true), [path], false);
        return __assign(__assign({}, rest), {
          activeFile: path,
          visibleFiles: newPaths
        });
      });
    },
    resetFile: function(path) {
      setState(function(prevState) {
        var _a3;
        return __assign(__assign({}, prevState), {
          files: __assign(__assign({}, prevState.files), (_a3 = {}, _a3[path] = originalStateFromProps.files[path], _a3))
        });
      });
    },
    resetAllFiles: function() {
      setState(function(prev) {
        return __assign(__assign({}, prev), {
          files: originalStateFromProps.files
        });
      });
    },
    setActiveFile: function(activeFile) {
      if (state.files[activeFile]) {
        setState(function(prev) {
          return __assign(__assign({}, prev), {
            activeFile
          });
        });
      }
    },
    updateCurrentFile: function(code, shouldUpdatePreview) {
      if (shouldUpdatePreview === void 0) {
        shouldUpdatePreview = true;
      }
      updateFile(state.activeFile, code, shouldUpdatePreview);
    },
    updateFile,
    addFile: updateFile,
    closeFile: function(path) {
      if (state.visibleFiles.length === 1) {
        return;
      }
      setState(function(_a3) {
        var visibleFiles = _a3.visibleFiles, activeFile = _a3.activeFile, prev = __rest(_a3, ["visibleFiles", "activeFile"]);
        var indexOfRemovedPath = visibleFiles.indexOf(path);
        var newPaths = visibleFiles.filter(function(openPath) {
          return openPath !== path;
        });
        return __assign(__assign({}, prev), {
          activeFile: path === activeFile ? indexOfRemovedPath === 0 ? visibleFiles[1] : visibleFiles[indexOfRemovedPath - 1] : activeFile,
          visibleFiles: newPaths
        });
      });
    },
    deleteFile: function(path, shouldUpdatePreview) {
      if (shouldUpdatePreview === void 0) {
        shouldUpdatePreview = true;
      }
      setState(function(_a3) {
        var visibleFiles = _a3.visibleFiles, files = _a3.files, activeFile = _a3.activeFile, rest = __rest(_a3, ["visibleFiles", "files", "activeFile"]);
        var newFiles = __assign({}, files);
        delete newFiles[path];
        var remainingVisibleFiles = visibleFiles.filter(function(openPath) {
          return openPath !== path;
        });
        var deletedLastVisibleFile = remainingVisibleFiles.length === 0;
        if (deletedLastVisibleFile) {
          var nextFile = Object.keys(files)[Object.keys(files).length - 1];
          return __assign(__assign({}, rest), {
            visibleFiles: [nextFile],
            activeFile: nextFile,
            files: newFiles,
            shouldUpdatePreview
          });
        }
        return __assign(__assign({}, rest), {
          visibleFiles: remainingVisibleFiles,
          activeFile: path === activeFile ? remainingVisibleFiles[remainingVisibleFiles.length - 1] : activeFile,
          files: newFiles,
          shouldUpdatePreview
        });
      });
    }
  };
  return [__assign(__assign({}, state), {
    visibleFilesFromProps: originalStateFromProps.visibleFiles
  }), operations];
};
var Sandpack$1 = reactExports.createContext(null);
var SandpackProvider = function(props) {
  var _a2, _b, _c2;
  var children = props.children, options = props.options, style = props.style, className = props.className, theme = props.theme;
  var _d = useFiles(props), fileState = _d[0], fileOperations = _d[1];
  var _e = useClient(props, fileState), clientState = _e[0], _f = _e[1], dispatchMessage = _f.dispatchMessage, addListener = _f.addListener, clientOperations = __rest(_f, ["dispatchMessage", "addListener"]);
  var appState = useAppState(props, fileState.files);
  reactExports.useEffect(function() {
    clientOperations.initializeSandpackIframe();
  }, []);
  return jsxRuntimeExports.jsx(Sandpack$1.Provider, {
    value: __assign(__assign(__assign(__assign(__assign(__assign({}, fileState), clientState), appState), fileOperations), clientOperations), {
      autoReload: (_b = (_a2 = props.options) === null || _a2 === void 0 ? void 0 : _a2.autoReload) !== null && _b !== void 0 ? _b : true,
      teamId: props === null || props === void 0 ? void 0 : props.teamId,
      exportOptions: (_c2 = props === null || props === void 0 ? void 0 : props.customSetup) === null || _c2 === void 0 ? void 0 : _c2.exportOptions,
      listen: addListener,
      dispatch: dispatchMessage
    }),
    children: jsxRuntimeExports.jsx(ClassNamesProvider, {
      classes: options === null || options === void 0 ? void 0 : options.classes,
      children: jsxRuntimeExports.jsx(SandpackThemeProvider, {
        className,
        style,
        theme,
        children
      })
    })
  });
};
Sandpack$1.Consumer;
function useSandpack() {
  var sandpack = reactExports.useContext(Sandpack$1);
  if (sandpack === null) {
    throw new Error('[sandpack-react]: "useSandpack" must be wrapped by a "SandpackProvider"');
  }
  var dispatch = sandpack.dispatch, listen = sandpack.listen, rest = __rest(sandpack, ["dispatch", "listen"]);
  return {
    sandpack: __assign({}, rest),
    dispatch,
    listen
  };
}
var useActiveCode = function() {
  var _a2, _b, _c2;
  var sandpack = useSandpack().sandpack;
  return {
    code: (_a2 = sandpack.files[sandpack.activeFile]) === null || _a2 === void 0 ? void 0 : _a2.code,
    readOnly: (_c2 = (_b = sandpack.files[sandpack.activeFile]) === null || _b === void 0 ? void 0 : _b.readOnly) !== null && _c2 !== void 0 ? _c2 : false,
    updateCode: sandpack.updateCurrentFile
  };
};
var iconStandaloneClassName = fakeCss;
var buttonClassName = fakeCss;
var roundedButtonClassName = fakeCss;
var iconClassName = fakeCss;
keyframes({
  "0%": {
    opacity: 0
  },
  "100%": {
    opacity: 1
  }
});
var absoluteClassName = fakeCss;
var errorClassName = fakeCss;
var errorBundlerClassName = fakeCss;
var errorMessageClassName = fakeCss;
var tabsClassName = fakeCss;
var tabsScrollableClassName = fakeCss;
var tabContainer = fakeCss;
var closeButtonClassName = fakeCss;
var tabButton = fakeCss;
var FileTabs = function(_a2) {
  var closableTabs = _a2.closableTabs, className = _a2.className, activeFileUniqueId = _a2.activeFileUniqueId, props = __rest(_a2, ["closableTabs", "className", "activeFileUniqueId"]);
  var sandpack = useSandpack().sandpack;
  var classNames = useClassNames();
  var activeFile = sandpack.activeFile, visibleFiles = sandpack.visibleFiles, setActiveFile = sandpack.setActiveFile;
  var _b = reactExports.useState(null), hoveredIndex = _b[0], setIsHoveredIndex = _b[1];
  var getTriggerText = function(currentPath) {
    var documentFileName = getFileName(currentPath);
    var pathsWithDuplicateFileNames = visibleFiles.reduce(function(prev, curr) {
      if (curr === currentPath) {
        return prev;
      }
      var fileName = getFileName(curr);
      if (fileName === documentFileName) {
        prev.push(curr);
        return prev;
      }
      return prev;
    }, []);
    if (pathsWithDuplicateFileNames.length === 0) {
      return documentFileName;
    } else {
      return calculateNearestUniquePath(currentPath, pathsWithDuplicateFileNames);
    }
  };
  var onKeyDown = function(_a3) {
    var _b2, _c2, _d, _e;
    var e = _a3.e, index2 = _a3.index;
    var target = e.currentTarget;
    switch (e.key) {
      case "ArrowLeft":
        {
          var leftSibling = target.previousElementSibling;
          if (leftSibling) {
            (_b2 = leftSibling.querySelector("button")) === null || _b2 === void 0 ? void 0 : _b2.focus();
            setActiveFile(visibleFiles[index2 - 1]);
          }
        }
        break;
      case "ArrowRight":
        {
          var rightSibling = target.nextElementSibling;
          if (rightSibling) {
            (_c2 = rightSibling.querySelector("button")) === null || _c2 === void 0 ? void 0 : _c2.focus();
            setActiveFile(visibleFiles[index2 + 1]);
          }
        }
        break;
      case "Home": {
        var parent_1 = target.parentElement;
        var firstChild = parent_1.firstElementChild;
        (_d = firstChild.querySelector("button")) === null || _d === void 0 ? void 0 : _d.focus();
        setActiveFile(visibleFiles[0]);
        break;
      }
      case "End": {
        var parent_2 = target.parentElement;
        var lastChild = parent_2.lastElementChild;
        (_e = lastChild.querySelector("button")) === null || _e === void 0 ? void 0 : _e.focus();
        setActiveFile(visibleFiles[-1]);
        break;
      }
    }
  };
  return jsxRuntimeExports.jsx("div", __assign({
    className: classNames("tabs", [tabsClassName, className]),
    translate: "no"
  }, props, {
    children: jsxRuntimeExports.jsx("div", {
      "aria-label": "Select active file",
      className: classNames("tabs-scrollable-container", [tabsScrollableClassName]),
      role: "tablist",
      children: visibleFiles.map(function(filePath, index2) {
        return jsxRuntimeExports.jsxs("div", {
          "aria-controls": "".concat(filePath, "-").concat(activeFileUniqueId, "-tab-panel"),
          "aria-selected": filePath === activeFile,
          className: classNames("tab-container", [tabContainer]),
          onKeyDown: function(e) {
            return onKeyDown({
              e,
              index: index2
            });
          },
          onMouseEnter: function() {
            return setIsHoveredIndex(index2);
          },
          onMouseLeave: function() {
            return setIsHoveredIndex(null);
          },
          role: "tab",
          children: [jsxRuntimeExports.jsx("button", {
            className: classNames("tab-button", [buttonClassName, tabButton]),
            "data-active": filePath === activeFile,
            id: "".concat(filePath, "-").concat(activeFileUniqueId, "-tab"),
            onClick: function() {
              return setActiveFile(filePath);
            },
            tabIndex: filePath === activeFile ? 0 : -1,
            title: filePath,
            type: "button",
            children: getTriggerText(filePath)
          }), closableTabs && visibleFiles.length > 1 && jsxRuntimeExports.jsx("span", {
            className: classNames("close-button", [closeButtonClassName]),
            onClick: function(ev) {
              ev.stopPropagation();
              sandpack.closeFile(filePath);
            },
            style: {
              visibility: filePath === activeFile || hoveredIndex === index2 ? "visible" : "hidden"
            },
            tabIndex: filePath === activeFile ? 0 : -1,
            children: jsxRuntimeExports.jsx(CloseIcon, {})
          })]
        }, filePath);
      })
    })
  }));
};
var RoundedButton = function(_a2) {
  var onClick = _a2.onClick, className = _a2.className, children = _a2.children;
  var classNames = useClassNames();
  return jsxRuntimeExports.jsx("button", {
    className: classNames("button", [classNames("icon-standalone"), buttonClassName, iconStandaloneClassName, roundedButtonClassName, className]),
    onClick,
    type: "button",
    children
  });
};
var runButtonClassName = fakeCss;
var RunButton$1 = function(_a2) {
  var onClick = _a2.onClick, props = __rest(_a2, ["className", "onClick"]);
  var sandpack = useSandpack().sandpack;
  return jsxRuntimeExports.jsxs(RoundedButton, __assign({
    className: runButtonClassName.toString(),
    onClick: function(event) {
      sandpack.runSandpack();
      onClick === null || onClick === void 0 ? void 0 : onClick(event);
    }
  }, props, {
    children: [jsxRuntimeExports.jsx(RunIcon, {}), jsxRuntimeExports.jsx("span", {
      children: "Run"
    })]
  }));
};
var stackClassName = fakeCss;
var SandpackStack = function(_a2) {
  var className = _a2.className, props = __rest(_a2, ["className"]);
  var classNames = useClassNames();
  return jsxRuntimeExports.jsx("div", __assign({
    className: classNames("stack", [stackClassName, className])
  }, props));
};
var useSandpackTheme = function() {
  var _a2 = reactExports.useContext(SandpackThemeContext), theme = _a2.theme, id = _a2.id, mode = _a2.mode;
  return {
    theme,
    themeId: id,
    themeMode: mode
  };
};
var shallowEqual = function(a, b) {
  if (a.length !== b.length) return false;
  var result = true;
  for (var index2 = 0; index2 < a.length; index2++) {
    if (a[index2] !== b[index2]) {
      result = false;
      break;
    }
  }
  return result;
};
var getCodeMirrorPosition = function(doc, _a2) {
  var line = _a2.line, column = _a2.column;
  return doc.line(line).from + (column !== null && column !== void 0 ? column : 0) - 1;
};
var getEditorTheme = function() {
  return EditorView.theme({
    "&": {
      backgroundColor: "var(--".concat(THEME_PREFIX, "-colors-surface1)"),
      color: "var(--".concat(THEME_PREFIX, "-syntax-color-plain)"),
      height: "100%"
    },
    ".cm-matchingBracket, .cm-nonmatchingBracket, &.cm-focused .cm-matchingBracket, &.cm-focused .cm-nonmatchingBracket": {
      color: "inherit",
      backgroundColor: "rgba(128,128,128,.25)",
      backgroundBlendMode: "difference"
    },
    "&.cm-editor.cm-focused": {
      outline: "none"
    },
    "& .cm-activeLine": {
      backgroundColor: "transparent"
    },
    "&.cm-editor.cm-focused .cm-activeLine": {
      backgroundColor: "var(--".concat(THEME_PREFIX, "-colors-surface3)"),
      borderRadius: "var(--".concat(THEME_PREFIX, "-border-radius)")
    },
    ".cm-errorLine": {
      backgroundColor: "var(--".concat(THEME_PREFIX, "-colors-errorSurface)"),
      borderRadius: "var(--".concat(THEME_PREFIX, "-border-radius)")
    },
    ".cm-content": {
      caretColor: "var(--".concat(THEME_PREFIX, "-colors-accent)"),
      padding: "0 var(--".concat(THEME_PREFIX, "-space-4)")
    },
    ".cm-scroller": {
      fontFamily: "var(--".concat(THEME_PREFIX, "-font-mono)"),
      lineHeight: "var(--".concat(THEME_PREFIX, "-font-lineHeight)")
    },
    ".cm-gutters": {
      backgroundColor: "var(--".concat(THEME_PREFIX, "-colors-surface1)"),
      color: "var(--".concat(THEME_PREFIX, "-colors-disabled)"),
      border: "none",
      paddingLeft: "var(--".concat(THEME_PREFIX, "-space-1)")
    },
    ".cm-gutter.cm-lineNumbers": {
      fontSize: ".6em"
    },
    ".cm-lineNumbers .cm-gutterElement": {
      lineHeight: "var(--".concat(THEME_PREFIX, "-font-lineHeight)"),
      minWidth: "var(--".concat(THEME_PREFIX, "-space-5)")
    },
    ".cm-content .cm-line": {
      paddingLeft: "var(--".concat(THEME_PREFIX, "-space-1)")
    },
    ".cm-content.cm-readonly .cm-line": {
      paddingLeft: 0
    }
  });
};
var classNameToken = function(name) {
  return "".concat(THEME_PREFIX, "-syntax-").concat(name);
};
var getSyntaxHighlight = function(theme) {
  return HighlightStyle.define([{
    tag: tags.link,
    textDecoration: "underline"
  }, {
    tag: tags.emphasis,
    fontStyle: "italic"
  }, {
    tag: tags.strong,
    fontWeight: "bold"
  }, {
    tag: tags.keyword,
    class: classNameToken("keyword")
  }, {
    tag: [tags.atom, tags.number, tags.bool],
    class: classNameToken("static")
  }, {
    tag: tags.variableName,
    class: classNameToken("plain")
  }, {
    tag: tags.standard(tags.tagName),
    class: classNameToken("tag")
  }, {
    tag: [tags.function(tags.variableName), tags.definition(tags.function(tags.variableName)), tags.tagName],
    class: classNameToken("definition")
  }, {
    tag: tags.propertyName,
    class: classNameToken("property")
  }, {
    tag: [tags.literal, tags.inserted],
    class: classNameToken(theme.syntax.string ? "string" : "static")
  }, {
    tag: tags.punctuation,
    class: classNameToken("punctuation")
  }, {
    tag: [tags.comment, tags.quote],
    class: classNameToken("comment")
  }]);
};
var getLanguageFromFile = function(filePath, fileType, additionalLanguages) {
  if (!filePath && !fileType) return "javascript";
  var extension = fileType;
  if (!extension && filePath) {
    var extensionDotIndex = filePath.lastIndexOf(".");
    extension = filePath.slice(extensionDotIndex + 1);
  }
  for (var _i = 0, additionalLanguages_1 = additionalLanguages; _i < additionalLanguages_1.length; _i++) {
    var additionalLanguage = additionalLanguages_1[_i];
    if (extension === additionalLanguage.name || additionalLanguage.extensions.includes(extension || "")) {
      return additionalLanguage.name;
    }
  }
  switch (extension) {
    case "ts":
    case "tsx":
      return "typescript";
    case "html":
    case "svelte":
    case "vue":
    case "astro":
      return "html";
    case "css":
    case "less":
    case "scss":
      return "css";
    case "js":
    case "jsx":
    case "json":
    default:
      return "javascript";
  }
};
var getCodeMirrorLanguage = function(extension, additionalLanguages) {
  var options = {
    javascript: javascript({
      jsx: true,
      typescript: false
    }),
    typescript: javascript({
      jsx: true,
      typescript: true
    }),
    html: html(),
    css: css$1()
  };
  for (var _i = 0, additionalLanguages_2 = additionalLanguages; _i < additionalLanguages_2.length; _i++) {
    var additionalLanguage = additionalLanguages_2[_i];
    if (extension === additionalLanguage.name) {
      return additionalLanguage.language;
    }
  }
  return options[extension];
};
var useCombinedRefs = function() {
  var refs = [];
  for (var _i = 0; _i < arguments.length; _i++) {
    refs[_i] = arguments[_i];
  }
  return reactExports.useCallback(function(element) {
    return refs.forEach(function(ref) {
      if (!ref) {
        return;
      }
      if (typeof ref === "function") {
        return ref(element);
      }
      ref.current = element;
    });
  }, refs);
};
function highlightDecorators(positions) {
  return ViewPlugin.fromClass(function() {
    function class_1(view) {
      this.decorations = this.getDecoration(view);
    }
    class_1.prototype.update = function(update) {
      return;
    };
    class_1.prototype.getDecoration = function(view) {
      if (!positions) return Decoration.none;
      var rangesDecorators = positions.map(function(item) {
        var _a2, _b, _c2;
        var lineDeco2 = Decoration.line({
          attributes: {
            class: (_a2 = item.className) !== null && _a2 !== void 0 ? _a2 : ""
          }
        });
        var markDeco = Decoration.mark({
          class: (_b = item.className) !== null && _b !== void 0 ? _b : "",
          attributes: (_c2 = item.elementAttributes) !== null && _c2 !== void 0 ? _c2 : void 0
        });
        var positionLineStart = getCodeMirrorPosition(view.state.doc, {
          line: item.line,
          column: item.startColumn
        }) + 1;
        if (item.startColumn && item.endColumn) {
          var positionLineEnd = getCodeMirrorPosition(view.state.doc, {
            line: item.line,
            column: item.endColumn
          }) + 1;
          return markDeco.range(positionLineStart, positionLineEnd);
        }
        return lineDeco2.range(positionLineStart);
      });
      return Decoration.set(rangesDecorators);
    };
    return class_1;
  }(), {
    decorations: function(v) {
      return v.decorations;
    }
  });
}
function highlightInlineError() {
  return activeLineHighlighter;
}
var lineDeco = Decoration.line({
  attributes: {
    class: "cm-errorLine"
  }
});
var activeLineHighlighter = ViewPlugin.fromClass(function() {
  function class_1() {
    this.decorations = Decoration.none;
  }
  class_1.prototype.update = function(update) {
    var _this = this;
    update.transactions.forEach(function(trans) {
      var errorValue = trans.annotation("show-error");
      if (errorValue !== void 0) {
        var position = getCodeMirrorPosition(update.view.state.doc, {
          line: errorValue
        }) + 1;
        _this.decorations = Decoration.set([lineDeco.range(position)]);
      } else if (trans.annotation("remove-errors")) {
        _this.decorations = Decoration.none;
      }
    });
  };
  return class_1;
}(), {
  decorations: function(v) {
    return v.decorations;
  }
});
var placeholderClassName = fakeCss;
var tokensClassName = fakeCss;
var editorClassName = fakeCss;
var cmClassName = fakeCss;
var readOnlyClassName = fakeCss;
var useSyntaxHighlight = function(_a2) {
  var langSupport = _a2.langSupport, highlightTheme = _a2.highlightTheme, _b = _a2.code, code = _b === void 0 ? "" : _b;
  var tree = langSupport.language.parser.parse(code);
  var offSet = 0;
  var codeElementsRender = [];
  var addElement = function(to, className) {
    if (to > offSet) {
      var children = code.slice(offSet, to);
      codeElementsRender.push(className ? reactExports.createElement("span", {
        children,
        className,
        key: "".concat(to).concat(offSet)
      }) : children);
      offSet = to;
    }
  };
  highlightTree(tree, highlightTheme, function(from, to, className) {
    addElement(from, "");
    addElement(to, className);
  });
  if (offSet < code.length && (code === null || code === void 0 ? void 0 : code.includes("\n"))) {
    codeElementsRender.push("\n\n");
  }
  return codeElementsRender;
};
var CodeMirror = reactExports.forwardRef(function(_a2, ref) {
  var _b = _a2.code, code = _b === void 0 ? "" : _b, filePath = _a2.filePath, fileType = _a2.fileType, onCodeUpdate = _a2.onCodeUpdate, _c2 = _a2.showLineNumbers, showLineNumbers = _c2 === void 0 ? false : _c2, _d = _a2.showInlineErrors, showInlineErrors = _d === void 0 ? false : _d, _e = _a2.wrapContent, wrapContent = _e === void 0 ? false : _e, _f = _a2.editorState, editorState = _f === void 0 ? "pristine" : _f, _g = _a2.readOnly, readOnly = _g === void 0 ? false : _g, _h = _a2.showReadOnly, showReadOnly = _h === void 0 ? true : _h, decorators = _a2.decorators, _j = _a2.initMode, initMode = _j === void 0 ? "lazy" : _j, _k = _a2.extensions, extensions = _k === void 0 ? [] : _k, _l = _a2.extensionsKeymap, extensionsKeymap = _l === void 0 ? [] : _l, _m = _a2.additionalLanguages, additionalLanguages = _m === void 0 ? [] : _m;
  var wrapper = reactExports.useRef(null);
  var combinedRef = useCombinedRefs(wrapper, ref);
  var cmView = reactExports.useRef();
  var _o = useSandpackTheme(), theme = _o.theme, themeId = _o.themeId;
  var _p = reactExports.useState(code), internalCode = _p[0], setInternalCode = _p[1];
  var _q = reactExports.useState(initMode === "immediate"), shouldInitEditor = _q[0], setShouldInitEditor = _q[1];
  var classNames = useClassNames();
  var _r = useSandpack(), listen = _r.listen, autoReload = _r.sandpack.autoReload;
  var prevExtension = reactExports.useRef([]);
  var prevExtensionKeymap = reactExports.useRef([]);
  var isIntersecting = useIntersectionObserver(wrapper, {
    rootMargin: "600px 0px",
    threshold: 0.2
  }).isIntersecting;
  reactExports.useImperativeHandle(ref, function() {
    return {
      getCodemirror: function() {
        return cmView.current;
      }
    };
  });
  reactExports.useEffect(function() {
    var mode = initMode === "lazy" || initMode === "user-visible";
    if (mode && isIntersecting) {
      setShouldInitEditor(true);
    }
  }, [initMode, isIntersecting]);
  var languageExtension = getLanguageFromFile(filePath, fileType, additionalLanguages);
  var langSupport = getCodeMirrorLanguage(languageExtension, additionalLanguages);
  var highlightTheme = getSyntaxHighlight(theme);
  var syntaxHighlightRender = useSyntaxHighlight({
    langSupport,
    highlightTheme,
    code
  });
  var sortedDecorators = reactExports.useMemo(function() {
    return decorators ? decorators.sort(function(d1, d2) {
      return d1.line - d2.line;
    }) : decorators;
  }, [decorators]);
  var useStaticReadOnly = readOnly && (decorators === null || decorators === void 0 ? void 0 : decorators.length) === 0;
  reactExports.useEffect(function() {
    if (!wrapper.current || !shouldInitEditor || useStaticReadOnly) {
      return;
    }
    var parentDiv = wrapper.current;
    var existingPlaceholder = parentDiv.querySelector(".sp-pre-placeholder");
    if (existingPlaceholder) {
      parentDiv.removeChild(existingPlaceholder);
    }
    var view = new EditorView({
      doc: code,
      extensions: [],
      parent: parentDiv
    });
    view.contentDOM.setAttribute("data-gramm", "false");
    view.contentDOM.setAttribute("data-lt-active", "false");
    view.contentDOM.setAttribute("aria-label", filePath ? "Code Editor for ".concat(getFileName(filePath)) : "Code Editor");
    view.contentDOM.setAttribute("tabIndex", "-1");
    cmView.current = view;
    return function() {
      var _a3;
      (_a3 = cmView.current) === null || _a3 === void 0 ? void 0 : _a3.destroy();
    };
  }, [shouldInitEditor, readOnly, useStaticReadOnly]);
  reactExports.useEffect(function() {
    if (useStaticReadOnly) {
      return;
    }
    if (cmView.current) {
      var customCommandsKeymap = [{
        key: "Tab",
        run: function(view) {
          var _a3, _b2;
          indentMore(view);
          var customKey = extensionsKeymap.find(function(_a4) {
            var key = _a4.key;
            return key === "Tab";
          });
          return (_b2 = (_a3 = customKey === null || customKey === void 0 ? void 0 : customKey.run) === null || _a3 === void 0 ? void 0 : _a3.call(customKey, view)) !== null && _b2 !== void 0 ? _b2 : true;
        }
      }, {
        key: "Shift-Tab",
        run: function(view) {
          var _a3, _b2;
          indentLess({
            state: view.state,
            dispatch: view.dispatch
          });
          var customKey = extensionsKeymap.find(function(_a4) {
            var key = _a4.key;
            return key === "Shift-Tab";
          });
          return (_b2 = (_a3 = customKey === null || customKey === void 0 ? void 0 : customKey.run) === null || _a3 === void 0 ? void 0 : _a3.call(customKey, view)) !== null && _b2 !== void 0 ? _b2 : true;
        }
      }, {
        key: "Escape",
        run: function() {
          if (readOnly) return true;
          if (wrapper.current) {
            wrapper.current.focus();
          }
          return true;
        }
      }, {
        key: "mod-Backspace",
        run: deleteGroupBackward
      }];
      var extensionList = __spreadArray(__spreadArray([highlightSpecialChars(), history$1(), closeBrackets()], extensions, true), [keymap.of(__spreadArray(__spreadArray(__spreadArray(__spreadArray(__spreadArray([], closeBracketsKeymap, true), defaultKeymap, true), historyKeymap, true), customCommandsKeymap, true), extensionsKeymap, true)), langSupport, getEditorTheme(), syntaxHighlighting(highlightTheme), EditorView.updateListener.of(function(update) {
        if (update.docChanged) {
          var newCode = update.state.doc.toString();
          setInternalCode(newCode);
          onCodeUpdate === null || onCodeUpdate === void 0 ? void 0 : onCodeUpdate(newCode);
        }
      })], false);
      if (readOnly) {
        extensionList.push(EditorState.readOnly.of(true));
        extensionList.push(EditorView.editable.of(false));
      } else {
        extensionList.push(bracketMatching());
        extensionList.push(highlightActiveLine());
      }
      if (sortedDecorators) {
        extensionList.push(highlightDecorators(sortedDecorators));
      }
      if (wrapContent) {
        extensionList.push(EditorView.lineWrapping);
      }
      if (showLineNumbers) {
        extensionList.push(lineNumbers());
      }
      if (showInlineErrors) {
        extensionList.push(highlightInlineError());
      }
      cmView.current.dispatch({
        effects: StateEffect.reconfigure.of(extensionList)
      });
    }
  }, [shouldInitEditor, sortedDecorators, showLineNumbers, wrapContent, themeId, readOnly, useStaticReadOnly, autoReload]);
  reactExports.useEffect(function applyExtensions() {
    var view = cmView.current;
    var dependenciesAreDiff = !shallowEqual(extensions, prevExtension.current) || !shallowEqual(extensionsKeymap, prevExtensionKeymap.current);
    if (view && dependenciesAreDiff) {
      view.dispatch({
        effects: StateEffect.appendConfig.of(extensions)
      });
      view.dispatch({
        effects: StateEffect.appendConfig.of(keymap.of(__spreadArray([], extensionsKeymap, true)))
      });
      prevExtension.current = extensions;
      prevExtensionKeymap.current = extensionsKeymap;
    }
  }, [extensions, extensionsKeymap]);
  reactExports.useEffect(function() {
    if (cmView.current && editorState === "dirty" && window.matchMedia("(min-width: 768px)").matches) {
      cmView.current.contentDOM.focus();
    }
  }, []);
  reactExports.useEffect(function() {
    if (cmView.current && typeof code === "string" && code !== internalCode) {
      var view = cmView.current;
      var selection = view.state.selection.ranges.some(function(_a3) {
        var to = _a3.to, from = _a3.from;
        return to > code.length || from > code.length;
      }) ? EditorSelection.cursor(code.length) : view.state.selection;
      var changes = {
        from: 0,
        to: view.state.doc.length,
        insert: code
      };
      view.dispatch({
        changes,
        selection
      });
    }
  }, [code]);
  reactExports.useEffect(function messageToInlineError() {
    if (!showInlineErrors) return;
    var unsubscribe = listen(function(message) {
      var view = cmView.current;
      if (message.type === "success") {
        view === null || view === void 0 ? void 0 : view.dispatch({
          annotations: [new Annotation("remove-errors", true)]
        });
      } else if (message.type === "action" && message.action === "show-error" && message.path === filePath && message.line) {
        view === null || view === void 0 ? void 0 : view.dispatch({
          annotations: [new Annotation("show-error", message.line)]
        });
      }
    });
    return function() {
      return unsubscribe();
    };
  }, [listen, showInlineErrors]);
  var handleContainerKeyDown = function(evt) {
    if (evt.key === "Enter" && cmView.current) {
      evt.preventDefault();
      cmView.current.contentDOM.focus();
    }
  };
  var gutterLineOffset = function() {
    var offset = 4;
    if (showLineNumbers) {
      offset += 6;
    }
    if (!readOnly) {
      offset += 1;
    }
    return "var(--".concat(THEME_PREFIX, "-space-").concat(offset, ")");
  };
  if (useStaticReadOnly) {
    return jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, {
      children: [jsxRuntimeExports.jsx("pre", {
        ref: combinedRef,
        className: classNames("cm", [classNames(editorState), classNames(languageExtension), cmClassName, tokensClassName]),
        translate: "no",
        children: jsxRuntimeExports.jsx("code", {
          className: classNames("pre-placeholder", [placeholderClassName]),
          style: {
            marginLeft: gutterLineOffset()
          },
          children: syntaxHighlightRender
        })
      }), readOnly && showReadOnly && jsxRuntimeExports.jsx("span", __assign({
        className: classNames("read-only", [readOnlyClassName])
      }, {}, {
        children: "Read-only"
      }))]
    });
  }
  return jsxRuntimeExports.jsx("div", {
    ref: combinedRef,
    "aria-autocomplete": "list",
    "aria-label": filePath ? "Code Editor for ".concat(getFileName(filePath)) : "Code Editor",
    "aria-multiline": "true",
    className: classNames("cm", [classNames(editorState), classNames(languageExtension), cmClassName, tokensClassName]),
    onKeyDown: handleContainerKeyDown,
    role: "textbox",
    tabIndex: 0,
    translate: "no",
    suppressHydrationWarning: true,
    children: jsxRuntimeExports.jsx("pre", {
      className: classNames("pre-placeholder", [placeholderClassName]),
      style: {
        marginLeft: gutterLineOffset()
      },
      children: syntaxHighlightRender
    })
  });
});
reactExports.forwardRef(function(_a2, ref) {
  var showTabs = _a2.showTabs, _b = _a2.showLineNumbers, showLineNumbers = _b === void 0 ? false : _b, _c2 = _a2.showInlineErrors, showInlineErrors = _c2 === void 0 ? false : _c2, _d = _a2.showRunButton, showRunButton = _d === void 0 ? true : _d, _e = _a2.wrapContent, wrapContent = _e === void 0 ? false : _e, _f = _a2.closableTabs, closableTabs = _f === void 0 ? false : _f, initMode = _a2.initMode, extensions = _a2.extensions, extensionsKeymap = _a2.extensionsKeymap, readOnly = _a2.readOnly, showReadOnly = _a2.showReadOnly, additionalLanguages = _a2.additionalLanguages, className = _a2.className, props = __rest(_a2, ["showTabs", "showLineNumbers", "showInlineErrors", "showRunButton", "wrapContent", "closableTabs", "initMode", "extensions", "extensionsKeymap", "readOnly", "showReadOnly", "additionalLanguages", "className"]);
  var sandpack = useSandpack().sandpack;
  var _g = useActiveCode(), code = _g.code, updateCode = _g.updateCode, readOnlyFile = _g.readOnly;
  var activeFile = sandpack.activeFile, status = sandpack.status, editorState = sandpack.editorState;
  var shouldShowTabs = showTabs !== null && showTabs !== void 0 ? showTabs : sandpack.visibleFiles.length > 1;
  var classNames = useClassNames();
  var handleCodeUpdate = function(newCode, shouldUpdatePreview) {
    if (shouldUpdatePreview === void 0) {
      shouldUpdatePreview = true;
    }
    updateCode(newCode, shouldUpdatePreview);
  };
  var activeFileUniqueId = useSandpackId();
  return jsxRuntimeExports.jsxs(SandpackStack, __assign({
    className: classNames("editor", [className])
  }, props, {
    children: [shouldShowTabs && jsxRuntimeExports.jsx(FileTabs, {
      activeFileUniqueId,
      closableTabs
    }), jsxRuntimeExports.jsxs("div", {
      "aria-labelledby": "".concat(activeFile, "-").concat(activeFileUniqueId, "-tab"),
      className: classNames("code-editor", [editorClassName]),
      id: "".concat(activeFile, "-").concat(activeFileUniqueId, "-tab-panel"),
      role: "tabpanel",
      children: [jsxRuntimeExports.jsx(CodeMirror, {
        ref,
        additionalLanguages,
        code,
        editorState,
        extensions,
        extensionsKeymap,
        filePath: activeFile,
        initMode: initMode || sandpack.initMode,
        onCodeUpdate: function(newCode) {
          var _a3;
          return handleCodeUpdate(newCode, (_a3 = sandpack.autoReload) !== null && _a3 !== void 0 ? _a3 : true);
        },
        readOnly: readOnly || readOnlyFile,
        showInlineErrors,
        showLineNumbers,
        showReadOnly,
        wrapContent
      }, activeFile), showRunButton && (!sandpack.autoReload || status === "idle") ? jsxRuntimeExports.jsx(RunButton$1, {}) : null]
    })]
  }));
});
reactExports.forwardRef(function(_a2, ref) {
  var showTabs = _a2.showTabs, showLineNumbers = _a2.showLineNumbers, decorators = _a2.decorators, propCode = _a2.code, initMode = _a2.initMode, wrapContent = _a2.wrapContent, additionalLanguages = _a2.additionalLanguages, props = __rest(_a2, ["showTabs", "showLineNumbers", "decorators", "code", "initMode", "wrapContent", "additionalLanguages"]);
  var sandpack = useSandpack().sandpack;
  var code = useActiveCode().code;
  var classNames = useClassNames();
  var shouldShowTabs = showTabs !== null && showTabs !== void 0 ? showTabs : sandpack.visibleFiles.length > 1;
  var activeFileUniqueId = useSandpackId();
  return jsxRuntimeExports.jsxs(SandpackStack, __assign({
    className: classNames("editor-viewer")
  }, props, {
    children: [shouldShowTabs ? jsxRuntimeExports.jsx(FileTabs, {
      activeFileUniqueId
    }) : null, jsxRuntimeExports.jsx("div", {
      "aria-labelledby": "".concat(sandpack.activeFile, "-").concat(activeFileUniqueId, "-tab"),
      className: classNames("code-editor", [editorClassName]),
      id: "".concat(sandpack.activeFile, "-").concat(activeFileUniqueId, "-tab-panel"),
      role: "tabpanel",
      children: jsxRuntimeExports.jsx(CodeMirror, {
        ref,
        additionalLanguages,
        code: propCode !== null && propCode !== void 0 ? propCode : code,
        decorators,
        filePath: sandpack.activeFile,
        initMode: initMode || sandpack.initMode,
        showLineNumbers,
        showReadOnly: false,
        wrapContent,
        readOnly: true
      })
    }), sandpack.status === "idle" ? jsxRuntimeExports.jsx(RunButton$1, {}) : null]
  }));
});
var layoutClassName = fakeCss;
reactExports.forwardRef(function(_a2, ref) {
  var children = _a2.children, className = _a2.className, props = __rest(_a2, ["children", "className"]);
  var sandpack = useSandpack().sandpack;
  var classNames = useClassNames();
  var combinedRef = useCombinedRefs(sandpack.lazyAnchorRef, ref);
  return jsxRuntimeExports.jsx("div", __assign({
    ref: combinedRef,
    className: classNames("layout", [layoutClassName, className])
  }, props, {
    children
  }));
});
var useErrorMessage = function() {
  var _a2;
  var sandpack = useSandpack().sandpack;
  var error = sandpack.error;
  return (_a2 = error === null || error === void 0 ? void 0 : error.message) !== null && _a2 !== void 0 ? _a2 : null;
};
var FADE_ANIMATION_DURATION = 200;
var useLoadingOverlayState = function(clientId, externalLoading) {
  var _a2 = useSandpack(), sandpack = _a2.sandpack, listen = _a2.listen;
  var _b = reactExports.useState("LOADING"), state = _b[0], setState = _b[1];
  reactExports.useEffect(function() {
    var unsubscribe = listen(function(message) {
      if (message.type === "start" && message.firstLoad === true) {
        setState("LOADING");
      }
      if (message.type === "done") {
        setState(function(prev) {
          return prev === "LOADING" ? "PRE_FADING" : "HIDDEN";
        });
      }
    }, clientId);
    return function() {
      unsubscribe();
    };
  }, [clientId, sandpack.status === "idle"]);
  reactExports.useEffect(function() {
    var fadeTimeout;
    if (state === "PRE_FADING" && !externalLoading) {
      setState("FADING");
    } else if (state === "FADING") {
      fadeTimeout = setTimeout(function() {
        return setState("HIDDEN");
      }, FADE_ANIMATION_DURATION);
    }
    return function() {
      clearTimeout(fadeTimeout);
    };
  }, [state, externalLoading]);
  if (sandpack.status === "timeout") {
    return "TIMEOUT";
  }
  if (sandpack.status !== "running") {
    return "HIDDEN";
  }
  return state;
};
var useSandpackNavigation = function(clientId) {
  var dispatch = useSandpack().dispatch;
  return {
    refresh: function() {
      return dispatch({
        type: "refresh"
      }, clientId);
    },
    back: function() {
      return dispatch({
        type: "urlback"
      }, clientId);
    },
    forward: function() {
      return dispatch({
        type: "urlforward"
      }, clientId);
    }
  };
};
var useSandpackClient = function(clientPropsOverride) {
  var _a2 = useSandpack(), sandpack = _a2.sandpack, listen = _a2.listen, dispatch = _a2.dispatch;
  var iframeRef = reactExports.useRef(null);
  var clientId = reactExports.useRef(generateRandomId$1());
  reactExports.useEffect(function() {
    var iframeElement = iframeRef.current;
    var clientIdValue = clientId.current;
    if (iframeElement !== null) {
      sandpack.registerBundler(iframeElement, clientIdValue, clientPropsOverride);
    }
    return function() {
      return sandpack.unregisterBundler(clientIdValue);
    };
  }, []);
  var getClient = function() {
    return sandpack.clients[clientId.current] || null;
  };
  return {
    sandpack,
    getClient,
    clientId: clientId.current,
    iframe: iframeRef,
    listen: function(listener) {
      return listen(listener, clientId.current);
    },
    dispatch: function(message) {
      return dispatch(message, clientId.current);
    }
  };
};
var useSandpackShell = function(clientId) {
  var dispatch = useSandpack().dispatch;
  return {
    restart: function() {
      return dispatch({
        type: "shell/restart"
      }, clientId);
    },
    openPreview: function() {
      return dispatch({
        type: "shell/openPreview"
      }, clientId);
    }
  };
};
var mapProgressMessage = function(originalMessage, firstTotalPending) {
  var _a2;
  switch (originalMessage.state) {
    case "downloading_manifest":
      return "[1/3] Downloading manifest";
    case "downloaded_module":
      return "[2/3] Downloaded ".concat(originalMessage.name, " (").concat(firstTotalPending - originalMessage.totalPending, "/").concat(firstTotalPending, ")");
    case "starting_command":
      return "[3/3] Starting command";
    case "command_running":
      return '[3/3] Running "'.concat((_a2 = originalMessage.command) === null || _a2 === void 0 ? void 0 : _a2.trim(), '"');
  }
};
var useSandpackPreviewProgress = function(props) {
  var _a2 = reactExports.useState(false), isReady = _a2[0], setIsReady = _a2[1];
  var _b = reactExports.useState(), totalDependencies = _b[0], setTotalDependencies = _b[1];
  var _c2 = reactExports.useState(null), loadingMessage = _c2[0], setLoadingMessage = _c2[1];
  var timeout = props === null || props === void 0 ? void 0 : props.timeout;
  var clientId = props === null || props === void 0 ? void 0 : props.clientId;
  var listen = useSandpack().listen;
  reactExports.useEffect(function() {
    var timer;
    var unsubscribe = listen(function(message) {
      if (message.type === "start" && message.firstLoad) {
        setIsReady(false);
      }
      if (timeout) {
        timer = setTimeout(function() {
          setLoadingMessage(null);
        }, timeout);
      }
      if (message.type === "dependencies") {
        setLoadingMessage(function() {
          switch (message.data.state) {
            case "downloading_manifest":
              return "[1/3] Downloading manifest";
            case "downloaded_module":
              return "[2/3] Downloaded ".concat(message.data.name, " (").concat(message.data.progress, "/").concat(message.data.total, ")");
            case "starting":
              return "[3/3] Starting";
          }
          return null;
        });
      } else if (message.type === "shell/progress" && !isReady) {
        if (!totalDependencies && message.data.state === "downloaded_module") {
          setTotalDependencies(message.data.totalPending);
        }
        if (totalDependencies !== void 0) {
          setLoadingMessage(mapProgressMessage(message.data, totalDependencies));
        }
      }
      if (message.type === "done" && message.compilatonError === false) {
        setLoadingMessage(null);
        setIsReady(true);
        clearTimeout(timer);
      }
    }, clientId);
    return function() {
      if (timer) {
        clearTimeout(timer);
      }
      unsubscribe();
    };
  }, [clientId, isReady, totalDependencies, timeout]);
  return loadingMessage;
};
var MAX_MESSAGE_COUNT$1 = 400 * 2;
var useSandpackShellStdout = function(_a2) {
  var clientId = _a2.clientId, _b = _a2.maxMessageCount, maxMessageCount = _b === void 0 ? MAX_MESSAGE_COUNT$1 : _b;
  var _d = reactExports.useState([]), logs = _d[0], setLogs = _d[1];
  var listen = useSandpack().listen;
  reactExports.useEffect(function() {
    var unsubscribe = listen(function(message) {
      if (message.type === "start") {
        setLogs([]);
      } else if (message.type === "stdout" && message.payload.data && Boolean(message.payload.data.trim())) {
        setLogs(function(prev) {
          var messages = __spreadArray(__spreadArray([], prev, true), [{
            data: message.payload.data,
            id: generateRandomId$1()
          }], false);
          while (messages.length > maxMessageCount) {
            messages.shift();
          }
          return messages;
        });
      }
    }, clientId);
    return unsubscribe;
  }, [maxMessageCount, clientId]);
  return {
    logs,
    reset: function() {
      return setLogs([]);
    }
  };
};
var mapBundlerErrors = function(originalMessage) {
  var errorMessage = originalMessage.replace("[sandpack-client]: ", "");
  if (/process.exit/.test(errorMessage)) {
    var exitCode = errorMessage.match(/process.exit\((\d+)\)/);
    if (!exitCode) return errorMessage;
    if (Number(exitCode[1]) === 0) {
      return "Server is not running, would you like to start it again?";
    }
    return "Server has crashed with status code ".concat(exitCode[1], ", would you like to restart the server?");
  }
  return errorMessage;
};
var ErrorOverlay = function(props) {
  var children = props.children, className = props.className, otherProps = __rest(props, ["children", "className"]);
  var errorMessage = useErrorMessage();
  var restart = useSandpackShell().restart;
  var classNames = useClassNames();
  var _a2 = useSandpack().sandpack, runSandpack = _a2.runSandpack, teamId = _a2.teamId;
  var dispatch = useSandpack().dispatch;
  if (!errorMessage && !children) {
    return null;
  }
  var isSandpackBundlerError = errorMessage === null || errorMessage === void 0 ? void 0 : errorMessage.startsWith("[sandpack-client]");
  var privateDependencyError = errorMessage === null || errorMessage === void 0 ? void 0 : errorMessage.includes("NPM_REGISTRY_UNAUTHENTICATED_REQUEST");
  var onSignIn = function() {
    if (teamId) {
      dispatch({
        type: "sign-in",
        teamId
      });
    }
  };
  if (privateDependencyError) {
    return jsxRuntimeExports.jsxs("div", __assign({
      className: classNames("overlay", [classNames("error"), absoluteClassName, errorBundlerClassName, className])
    }, props, {
      children: [jsxRuntimeExports.jsx("p", {
        className: classNames("error-message", [errorMessageClassName]),
        children: jsxRuntimeExports.jsx("strong", {
          children: "Unable to fetch required dependency."
        })
      }), jsxRuntimeExports.jsx("div", {
        className: classNames("error-message", [errorMessageClassName]),
        children: jsxRuntimeExports.jsxs("p", {
          children: ["Authentication required. Please sign in to your account (make sure to allow pop-ups to this page) and try again. If the issue persists, contact", " ", jsxRuntimeExports.jsx("a", {
            href: "mailto:hello@codesandbox.io?subject=Sandpack Timeout Error",
            children: "support"
          }), " ", "for further assistance."]
        })
      }), jsxRuntimeExports.jsx("div", {
        children: jsxRuntimeExports.jsxs("button", {
          className: classNames("button", [buttonClassName, iconStandaloneClassName, roundedButtonClassName]),
          onClick: onSignIn,
          children: [jsxRuntimeExports.jsx(SignInIcon, {}), jsxRuntimeExports.jsx("span", {
            children: "Sign in"
          })]
        })
      })]
    }));
  }
  if (isSandpackBundlerError && errorMessage) {
    return jsxRuntimeExports.jsx("div", __assign({
      className: classNames("overlay", [classNames("error"), absoluteClassName, errorBundlerClassName, className])
    }, otherProps, {
      children: jsxRuntimeExports.jsxs("div", {
        className: classNames("error-message", [errorMessageClassName]),
        children: [jsxRuntimeExports.jsx("p", {
          className: classNames("error-title", [fakeCss]),
          children: "Couldn't connect to server"
        }), jsxRuntimeExports.jsx("p", {
          children: mapBundlerErrors(errorMessage)
        }), jsxRuntimeExports.jsx("div", {
          children: jsxRuntimeExports.jsxs("button", {
            className: classNames("button", [classNames("icon-standalone"), buttonClassName, iconStandaloneClassName, roundedButtonClassName]),
            onClick: function() {
              restart();
              runSandpack();
            },
            title: "Restart script",
            type: "button",
            children: [jsxRuntimeExports.jsx(RestartIcon, {}), " ", jsxRuntimeExports.jsx("span", {
              children: "Restart"
            })]
          })
        })]
      })
    }));
  }
  return jsxRuntimeExports.jsxs("div", __assign({
    className: classNames("overlay", [classNames("error"), absoluteClassName, errorClassName(), className]),
    translate: "no"
  }, otherProps, {
    children: [jsxRuntimeExports.jsx("p", {
      className: classNames("error-message", [errorMessageClassName]),
      children: jsxRuntimeExports.jsx("strong", {
        children: "Something went wrong"
      })
    }), jsxRuntimeExports.jsx("p", {
      className: classNames("error-message", [errorMessageClassName()]),
      children: errorMessage || children
    })]
  }));
};
function ansiToJSON(input, use_classes) {
  if (use_classes === void 0) {
    use_classes = false;
  }
  input = escapeCarriageExports.escapeCarriageReturn(fixBackspace(input));
  return Anser.ansiToJson(input, {
    json: true,
    remove_empty: true,
    use_classes
  });
}
function createClass(bundle) {
  var classNames = "";
  if (bundle.bg) {
    classNames += "".concat(bundle.bg, "-bg ");
  }
  if (bundle.fg) {
    classNames += "".concat(bundle.fg, "-fg ");
  }
  if (bundle.decoration) {
    classNames += "ansi-".concat(bundle.decoration, " ");
  }
  if (classNames === "") {
    return null;
  }
  classNames = classNames.substring(0, classNames.length - 1);
  return classNames;
}
function createStyle(bundle) {
  var style = {};
  if (bundle.bg) {
    style.backgroundColor = "rgb(".concat(bundle.bg, ")");
  }
  if (bundle.fg) {
    style.color = "rgb(".concat(bundle.fg, ")");
  }
  switch (bundle.decoration) {
    case "bold":
      style.fontWeight = "bold";
      break;
    case "dim":
      style.opacity = "0.5";
      break;
    case "italic":
      style.fontStyle = "italic";
      break;
    case "hidden":
      style.visibility = "hidden";
      break;
    case "strikethrough":
      style.textDecoration = "line-through";
      break;
    case "underline":
      style.textDecoration = "underline";
      break;
    case "blink":
      style.textDecoration = "blink";
      break;
  }
  return style;
}
function convertBundleIntoReact(linkify, useClasses, bundle, key) {
  var style = useClasses ? null : createStyle(bundle);
  var className = useClasses ? createClass(bundle) : null;
  if (!linkify) {
    return reactExports.createElement("span", {
      style,
      key,
      className
    }, bundle.content);
  }
  var content = [];
  var linkRegex = /(\s|^)(https?:\/\/(?:www\.|(?!www))[^\s.]+\.[^\s]{2,}|www\.[^\s]+\.[^\s]{2,})/g;
  var index2 = 0;
  var match;
  while ((match = linkRegex.exec(bundle.content)) !== null) {
    var pre = match[1], url = match[2];
    var startIndex = match.index + pre.length;
    if (startIndex > index2) {
      content.push(bundle.content.substring(index2, startIndex));
    }
    var href = url.startsWith("www.") ? "http://".concat(url) : url;
    content.push(reactExports.createElement("a", {
      key: index2,
      href,
      target: "_blank"
    }, "".concat(url)));
    index2 = linkRegex.lastIndex;
  }
  if (index2 < bundle.content.length) {
    content.push(bundle.content.substring(index2));
  }
  return reactExports.createElement("span", {
    style,
    key,
    className
  }, content);
}
function Ansi(props) {
  var className = props.className, useClasses = props.useClasses, children = props.children, linkify = props.linkify;
  return reactExports.createElement("code", {
    className
  }, ansiToJSON(children !== null && children !== void 0 ? children : "", useClasses !== null && useClasses !== void 0 ? useClasses : false).map(convertBundleIntoReact.bind(null, linkify !== null && linkify !== void 0 ? linkify : false, useClasses !== null && useClasses !== void 0 ? useClasses : false)));
}
function fixBackspace(txt) {
  var tmp = txt;
  do {
    txt = tmp;
    tmp = txt.replace(/[^\n]\x08/gm, "");
  } while (tmp.length < txt.length);
  return txt;
}
var StdoutList = function(_a2) {
  var data = _a2.data;
  var classNames = useClassNames();
  return jsxRuntimeExports.jsx(jsxRuntimeExports.Fragment, {
    children: data.map(function(_a3) {
      var data2 = _a3.data, id = _a3.id;
      return jsxRuntimeExports.jsx("div", {
        className: classNames("console-item", [consoleItemClassName$1]),
        children: jsxRuntimeExports.jsx(Ansi, {
          children: data2
        })
      }, id);
    })
  });
};
var consoleItemClassName$1 = fakeCss;
var getParameters = function(parameters) {
  return LZString.compressToBase64(JSON.stringify(parameters)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
var CSB_URL = "https://codesandbox.io/api/v1/sandboxes/define";
var getFileParameters = function(files, environment) {
  var normalizedFiles = Object.keys(files).reduce(function(prev, next) {
    var _a2;
    var fileName = next.replace("/", "");
    var value = {
      content: files[next].code,
      isBinary: false
    };
    return __assign(__assign({}, prev), (_a2 = {}, _a2[fileName] = value, _a2));
  }, {});
  return getParameters(__assign({
    files: normalizedFiles
  }, environment ? {
    template: environment
  } : null));
};
var UnstyledOpenInCodeSandboxButton = function(props) {
  var sandpack = useSandpack().sandpack;
  if (sandpack.exportOptions) {
    return jsxRuntimeExports.jsx(ExportToWorkspaceButton, __assign({
      state: sandpack
    }, props));
  }
  return jsxRuntimeExports.jsx(RegularExportButton, __assign({
    state: sandpack
  }, props));
};
var ExportToWorkspaceButton = function(_a2) {
  var children = _a2.children, state = _a2.state, props = __rest(_a2, ["children", "state"]);
  var submit = function() {
    return __awaiter(void 0, void 0, void 0, function() {
      var normalizedFiles, response, data;
      var _a3;
      return __generator(this, function(_b) {
        switch (_b.label) {
          case 0:
            if (!((_a3 = state.exportOptions) === null || _a3 === void 0 ? void 0 : _a3.apiToken)) {
              throw new Error("Missing `apiToken` property");
            }
            normalizedFiles = Object.keys(state.files).reduce(function(prev, next) {
              var _a4;
              var fileName = next.replace("/", "");
              return __assign(__assign({}, prev), (_a4 = {}, _a4[fileName] = state.files[next], _a4));
            }, {});
            return [4, fetch("https://api.codesandbox.io/sandbox", {
              method: "POST",
              body: JSON.stringify({
                template: state.environment,
                files: normalizedFiles,
                privacy: state.exportOptions.privacy === "public" ? 0 : 2
              }),
              headers: {
                Authorization: "Bearer ".concat(state.exportOptions.apiToken),
                "Content-Type": "application/json",
                "X-CSB-API-Version": "2023-07-01"
              }
            })];
          case 1:
            response = _b.sent();
            return [4, response.json()];
          case 2:
            data = _b.sent();
            window.open("https://codesandbox.io/p/sandbox/".concat(data.data.alias, "?file=/").concat(state.activeFile, "&utm-source=storybook-addon"), "_blank");
            return [2];
        }
      });
    });
  };
  return jsxRuntimeExports.jsx("button", __assign({
    onClick: submit,
    title: "Export to workspace in CodeSandbox",
    type: "button"
  }, props, {
    children
  }));
};
var RegularExportButton = function(_a2) {
  var _b, _c2, _d;
  var children = _a2.children, state = _a2.state, props = __rest(_a2, ["children", "state"]);
  var formRef = reactExports.useRef(null);
  var _e = reactExports.useState(), paramsValues = _e[0], setParamsValues = _e[1];
  reactExports.useEffect(function debounce() {
    var timer = setTimeout(function() {
      var params = getFileParameters(state.files, state.environment);
      var searchParams = new URLSearchParams({
        parameters: params,
        query: new URLSearchParams({
          file: state.activeFile,
          utm_medium: "sandpack"
        }).toString()
      });
      setParamsValues(searchParams);
    }, 600);
    return function() {
      clearTimeout(timer);
    };
  }, [state.activeFile, state.environment, state.files]);
  if (((_d = (_c2 = (_b = paramsValues === null || paramsValues === void 0 ? void 0 : paramsValues.get) === null || _b === void 0 ? void 0 : _b.call(paramsValues, "parameters")) === null || _c2 === void 0 ? void 0 : _c2.length) !== null && _d !== void 0 ? _d : 0) > 1500) {
    return jsxRuntimeExports.jsxs("button", __assign({
      onClick: function() {
        var _a3;
        return (_a3 = formRef.current) === null || _a3 === void 0 ? void 0 : _a3.submit();
      },
      title: "Open in CodeSandbox",
      type: "button"
    }, props, {
      children: [jsxRuntimeExports.jsxs("form", {
        ref: formRef,
        action: CSB_URL,
        method: "POST",
        style: {
          visibility: "hidden"
        },
        target: "_blank",
        children: [jsxRuntimeExports.jsx("input", {
          name: "environment",
          type: "hidden",
          value: state.environment === "node" ? "server" : state.environment
        }), Array.from(paramsValues, function(_a3) {
          var key = _a3[0], value = _a3[1];
          return jsxRuntimeExports.jsx("input", {
            name: key,
            type: "hidden",
            value
          }, key);
        })]
      }), children]
    }));
  }
  return jsxRuntimeExports.jsx("a", __assign({
    href: "".concat(CSB_URL, "?").concat(paramsValues === null || paramsValues === void 0 ? void 0 : paramsValues.toString(), "&environment=").concat(state.environment === "node" ? "server" : state.environment),
    rel: "noreferrer noopener",
    target: "_blank",
    title: "Open in CodeSandbox"
  }, props, {
    children
  }));
};
var OpenInCodeSandboxButton = function() {
  var classNames = useClassNames();
  return jsxRuntimeExports.jsxs(UnstyledOpenInCodeSandboxButton, {
    className: classNames("button", [classNames("icon-standalone"), buttonClassName, iconStandaloneClassName, roundedButtonClassName]),
    children: [jsxRuntimeExports.jsx(ExportIcon, {}), jsxRuntimeExports.jsx("span", {
      children: "Open Sandbox"
    })]
  });
};
var cubeClassName = fakeCss;
var wrapperClassName$2 = fakeCss;
keyframes({
  "0%": {
    transform: "rotateX(-25.5deg) rotateY(45deg)"
  },
  "100%": {
    transform: "rotateX(-25.5deg) rotateY(405deg)"
  }
});
var sidesClassNames = fakeCss;
var Loading = function(_a2) {
  var className = _a2.className, showOpenInCodeSandbox = _a2.showOpenInCodeSandbox, props = __rest(_a2, ["className", "showOpenInCodeSandbox"]);
  var classNames = useClassNames();
  return jsxRuntimeExports.jsxs("div", __assign({
    className: classNames("cube-wrapper", [wrapperClassName$2, className]),
    title: "Open in CodeSandbox"
  }, props, {
    children: [showOpenInCodeSandbox && jsxRuntimeExports.jsx(OpenInCodeSandboxButton, {}), jsxRuntimeExports.jsx("div", {
      className: classNames("cube", [cubeClassName]),
      children: jsxRuntimeExports.jsxs("div", {
        className: classNames("sides", [sidesClassNames]),
        children: [jsxRuntimeExports.jsx("div", {
          className: "top"
        }), jsxRuntimeExports.jsx("div", {
          className: "right"
        }), jsxRuntimeExports.jsx("div", {
          className: "bottom"
        }), jsxRuntimeExports.jsx("div", {
          className: "left"
        }), jsxRuntimeExports.jsx("div", {
          className: "front"
        }), jsxRuntimeExports.jsx("div", {
          className: "back"
        })]
      })
    })]
  }));
};
var loadingClassName = fakeCss;
var LoadingOverlay = function(_a2) {
  var clientId = _a2.clientId, loading = _a2.loading, className = _a2.className, style = _a2.style, showOpenInCodeSandbox = _a2.showOpenInCodeSandbox, props = __rest(_a2, ["clientId", "loading", "className", "style", "showOpenInCodeSandbox"]);
  var classNames = useClassNames();
  var _b = useSandpack().sandpack, runSandpack = _b.runSandpack, environment = _b.environment;
  var _c2 = reactExports.useState(false), shouldShowStdout = _c2[0], setShouldShowStdout = _c2[1];
  var loadingOverlayState = useLoadingOverlayState(clientId, loading);
  var progressMessage = useSandpackPreviewProgress({
    clientId
  });
  var stdoutData = useSandpackShellStdout({
    clientId
  }).logs;
  reactExports.useEffect(function() {
    var timer;
    if (progressMessage === null || progressMessage === void 0 ? void 0 : progressMessage.includes("Running")) {
      timer = setTimeout(function() {
        setShouldShowStdout(true);
      }, 3e3);
    }
    return function() {
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [progressMessage]);
  if (loadingOverlayState === "HIDDEN") {
    return null;
  }
  if (loadingOverlayState === "TIMEOUT") {
    return jsxRuntimeExports.jsx("div", __assign({
      className: classNames("overlay", [classNames("error"), absoluteClassName, errorClassName, errorBundlerClassName, className])
    }, props, {
      children: jsxRuntimeExports.jsxs("div", {
        className: classNames("error-message", [errorMessageClassName]),
        children: [jsxRuntimeExports.jsx("p", {
          className: classNames("error-title", [fakeCss]),
          children: "Couldn't connect to server"
        }), jsxRuntimeExports.jsx("div", {
          className: classNames("error-message", [errorMessageClassName]),
          children: jsxRuntimeExports.jsxs("p", {
            children: ["This means sandpack cannot connect to the runtime or your network is having some issues. Please check the network tab in your browser and try again. If the problem persists, report it via", " ", jsxRuntimeExports.jsx("a", {
              href: "mailto:hello@codesandbox.io?subject=Sandpack Timeout Error",
              children: "email"
            }), " ", "or submit an issue on", " ", jsxRuntimeExports.jsx("a", {
              href: "https://github.com/codesandbox/sandpack/issues",
              rel: "noreferrer noopener",
              target: "_blank",
              children: "GitHub."
            })]
          })
        }), jsxRuntimeExports.jsxs("p", {
          className: classNames("error-message", [errorMessageClassName()]),
          children: ["ENV: ", environment, jsxRuntimeExports.jsx("br", {}), "ERROR: TIME_OUT"]
        }), jsxRuntimeExports.jsx("div", {
          children: jsxRuntimeExports.jsxs("button", {
            className: classNames("button", [classNames("icon-standalone"), buttonClassName, iconStandaloneClassName, roundedButtonClassName]),
            onClick: runSandpack,
            title: "Restart script",
            type: "button",
            children: [jsxRuntimeExports.jsx(RestartIcon, {}), " ", jsxRuntimeExports.jsx("span", {
              children: "Try again"
            })]
          })
        })]
      })
    }));
  }
  var stillLoading = loadingOverlayState === "LOADING" || loadingOverlayState === "PRE_FADING";
  return jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, {
    children: [jsxRuntimeExports.jsxs("div", __assign({
      className: classNames("overlay", [classNames("loading"), absoluteClassName, loadingClassName, className]),
      style: __assign(__assign({}, style), {
        opacity: stillLoading ? 1 : 0,
        transition: "opacity ".concat(FADE_ANIMATION_DURATION, "ms ease-out")
      })
    }, props, {
      children: [shouldShowStdout && jsxRuntimeExports.jsx("div", {
        className: stdoutPreview.toString(),
        children: jsxRuntimeExports.jsx(StdoutList, {
          data: stdoutData
        })
      }), jsxRuntimeExports.jsx(Loading, {
        showOpenInCodeSandbox
      })]
    })), progressMessage && jsxRuntimeExports.jsx("div", {
      className: progressClassName$1.toString(),
      children: jsxRuntimeExports.jsx("p", {
        children: progressMessage
      })
    })]
  });
};
var stdoutPreview = fakeCss;
var progressClassName$1 = fakeCss;
var DependenciesProgress = function(_a2) {
  var clientId = _a2.clientId;
  var progressMessage = useSandpackPreviewProgress({
    timeout: 3e3,
    clientId
  });
  if (!progressMessage) {
    return null;
  }
  return jsxRuntimeExports.jsx("div", {
    className: progressClassName.toString(),
    children: jsxRuntimeExports.jsx("p", {
      children: progressMessage
    })
  });
};
var progressClassName = fakeCss;
var splitUrl = function(url) {
  var match = url.match(/(https?:\/\/.*?)\//);
  if (match && match[1]) {
    return [match[1], url.replace(match[1], "")];
  }
  return [url, "/"];
};
var navigatorClassName = fakeCss;
var inputClassName = fakeCss;
var Navigator = function(_a2) {
  var _b;
  var clientId = _a2.clientId, onURLChange = _a2.onURLChange, className = _a2.className, startRoute = _a2.startRoute, props = __rest(_a2, ["clientId", "onURLChange", "className", "startRoute"]);
  var _c2 = reactExports.useState(""), baseUrl = _c2[0], setBaseUrl = _c2[1];
  var _d = useSandpack(), sandpack = _d.sandpack, dispatch = _d.dispatch, listen = _d.listen;
  var _e = reactExports.useState((_b = startRoute !== null && startRoute !== void 0 ? startRoute : sandpack.startRoute) !== null && _b !== void 0 ? _b : "/"), relativeUrl = _e[0], setRelativeUrl = _e[1];
  var _f = reactExports.useState(false), backEnabled = _f[0], setBackEnabled = _f[1];
  var _g = reactExports.useState(false), forwardEnabled = _g[0], setForwardEnabled = _g[1];
  var classNames = useClassNames();
  reactExports.useEffect(function() {
    var unsub = listen(function(message) {
      if (message.type === "urlchange") {
        var url = message.url, back = message.back, forward = message.forward;
        var _a3 = splitUrl(url), newBaseUrl = _a3[0], newRelativeUrl = _a3[1];
        setBaseUrl(newBaseUrl);
        setRelativeUrl(newRelativeUrl);
        setBackEnabled(back);
        setForwardEnabled(forward);
      }
    }, clientId);
    return function() {
      return unsub();
    };
  }, []);
  var handleInputChange = function(e) {
    var path = e.target.value.startsWith("/") ? e.target.value : "/".concat(e.target.value);
    setRelativeUrl(path);
  };
  var handleKeyDown = function(e) {
    if (e.code === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      if (typeof onURLChange === "function") {
        onURLChange(baseUrl + e.currentTarget.value);
      }
    }
  };
  var handleRefresh = function() {
    dispatch({
      type: "refresh"
    });
  };
  var handleBack = function() {
    dispatch({
      type: "urlback"
    });
  };
  var handleForward = function() {
    dispatch({
      type: "urlforward"
    });
  };
  var buttonsClassNames = classNames("button", [classNames("icon"), buttonClassName, iconClassName, fakeCss]);
  return jsxRuntimeExports.jsxs("div", __assign({
    className: classNames("navigator", [navigatorClassName, className])
  }, props, {
    children: [jsxRuntimeExports.jsx("button", {
      "aria-label": "Go back one page",
      className: buttonsClassNames,
      disabled: !backEnabled,
      onClick: handleBack,
      type: "button",
      children: jsxRuntimeExports.jsx(BackwardIcon, {})
    }), jsxRuntimeExports.jsx("button", {
      "aria-label": "Go forward one page",
      className: buttonsClassNames,
      disabled: !forwardEnabled,
      onClick: handleForward,
      type: "button",
      children: jsxRuntimeExports.jsx(ForwardIcon, {})
    }), jsxRuntimeExports.jsx("button", {
      "aria-label": "Refresh page",
      className: buttonsClassNames,
      onClick: handleRefresh,
      type: "button",
      children: jsxRuntimeExports.jsx(RefreshIcon, {})
    }), jsxRuntimeExports.jsx("input", {
      "aria-label": "Current Sandpack URL",
      className: classNames("input", [inputClassName]),
      name: "Current Sandpack URL",
      onChange: handleInputChange,
      onKeyDown: handleKeyDown,
      type: "text",
      value: relativeUrl
    })]
  }));
};
var previewClassName = fakeCss;
var previewIframe = fakeCss;
var previewActionsClassName$1 = fakeCss;
var SandpackPreview = reactExports.forwardRef(function(_a2, ref) {
  var _b = _a2.showNavigator, showNavigator = _b === void 0 ? false : _b, _c2 = _a2.showRefreshButton, showRefreshButton = _c2 === void 0 ? true : _c2, _d = _a2.showOpenInCodeSandbox, showOpenInCodeSandbox = _d === void 0 ? true : _d, _e = _a2.showSandpackErrorOverlay, showSandpackErrorOverlay = _e === void 0 ? true : _e, _g = _a2.showRestartButton, showRestartButton = _g === void 0 ? true : _g, _h = _a2.actionsChildren, actionsChildren = _h === void 0 ? jsxRuntimeExports.jsx(jsxRuntimeExports.Fragment, {}) : _h, children = _a2.children, className = _a2.className, _j = _a2.startRoute, startRoute = _j === void 0 ? "/" : _j, props = __rest(_a2, ["showNavigator", "showRefreshButton", "showOpenInCodeSandbox", "showSandpackErrorOverlay", "showOpenNewtab", "showRestartButton", "actionsChildren", "children", "className", "startRoute"]);
  var _k = useSandpackClient({
    startRoute
  }), sandpack = _k.sandpack, listen = _k.listen, iframe = _k.iframe, getClient = _k.getClient, clientId = _k.clientId, dispatch = _k.dispatch;
  var _l = reactExports.useState(null), iframeComputedHeight = _l[0], setComputedAutoHeight = _l[1];
  var status = sandpack.status;
  var refresh = useSandpackNavigation(clientId).refresh;
  var restart = useSandpackShell(clientId).restart;
  var classNames = useClassNames();
  reactExports.useEffect(function() {
    var unsubscribe = listen(function(message) {
      if (message.type === "resize") {
        setComputedAutoHeight(message.height);
      }
    });
    return unsubscribe;
  }, []);
  reactExports.useImperativeHandle(ref, function() {
    return {
      clientId,
      getClient
    };
  }, [getClient, clientId]);
  var handleNewURL = function(newUrl) {
    if (!iframe.current) {
      return;
    }
    iframe.current.src = newUrl;
  };
  return jsxRuntimeExports.jsxs(SandpackStack, __assign({
    className: classNames("preview", [className])
  }, props, {
    children: [showNavigator && jsxRuntimeExports.jsx(Navigator, {
      clientId,
      onURLChange: handleNewURL,
      startRoute
    }), jsxRuntimeExports.jsxs("div", {
      className: classNames("preview-container", [previewClassName]),
      children: [jsxRuntimeExports.jsx("iframe", {
        ref: iframe,
        className: classNames("preview-iframe", [previewIframe]),
        style: {
          height: iframeComputedHeight ? iframeComputedHeight : void 0
        },
        title: "Sandpack Preview"
      }), jsxRuntimeExports.jsxs("div", {
        className: classNames("preview-actions", [previewActionsClassName$1]),
        children: [actionsChildren, showRestartButton && sandpack.environment === "node" && jsxRuntimeExports.jsx(RoundedButton, {
          onClick: restart,
          children: jsxRuntimeExports.jsx(RestartIcon, {})
        }), !showNavigator && showRefreshButton && status === "running" && jsxRuntimeExports.jsx(RoundedButton, {
          onClick: refresh,
          children: jsxRuntimeExports.jsx(RefreshIcon, {})
        }), sandpack.teamId && jsxRuntimeExports.jsx("button", {
          className: classNames("button", [classNames("icon-standalone"), buttonClassName, iconStandaloneClassName, roundedButtonClassName]),
          onClick: function() {
            return dispatch({
              type: "sign-out"
            });
          },
          title: "Sign out",
          type: "button",
          children: jsxRuntimeExports.jsx(SignOutIcon, {})
        }), showOpenInCodeSandbox && jsxRuntimeExports.jsx(OpenInCodeSandboxButton, {})]
      }), jsxRuntimeExports.jsx(LoadingOverlay, {
        clientId,
        showOpenInCodeSandbox
      }), showSandpackErrorOverlay && jsxRuntimeExports.jsx(ErrorOverlay, {}), children]
    })]
  }));
});
var SYNTAX_ERROR_PATTERN = ["SyntaxError: ", "Error in sandbox:"];
var CLEAR_LOG = {
  id: "random",
  method: "clear",
  data: ["Console was cleared"]
};
var TRANSFORMED_TYPE_KEY = "@t";
var TRANSFORMED_TYPE_KEY_ALTERNATE = "#@t";
var CIRCULAR_REF_KEY = "@r";
var MAX_LENGTH_STRING = 1e4;
var MAX_NEST_LEVEL = 2;
var MAX_KEYS = 400;
var MAX_MESSAGE_COUNT = MAX_KEYS * 2;
var GLOBAL = function getGlobal2() {
  if (typeof globalThis !== "undefined") return globalThis;
  if (typeof window !== "undefined") return window;
  if (typeof global !== "undefined") return global;
  if (typeof self !== "undefined") return self;
  throw Error("Unable to locate global object");
}();
var ARRAY_BUFFER_SUPPORTED = typeof ArrayBuffer === "function";
var MAP_SUPPORTED = typeof Map === "function";
var SET_SUPPORTED = typeof Set === "function";
var Arithmetic;
(function(Arithmetic2) {
  Arithmetic2[Arithmetic2["infinity"] = 0] = "infinity";
  Arithmetic2[Arithmetic2["minusInfinity"] = 1] = "minusInfinity";
  Arithmetic2[Arithmetic2["minusZero"] = 2] = "minusZero";
})(Arithmetic || (Arithmetic = {}));
var transformers = {
  Arithmetic: function(data) {
    if (data === Arithmetic.infinity) return Infinity;
    if (data === Arithmetic.minusInfinity) return -Infinity;
    if (data === Arithmetic.minusZero) return -0;
    return data;
  },
  HTMLElement: function(data) {
    var sandbox = document.implementation.createHTMLDocument("sandbox");
    try {
      var element = sandbox.createElement(data.tagName);
      element.innerHTML = data.innerHTML;
      for (var _i = 0, _a2 = Object.keys(data.attributes); _i < _a2.length; _i++) {
        var attribute = _a2[_i];
        try {
          element.setAttribute(attribute, data.attributes[attribute]);
        } catch (_b) {
        }
      }
      return element;
    } catch (e) {
      return data;
    }
  },
  Function: function(data) {
    var tempFun = function() {
    };
    Object.defineProperty(tempFun, "toString", {
      value: function() {
        return "function ".concat(data.name, "() {").concat(data.body, "}");
      }
    });
    return tempFun;
  },
  "[[NaN]]": function() {
    return NaN;
  },
  "[[undefined]]": function() {
    return void 0;
  },
  "[[Date]]": function(val) {
    var date = /* @__PURE__ */ new Date();
    date.setTime(val);
    return date;
  },
  "[[RegExp]]": function(val) {
    return new RegExp(val.src, val.flags);
  },
  "[[Error]]": function(val) {
    var Ctor = GLOBAL[val.name] || Error;
    var err = new Ctor(val.message);
    err.stack = val.stack;
    return err;
  },
  "[[ArrayBuffer]]": function(val) {
    if (ARRAY_BUFFER_SUPPORTED) {
      var buffer = new ArrayBuffer(val.length);
      var view = new Int8Array(buffer);
      view.set(val);
      return buffer;
    }
    return val;
  },
  "[[TypedArray]]": function(val) {
    return typeof GLOBAL[val.ctorName] === "function" ? new GLOBAL[val.ctorName](val.arr) : val.arr;
  },
  "[[Map]]": function(val) {
    if (MAP_SUPPORTED) {
      var map = /* @__PURE__ */ new Map();
      for (var i = 0; i < val.length; i += 2) map.set(val[i], val[i + 1]);
      return map;
    }
    var kvArr = [];
    for (var j = 0; j < val.length; j += 2) kvArr.push([val[i], val[i + 1]]);
    return kvArr;
  },
  "[[Set]]": function(val) {
    if (SET_SUPPORTED) {
      var set2 = /* @__PURE__ */ new Set();
      for (var i = 0; i < val.length; i++) set2.add(val[i]);
      return set2;
    }
    return val;
  }
};
var formatSymbols = function(message) {
  var _a2;
  if (typeof message === "string" || typeof message === "number" || message === null) {
    return message;
  } else if (Array.isArray(message)) {
    return message.map(formatSymbols);
  } else if (typeof message == "object" && TRANSFORMED_TYPE_KEY in message) {
    var type = message[TRANSFORMED_TYPE_KEY];
    var transform = transformers[type];
    return transform(message.data);
  } else if (typeof message == "object" && TRANSFORMED_TYPE_KEY_ALTERNATE in message) {
    var type = message[TRANSFORMED_TYPE_KEY_ALTERNATE];
    var transform = transformers[type];
    return transform(message.data);
  } else if (typeof message == "object" && ((_a2 = message.constructor) === null || _a2 === void 0 ? void 0 : _a2.name) === "NodeList") {
    var NodeList_1 = {};
    Object.entries(message).forEach(function(_a3) {
      var key = _a3[0], value = _a3[1];
      NodeList_1[key] = formatSymbols(value);
    });
    return NodeList_1;
  }
  return message;
};
var arrayToString = function(output, references, level) {
  var mergeArray = output.reduce(function(acc, curr, index2) {
    return "".concat(acc).concat(index2 ? ", " : "").concat(fromConsoleToString(curr, references, level));
  }, "");
  return "[".concat(mergeArray, "]");
};
var objectToString = function(output, references, level) {
  var constructorName = output.constructor.name !== "Object" ? "".concat(output.constructor.name, " ") : "";
  if (level > MAX_NEST_LEVEL) {
    return constructorName;
  }
  var entries2 = Object.entries(output);
  var formattedObject = Object.entries(output).reduce(function(acc, _a2, index2) {
    var key = _a2[0], value = _a2[1];
    var comma = index2 === 0 ? "" : ", ";
    var breakLine = entries2.length > 10 ? "\n  " : "";
    var formatted = fromConsoleToString(value, references, level);
    if (index2 === MAX_KEYS) {
      return acc + breakLine + "...";
    } else if (index2 > MAX_KEYS) {
      return acc;
    }
    return acc + "".concat(comma).concat(breakLine).concat(key, ": ") + formatted;
  }, "");
  return "".concat(constructorName, "{ ").concat(formattedObject).concat(entries2.length > 10 ? "\n" : " ", "}");
};
var fromConsoleToString = function(message, references, level) {
  var _a2;
  if (level === void 0) {
    level = 0;
  }
  try {
    var output_1 = formatSymbols(message);
    if (Array.isArray(output_1)) {
      return arrayToString(output_1, references, level + 1);
    }
    switch (typeof output_1) {
      case "string":
        return '"'.concat(output_1, '"').slice(0, MAX_LENGTH_STRING);
      case "number":
      case "function":
      case "symbol":
        return output_1.toString();
      case "boolean":
        return String(output_1);
      case "undefined":
        return "undefined";
      case "object":
      default:
        if (output_1 instanceof RegExp || output_1 instanceof Error || output_1 instanceof Date) {
          return output_1.toString();
        }
        if (output_1 === null) {
          return String(null);
        }
        if (output_1 instanceof HTMLElement) {
          return output_1.outerHTML.slice(0, MAX_LENGTH_STRING);
        }
        if (Object.entries(output_1).length === 0) {
          return "{}";
        }
        if (CIRCULAR_REF_KEY in output_1) {
          if (level > MAX_NEST_LEVEL) {
            return "Unable to print information";
          }
          var newMessage = references[output_1[CIRCULAR_REF_KEY]];
          return fromConsoleToString(newMessage, references, level + 1);
        }
        if (((_a2 = output_1.constructor) === null || _a2 === void 0 ? void 0 : _a2.name) === "NodeList") {
          var length_1 = output_1.length;
          var nodes = new Array(length_1).fill(null).map(function(_, index2) {
            return fromConsoleToString(output_1[index2], references);
          });
          return "NodeList(".concat(output_1.length, ")[").concat(nodes, "]");
        }
        return objectToString(output_1, references, level + 1);
    }
  } catch (_b) {
    return "Unable to print information";
  }
};
var ConsoleList = function(_a2) {
  var data = _a2.data;
  var classNames = useClassNames();
  return jsxRuntimeExports.jsx(jsxRuntimeExports.Fragment, {
    children: data.map(function(_a3, logIndex, references) {
      var data2 = _a3.data, id = _a3.id, method = _a3.method;
      if (!data2) return null;
      if (Array.isArray(data2)) {
        return jsxRuntimeExports.jsx(reactExports.Fragment, {
          children: data2.map(function(msg, msgIndex) {
            var fixReferences = references.slice(logIndex, references.length);
            return jsxRuntimeExports.jsx("div", {
              className: classNames("console-item", [consoleItemClassName()]),
              children: jsxRuntimeExports.jsx(CodeMirror, {
                code: method === "clear" ? msg : fromConsoleToString(msg, fixReferences),
                fileType: "js",
                initMode: "user-visible",
                showReadOnly: false,
                readOnly: true,
                wrapContent: true
              })
            }, "".concat(id, "-").concat(msgIndex));
          })
        }, id);
      }
      return null;
    })
  });
};
var consoleItemClassName = fakeCss;
var wrapperClassName = fakeCss;
var flexClassName = fakeCss;
var Header = function(_a2) {
  var currentTab = _a2.currentTab, setCurrentTab = _a2.setCurrentTab, node = _a2.node;
  var classNames = useClassNames();
  var buttonsClassName = classNames("console-header-button", [buttonClassName, roundedButtonClassName, fakeCss]);
  return jsxRuntimeExports.jsxs("div", {
    className: classNames("console-header", [wrapperClassName, flexClassName]),
    children: [jsxRuntimeExports.jsxs("p", {
      className: classNames("console-header-title", [fakeCss]),
      children: [jsxRuntimeExports.jsx(ConsoleIcon, {}), jsxRuntimeExports.jsx("span", {
        children: "Terminal"
      })]
    }), node && jsxRuntimeExports.jsxs("div", {
      className: classNames("console-header-actions", [flexClassName]),
      children: [jsxRuntimeExports.jsx("button", {
        className: buttonsClassName,
        "data-active": currentTab === "server",
        onClick: function() {
          return setCurrentTab("server");
        },
        type: "button",
        children: "Server"
      }), jsxRuntimeExports.jsx("button", {
        className: buttonsClassName,
        "data-active": currentTab === "client",
        onClick: function() {
          return setCurrentTab("client");
        },
        type: "button",
        children: "Client"
      })]
    })]
  });
};
var useSandpackConsole = function(_a2) {
  var clientId = _a2.clientId, _b = _a2.maxMessageCount, maxMessageCount = _b === void 0 ? MAX_MESSAGE_COUNT : _b, _c2 = _a2.showSyntaxError, showSyntaxError = _c2 === void 0 ? false : _c2, _d = _a2.resetOnPreviewRestart, resetOnPreviewRestart = _d === void 0 ? false : _d;
  var _e = reactExports.useState([]), logs = _e[0], setLogs = _e[1];
  var listen = useSandpack().listen;
  reactExports.useEffect(function() {
    var unsubscribe = listen(function(message) {
      if (resetOnPreviewRestart && message.type === "start") {
        setLogs([]);
      } else if (message.type === "console" && message.codesandbox) {
        var payloadLog = Array.isArray(message.log) ? message.log : [message.log];
        if (payloadLog.find(function(_a3) {
          var method = _a3.method;
          return method === "clear";
        })) {
          return setLogs([CLEAR_LOG]);
        }
        var logsMessages_1 = showSyntaxError ? payloadLog : payloadLog.filter(function(messageItem) {
          var _a3, _b2, _c22;
          var messagesWithoutSyntaxErrors = (_c22 = (_b2 = (_a3 = messageItem === null || messageItem === void 0 ? void 0 : messageItem.data) === null || _a3 === void 0 ? void 0 : _a3.filter) === null || _b2 === void 0 ? void 0 : _b2.call(_a3, function(dataItem) {
            if (typeof dataItem !== "string") return true;
            var matches = SYNTAX_ERROR_PATTERN.filter(function(lookFor) {
              return dataItem.startsWith(lookFor);
            });
            return matches.length === 0;
          })) !== null && _c22 !== void 0 ? _c22 : [];
          return messagesWithoutSyntaxErrors.length > 0;
        });
        if (!logsMessages_1) return;
        setLogs(function(prev) {
          var messages = __spreadArray(__spreadArray([], prev, true), logsMessages_1, true).filter(function(value, index2, self2) {
            return index2 === self2.findIndex(function(s) {
              return s.id === value.id;
            });
          });
          while (messages.length > maxMessageCount) {
            messages.shift();
          }
          return messages;
        });
      }
    }, clientId);
    return unsubscribe;
  }, [showSyntaxError, maxMessageCount, clientId, resetOnPreviewRestart]);
  return {
    logs,
    reset: function() {
      return setLogs([]);
    }
  };
};
reactExports.forwardRef(function(_a2, ref) {
  var _c2 = _a2.showHeader, showHeader = _c2 === void 0 ? true : _c2, _d = _a2.showSyntaxError, showSyntaxError = _d === void 0 ? false : _d, maxMessageCount = _a2.maxMessageCount, onLogsChange = _a2.onLogsChange, className = _a2.className, _f = _a2.showResetConsoleButton, showResetConsoleButton = _f === void 0 ? true : _f, _g = _a2.showRestartButton, showRestartButton = _g === void 0 ? true : _g, _h = _a2.resetOnPreviewRestart, resetOnPreviewRestart = _h === void 0 ? false : _h, _j = _a2.actionsChildren, actionsChildren = _j === void 0 ? jsxRuntimeExports.jsx(jsxRuntimeExports.Fragment, {}) : _j, _k = _a2.standalone, standalone = _k === void 0 ? false : _k, props = __rest(_a2, ["showHeader", "showSyntaxError", "maxMessageCount", "onLogsChange", "className", "showSetupProgress", "showResetConsoleButton", "showRestartButton", "resetOnPreviewRestart", "actionsChildren", "standalone"]);
  var environment = useSandpack().sandpack.environment;
  var _l = useSandpackClient(), iframe = _l.iframe, internalClientId = _l.clientId;
  var restart = useSandpackShell().restart;
  var _m = reactExports.useState(environment === "node" ? "server" : "client"), currentTab = _m[0], setCurrentTab = _m[1];
  var clientId = standalone ? internalClientId : void 0;
  var _o = useSandpackConsole({
    maxMessageCount,
    showSyntaxError,
    resetOnPreviewRestart,
    clientId
  }), consoleData = _o.logs, resetConsole = _o.reset;
  var _p = useSandpackShellStdout({
    maxMessageCount,
    clientId
  }), stdoutData = _p.logs, resetStdout = _p.reset;
  var wrapperRef = reactExports.useRef(null);
  reactExports.useEffect(function() {
    onLogsChange === null || onLogsChange === void 0 ? void 0 : onLogsChange(consoleData);
    if (wrapperRef.current) {
      wrapperRef.current.scrollTop = wrapperRef.current.scrollHeight;
    }
  }, [onLogsChange, consoleData, stdoutData, currentTab]);
  var isServerTab = currentTab === "server";
  var isNodeEnvironment = environment === "node";
  reactExports.useImperativeHandle(ref, function() {
    return {
      reset: function() {
        resetConsole();
        resetStdout();
      }
    };
  });
  var classNames = useClassNames();
  return jsxRuntimeExports.jsxs(SandpackStack, __assign({
    className: classNames("console", [fakeCss, className])
  }, props, {
    children: [showHeader && isNodeEnvironment && jsxRuntimeExports.jsx(Header, {
      currentTab,
      node: isNodeEnvironment,
      setCurrentTab
    }), jsxRuntimeExports.jsx("div", {
      ref: wrapperRef,
      className: classNames("console-list", [fakeCss]),
      children: isServerTab ? jsxRuntimeExports.jsx(StdoutList, {
        data: stdoutData
      }) : jsxRuntimeExports.jsx(ConsoleList, {
        data: consoleData
      })
    }), jsxRuntimeExports.jsxs("div", {
      className: classNames("console-actions", [fakeCss]),
      children: [actionsChildren, showRestartButton && isServerTab && jsxRuntimeExports.jsx(RoundedButton, {
        onClick: function() {
          restart();
          resetConsole();
          resetStdout();
        },
        children: jsxRuntimeExports.jsx(RestartIcon, {})
      }), showResetConsoleButton && jsxRuntimeExports.jsx(RoundedButton, {
        onClick: function() {
          if (currentTab === "client") {
            resetConsole();
          } else {
            resetStdout();
          }
        },
        children: jsxRuntimeExports.jsx(CleanIcon, {})
      })]
    }), standalone && jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, {
      children: [jsxRuntimeExports.jsx(DependenciesProgress, {
        clientId
      }), jsxRuntimeExports.jsx("iframe", {
        ref: iframe
      })]
    })]
  }));
});
var SandpackClient = (
  /** @class */
  function() {
    function SandpackClient2(iframeSelector, sandboxSetup, options) {
      if (options === void 0) {
        options = {};
      }
      this.status = "idle";
      this.options = options;
      this.sandboxSetup = sandboxSetup;
      this.iframeSelector = iframeSelector;
    }
    SandpackClient2.prototype.updateOptions = function(options) {
      if (!dequal(this.options, options)) {
        this.options = options;
        this.updateSandbox();
      }
    };
    SandpackClient2.prototype.updateSandbox = function(_sandboxSetup, _isInitializationCompile) {
      if (_sandboxSetup === void 0) {
        _sandboxSetup = this.sandboxSetup;
      }
      throw Error("Method not implemented");
    };
    SandpackClient2.prototype.destroy = function() {
      throw Error("Method not implemented");
    };
    SandpackClient2.prototype.dispatch = function(_message) {
      throw Error("Method not implemented");
    };
    SandpackClient2.prototype.listen = function(_listener) {
      throw Error("Method not implemented");
    };
    return SandpackClient2;
  }()
);
var EventEmitter = (
  /** @class */
  function() {
    function EventEmitter2() {
      this.listeners = {};
      this.listenersCount = 0;
      this.channelId = Math.floor(Math.random() * 1e6);
      this.listeners = [];
    }
    EventEmitter2.prototype.cleanup = function() {
      this.listeners = {};
      this.listenersCount = 0;
    };
    EventEmitter2.prototype.dispatch = function(message) {
      Object.values(this.listeners).forEach(function(listener) {
        return listener(message);
      });
    };
    EventEmitter2.prototype.listener = function(listener) {
      var _this = this;
      if (typeof listener !== "function") {
        return function() {
          return;
        };
      }
      var listenerId = this.listenersCount;
      this.listeners[listenerId] = listener;
      this.listenersCount++;
      return function() {
        delete _this.listeners[listenerId];
      };
    };
    return EventEmitter2;
  }()
);
function isCommand(char) {
  return /[a-zA-Z.]/.test(char);
}
function isAlpha(char) {
  return /[a-zA-Z]/.test(char);
}
function isWhitespace(char) {
  return /\s/.test(char);
}
function isOperator(char) {
  return /[&|]/.test(char);
}
function isArgument(char) {
  return /-/.test(char);
}
function isString(char) {
  return /["']/.test(char);
}
function isEnvVar(char) {
  return isAlpha(char) && char === char.toUpperCase();
}
var TokenType;
(function(TokenType2) {
  TokenType2["OR"] = "OR";
  TokenType2["AND"] = "AND";
  TokenType2["PIPE"] = "PIPE";
  TokenType2["Command"] = "Command";
  TokenType2["Argument"] = "Argument";
  TokenType2["String"] = "String";
  TokenType2["EnvVar"] = "EnvVar";
})(TokenType || (TokenType = {}));
var operators = /* @__PURE__ */ new Map([
  ["&&", { type: TokenType.AND }],
  ["||", { type: TokenType.OR }],
  ["|", { type: TokenType.PIPE }],
  ["-", { type: TokenType.Argument }]
]);
function tokenize(input) {
  var current = 0;
  var tokens = [];
  function parseCommand() {
    var value = "";
    while (isCommand(input[current]) && current < input.length) {
      value += input[current];
      current++;
    }
    return { type: TokenType.Command, value };
  }
  function parseOperator() {
    var value = "";
    while (isOperator(input[current]) && current < input.length) {
      value += input[current];
      current++;
    }
    return operators.get(value);
  }
  function parseArgument() {
    var value = "";
    while ((isArgument(input[current]) || isAlpha(input[current])) && current < input.length) {
      value += input[current];
      current++;
    }
    return { type: TokenType.Argument, value };
  }
  function parseString() {
    var openCloseQuote = input[current];
    var value = input[current];
    current++;
    while (input[current] !== openCloseQuote && current < input.length) {
      value += input[current];
      current++;
    }
    value += input[current];
    current++;
    return { type: TokenType.String, value };
  }
  function parseEnvVars() {
    var value = {};
    var parseSingleEnv = function() {
      var key = "";
      var pair = "";
      while (input[current] !== "=" && current < input.length) {
        key += input[current];
        current++;
      }
      if (input[current] === "=") {
        current++;
      }
      while (input[current] !== " " && current < input.length) {
        pair += input[current];
        current++;
      }
      value[key] = pair;
    };
    while (isEnvVar(input[current]) && current < input.length) {
      parseSingleEnv();
      current++;
    }
    return { type: TokenType.EnvVar, value };
  }
  while (current < input.length) {
    var currentChar = input[current];
    if (isWhitespace(currentChar)) {
      current++;
      continue;
    }
    switch (true) {
      case isEnvVar(currentChar):
        tokens.push(parseEnvVars());
        break;
      case isCommand(currentChar):
        tokens.push(parseCommand());
        break;
      case isOperator(currentChar):
        tokens.push(parseOperator());
        break;
      case isArgument(currentChar):
        tokens.push(parseArgument());
        break;
      case isString(currentChar):
        tokens.push(parseString());
        break;
      default:
        throw new Error("Unknown character: ".concat(currentChar));
    }
  }
  return tokens;
}
var counter = 0;
function generateRandomId() {
  var now = Date.now();
  var randomNumber = Math.round(Math.random() * 1e4);
  var count = counter += 1;
  return (+"".concat(now).concat(randomNumber).concat(count)).toString(16);
}
var writeBuffer = function(content) {
  if (typeof content === "string") {
    return new TextEncoder().encode(content);
  } else {
    return content;
  }
};
var readBuffer$1 = function(content) {
  if (typeof content === "string") {
    return content;
  } else {
    return new TextDecoder().decode(content);
  }
};
var fromBundlerFilesToFS = function(files) {
  return Object.entries(files).reduce(function(acc, _a2) {
    var key = _a2[0], value = _a2[1];
    acc[key] = writeBuffer(value.code);
    return acc;
  }, {});
};
var findStartScriptPackageJson = function(packageJson) {
  var scripts2 = {};
  var possibleKeys = ["dev", "start"];
  try {
    scripts2 = JSON.parse(packageJson).scripts;
  } catch (e) {
    throw createError("Could not parse package.json file: " + e.message);
  }
  invariant(scripts2, "Failed to start. Please provide a `start` or `dev` script on the package.json");
  var _loop_1 = function(index3) {
    if (possibleKeys[index3] in scripts2) {
      var script = possibleKeys[index3];
      var candidate = scripts2[script];
      var env_1 = {};
      var command_1 = "";
      var args_1 = [];
      tokenize(candidate).forEach(function(item) {
        var commandNotFoundYet = command_1 === "";
        if (item.type === TokenType.EnvVar) {
          env_1 = item.value;
        }
        if (item.type === TokenType.Command && commandNotFoundYet) {
          command_1 = item.value;
        }
        if (item.type === TokenType.Argument || !commandNotFoundYet && item.type === TokenType.Command) {
          args_1.push(item.value);
        }
      });
      return { value: [command_1, args_1, { env: env_1 }] };
    }
  };
  for (var index2 = 0; index2 < possibleKeys.length; index2++) {
    var state_1 = _loop_1(index2);
    if (typeof state_1 === "object")
      return state_1.value;
  }
  throw createError("Failed to start. Please provide a `start` or `dev` script on the package.json");
};
var getMessageFromError = function(error) {
  if (typeof error === "string")
    return error;
  if (typeof error === "object" && "message" in error) {
    return error.message;
  }
  return createError("The server could not be reached. Make sure that the node script is running and that a port has been started.");
};
var consoleHook = `var t="undefined"!=typeof globalThis?globalThis:"undefined"!=typeof window?window:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{};function r(t){return t&&t.__esModule&&Object.prototype.hasOwnProperty.call(t,"default")?t.default:t}var e={},n={};!function(t){t.__esModule=!0,t.default=["log","debug","info","warn","error","table","clear","time","timeEnd","count","assert","command","result"]}(n);var a,o={},i={};(a=i).__esModule=!0,a.default=function(){var t=function(){return(65536*(1+Math.random())|0).toString(16).substring(1)};return t()+t()+"-"+t()+"-"+t()+"-"+t()+"-"+t()+"-"+Date.now()};var u={},s={__esModule:!0};s.update=s.state=void 0,s.update=function(t){s.state=t};var f={},c={};!function(r){var e=t&&t.__assign||function(){return e=Object.assign||function(t){for(var r,e=1,n=arguments.length;e<n;e++)for(var a in r=arguments[e])Object.prototype.hasOwnProperty.call(r,a)&&(t[a]=r[a]);return t},e.apply(this,arguments)};r.__esModule=!0,r.initialState=void 0,r.initialState={timings:{},count:{}};var n=function(){return"undefined"!=typeof performance&&performance.now?performance.now():Date.now()};r.default=function(t,a){var o,i,u;switch(void 0===t&&(t=r.initialState),a.type){case"COUNT":var s=t.count[a.name]||0;return e(e({},t),{count:e(e({},t.count),(o={},o[a.name]=s+1,o))});case"TIME_START":return e(e({},t),{timings:e(e({},t.timings),(i={},i[a.name]={start:n()},i))});case"TIME_END":var f=t.timings[a.name],c=n(),l=c-f.start;return e(e({},t),{timings:e(e({},t.timings),(u={},u[a.name]=e(e({},f),{end:c,time:l}),u))});default:return t}}}(c),function(r){var e=t&&t.__importDefault||function(t){return t&&t.__esModule?t:{default:t}};r.__esModule=!0;var n=e(c),a=s;r.default=function(t){a.update(n.default(a.state,t))}}(f);var l={__esModule:!0};l.timeEnd=l.timeStart=l.count=void 0,l.count=function(t){return{type:"COUNT",name:t}},l.timeStart=function(t){return{type:"TIME_START",name:t}},l.timeEnd=function(t){return{type:"TIME_END",name:t}};var d=t&&t.__importDefault||function(t){return t&&t.__esModule?t:{default:t}};u.__esModule=!0,u.stop=u.start=void 0;var p=s,h=d(f),m=l;u.start=function(t){h.default(m.timeStart(t))},u.stop=function(t){var r=null===p.state||void 0===p.state?void 0:p.state.timings[t];return r&&!r.end?(h.default(m.timeEnd(t)),{method:"log",data:[t+": "+p.state.timings[t].time+"ms"]}):{method:"warn",data:["Timer '"+t+"' does not exist"]}};var y={},v=t&&t.__importDefault||function(t){return t&&t.__esModule?t:{default:t}};y.__esModule=!0,y.increment=void 0;var _=s,b=v(f),g=l;y.increment=function(t){return b.default(g.count(t)),{method:"log",data:[t+": "+_.state.count[t]]}};var M={},T=t&&t.__spreadArrays||function(){for(var t=0,r=0,e=arguments.length;r<e;r++)t+=arguments[r].length;var n=Array(t),a=0;for(r=0;r<e;r++)for(var o=arguments[r],i=0,u=o.length;i<u;i++,a++)n[a]=o[i];return n};M.__esModule=!0,M.test=void 0,M.test=function(t){for(var r=[],e=1;e<arguments.length;e++)r[e-1]=arguments[e];return!t&&(0===r.length&&r.push("console.assert"),{method:"error",data:T(["Assertion failed:"],r)})},function(r){var e=t&&t.__assign||function(){return e=Object.assign||function(t){for(var r,e=1,n=arguments.length;e<n;e++)for(var a in r=arguments[e])Object.prototype.hasOwnProperty.call(r,a)&&(t[a]=r[a]);return t},e.apply(this,arguments)},n=t&&t.__createBinding||(Object.create?function(t,r,e,n){void 0===n&&(n=e),Object.defineProperty(t,n,{enumerable:!0,get:function(){return r[e]}})}:function(t,r,e,n){void 0===n&&(n=e),t[n]=r[e]}),a=t&&t.__setModuleDefault||(Object.create?function(t,r){Object.defineProperty(t,"default",{enumerable:!0,value:r})}:function(t,r){t.default=r}),o=t&&t.__importStar||function(t){if(t&&t.__esModule)return t;var r={};if(null!=t)for(var e in t)"default"!==e&&Object.prototype.hasOwnProperty.call(t,e)&&n(r,t,e);return a(r,t),r},s=t&&t.__spreadArrays||function(){for(var t=0,r=0,e=arguments.length;r<e;r++)t+=arguments[r].length;var n=Array(t),a=0;for(r=0;r<e;r++)for(var o=arguments[r],i=0,u=o.length;i<u;i++,a++)n[a]=o[i];return n},f=t&&t.__importDefault||function(t){return t&&t.__esModule?t:{default:t}};r.__esModule=!0;var c=f(i),l=o(u),d=o(y),p=o(M);r.default=function(t,r,n){var a=n||c.default();switch(t){case"clear":return{method:t,id:a};case"count":return!!(o="string"==typeof r[0]?r[0]:"default")&&e(e({},d.increment(o)),{id:a});case"time":case"timeEnd":var o;return!!(o="string"==typeof r[0]?r[0]:"default")&&("time"===t?(l.start(o),!1):e(e({},l.stop(o)),{id:a}));case"assert":if(0!==r.length){var i=p.test.apply(p,s([r[0]],r.slice(1)));if(i)return e(e({},i),{id:a})}return!1;case"error":return{method:t,id:a,data:r.map((function(t){try{return t.stack||t}catch(r){return t}}))};default:return{method:t,id:a,data:r}}}}(o);var S={},O={};!function(t){var r;t.__esModule=!0,function(t){t[t.infinity=0]="infinity",t[t.minusInfinity=1]="minusInfinity",t[t.minusZero=2]="minusZero"}(r||(r={})),t.default={type:"Arithmetic",lookup:Number,shouldTransform:function(t,r){return"number"===t&&(r===1/0||r===-1/0||function(t){return 1/t==-1/0}(r))},toSerializable:function(t){return t===1/0?r.infinity:t===-1/0?r.minusInfinity:r.minusZero},fromSerializable:function(t){return t===r.infinity?1/0:t===r.minusInfinity?-1/0:t===r.minusZero?-0:t}}}(O);var w={};!function(t){t.__esModule=!0,t.default={type:"Function",lookup:Function,shouldTransform:function(t,r){return"function"==typeof r},toSerializable:function(t){var r="";try{r=t.toString().substring(r.indexOf("{")+1,r.lastIndexOf("}"))}catch(t){}return{name:t.name,body:r,proto:Object.getPrototypeOf(t).constructor.name}},fromSerializable:function(t){try{var r=function(){};return"string"==typeof t.name&&Object.defineProperty(r,"name",{value:t.name,writable:!1}),"string"==typeof t.body&&Object.defineProperty(r,"body",{value:t.body,writable:!1}),"string"==typeof t.proto&&(r.constructor={name:t.proto}),r}catch(r){return t}}}}(w);var A={};!function(t){var r;function e(t){for(var r={},e=0,n=t.attributes;e<n.length;e++){var a=n[e];r[a.name]=a.value}return r}t.__esModule=!0,t.default={type:"HTMLElement",shouldTransform:function(t,r){return r&&r.children&&"string"==typeof r.innerHTML&&"string"==typeof r.tagName},toSerializable:function(t){return{tagName:t.tagName.toLowerCase(),attributes:e(t),innerHTML:t.innerHTML}},fromSerializable:function(t){try{var e=(r||(r=document.implementation.createHTMLDocument("sandbox"))).createElement(t.tagName);e.innerHTML=t.innerHTML;for(var n=0,a=Object.keys(t.attributes);n<a.length;n++){var o=a[n];try{e.setAttribute(o,t.attributes[o])}catch(t){}}return e}catch(r){return t}}}}(A);var j={};!function(r){var e=t&&t.__assign||function(){return e=Object.assign||function(t){for(var r,e=1,n=arguments.length;e<n;e++)for(var a in r=arguments[e])Object.prototype.hasOwnProperty.call(r,a)&&(t[a]=r[a]);return t},e.apply(this,arguments)};r.__esModule=!0,r.default={type:"Map",shouldTransform:function(t,r){return r&&r.constructor&&"Map"===r.constructor.name},toSerializable:function(t){var r={};return t.forEach((function(t,e){var n="object"==typeof e?JSON.stringify(e):e;r[n]=t})),{name:"Map",body:r,proto:Object.getPrototypeOf(t).constructor.name}},fromSerializable:function(t){var r=t.body,n=e({},r);return"string"==typeof t.proto&&(n.constructor={name:t.proto}),n}}}(j);var z={};!function(t){t.__esModule=!0;var r="@t",e=/^#*@(t|r)$/,n=(0,eval)("this"),a="function"==typeof ArrayBuffer,o="function"==typeof Map,i="function"==typeof Set,u=["Int8Array","Uint8Array","Uint8ClampedArray","Int16Array","Uint16Array","Int32Array","Uint32Array","Float32Array","Float64Array"],s=Array.prototype.slice,f={serialize:function(t){return JSON.stringify(t)},deserialize:function(t){return JSON.parse(t)}},c=function(){function t(t,r){this.references=t,this.transforms=r,this.transformsMap=this._makeTransformsMap(),this.circularCandidates=[],this.circularCandidatesDescrs=[],this.circularRefCount=0}return t._createRefMark=function(t){var r=Object.create(null);return r["@r"]=t,r},t.prototype._createCircularCandidate=function(t,r,e){this.circularCandidates.push(t),this.circularCandidatesDescrs.push({parent:r,key:e,refIdx:-1})},t.prototype._applyTransform=function(t,e,n,a){var o=Object.create(null),i=a.toSerializable(t);return"object"==typeof i&&this._createCircularCandidate(t,e,n),o[r]=a.type,o.data=this._handleValue((function(){return i}),e,n),o},t.prototype._handleArray=function(t){for(var r=[],e=function(e){r[e]=n._handleValue((function(){return t[e]}),r,e)},n=this,a=0;a<t.length;a++)e(a);return r},t.prototype._handlePlainObject=function(t){var r,n,a=Object.create(null),o=function(r){if(Reflect.has(t,r)){var n=e.test(r)?"#"+r:r;a[n]=i._handleValue((function(){return t[r]}),a,n)}},i=this;for(var u in t)o(u);var s=null===(n=null===(r=null==t?void 0:t.__proto__)||void 0===r?void 0:r.constructor)||void 0===n?void 0:n.name;return s&&"Object"!==s&&(a.constructor={name:s}),a},t.prototype._handleObject=function(t,r,e){return this._createCircularCandidate(t,r,e),Array.isArray(t)?this._handleArray(t):this._handlePlainObject(t)},t.prototype._ensureCircularReference=function(r){var e=this.circularCandidates.indexOf(r);if(e>-1){var n=this.circularCandidatesDescrs[e];return-1===n.refIdx&&(n.refIdx=n.parent?++this.circularRefCount:0),t._createRefMark(n.refIdx)}return null},t.prototype._handleValue=function(t,r,e){try{var n=t(),a=typeof n,o="object"===a&&null!==n;if(o){var i=this._ensureCircularReference(n);if(i)return i}var u=this._findTransform(a,n);return u?this._applyTransform(n,r,e,u):o?this._handleObject(n,r,e):n}catch(t){try{return this._handleValue((function(){return t instanceof Error?t:new Error(t)}),r,e)}catch(t){return null}}},t.prototype._makeTransformsMap=function(){if(o){var t=new Map;return this.transforms.forEach((function(r){r.lookup&&t.set(r.lookup,r)})),t}},t.prototype._findTransform=function(t,r){if(o&&r&&r.constructor&&(null==(a=this.transformsMap.get(r.constructor))?void 0:a.shouldTransform(t,r)))return a;for(var e=0,n=this.transforms;e<n.length;e++){var a;if((a=n[e]).shouldTransform(t,r))return a}},t.prototype.transform=function(){for(var r=this,e=[this._handleValue((function(){return r.references}),null,null)],n=0,a=this.circularCandidatesDescrs;n<a.length;n++){var o=a[n];o.refIdx>0&&(e[o.refIdx]=o.parent[o.key],o.parent[o.key]=t._createRefMark(o.refIdx))}return e},t}(),l=function(){function t(t,r){this.activeTransformsStack=[],this.visitedRefs=Object.create(null),this.references=t,this.transformMap=r}return t.prototype._handlePlainObject=function(t){var r=Object.create(null);for(var n in"constructor"in t&&(t.constructor&&"string"==typeof t.constructor.name||(t.constructor={name:"Object"})),t)t.hasOwnProperty(n)&&(this._handleValue(t[n],t,n),e.test(n)&&(r[n.substring(1)]=t[n],delete t[n]));for(var a in r)t[a]=r[a]},t.prototype._handleTransformedObject=function(t,e,n){var a=t[r],o=this.transformMap[a];if(!o)throw new Error("Can't find transform for \\""+a+'" type.');this.activeTransformsStack.push(t),this._handleValue(t.data,t,"data"),this.activeTransformsStack.pop(),e[n]=o.fromSerializable(t.data)},t.prototype._handleCircularSelfRefDuringTransform=function(t,r,e){var n=this.references;Object.defineProperty(r,e,{val:void 0,configurable:!0,enumerable:!0,get:function(){return void 0===this.val&&(this.val=n[t]),this.val},set:function(t){this.val=t}})},t.prototype._handleCircularRef=function(t,r,e){this.activeTransformsStack.includes(this.references[t])?this._handleCircularSelfRefDuringTransform(t,r,e):(this.visitedRefs[t]||(this.visitedRefs[t]=!0,this._handleValue(this.references[t],this.references,t)),r[e]=this.references[t])},t.prototype._handleValue=function(t,e,n){if("object"==typeof t&&null!==t){var a=t["@r"];if(void 0!==a)this._handleCircularRef(a,e,n);else if(t[r])this._handleTransformedObject(t,e,n);else if(Array.isArray(t))for(var o=0;o<t.length;o++)this._handleValue(t[o],t,o);else this._handlePlainObject(t)}},t.prototype.transform=function(){return this.visitedRefs[0]=!0,this._handleValue(this.references[0],this.references,0),this.references[0]},t}(),d=[{type:"[[NaN]]",shouldTransform:function(t,r){return"number"===t&&isNaN(r)},toSerializable:function(){return""},fromSerializable:function(){return NaN}},{type:"[[undefined]]",shouldTransform:function(t){return"undefined"===t},toSerializable:function(){return""},fromSerializable:function(){}},{type:"[[Date]]",lookup:Date,shouldTransform:function(t,r){return r instanceof Date},toSerializable:function(t){return t.getTime()},fromSerializable:function(t){var r=new Date;return r.setTime(t),r}},{type:"[[RegExp]]",lookup:RegExp,shouldTransform:function(t,r){return r instanceof RegExp},toSerializable:function(t){var r={src:t.source,flags:""};return t.globalThis&&(r.flags+="g"),t.ignoreCase&&(r.flags+="i"),t.multiline&&(r.flags+="m"),r},fromSerializable:function(t){return new RegExp(t.src,t.flags)}},{type:"[[Error]]",lookup:Error,shouldTransform:function(t,r){return r instanceof Error},toSerializable:function(t){var r,e;return t.stack||null===(e=(r=Error).captureStackTrace)||void 0===e||e.call(r,t),{name:t.name,message:t.message,stack:t.stack}},fromSerializable:function(t){var r=new(n[t.name]||Error)(t.message);return r.stack=t.stack,r}},{type:"[[ArrayBuffer]]",lookup:a&&ArrayBuffer,shouldTransform:function(t,r){return a&&r instanceof ArrayBuffer},toSerializable:function(t){var r=new Int8Array(t);return s.call(r)},fromSerializable:function(t){if(a){var r=new ArrayBuffer(t.length);return new Int8Array(r).set(t),r}return t}},{type:"[[TypedArray]]",shouldTransform:function(t,r){if(a)return ArrayBuffer.isView(r)&&!(r instanceof DataView);for(var e=0,o=u;e<o.length;e++){var i=o[e];if("function"==typeof n[i]&&r instanceof n[i])return!0}return!1},toSerializable:function(t){return{ctorName:t.constructor.name,arr:s.call(t)}},fromSerializable:function(t){return"function"==typeof n[t.ctorName]?new n[t.ctorName](t.arr):t.arr}},{type:"[[Map]]",lookup:o&&Map,shouldTransform:function(t,r){return o&&r instanceof Map},toSerializable:function(t){var r=[];return t.forEach((function(t,e){r.push(e),r.push(t)})),r},fromSerializable:function(t){if(o){for(var r=new Map,e=0;e<t.length;e+=2)r.set(t[e],t[e+1]);return r}for(var n=[],a=0;a<t.length;a+=2)n.push([t[e],t[e+1]]);return n}},{type:"[[Set]]",lookup:i&&Set,shouldTransform:function(t,r){return i&&r instanceof Set},toSerializable:function(t){var r=[];return t.forEach((function(t){r.push(t)})),r},fromSerializable:function(t){if(i){for(var r=new Set,e=0;e<t.length;e++)r.add(t[e]);return r}return t}}],p=function(){function t(t){this.transforms=[],this.transformsMap=Object.create(null),this.serializer=t||f,this.addTransforms(d)}return t.prototype.addTransforms=function(t){for(var r=0,e=t=Array.isArray(t)?t:[t];r<e.length;r++){var n=e[r];if(this.transformsMap[n.type])throw new Error('Transform with type "'+n.type+'" was already added.');this.transforms.push(n),this.transformsMap[n.type]=n}return this},t.prototype.removeTransforms=function(t){for(var r=0,e=t=Array.isArray(t)?t:[t];r<e.length;r++){var n=e[r],a=this.transforms.indexOf(n);a>-1&&this.transforms.splice(a,1),delete this.transformsMap[n.type]}return this},t.prototype.encode=function(t){var r=new c(t,this.transforms).transform();return this.serializer.serialize(r)},t.prototype.decode=function(t){var r=this.serializer.deserialize(t);return new l(r,this.transformsMap).transform()},t}();t.default=p}(z);var E=t&&t.__importDefault||function(t){return t&&t.__esModule?t:{default:t}};S.__esModule=!0,S.Decode=P=S.Encode=void 0;var k=E(O),C=E(w),D=E(A),I=E(j),N=E(z),R=[D.default,C.default,k.default,I.default],x=new N.default;x.addTransforms(R);var P=S.Encode=function(t){return JSON.parse(x.encode(t))};S.Decode=function(t){return x.decode(JSON.stringify(t))},function(r){var e=t&&t.__importDefault||function(t){return t&&t.__esModule?t:{default:t}};r.__esModule=!0;var a=e(n),i=e(o),u=S;r.default=function(t,r,e){void 0===e&&(e=!0);for(var n=t,o={pointers:{},src:{npm:"https://npmjs.com/package/console-feed",github:"https://github.com/samdenty99/console-feed"}},s=function(t){var a=n[t];n[t]=function(){a.apply(this,arguments);var n=[].slice.call(arguments);setTimeout((function(){var a=i.default(t,n);if(a){var o=a;e&&(o=u.Encode(a)),r(o,a)}}))},o.pointers[t]=a},f=0,c=a.default;f<c.length;f++)s(c[f]);return n.feed=o,n}}(e),r(e)(window.console,(function(t){var r=P(t);parent.postMessage({type:"console",codesandbox:!0,log:Array.isArray(r)?r[0]:r,channelId:scope.channelId},"*")}));
`;
function loadPreviewIframe(iframe, url) {
  return __awaiter$2(this, void 0, void 0, function() {
    var contentWindow, TIME_OUT, MAX_MANY_TIRES, tries, timeout;
    return __generator$2(this, function(_a2) {
      contentWindow = iframe.contentWindow;
      nullthrows(contentWindow, "Failed to await preview iframe: no content window found");
      TIME_OUT = 9e4;
      MAX_MANY_TIRES = 20;
      tries = 0;
      return [2, new Promise(function(resolve, reject) {
        var triesToSetUrl = function() {
          var onLoadPage = function() {
            clearTimeout(timeout);
            tries = MAX_MANY_TIRES;
            resolve();
            iframe.removeEventListener("load", onLoadPage);
          };
          if (tries >= MAX_MANY_TIRES) {
            reject(createError("Could not able to connect to preview."));
            return;
          }
          iframe.setAttribute("src", url);
          timeout = setTimeout(function() {
            triesToSetUrl();
            iframe.removeEventListener("load", onLoadPage);
          }, TIME_OUT);
          tries = tries + 1;
          iframe.addEventListener("load", onLoadPage);
        };
        iframe.addEventListener("error", function() {
          return reject(new Error("Iframe error"));
        });
        iframe.addEventListener("abort", function() {
          return reject(new Error("Aborted"));
        });
        triesToSetUrl();
      })];
    });
  });
}
var setPreviewIframeProperties = function(iframe, options) {
  iframe.style.border = "0";
  iframe.style.width = options.width || "100%";
  iframe.style.height = options.height || "100%";
  iframe.style.overflow = "hidden";
  iframe.allow = "cross-origin-isolated";
};
function setupHistoryListeners(_a2) {
  var scope = _a2.scope;
  var origHistoryProto = window.history.__proto__;
  var historyList = [];
  var historyPosition = 0;
  var dispatchMessage = function(url) {
    parent.postMessage({
      type: "urlchange",
      url,
      back: historyPosition > 0,
      forward: historyPosition < historyList.length - 1,
      channelId: scope.channelId
    }, "*");
  };
  function pushHistory(url, state) {
    historyList.splice(historyPosition + 1);
    historyList.push({ url, state });
    historyPosition = historyList.length - 1;
  }
  Object.assign(window.history, {
    go: function(delta) {
      var newPos = historyPosition + delta;
      if (newPos >= 0 && newPos <= historyList.length - 1) {
        historyPosition = newPos;
        var _a3 = historyList[historyPosition], url = _a3.url, state = _a3.state;
        origHistoryProto.replaceState.call(window.history, state, "", url);
        var newURL = document.location.href;
        dispatchMessage(newURL);
        window.dispatchEvent(new PopStateEvent("popstate", { state }));
      }
    },
    back: function() {
      window.history.go(-1);
    },
    forward: function() {
      window.history.go(1);
    },
    pushState: function(state, title, url) {
      origHistoryProto.replaceState.call(window.history, state, title, url);
      pushHistory(url, state);
      dispatchMessage(document.location.href);
    },
    replaceState: function(state, title, url) {
      origHistoryProto.replaceState.call(window.history, state, title, url);
      historyList[historyPosition] = { state, url };
      dispatchMessage(document.location.href);
    }
  });
  function handleMessage(_a3) {
    var data = _a3.data;
    if (data.type === "urlback") {
      history.back();
    } else if (data.type === "urlforward") {
      history.forward();
    } else if (data.type === "refresh") {
      document.location.reload();
    }
  }
  window.addEventListener("message", handleMessage);
}
function watchResize(_a2) {
  var scope = _a2.scope;
  var lastHeight = 0;
  function getDocumentHeight() {
    if (typeof window === "undefined")
      return 0;
    var body = document.body;
    var html2 = document.documentElement;
    return Math.max(body.scrollHeight, body.offsetHeight, html2.offsetHeight);
  }
  function sendResizeEvent() {
    var height = getDocumentHeight();
    if (lastHeight !== height) {
      window.parent.postMessage({
        type: "resize",
        height,
        codesandbox: true,
        channelId: scope.channelId
      }, "*");
    }
    lastHeight = height;
  }
  sendResizeEvent();
  var throttle;
  var observer = new MutationObserver(function() {
    if (throttle === void 0) {
      sendResizeEvent();
      throttle = setTimeout(function() {
        throttle = void 0;
      }, 300);
    }
  });
  observer.observe(document, {
    attributes: true,
    childList: true,
    subtree: true
  });
  setInterval(sendResizeEvent, 300);
}
var scripts = [
  { code: setupHistoryListeners.toString(), id: "historyListener" },
  {
    code: "function consoleHook({ scope }) {" + consoleHook + "\n};",
    id: "consoleHook"
  },
  { code: watchResize.toString(), id: "watchResize" }
];
var injectScriptToIframe = function(iframe, channelId) {
  scripts.forEach(function(_a2) {
    var _b;
    var code = _a2.code, id = _a2.id;
    var message = {
      uid: id,
      type: INJECT_MESSAGE_TYPE,
      code: "exports.activate = ".concat(code),
      scope: { channelId }
    };
    (_b = iframe.contentWindow) === null || _b === void 0 ? void 0 : _b.postMessage(message, "*");
  });
};
var SandpackNode = (
  /** @class */
  function(_super) {
    __extends(SandpackNode2, _super);
    function SandpackNode2(selector, sandboxInfo, options) {
      if (options === void 0) {
        options = {};
      }
      var _this = _super.call(this, selector, sandboxInfo, __assign$2(__assign$2({}, options), { bundlerURL: options.bundlerURL })) || this;
      _this._modulesCache = /* @__PURE__ */ new Map();
      _this.messageChannelId = generateRandomId();
      _this._initPromise = null;
      _this.emitter = new EventEmitter();
      _this.manageIframes(selector);
      _this.emulator = new Nodebox({
        iframe: _this.emulatorIframe,
        runtimeUrl: _this.options.bundlerURL
      });
      _this.updateSandbox(sandboxInfo);
      return _this;
    }
    SandpackNode2.prototype._init = function(files) {
      return __awaiter$2(this, void 0, void 0, function() {
        return __generator$2(this, function(_a2) {
          switch (_a2.label) {
            case 0:
              return [4, this.emulator.connect()];
            case 1:
              _a2.sent();
              return [4, this.emulator.fs.init(files)];
            case 2:
              _a2.sent();
              return [4, this.globalListeners()];
            case 3:
              _a2.sent();
              return [
                2
                /*return*/
              ];
          }
        });
      });
    };
    SandpackNode2.prototype.compile = function(files) {
      return __awaiter$2(this, void 0, void 0, function() {
        var shellId, err_1;
        return __generator$2(this, function(_a2) {
          switch (_a2.label) {
            case 0:
              _a2.trys.push([0, 5, , 6]);
              this.status = "initializing";
              this.dispatch({ type: "start", firstLoad: true });
              if (!this._initPromise) {
                this._initPromise = this._init(files);
              }
              return [4, this._initPromise];
            case 1:
              _a2.sent();
              this.dispatch({ type: "connected" });
              return [4, this.createShellProcessFromTask(files)];
            case 2:
              shellId = _a2.sent().id;
              return [4, this.createPreviewURLFromId(shellId)];
            case 3:
              _a2.sent();
              return [4, this.setLocationURLIntoIFrame()];
            case 4:
              _a2.sent();
              this.dispatchDoneMessage();
              return [3, 6];
            case 5:
              err_1 = _a2.sent();
              this.dispatch({
                type: "action",
                action: "notification",
                notificationType: "error",
                title: getMessageFromError(err_1)
              });
              this.dispatch({ type: "done", compilatonError: true });
              return [3, 6];
            case 6:
              return [
                2
                /*return*/
              ];
          }
        });
      });
    };
    SandpackNode2.prototype.createShellProcessFromTask = function(files) {
      return __awaiter$2(this, void 0, void 0, function() {
        var packageJsonContent;
        var _a2;
        var _this = this;
        return __generator$2(this, function(_b) {
          switch (_b.label) {
            case 0:
              packageJsonContent = readBuffer$1(files["/package.json"]);
              this.emulatorCommand = findStartScriptPackageJson(packageJsonContent);
              this.emulatorShellProcess = this.emulator.shell.create();
              return [4, this.emulatorShellProcess.on("exit", function(exitCode) {
                _this.dispatch({
                  type: "action",
                  action: "notification",
                  notificationType: "error",
                  title: createError("Error: process.exit(".concat(exitCode, ") called."))
                });
              })];
            case 1:
              _b.sent();
              return [4, this.emulatorShellProcess.on("progress", function(data) {
                var _a3, _b2;
                if (data.state === "command_running" || data.state === "starting_command") {
                  _this.dispatch({
                    type: "shell/progress",
                    data: __assign$2(__assign$2({}, data), { command: [
                      (_a3 = _this.emulatorCommand) === null || _a3 === void 0 ? void 0 : _a3[0],
                      (_b2 = _this.emulatorCommand) === null || _b2 === void 0 ? void 0 : _b2[1].join(" ")
                    ].join(" ") })
                  });
                  _this.status = "installing-dependencies";
                  return;
                }
                _this.dispatch({ type: "shell/progress", data });
              })];
            case 2:
              _b.sent();
              this.emulatorShellProcess.stdout.on("data", function(data) {
                _this.dispatch({ type: "stdout", payload: { data, type: "out" } });
              });
              this.emulatorShellProcess.stderr.on("data", function(data) {
                _this.dispatch({ type: "stdout", payload: { data, type: "err" } });
              });
              return [4, (_a2 = this.emulatorShellProcess).runCommand.apply(_a2, this.emulatorCommand)];
            case 3:
              return [2, _b.sent()];
          }
        });
      });
    };
    SandpackNode2.prototype.createPreviewURLFromId = function(id) {
      var _a2;
      return __awaiter$2(this, void 0, void 0, function() {
        var url;
        return __generator$2(this, function(_b) {
          switch (_b.label) {
            case 0:
              this.iframePreviewUrl = void 0;
              return [4, this.emulator.preview.getByShellId(id)];
            case 1:
              url = _b.sent().url;
              this.iframePreviewUrl = url + ((_a2 = this.options.startRoute) !== null && _a2 !== void 0 ? _a2 : "");
              return [
                2
                /*return*/
              ];
          }
        });
      });
    };
    SandpackNode2.prototype.manageIframes = function(selector) {
      var _a2;
      if (typeof selector === "string") {
        var element = document.querySelector(selector);
        nullthrows(element, "The element '".concat(selector, "' was not found"));
        this.iframe = document.createElement("iframe");
        element === null || element === void 0 ? void 0 : element.appendChild(this.iframe);
      } else {
        this.iframe = selector;
      }
      setPreviewIframeProperties(this.iframe, this.options);
      nullthrows(this.iframe.parentNode, "The given iframe does not have a parent.");
      this.emulatorIframe = document.createElement("iframe");
      this.emulatorIframe.classList.add("sp-bridge-frame");
      (_a2 = this.iframe.parentNode) === null || _a2 === void 0 ? void 0 : _a2.appendChild(this.emulatorIframe);
    };
    SandpackNode2.prototype.setLocationURLIntoIFrame = function() {
      return __awaiter$2(this, void 0, void 0, function() {
        return __generator$2(this, function(_a2) {
          switch (_a2.label) {
            case 0:
              if (!this.iframePreviewUrl) return [3, 2];
              return [4, loadPreviewIframe(this.iframe, this.iframePreviewUrl)];
            case 1:
              _a2.sent();
              _a2.label = 2;
            case 2:
              return [
                2
                /*return*/
              ];
          }
        });
      });
    };
    SandpackNode2.prototype.dispatchDoneMessage = function() {
      this.status = "done";
      this.dispatch({ type: "done", compilatonError: false });
      if (this.iframePreviewUrl) {
        this.dispatch({
          type: "urlchange",
          url: this.iframePreviewUrl,
          back: false,
          forward: false
        });
      }
    };
    SandpackNode2.prototype.globalListeners = function() {
      return __awaiter$2(this, void 0, void 0, function() {
        var _this = this;
        return __generator$2(this, function(_a2) {
          switch (_a2.label) {
            case 0:
              window.addEventListener("message", function(event) {
                if (event.data.type === PREVIEW_LOADED_MESSAGE_TYPE) {
                  injectScriptToIframe(_this.iframe, _this.messageChannelId);
                }
                if (event.data.type === "urlchange" && event.data.channelId === _this.messageChannelId) {
                  _this.dispatch({
                    type: "urlchange",
                    url: event.data.url,
                    back: event.data.back,
                    forward: event.data.forward
                  });
                } else if (event.data.channelId === _this.messageChannelId) {
                  _this.dispatch(event.data);
                }
              });
              return [4, this.emulator.fs.watch(["*"], [
                ".next",
                "node_modules",
                "build",
                "dist",
                "vendor",
                ".config",
                ".vuepress"
              ], function(message) {
                return __awaiter$2(_this, void 0, void 0, function() {
                  var event, path, type, _a3, content, newContent, err_2;
                  return __generator$2(this, function(_b) {
                    switch (_b.label) {
                      case 0:
                        if (!message)
                          return [
                            2
                            /*return*/
                          ];
                        event = message;
                        path = "newPath" in event ? event.newPath : "path" in event ? event.path : "";
                        return [4, this.emulator.fs.stat(path)];
                      case 1:
                        type = _b.sent().type;
                        if (type !== "file")
                          return [2, null];
                        _b.label = 2;
                      case 2:
                        _b.trys.push([2, 10, , 11]);
                        _a3 = event.type;
                        switch (_a3) {
                          case "change":
                            return [3, 3];
                          case "create":
                            return [3, 3];
                          case "remove":
                            return [3, 5];
                          case "rename":
                            return [3, 6];
                          case "close":
                            return [3, 8];
                        }
                        return [3, 9];
                      case 3:
                        return [4, this.emulator.fs.readFile(event.path, "utf8")];
                      case 4:
                        content = _b.sent();
                        this.dispatch({
                          type: "fs/change",
                          path: event.path,
                          content
                        });
                        this._modulesCache.set(event.path, writeBuffer(content));
                        return [3, 9];
                      case 5:
                        this.dispatch({
                          type: "fs/remove",
                          path: event.path
                        });
                        this._modulesCache.delete(event.path);
                        return [3, 9];
                      case 6:
                        this.dispatch({
                          type: "fs/remove",
                          path: event.oldPath
                        });
                        this._modulesCache.delete(event.oldPath);
                        return [4, this.emulator.fs.readFile(event.newPath, "utf8")];
                      case 7:
                        newContent = _b.sent();
                        this.dispatch({
                          type: "fs/change",
                          path: event.newPath,
                          content: newContent
                        });
                        this._modulesCache.set(event.newPath, writeBuffer(newContent));
                        return [3, 9];
                      case 8:
                        return [3, 9];
                      case 9:
                        return [3, 11];
                      case 10:
                        err_2 = _b.sent();
                        this.dispatch({
                          type: "action",
                          action: "notification",
                          notificationType: "error",
                          title: getMessageFromError(err_2)
                        });
                        return [3, 11];
                      case 11:
                        return [
                          2
                          /*return*/
                        ];
                    }
                  });
                });
              })];
            case 1:
              _a2.sent();
              return [
                2
                /*return*/
              ];
          }
        });
      });
    };
    SandpackNode2.prototype.restartShellProcess = function() {
      var _a2;
      return __awaiter$2(this, void 0, void 0, function() {
        return __generator$2(this, function(_b) {
          switch (_b.label) {
            case 0:
              if (!(this.emulatorShellProcess && this.emulatorCommand)) return [3, 3];
              this.dispatch({ type: "start", firstLoad: true });
              this.status = "initializing";
              return [4, this.emulatorShellProcess.kill()];
            case 1:
              _b.sent();
              (_a2 = this.iframe) === null || _a2 === void 0 ? void 0 : _a2.removeAttribute("attr");
              this.emulator.fs.rm("/node_modules/.vite", {
                recursive: true,
                force: true
              });
              return [4, this.compile(Object.fromEntries(this._modulesCache))];
            case 2:
              _b.sent();
              _b.label = 3;
            case 3:
              return [
                2
                /*return*/
              ];
          }
        });
      });
    };
    SandpackNode2.prototype.updateSandbox = function(setup) {
      var _this = this;
      var _a2;
      var modules = fromBundlerFilesToFS(setup.files);
      if (((_a2 = this.emulatorShellProcess) === null || _a2 === void 0 ? void 0 : _a2.state) === "running") {
        Object.entries(modules).forEach(function(_a3) {
          var key = _a3[0], value = _a3[1];
          if (!_this._modulesCache.get(key) || readBuffer$1(value) !== readBuffer$1(_this._modulesCache.get(key))) {
            _this.emulator.fs.writeFile(key, value, { recursive: true });
          }
        });
        return;
      }
      this.dispatch({
        codesandbox: true,
        modules,
        template: setup.template,
        type: "compile"
      });
      Object.entries(modules).forEach(function(_a3) {
        var key = _a3[0], value = _a3[1];
        _this._modulesCache.set(key, writeBuffer(value));
      });
    };
    SandpackNode2.prototype.dispatch = function(message) {
      var _a2, _b;
      return __awaiter$2(this, void 0, void 0, function() {
        var _c2;
        return __generator$2(this, function(_d) {
          switch (_d.label) {
            case 0:
              _c2 = message.type;
              switch (_c2) {
                case "compile":
                  return [3, 1];
                case "refresh":
                  return [3, 2];
                case "urlback":
                  return [3, 4];
                case "urlforward":
                  return [3, 4];
                case "shell/restart":
                  return [3, 5];
                case "shell/openPreview":
                  return [3, 6];
              }
              return [3, 7];
            case 1:
              this.compile(message.modules);
              return [3, 8];
            case 2:
              return [4, this.setLocationURLIntoIFrame()];
            case 3:
              _d.sent();
              return [3, 8];
            case 4:
              (_b = (_a2 = this.iframe) === null || _a2 === void 0 ? void 0 : _a2.contentWindow) === null || _b === void 0 ? void 0 : _b.postMessage(message, "*");
              return [3, 8];
            case 5:
              this.restartShellProcess();
              return [3, 8];
            case 6:
              window.open(this.iframePreviewUrl, "_blank");
              return [3, 8];
            case 7:
              this.emitter.dispatch(message);
              _d.label = 8;
            case 8:
              return [
                2
                /*return*/
              ];
          }
        });
      });
    };
    SandpackNode2.prototype.listen = function(listener) {
      return this.emitter.listener(listener);
    };
    SandpackNode2.prototype.destroy = function() {
      this.emulatorIframe.remove();
      this.emitter.cleanup();
    };
    return SandpackNode2;
  }(SandpackClient)
);
const index$1 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  SandpackNode
}, Symbol.toStringTag, { value: "Module" }));
var insertHtmlAfterRegex = function(regex, content, insertable) {
  var match = regex.exec(content);
  if (match && match.length >= 1) {
    var offset = match.index + match[0].length;
    var prefix = content.substring(0, offset);
    var suffix = content.substring(offset);
    return prefix + insertable + suffix;
  }
};
var readBuffer = function(content) {
  if (typeof content === "string") {
    return content;
  } else {
    return new TextDecoder().decode(content);
  }
};
var validateHtml = function(content) {
  var contentString = readBuffer(content);
  var domParser = new DOMParser();
  var doc = domParser.parseFromString(contentString, "text/html");
  if (!doc.documentElement.getAttribute("lang")) {
    doc.documentElement.setAttribute("lang", "en");
  }
  var html2 = doc.documentElement.outerHTML;
  return "<!DOCTYPE html>\n".concat(html2);
};
var SandpackStatic = (
  /** @class */
  function(_super) {
    __extends(SandpackStatic2, _super);
    function SandpackStatic2(selector, sandboxSetup, options) {
      if (options === void 0) {
        options = {};
      }
      var _a2;
      var _this = _super.call(this, selector, sandboxSetup, options) || this;
      _this.files = /* @__PURE__ */ new Map();
      _this.status = "initializing";
      _this.emitter = new EventEmitter();
      _this.previewController = new mainExports.PreviewController({
        baseUrl: (_a2 = options.bundlerURL) !== null && _a2 !== void 0 ? _a2 : "https://preview.sandpack-static-server.codesandbox.io",
        // filepath is always normalized to start with / and not end with a slash
        getFileContent: function(filepath) {
          var content = _this.files.get(filepath);
          if (!content) {
            throw new Error("File not found");
          }
          if (filepath.endsWith(".html") || filepath.endsWith(".htm")) {
            try {
              content = validateHtml(content);
              content = _this.injectProtocolScript(content);
              content = _this.injectExternalResources(content, options.externalResources);
              content = _this.injectScriptIntoHead(content, {
                script: consoleHook,
                scope: { channelId: generateRandomId() }
              });
            } catch (err) {
              console.error("Runtime injection failed", err);
            }
          }
          return content;
        }
      });
      if (typeof selector === "string") {
        _this.selector = selector;
        var element = document.querySelector(selector);
        _this.element = element;
        _this.iframe = document.createElement("iframe");
      } else {
        _this.element = selector;
        _this.iframe = selector;
      }
      if (!_this.iframe.getAttribute("sandbox")) {
        _this.iframe.setAttribute("sandbox", "allow-forms allow-modals allow-popups allow-presentation allow-same-origin allow-scripts allow-downloads allow-pointer-lock");
        _this.iframe.setAttribute("allow", "accelerometer; camera; encrypted-media; geolocation; gyroscope; hid; microphone; midi; clipboard-read; clipboard-write; xr-spatial-tracking;");
      }
      _this.eventListener = _this.eventListener.bind(_this);
      if (typeof window !== "undefined") {
        window.addEventListener("message", _this.eventListener);
      }
      _this.updateSandbox();
      return _this;
    }
    SandpackStatic2.prototype.injectContentIntoHead = function(content, contentToInsert) {
      var _a2;
      content = readBuffer(content);
      content = (_a2 = insertHtmlAfterRegex(/<head[^<>]*>/g, content, "\n" + contentToInsert)) !== null && _a2 !== void 0 ? _a2 : contentToInsert + "\n" + content;
      return content;
    };
    SandpackStatic2.prototype.injectProtocolScript = function(content) {
      var scriptToInsert = '<script>\n  window.addEventListener("message", (message) => {\n    if(message.data.type === "refresh") {\n      window.location.reload();\n    }\n  })\n<\/script>';
      return this.injectContentIntoHead(content, scriptToInsert);
    };
    SandpackStatic2.prototype.injectExternalResources = function(content, externalResources) {
      if (externalResources === void 0) {
        externalResources = [];
      }
      var tagsToInsert = externalResources.map(function(resource) {
        var match = resource.match(/\.([^.]*)$/);
        var fileType = match === null || match === void 0 ? void 0 : match[1];
        if (fileType === "css" || resource.includes("fonts.googleapis")) {
          return '<link rel="stylesheet" href="'.concat(resource, '">');
        }
        if (fileType === "js") {
          return '<script src="'.concat(resource, '"><\/script>');
        }
        throw new Error("Unable to determine file type for external resource: ".concat(resource));
      }).join("\n");
      return this.injectContentIntoHead(content, tagsToInsert);
    };
    SandpackStatic2.prototype.injectScriptIntoHead = function(content, opts) {
      var script = opts.script, _a2 = opts.scope, scope = _a2 === void 0 ? {} : _a2;
      var scriptToInsert = "\n    <script>\n      const scope = ".concat(JSON.stringify(scope), ";\n      ").concat(script, "\n    <\/script>\n    ").trim();
      return this.injectContentIntoHead(content, scriptToInsert);
    };
    SandpackStatic2.prototype.updateSandbox = function(setup, _isInitializationCompile) {
      if (setup === void 0) {
        setup = this.sandboxSetup;
      }
      var modules = fromBundlerFilesToFS(setup.files);
      this.dispatch({
        codesandbox: true,
        modules,
        template: setup.template,
        type: "compile"
      });
    };
    SandpackStatic2.prototype.compile = function(files) {
      return __awaiter$2(this, void 0, void 0, function() {
        var previewUrl;
        return __generator$2(this, function(_a2) {
          switch (_a2.label) {
            case 0:
              this.files = new Map(Object.entries(files));
              return [4, this.previewController.initPreview()];
            case 1:
              previewUrl = _a2.sent();
              this.iframe.setAttribute("src", previewUrl);
              this.status = "done";
              this.dispatch({ type: "done", compilatonError: false });
              this.dispatch({
                type: "urlchange",
                url: previewUrl,
                back: false,
                forward: false
              });
              return [
                2
                /*return*/
              ];
          }
        });
      });
    };
    SandpackStatic2.prototype.eventListener = function(evt) {
      if (evt.source !== this.iframe.contentWindow) {
        return;
      }
      var message = evt.data;
      if (!message.codesandbox) {
        return;
      }
      this.dispatch(message);
    };
    SandpackStatic2.prototype.dispatch = function(message) {
      var _a2;
      switch (message.type) {
        case "compile":
          this.compile(message.modules);
          break;
        default:
          (_a2 = this.iframe.contentWindow) === null || _a2 === void 0 ? void 0 : _a2.postMessage(message, "*");
          this.emitter.dispatch(message);
      }
    };
    SandpackStatic2.prototype.listen = function(listener) {
      return this.emitter.listener(listener);
    };
    SandpackStatic2.prototype.destroy = function() {
      this.emitter.cleanup();
      if (typeof window !== "undefined") {
        window.removeEventListener("message", this.eventListener);
      }
    };
    return SandpackStatic2;
  }(SandpackClient)
);
const index599aeaf7 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  SandpackStatic
}, Symbol.toStringTag, { value: "Module" }));
var Protocol = (
  /** @class */
  function() {
    function Protocol2(type, handleMessage, protocol) {
      var _this = this;
      this.type = type;
      this.handleMessage = handleMessage;
      this.protocol = protocol;
      this._disposeMessageListener = this.protocol.channelListen(function(msg) {
        return __awaiter$2(_this, void 0, void 0, function() {
          var message, result, response, err_1, response;
          return __generator$2(this, function(_a2) {
            switch (_a2.label) {
              case 0:
                if (!(msg.type === this.getTypeId() && msg.method)) return [3, 4];
                message = msg;
                _a2.label = 1;
              case 1:
                _a2.trys.push([1, 3, , 4]);
                return [4, this.handleMessage(message)];
              case 2:
                result = _a2.sent();
                response = {
                  type: this.getTypeId(),
                  msgId: message.msgId,
                  result
                };
                this.protocol.dispatch(response);
                return [3, 4];
              case 3:
                err_1 = _a2.sent();
                response = {
                  type: this.getTypeId(),
                  msgId: message.msgId,
                  error: {
                    message: err_1.message
                  }
                };
                this.protocol.dispatch(response);
                return [3, 4];
              case 4:
                return [
                  2
                  /*return*/
                ];
            }
          });
        });
      });
    }
    Protocol2.prototype.getTypeId = function() {
      return "protocol-".concat(this.type);
    };
    Protocol2.prototype.dispose = function() {
      this._disposeMessageListener();
    };
    return Protocol2;
  }()
);
var IFrameProtocol = (
  /** @class */
  function() {
    function IFrameProtocol2(iframe, origin) {
      this.globalListeners = {};
      this.globalListenersCount = 0;
      this.channelListeners = {};
      this.channelListenersCount = 0;
      this.channelId = Math.floor(Math.random() * 1e6);
      this.frameWindow = iframe.contentWindow;
      this.origin = origin;
      this.globalListeners = [];
      this.channelListeners = [];
      this.eventListener = this.eventListener.bind(this);
      if (typeof window !== "undefined") {
        window.addEventListener("message", this.eventListener);
      }
    }
    IFrameProtocol2.prototype.cleanup = function() {
      window.removeEventListener("message", this.eventListener);
      this.globalListeners = {};
      this.channelListeners = {};
      this.globalListenersCount = 0;
      this.channelListenersCount = 0;
    };
    IFrameProtocol2.prototype.register = function() {
      if (!this.frameWindow) {
        return;
      }
      this.frameWindow.postMessage({
        type: "register-frame",
        origin: document.location.origin,
        id: this.channelId
      }, this.origin);
    };
    IFrameProtocol2.prototype.dispatch = function(message) {
      if (!this.frameWindow) {
        return;
      }
      this.frameWindow.postMessage(__assign$2({ $id: this.channelId, codesandbox: true }, message), this.origin);
    };
    IFrameProtocol2.prototype.globalListen = function(listener) {
      var _this = this;
      if (typeof listener !== "function") {
        return function() {
          return;
        };
      }
      var listenerId = this.globalListenersCount;
      this.globalListeners[listenerId] = listener;
      this.globalListenersCount++;
      return function() {
        delete _this.globalListeners[listenerId];
      };
    };
    IFrameProtocol2.prototype.channelListen = function(listener) {
      var _this = this;
      if (typeof listener !== "function") {
        return function() {
          return;
        };
      }
      var listenerId = this.channelListenersCount;
      this.channelListeners[listenerId] = listener;
      this.channelListenersCount++;
      return function() {
        delete _this.channelListeners[listenerId];
      };
    };
    IFrameProtocol2.prototype.eventListener = function(evt) {
      if (evt.source !== this.frameWindow) {
        return;
      }
      var message = evt.data;
      if (!message.codesandbox) {
        return;
      }
      Object.values(this.globalListeners).forEach(function(listener) {
        return listener(message);
      });
      if (message.$id !== this.channelId) {
        return;
      }
      Object.values(this.channelListeners).forEach(function(listener) {
        return listener(message);
      });
    };
    return IFrameProtocol2;
  }()
);
var extensionMap = /* @__PURE__ */ new Map();
var entries = Object.entries(mimeDB);
for (var _i = 0, entries_1 = entries; _i < entries_1.length; _i++) {
  var _a$1 = entries_1[_i], mimetype = _a$1[0], entry = _a$1[1];
  if (!entry.extensions) {
    continue;
  }
  var extensions = entry.extensions;
  if (extensions.length) {
    for (var _b = 0, extensions_1 = extensions; _b < extensions_1.length; _b++) {
      var ext = extensions_1[_b];
      extensionMap.set(ext, mimetype);
    }
  }
}
var EXTENSIONS_MAP = extensionMap;
var CHANNEL_NAME = "$CSB_RELAY";
var MAX_CLIENT_DEPENDENCY_COUNT = 50;
function getTemplate(pkg, modules) {
  if (!pkg) {
    return "static";
  }
  var _a2 = pkg.dependencies, dependencies = _a2 === void 0 ? {} : _a2, _b = pkg.devDependencies, devDependencies = _b === void 0 ? {} : _b;
  var totalDependencies = __spreadArray$2(__spreadArray$2([], Object.keys(dependencies), true), Object.keys(devDependencies), true);
  var moduleNames = Object.keys(modules);
  var adonis = ["@adonisjs/framework", "@adonisjs/core"];
  if (totalDependencies.some(function(dep) {
    return adonis.indexOf(dep) > -1;
  })) {
    return "adonis";
  }
  var nuxt = ["nuxt", "nuxt-edge", "nuxt-ts", "nuxt-ts-edge", "nuxt3"];
  if (totalDependencies.some(function(dep) {
    return nuxt.indexOf(dep) > -1;
  })) {
    return "nuxt";
  }
  if (totalDependencies.indexOf("next") > -1) {
    return "next";
  }
  var apollo = [
    "apollo-server",
    "apollo-server-express",
    "apollo-server-hapi",
    "apollo-server-koa",
    "apollo-server-lambda",
    "apollo-server-micro"
  ];
  if (totalDependencies.some(function(dep) {
    return apollo.indexOf(dep) > -1;
  })) {
    return "apollo";
  }
  if (totalDependencies.indexOf("mdx-deck") > -1) {
    return "mdx-deck";
  }
  if (totalDependencies.indexOf("gridsome") > -1) {
    return "gridsome";
  }
  if (totalDependencies.indexOf("vuepress") > -1) {
    return "vuepress";
  }
  if (totalDependencies.indexOf("ember-cli") > -1) {
    return "ember";
  }
  if (totalDependencies.indexOf("sapper") > -1) {
    return "sapper";
  }
  if (totalDependencies.indexOf("gatsby") > -1) {
    return "gatsby";
  }
  if (totalDependencies.indexOf("quasar") > -1) {
    return "quasar";
  }
  if (totalDependencies.indexOf("@docusaurus/core") > -1) {
    return "docusaurus";
  }
  if (totalDependencies.indexOf("remix") > -1) {
    return "remix";
  }
  if (totalDependencies.indexOf("astro") > -1) {
    return "node";
  }
  if (moduleNames.some(function(m) {
    return m.endsWith(".re");
  })) {
    return "reason";
  }
  var parcel = ["parcel-bundler", "parcel"];
  if (totalDependencies.some(function(dep) {
    return parcel.indexOf(dep) > -1;
  })) {
    return "parcel";
  }
  var dojo = ["@dojo/core", "@dojo/framework"];
  if (totalDependencies.some(function(dep) {
    return dojo.indexOf(dep) > -1;
  })) {
    return "@dojo/cli-create-app";
  }
  if (totalDependencies.indexOf("@nestjs/core") > -1 || totalDependencies.indexOf("@nestjs/common") > -1) {
    return "nest";
  }
  if (totalDependencies.indexOf("react-styleguidist") > -1) {
    return "styleguidist";
  }
  if (totalDependencies.indexOf("react-scripts") > -1) {
    return "create-react-app";
  }
  if (totalDependencies.indexOf("react-scripts-ts") > -1) {
    return "create-react-app-typescript";
  }
  if (totalDependencies.indexOf("@angular/core") > -1) {
    return "angular-cli";
  }
  if (totalDependencies.indexOf("preact-cli") > -1) {
    return "preact-cli";
  }
  if (totalDependencies.indexOf("@sveltech/routify") > -1 || totalDependencies.indexOf("@roxi/routify") > -1) {
    return "node";
  }
  if (totalDependencies.indexOf("vite") > -1) {
    return "node";
  }
  if (totalDependencies.indexOf("@frontity/core") > -1) {
    return "node";
  }
  if (totalDependencies.indexOf("svelte") > -1) {
    return "svelte";
  }
  if (totalDependencies.indexOf("vue") > -1) {
    return "vue-cli";
  }
  if (totalDependencies.indexOf("cx") > -1) {
    return "cxjs";
  }
  var nodeDeps = [
    "express",
    "koa",
    "nodemon",
    "ts-node",
    "@tensorflow/tfjs-node",
    "webpack-dev-server",
    "snowpack"
  ];
  if (totalDependencies.some(function(dep) {
    return nodeDeps.indexOf(dep) > -1;
  })) {
    return "node";
  }
  if (Object.keys(dependencies).length >= MAX_CLIENT_DEPENDENCY_COUNT) {
    return "node";
  }
  return void 0;
}
function getExtension(filepath) {
  var parts = filepath.split(".");
  if (parts.length <= 1) {
    return "";
  } else {
    var ext = parts[parts.length - 1];
    return ext;
  }
}
var _a;
var SUFFIX_PLACEHOLDER = "-{{suffix}}";
var BUNDLER_URL = "https://".concat((_a = "2.19.8") === null || _a === void 0 ? void 0 : _a.replace(/\./g, "-")).concat(SUFFIX_PLACEHOLDER, "-sandpack.codesandbox.io/");
var SandpackRuntime = (
  /** @class */
  function(_super) {
    __extends(SandpackRuntime2, _super);
    function SandpackRuntime2(selector, sandboxSetup, options) {
      if (options === void 0) {
        options = {};
      }
      var _this = _super.call(this, selector, sandboxSetup, options) || this;
      _this.getTranspilerContext = function() {
        return new Promise(function(resolve) {
          var unsubscribe = _this.listen(function(message) {
            if (message.type === "transpiler-context") {
              resolve(message.data);
              unsubscribe();
            }
          });
          _this.dispatch({ type: "get-transpiler-context" });
        });
      };
      _this.getTranspiledFiles = function() {
        return new Promise(function(resolve) {
          var unsubscribe = _this.listen(function(message) {
            if (message.type === "all-modules") {
              resolve(message.data);
              unsubscribe();
            }
          });
          _this.dispatch({ type: "get-modules" });
        });
      };
      _this.bundlerURL = _this.createBundlerURL();
      _this.bundlerState = void 0;
      _this.errors = [];
      _this.status = "initializing";
      if (typeof selector === "string") {
        _this.selector = selector;
        var element = document.querySelector(selector);
        nullthrows(element, "The element '".concat(selector, "' was not found"));
        _this.element = element;
        _this.iframe = document.createElement("iframe");
        _this.initializeElement();
      } else {
        _this.element = selector;
        _this.iframe = selector;
      }
      if (!_this.iframe.getAttribute("sandbox")) {
        _this.iframe.setAttribute("sandbox", "allow-forms allow-modals allow-popups allow-presentation allow-same-origin allow-scripts allow-downloads allow-pointer-lock");
        _this.iframe.setAttribute("allow", "accelerometer; camera; encrypted-media; geolocation; gyroscope; hid; microphone; midi; clipboard-read; clipboard-write; xr-spatial-tracking;");
      }
      _this.setLocationURLIntoIFrame();
      _this.iframeProtocol = new IFrameProtocol(_this.iframe, _this.bundlerURL);
      _this.unsubscribeGlobalListener = _this.iframeProtocol.globalListen(function(mes) {
        if (mes.type !== "initialized" || !_this.iframe.contentWindow) {
          return;
        }
        _this.iframeProtocol.register();
        if (_this.options.fileResolver) {
          _this.fileResolverProtocol = new Protocol("fs", function(data) {
            return __awaiter$2(_this, void 0, void 0, function() {
              return __generator$2(this, function(_a2) {
                if (data.method === "isFile") {
                  return [2, this.options.fileResolver.isFile(data.params[0])];
                } else if (data.method === "readFile") {
                  return [2, this.options.fileResolver.readFile(data.params[0])];
                } else {
                  throw new Error("Method not supported");
                }
              });
            });
          }, _this.iframeProtocol);
        }
        _this.updateSandbox(_this.sandboxSetup, true);
      });
      _this.unsubscribeChannelListener = _this.iframeProtocol.channelListen(function(mes) {
        switch (mes.type) {
          case "start": {
            _this.errors = [];
            break;
          }
          case "status": {
            _this.status = mes.status;
            break;
          }
          case "action": {
            if (mes.action === "show-error") {
              _this.errors = __spreadArray$2(__spreadArray$2([], _this.errors, true), [extractErrorDetails(mes)], false);
            }
            break;
          }
          case "done": {
            _this.status = "done";
            break;
          }
          case "state": {
            _this.bundlerState = mes.state;
            break;
          }
        }
      });
      if (options.experimental_enableServiceWorker) {
        _this.serviceWorkerHandshake();
      }
      return _this;
    }
    SandpackRuntime2.prototype.createBundlerURL = function() {
      var _a2;
      var bundlerURL = this.options.bundlerURL || BUNDLER_URL;
      if (this.options.bundlerURL) {
        return bundlerURL;
      }
      if (this.options.teamId) {
        bundlerURL = bundlerURL.replace("https://", "https://" + this.options.teamId + "-") + "?cache=".concat(Date.now());
      }
      if (this.options.experimental_enableServiceWorker) {
        var suffixes = [];
        suffixes.push(Math.random().toString(36).slice(4));
        bundlerURL = bundlerURL.replace(SUFFIX_PLACEHOLDER, "-".concat((_a2 = this.options.experimental_stableServiceWorkerId) !== null && _a2 !== void 0 ? _a2 : suffixes.join("-")));
      } else {
        bundlerURL = bundlerURL.replace(SUFFIX_PLACEHOLDER, "");
      }
      return bundlerURL;
    };
    SandpackRuntime2.prototype.serviceWorkerHandshake = function() {
      var _this = this;
      var channel = new MessageChannel();
      var iframeContentWindow = this.iframe.contentWindow;
      if (!iframeContentWindow) {
        throw new Error("Could not get iframe contentWindow");
      }
      var port = channel.port1;
      port.onmessage = function(evt) {
        if (typeof evt.data === "object" && evt.data.$channel === CHANNEL_NAME) {
          switch (evt.data.$type) {
            case "preview/ready":
              break;
            case "preview/request":
              _this.handleWorkerRequest(evt.data, port);
              break;
          }
        }
      };
      var sendMessage = function() {
        var initMsg = {
          $channel: CHANNEL_NAME,
          $type: "preview/init"
        };
        iframeContentWindow.postMessage(initMsg, "*", [channel.port2]);
        _this.iframe.removeEventListener("load", sendMessage);
      };
      this.iframe.addEventListener("load", sendMessage);
    };
    SandpackRuntime2.prototype.handleWorkerRequest = function(request, port) {
      return __awaiter$2(this, void 0, void 0, function() {
        var notFound, filepath_1, headers, files, file, modulesFromManager, body, extension, foundMimetype, responseMessage, err_1;
        return __generator$2(this, function(_a2) {
          switch (_a2.label) {
            case 0:
              notFound = function() {
                var responseMessage2 = {
                  $channel: CHANNEL_NAME,
                  $type: "preview/response",
                  id: request.id,
                  headers: {
                    "Content-Type": "text/html; charset=utf-8"
                  },
                  status: 404,
                  body: "File not found"
                };
                port.postMessage(responseMessage2);
              };
              _a2.label = 1;
            case 1:
              _a2.trys.push([1, 4, , 5]);
              filepath_1 = new URL(request.url, this.bundlerURL).pathname;
              headers = {};
              files = this.getFiles();
              file = files[filepath_1];
              if (!!file) return [3, 3];
              return [4, this.getTranspiledFiles()];
            case 2:
              modulesFromManager = _a2.sent();
              file = modulesFromManager.find(function(item) {
                return item.path.endsWith(filepath_1);
              });
              if (!file) {
                notFound();
                return [
                  2
                  /*return*/
                ];
              }
              _a2.label = 3;
            case 3:
              body = file.code;
              if (!headers["Content-Type"]) {
                extension = getExtension(filepath_1);
                foundMimetype = EXTENSIONS_MAP.get(extension);
                if (foundMimetype) {
                  headers["Content-Type"] = foundMimetype;
                }
              }
              responseMessage = {
                $channel: CHANNEL_NAME,
                $type: "preview/response",
                id: request.id,
                headers,
                status: 200,
                body
              };
              port.postMessage(responseMessage);
              return [3, 5];
            case 4:
              err_1 = _a2.sent();
              console.error(err_1);
              notFound();
              return [3, 5];
            case 5:
              return [
                2
                /*return*/
              ];
          }
        });
      });
    };
    SandpackRuntime2.prototype.setLocationURLIntoIFrame = function() {
      var _a2;
      var urlSource = this.options.startRoute ? new URL(this.options.startRoute, this.bundlerURL).toString() : this.bundlerURL;
      (_a2 = this.iframe.contentWindow) === null || _a2 === void 0 ? void 0 : _a2.location.replace(urlSource);
      this.iframe.src = urlSource;
    };
    SandpackRuntime2.prototype.destroy = function() {
      this.unsubscribeChannelListener();
      this.unsubscribeGlobalListener();
      this.iframeProtocol.cleanup();
    };
    SandpackRuntime2.prototype.updateOptions = function(options) {
      if (!dequal(this.options, options)) {
        this.options = options;
        this.updateSandbox();
      }
    };
    SandpackRuntime2.prototype.updateSandbox = function(sandboxSetup, isInitializationCompile) {
      var _a2, _b, _c2, _d;
      if (sandboxSetup === void 0) {
        sandboxSetup = this.sandboxSetup;
      }
      this.sandboxSetup = __assign$2(__assign$2({}, this.sandboxSetup), sandboxSetup);
      var files = this.getFiles();
      var modules = Object.keys(files).reduce(function(prev, next) {
        var _a3;
        return __assign$2(__assign$2({}, prev), (_a3 = {}, _a3[next] = {
          code: files[next].code,
          path: next
        }, _a3));
      }, {});
      var packageJSON = JSON.parse(createPackageJSON(this.sandboxSetup.dependencies, this.sandboxSetup.devDependencies, this.sandboxSetup.entry));
      try {
        packageJSON = JSON.parse(files["/package.json"].code);
      } catch (e) {
        console.error(createError("could not parse package.json file: " + e.message));
      }
      var normalizedModules = Object.keys(files).reduce(function(prev, next) {
        var _a3;
        return __assign$2(__assign$2({}, prev), (_a3 = {}, _a3[next] = {
          content: files[next].code,
          path: next
        }, _a3));
      }, {});
      this.dispatch(__assign$2(__assign$2({}, this.options), { type: "compile", codesandbox: true, version: 3, isInitializationCompile, modules, reactDevTools: this.options.reactDevTools, externalResources: this.options.externalResources || [], hasFileResolver: Boolean(this.options.fileResolver), disableDependencyPreprocessing: this.sandboxSetup.disableDependencyPreprocessing, experimental_enableServiceWorker: this.options.experimental_enableServiceWorker, template: this.sandboxSetup.template || getTemplate(packageJSON, normalizedModules), showOpenInCodeSandbox: (_a2 = this.options.showOpenInCodeSandbox) !== null && _a2 !== void 0 ? _a2 : true, showErrorScreen: (_b = this.options.showErrorScreen) !== null && _b !== void 0 ? _b : true, showLoadingScreen: (_c2 = this.options.showLoadingScreen) !== null && _c2 !== void 0 ? _c2 : false, skipEval: this.options.skipEval || false, clearConsoleDisabled: !this.options.clearConsoleOnFirstCompile, logLevel: (_d = this.options.logLevel) !== null && _d !== void 0 ? _d : SandpackLogLevel.Info, customNpmRegistries: this.options.customNpmRegistries, teamId: this.options.teamId, sandboxId: this.options.sandboxId }));
    };
    SandpackRuntime2.prototype.dispatch = function(message) {
      if (message.type === "refresh") {
        this.setLocationURLIntoIFrame();
        if (this.options.experimental_enableServiceWorker) {
          this.serviceWorkerHandshake();
        }
      }
      this.iframeProtocol.dispatch(message);
    };
    SandpackRuntime2.prototype.listen = function(listener) {
      return this.iframeProtocol.channelListen(listener);
    };
    SandpackRuntime2.prototype.getCodeSandboxURL = function() {
      var files = this.getFiles();
      var paramFiles = Object.keys(files).reduce(function(prev, next) {
        var _a2;
        return __assign$2(__assign$2({}, prev), (_a2 = {}, _a2[next.replace("/", "")] = {
          content: files[next].code,
          isBinary: false
        }, _a2));
      }, {});
      return fetch("https://codesandbox.io/api/v1/sandboxes/define?json=1", {
        method: "POST",
        body: JSON.stringify({ files: paramFiles }),
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json"
        }
      }).then(function(x) {
        return x.json();
      }).then(function(res) {
        return {
          sandboxId: res.sandbox_id,
          editorUrl: "https://codesandbox.io/s/".concat(res.sandbox_id),
          embedUrl: "https://codesandbox.io/embed/".concat(res.sandbox_id)
        };
      });
    };
    SandpackRuntime2.prototype.getFiles = function() {
      var sandboxSetup = this.sandboxSetup;
      if (sandboxSetup.files["/package.json"] === void 0) {
        return addPackageJSONIfNeeded(sandboxSetup.files, sandboxSetup.dependencies, sandboxSetup.devDependencies, sandboxSetup.entry);
      }
      return this.sandboxSetup.files;
    };
    SandpackRuntime2.prototype.initializeElement = function() {
      this.iframe.style.border = "0";
      this.iframe.style.width = this.options.width || "100%";
      this.iframe.style.height = this.options.height || "100%";
      this.iframe.style.overflow = "hidden";
      nullthrows(this.element.parentNode, "The given iframe does not have a parent.");
      this.element.parentNode.replaceChild(this.iframe, this.element);
    };
    return SandpackRuntime2;
  }(SandpackClient)
);
const index = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  SandpackRuntime
}, Symbol.toStringTag, { value: "Module" }));
export {
  SandpackProvider$1 as S,
  __vitePreload as _,
  SandpackCodeEditor as a,
  SandpackProvider as b,
  SandpackPreview as c,
  useSandpack$1 as u
};
