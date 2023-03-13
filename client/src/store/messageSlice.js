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
    setEmptyMessage: (state) => {
      state.messages = [
        {
          messageId: '1',
          conversationId: '1',
          parentMessageId: '1',
          sender: '',
          text: ''
        }
      ]
    },
  }
});

export const { setMessages, setEmptyMessage } = currentSlice.actions;

export default currentSlice.reducer;
