#!/usr/bin/env node

const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const applyUseAutumnKey = require('../api/utils/applyUseAutumnKey');
const { describeLogtoConfiguration } = require('../api/server/services/LogtoService');

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

const summarizeLogto = () => {
  const status = describeLogtoConfiguration();
  console.log('\nLogto configuration');
  console.table([
    {
      'base URL': status.baseUrl || 'not configured',
      'app ID provided': yesNo(status.clientIdSet),
      'client secret provided': yesNo(status.clientSecretSet),
      'effective management resource': status.effectiveResource || 'not configured',
      'management API available': yesNo(status.canQueryManagementApi),
    },
  ]);

  if (!status.canQueryManagementApi) {
    console.warn(
      [
        '\n⚠️  LibreChat cannot reach the Logto management API with the current credentials.',
        'Set LOGTO_APP_BASE_URL, LOGTO_APP_ID, and LOGTO_APP_SECRET to enable lookups.',
      ].join(' '),
    );
  } else {
    console.log('\n✅  Logto credentials are present and LibreChat can query the management API.');
  }
};

summarizeUseAutumn();
summarizeLogto();
