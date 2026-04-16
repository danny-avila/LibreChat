const { updateUser, getUserById } = require('~/models');

const MAX_SKILL_STATES = 200;
const MAX_KEY_LENGTH = 64;

/** Mongoose Map keys reject `.` and leading `$`. */
const INVALID_KEY_PATTERN = /[.$]/;

/** Converts a Mongoose Map (or plain object) to a `Record<string, boolean>`. */
function toRecord(raw) {
  if (raw instanceof Map) {
    return Object.fromEntries(raw);
  }
  return raw && typeof raw === 'object' ? raw : {};
}

const getSkillStatesController = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await getUserById(userId, 'skillStates');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    return res.status(200).json(toRecord(user.skillStates));
  } catch (error) {
    console.error('Error fetching skill states:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

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
      if (INVALID_KEY_PATTERN.test(key)) {
        return res.status(400).json({
          message: 'Skill ID must not contain "." or "$"',
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

    return res.status(200).json(toRecord(user.skillStates));
  } catch (error) {
    console.error('Error updating skill states:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

module.exports = {
  getSkillStatesController,
  updateSkillStatesController,
};
