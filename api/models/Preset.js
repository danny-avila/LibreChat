const Preset = require('./schema/presetSchema');

const getPreset = async (user, presetId) => {
  try {
    return await Preset.findOne({ user, presetId });
  } catch (error) {
    throw new Error('Error getting single preset');
  }
};

module.exports = {
  Preset,
  getPreset,
  getPresets: async (user, filter) => {
    try {
      return await Preset.find({ ...filter, user });
    } catch (error) {
      throw new Error('Error retrieving presets');
    }
  },
  savePreset: async (user, { presetId, newPresetId, ...preset }) => {
    try {
      const update = { ...preset, presetId };
      if (newPresetId) {
        update.presetId = newPresetId;
      }

      return await Preset.findOneAndUpdate(
        { presetId, user },
        { $set: update },
        { new: true, upsert: true }
      );
    } catch (error) {
      throw new Error('Error saving preset');
    }
  },
  deletePresets: async (user, filter) => {
    try {
      const toRemove = await Preset.find({ ...filter, user }).select('presetId');
      const ids = toRemove.map(({ presetId }) => presetId);
      const deleteCount = await Preset.deleteMany({ ...filter, user });
      return deleteCount;
    } catch (error) {
      throw new Error('Error deleting presets');
    }
  }
};
