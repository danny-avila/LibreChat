import { join } from 'path';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { CognitoIdentityProviderClient, ListUsersCommand, AdminDeleteUserCommand } from '@aws-sdk/client-cognito-identity-provider';
import { MongoClient } from 'mongodb';

const secretsClient = new SecretsManagerClient({});
const cognitoClient = new CognitoIdentityProviderClient({});

const SECRET_NAME = 'ai-assistant/docdb/uri';
const CA_BUNDLE_PATH = join(__dirname, 'global-bundle.pem');
const USER_POOL_ID = process.env.USER_POOL_ID;

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

async function deleteFromCognito(email) {
  const { Users = [] } = await cognitoClient.send(new ListUsersCommand({
    UserPoolId: USER_POOL_ID,
    Filter: `email = "${email}"`,
  }));

  await Promise.all(Users.map((user) =>
    cognitoClient.send(new AdminDeleteUserCommand({
      UserPoolId: USER_POOL_ID,
      Username: user.Username,
    })),
  ));

  console.log(`Cognito: deleted ${Users.length} user(s) for ${email}`);
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

  try {
    await deleteFromCognito(email);
  } catch (err) {
    console.error(`Cognito operation failed for ${email} — delete manually from user pool ${USER_POOL_ID}:`, err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Cognito operation failed', detail: err.message }) };
  }

  return { statusCode: 200, body: JSON.stringify({ message: 'ok', email }) };
};
