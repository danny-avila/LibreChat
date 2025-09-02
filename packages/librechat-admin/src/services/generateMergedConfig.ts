import fs from 'fs';
import path from 'path';
import { resolveFromRoot } from '../utils/paths';
import yaml from 'js-yaml';
import _ from 'lodash';
import mongoose from 'mongoose';
import AdminConfig from '../models/AdminConfig';

const PROJECT_ROOT = resolveFromRoot();

const BASE_PATH = process.env.BASE_CONFIG_PATH || path.join(PROJECT_ROOT, 'librechat.yaml');
const MERGED_PATH = path.join(PROJECT_ROOT, 'librechat.merged.yaml');

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

function loadYamlSafe(filePath: string): Record<string, unknown> {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, 'utf8');
  return (yaml.load(content) as Record<string, unknown>) || {};
}

async function loadAdminOverrides(): Promise<Record<string, unknown>> {
  try {
    await ensureDbConnection();
    const adminDoc = await AdminConfig.findOne().sort({ updatedAt: -1 }).lean().exec();
    if (!adminDoc?.overrides || Object.keys(adminDoc.overrides).length === 0) {
      return {};
    }
    return adminDoc.overrides as Record<string, unknown>;
      } catch (error: any) {
      return {};
    }
}

function customMerge(srcValue: any): any {
  if (Array.isArray(srcValue)) {
    return srcValue;
  }
  return undefined;
}

export async function generateMergedYaml(options: { overrides?: Record<string, unknown>; preStartup?: boolean } = {}): Promise<Record<string, unknown>> {
  try {
    const base = loadYamlSafe(BASE_PATH);
    const adminOverrides = options.overrides !== undefined ? options.overrides : await loadAdminOverrides();
    const merged = _.mergeWith({}, base, adminOverrides, customMerge);

    fs.writeFileSync(MERGED_PATH, yaml.dump(merged, { lineWidth: 120 }), 'utf8');

    if (!process.env.CONFIG_PATH && !options.preStartup) {
      process.env.CONFIG_PATH = MERGED_PATH;
          }

    return merged;
  } catch (error) {
    throw error;
  }
} 