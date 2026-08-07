import type { Schema } from 'mongoose';
import { createModels } from '~/models';

/**
 * Derives a `{ modelName: Schema }` map from the live `createModels` registry
 * instead of a hand-maintained list, so every FerretDB harness spec that
 * needs "one of every LibreChat model" tracks the current model set
 * automatically as models are added or removed.
 */
export function getModelSchemas(mongoose: typeof import('mongoose')): Record<string, Schema> {
  const models = createModels(mongoose);
  const schemas: Record<string, Schema> = {};
  for (const name in models) {
    schemas[name] = models[name as keyof typeof models].schema;
  }
  return schemas;
}
