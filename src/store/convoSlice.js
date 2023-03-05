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
  convosLoading: false,
  pageNumber: 1,
  convos: [],
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
    incrementPage: (state) => {
      state.pageNumber = state.pageNumber + 1;
    }
    // setConvos: (state, action) => state.convos = action.payload,
  }
});

export const { setConversation, setConvos, setError, incrementPage } = currentSlice.actions;

export default currentSlice.reducer;
