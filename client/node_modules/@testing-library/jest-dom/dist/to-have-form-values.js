"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.toHaveFormValues = toHaveFormValues;
var _extends2 = _interopRequireDefault(require("@babel/runtime/helpers/extends"));
var _isEqualWith = _interopRequireDefault(require("lodash/isEqualWith"));
var _uniq = _interopRequireDefault(require("lodash/uniq"));
var _css = _interopRequireDefault(require("css.escape"));
var _utils = require("./utils");
// Returns the combined value of several elements that have the same name
// e.g. radio buttons or groups of checkboxes
function getMultiElementValue(elements) {
  const types = (0, _uniq.default)(elements.map(element => element.type));
  if (types.length !== 1) {
    throw new Error('Multiple form elements with the same name must be of the same type');
  }
  switch (types[0]) {
    case 'radio':
      {
        const theChosenOne = elements.find(radio => radio.checked);
        return theChosenOne ? theChosenOne.value : undefined;
      }
    case 'checkbox':
      return elements.filter(checkbox => checkbox.checked).map(checkbox => checkbox.value);
    default:
      // NOTE: Not even sure this is a valid use case, but just in case...
      return elements.map(element => element.value);
  }
}
function getFormValue(container, name) {
  const elements = [...container.querySelectorAll(`[name="${(0, _css.default)(name)}"]`)];
  /* istanbul ignore if */
  if (elements.length === 0) {
    return undefined; // shouldn't happen, but just in case
  }

  switch (elements.length) {
    case 1:
      return (0, _utils.getSingleElementValue)(elements[0]);
    default:
      return getMultiElementValue(elements);
  }
}

// Strips the `[]` suffix off a form value name
function getPureName(name) {
  return /\[\]$/.test(name) ? name.slice(0, -2) : name;
}
function getAllFormValues(container) {
  const names = Array.from(container.elements).map(element => element.name);
  return names.reduce((obj, name) => (0, _extends2.default)({}, obj, {
    [getPureName(name)]: getFormValue(container, name)
  }), {});
}
function toHaveFormValues(formElement, expectedValues) {
  (0, _utils.checkHtmlElement)(formElement, toHaveFormValues, this);
  if (!formElement.elements) {
    // TODO: Change condition to use instanceof against the appropriate element classes instead
    throw new Error('toHaveFormValues must be called on a form or a fieldset');
  }
  const formValues = getAllFormValues(formElement);
  return {
    pass: Object.entries(expectedValues).every(([name, expectedValue]) => (0, _isEqualWith.default)(formValues[name], expectedValue, _utils.compareArraysAsSet)),
    message: () => {
      const to = this.isNot ? 'not to' : 'to';
      const matcher = `${this.isNot ? '.not' : ''}.toHaveFormValues`;
      const commonKeyValues = Object.keys(formValues).filter(key => expectedValues.hasOwnProperty(key)).reduce((obj, key) => (0, _extends2.default)({}, obj, {
        [key]: formValues[key]
      }), {});
      return [this.utils.matcherHint(matcher, 'element', ''), `Expected the element ${to} have form values`, this.utils.diff(expectedValues, commonKeyValues)].join('\n\n');
    }
  };
}