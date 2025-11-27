#!/usr/bin/env node
/**
 * Seeds a default preset pointing to the DEFAULT_AGENT_ID for every user.
 *
 * ENV:
 *   DEFAULT_AGENT_ID  (optional) defaults to "runpod-methodology"
 *   DEFAULT_PRESET_ID (optional) defaults to "runpod-methodology-preset"
 *
 * Usage:
 *   node config/seed-default-preset-all.js
 */

require('dotenv').config();
const path = require('node:path');
const moduleAlias = require('module-alias');
moduleAlias.addAlias('~', path.resolve(__dirname, '..', 'api'));

const { connectDb } = require('~/db');
const { savePreset } = require('~/models');
const { User } = require('~/db/models');
const { logger } = require('@librechat/data-schemas');

const AGENT_ID = process.env.DEFAULT_AGENT_ID || 'runpod-methodology';
const PRESET_ID = process.env.DEFAULT_PRESET_ID || 'runpod-methodology-preset';

async function main() {
  await connectDb();

  const users = await User.find({}, { _id: 1 }).lean();
  logger.info(`[seed-default-preset-all] Seeding preset for ${users.length} users`);

  for (const user of users) {
    const presetBody = {
      presetId: PRESET_ID,
      title: 'RunPod Methodology (default)',
      endpoint: 'agents',
      endpointType: 'agents',
      agent_id: AGENT_ID,
      defaultPreset: true,
      order: 0,
    };

    await savePreset(user._id.toString(), presetBody);
    logger.info(`[seed-default-preset-all] Upserted preset ${PRESET_ID} for user ${user._id}`);
  }

  console.log('Done');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
