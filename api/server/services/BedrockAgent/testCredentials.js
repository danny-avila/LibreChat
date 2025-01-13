const { checkCredentials } = require('./checkCredentials');

async function runTest() {
  console.log('Testing AWS Bedrock Agent credentials...');
  console.log('Using environment variables:');
  console.log('AWS_REGION:', process.env.AWS_REGION);
  console.log('BEDROCK_AWS_DEFAULT_REGION:', process.env.BEDROCK_AWS_DEFAULT_REGION);
  console.log('AWS_ACCESS_KEY_ID:', process.env.AWS_ACCESS_KEY_ID ? '✓ Set' : '✗ Not set');
  console.log('BEDROCK_AWS_ACCESS_KEY_ID:', process.env.BEDROCK_AWS_ACCESS_KEY_ID ? '✓ Set' : '✗ Not set');
  console.log('AWS_SECRET_ACCESS_KEY:', process.env.AWS_SECRET_ACCESS_KEY ? '✓ Set' : '✗ Not set');
  console.log('BEDROCK_AWS_SECRET_ACCESS_KEY:', process.env.BEDROCK_AWS_SECRET_ACCESS_KEY ? '✓ Set' : '✗ Not set');
  
  const result = await checkCredentials();
  if (result) {
    console.log('\n✅ Credentials verified successfully!');
  } else {
    console.log('\n❌ Failed to verify credentials');
  }
}

runTest().catch(console.error);
