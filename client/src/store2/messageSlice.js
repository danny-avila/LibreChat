import { createSlice } from '@reduxjs/toolkit';
import buildTree from '~/utils/buildTree';

const initialState = {
  messages: [],
  messageTree: []
};

const currentSlice = createSlice({
  name: 'messages',
  initialState,
  reducers: {
    setMessages: (state, action) => {
      state.messages = action.payload;
      const groupAll = action.payload[0]?.searchResult;
      if (groupAll) console.log('grouping all messages');
      state.messageTree = buildTree(action.payload, groupAll);
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
