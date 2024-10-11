const Preset = require('./schema/presetSchema');
const { logger } = require('~/config');

const getPreset = async (user, presetId) => {
  try {
    // Try to find user-specific preset
    let preset = await Preset.findOne({ user, presetId }).lean();
    if (!preset) {
      // If not found, try to find global preset
      preset = await Preset.findOne({ presetId, isGlobal: true }).lean();
    }
    return preset;
  } catch (error) {
    logger.error('[getPreset] Error getting single preset', error);
    return { message: 'Error getting single preset' };
  }
};

module.exports = {
  Preset,
  getPreset,
  getPresets: async (user, filter) => {
    try {

      // Fetch user-specific presets
      const userPresetsPromise = Preset.find({ ...filter, user }).lean();
      // Fetch global presets
      const globalPresetsPromise = Preset.find({ ...filter, isGlobal: true }).lean();

      const [userPresets, globalPresets] = await Promise.all([
        userPresetsPromise,
        globalPresetsPromise,
      ]);

      // Combine global and user-specific presets
      let presets = [...globalPresets, ...userPresets];
      const defaultValue = 10000;

      presets.sort((a, b) => {
        let orderA = a.order !== undefined ? a.order : defaultValue;
        let orderB = b.order !== undefined ? b.order : defaultValue;

        if (orderA !== orderB) {
          return orderA - orderB;
        }

        return b.updatedAt - a.updatedAt;
      });
      return presets;
    } catch (error) {
      logger.error('[getPresets] Error getting presets', error);
      return { message: 'Error retrieving presets' };
    }
  },
  savePreset: async (user, { presetId, newPresetId, defaultPreset, ...preset }) => {
    try {
      // Check if presetId corresponds to a global preset
      if (presetId && !newPresetId) {
        const existingPreset = await Preset.findOne({ presetId, isGlobal: true });
        if (existingPreset) {
          // User is attempting to edit a global preset
          // Create a copy for the user
          presetId = `user-${user}-${presetId}-${Date.now()}`; // Generate a unique presetId for the user

          const { _id, createdAt, updatedAt, _v,isGlobal, ...presetWithoutIdAndTimestamps } = preset;

          // Prepare the new preset data
          const newPreset = {
            presetId: presetId,
            user: user,
            isGlobal: false,
            ...presetWithoutIdAndTimestamps,
          };
          // Assign the modified preset back
          preset = newPreset;

        }
      }
      
      const setter = { $set: {} };
      const update = { presetId, ...preset, user };
      if (preset.tools && Array.isArray(preset.tools)) {
        update.tools =
          preset.tools
            .map((tool) => tool?.pluginKey ?? tool)
            .filter((toolName) => typeof toolName === 'string') ?? [];
      }
      if (newPresetId) {
        update.presetId = newPresetId;
      }

      if (defaultPreset) {
        update.defaultPreset = defaultPreset;
        update.order = 0;

        const currentDefault = await Preset.findOne({ defaultPreset: true, user });

        if (currentDefault && currentDefault.presetId !== presetId) {
          await Preset.findByIdAndUpdate(currentDefault._id, {
            $unset: { defaultPreset: '', order: '' },
          });
        }
      } else if (defaultPreset === false) {
        update.defaultPreset = undefined;
        update.order = undefined;
        setter['$unset'] = { defaultPreset: '', order: '' };
      }

      setter.$set = update;
      return await Preset.findOneAndUpdate({ presetId, user }, setter, { new: true, upsert: true });
    } catch (error) {
      logger.error('[savePreset] Error saving preset', error);
      return { message: 'Error saving preset' };
    }
  },
  deletePresets: async (user, filter) => {
    // let toRemove = await Preset.find({ ...filter, user }).select('presetId');
    // const ids = toRemove.map((instance) => instance.presetId);
    let deleteCount = await Preset.deleteMany({ ...filter, user });
    return deleteCount;
  },
};
