const config = require('./woodlandCyclopediaHintsConfig.json');

const resettableTest = (regex, text) => {
  if (!regex) {
    return false;
  }
  if (regex.global) {
    regex.lastIndex = 0;
  }
  return regex.test(text);
};

const compilePattern = (entry) => {
  if (!entry) {
    return null;
  }
  if (typeof entry === 'string') {
    return new RegExp(entry, 'i');
  }
  if (typeof entry === 'object' && entry.pattern) {
    return new RegExp(entry.pattern, entry.flags || 'i');
  }
  return null;
};

const DEFAULT_STEP_PATTERNS = [
  { pattern: '^step\\s*\\d{1,2}[:.)-]\\s*', flags: 'i' },
  { pattern: '^\\d{1,2}\\s*[:.)-]\\s+', flags: '' },
  { pattern: '^[a-z]\\s*[:.)-]\\s+', flags: 'i' },
  { pattern: '^[•\\-–]\\s+', flags: '' },
];

const STEP_MATCHERS = (() => {
  const patterns = Array.isArray(config?.stepMatchers) && config.stepMatchers.length > 0
    ? config.stepMatchers
    : DEFAULT_STEP_PATTERNS;
  return patterns.map(compilePattern).filter(Boolean);
})();

const DEFAULT_SCENARIO_RULES = [
  {
    key: 'engine_runs_only_on_choke',
    matchType: 'all',
    patterns: [
      { pattern: '\\bengine\\b', flags: 'i' },
      { pattern: '\\bonly\\b', flags: 'i' },
      { pattern: '\\bchoke\\b', flags: 'i' },
    ],
  },
  {
    key: 'carb_cleaning',
    matchType: 'all',
    patterns: [
      { pattern: '\\bcarb', flags: 'i' },
      { pattern: 'clean', flags: 'i' },
    ],
  },
  {
    key: 'bag_wont_fold',
    matchType: 'all',
    patterns: [
      { pattern: '\\bbag\\b', flags: 'i' },
      { pattern: '\\bfold\\b', flags: 'i' },
    ],
  },
  {
    key: 'wheel_shake',
    matchType: 'all',
    patterns: [
      { pattern: '\\bwheel', flags: 'i' },
      { pattern: '\\bshake', flags: 'i' },
    ],
  },
  {
    key: 'grease_dual_pin_warning',
    matchType: 'all',
    patterns: [
      { pattern: '\\bdual\\b', flags: 'i' },
      { pattern: '\\bpin\\b', flags: 'i' },
      { pattern: '\\bgrease\\b', flags: 'i' },
    ],
  },
  {
    key: 'service_locator',
    matchType: 'any',
    patterns: [
      { pattern: 'service center', flags: 'i' },
      { pattern: 'near me', flags: 'i' },
      { pattern: 'nearest dealer', flags: 'i' },
      { pattern: 'zip', flags: 'i' },
      { pattern: 'postal code', flags: 'i' },
    ],
  },
];

const SCENARIO_RULES = (() => {
  const rules = Array.isArray(config?.scenarioRules) && config.scenarioRules.length > 0
    ? config.scenarioRules
    : DEFAULT_SCENARIO_RULES;
  return rules
    .map((rule) => {
      const patterns = Array.isArray(rule.patterns)
        ? rule.patterns.map(compilePattern).filter(Boolean)
        : [];
      if (!rule.key || patterns.length === 0) {
        return null;
      }
      return {
        key: rule.key,
        matchType: rule.matchType === 'any' ? 'any' : 'all',
        patterns,
      };
    })
    .filter(Boolean);
})();

const normalizeLine = (line = '') => line.replace(/\s+/g, ' ').trim();

const extractSteps = (content = '') => {
  if (!content || typeof content !== 'string') {
    return [];
  }

  const lines = content
    .split(/\r?\n/)
    .map((line) => normalizeLine(line))
    .filter(Boolean);

  const steps = [];
  let buffer = null;

  lines.forEach((line) => {
    const isStep = STEP_MATCHERS.some((regex) => resettableTest(regex, line));
    if (isStep) {
      if (buffer) {
        steps.push(buffer);
      }
      buffer = line.replace(/^[-•–]/, '').trim();
      return;
    }

    if (buffer) {
      buffer += ' ' + line;
    }
  });

  if (buffer) {
    steps.push(buffer);
  }

  return steps.map((step) => step.trim()).filter(Boolean);
};

const extractChecklists = (content = '') => {
  if (!content || typeof content !== 'string') {
    return [];
  }

  const sections = content.split(/\n{2,}/);
  return sections
    .map((section) => section.trim())
    .filter((section) => /\bchecklist\b/i.test(section))
    .map((section) => section.replace(/\s+/g, ' ').trim());
};

const matchScenarios = (content = '') => {
  if (!content || typeof content !== 'string') {
    return [];
  }
  return SCENARIO_RULES.filter((rule) => {
    try {
      if (rule.matchType === 'any') {
        return rule.patterns.some((regex) => resettableTest(regex, content));
      }
      return rule.patterns.every((regex) => resettableTest(regex, content));
    } catch (_) {
      return false;
    }
  }).map((rule) => rule.key);
};

const deriveCyclopediaHints = (doc = {}) => {
  const content = typeof doc?.content === 'string' ? doc.content : '';
  const steps = extractSteps(content);
  const checklists = extractChecklists(content);
  const scenarios = matchScenarios(content);
  return {
    steps,
    checklists,
    scenarios,
    hasTroubleshooting:
      steps.length > 0 ||
      checklists.length > 0,
  };
};

module.exports = {
  deriveCyclopediaHints,
};
