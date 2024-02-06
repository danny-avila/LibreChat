import { LocalStorageItem } from "./coreTypes";
import EncryptionService from "./encryption";
import { getSecurePrefix } from "./utils";

const KEY_PREFIX = getSecurePrefix();

/**
 * Function to preload all the local storage data
 * @returns
 */
const getAllLocalStorageItems = () => {
  const localStorageItems: LocalStorageItem = {};
  if (typeof window !== "undefined") {
    const encrypt = new EncryptionService();
    for (const [key, value] of Object.entries(localStorage)) {
      if (key.startsWith(KEY_PREFIX)) {
        let keyType = key.replace(KEY_PREFIX, "")[0];
        let parsedKey = key.replace(/[.][bjns][.]/, ".");
        let decryptedValue = encrypt.decrypt(value);
        let parsedValue = null;
        if (decryptedValue != null)
          switch (keyType) {
            case "b":
              parsedValue = decryptedValue === "true";
              break;
            case "j":
              try {
                parsedValue = JSON.parse(decryptedValue);
              } catch (ex) {
                parsedValue = null;
              }
              break;
            case "n":
              try {
                parsedValue = Number(decryptedValue);
              } catch (ex) {
                parsedValue = null;
              }
              break;
            default:
              parsedValue = decryptedValue;
          }
        localStorageItems[parsedKey] = parsedValue;
      }
    }
  }
  return localStorageItems;
};

export default getAllLocalStorageItems;
