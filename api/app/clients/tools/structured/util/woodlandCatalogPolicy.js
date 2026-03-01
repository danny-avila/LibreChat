let logger;
try {
  ({ logger } = require('~/config'));
} catch (_) {
  try {
    ({ logger } = require('@librechat/data-schemas'));
  } catch (_) {
    logger = console;
  }
}
const rawConfig = require('./woodlandCatalogPolicyConfig.json');
const { resolveSkuHistory } = require('./woodlandSkuHistoryResolver');

const compilePattern = (pattern) => {
  if (!pattern) {
    return null;
  }
  if (typeof pattern === 'string') {
    return new RegExp(pattern, 'i');
  }
  if (typeof pattern === 'object' && pattern.pattern) {
    return new RegExp(pattern.pattern, pattern.flags || 'i');
  }
  return null;
};

const lowerCaseSet = (arr = []) =>
  Array.isArray(arr)
    ? Array.from(new Set(arr.map((item) => String(item).toLowerCase().trim()).filter(Boolean)))
    : [];

const normalizeModelAliases = (aliases = {}) =>
  Object.fromEntries(
    Object.entries(aliases || {}).map(([canonical, list]) => [
      String(canonical).toLowerCase().trim(),
      lowerCaseSet(list),
    ]),
  );

const MODEL_ALIASES = normalizeModelAliases(rawConfig?.modelAliases || {});
const GENERIC_KEYWORDS = lowerCaseSet(rawConfig?.genericModelKeywords || []);

const compileRule = (rule = {}) => {
  const compiled = { ...rule };
  compiled.code = rule.code;
  compiled.severity = rule.severity || 'warn';
  compiled.handler = rule.handler || 'keyword';
  compiled.message = rule.message;
  compiled.messageTemplate = rule.messageTemplate;
  compiled.config = { ...(rule.config || {}) };

  if (compiled.handler === 'keyword') {
    const cfg = compiled.config;
    cfg.all = Array.isArray(cfg.all) ? cfg.all.map(compilePattern).filter(Boolean) : [];
    cfg.any = Array.isArray(cfg.any) ? cfg.any.map(compilePattern).filter(Boolean) : [];
  }

  if (compiled.handler === 'xlImpellerMismatch') {
    const cfg = compiled.config;
    cfg.model = String(cfg.model || 'xl')
      .toLowerCase()
      .trim();
    cfg.keyword = compilePattern(cfg.keyword || '\\bimpeller\\b');
  }

  return compiled;
};

const POLICY_RULES = Array.isArray(rawConfig?.rules) ? rawConfig.rules.map(compileRule) : [];

const collectStrings = (doc) => {
  const acc = [];
  const push = (value) => {
    if (value == null) {
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => push(item));
      return;
    }
    if (typeof value === 'string') {
      acc.push(value);
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      acc.push(String(value));
    }
  };

  const fields = [
    'title',
    'content',
    'description',
    'summary',
    'details',
    'selector',
    'selectors',
    'model_scope',
    'model_scope_label',
    'fitment',
    'fitment_notes',
    'model_notes',
    'models',
    'model_tags',
    'tags',
    'categories',
    'category_paths',
    'highlight',
    'product_name',
    'subtitle',
    'headline',
    'body',
    'notes',
  ];

  fields.forEach((field) => push(doc?.[field]));
  push(doc?.normalized_catalog?.title);
  push(doc?.normalized_catalog?.metadata?.notes);
  push(doc?.normalized_catalog?.metadata?.fitment);
  push(doc?.normalized_catalog?.metadata?.model_scope);

  return acc;
};

const canonicalizeModel = (input) => {
  if (!input || typeof input !== 'string') {
    return undefined;
  }
  const normalized = input.trim().toLowerCase();
  for (const [canonical, aliases] of Object.entries(MODEL_ALIASES)) {
    if (canonical === normalized) {
      return canonical;
    }
    if (aliases.some((alias) => alias.toLowerCase() === normalized)) {
      return canonical;
    }
  }
  return normalized || undefined;
};

const extractModelMentions = (doc) => {
  const text = collectStrings(doc).join(' | ').toLowerCase();

  const positives = new Set();
  const rawMatches = new Set();

  Object.entries(MODEL_ALIASES).forEach(([canonical, aliases]) => {
    const allVariants = [canonical, ...aliases];
    if (allVariants.some((keyword) => text.includes(keyword.toLowerCase()))) {
      positives.add(canonical);
      rawMatches.add(canonical);
    }
  });

  const mentionsAll = GENERIC_KEYWORDS.some((keyword) => text.includes(keyword));

  return {
    positives,
    mentionsAll,
    rawText: text,
    rawMatches,
  };
};

const pushFlag = (flags, { code, severity = 'warn', message }) => {
  if (!code || !message) {
    return;
  }
  flags.push({ code, severity, message });
};

const formatTemplate = (template, values = {}) => {
  if (!template || typeof template !== 'string') {
    return undefined;
  }
  return template.replace(/\{\{([^}]+)\}\}/g, (_, key) => {
    const replacement = values[String(key).trim()];
    return replacement == null ? '' : String(replacement);
  });
};

const RULE_HANDLERS = {
  modelMismatch: (rule, { contextModel, mentions, doc }) => {
    if (!contextModel || mentions.mentionsAll || mentions.positives.size === 0) {
      return null;
    }
    if (mentions.positives.has(contextModel)) {
      return null;
    }
    const title = doc?.title || doc?.normalized_catalog?.title;
    const sku = doc?.normalized_catalog?.sku || doc?.sku;
    if (logger && typeof logger.debug === 'function') {
      logger.debug('[woodland-ai-search-catalog:policy] Dropping doc due to model mismatch', {
        sku,
        title,
        requested: contextModel,
        matches: Array.from(mentions.positives),
      });
    }
    const replacements = {
      contextModel: contextModel.toUpperCase(),
      matches: Array.from(mentions.positives).join(', '),
    };
    const message =
      formatTemplate(rule.messageTemplate, replacements) ||
      formatTemplate(rule.message, replacements) ||
      rule.message ||
      rule.messageTemplate;
    return { message };
  },
  xlImpellerMismatch: (rule, { contextModel, mentions, text }) => {
    const cfg = rule.config || {};
    if (!contextModel || contextModel !== cfg.model) {
      return null;
    }
    if (!cfg.keyword || !cfg.keyword.test(text)) {
      return null;
    }
    if (mentions.mentionsAll || mentions.positives.has(contextModel)) {
      return null;
    }
    return { message: rule.message };
  },
  keyword: (rule, { text }) => {
    const cfg = rule.config || {};
    const allMatch = Array.isArray(cfg.all) ? cfg.all.every((regex) => regex.test(text)) : true;
    if (!allMatch) {
      return null;
    }
    const anyMatch =
      Array.isArray(cfg.any) && cfg.any.length > 0
        ? cfg.any.some((regex) => regex.test(text))
        : true;
    if (!anyMatch) {
      return null;
    }
    return { message: rule.message };
  },
};

const applySkuHistory = async (doc, flags) => {
  const sku = (doc?.normalized_catalog?.sku || doc?.sku || '').trim();
  if (!sku) {
    return;
  }

  try {
    const note = await resolveSkuHistory(sku);
    if (!note) {
      return;
    }
    pushFlag(flags, {
      code: 'sku-history-reference',
      severity: 'warn',
      message: note,
    });
  } catch (error) {
    if (logger && typeof logger.warn === 'function') {
      logger.warn('[woodland-ai-search-catalog:policy] SKU history lookup failed', {
        sku,
        error: error?.message || String(error),
      });
    }
  }
};

const applyCatalogPolicy = async (docs = [], context = {}) => {
  if (!Array.isArray(docs) || docs.length === 0) {
    return { docs: [], dropped: [] };
  }

  const contextModel = canonicalizeModel(context.model);
  const filtered = [];
  const dropped = [];

  for (const doc of docs) {
    if (!doc || typeof doc !== 'object') {
      continue;
    }

    const flags = [];
    const mentions = extractModelMentions(doc);
    const text = mentions.rawText;

    for (const rule of POLICY_RULES) {
      try {
        const handler = RULE_HANDLERS[rule.handler];
        if (!handler) {
          if (logger && typeof logger.warn === 'function') {
            logger.warn('[woodland-ai-search-catalog:policy] Unknown rule handler', {
              code: rule.code,
              handler: rule.handler,
            });
          }
          return;
        }
        const result = handler(rule, { contextModel, mentions, doc, text });
        if (result && result.message) {
          pushFlag(flags, {
            code: rule.code,
            severity: rule.severity,
            message: result.message,
          });
        }
      } catch (error) {
        if (logger && typeof logger.warn === 'function') {
          logger.warn('[woodland-ai-search-catalog:policy] Rule evaluation failed', {
            code: rule.code,
            error: error?.message || String(error),
          });
        }
      }
    }

    await applySkuHistory(doc, flags);

    const hasBlockingFlag = flags.some((flag) => flag.severity === 'block');

    const withFlags = {
      ...doc,
      policy_flags: flags,
      normalized_catalog: {
        ...(doc.normalized_catalog || {}),
        policy_flags: flags,
      },
    };

    if (hasBlockingFlag) {
      dropped.push(withFlags);
    } else {
      filtered.push(withFlags);
    }
  }

  return { docs: filtered, dropped };
};

module.exports = {
  applyCatalogPolicy,
  canonicalizeModel,
};
