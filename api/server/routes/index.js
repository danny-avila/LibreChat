const accessPermissions = require('./accessPermissions');
const memoryDocuments = require('./memoryDocuments');
const userProjects = require('./userProjects');
const assistants = require('./assistants');
const categories = require('./categories');
const adminAuth = require('./admin/auth');
const endpoints = require('./endpoints');
const staticRoute = require('./static');
const messages = require('./messages');
const memories = require('./memories');
const presets = require('./presets');
const prompts = require('./prompts');
const balance = require('./balance');
const actions = require('./actions');
const apiKeys = require('./apiKeys');
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
const keys = require('./keys');
const user = require('./user');
const mcp = require('./mcp');

module.exports = {
  mcp,
  auth,
  adminAuth,
  keys,
  apiKeys,
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
  actions,
  presets,
  balance,
  messages,
  memories,
  memoryDocuments,
  userProjects,
  endpoints,
  assistants,
  categories,
  staticRoute,
  accessPermissions,
};
