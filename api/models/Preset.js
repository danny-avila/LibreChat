const Preset = require('./schema/presetSchema');

const getPreset = async (user, presetId) => {
  try {
    return await Preset.findOne({ user, presetId }).exec();
  } catch (error) {
    console.log(error);
    return { message: 'Error getting single preset' };
  }
};

module.exports = {
  Preset,
  getPreset,
  getPresets: async (user, filter) => {
    try {
      return await Preset.find({ ...filter, user }).exec();
    } catch (error) {
      console.log(error);
      return { message: 'Error retriving presets' };
    }
  },
  savePreset: async (user, { presetId, newPresetId, ...preset }) => {
    try {
      const update = { presetId, ...preset };
      if (newPresetId) {
        update.presetId = newPresetId;
      }

      return await Preset.findOneAndUpdate(
        { presetId, user },
        { $set: update },
        { new: true, upsert: true },
      ).exec();
    } catch (error) {
      console.log(error);
      return { message: 'Error saving preset' };
    }
  },
  deletePresets: async (user, filter) => {
    // let toRemove = await Preset.find({ ...filter, user }).select('presetId');
    // const ids = toRemove.map((instance) => instance.presetId);
    let deleteCount = await Preset.deleteMany({ ...filter, user }).exec();
    return deleteCount;
  },
};
