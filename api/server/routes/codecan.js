const express = require('express');
const { logger } = require('@librechat/data-schemas');
const {
  listJurisdictions,
  getJurisdiction,
  DEFAULT_JURISDICTION_ID,
} = require('~/server/services/prompts/codeCan');
const { setUserJurisdiction } = require('~/models');
const { requireJwtAuth } = require('~/server/middleware');

const router = express.Router();

/**
 * GET /api/codecan/jurisdictions
 * Public-to-authenticated catalogue of available jurisdictions.
 * Returns the enabled jurisdictions plus the current user's selection (if any) and the
 * platform default for new users.
 */
router.get('/jurisdictions', requireJwtAuth, async (req, res) => {
  try {
    const jurisdictions = listJurisdictions();
    res.json({
      jurisdictions,
      default: DEFAULT_JURISDICTION_ID,
      selected: req.user?.personalization?.jurisdiction ?? null,
      hasPicked: Boolean(req.user?.personalization?.hasPickedJurisdiction),
    });
  } catch (error) {
    logger.error('[CodeCan] Error listing jurisdictions', error);
    res.status(500).json({ error: 'Failed to load jurisdictions' });
  }
});

/**
 * PATCH /api/codecan/preferences
 * Body: { jurisdiction: string }
 * Sets the user's account-default jurisdiction. The value is validated against the registry —
 * unknown or disabled ids return 400.
 */
router.patch('/preferences', requireJwtAuth, express.json({ limit: '4kb' }), async (req, res) => {
  const { jurisdiction } = req.body || {};

  if (typeof jurisdiction !== 'string' || !jurisdiction.trim()) {
    return res.status(400).json({ error: 'jurisdiction must be a non-empty string' });
  }

  // Validate against the registry. getJurisdiction falls back when unknown/disabled, so we
  // compare ids to surface a 400 instead of silently picking the default.
  const resolved = getJurisdiction(jurisdiction);
  if (resolved.id !== jurisdiction) {
    return res.status(400).json({ error: `Unknown or disabled jurisdiction: ${jurisdiction}` });
  }

  try {
    const updated = await setUserJurisdiction(req.user.id, resolved.id);
    if (!updated) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({
      updated: true,
      preferences: {
        jurisdiction: updated.personalization?.jurisdiction ?? resolved.id,
        hasPickedJurisdiction: Boolean(updated.personalization?.hasPickedJurisdiction),
      },
    });
  } catch (error) {
    logger.error('[CodeCan] Error updating jurisdiction', error);
    res.status(500).json({ error: error.message || 'Failed to update jurisdiction' });
  }
});

module.exports = router;
