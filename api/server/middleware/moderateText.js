const OpenAI = require('openai');
const { ErrorTypes, ViolationTypes } = require('librechat-data-provider');
const { getCustomConfig } = require('~/server/services/Config');
const { isEnabled } = require('~/server/utils');
const denyRequest = require('./denyRequest');
const { logViolation } = require('~/cache');
const { logger } = require('~/config');

const DEFAULT_ACTIONS = Object.freeze({
  violation: 2,
  blockMessage: true,
  log: true,
});

// Pre-compile threshold map for faster lookups
const DEFAULT_THRESHOLDS = new Map();

function formatViolation(violation) {
  return {
    category: violation.category,
    score: Math.round(violation.score * 100) / 100,
    threshold: violation.threshold,
    severity: getSeverityLevel(violation.score),
  };
}

function getSeverityLevel(score) {
  if (score >= 0.9) {
    return 'HIGH';
  }
  if (score >= 0.7) {
    return 'MEDIUM';
  }
  return 'LOW';
}

function formatViolationsLog(violations, userId = 'unknown') {
  const violationsStr = violations
    .map((v) => `${v.category}:${v.score}>${v.threshold}`)
    .join(' | ');

  return `userId=${userId} violations=[${violationsStr}]`;
}

async function moderateText(req, res, next) {
  if (!isEnabled(process.env.OPENAI_MODERATION)) {
    return next();
  }

  const moderationKey = process.env.OPENAI_MODERATION_API_KEY;
  if (!moderationKey) {
    logger.error('Missing OpenAI moderation API key');
    return denyRequest(req, res, { message: 'Moderation configuration error' });
  }

  const { text } = req.body;
  if (!text?.length || typeof text !== 'string') {
    return denyRequest(req, res, { type: ErrorTypes.VALIDATION, message: 'Invalid text input' });
  }

  try {
    const customConfig = await getCustomConfig();

    if (!moderateText.openai) {
      moderateText.openai = new OpenAI({ apiKey: moderationKey });
    }

    const response = await moderateText.openai.moderations.create({
      model: 'omni-moderation-latest',
      input: text,
    });

    if (!Array.isArray(response.results)) {
      throw new Error('Invalid moderation API response format');
    }

    const violations = checkViolations(response.results, customConfig).map(formatViolation);

    if (violations.length === 0) {
      return next();
    }

    const actions = Object.assign({}, DEFAULT_ACTIONS, customConfig?.moderation?.actions);

    if (actions.log) {
      const userId = req.user?.id || 'anonymous';
      logger.warn(
        '[moderateText] Content moderation violations: ' + formatViolationsLog(violations, userId),
      );
    }

    if (!actions.blockMessage) {
      return next();
    }

    if (actions.violation > 0) {
      logViolation(req, res, ViolationTypes.MODERATION, { violations }, actions.violation);
    }

    return denyRequest(req, res, {
      type: ErrorTypes.MODERATION,
      message: `Content violates moderation policies: ${violations
        .map((v) => v.category)
        .join(', ')}`,
      violations: violations,
    });
  } catch (error) {
    const errorDetails =
      process.env.NODE_ENV === 'production'
        ? { message: error.message }
        : {
          error: error.message,
          stack: error.stack,
          status: error.response?.status,
        };

    logger.error('Moderation error:', errorDetails);

    return denyRequest(req, res, {
      type: ErrorTypes.MODERATION,
      message: 'Content moderation check failed',
    });
  }
}

function checkViolations(results, customConfig) {
  const violations = [];
  const categories = customConfig?.moderation?.categories || {};

  for (const result of results) {
    for (const [category, score] of Object.entries(result.category_scores)) {
      const categoryConfig = categories[category];

      if (categoryConfig?.enabled === false) {
        continue;
      }

      const threshold = categoryConfig?.threshold || DEFAULT_THRESHOLDS.get(category) || 0.7;

      if (score >= threshold) {
        violations.push({ category, score, threshold });
      }
    }
  }
  return violations;
}

module.exports = moderateText;
