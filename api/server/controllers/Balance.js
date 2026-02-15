const { Balance, User } = require('~/db/models');
const { getAppConfig } = require('~/server/services/Config/app');
const { kebabCase } = require('lodash');
const { createTransaction } = require('~/models/Transaction');
const { getBalanceConfig } = require('@librechat/api');

function findModelSpecByName(appConfig, specName) {
  return (
    appConfig.modelSpecs?.list?.find((spec) => kebabCase(spec.name) === kebabCase(specName)) || null
  );
}

async function adminAddBalanceController(req, res) {
  // get app config
  const appConfig = await getAppConfig();

  // check if balance is enabled
  const balanceConfig = getBalanceConfig(appConfig);
  if (!balanceConfig?.enabled) {
    return res
      .status(400)
      .json({ error: 'Balance is not enabled. Use librechat.yaml to enable it' });
  }

  // extract parameters from the request body
  const { email, amount, spec } = req.body;

  // Argument validation
  if (!email || typeof amount !== 'number') {
    return res
      .status(400)
      .json({ error: 'Email and amount are required, and amount must be a number' });
  }

  // Validate the user
  const user = await User.findOne({ email }).lean();
  if (!user) {
    return res.status(404).json({ error: 'No user with that email was found!' });
  }

  // Increase the balance record for the user, creating a new one if it doesn't exist
  try {
    await createTransaction(
      {
        user: user._id,
        tokenType: 'credits',
        context: 'admin',
        spec,
        rawAmount: +amount,
        balance: balanceConfig,
      },
      appConfig,
    );
  } catch (err) {
    return res.status(500).json({ error: 'Failed to add balance' });
  }

  // Get the last balance record for the user
  const record = await Balance.findOne({ user: user._id }).lean();

  // if no balance record exists, return 404
  if (!record) {
    return res.status(404).json({ error: 'No balance record found for that user!' });
  }

  // return the balance information
  return res.status(200).json({
    message: `${amount} added successfully for user ${email}${spec ? ` and spec ${spec}` : ''}`,
    email,
    balance: record.tokenCredits,
    perSpecTokenCredits: record.perSpecTokenCredits,
  });
}

async function adminSetBalanceController(req, res) {
  // get app config
  const appConfig = await getAppConfig();

  // check if balance is enabled
  const balanceConfig = getBalanceConfig(appConfig);
  if (!balanceConfig?.enabled) {
    return res
      .status(400)
      .json({ error: 'Balance is not enabled. Use librechat.yaml to enable it' });
  }

  // Extract parameters from the request body
  const { email, amount, spec } = req.body;

  // Argument validation
  if (!email || typeof amount !== 'number') {
    return res
      .status(400)
      .json({ error: 'Email and amount are required, and amount must be a number' });
  }

  // Validate the user
  const user = await User.findOne({ email }).lean();
  if (!user) {
    return res.status(404).json({ error: 'No user with that email was found!' });
  }

  // If spec is provided, check for per-spec balance first
  let record;
  if (spec) {
    const modelSpec = findModelSpecByName(appConfig.config, spec);
    if (modelSpec?.balance?.enabled) {
      record = await Balance.findOneAndUpdate(
        { user: user._id },
        { $set: { [`perSpecTokenCredits.${kebabCase(spec)}`]: amount } },
        { upsert: true, new: true },
      ).lean();
    }
  } else {
    record = await Balance.findOneAndUpdate(
      { user: user._id },
      { $set: { tokenCredits: amount } },
      { upsert: true, new: true },
    ).lean();
  }

  // Return the balance information
  return res.status(200).json({
    message: `Balance set successfully to ${amount} for user ${email}${spec ? ` and spec ${spec}` : ''}`,
    email,
    balance: record.tokenCredits,
    perSpecTokenCredits: record.perSpecTokenCredits,
  });
}

async function adminGetBalanceController(req, res) {
  // get app config
  const appConfig = await getAppConfig();

  // check if balance is enabled
  const balanceConfig = getBalanceConfig(appConfig);
  if (!balanceConfig?.enabled) {
    return res
      .status(400)
      .json({ error: 'Balance is not enabled. Use librechat.yaml to enable it' });
  }

  // extract parameters from the request query
  const { email } = req.query;

  // Validate the user
  const user = await User.findOne({ email }).lean();
  if (!user) {
    return res.status(404).json({ error: 'No user with that email was found!' });
  }

  // Get the last balance record for the user
  const record = await Balance.findOne({ user: user._id }).lean();

  // if no balance record exists, return 404
  if (!record) {
    return res.status(404).json({ error: 'No balance record found for that user!' });
  }

  // return the balance information
  return res.status(200).json({
    email,
    balance: record.tokenCredits,
    perSpecTokenCredits: record.perSpecTokenCredits,
  });
}

async function getBalanceController(req, res) {
  const balanceData = await Balance.findOne(
    { user: req.user.id },
    '-_id tokenCredits perSpecTokenCredits autoRefillEnabled refillIntervalValue refillIntervalUnit lastRefill refillAmount',
  ).lean();

  if (!balanceData) {
    return res.status(404).json({ error: 'Balance not found' });
  }

  // If auto-refill is not enabled, remove auto-refill related fields from the response
  if (!balanceData.autoRefillEnabled) {
    delete balanceData.refillIntervalValue;
    delete balanceData.refillIntervalUnit;
    delete balanceData.lastRefill;
    delete balanceData.refillAmount;
  }

  res.status(200).json(balanceData);
}

module.exports = {
  getBalanceController,
  adminAddBalanceController,
  adminSetBalanceController,
  adminGetBalanceController
};
