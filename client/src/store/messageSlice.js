import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  messages: [],
};

const currentSlice = createSlice({
  name: 'messages',
  initialState,
  reducers: {
    setMessages: (state, action) => {
      state.messages = action.payload;
    },
  }
});

export const { setMessages, setSubmitState } = currentSlice.actions;

export default currentSlice.reducer;
