import { createSlice } from '@reduxjs/toolkit';

const initialState = [];

const currentSlice = createSlice({
  name: 'messages',
  initialState,
  reducers: {
    setMessages: (state, action) => {
      const { payload } = action;
      return [...payload];
    },
  }
});

export const { setMessages } = currentSlice.actions;

export default currentSlice.reducer;
