const { updateUser, getUserById } = require('~/models');

const MAX_SKILL_STATES = 200;
const MAX_KEY_LENGTH = 64;

/**
 * Returns the user's skill-active overrides as a plain `{ [skillId]: boolean }` object.
 * An empty object means no explicit overrides — defaults apply.
 */
const getSkillStatesController = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await getUserById(userId, 'skillStates');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const raw = user.skillStates;
    const states =
      raw instanceof Map ? Object.fromEntries(raw) : raw && typeof raw === 'object' ? raw : {};

    return res.status(200).json(states);
  } catch (error) {
    console.error('Error fetching skill states:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Replaces the user's skill-active overrides. The client performs optimistic
 * merges locally and sends the full map on each mutation.
 *
 * Body: `{ skillStates: { [skillId]: boolean } }`
 */
const updateSkillStatesController = async (req, res) => {
  try {
    const { skillStates } = req.body;
    const userId = req.user.id;

    if (!skillStates || typeof skillStates !== 'object' || Array.isArray(skillStates)) {
      return res.status(400).json({ message: 'skillStates must be a plain object' });
    }

    const entries = Object.entries(skillStates);

    if (entries.length > MAX_SKILL_STATES) {
      return res.status(400).json({
        code: 'MAX_SKILL_STATES_EXCEEDED',
        message: `Maximum ${MAX_SKILL_STATES} skill state overrides allowed`,
        limit: MAX_SKILL_STATES,
      });
    }

    for (const [key, value] of entries) {
      if (typeof key !== 'string' || key.length === 0 || key.length > MAX_KEY_LENGTH) {
        return res.status(400).json({
          message: `Each skill ID must be a non-empty string (max ${MAX_KEY_LENGTH} chars)`,
        });
      }
      if (typeof value !== 'boolean') {
        return res.status(400).json({ message: 'Each skill state value must be a boolean' });
      }
    }

    const user = await updateUser(userId, { skillStates });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const raw = user.skillStates;
    const states =
      raw instanceof Map ? Object.fromEntries(raw) : raw && typeof raw === 'object' ? raw : {};

    return res.status(200).json(states);
  } catch (error) {
    console.error('Error updating skill states:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

module.exports = {
  getSkillStatesController,
  updateSkillStatesController,
};
