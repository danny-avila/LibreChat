import { createMethods, createModels } from '@librechat/data-schemas';
import type { Mongoose } from 'mongoose';

let initialized = false;

let models: any = null;
let methods: any = {};

export function initAuthModels(mongoose: Mongoose) {
  if (initialized) return;
  models = createModels(mongoose);
  methods = createMethods(mongoose);
  initialized = true;
}

export function getModels() {
  if (!models) {
    throw new Error('Auth models have not been initialized. Call initAuthModels() first.');
  }
  return models;
}

export function getMethods() {
  if (!methods) {
    throw new Error('Auth methods have not been initialized. Call initAuthModels() first.');
  }
  return methods;
}
