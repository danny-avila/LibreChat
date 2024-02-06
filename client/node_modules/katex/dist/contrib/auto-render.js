(function webpackUniversalModuleDefinition(root, factory) {
	if(typeof exports === 'object' && typeof module === 'object')
		module.exports = factory(require("katex"));
	else if(typeof define === 'function' && define.amd)
		define(["katex"], factory);
	else if(typeof exports === 'object')
		exports["renderMathInElement"] = factory(require("katex"));
	else
		root["renderMathInElement"] = factory(root["katex"]);
})((typeof self !== 'undefined' ? self : this), function(__WEBPACK_EXTERNAL_MODULE__771__) {
return /******/ (function() { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ 771:
/***/ (function(module) {

module.exports = __WEBPACK_EXTERNAL_MODULE__771__;

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/compat get default export */
/******/ 	!function() {
/******/ 		// getDefaultExport function for compatibility with non-harmony modules
/******/ 		__webpack_require__.n = function(module) {
/******/ 			var getter = module && module.__esModule ?
/******/ 				function() { return module['default']; } :
/******/ 				function() { return module; };
/******/ 			__webpack_require__.d(getter, { a: getter });
/******/ 			return getter;
/******/ 		};
/******/ 	}();
/******/ 	
/******/ 	/* webpack/runtime/define property getters */
/******/ 	!function() {
/******/ 		// define getter functions for harmony exports
/******/ 		__webpack_require__.d = function(exports, definition) {
/******/ 			for(var key in definition) {
/******/ 				if(__webpack_require__.o(definition, key) && !__webpack_require__.o(exports, key)) {
/******/ 					Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
/******/ 				}
/******/ 			}
/******/ 		};
/******/ 	}();
/******/ 	
/******/ 	/* webpack/runtime/hasOwnProperty shorthand */
/******/ 	!function() {
/******/ 		__webpack_require__.o = function(obj, prop) { return Object.prototype.hasOwnProperty.call(obj, prop); }
/******/ 	}();
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
// This entry need to be wrapped in an IIFE because it need to be isolated against other modules in the chunk.
!function() {

// EXPORTS
__webpack_require__.d(__webpack_exports__, {
  "default": function() { return /* binding */ auto_render; }
});

// EXTERNAL MODULE: external "katex"
var external_katex_ = __webpack_require__(771);
var external_katex_default = /*#__PURE__*/__webpack_require__.n(external_katex_);
;// CONCATENATED MODULE: ./contrib/auto-render/splitAtDelimiters.js
/* eslint no-constant-condition:0 */
var findEndOfMath = function findEndOfMath(delimiter, text, startIndex) {
  // Adapted from
  // https://github.com/Khan/perseus/blob/master/src/perseus-markdown.jsx
  var index = startIndex;
  var braceLevel = 0;
  var delimLength = delimiter.length;

  while (index < text.length) {
    var character = text[index];

    if (braceLevel <= 0 && text.slice(index, index + delimLength) === delimiter) {
      return index;
    } else if (character === "\\") {
      index++;
    } else if (character === "{") {
      braceLevel++;
    } else if (character === "}") {
      braceLevel--;
    }

    index++;
  }

  return -1;
};

var escapeRegex = function escapeRegex(string) {
  return string.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
};

var amsRegex = /^\\begin{/;

var splitAtDelimiters = function splitAtDelimiters(text, delimiters) {
  var index;
  var data = [];
  var regexLeft = new RegExp("(" + delimiters.map(function (x) {
    return escapeRegex(x.left);
  }).join("|") + ")");

  while (true) {
    index = text.search(regexLeft);

    if (index === -1) {
      break;
    }

    if (index > 0) {
      data.push({
        type: "text",
        data: text.slice(0, index)
      });
      text = text.slice(index); // now text starts with delimiter
    } // ... so this always succeeds:


    var i = delimiters.findIndex(function (delim) {
      return text.startsWith(delim.left);
    });
    index = findEndOfMath(delimiters[i].right, text, delimiters[i].left.length);

    if (index === -1) {
      break;
    }

    var rawData = text.slice(0, index + delimiters[i].right.length);
    var math = amsRegex.test(rawData) ? rawData : text.slice(delimiters[i].left.length, index);
    data.push({
      type: "math",
      data: math,
      rawData: rawData,
      display: delimiters[i].display
    });
    text = text.slice(index + delimiters[i].right.length);
  }

  if (text !== "") {
    data.push({
      type: "text",
      data: text
    });
  }

  return data;
};

/* harmony default export */ var auto_render_splitAtDelimiters = (splitAtDelimiters);
;// CONCATENATED MODULE: ./contrib/auto-render/auto-render.js
/* eslint no-console:0 */


/* Note: optionsCopy is mutated by this method. If it is ever exposed in the
 * API, we should copy it before mutating.
 */

var renderMathInText = function renderMathInText(text, optionsCopy) {
  var data = auto_render_splitAtDelimiters(text, optionsCopy.delimiters);

  if (data.length === 1 && data[0].type === 'text') {
    // There is no formula in the text.
    // Let's return null which means there is no need to replace
    // the current text node with a new one.
    return null;
  }

  var fragment = document.createDocumentFragment();

  for (var i = 0; i < data.length; i++) {
    if (data[i].type === "text") {
      fragment.appendChild(document.createTextNode(data[i].data));
    } else {
      var span = document.createElement("span");
      var math = data[i].data; // Override any display mode defined in the settings with that
      // defined by the text itself

      optionsCopy.displayMode = data[i].display;

      try {
        if (optionsCopy.preProcess) {
          math = optionsCopy.preProcess(math);
        }

        external_katex_default().render(math, span, optionsCopy);
      } catch (e) {
        if (!(e instanceof (external_katex_default()).ParseError)) {
          throw e;
        }

        optionsCopy.errorCallback("KaTeX auto-render: Failed to parse `" + data[i].data + "` with ", e);
        fragment.appendChild(document.createTextNode(data[i].rawData));
        continue;
      }

      fragment.appendChild(span);
    }
  }

  return fragment;
};

var renderElem = function renderElem(elem, optionsCopy) {
  for (var i = 0; i < elem.childNodes.length; i++) {
    var childNode = elem.childNodes[i];

    if (childNode.nodeType === 3) {
      // Text node
      // Concatenate all sibling text nodes.
      // Webkit browsers split very large text nodes into smaller ones,
      // so the delimiters may be split across different nodes.
      var textContentConcat = childNode.textContent;
      var sibling = childNode.nextSibling;
      var nSiblings = 0;

      while (sibling && sibling.nodeType === Node.TEXT_NODE) {
        textContentConcat += sibling.textContent;
        sibling = sibling.nextSibling;
        nSiblings++;
      }

      var frag = renderMathInText(textContentConcat, optionsCopy);

      if (frag) {
        // Remove extra text nodes
        for (var j = 0; j < nSiblings; j++) {
          childNode.nextSibling.remove();
        }

        i += frag.childNodes.length - 1;
        elem.replaceChild(frag, childNode);
      } else {
        // If the concatenated text does not contain math
        // the siblings will not either
        i += nSiblings;
      }
    } else if (childNode.nodeType === 1) {
      (function () {
        // Element node
        var className = ' ' + childNode.className + ' ';
        var shouldRender = optionsCopy.ignoredTags.indexOf(childNode.nodeName.toLowerCase()) === -1 && optionsCopy.ignoredClasses.every(function (x) {
          return className.indexOf(' ' + x + ' ') === -1;
        });

        if (shouldRender) {
          renderElem(childNode, optionsCopy);
        }
      })();
    } // Otherwise, it's something else, and ignore it.

  }
};

var renderMathInElement = function renderMathInElement(elem, options) {
  if (!elem) {
    throw new Error("No element provided to render");
  }

  var optionsCopy = {}; // Object.assign(optionsCopy, option)

  for (var option in options) {
    if (options.hasOwnProperty(option)) {
      optionsCopy[option] = options[option];
    }
  } // default options


  optionsCopy.delimiters = optionsCopy.delimiters || [{
    left: "$$",
    right: "$$",
    display: true
  }, {
    left: "\\(",
    right: "\\)",
    display: false
  }, // LaTeX uses $…$, but it ruins the display of normal `$` in text:
  // {left: "$", right: "$", display: false},
  // $ must come after $$
  // Render AMS environments even if outside $$…$$ delimiters.
  {
    left: "\\begin{equation}",
    right: "\\end{equation}",
    display: true
  }, {
    left: "\\begin{align}",
    right: "\\end{align}",
    display: true
  }, {
    left: "\\begin{alignat}",
    right: "\\end{alignat}",
    display: true
  }, {
    left: "\\begin{gather}",
    right: "\\end{gather}",
    display: true
  }, {
    left: "\\begin{CD}",
    right: "\\end{CD}",
    display: true
  }, {
    left: "\\[",
    right: "\\]",
    display: true
  }];
  optionsCopy.ignoredTags = optionsCopy.ignoredTags || ["script", "noscript", "style", "textarea", "pre", "code", "option"];
  optionsCopy.ignoredClasses = optionsCopy.ignoredClasses || [];
  optionsCopy.errorCallback = optionsCopy.errorCallback || console.error; // Enable sharing of global macros defined via `\gdef` between different
  // math elements within a single call to `renderMathInElement`.

  optionsCopy.macros = optionsCopy.macros || {};
  renderElem(elem, optionsCopy);
};

/* harmony default export */ var auto_render = (renderMathInElement);
}();
__webpack_exports__ = __webpack_exports__["default"];
/******/ 	return __webpack_exports__;
/******/ })()
;
});