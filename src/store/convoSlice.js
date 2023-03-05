import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  error: false,
  title: 'ChatGPT Clone',
  conversationId: null,
  parentMessageId: null,
  conversationSignature: null,
  clientId: null,
  invocationId: null,
  chatGptLabel: null,
  promptPrefix: null,
  convosLoading: false
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
    }
    // setConvos: (state, action) => state.convos = action.payload,
  }
});

export const { setConversation, setConvos, setError } = currentSlice.actions;

export default currentSlice.reducer;
