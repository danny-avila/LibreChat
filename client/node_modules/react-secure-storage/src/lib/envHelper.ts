const SUPPORTED_PREFIX = ["", "REACT_APP_", "NEXT_PUBLIC_", "VITE_"];

export type SECURE_LOCAL_STORAGE_KEYS = "SECURE_LOCAL_STORAGE_DISABLED_KEYS" | "SECURE_LOCAL_STORAGE_PREFIX" | "SECURE_LOCAL_STORAGE_HASH_KEY";

/**
 * Function to get SECURE_LOCAL_STORAGE_HASH_KEY
 * @returns
 */
const getHashKey = () => {
  let value: string | null | undefined = null;
  try {
    if (typeof Cypress != "undefined") {
      value = Cypress.env("SECURE_LOCAL_STORAGE_HASH_KEY") || Cypress.env("REACT_APP_SECURE_LOCAL_STORAGE_HASH_KEY") || Cypress.env("NEXT_PUBLIC_SECURE_LOCAL_STORAGE_HASH_KEY") || Cypress.env("VITE_SECURE_LOCAL_STORAGE_HASH_KEY");
    } else if (typeof process.env != "undefined") {
      value = process.env.SECURE_LOCAL_STORAGE_HASH_KEY || process.env.REACT_APP_SECURE_LOCAL_STORAGE_HASH_KEY || process.env.NEXT_PUBLIC_SECURE_LOCAL_STORAGE_HASH_KEY || process.env.VITE_SECURE_LOCAL_STORAGE_HASH_KEY;
    } else {
      console.warn(`react-secure-storage : process is not defined! Just a warning!`);
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
const getStoragePrefix = () => {
  let value: string | null | undefined = null;
  try {
    if (typeof Cypress != "undefined") {
      value = Cypress.env("SECURE_LOCAL_STORAGE_PREFIX") || Cypress.env("REACT_APP_SECURE_LOCAL_STORAGE_PREFIX") || Cypress.env("NEXT_PUBLIC_SECURE_LOCAL_STORAGE_PREFIX") || Cypress.env("VITE_SECURE_LOCAL_STORAGE_PREFIX");
    } else if (typeof process.env != "undefined") {
      value = process.env.SECURE_LOCAL_STORAGE_PREFIX || process.env.REACT_APP_SECURE_LOCAL_STORAGE_PREFIX || process.env.NEXT_PUBLIC_SECURE_LOCAL_STORAGE_PREFIX || process.env.VITE_SECURE_LOCAL_STORAGE_PREFIX;
    } else {
      console.warn(`react-secure-storage : process is not defined! Just a warning!`);
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
const getDisabledKeys = () => {
  let value: string | null | undefined = null;
  try {
    if (typeof Cypress != "undefined") {
      value = Cypress.env("SECURE_LOCAL_STORAGE_DISABLED_KEYS") || Cypress.env("REACT_APP_SECURE_LOCAL_STORAGE_DISABLED_KEYS") || Cypress.env("NEXT_PUBLIC_SECURE_LOCAL_STORAGE_DISABLED_KEYS") || Cypress.env("VITE_SECURE_LOCAL_STORAGE_DISABLED_KEYS");
    } else if (typeof process.env != "undefined") {
      value = process.env.SECURE_LOCAL_STORAGE_DISABLED_KEYS || process.env.REACT_APP_SECURE_LOCAL_STORAGE_DISABLED_KEYS || process.env.NEXT_PUBLIC_SECURE_LOCAL_STORAGE_DISABLED_KEYS || process.env.VITE_SECURE_LOCAL_STORAGE_DISABLED_KEYS;
    } else {
      console.warn(`react-secure-storage : process is not defined! Just a warning!`);
    }
  } catch (ex) {
    return null;
  }
  return value;
};

const envHelper = {
  getHashKey,
  getStoragePrefix,
  getDisabledKeys,
};

export default envHelper;
