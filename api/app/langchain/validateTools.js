module.exports = (tools) => {
  const validTools = new Set(['calculator', 'google', 'browser', 'serpapi', 'zapier']);

  const validateAPIKey = (apiKeyName, toolName) => {
    if (!process.env[apiKeyName] || process.env[apiKeyName] === '') {
      validTools.delete(toolName);
    }
  };

  validateAPIKey('SERPAPI_API_KEY', 'serpapi');
  validateAPIKey('ZAPIER_NLA_API_KEY', 'zapier');
  validateAPIKey('GOOGLE_CSE_ID', 'google');
  validateAPIKey('GOOGLE_API_KEY', 'google');

  console.log('Valid tools:', validTools);

  return tools.filter((tool) => validTools.has(tool));
};