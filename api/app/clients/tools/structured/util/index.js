// index.js - Export all shared Woodland tool utilities
const WoodlandSearchBase = require('./WoodlandSearchBase');
const configValidation = require('./configValidation');
const compatibilityExtraction = require('./compatibilityExtraction');
const telemetry = require('./telemetry');
const adaptiveSearch = require('./adaptiveSearch');
const urlValidation = require('./urlValidation');
const urlPolicy = require('./urlPolicy');
const hitchRelevance = require('./hitchRelevance');
const proceduralSafety = require('./proceduralSafety');
const crossToolValidation = require('./crossToolValidation');

module.exports = {
  // Base class
  WoodlandSearchBase,

  // Config validation utilities
  ...configValidation,

  // Compatibility extraction utilities
  ...compatibilityExtraction,

  // Telemetry and metrics
  ...telemetry,

  // Adaptive search strategies
  ...adaptiveSearch,

  // URL validation and health checking
  ...urlValidation,

  // URL policy enforcement
  ...urlPolicy,

  // Hitch relevance classification
  ...hitchRelevance,

  // Procedural safety classification
  ...proceduralSafety,

  // Cross-tool validation for critical parts
  ...crossToolValidation,
};
