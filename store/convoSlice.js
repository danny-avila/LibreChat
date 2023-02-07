import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  active: false,
  conversationId: null,
  parentMessageId: null,
};

const currentSlice = createSlice({
  name: 'convo',
  initialState,
  reducers: {
    setConversation: (state, action) => {
      const { payload } = action;
      state = { ...state, ...payload };
    },
  }
});

export const { setConversation } = currentSlice.actions;

export default currentSlice.reducer;
