const mongoose = require('mongoose');
const { isValidObjectIdString } = require('@librechat/data-schemas');
const { updateUser, getUserById } = require('~/models');

const MAX_SKILL_STATES = 200;
const MAX_KEY_LENGTH = 64;
/** Generous upper bound on raw payload size to reject abusive inputs before
 *  we spend cycles validating or querying the DB for orphan cleanup. */
const MAX_RAW_PAYLOAD = MAX_SKILL_STATES * 2;

/** Mongoose Map keys reject `.` and leading `$`. */
const INVALID_KEY_PATTERN = /[.$]/;

/** Converts a Mongoose Map (or plain object) to a `Record<string, boolean>`. */
function toRecord(raw) {
  if (raw instanceof Map) {
    return Object.fromEntries(raw);
  }
  return raw && typeof raw === 'object' ? raw : {};
}

/**
 * Returns a copy of `skillStates` containing only entries whose key is a valid
 * ObjectId AND points to a Skill document that currently exists. Self-heals
 * orphaned overrides (deleted skills) and malformed keys without requiring
 * cascade logic or a migration.
 */
async function pruneOrphans(skillStates) {
  const validIds = Object.keys(skillStates).filter((id) => isValidObjectIdString(id));
  if (validIds.length === 0) {
    return {};
  }
  const Skill = mongoose.models.Skill;
  if (!Skill) {
    const pruned = {};
    for (const id of validIds) {
      pruned[id] = skillStates[id];
    }
    return pruned;
  }
  const existing = await Skill.find({ _id: { $in: validIds } })
    .select('_id')
    .lean();
  const existingSet = new Set(existing.map((doc) => doc._id.toString()));
  const pruned = {};
  for (const id of validIds) {
    if (existingSet.has(id)) {
      pruned[id] = skillStates[id];
    }
  }
  return pruned;
}

const getSkillStatesController = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await getUserById(userId, 'skillStates');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const states = toRecord(user.skillStates);
    const pruned = await pruneOrphans(states);
    return res.status(200).json(pruned);
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

    if (entries.length > MAX_RAW_PAYLOAD) {
      return res.status(400).json({
        code: 'SKILL_STATES_PAYLOAD_TOO_LARGE',
        message: `Payload exceeds ${MAX_RAW_PAYLOAD} entries`,
        limit: MAX_RAW_PAYLOAD,
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
      if (!isValidObjectIdString(key)) {
        return res.status(400).json({ message: 'Each skill ID must be a valid ObjectId' });
      }
      if (typeof value !== 'boolean') {
        return res.status(400).json({ message: 'Each skill state value must be a boolean' });
      }
    }

    const pruned = await pruneOrphans(skillStates);

    if (Object.keys(pruned).length > MAX_SKILL_STATES) {
      return res.status(400).json({
        code: 'MAX_SKILL_STATES_EXCEEDED',
        message: `Maximum ${MAX_SKILL_STATES} skill state overrides allowed`,
        limit: MAX_SKILL_STATES,
      });
    }

    const user = await updateUser(userId, { skillStates: pruned });

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
