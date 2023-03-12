import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  error: false,
  title: 'ChatGPT Clone',
  conversationId: null,
  parentMessageId: null,
  jailbreakConversationId: null,
  conversationSignature: null,
  clientId: null,
  invocationId: null,
  chatGptLabel: null,
  promptPrefix: null,
  convosLoading: false,
  pageNumber: 1,
  convos: []
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
    },
    setNewConvo: (state) => {
      state.error = false;
      state.title = 'New Chat';
      state.conversationId = null;
      state.parentMessageId = null;
      state.jailbreakConversationId = null;
      state.conversationSignature = null;
      state.clientId = null;
      state.invocationId = null;
      state.chatGptLabel = null;
      state.promptPrefix = null;
      state.convosLoading = false;
      state.pageNumber = 1;
    },
    setConvos: (state, action) => {
      const newConvos = action.payload.filter((convo) => {
        return !state.convos.some((c) => c.conversationId === convo.conversationId);
      });
      state.convos = [...state.convos, ...newConvos].sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
      );
    },
    removeConvo: (state, action) => {
      state.convos = state.convos.filter((convo) => convo.conversationId !== action.payload);
    },
    removeAll: (state) => {
      state.convos = [];
    }
  }
});

export const { setConversation, setConvos, setNewConvo, setError, incrementPage, removeConvo, removeAll } =
  currentSlice.actions;

export default currentSlice.reducer;
