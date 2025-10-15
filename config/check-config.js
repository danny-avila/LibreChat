#!/usr/bin/env node

const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const applyUseAutumnKey = require('../api/utils/applyUseAutumnKey');

const yesNo = (value) => (value ? 'yes' : 'no');

const supplementalUseAutumnEnv = [
  {
    name: 'USEAUTUMN_API_BASE',
    description: 'REST API base URL',
  },
  {
    name: 'USEAUTUMN_PRODUCT_ID',
    description: 'Product identifier',
  },
  {
    name: 'USEAUTUMN_TOKEN_CREDITS_FEATURE_ID',
    description: 'Token credits feature identifier',
  },
  {
    name: 'USEAUTUMN_HAS_SUBSCRIPTION_FEATURE_ID',
    description: 'Subscription feature identifier',
  },
];

const summarizeUseAutumn = () => {
  const status = applyUseAutumnKey();
  const mode = status.isProduction ? 'production' : 'sandbox';
  const source = status.active ? status.source || 'unknown' : 'missing';

  console.log('UseAutumn configuration');
  console.table([
    {
      mode,
      'sandbox key provided': yesNo(status.sandboxKeyPresent),
      'production key provided': yesNo(status.productionKeyPresent),
      'effective USEAUTUMN_KEY available': yesNo(status.active),
      'derived during this check': yesNo(status.derived),
      'USEAUTUMN_KEY source': source,
    },
  ]);

  if (!status.active) {
    console.warn(
      '\n⚠️  USEAUTUMN_KEY is not available. Confirm that the expected key is provided in your environment.',
    );
  } else if (status.derived) {
    console.log(
      `\n✅  USEAUTUMN_KEY resolved from the ${source} credentials while running this check.`,
    );
  } else if (source === 'explicit') {
    console.log('\nℹ️  Using the USEAUTUMN_KEY value that was already present in the environment.');
  } else {
    console.log(
      `\nℹ️  USEAUTUMN_KEY already matched the ${source} credential value before this check ran.`,
    );
  }
};

summarizeUseAutumn();

const checkSupplementalUseAutumnEnv = () => {
  console.log('\nSupplemental UseAutumn environment variables');

  const rows = supplementalUseAutumnEnv.map(({ name, description }) => {
    const provided = Boolean(process.env?.[name]);
    return {
      variable: name,
      description,
      provided: yesNo(provided),
    };
  });

  console.table(rows);

  const missing = supplementalUseAutumnEnv.filter(({ name }) => !process.env?.[name]);
  if (missing.length > 0) {
    const list = missing.map(({ name }) => name).join(', ');
    console.warn(
      `\n⚠️  The following UseAutumn environment variables are not set: ${list}.`,
    );
  } else {
    console.log('\n✅  All supplemental UseAutumn environment variables are set.');
  }
};

checkSupplementalUseAutumnEnv();

const sellingMessageEnv = [
  {
    name: 'SUB_TRIAL_PERIOD_STR',
    description: 'Subscription trial period display string',
  },
  {
    name: 'SUB_PRICE_STR',
    description: 'Subscription price display string',
  },
  {
    name: 'SUB_FAQ_URL',
    description: 'Subscription FAQ URL',
  },
  {
    name: 'SUPPORT_EMAIL',
    description: 'Support contact email',
  },
];

const checkSellingMessageEnv = () => {
  console.log('\nSelling message environment variables');

  const rows = sellingMessageEnv.map(({ name, description }) => {
    const provided = Boolean(process.env?.[name]);
    return {
      variable: name,
      description,
      provided: yesNo(provided),
    };
  });

  console.table(rows);

  const missing = sellingMessageEnv.filter(({ name }) => !process.env?.[name]);
  if (missing.length > 0) {
    const list = missing.map(({ name }) => name).join(', ');
    console.warn(`\n⚠️  The following selling message environment variables are not set: ${list}.`);
  } else {
    console.log('\n✅  All selling message environment variables are set.');
  }
};

checkSellingMessageEnv();
