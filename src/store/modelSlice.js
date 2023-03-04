import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  models: [
    {
      _id: '0',
      name: 'ChatGPT',
      value: 'chatgpt'
    },
    {
      _id: '1',
      name: 'CustomGPT',
      value: 'chatgptCustom'
    },
    {
      _id: '2',
      name: 'BingAI',
      value: 'bingai'
    },
    {
      _id: '3',
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
      console.log('setModels', action.payload);
      state.models = [...initialState.models, ...action.payload];
    }
  }
});

export const { setModels } = currentSlice.actions;

export default currentSlice.reducer;
