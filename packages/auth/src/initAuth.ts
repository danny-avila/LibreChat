import { BalanceConfig, createMethods } from '@librechat/data-schemas';
import type { Mongoose } from 'mongoose';

// Flag to prevent re-initialization
let initialized = false;

// Internal references to initialized values
let methods: any = null;
let balanceConfig: BalanceConfig;
let saveBuffer: Function;

/**
 * Initializes authentication-related components.
 * This should be called once during application setup.
 *
 * @param mongoose - The Mongoose instance used to create models and methods
 * @param config - Balance configuration used in auth flows
 * @param saveBufferStrategy - Function used to save buffered data mainly used for user avatar in the auth package
 */
export function initAuth(mongoose: Mongoose, config: BalanceConfig, saveBufferStrategy: Function) {
  if (initialized) return;
  methods = createMethods(mongoose);
  balanceConfig = config;
  saveBuffer = saveBufferStrategy;
  initialized = true;
}

/**
 * Returns the initialized methods for auth-related operations.
 * Throws an error if not initialized.
 */
export function getMethods() {
  if (!methods) {
    throw new Error('Auth methods have not been initialized. Call initAuthModels() first.');
  }
  return methods;
}

/**
 * Returns the balance configuration used for auth logic.
 */
export function getBalanceConfig(): BalanceConfig {
  return balanceConfig;
}

/**
 * Returns the function used to save buffered data.
 */
export function getSaveBufferStrategy(): Function {
  return saveBuffer;
}
