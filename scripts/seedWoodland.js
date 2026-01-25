const path = require('path');
require(path.resolve(__dirname, '../node_modules/module-alias/register'));
const moduleAlias = require('module-alias');
moduleAlias.addAlias('~', path.resolve(__dirname, '..', 'api'));
moduleAlias.addAlias('~/db/models', path.resolve(__dirname, '..', 'api/db/models'));
const mongoose = require('mongoose');
const { seedWoodlandAgents } = require('~/models/AgentSeed');
const { seedWoodlandPrompts } = require('~/models/PromptSeed');

(async () => {
  try {
    const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27018/librechat';
    console.log(`[Woodland Seed] Connecting to ${uri}`);
    await mongoose.connect(uri);
    await seedWoodlandAgents();
    await seedWoodlandPrompts();
    console.log('[Woodland Seed] Agents and Prompts reseeded successfully.');
  } catch (error) {
    console.error('[Woodland Seed] Failed to reseed agents:', error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
})();
