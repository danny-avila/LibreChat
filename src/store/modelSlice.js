import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  models: [
    {
      name: 'ChatGPT',
      value: 'chatgpt'
    },
    {
      name: 'CustomGPT',
      value: 'chatgptCustom'
    },
    {
      name: 'BingAI',
      value: 'bingai'
    },
    {
      name: 'ChatGPT',
      value: 'chatgptBrowser'
    }
  ]
};

const currentSlice = createSlice({
  name: 'models',
  initialState,
  reducers: {
    setModels: (state, action) => {
      state.models = [...state.models, ...action.payload];
    }
  }
});

export const { setModels } = currentSlice.actions;

export default currentSlice.reducer;
