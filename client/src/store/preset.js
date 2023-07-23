import { atom } from 'recoil';

// preset structure is as same defination as conversation

// an array of saved presets.
// sample structure
// [preset1, preset2, preset3]
const presets = atom({
  key: 'presets',
  default: []
});

export default {
  presets
};
