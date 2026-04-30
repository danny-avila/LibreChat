import { join } from 'path';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { MongoClient } from 'mongodb';

const secretsClient = new SecretsManagerClient({ requestTimeout: 5000 });

const SECRET_NAME = 'ai-assistant/docdb/uri';
const CA_BUNDLE_PATH = join(__dirname, 'global-bundle.pem');

async function getConnectionString() {
  const response = await secretsClient.send(new GetSecretValueCommand({ SecretId: SECRET_NAME }));
  const secret = JSON.parse(response.SecretString);
  return secret.uri;
}

async function clearOpenIdFromDb(connectionString, email) {
  const tlsOptions = process.env.NODE_ENV === 'production'
    ? { tls: true, tlsCAFile: CA_BUNDLE_PATH }
    : {};

  const client = new MongoClient(connectionString, tlsOptions);
  try {
    await client.connect();
    const result = await client.db().collection('users').updateOne(
      { email },
      { $unset: { openidId: '' } },
    );
    console.log(`DB update: matched=${result.matchedCount} modified=${result.modifiedCount}`);
  } finally {
    await client.close();
  }
}

export const handler = async (event) => {
  const email = event?.email?.trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'invalid email' }) };
  }

  try {
    const connectionString = await getConnectionString();
    await clearOpenIdFromDb(connectionString, email);
  } catch (err) {
    console.error('DB operation failed:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'DB operation failed', detail: err.message }) };
  }

  return { statusCode: 200, body: JSON.stringify({ message: 'ok', email }) };
};
