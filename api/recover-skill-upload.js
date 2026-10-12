require('module-alias/register');
const mongoose = require('mongoose');
const { createModels, createMethods, runAsSystem } = require('@librechat/data-schemas');
const { runSkillUploadRecoveryCli } = require('@librechat/api');

createModels(mongoose);
const methods = createMethods(mongoose);

runSkillUploadRecoveryCli(process.argv.slice(2), {
  connect: () => require('./db/connect').connectDb(),
  disconnect: () => mongoose.disconnect(),
  runAsSystem,
  getIntent: methods.getSkillUploadIntent,
  listIntents: methods.listSkillUploadIntents,
  recoverStoppedIntent: methods.recoverStoppedSkillUploadIntent,
  write: console.log,
  writeError: console.error,
})
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
