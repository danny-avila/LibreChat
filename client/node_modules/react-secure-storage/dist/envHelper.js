"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var SUPPORTED_PREFIX = ["", "REACT_APP_", "NEXT_PUBLIC_", "VITE_"];

/**
 * Function to get SECURE_LOCAL_STORAGE_HASH_KEY
 * @returns
 */
var getHashKey = function getHashKey() {
  var value = null;

  try {
    if (typeof Cypress != "undefined") {
      value = Cypress.env("SECURE_LOCAL_STORAGE_HASH_KEY") || Cypress.env("REACT_APP_SECURE_LOCAL_STORAGE_HASH_KEY") || Cypress.env("NEXT_PUBLIC_SECURE_LOCAL_STORAGE_HASH_KEY") || Cypress.env("VITE_SECURE_LOCAL_STORAGE_HASH_KEY");
    } else if (typeof process.env != "undefined") {
      value = process.env.SECURE_LOCAL_STORAGE_HASH_KEY || process.env.REACT_APP_SECURE_LOCAL_STORAGE_HASH_KEY || process.env.NEXT_PUBLIC_SECURE_LOCAL_STORAGE_HASH_KEY || process.env.VITE_SECURE_LOCAL_STORAGE_HASH_KEY;
    } else {
      console.warn("react-secure-storage : process is not defined! Just a warning!");
    }
  } catch (ex) {
    return null;
  }

  return value;
};
/**
 * Function to get SECURE_LOCAL_STORAGE_PREFIX
 * @returns
 */


var getStoragePrefix = function getStoragePrefix() {
  var value = null;

  try {
    if (typeof Cypress != "undefined") {
      value = Cypress.env("SECURE_LOCAL_STORAGE_PREFIX") || Cypress.env("REACT_APP_SECURE_LOCAL_STORAGE_PREFIX") || Cypress.env("NEXT_PUBLIC_SECURE_LOCAL_STORAGE_PREFIX") || Cypress.env("VITE_SECURE_LOCAL_STORAGE_PREFIX");
    } else if (typeof process.env != "undefined") {
      value = process.env.SECURE_LOCAL_STORAGE_PREFIX || process.env.REACT_APP_SECURE_LOCAL_STORAGE_PREFIX || process.env.NEXT_PUBLIC_SECURE_LOCAL_STORAGE_PREFIX || process.env.VITE_SECURE_LOCAL_STORAGE_PREFIX;
    } else {
      console.warn("react-secure-storage : process is not defined! Just a warning!");
    }
  } catch (ex) {
    return null;
  }

  return value;
};
/**
 * Function to get SECURE_LOCAL_STORAGE_DISABLED_KEYS
 * @returns
 */


var getDisabledKeys = function getDisabledKeys() {
  var value = null;

  try {
    if (typeof Cypress != "undefined") {
      value = Cypress.env("SECURE_LOCAL_STORAGE_DISABLED_KEYS") || Cypress.env("REACT_APP_SECURE_LOCAL_STORAGE_DISABLED_KEYS") || Cypress.env("NEXT_PUBLIC_SECURE_LOCAL_STORAGE_DISABLED_KEYS") || Cypress.env("VITE_SECURE_LOCAL_STORAGE_DISABLED_KEYS");
    } else if (typeof process.env != "undefined") {
      value = process.env.SECURE_LOCAL_STORAGE_DISABLED_KEYS || process.env.REACT_APP_SECURE_LOCAL_STORAGE_DISABLED_KEYS || process.env.NEXT_PUBLIC_SECURE_LOCAL_STORAGE_DISABLED_KEYS || process.env.VITE_SECURE_LOCAL_STORAGE_DISABLED_KEYS;
    } else {
      console.warn("react-secure-storage : process is not defined! Just a warning!");
    }
  } catch (ex) {
    return null;
  }

  return value;
};

var envHelper = {
  getHashKey: getHashKey,
  getStoragePrefix: getStoragePrefix,
  getDisabledKeys: getDisabledKeys
};
var _default = envHelper;
exports.default = _default;