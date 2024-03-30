const path = require('path');
require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const { askQuestion, silentExit } = require('./helpers');
const User = require('~/models/User');
const connect = require('./connect');
const { loadDefaultModels, loadConfigModels } = require('~/server/services/Config');
const { processModelData, getModelMaxTokens } = require('~/utils');

(async () => {
  await connect();

  let email = '';
  if (process.argv.length >= 3) {
    email = process.argv[2];
  } else {
    email = await askQuestion('Email:');
  }
  let user = await User.findOne({ email: email });
  if (!user) {
    user = {_id: '0'};
  }

  let req = [];
  req.user = {
    id: user._id,
    email: user.email,
  };

  req.app = {
    locals: '',
  };

  const defaultModelsConfig = await loadDefaultModels(req);
  const configModels = await loadConfigModels(req);
  const models = { ...defaultModelsConfig, ...configModels };

  let modelList = [];
  for (const key in models) {
    if (models[key]) {
      let modelArray = models[key];
      modelArray.forEach((model) => {
        modelList.push(model);
      });
    }
  }

  modelList.sort((a, b) => a.localeCompare(b));
  const uniqueModelList = modelList.filter((item, pos) => {
    return modelList.indexOf(item) === pos;
  });

  let modelData = [];
  uniqueModelList.forEach((modelName) => {
    modelMaxTokens = getModelMaxTokens(modelName);
    modelData.push({
      Name: modelName,
      MaxTokens: modelMaxTokens,
    });
  });

  /**
   * Show the welcome / help menu
   */
  console.purple('-----------------------------');
  console.purple('Show available model details');
  console.purple('-----------------------------');

  console.table(modelData);
  console.yellow('undefined models use the default token limit: 4096');

  silentExit(0);
})();

process.on('uncaughtException', (err) => {
  if (!err.message.includes('fetch failed')) {
    console.error('There was an uncaught error:');
    console.error(err);
  }

  if (!err.message.includes('fetch failed')) {
    process.exit(1);
  }
});
