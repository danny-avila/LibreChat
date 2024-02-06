"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.NodeTypeError = exports.HtmlElementTypeError = void 0;
exports.checkHtmlElement = checkHtmlElement;
exports.checkNode = checkNode;
exports.compareArraysAsSet = compareArraysAsSet;
exports.deprecate = deprecate;
exports.getMessage = getMessage;
exports.getSingleElementValue = getSingleElementValue;
exports.getTag = getTag;
exports.matches = matches;
exports.normalize = normalize;
exports.parseCSS = parseCSS;
exports.toSentence = toSentence;
var _redent = _interopRequireDefault(require("redent"));
var _isEqual = _interopRequireDefault(require("lodash/isEqual"));
var _cssTools = require("@adobe/css-tools");
class GenericTypeError extends Error {
  constructor(expectedString, received, matcherFn, context) {
    super();

    /* istanbul ignore next */
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, matcherFn);
    }
    let withType = '';
    try {
      withType = context.utils.printWithType('Received', received, context.utils.printReceived);
    } catch (e) {
      // Can throw for Document:
      // https://github.com/jsdom/jsdom/issues/2304
    }
    this.message = [context.utils.matcherHint(`${context.isNot ? '.not' : ''}.${matcherFn.name}`, 'received', ''), '',
    // eslint-disable-next-line @babel/new-cap
    `${context.utils.RECEIVED_COLOR('received')} value must ${expectedString}.`, withType].join('\n');
  }
}
class HtmlElementTypeError extends GenericTypeError {
  constructor(...args) {
    super('be an HTMLElement or an SVGElement', ...args);
  }
}
exports.HtmlElementTypeError = HtmlElementTypeError;
class NodeTypeError extends GenericTypeError {
  constructor(...args) {
    super('be a Node', ...args);
  }
}
exports.NodeTypeError = NodeTypeError;
function checkHasWindow(htmlElement, ErrorClass, ...args) {
  if (!htmlElement || !htmlElement.ownerDocument || !htmlElement.ownerDocument.defaultView) {
    throw new ErrorClass(htmlElement, ...args);
  }
}
function checkNode(node, ...args) {
  checkHasWindow(node, NodeTypeError, ...args);
  const window = node.ownerDocument.defaultView;
  if (!(node instanceof window.Node)) {
    throw new NodeTypeError(node, ...args);
  }
}
function checkHtmlElement(htmlElement, ...args) {
  checkHasWindow(htmlElement, HtmlElementTypeError, ...args);
  const window = htmlElement.ownerDocument.defaultView;
  if (!(htmlElement instanceof window.HTMLElement) && !(htmlElement instanceof window.SVGElement)) {
    throw new HtmlElementTypeError(htmlElement, ...args);
  }
}
class InvalidCSSError extends Error {
  constructor(received, matcherFn, context) {
    super();

    /* istanbul ignore next */
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, matcherFn);
    }
    this.message = [received.message, '',
    // eslint-disable-next-line @babel/new-cap
    context.utils.RECEIVED_COLOR(`Failing css:`),
    // eslint-disable-next-line @babel/new-cap
    context.utils.RECEIVED_COLOR(`${received.css}`)].join('\n');
  }
}
function parseCSS(css, ...args) {
  const ast = (0, _cssTools.parse)(`selector { ${css} }`, {
    silent: true
  }).stylesheet;
  if (ast.parsingErrors && ast.parsingErrors.length > 0) {
    const {
      reason,
      line
    } = ast.parsingErrors[0];
    throw new InvalidCSSError({
      css,
      message: `Syntax error parsing expected css: ${reason} on line: ${line}`
    }, ...args);
  }
  const parsedRules = ast.rules[0].declarations.filter(d => d.type === 'declaration').reduce((obj, {
    property,
    value
  }) => Object.assign(obj, {
    [property]: value
  }), {});
  return parsedRules;
}
function display(context, value) {
  return typeof value === 'string' ? value : context.utils.stringify(value);
}
function getMessage(context, matcher, expectedLabel, expectedValue, receivedLabel, receivedValue) {
  return [`${matcher}\n`,
  // eslint-disable-next-line @babel/new-cap
  `${expectedLabel}:\n${context.utils.EXPECTED_COLOR((0, _redent.default)(display(context, expectedValue), 2))}`,
  // eslint-disable-next-line @babel/new-cap
  `${receivedLabel}:\n${context.utils.RECEIVED_COLOR((0, _redent.default)(display(context, receivedValue), 2))}`].join('\n');
}
function matches(textToMatch, matcher) {
  if (matcher instanceof RegExp) {
    return matcher.test(textToMatch);
  } else {
    return textToMatch.includes(String(matcher));
  }
}
function deprecate(name, replacementText) {
  // Notify user that they are using deprecated functionality.
  // eslint-disable-next-line no-console
  console.warn(`Warning: ${name} has been deprecated and will be removed in future updates.`, replacementText);
}
function normalize(text) {
  return text.replace(/\s+/g, ' ').trim();
}
function getTag(element) {
  return element.tagName && element.tagName.toLowerCase();
}
function getSelectValue({
  multiple,
  options
}) {
  const selectedOptions = [...options].filter(option => option.selected);
  if (multiple) {
    return [...selectedOptions].map(opt => opt.value);
  }
  /* istanbul ignore if */
  if (selectedOptions.length === 0) {
    return undefined; // Couldn't make this happen, but just in case
  }

  return selectedOptions[0].value;
}
function getInputValue(inputElement) {
  switch (inputElement.type) {
    case 'number':
      return inputElement.value === '' ? null : Number(inputElement.value);
    case 'checkbox':
      return inputElement.checked;
    default:
      return inputElement.value;
  }
}
function getSingleElementValue(element) {
  /* istanbul ignore if */
  if (!element) {
    return undefined;
  }
  switch (element.tagName.toLowerCase()) {
    case 'input':
      return getInputValue(element);
    case 'select':
      return getSelectValue(element);
    default:
      return element.value;
  }
}
function compareArraysAsSet(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) {
    return (0, _isEqual.default)(new Set(a), new Set(b));
  }
  return undefined;
}
function toSentence(array, {
  wordConnector = ', ',
  lastWordConnector = ' and '
} = {}) {
  return [array.slice(0, -1).join(wordConnector), array[array.length - 1]].join(array.length > 1 ? lastWordConnector : '');
}