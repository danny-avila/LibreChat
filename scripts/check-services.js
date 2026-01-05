const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env');
if (!fs.existsSync(envPath)) {
  console.error('.env not found at', envPath);
  process.exit(1);
}

const envContent = fs.readFileSync(envPath, 'utf-8');
const env = envContent
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith('#'))
  .reduce((acc, line) => {
    const equalIndex = line.indexOf('=');
    if (equalIndex === -1) {
      return acc;
    }
    const key = line.substring(0, equalIndex);
    const value = line.substring(equalIndex + 1);
    acc[key] = value;
    return acc;
  }, {});

const services = [
  {
    name: 'Anthropic',
    vars: ['ANTHROPIC_API_KEY'],
    check: () => console.log('  > Anthropic enabled: make sure the configured key is the one you intend to use.'),
  },
  {
    name: 'Azure OpenAI',
    vars: ['AZURE_API_KEY', 'AZURE_OPENAI_API_INSTANCE_NAME'],
    check: () => console.log('  > Azure OpenAI enabled: verify the deployment name and API instance are reachable.'),
  },
  {
    name: 'AWS Bedrock',
    vars: ['BEDROCK_AWS_ACCESS_KEY_ID', 'BEDROCK_AWS_SECRET_ACCESS_KEY'],
    check: () => console.log('  > AWS Bedrock credentials set: confirm the configured region matches your resources.'),
  },
  {
    name: 'Google (Gemini / Vertex)',
    vars: ['GOOGLE_KEY', 'GOOGLE_CSE_ID'],
    check: () => console.log('  > Google API enabled: make sure billing is active for the selected project.'),
  },
  {
    name: 'OpenAI',
    vars: ['OPENAI_API_KEY'],
    check: () => console.log('  > OpenAI key present: only keep this if you plan to call OpenAI directly.'),
  },
  {
    name: 'Assistants API',
    vars: ['ASSISTANTS_API_KEY'],
    check: () => console.log('  > Assistants API enabled: ensure the key matches your workspace and is not duplicated.'),
  },
  {
    name: 'Azure Assistants',
    vars: ['CREDS_KEY', 'CREDS_IV'],
    check: () => console.log('  > Azure Assistants enabled: the key/IV pair must stay in sync with your secret store.'),
  },
  { name: 'Flux', vars: ['FLUX_API_KEY'], check: () => console.log('  > Flux service enabled: the API key controls image generation.') },
  {
    name: 'DALL·E / Image Tools',
    vars: ['DALLE_API_KEY', 'DALLE3_API_KEY', 'DALLE2_API_KEY'],
    check: () => console.log('  > DALL·E tools enabled: confirm you really need this provider before exposing the key.'),
  },
  { name: 'Stable Diffusion', vars: ['SD_WEBUI_URL'], check: () => console.log('  > Stable Diffusion URL set: ensure the WebUI instance is reachable from the backend.') },
  {
    name: 'Tavily',
    vars: ['TAVILY_API_KEY'],
    check: () => console.log('  > Tavily key configured: verify subscription limits if uploads fail.'),
  },
  {
    name: 'Traversaal',
    vars: ['TRAVERSAAL_API_KEY'],
    check: () => console.log('  > Traversaal key set: remove it if you are not calling the Traversaal agent.'),
  },
  { name: 'Wolfram', vars: ['WOLFRAM_APP_ID'], check: () => console.log('  > Wolfram enabled: confirm the APP ID matches the content scope you need.') },
  {
    name: 'Zapier',
    vars: ['ZAPIER_NLA_API_KEY'],
    check: () => console.log('  > Zapier automation enabled: keep only if Zapier hooks are active.'),
  },
  {
    name: 'Search / Meilisearch',
    vars: ['MEILI_HOST', 'MEILI_MASTER_KEY'],
    check: () => console.log('  > Meilisearch configured: ensure the host/port pair resolves from LibreChat.'),
  },
];

console.log('Service configuration summary for', envPath);
console.log('--------------------------------------------------');
for (const service of services) {
  const values = service.vars
    .map((key) => ({ key, value: env[key] }))
    .filter((entry) => entry.value?.trim());

  if (values.length === 0) {
    console.log(`- ${service.name}: not configured (unset/blank).`);
    continue;
  }

  console.log(`- ${service.name}: configured (${values.map((entry) => entry.key).join(', ')}).`);
}

const enabledServices = services.filter((service) =>
  service.vars.some((key) => env[key]?.trim()),
);

if (!enabledServices.length) {
  console.log('\nNo services configured. Nothing to disable.');
  process.exit(0);
}

console.log('\nReview each enabled service; if it is not used in your deployment, remove or blank out the related env vars.');
