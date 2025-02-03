/**
 * @file deploy-secrets.js
 * @description
 * A standalone script to deploy environment variables (or secrets)
 * to a cloud provider's secrets manager or, in the case of Azure,
 * optionally to an Azure Web App's application settings.
 *
 * Usage:
 *   node deploy-secrets.js --provider <aws|azure|gcp> [--target <keyvault|webapp>] [--env <envFile>]
 *
 * For AWS, the script deploys each env var as a secret in AWS Secrets Manager.
 * For Azure, it either deploys to Azure Key Vault ( --target keyvault)
 *   or updates the Web App's application settings (--target webapp).
 * For GCP, it deploys to GCP Secret Manager.
 *
 * This script expects the necessary credentials to be set in your environment.
 */

const dotenv = require('dotenv');
const minimist = require('minimist');

// Parse command-line arguments
const args = minimist(process.argv.slice(2));
const provider = args.provider;
const target = args.target || null;
const envFile = args.env || '.env';

if (!provider) {
  console.error('Error: Please specify a provider using --provider <aws|azure|gcp>');
  process.exit(1);
}

// Load environment variables from the specified file
const result = dotenv.config({ path: envFile });
if (result.error) {
  console.error('Error loading env file:', result.error);
  process.exit(1);
}

/**
 * Main dispatcher for deploying secrets based on the provider.
 */
(async () => {
  switch (provider.toLowerCase()) {
    case 'aws':
      await deployToAWS();
      break;
    case 'azure':
      if (!target) {
        console.error('No target for azure provided. Please specify either "webapp" or "keyvault".');
        process.exit(1);
      }

      switch (target.toLowerCase()) {
        case 'webapp':
          await deployToAzureWebApp();
          break;
        case 'keyvault':
          await deployToAzureKeyVault();
          break;
        default:
          console.error(`Unknown target for azure: ${target}. Use one of: webapp, keyvault.`);
          process.exit(1);
      }
      break;
    case 'gcp':
      await deployToGCP();
      break;
    default:
      console.error(`Unknown provider: ${provider}. Use one of: aws, azure, gcp.`);
      process.exit(1);
  }
})();

/**
 * Deploys secrets to AWS Secrets Manager.
 *
 * For each environment variable (excluding specified credentials/configurations),
 * attempts to create a new secret. If the secret already exists, it updates its value.
 *
 * @async
 * @function deployToAWS
 */
async function deployToAWS() {
  const { SecretsManagerClient, CreateSecretCommand, PutSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

  const awsregion = process.env.AWS_REGION;
  if (!awsregion) {
    console.error('Error: AWS_REGION is not set in your environment variables.');
    process.exit(1);
  }

  // The AWS SDK picks up credentials from environment variables (or CLI credentials)
  const client = new SecretsManagerClient({ region: awsregion });

  const keys = Object.keys(process.env);
  // Exclude credential/configuration keys so they are not uploaded as secrets.
  const exclude = [
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_REGION',
    'KEY_VAULT_URL',
    'GCP_PROJECT_ID',
    'AZURE_CLIENT_ID',
    'AZURE_CLIENT_SECRET',
    'AZURE_TENANT_ID',
    'AZURE_SUBSCRIPTION_ID',
    'AZURE_RESOURCE_GROUP',
    'AZURE_WEBAPP_NAME',
    'GOOGLE_APPLICATION_CREDENTIALS',
  ];

  for (const key of keys) {
    if (exclude.includes(key)) {
      continue;
    }

    const value = process.env[key];
    try {
      console.log(`Deploying secret for ${key} to AWS Secrets Manager...`);
      // Attempt to create the secret
      await client.send(new CreateSecretCommand({
        Name: key,
        SecretString: value,
      }));
      console.log(`Created secret ${key}`);
    } catch (err) {
      // If the secret already exists, update its value
      if (err.name === 'ResourceExistsException') {
        console.log(`Secret ${key} exists. Updating secret...`);
        try {
          await client.send(new PutSecretValueCommand({
            SecretId: key,
            SecretString: value,
          }));
          console.log(`Updated secret ${key}`);
        } catch (updateErr) {
          console.error(`Error updating secret ${key}:`, updateErr);
        }
      } else {
        console.error(`Error creating secret ${key}:`, err);
      }
    }
  }
}

/**
 * Deploys secrets to Azure Key Vault.
 *
 * Sets each environment variable (excluding specified keys) as a secret in the Azure Key Vault.
 * The URL of the Key Vault must be specified in the environment variable KEY_VAULT_URL.
 *
 * @async
 * @function deployToAzureKeyVault
 */
async function deployToAzureKeyVault() {
  const { SecretClient } = require('@azure/keyvault-secrets');
  const { DefaultAzureCredential } = require('@azure/identity');

  // KEY_VAULT_URL must be defined in the environment variables
  const keyVaultUrl = process.env.KEY_VAULT_URL;
  if (!keyVaultUrl) {
    console.error('Error: KEY_VAULT_URL is not set in your environment variables.');
    process.exit(1);
  }

  const credential = new DefaultAzureCredential();
  const client = new SecretClient(keyVaultUrl, credential);

  const keys = Object.keys(process.env);
  // Exclude credential/configuration keys
  const exclude = [
    'AZURE_CLIENT_ID',
    'AZURE_CLIENT_SECRET',
    'AZURE_TENANT_ID',
    'KEY_VAULT_URL',
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_REGION',
    'GCP_PROJECT_ID',
    'AZURE_SUBSCRIPTION_ID',
    'AZURE_RESOURCE_GROUP',
    'AZURE_WEBAPP_NAME',
    'GOOGLE_APPLICATION_CREDENTIALS',
  ];

  for (const key of keys) {
    if (exclude.includes(key)) {
      continue;
    }

    const value = process.env[key];
    try {
      console.log(`Setting secret ${key} in Azure Key Vault...`);
      await client.setSecret(key, value);
      console.log(`Set secret ${key}`);
    } catch (err) {
      console.error(`Error setting secret ${key} in Azure Key Vault:`, err);
    }
  }
}

/**
 * Deploys environment variables to an Azure Web App's application settings.
 *
 * Updates the application settings of the specified Azure Web App by merging the
 * current settings with values from the environment file. Required environment variables:
 *   - AZURE_SUBSCRIPTION_ID
 *   - AZURE_RESOURCE_GROUP
 *   - AZURE_WEBAPP_NAME
 *
 * @async
 * @function deployToAzureWebApp
 */
async function deployToAzureWebApp() {
  const { WebSiteManagementClient } = require('@azure/arm-appservice');
  const { DefaultAzureCredential } = require('@azure/identity');

  const subscriptionId = process.env.AZURE_SUBSCRIPTION_ID;
  const resourceGroup = process.env.AZURE_RESOURCE_GROUP;
  const webAppName = process.env.AZURE_WEBAPP_NAME;

  if (!subscriptionId || !resourceGroup || !webAppName) {
    console.error('Error: AZURE_SUBSCRIPTION_ID, AZURE_RESOURCE_GROUP, and AZURE_WEBAPP_NAME must be set in your environment variables for Web App deployment.');
    process.exit(1);
  }

  const credential = new DefaultAzureCredential();
  const client = new WebSiteManagementClient(credential, subscriptionId);

  // Retrieve the current application settings for the web app.
  console.log(`Fetching current application settings for ${webAppName}...`);
  const appSettingsResponse = await client.webApps.listApplicationSettings(resourceGroup, webAppName);
  const settings = appSettingsResponse.properties || {};

  // Exclude credential/configuration keys from being updated.
  const exclude = [
    'AZURE_CLIENT_ID',
    'AZURE_CLIENT_SECRET',
    'AZURE_TENANT_ID',
    'AZURE_SUBSCRIPTION_ID',
    'AZURE_RESOURCE_GROUP',
    'AZURE_WEBAPP_NAME',
    'KEY_VAULT_URL',
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_REGION',
    'GCP_PROJECT_ID',
    'GOOGLE_APPLICATION_CREDENTIALS',
  ];

  // Update the settings with values from the environment file.
  for (const key of Object.keys(process.env)) {
    if (exclude.includes(key)) {
      continue;
    }
    settings[key] = process.env[key];
  }

  console.log(`Updating application settings for Azure Web App ${webAppName}...`);
  const updateResponse =
      await client.webApps.updateApplicationSettings(resourceGroup, webAppName, { properties: settings });
  console.log('Updated application settings:', updateResponse.properties);
}

/**
 * Deploys secrets to Google Cloud Secret Manager.
 *
 * For each environment variable (excluding specified keys), attempts to create a secret.
 * If the secret already exists, a new version is added with the secret data.
 * The GCP project ID must be specified in the environment variable GCP_PROJECT_ID.
 *
 * @async
 * @function deployToGCP
 */
async function deployToGCP() {
  const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');

  // GCP_PROJECT_ID must be defined in the environment variables
  const projectId = process.env.GCP_PROJECT_ID;
  if (!projectId) {
    console.error('Error: GCP_PROJECT_ID is not set in your environment variables.');
    process.exit(1);
  }

  const client = new SecretManagerServiceClient();
  const keys = Object.keys(process.env);
  // Exclude credential/configuration keys
  const exclude = [
    'GOOGLE_APPLICATION_CREDENTIALS',
    'GCP_PROJECT_ID',
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_REGION',
    'KEY_VAULT_URL',
    'AZURE_CLIENT_ID',
    'AZURE_CLIENT_SECRET',
    'AZURE_TENANT_ID',
    'AZURE_SUBSCRIPTION_ID',
    'AZURE_RESOURCE_GROUP',
    'AZURE_WEBAPP_NAME',
  ];

  for (const key of keys) {
    if (exclude.includes(key)) {
      continue;
    }

    const value = process.env[key];
    try {
      console.log(`Deploying secret ${key} to GCP Secret Manager...`);

      // Attempt to create the secret. If it already exists, catch the error.
      let secretName;
      try {
        const [secret] = await client.createSecret({
          parent: `projects/${projectId}`,
          secret: {
            replication: {
              automatic: {},
            },
          },
          secretId: key,
        });
        secretName = secret.name;
        console.log(`Created secret ${key}`);
      } catch (createErr) {
        // If the secret already exists, build its resource name.
        if (createErr.code === 6 /* ALREADY_EXISTS */) {
          secretName = `projects/${projectId}/secrets/${key}`;
          console.log(`Secret ${key} already exists. Adding a new version...`);
        } else {
          console.error(`Error creating secret ${key}:`, createErr);
          continue;
        }
      }

      // Add a new version with the secret data.
      await client.addSecretVersion({
        parent: secretName,
        payload: {
          data: Buffer.from(value, 'utf8'),
        },
      });
      console.log(`Added new version for secret ${key}`);
    } catch (err) {
      console.error(`Error deploying secret ${key} in GCP:`, err);
    }
  }
}