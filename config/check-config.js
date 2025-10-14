#!/usr/bin/env node

const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const applyUseAutumnKey = require('../api/utils/applyUseAutumnKey');

const yesNo = (value) => (value ? 'yes' : 'no');

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
