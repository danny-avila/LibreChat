#!/usr/bin/env node
/**
 * Seeds a default preset that points to the runpod-methodology agent for a given user.
 *
 * ENV:
 *   PRESET_USER_ID  (required) user id to own the preset (e.g., admin user's Mongo _id or "system")
 *   DEFAULT_AGENT_ID (optional) defaults to "runpod-methodology"
 *   DEFAULT_PRESET_ID (optional) defaults to "runpod-methodology-preset"
 *
 * Usage:
 *   PRESET_USER_ID=<user-id> node config/seed-default-preset.js
 */

require('dotenv').config();
const path = require('node:path');
const moduleAlias = require('module-alias');
moduleAlias.addAlias('~', path.resolve(__dirname, '..', 'api'));

const { connectDb } = require('~/db');
const { savePreset } = require('~/models');
const { logger } = require('@librechat/data-schemas');

const USER_ID = process.env.PRESET_USER_ID;
const AGENT_ID = process.env.DEFAULT_AGENT_ID || 'runpod-methodology';
const PRESET_ID = process.env.DEFAULT_PRESET_ID || 'runpod-methodology-preset';

if (!USER_ID) {
  console.error('PRESET_USER_ID is required (who should own the preset)');
  process.exit(1);
}

async function main() {
  await connectDb();

  const presetBody = {
    presetId: PRESET_ID,
    title: 'RunPod Methodology (default)',
    endpoint: 'agents',
    endpointType: 'agents',
    agent_id: AGENT_ID,
    defaultPreset: true,
    order: 0,
  };

  const result = await savePreset(USER_ID, presetBody);
  logger.info(`[seed-default-preset] Upserted preset ${PRESET_ID} for user ${USER_ID}`);
  console.log(result);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
