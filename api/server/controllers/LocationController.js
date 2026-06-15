const { logger } = require('@librechat/data-schemas');
const { updateUserLocation } = require('~/models');

const round = (n) => (Number.isFinite(n) ? Math.round(n * 100) / 100 : undefined);
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : undefined);

/**
 * PATCH /api/user/settings/location
 * Body: TUserLocation. Persists the user's location preference.
 */
const updateLocationController = async (req, res) => {
  const body = req.body || {};
  if (typeof body.enabled !== 'boolean') {
    return res.status(400).json({ error: 'enabled must be a boolean value.' });
  }

  const location = { enabled: body.enabled };
  if (body.source === 'auto' || body.source === 'manual') {
    location.source = body.source;
  }
  const manual = str(body.manual, 256);
  if (manual) {
    location.manual = manual;
  }
  const place = str(body.place, 256);
  if (place) {
    location.place = place;
  }
  const timezone = str(body.timezone, 64);
  if (timezone) {
    location.timezone = timezone;
  }
  const lat = round(body.coordinates?.latitude);
  const lon = round(body.coordinates?.longitude);
  if (lat !== undefined && lon !== undefined) {
    location.coordinates = { latitude: lat, longitude: lon };
  }

  try {
    const updatedUser = await updateUserLocation(req.user.id, location);
    if (!updatedUser) {
      return res.status(404).json({ error: 'User not found.' });
    }
    return res.json({ updated: true, location: updatedUser.personalization?.location });
  } catch (error) {
    logger.error('[updateLocationController]', error);
    return res.status(500).json({ error: 'Failed to update location.' });
  }
};

module.exports = { updateLocationController };
