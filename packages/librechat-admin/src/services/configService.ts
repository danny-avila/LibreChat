import fs from 'fs';
import path from 'path';
import { resolveFromRoot } from '../utils/paths';
import yaml from 'js-yaml';
import _ from 'lodash';
import mongoose from 'mongoose';
import AdminConfig from '../models/AdminConfig';
import { generateMergedYaml } from './generateMergedConfig';

export const ALLOW_LIST = [
  // Interface feature toggles
  'interface.customWelcome',
  'interface.modelSelect',
  'interface.parameters',
  'interface.sidePanel',
  'interface.presets',
  'interface.prompts',
  'interface.memories',
  'interface.bookmarks',
  'interface.multiConvo',
  'interface.agents',
  'interface.endpointsMenu',
  // Site branding & text / images
  'appTitle',
  'helpAndFaqURL',
  'customFooter',
  'logoUrl',
  'faviconUrl',
  'backgroundImageUrl',
  // Legal & compliance objects
  'privacyPolicy',
  'termsOfService',
  // Model access toggles within interface section
  'interface.webSearch',
  'interface.runCode',
  // Conversation settings
  'interface.temporaryChat',
  // Agents endpoint settings
  'endpoints.agents.recursionLimit',
  'endpoints.agents.maxRecursionLimit',
  'endpoints.agents.disableBuilder',
  'endpoints.agents.capabilities',
  'endpoints.agents.allowedProviders',
  // Sharing / public links
  'sharedLinksEnabled',
  'publicSharedLinksEnabled',
  // Actions (OpenAPI specs)
  'actions.allowedDomains',
  // Temporary chat retention
  'interface.temporaryChatRetention',
  // Balance system
  'balance.enabled',
  'balance.startBalance',
  'balance.autoRefillEnabled',
  'balance.refillIntervalValue',
  'balance.refillIntervalUnit',
  'balance.refillAmount',
  // Memory settings
  'memory.disabled',
  'memory.validKeys',
  'memory.tokenLimit',
  'memory.personalize',
  'memory.agent.id',
  // Custom endpoints
  'endpoints.custom',
  // Plugins endpoint & Beta features
  'interface.plugins',
];

const PROJECT_ROOT = resolveFromRoot();

export const OVERLAY_PATH = process.env.ADMIN_OVERLAY_PATH || path.join(PROJECT_ROOT, 'admin-overrides.yaml');

async function ensureDbConnection(): Promise<void> {
  if (mongoose.connection.readyState === 1) return;
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('MongoDB connection timeout')), 10000);
    const check = (): void => {
      if (mongoose.connection.readyState === 1) {
        clearTimeout(timeout);
        resolve();
      } else {
        setTimeout(check, 100);
      }
    };
    check();
  });
}

async function getOverrideDoc() {
  await ensureDbConnection();
  let doc = await AdminConfig.findOne().sort({ updatedAt: -1 });
  if (!doc) {
    doc = await AdminConfig.create({ overrides: {} });
  }
  return doc;
}

export async function getOverrides() {
  const doc = await getOverrideDoc();
  return doc.overrides || {};
}

export async function updateOverride(key: string, value: unknown, userId?: string) {
  if (!ALLOW_LIST.includes(key)) {
    const err: any = new Error(`Key '${key}' not allowed`);
    err.status = 400;
    throw err;
  }

  const doc = await getOverrideDoc();
  // Basic type coercion for known numeric and array settings
  const numericKeys = new Set([
    'endpoints.agents.recursionLimit',
    'endpoints.agents.maxRecursionLimit',
    'interface.temporaryChatRetention',
    'balance.startBalance',
    'balance.refillIntervalValue',
    'balance.refillAmount',
    'memory.tokenLimit',
  ]);

  const arrayKeys = new Set([
    'endpoints.agents.capabilities',
    'endpoints.agents.allowedProviders',
    'actions.allowedDomains',
    'memory.validKeys',
  ]);

  let coercedValue: unknown = value;

  if (numericKeys.has(key)) {
    coercedValue = typeof value === 'string' ? Number(value) : value;
  } else if (arrayKeys.has(key)) {
    if (typeof value === 'string') {
      coercedValue = value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }

  _.set(doc.overrides, key, coercedValue);
  // Inform Mongoose that a Mixed type field was mutated in place
  doc.markModified('overrides');
  doc.updatedBy = userId as any;
  doc.updatedAt = new Date();

  await doc.save();
  await writeOverlayYaml(doc.overrides);
  
  // Filter out auth fields for LibreChat merged config too
  const cleanOverrides = _.cloneDeep(doc.overrides);
  delete cleanOverrides.auth;
  await generateMergedYaml({ overrides: cleanOverrides });

  return doc.overrides;
}


function writeOverlayYaml(overrides: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    // Filter out auth.* fields from YAML output - these are only for admin panel control
    const cleanOverrides = _.cloneDeep(overrides);
    delete cleanOverrides.auth; // Remove entire auth section
    
    const yamlStr = yaml.dump(cleanOverrides, { lineWidth: 120 });
    fs.writeFile(OVERLAY_PATH, yamlStr, 'utf8', (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}