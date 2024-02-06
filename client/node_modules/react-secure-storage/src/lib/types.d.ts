/**
 * This version of local storage supports the following data types as it is and other data types will be treated as string
 * object, string, number and Boolean
 * To change the custom secure key, Please add `SECURE_LOCAL_STORAGE_HASH_KEY` or `REACT_APP_SECURE_LOCAL_STORAGE_HASH_KEY` to .env and change the value
 */
declare class SecureLocalStorage {
  // private _localStorageItems;
  constructor();

  /**
   * Function to set value to secure local storage
   * @param key to be added
   * @param value value to be added
   */
  setItem(key: string, value: string | object | number | boolean): void;

  /**
   * Function to get value from secure local storage
   * @param key to get
   * @returns
   */
  getItem(key: string): string | object | number | boolean | null;

  /**
   * Function to remove item from secure local storage
   * @param key to be removed
   */
  removeItem(key: string): void;

  /**
   * Function to clear secure local storage
   */
  clear(): void;
}

/**
 * Create an instance of secureLocalStorage
 */
const secureLocalStorage = new SecureLocalStorage();

export default secureLocalStorage;
