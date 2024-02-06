/* eslint-disable no-undef */
import envHelper from "./envHelper";
import clientJS from "./fingerprint.lib";

const HASH_KEY = "E86E2612010258B35137";

/**
 * Function to get browser finger print
 * @returns
 */
const getFingerprint = () => {
  let HASH_KEY_CUSTOM = envHelper.getHashKey() || HASH_KEY;

  if (typeof window === "undefined") return HASH_KEY_CUSTOM;
  return clientJS.getFingerprint() + HASH_KEY_CUSTOM;
};

export default getFingerprint;
