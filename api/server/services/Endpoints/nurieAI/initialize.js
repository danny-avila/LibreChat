const { EModelEndpoint } = require('librechat-data-provider');
const { NurieAIClient } = require('~/app');
const { getUserKeyValues } = require('~/server/services/UserService');

const initializeClient = async ({ req, res, endpointOption }) => {
  const {
    NURIEAI_KEY,
    NURIEAI_API_KEY,
  } = process.env;
  const isUserProvided = NURIEAI_KEY === 'user_provided';

  let userKey = null;
  let userValues = null;
  if (isUserProvided) {
    userValues = await getUserKeyValues({ userId: req.user.id, name: EModelEndpoint.nurieAI });
    userKey = userValues?.apiKey;
  }

  const credentials = isUserProvided ? userKey : NURIEAI_API_KEY;

  let clientOptions = {
    req,
    res,
    ...endpointOption,
  };

  //   /** @type {undefined | TBaseEndpoint} */
  //   const allConfig = req.app.locals.all;
  //   /** @type {undefined | TBaseEndpoint} */
  //   const googleConfig = req.app.locals[EModelEndpoint.google];

  //   if (googleConfig) {
  //     clientOptions.streamRate = googleConfig.streamRate;
  //   }

  //   if (allConfig) {
  //     clientOptions.streamRate = allConfig.streamRate;
  //   }

  //   clientOptions = {
  //     req,
  //     res,
  //     reverseProxyUrl: GOOGLE_REVERSE_PROXY ?? null,
  //     authHeader: isEnabled(GOOGLE_AUTH_HEADER) ?? null,
  //     proxy: PROXY ?? null,
  //     ...clientOptions,
  //     ...endpointOption,
  //   };

  //   if (optionsOnly) {
  //     clientOptions = Object.assign(
  //       {
  //         modelOptions: endpointOption.model_parameters,
  //       },
  //       clientOptions,
  //     );
  //     if (overrideModel) {
  //       clientOptions.modelOptions.model = overrideModel;
  //     }
  //     return getLLMConfig(credentials, clientOptions);
  //   }

  const client = new NurieAIClient(credentials, clientOptions);

  return {
    client,
    credentials,
  };
};

module.exports = initializeClient;
