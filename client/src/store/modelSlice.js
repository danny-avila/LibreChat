import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  models: [
    {
      _id: '0',
      name: 'ChatGPT',
      value: 'chatgpt',
      model: 'chatgpt'
    },
    {
      _id: '1',
      name: 'CustomGPT',
      value: 'chatgptCustom',
      model: 'chatgptCustom'
    },
    {
      _id: '2',
      name: 'BingAI',
      value: 'bingai',
      model: 'bingai'
    },
    {
      _id: '3',
      name: 'Sydney',
      value: 'sydney',
      model: 'sydney'
    },
    {
      _id: '4',
      name: 'ChatGPT',
      value: 'chatgptBrowser',
      model: 'chatgptBrowser'
    },
  ],
  modelMap: {},
  initial: { chatgpt: false, chatgptCustom: false, bingai: false, sydney: false, chatgptBrowser: false }
  // initial: { chatgpt: true, chatgptCustom: true, bingai: true, }
};

const currentSlice = createSlice({
  name: 'models',
  initialState,
  reducers: {
    setModels: (state, action) => {
      const models = [...initialState.models, ...action.payload];
      state.models = models;
      const modelMap = {};

      models.slice(initialState.models.length).forEach((modelItem) => {
        modelMap[modelItem.value] = {
          chatGptLabel: modelItem.chatGptLabel,
          promptPrefix: modelItem.promptPrefix,
          model: 'chatgptCustom'
        };
      });

      state.modelMap = modelMap;
    },
    setInitial: (state, action) => {
      state.initial = action.payload;
    }
  }
});

export const { setModels, setInitial } = currentSlice.actions;

export default currentSlice.reducer;
