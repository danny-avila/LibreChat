const accessPermissions = require('./accessPermissions');
const stripe = require('./stripe');
const stripeWebhook = require('./stripeWebhook');
const stripeCancel = require('./stripeCancel');
const assistants = require('./assistants');
const categories = require('./categories');
const tokenizer = require('./tokenizer');
const endpoints = require('./endpoints');
const staticRoute = require('./static');
const messages = require('./messages');
const memories = require('./memories');
const presets = require('./presets');
const prompts = require('./prompts');
const balance = require('./balance');
const plugins = require('./plugins');
const actions = require('./actions');
const banner = require('./banner');
const search = require('./search');
const models = require('./models');
const convos = require('./convos');
const config = require('./config');
const agents = require('./agents');
const roles = require('./roles');
const oauth = require('./oauth');
const files = require('./files');
const share = require('./share');
const tags = require('./tags');
const auth = require('./auth');
const edit = require('./edit');
const keys = require('./keys');
const user = require('./user');
const mcp = require('./mcp');
const stripeCheckout = require('./stripeCheckout');
const proxyOpenAIFile = require('./proxyOpenAIFile');

module.exports = {
  stripe,
  stripeWebhook,
  stripeCheckout,
  stripeCancel,
  mcp,
  edit,
  auth,
  keys,
  user,
  tags,
  roles,
  oauth,
  files,
  share,
  banner,
  agents,
  convos,
  search,
  config,
  models,
  prompts,
  plugins,
  actions,
  presets,
  balance,
  messages,
  memories,
  endpoints,
  tokenizer,
  assistants,
  categories,
  staticRoute,
  accessPermissions,
  proxyOpenAIFile,
};
