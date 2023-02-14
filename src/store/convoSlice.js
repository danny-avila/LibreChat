import { createSlice, current } from '@reduxjs/toolkit';

const initialState = {
  error: false,
  title: 'ChatGPT Clone',
  conversationId: null,
  parentMessageId: null,
  // convos: [],
  convosLoading: false,
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
    // setConvos: (state, action) => state.convos = action.payload,
  }
});

export const { setConversation, setConvos, setError } = currentSlice.actions;

export default currentSlice.reducer;
