import envHelper from "./envHelper";

/**
 * Function which is used to get the secure prefix
 * @returns
 */
export const getSecurePrefix = (): string => {
  let KEY_PREFIX = envHelper.getStoragePrefix() || "@secure.";
  if (!KEY_PREFIX.endsWith(".")) return KEY_PREFIX + ".";
  return KEY_PREFIX;
};

export const FINGERPRINT_KEYS = {
  USERAGENT: "UserAgent",
  SCREEN_PRINT: "ScreenPrint",
  PLUGINS: "Plugins",
  FONTS: "Fonts",
  LOCAL_STORAGE: "LocalStorage",
  SESSION_STORAGE: "SessionStorage",
  TIMEZONE: "TimeZone",
  LANGUAGE: "Language",
  SYSTEM_LANGUAGE: "SystemLanguage",
  COOKIE: "Cookie",
  CANVAS: "Canvas",
  HOSTNAME: "Hostname",
};

/**
 * Function which is used to get all the disabled keys
 * @returns
 */
export const getDisabledKeys = (): string[] => {
  let DISABLED_KEYS = envHelper.getDisabledKeys() || "";
  if (DISABLED_KEYS === "") return [];

  const allOptions = [
    FINGERPRINT_KEYS.USERAGENT,
    FINGERPRINT_KEYS.SCREEN_PRINT,
    FINGERPRINT_KEYS.PLUGINS,
    FINGERPRINT_KEYS.FONTS,
    FINGERPRINT_KEYS.LOCAL_STORAGE,
    FINGERPRINT_KEYS.SESSION_STORAGE,
    FINGERPRINT_KEYS.TIMEZONE,
    FINGERPRINT_KEYS.LANGUAGE,
    FINGERPRINT_KEYS.SYSTEM_LANGUAGE,
    FINGERPRINT_KEYS.COOKIE,
    FINGERPRINT_KEYS.CANVAS,
    FINGERPRINT_KEYS.HOSTNAME,
  ];
  const response: string[] = [];
  DISABLED_KEYS.split("|").forEach((key) => {
    if (key === "") {
    } else if (allOptions.includes(key)) response.push(key);
    else console.warn(`react-secure-storage : ${key} is not present in the available disabled keys options! Please go through the documentation`);
  });
  return response;
};
