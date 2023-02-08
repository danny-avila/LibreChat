import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  active: false,
  error: false,
  conversationId: null,
  parentMessageId: null,
};

const currentSlice = createSlice({
  name: 'convo',
  initialState,
  reducers: {
    setConversation: (state, action) => {
      return { ...state, ...action.payload };
    },
    setError: (state, action) => {
      state.error = action.payload;
    },
  }
});
//

export const { setConversation, setError } = currentSlice.actions;

export default currentSlice.reducer;
